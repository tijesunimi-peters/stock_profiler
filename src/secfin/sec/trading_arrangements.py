"""Rule 10b5-1 trading arrangements, from Regulation S-K Item 408(a)'s `ecd` tagging.

Item 408(a), effective Dec 2022, requires a registrant to disclose whether any director or officer
**adopted or terminated** a trading arrangement during the last fiscal quarter, and -- when one
was -- the person, their title, the date, the duration and the securities covered. All of it is
tagged in the `ecd` taxonomy in the 10-K's and 10-Q's inline XBRL, so it is *ingest*, not a
document parse: the same extracted instance `sec/cover.py` already reads.

**This overturns D-10b5-1.** That limitation said we can never state when a plan was adopted, only
that a trade was made under one, because Form 4's `aff10b5One` box carries no date. It is wrong for
Item 408(a): `TrdArrAdoptionDate` is the adoption date, named and dated per person. Verified across
eight filers 2026-08-05 -- JPMorgan discloses ten officers with dates, Amazon seven, NVIDIA two,
Apple and Coca-Cola none (a real "none this quarter", tagged `false`).

## Two things that would go wrong in an obvious implementation

**The facts are dimensional, not positional.** Each person is a member on `ecd:IndividualAxis`
(`msft:AmyEHoodMember`), and every fact about them carries the matching `contextRef`. JPMorgan's
10-K has ten people and three securities amounts; reading them in document order would attribute
one officer's plan size to another. Everything here is grouped by context first.

**The dates are free text.** The element is named `...Date` but typed as a string, and the format
varies by filer: `June 10, 2026` (Microsoft), `November 3, 2025` (Amazon), `12/10/2025` (NVIDIA).
The raw string is always carried; an ISO form is added only when a known format parses, and a
format we do not recognise is left unparsed rather than guessed at.

## What is deliberately not read

`MtrlTermsOfTrdArrTextBlock` -- the material terms of the arrangement, which is prose and Track 2.
The structured fields say who, when, how long and how much; what the plan actually instructs is
the text block, and it stays unread.
"""

from __future__ import annotations

import re
import xml.etree.ElementTree as ET
from dataclasses import dataclass, field

_ECD = re.compile(r"^\{http://xbrl\.sec\.gov/ecd[^}]*\}(.+)$")
_XBRLI = "{http://www.w3.org/2001/XMLSchema-instance}"
_CONTEXT = "{http://www.xbrl.org/2003/instance}context"
_EXPLICIT_MEMBER = "{http://xbrl.org/2006/xbrldi}explicitMember"
_INDIVIDUAL_AXIS = "IndividualAxis"

#: `ecd` elements read per individual. The value is the field on `TradingArrangement`.
_PER_INDIVIDUAL: dict[str, str] = {
    "TrdArrIndName": "person",
    "TrdArrIndTitle": "title",
    "TrdArrAdoptionDate": "adoption_date_raw",
    "TrdArrTerminationDate": "termination_date_raw",
    "TrdArrExpirationDate": "expiration_date_raw",
    "TrdArrDuration": "duration",
}
_FLAGS: dict[str, str] = {
    "Rule10b51ArrAdoptedFlag": "rule_10b5_1_adopted",
    "Rule10b51ArrTrmntdFlag": "rule_10b5_1_terminated",
    "NonRule10b51ArrAdoptedFlag": "non_rule_10b5_1_adopted",
    "NonRule10b51ArrTrmntdFlag": "non_rule_10b5_1_terminated",
}
_AMOUNT = "TrdArrSecuritiesAggAvailAmt"

#: The date formats filers actually use, measured 2026-08-05. An unrecognised one stays raw.
_DATE_FORMATS = (
    re.compile(r"^(?P<month>[A-Z][a-z]+)\s+(?P<day>\d{1,2}),\s*(?P<year>\d{4})$"),
    re.compile(r"^(?P<month>\d{1,2})/(?P<day>\d{1,2})/(?P<year>\d{4})$"),
    re.compile(r"^(?P<year>\d{4})-(?P<month>\d{2})-(?P<day>\d{2})$"),
)
_MONTHS = {
    m: i
    for i, m in enumerate(
        "january february march april may june july august september october november december"
        .split(),
        start=1,
    )
}


@dataclass
class TradingArrangement:
    """One director's or officer's Item 408(a) trading arrangement, as the filer tagged it."""

    member: str  # the IndividualAxis member -- the identity within the filing
    person: str | None = None
    title: str | None = None

    rule_10b5_1_adopted: bool | None = None
    rule_10b5_1_terminated: bool | None = None
    non_rule_10b5_1_adopted: bool | None = None
    non_rule_10b5_1_terminated: bool | None = None

    #: The filer's own strings, always carried verbatim -- these elements are typed as text.
    adoption_date_raw: str | None = None
    termination_date_raw: str | None = None
    expiration_date_raw: str | None = None
    #: ISO forms, present only where a known format parsed. None means "we did not recognise it",
    #: never "there was no date" -- the raw string next to it is the evidence.
    adoption_date: str | None = None
    termination_date: str | None = None
    expiration_date: str | None = None

    duration: str | None = None  # ISO 8601, e.g. "P268D"
    securities_amount: float | None = None
    securities_unit: str | None = None


@dataclass
class TradingArrangements:
    """Every arrangement one filing discloses, plus whether it disclosed the question at all."""

    arrangements: list[TradingArrangement] = field(default_factory=list)
    #: The filing answered Item 408(a) -- at least one of the four flags is present anywhere.
    disclosed: bool = False
    #: Every named person is an officer or director the filer chose to name. A filing that says
    #: "no arrangements" tags the flags against a catch-all member with no name; that member is
    #: not an arrangement and is dropped, but it is what makes `disclosed` true.
    status: str = "ok"  # "ok" | "na"
    reason: str | None = None


def _bool(text: str | None) -> bool | None:
    if text is None:
        return None
    t = text.strip().lower()
    return True if t in ("true", "1") else False if t in ("false", "0") else None


def iso_date(raw: str | None) -> str | None:
    """A filer's free-text date as ISO, or None when the format is not one we recognise.

    Never guesses. `12/10/2025` is read as month/day/year, which is the US convention every filer
    measured uses and the one Item 408(a) filings are written in; a European-order date would be
    misread, so the raw string is always kept beside this.
    """
    if not raw:
        return None
    text = raw.strip()
    for pattern in _DATE_FORMATS:
        m = pattern.match(text)
        if not m:
            continue
        month_text = m.group("month")
        month = _MONTHS.get(month_text.lower()) if month_text.isalpha() else int(month_text)
        if not month or not 1 <= month <= 12:
            return None
        day, year = int(m.group("day")), int(m.group("year"))
        if not 1 <= day <= 31:
            return None
        return f"{year:04d}-{month:02d}-{day:02d}"
    return None


def _individual_members(root: ET.Element) -> dict[str, str]:
    """`contextRef` -> the IndividualAxis member it is qualified by.

    A context with no IndividualAxis is absent from the map, which is how filing-level facts
    (the prose text block) are excluded without naming them.
    """
    out: dict[str, str] = {}
    for ctx in root.iter(_CONTEXT):
        ctx_id = ctx.get("id")
        if not ctx_id:
            continue
        for member in ctx.iter(_EXPLICIT_MEMBER):
            if (member.get("dimension") or "").endswith(_INDIVIDUAL_AXIS):
                out[ctx_id] = (member.text or "").strip()
                break
    return out


def _units(root: ET.Element) -> dict[str, str]:
    out: dict[str, str] = {}
    for unit in root.iter("{http://www.xbrl.org/2003/instance}unit"):
        unit_id = unit.get("id")
        measure = next(unit.iter("{http://www.xbrl.org/2003/instance}measure"), None)
        if unit_id and measure is not None and measure.text:
            out[unit_id] = measure.text.split(":")[-1]
    return out


def parse_trading_arrangements(instance_xml: str) -> TradingArrangements:
    """Read Item 408(a)'s trading arrangements out of one extracted XBRL instance.

    Same instance `parse_cover_facts` reads, so this costs no extra fetch.
    """
    try:
        root = ET.fromstring(instance_xml)
    except ET.ParseError as exc:
        return TradingArrangements(
            status="na", reason=f"The filing's XBRL instance could not be read ({exc})."
        )

    members = _individual_members(root)
    units = _units(root)
    by_member: dict[str, TradingArrangement] = {}
    disclosed = False

    for el in root.iter():
        match = _ECD.match(el.tag)
        if match is None:
            continue
        name = match.group(1)
        if name in _FLAGS:
            disclosed = True
        member = members.get(el.get("contextRef") or "")
        if member is None:
            continue  # filing-level, e.g. the prose text block
        row = by_member.setdefault(member, TradingArrangement(member=member))
        value = (el.text or "").strip()

        if name in _PER_INDIVIDUAL:
            # A person can be tagged in more than one context (a duration and an instant), so
            # never overwrite a value we already have with an empty one.
            if value:
                setattr(row, _PER_INDIVIDUAL[name], value)
        elif name in _FLAGS:
            flag = _bool(value)
            if flag is not None and getattr(row, _FLAGS[name]) is not True:
                setattr(row, _FLAGS[name], flag)
        elif name == _AMOUNT and value:
            try:
                row.securities_amount = float(value)
            except ValueError:
                row.securities_amount = None
            row.securities_unit = units.get(el.get("unitRef") or "")

    for row in by_member.values():
        row.adoption_date = iso_date(row.adoption_date_raw)
        row.termination_date = iso_date(row.termination_date_raw)
        row.expiration_date = iso_date(row.expiration_date_raw)

    # A member with no name is the filer's catch-all ("other officers or directors"), which
    # carries the "nobody else did" flags. It answers the question but is not an arrangement.
    named = [r for r in by_member.values() if r.person]
    named.sort(key=lambda r: (r.adoption_date or r.adoption_date_raw or "", r.person or ""))

    if not disclosed:
        return TradingArrangements(
            status="na",
            reason=(
                "This filing carries no Item 408(a) trading-arrangement disclosure. The "
                "requirement took effect for periods ending after 2022-12-15, so filings before "
                "that have nothing to report here."
            ),
        )
    return TradingArrangements(arrangements=named, disclosed=True)

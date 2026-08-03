"""Read pay-versus-performance facts from a filer's DEF 14A.

## This is NOT a second document parser

`CLAUDE.md` forbids parsing filing documents, and `sec/exhibits.py` is a narrow, explicitly-granted
exception to that rule. **This module needs no exception, because it never reads a document.**

EDGAR generates an EXTRACTED XBRL INSTANCE (`*_htm.xml`) alongside every inline-XBRL filing, and a
DEF 14A has been inline-XBRL since the pay-versus-performance rule phased in. That file is plain
XML holding tagged facts -- the same kind of structured payload as companyfacts, delivered as a
document in a filing's directory rather than through an API. Reading it is ingest, not scraping.
Verified 2026-08-03: Apple's is 181 KB and NVIDIA's 119 KB, both pure XML with no HTML in the
elements this module reads.

## Why it cannot come from companyfacts

The `ecd` taxonomy does not reach the companyfacts API. Measured across the full 121M-fact volume:
`PeoTotalCompAmt`, `PeoActuallyPaidCompAmt`, `TotalShareholderRtnAmt` and every other `ecd` element
appear **zero** times. Apple's companyfacts carries `dei` + `us-gaap` only. So the choice was this
fetch or no card.

## What it deliberately refuses to read

The same instance carries `…TextBlock` elements -- `PvpTableTextBlock`, `AwardTmgMethodTextBlock`,
`AdjToPeoCompFnTextBlock` -- whose content is HTML prose. **Those are Track 2 and are never
touched.** Only numeric, boolean and short-name facts are extracted. The boundary is enforced in
`_WANTED`, not left to a caller's discretion.

## What the numbers are, and what they are not

`PeoActuallyPaidCompAmt` is *compensation actually paid*, an SEC-defined recomputation that marks
unvested equity to market. It is NOT what the executive received in cash, and it swings with the
share price -- Apple's FY2021 figure is $311.8M against $98.7M of summary-table total. Any surface
showing it has to say so.

Tagging began with FY2024 filings, so a filer publishes three to five years and no more. There is
no history behind that, and an absence before it is the rule's phase-in rather than a gap.
"""

from __future__ import annotations

import re
import xml.etree.ElementTree as ET
from dataclasses import dataclass, field

from secfin.sec.cover import find_extracted_instance

_XBRLI = "{http://www.xbrl.org/2003/instance}"
_XBRLDI = "{http://xbrl.org/2006/xbrldi}"
_ECD = re.compile(r"^\{http://xbrl\.sec\.gov/ecd/[\d-]+\}(.+)$")

#: The facts this module reads, mapped to the field they populate.
#:
#: An allowlist rather than a filter: every `…TextBlock` in the instance is HTML prose, and the one
#: reliable way not to drift into reading it is to enumerate what may be read. A new element has to
#: be added here deliberately.
_WANTED: dict[str, str] = {
    "PeoTotalCompAmt": "peo_total",
    "PeoActuallyPaidCompAmt": "peo_actually_paid",
    "NonPeoNeoAvgTotalCompAmt": "neo_avg_total",
    "NonPeoNeoAvgCompActuallyPaidAmt": "neo_avg_actually_paid",
    "TotalShareholderRtnAmt": "tsr",
    "PeerGroupTotalShareholderRtnAmt": "peer_tsr",
    "CoSelectedMeasureAmt": "company_measure_amount",
}

#: Read once for the whole filing rather than per year.
_FILING_LEVEL: dict[str, str] = {
    "CoSelectedMeasureName": "company_measure_name",
    "InsiderTrdPoliciesProcAdoptedFlag": "insider_trading_policy_adopted",
    "AwardTmgMnpiCnsdrdFlag": "award_timing_considers_mnpi",
    "AwardTmgPredtrmndFlag": "award_timing_predetermined",
}


@dataclass
class PvpYear:
    """One fiscal year of the pay-versus-performance table."""

    period_start: str | None
    period_end: str | None
    peo_total: float | None = None
    peo_actually_paid: float | None = None
    neo_avg_total: float | None = None
    neo_avg_actually_paid: float | None = None
    #: Indexed value of $100 invested at the measurement period's start -- NOT a percentage.
    tsr: float | None = None
    peer_tsr: float | None = None
    company_measure_amount: float | None = None


@dataclass
class PvpResult:
    years: list[PvpYear] = field(default_factory=list)
    company_measure_name: str | None = None
    #: `ecd` governance booleans that ride along in the same fetch. Structured, not prose.
    insider_trading_policy_adopted: bool | None = None
    award_timing_considers_mnpi: bool | None = None
    award_timing_predetermined: bool | None = None
    status: str = "ok"  # "ok" | "na"
    reason: str | None = None
    accession: str | None = None
    filed: str | None = None
    cannot: str = (
        "Compensation actually paid is an SEC-defined recomputation that marks unvested equity to "
        "market -- it is not cash received, and it moves with the share price. Total shareholder "
        "return is the indexed value of $100 invested, not a percentage. Pay-versus-performance "
        "tagging began with FY2024 filings, so no filer publishes more than about five years. "
        "The summary compensation table's pay MIX, the CEO pay ratio and say-on-pay support are "
        "not tagged anywhere and are not served here."
    )


def find_def14a_instance(index_json: dict) -> str | None:
    """The extracted XBRL instance's filename in a DEF 14A's directory listing.

    EDGAR names the instance the same way in every filing directory, so this is
    `sec/cover.find_extracted_instance` under a name that says which filing the caller means.
    """
    return find_extracted_instance(index_json)


def _num(text: str | None) -> float | None:
    if not text:
        return None
    try:
        return float(text.replace(",", ""))
    except ValueError:
        return None


def _bool(text: str | None) -> bool | None:
    if text is None:
        return None
    t = text.strip().lower()
    return True if t in ("true", "1") else False if t in ("false", "0") else None


def parse_pay_versus_performance(instance_xml: str) -> PvpResult:
    """Read the pay-versus-performance table out of an extracted DEF 14A instance.

    Only DIMENSIONLESS contexts are read. The same facts are also tagged against member axes
    (`ecd:PeoMember` plus a company-specific member per named executive), and those are the filer's
    own breakdown of who the PEO was in a given year. Apple tags three different PEO members across
    five years; picking one would attribute a figure to a person the filing did not attribute it
    to. The company-level series is unambiguous, and it is what the card shows.
    """
    try:
        root = ET.fromstring(instance_xml)
    except ET.ParseError as exc:
        return PvpResult(status="na", reason=f"The proxy's XBRL instance could not be read ({exc}).")

    periods: dict[str, tuple[str | None, str | None, int]] = {}
    for ctx in root.findall(f"{_XBRLI}context"):
        cid = ctx.get("id")
        period = ctx.find(f"{_XBRLI}period")
        if cid is None or period is None:
            continue
        start = period.find(f"{_XBRLI}startDate")
        end = period.find(f"{_XBRLI}endDate")
        instant = period.find(f"{_XBRLI}instant")
        dims = len(list(ctx.iter(f"{_XBRLDI}explicitMember")))
        periods[cid] = (
            start.text if start is not None else None,
            end.text if end is not None else (instant.text if instant is not None else None),
            dims,
        )

    by_period: dict[tuple[str | None, str | None], PvpYear] = {}
    result = PvpResult()
    for el in root.iter():
        match = _ECD.match(el.tag)
        if match is None:
            continue
        local = match.group(1)
        ctx_ref = el.get("contextRef")
        start, end, dims = periods.get(ctx_ref or "", (None, None, 1))

        if local in _FILING_LEVEL and dims == 0:
            field_name = _FILING_LEVEL[local]
            value = (el.text or "").strip()
            setattr(
                result,
                field_name,
                _bool(value) if field_name != "company_measure_name" else (value or None),
            )
            continue

        if local not in _WANTED or dims != 0:
            continue
        year = by_period.setdefault((start, end), PvpYear(period_start=start, period_end=end))
        setattr(year, _WANTED[local], _num(el.text))

    result.years = sorted(by_period.values(), key=lambda y: y.period_end or "")
    if not result.years:
        result.status = "na"
        result.reason = (
            "This proxy carries no tagged pay-versus-performance table. Tagging began with FY2024 "
            "filings, so proxies before that carry none."
        )
    return result

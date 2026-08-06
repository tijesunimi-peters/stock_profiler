"""§03 -- reportable segments and geography, from ASC 280 dimensional facts.

The facts come from DERA's `num.txt` `segments` column (`ingest/dimensional_backfill.py`), because
companyfacts carries no dimensional data at all. What this module adds is the shaping, and three
decisions that each came out of measuring 2026q1's 4,309 annual filings.

**One revenue tag per filing.** Filers disaggregate under several revenue tags and a single filing
can carry more than one. Summing across them double-counts, so the highest-preference canonical
candidate present is chosen and the others are dropped -- the same rule the geographic rollup uses,
and the reason `normalize/mapping.py` keeps candidates in preference order.

**Placeholders never reach here.** The ingest drops `ReportableSegment`, `Corporate`,
`AllOtherSegments` and their kin, which is why a filer can carry the axis and still have no
segments: 52.1% of annual filers tag `BusinessSegments`, but only **34.0% have two or more
NAMEABLE members**, and 531 have nothing but structural ones.

**Margin is derived and often impossible.** Of filers with nameable segments, 81.4% tag segment
revenue, 51.8% assets and only **35.0% operating income** -- all three together, 18.3%. So the
margin column is `None` far more often than not, and that is a disclosure fact rather than a gap in
this code. It is never computed from a revenue figure alone.

**Member identifiers are the filer's, lightly spaced for reading.** `AmazonWebServicesSegment`
becomes "Amazon Web Services"; nothing is translated, reordered or looked up. A member we cannot
split stays exactly as filed.
"""

from __future__ import annotations

import re
from collections.abc import Sequence
from dataclasses import dataclass, field

from secfin.normalize.mapping import CONCEPTS
from secfin.storage.dimensional_repository import DimensionalFact

#: Canonical revenue candidates in PREFERENCE ORDER -- never a hardcoded copy (the moat).
REVENUE_TAGS: list[str] = CONCEPTS["revenue"][1]

_OPERATING_INCOME = "OperatingIncomeLoss"
_ASSETS = "Assets"
_LONG_LIVED = "PropertyPlantAndEquipmentNet"

_CAMEL = re.compile(r"(?<=[a-z0-9])(?=[A-Z])|(?<=[A-Z])(?=[A-Z][a-z])")
#: Two-letter ISO country members DERA uses for geography. Spacing them would give "U S".
_ISO_LIKE = re.compile(r"^[A-Z]{2}$")


def readable_member(member: str) -> str:
    """`AmazonWebServicesSegment` -> "Amazon Web Services". The filer's identifier, spaced.

    Nothing is translated or looked up: an identifier we cannot split is returned as filed, and a
    two-letter country code is left alone rather than becoming "U S".
    """
    text = (member or "").strip()
    if not text or _ISO_LIKE.match(text):
        return text
    text = re.sub(r"(Segment|Member)$", "", text)
    spaced = _CAMEL.sub(" ", text).replace("_", " ").strip()
    return spaced or member


@dataclass
class SegmentRow:
    member: str
    label: str
    revenue: float | None = None
    operating_income: float | None = None
    assets: float | None = None
    #: Operating income / revenue. None whenever either input is missing -- never inferred.
    margin: float | None = None
    revenue_share: float | None = None


@dataclass
class GeographyRow:
    member: str
    label: str
    revenue: float | None = None
    long_lived_assets: float | None = None
    revenue_share: float | None = None


@dataclass
class SegmentBreakdown:
    cik: int
    fiscal_year: int | None = None
    accession: str | None = None
    revenue_tag: str | None = None
    segments: list[SegmentRow] = field(default_factory=list)
    geography: list[GeographyRow] = field(default_factory=list)
    status: str = "ok"  # "ok" | "na"
    reason: str | None = None


def _latest(facts: Sequence[DimensionalFact]) -> tuple[int | None, str | None]:
    """The newest fiscal year present, and the accession it came from.

    A company appears in exactly ONE DERA quarter -- the one it filed in -- so "newest ingested" is
    not "most recent filing". The caller reports the year rather than implying currency.
    """
    if not facts:
        return None, None
    newest = max(facts, key=lambda f: (f.fiscal_year, f.ddate))
    return newest.fiscal_year, newest.accession


def _chosen_revenue_tag(facts: Sequence[DimensionalFact]) -> str | None:
    present = {f.tag for f in facts}
    for tag in REVENUE_TAGS:
        if tag in present:
            return tag
    return None


def build_segment_breakdown(cik: int, facts: Sequence[DimensionalFact]) -> SegmentBreakdown:
    """Shape one company's dimensional facts into the segment and geography breakdowns."""
    if not facts:
        return SegmentBreakdown(
            cik=cik,
            status="na",
            reason=(
                "No ASC 280 segment or geography facts are held for this company. Two causes look "
                "identical from here and both are real: its DERA quarter may not be published yet "
                "(a company appears only in the quarter it filed in), or it tags segment measures "
                "this card does not read. Tesla, for instance, tags segment gross profit and cost "
                "of revenue but neither segment revenue nor operating income."
            ),
        )

    fiscal_year, accession = _latest(facts)
    current = [f for f in facts if f.fiscal_year == fiscal_year]
    revenue_tag = _chosen_revenue_tag(current)

    seg_facts = [f for f in current if f.axis == "BusinessSegments"]
    geo_facts = [f for f in current if f.axis == "Geographical"]

    segments: list[SegmentRow] = []
    for member in sorted({f.member for f in seg_facts}):
        rows = [f for f in seg_facts if f.member == member]
        revenue = next((f.value for f in rows if f.tag == revenue_tag), None)
        op = next((f.value for f in rows if f.tag == _OPERATING_INCOME), None)
        assets = next((f.value for f in rows if f.tag == _ASSETS), None)
        segments.append(
            SegmentRow(
                member=member,
                label=readable_member(member),
                revenue=revenue,
                operating_income=op,
                assets=assets,
                # Both inputs or nothing. A margin from revenue alone would be invented, and a
                # zero revenue cannot be divided by.
                margin=(op / revenue) if (op is not None and revenue) else None,
            )
        )

    geography: list[GeographyRow] = []
    for member in sorted({f.member for f in geo_facts}):
        rows = [f for f in geo_facts if f.member == member]
        geography.append(
            GeographyRow(
                member=member,
                label=readable_member(member),
                revenue=next((f.value for f in rows if f.tag == revenue_tag), None),
                long_lived_assets=next((f.value for f in rows if f.tag == _LONG_LIVED), None),
            )
        )

    _add_shares(segments)
    _add_shares(geography)
    segments.sort(key=lambda s: (s.revenue is None, -(s.revenue or 0)))
    geography.sort(key=lambda g: (g.revenue is None, -(g.revenue or 0)))

    return SegmentBreakdown(
        cik=cik,
        fiscal_year=fiscal_year,
        accession=accession,
        revenue_tag=revenue_tag,
        segments=segments,
        geography=geography,
        status="ok" if (segments or geography) else "na",
        reason=None
        if (segments or geography)
        else (
            "This filing tags an ASC 280 axis but names no segments -- its members are structural "
            "(a single reportable segment, corporate, eliminations) rather than named businesses."
        ),
    )


def _add_shares(rows: Sequence[SegmentRow | GeographyRow]) -> None:
    """Each row's share of the disclosed revenue, over the rows themselves.

    Deliberately NOT over the consolidated total: the disclosed splits often do not sum to it
    (unallocated revenue, eliminations we dropped), so a share of the total would silently imply a
    missing remainder that this data cannot describe. A share of what was disclosed is a claim we
    can support.
    """
    total = sum(r.revenue for r in rows if r.revenue and r.revenue > 0)
    if not total:
        return
    for r in rows:
        if r.revenue and r.revenue > 0:
            r.revenue_share = r.revenue / total

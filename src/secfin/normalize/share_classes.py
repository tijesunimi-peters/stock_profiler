"""§04's class structure -- per-class share counts from the ASC `ClassOfStock` axis.

Companyfacts carries no dimensional facts, so a company's per-class share counts exist only in
DERA's `num.txt` (`ingest/dimensional_backfill.py`). The card was marked synthetic with the note
"needs the ClassOfStock dimensional axis (Phase C)"; Phase C now exists, and the axis is on 1,892
of 2026q1's 4,262 10-K filers (44.4%).

**Votes per share is not here and never will be.** How many votes a Class B share carries is in the
certificate of incorporation, which is prose in an exhibit -- tagged in no SEC structured source.
That column stays N/A permanently, and the difference matters: a dual-class structure's whole point
is the voting ratio, so a card showing only share COUNTS must not let a reader infer control from
them. Class B being smaller says nothing about who controls the company.

**Every member is shown as the filer tagged it**, including preferred series. A filer that tags
`SeriesAPreferredStock` alongside `CommonClassA` has told us its capital structure has both, and
dropping the preferred would understate it. The label is the identifier, spaced for reading; it is
never translated.

**Authorised is not outstanding.** Both are carried because the gap between them is the headroom a
board can issue without a further vote -- a real fact about dilution capacity -- but they are
different measures and are never mixed.
"""

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass, field

from secfin.normalize.segments import readable_member
from secfin.storage.dimensional_repository import DimensionalFact

CLASS_AXIS = "ClassOfStock"

_OUTSTANDING = "CommonStockSharesOutstanding"
_ISSUED = "CommonStockSharesIssued"
_AUTHORIZED = "CommonStockSharesAuthorized"
_PAR = "CommonStockParOrStatedValuePerShare"


@dataclass
class ShareClass:
    member: str
    label: str
    shares_outstanding: float | None = None
    shares_issued: float | None = None
    shares_authorized: float | None = None
    par_value: float | None = None
    #: Share of the outstanding shares this class represents. NOT a share of votes -- see module
    #: docstring; the voting ratio is charter prose and unknowable here.
    outstanding_share: float | None = None


@dataclass
class ShareClasses:
    cik: int
    fiscal_year: int | None = None
    accession: str | None = None
    classes: list[ShareClass] = field(default_factory=list)
    status: str = "ok"  # "ok" | "na"
    reason: str | None = None


def _value(own: Sequence[DimensionalFact], tag: str) -> float | None:
    """The latest-dated value of one tag for one class.

    Latest `ddate` wins within the year: a filing tags the balance at more than one instant (this
    year end and last), and the current one is the newer.
    """
    hits = sorted((f for f in own if f.tag == tag), key=lambda f: f.ddate)
    return hits[-1].value if hits else None


def build_share_classes(cik: int, facts: Sequence[DimensionalFact]) -> ShareClasses:
    """Shape one company's `ClassOfStock` facts into a per-class structure."""
    rows = [f for f in facts if f.axis == CLASS_AXIS]
    if not rows:
        return ShareClasses(
            cik=cik,
            status="na",
            reason=(
                "This company tags no per-class share counts on the ASC ClassOfStock axis. A "
                "single-class registrant has nothing to disaggregate, and a company appears only "
                "in the DERA quarter it filed in -- so a recent filer's quarter may not be "
                "published yet."
            ),
        )

    newest = max(rows, key=lambda f: (f.fiscal_year, f.ddate))
    current = [f for f in rows if f.fiscal_year == newest.fiscal_year]

    classes: list[ShareClass] = []
    for member in sorted({f.member for f in current}):
        own = [f for f in current if f.member == member]
        classes.append(
            ShareClass(
                member=member,
                label=readable_member(member),
                shares_outstanding=_value(own, _OUTSTANDING),
                shares_issued=_value(own, _ISSUED),
                shares_authorized=_value(own, _AUTHORIZED),
                par_value=_value(own, _PAR),
            )
        )

    total = sum(c.shares_outstanding for c in classes if c.shares_outstanding)
    if total:
        for c in classes:
            if c.shares_outstanding:
                c.outstanding_share = c.shares_outstanding / total

    classes.sort(key=lambda c: (c.shares_outstanding is None, -(c.shares_outstanding or 0)))
    return ShareClasses(
        cik=cik,
        fiscal_year=newest.fiscal_year,
        accession=newest.accession,
        classes=classes,
    )

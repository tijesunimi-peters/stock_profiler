"""§06.2's tenure slot -- how far back the current auditor can be shown to have signed.

Auditor TENURE is not in any SEC filing. PCAOB Form AP carries it, and `pcaob_firm_id` is the join
key to that dataset; until we hold it, the honest answer to "how long has E&Y audited Apple?" is
that we do not know.

What we *can* establish is a **floor**, from two facts we already hold and nothing new:

1. the auditor who signed the latest annual report (`dei:AuditorName`, via `sec/cover.py`), and
2. the absence of an 8-K **Item 4.01** across the indexed filing window.

Item 4.01 is a *required* disclosure when an accountant resigns, is dismissed or is engaged. So no
4.01 in a window means no auditor change in that window -- and combined with (1), the same firm
signed every annual report filed inside it. That is a lower bound, never a tenure: E&Y has audited
Apple since 2009, and the index reaches 2015.

**Where a change IS on file the floor is that date, not the window start** -- a 4.01 in Mar 2019 is
positive evidence of when the current engagement began, and reporting the window start instead
would credit the incumbent with its predecessor's years.

## Why a short window disqualifies the claim entirely

`/submissions/` serves EDGAR's ROLLING recent window -- a fixed number of filings, not a fixed
number of years -- so the window length is set by how much the company files. Apple's 1,000
filings reach back 11.2 years; **JPMorgan files 25,529 filings a year, so the same index reaches
back 1.0**. "No auditor change in the last year" cannot distinguish a firm that has served for
decades from one engaged thirteen months ago, so under `MIN_WINDOW_YEARS` the claim is not made at
all and the reason says why. A floor that varies with filing volume rather than with tenure would
be worse than no floor, because it looks like a measurement.
"""

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass
from datetime import date

#: Below this many years of indexed history, "no change was announced" carries no information --
#: an annual report is filed once a year, so a window shorter than two cycles cannot tell a long
#: engagement from one that began just before the window opened.
MIN_WINDOW_YEARS = 2.0

_DAYS_PER_YEAR = 365.25


def _parse(value: str | None) -> date | None:
    try:
        return date.fromisoformat((value or "")[:10])
    except ValueError:
        return None


@dataclass
class AuditorContinuity:
    #: The auditor as tagged on the latest annual report -- echoed so the floor is never read
    #: apart from the firm it belongs to.
    auditor: str | None = None
    #: Earliest date from which this firm can be shown to have signed. NOT a start date and NOT a
    #: tenure: the engagement may predate it by decades.
    since: str | None = None
    #: True when `since` is an observed Item 4.01 change rather than the window's edge -- the
    #: difference between "began here" and "at least this far back".
    since_is_a_change: bool = False
    #: Years from `since` to the end of the indexed window, for display only.
    years: float | None = None
    indexed_from: str | None = None
    indexed_to: str | None = None
    indexed_filings: int | None = None
    status: str = "ok"  # "ok" | "na"
    reason: str | None = None


def build_auditor_continuity(
    auditor: str | None,
    events: Sequence[dict],
    *,
    covered_from: str | None,
    covered_to: str | None,
    indexed_filings: int | None = None,
) -> AuditorContinuity:
    """Establish how far back the current auditor can be shown to have signed, or say why not.

    `events` are the audit events from the filing index; only Item 4.01 rows are read.
    """
    start, end = _parse(covered_from), _parse(covered_to)
    base = AuditorContinuity(
        auditor=auditor or None,
        indexed_from=covered_from,
        indexed_to=covered_to,
        indexed_filings=indexed_filings,
    )

    if not (auditor or "").strip():
        base.status = "na"
        base.reason = (
            "No auditor is tagged on this company's latest annual report, so there is no firm to "
            "establish a floor for."
        )
        return base

    if start is None or end is None:
        base.status = "na"
        base.reason = (
            "This company's filing index has not been built, so no 8-K Item 4.01 has been looked "
            "for. That is not the same as finding none."
        )
        return base

    # Item 4.01 only. Item 4.02 (non-reliance restatement) rides in the same list off the same
    # filing index, and reading it as a change would date an engagement from a restatement the
    # SAME auditor signed off on.
    filed = (_parse(e.get("filed")) for e in events if e.get("item") == "4.01")
    changes = sorted(d for d in filed if d)

    if changes:
        # A change on file dates the current engagement directly, and it does so regardless of how
        # short the window is -- this is positive evidence, not an absence.
        since = changes[-1]
        base.since = since.isoformat()
        base.since_is_a_change = True
        base.years = round((end - since).days / _DAYS_PER_YEAR, 1)
        return base

    window_years = (end - start).days / _DAYS_PER_YEAR
    if window_years < MIN_WINDOW_YEARS:
        volume = f" ({indexed_filings:,} filings)" if indexed_filings else ""
        base.status = "na"
        base.reason = (
            f"The filing index reaches back only {window_years:.1f} years for this company"
            f"{volume} -- too short to establish anything. EDGAR serves a rolling window of "
            "recent filings, so a heavy filer's index covers less time, and 'no auditor change "
            "in the last year' cannot tell a decades-long engagement from one that began just "
            "before the window opened."
        )
        return base

    base.since = start.isoformat()
    base.years = round(window_years, 1)
    return base

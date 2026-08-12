"""Repository interface for per-COMPANY disclosure statistics (the Peer-relative view's
"Beyond the financials" panel).

These are facts about HOW a company files, not what it filed: how long after a period ends its
report reaches EDGAR, how much of its output is amendments, how often it has told the SEC it
would miss a deadline. All of it comes from the filing INDEX -- form, dates, acceptance stamp
and 8-K item codes -- and none of it from a document.

Why a materialized table rather than a live aggregate: placing one filer among its peers means
computing these for EVERY company in the group. Apple's SIC-2 group is 231 companies and the
index holds ~447 filings each, so the live version is a ~100k-row scan per request. That is the
line CLAUDE.md guardrail 7 draws -- cross-company aggregation is a batch job, and the serving
endpoint does point reads against what it wrote.

Written only by `analytical/disclosure_stats.py`.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass


@dataclass
class DisclosureStatRow:
    """One company's filing behaviour over the indexed window.

    Every field is scoped to that window, which differs enormously between filers -- Apple's
    index reaches 2015 and JPMorgan's covers about a year, because EDGAR serves a rolling recent
    list. `indexed_from`/`indexed_to` travel with the numbers for exactly that reason: a count of
    amendments over a decade and one over a year are not comparable, and the endpoint has to be
    able to say so.
    """

    cik: int
    peer_group: str
    #: Median calendar days from a periodic report's period end to EDGAR acceptance. None when
    #: no filing in the window carried both dates.
    median_filing_lag_days: float | None
    #: Amendments as a share of all indexed filings (0-1). An amendment may be a correction OR a
    #: routine refiling; the index cannot tell them apart, so this is a rate, never a verdict.
    amended_share: float | None
    #: Count of 12b-25 late-filing notices (NT 10-K / NT 10-Q) in the window.
    late_notice_count: int
    #: Count of 8-K Item 4.02 non-reliance filings in the window.
    non_reliance_count: int
    indexed_filings: int
    indexed_from: str | None
    indexed_to: str | None


class DisclosureStatRepository(ABC):
    """Persists per-company filing-behaviour statistics for peer comparison."""

    @abstractmethod
    def bulk_upsert(self, rows: list[DisclosureStatRow]) -> None:
        """Idempotently store a batch, keyed by cik."""

    @abstractmethod
    def get_group(self, peer_group: str) -> list[DisclosureStatRow]:
        """Every company in one SIC group with computed stats.

        Bounded by the group, so it stays an indexed read. An empty list means the batch has not
        covered this group -- which the endpoint must report as "not computed", never as a group
        that files nothing.
        """

    @abstractmethod
    def get(self, cik: int) -> DisclosureStatRow | None:
        """One company's stats, or None if the batch has not covered it."""

    @abstractmethod
    def close(self) -> None:
        """Release the underlying connection."""

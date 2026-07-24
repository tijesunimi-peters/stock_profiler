"""Repository for precomputed SECTOR INSIDER FLOW (Sector Analytics v2, P6a).

Written by the offline batch (`analytical/sector_insider_flow.py`) and read -- point lookup -- by
`GET /v1/sectors/{group}/insider-flow`. The batch is the ONLY producer; the serving path never
recomputes a flow (no DuckDB on the request path -- see CLAUDE.md guardrail 6).

One row per (peer_group, as_of, window_days): the trailing-window open-market net buy/sell for a SIC
group, summing individual companies' REPORTED Forms 3/4/5 transactions. It is a DERIVED aggregate --
NOT a 13F snapshot diff (Forms 3/4/5 are reported transactions), so it carries the reporting-lag +
coverage caveats, never the 13F long-only/45-day derived-trade caveat. A group with no in-window
open-market activity gets NO row (the endpoint turns "no row" into an honest N/A, never a zero).
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from typing import NamedTuple


class SectorInsiderFlowRow(NamedTuple):
    peer_group: str  # the SIC prefix, e.g. "35"
    as_of: str  # window end / batch anchor date, "YYYY-MM-DD"
    window_days: int  # trailing-window length in days
    window_start: str  # as_of - window_days, "YYYY-MM-DD"
    window_end: str  # == as_of, carried for display
    net: float  # buys - sells, reported USD
    buys: float  # sum(shares*price) for open-market P rows with a computable value
    sells: float  # sum(shares*price) for open-market S rows with a computable value
    buy_count: int  # open-market P rows with a computable value
    sell_count: int  # open-market S rows with a computable value
    filer_count: int  # distinct reporting owners across the P/S rows
    company_count: int  # distinct issuer CIKs across the P/S rows
    excluded_no_price_count: int  # in-window P/S rows dropped from sums for missing shares/price
    unit: str  # "USD"


class SectorInsiderFlowRepository(ABC):
    """Persists precomputed per-SIC-group trailing-window insider net buy/sell."""

    @abstractmethod
    def bulk_upsert(self, rows: list[SectorInsiderFlowRow]) -> None:
        """Idempotently store flow rows, replacing any existing (group, as_of, window_days) keys."""

    @abstractmethod
    def clear(self) -> None:
        """Delete all rows -- the batch fully recomputes, so a group that dropped out of the window
        must not linger as a stale figure."""

    @abstractmethod
    def get(self, peer_group: str, as_of: str | None = None) -> SectorInsiderFlowRow | None:
        """One group's flow for a given `as_of` (or the LATEST as_of if None). None if absent --
        the caller renders that as an honest N/A, never a zero."""

    @abstractmethod
    def latest_as_of(self) -> str | None:
        """The most recent `as_of` materialized, or None if nothing is."""

    @abstractmethod
    def count(self) -> int:
        """Total flow rows (for batch progress / tests)."""

    @abstractmethod
    def close(self) -> None:
        """Release the underlying connection."""

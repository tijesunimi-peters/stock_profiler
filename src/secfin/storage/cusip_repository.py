"""Repository interface for the CUSIP -> issuer CIK mapping.

CUSIP is a licensed security identifier (owned by CUSIP Global Services) -- the SEC does
not publish a single free bulk CUSIP -> CIK mapping (confirmed: `company_tickers.json`
has ticker/CIK/title only, no CUSIP; verify before assuming otherwise if this needs
rechecking later). We build the mapping incrementally instead, by matching 13F
information-table issuer names against SEC's own company_tickers.json (see
normalize/cusip.py), and persist BOTH resolved and unresolved CUSIPs so:

  * a CUSIP resolved once is a cache hit for every future filing that references it,
    across ALL managers' 13Fs, not just one, and
  * unresolved CUSIPs stay visible for later review/backfill rather than being silently
    dropped -- see docs/ROADMAP.md: "CUSIP->CIK mapping table (+ track unresolved
    CUSIPs)".

Kept abstract for the same reason as storage/repository.py: SQLite now, Postgres later,
without touching callers.
"""

from __future__ import annotations

from abc import ABC, abstractmethod


class CusipMapRepository(ABC):
    """Persists CUSIP -> CIK resolutions and tracks CUSIPs still unresolved."""

    @abstractmethod
    def get_cik(self, cusip: str) -> int | None:
        """Previously resolved CIK for this CUSIP, or None if unresolved/never seen."""

    @abstractmethod
    def record_resolved(self, cusip: str, cik: int, issuer_name: str) -> None:
        """Persist a successful resolution (upgrading a prior unresolved row, if any)."""

    @abstractmethod
    def record_unresolved(self, cusip: str, issuer_name: str) -> None:
        """Track a CUSIP we couldn't resolve this attempt, incrementing its attempt count.

        Must never clear an existing resolved `cik` -- a later failed attempt (e.g. a
        stale name-index snapshot) is not evidence a prior good resolution was wrong.
        """

    @abstractmethod
    def unresolved_cusips(self) -> list[dict]:
        """CUSIPs with no resolved CIK yet, most-attempted first -- for review/backfill."""

    @abstractmethod
    def resolution_counts(self) -> tuple[int, int]:
        """(resolved_count, unresolved_count) across the whole map -- a single COUNT
        query, deliberately not `len(unresolved_cusips())` plus a second query, so a
        resolution-rate metric stays cheap to compute even as the map grows large.
        """

    @abstractmethod
    def close(self) -> None:
        """Release the underlying connection."""

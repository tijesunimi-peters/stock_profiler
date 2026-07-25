"""Repository for precomputed SECTOR GEOGRAPHIC MIX (Sector Analytics v2, P6b).

Written by the offline batch (`analytical/sector_geographic_mix.py`) and read -- point lookup -- by
`GET /v1/sectors/{group}/geographic-mix`. The batch is the ONLY producer; the serving path never
recomputes a mix (no DuckDB / no aggregation on the request path -- CLAUDE.md guardrail 6).

One row per (peer_group, fiscal_year): the revenue-weighted domestic / international / other split
for a SIC group, DERIVED by summing individual companies' reported ASC 280 geographic revenue. It is
an aggregate rollup (label it derived); geography labels are inconsistent across filers, so the
domestic-vs-international bucketing is a documented normalization (normalize/segment_geography.py),
not a filer-reported field. A group with no company disclosing usable ASC 280 geography gets NO row
(the endpoint turns "no row" into an honest N/A, never a fabricated 0% / 100% split).
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from typing import NamedTuple


class SectorGeographicMixRow(NamedTuple):
    peer_group: str  # the SIC prefix, e.g. "35"
    fiscal_year: int  # the annual (10-K) basis the split was rolled up over
    domestic: float  # Sigma reconciled companies' domestic (US) revenue, reported USD
    international: float  # Sigma reconciled companies' non-US revenue, reported USD
    other: float  # Sigma reconciled companies' unclassifiable / residual geography revenue, USD
    unit: str  # "USD"
    company_count: int  # distinct companies contributing a reconciled geo split (== covered)
    companies_in_scope: int  # distinct companies in the group we ingested a consolidated total for
    excluded_unreconciled_count: int  # companies dropped because geo members != consolidated (~1%)
    revenue_covered_share: float  # covered consolidated revenue / in-scope consolidated revenue
    as_of: str  # batch run date, "YYYY-MM-DD"


class SectorGeographicMixRepository(ABC):
    """Persists the precomputed per-SIC-group revenue-weighted geographic mix."""

    @abstractmethod
    def bulk_upsert(self, rows: list[SectorGeographicMixRow]) -> None:
        """Idempotently store mix rows, replacing any existing (group, fiscal_year) keys."""

    @abstractmethod
    def clear(self) -> None:
        """Delete all rows -- the batch fully recomputes, so a group that lost coverage must not
        linger as a stale figure."""

    @abstractmethod
    def get(
        self, peer_group: str, fiscal_year: int | None = None
    ) -> SectorGeographicMixRow | None:
        """One group's mix for a given fiscal_year (or the LATEST if None). None if absent -- the
        caller renders that as an honest N/A, never a fabricated 0%/100% split."""

    @abstractmethod
    def latest_fiscal_year(self) -> int | None:
        """The most recent fiscal_year materialized, or None if nothing is."""

    @abstractmethod
    def count(self) -> int:
        """Total mix rows (for batch progress / tests)."""

    @abstractmethod
    def close(self) -> None:
        """Release the underlying connection."""

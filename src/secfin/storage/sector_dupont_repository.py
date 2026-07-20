"""Repository for precomputed sector-aggregate DuPont decompositions.

Written by the analytical batch (`analytical/sector_dupont.py`) and read -- as plain point
lookups -- by the `/v1/sectors` serving endpoints. The batch is the ONLY producer; the serving
path never runs the DuckDB aggregation itself (see CLAUDE.md: DuckDB is batch/analytical only).

Each row is an **asset-weighted sector aggregate** for one (SIC group, period):
`net_margin = SigmaNI/SigmaRev`, `asset_turnover = SigmaRev/SigmaAssets`,
`equity_multiplier = SigmaAssets/SigmaEquity`, `roe = SigmaNI/SigmaEquity` -- identity-preserving
(roe == the product of the three), NOT a median or mean of company ratios. The four `sum_*`
columns are kept for auditability. See sqlite_sector_dupont_repository.py.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from typing import NamedTuple


class SectorDupontRow(NamedTuple):
    peer_group: str  # the SIC prefix aggregated within, e.g. "35"
    fiscal_year: int
    fiscal_period: str
    period_end: str  # representative (max) period-end in the group for this fiscal period
    peer_count: int  # companies contributing every DuPont leg (N/A on any leg -> excluded)
    sum_net_income: float
    sum_revenue: float
    sum_avg_assets: float
    sum_avg_equity: float
    net_margin: float  # SigmaNI / SigmaRev
    asset_turnover: float  # SigmaRev / SigmaAssets
    equity_multiplier: float  # SigmaAssets / SigmaEquity
    roe: float  # SigmaNI / SigmaEquity  (== net_margin * asset_turnover * equity_multiplier)


class SectorDupontRepository(ABC):
    """Persists sector-aggregate DuPont rows, one per (peer_group, year, period)."""

    @abstractmethod
    def bulk_upsert(self, rows: list[SectorDupontRow]) -> None:
        """Idempotently store many rows, replacing any existing (peer_group, year, period)."""

    @abstractmethod
    def clear(self) -> None:
        """Delete all rows -- the batch fully recomputes, so a stale aggregate (e.g. a group that
        dropped below the min size) must not linger."""

    @abstractmethod
    def list_for_period(self, fiscal_year: int, fiscal_period: str) -> list[SectorDupontRow]:
        """Every sector's aggregate for one period (the overview-grid read)."""

    @abstractmethod
    def get_series(self, peer_group: str) -> list[SectorDupontRow]:
        """One sector's annual (FY) series, oldest first (the trend read).

        FY-only by design: quarterly sector aggregates are sparse (few companies resolve every
        DuPont leg at a mid-year quarter-end), so the trend line is built on the well-covered
        annual points -- never a mix of FY and quarterly points, which would double-count."""

    @abstractmethod
    def latest_fy_year(self) -> int | None:
        """The most recent WELL-COVERED annual (FY) fiscal year, or None if empty.

        Deliberately not just MAX(fiscal_year): the newest fiscal year is often barely filed
        (a handful of early filers -> a sparse, unrepresentative grid). Returns the latest FY
        whose sector coverage is at least half the best-covered year's, so the overview defaults
        to a representative landscape. An explicit `?year=` still reaches the sparse latest year."""

    @abstractmethod
    def count(self) -> int:
        """Total aggregate rows (for batch progress / tests)."""

    @abstractmethod
    def close(self) -> None:
        """Release the underlying connection."""

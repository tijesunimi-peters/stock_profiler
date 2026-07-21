"""Repository for precomputed sector-aggregate asset-lifecycle days-metrics (Sector Analytics D5).

Written by the analytical batch (`analytical/sector_lifecycle.py`) and read -- as a plain series
lookup -- by the `/v1/sectors/{group}/lifecycle` serving endpoint. The batch is the ONLY producer;
the serving path never runs the DuckDB aggregation itself (see CLAUDE.md: DuckDB is batch/analytical
only).

Each row is an **aggregate** (a ratio of summed dollars, NOT a median of company ratios) for one
(SIC group, period):
`dio = Sigma_inventory/Sigma_cost_of_revenue x 365`,
`dpo = Sigma_accounts_payable/Sigma_cost_of_revenue x 365`,
`dso = Sigma_accounts_receivable/Sigma_revenue x 365`,
`ccc = dio + dso - dpo` (holds by construction -- every company in the sum contributed all five
legs). The five `sum_*` columns are kept for auditability. `approx_count` is how many contributing
companies reported only a period-end balance (so the point is flagged `approximate`). See
sqlite_sector_lifecycle_repository.py.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from typing import NamedTuple


class SectorLifecycleRow(NamedTuple):
    peer_group: str  # the SIC prefix aggregated within, e.g. "35"
    fiscal_year: int
    fiscal_period: str
    period_end: str  # representative (max) period-end in the group for this fiscal period
    peer_count: int  # companies contributing all five legs (N/A on any leg -> excluded)
    approx_count: int  # of those, how many used a period-end balance (no prior) -> approximate
    sum_inventory: float
    sum_accounts_payable: float
    sum_accounts_receivable: float
    sum_cost_of_revenue: float
    sum_revenue: float
    dio: float  # Sigma_inventory / Sigma_cost_of_revenue x 365
    dpo: float  # Sigma_accounts_payable / Sigma_cost_of_revenue x 365
    dso: float  # Sigma_accounts_receivable / Sigma_revenue x 365
    ccc: float  # dio + dso - dpo


class SectorLifecycleRepository(ABC):
    """Persists sector-aggregate lifecycle rows, one per (peer_group, year, period)."""

    @abstractmethod
    def bulk_upsert(self, rows: list[SectorLifecycleRow]) -> None:
        """Idempotently store many rows, replacing any existing (peer_group, year, period)."""

    @abstractmethod
    def clear(self) -> None:
        """Delete all rows -- the batch fully recomputes, so a stale aggregate (e.g. a group that
        dropped below the min size) must not linger."""

    @abstractmethod
    def get_series(self, peer_group: str) -> list[SectorLifecycleRow]:
        """One sector's annual (FY) series, oldest first (the trend read).

        FY-only by design: quarterly sector aggregates are sparse (few companies resolve every
        lifecycle leg at a mid-year quarter-end), so the trend line is built on the well-covered
        annual points -- never a mix of FY and quarterly points, which would double-count."""

    @abstractmethod
    def count(self) -> int:
        """Total aggregate rows (for batch progress / tests)."""

    @abstractmethod
    def close(self) -> None:
        """Release the underlying connection."""

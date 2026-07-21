"""Repository for precomputed peer value distributions (Metrics Phase 2 follow-on).

Written by the analytical batch (`analytical/peer_distribution.py`) and read -- as a plain
group-centric point lookup -- by the `/companies/{symbol}/peers/{metric}/distribution` serving
endpoint. The batch is the ONLY producer; the serving path never runs the DuckDB aggregation
itself (see CLAUDE.md: DuckDB is batch/analytical only). See
sqlite_metric_distribution_repository.py.

Unlike `metric_ranks` (one row per company), this is keyed by the peer GROUP -- a distribution
is shared by every company in that group/period/metric, so it's computed and stored once.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from typing import NamedTuple


class MetricDistributionRow(NamedTuple):
    peer_group: str  # the SIC prefix the distribution was computed within, e.g. "35"
    fiscal_year: int
    fiscal_period: str
    metric: str
    peer_count: int  # companies in the group with a comparable (non-N/A) value
    min: float
    p25: float
    median: float
    p75: float
    max: float


class MetricDistributionRepository(ABC):
    """Persists precomputed peer distributions, one per (peer_group, year, period, metric)."""

    @abstractmethod
    def bulk_upsert(self, rows: list[MetricDistributionRow]) -> None:
        """Idempotently store many rows, replacing any existing (group, year, period, metric)."""

    @abstractmethod
    def clear(self) -> None:
        """Delete all rows -- the batch fully recomputes, so a stale distribution (e.g. a group
        that dropped below the min size) must not linger."""

    @abstractmethod
    def get(
        self, peer_group: str, fiscal_year: int, fiscal_period: str, metric: str
    ) -> MetricDistributionRow | None:
        """The precomputed distribution for one (group, period, metric), or None if never
        computed (below the minimum peer-group size, or not yet run for that period)."""

    @abstractmethod
    def list_for_metric(
        self, metric: str, fiscal_year: int, fiscal_period: str
    ) -> list[MetricDistributionRow]:
        """Every qualifying SIC group's distribution for ONE metric+period -- the cross-sector
        (box-per-sector) read. Only groups the batch materialized (>= min size) are returned;
        below-min groups are absent, never zero-filled."""

    @abstractmethod
    def list_for_group(
        self, peer_group: str, fiscal_year: int, fiscal_period: str
    ) -> list[MetricDistributionRow]:
        """Every metric's distribution for ONE SIC group+period -- the per-sector (box-per-metric)
        read. The caller filters to the metrics it plots; a metric N/A for the group is simply
        absent, never a zero box."""

    @abstractmethod
    def latest_fy_year(self, metric: str) -> int | None:
        """The most recent materialized annual (FY) fiscal year for one metric, or None if the
        metric has no rows. The default period for the cross-sector read when none is given."""

    @abstractmethod
    def count(self) -> int:
        """Total precomputed distribution rows (for batch progress / tests)."""

    @abstractmethod
    def close(self) -> None:
        """Release the underlying connection."""

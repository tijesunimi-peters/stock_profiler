"""Repository for precomputed peer-relative metric ranks (Metrics Phase 2).

Written by the analytical batch (`analytical/peer_ranks.py`) and read — as a plain
issuer-centric point lookup — by the `/companies/{symbol}/peers` serving endpoint. The
batch is the ONLY producer; the serving path never runs the DuckDB ranking itself (see
CLAUDE.md: DuckDB is batch/analytical only). See sqlite_metric_rank_repository.py.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from typing import NamedTuple


class MetricRankRow(NamedTuple):
    cik: int
    fiscal_year: int
    fiscal_period: str
    metric: str
    peer_group: str  # the SIC prefix the rank was computed within, e.g. "35"
    peer_count: int  # companies in the group with a comparable (non-N/A) value
    percentile: float  # 0..100, position within the peer distribution (NOT a good/bad verdict)
    z_score: float  # (value - peer mean) / peer stddev


class MetricRankRepository(ABC):
    """Persists precomputed peer ranks, one per (cik, year, period, metric)."""

    @abstractmethod
    def bulk_upsert(self, rows: list[MetricRankRow]) -> None:
        """Idempotently store many ranks, replacing any existing (cik, year, period, metric)."""

    @abstractmethod
    def clear(self) -> None:
        """Delete all rows -- the batch fully recomputes, so a stale rank (e.g. a company that
        dropped below the min peer size) must not linger."""

    @abstractmethod
    def get_for_cik(self, cik: int, fiscal_year: int, fiscal_period: str) -> list[MetricRankRow]:
        """Every precomputed rank for one company + period (the serving read)."""

    @abstractmethod
    def count(self) -> int:
        """Total precomputed rank rows (for batch progress / tests)."""

    @abstractmethod
    def close(self) -> None:
        """Release the underlying connection."""

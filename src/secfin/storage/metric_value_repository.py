"""Repository for materialized per-company metric values (Metrics Phase 2).

A serialization of Phase-1 `compute_metrics` output — one row per
(cik, fiscal_year, fiscal_period, metric) — NOT a new canonical model. Written by
`ingest/metrics_backfill.py` and read by the analytical peer-rank batch
(`analytical/peer_ranks.py`, via DuckDB `ATTACH` over this same SQLite file). See
sqlite_metric_value_repository.py.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from typing import NamedTuple


class MetricValueRow(NamedTuple):
    cik: int
    fiscal_year: int
    fiscal_period: str
    metric: str
    value: float | None  # None when status is na/nm (a gap, never a fabricated 0)
    status: str
    unit: str


class MetricValueRepository(ABC):
    """Persists materialized metric values, one per (cik, year, period, metric)."""

    @abstractmethod
    def bulk_upsert(self, rows: list[MetricValueRow]) -> None:
        """Idempotently store many rows, replacing any existing (cik, year, period, metric)."""

    @abstractmethod
    def get_for_cik(self, cik: int) -> list[MetricValueRow]:
        """All materialized rows for one company (for tests / inspection)."""

    @abstractmethod
    def count(self) -> int:
        """Total materialized rows (for batch progress / tests)."""

    @abstractmethod
    def close(self) -> None:
        """Release the underlying connection."""

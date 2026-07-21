"""Repository for per-company asset-lifecycle dollar components (staging for the sector aggregate).

Written by `ingest/lifecycle_backfill.py` (the metric engine's `lifecycle_components`, per company +
period) and read only by the analytical batch (`analytical/sector_lifecycle.py`, via DuckDB) which
sums them per SIC group into `sector_lifecycle`. NOT read on the live request path -- the serving
endpoint reads the materialized `sector_lifecycle` table instead. See
sqlite_lifecycle_component_repository.py.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from typing import NamedTuple


class LifecycleComponentRow(NamedTuple):
    cik: int
    fiscal_year: int
    fiscal_period: str
    period_end: str
    inventory: float  # average inventory over the TTM window (raw reported unit -- USD)
    accounts_payable: float  # average accounts payable
    accounts_receivable: float  # average accounts receivable
    cost_of_revenue: float  # TTM cost of revenue (DIO/DPO denominator)
    revenue: float  # TTM revenue (DSO denominator)
    approximate: bool  # an average fell back to the ending balance (flagged upstream)


class LifecycleComponentRepository(ABC):
    """Persists per-company asset-lifecycle inputs, one row per (cik, year, period)."""

    @abstractmethod
    def bulk_upsert(self, rows: list[LifecycleComponentRow]) -> None:
        """Idempotently store many rows, replacing any existing (cik, year, period)."""

    @abstractmethod
    def clear(self) -> None:
        """Delete all rows -- the backfill fully rematerializes, so a stale row (e.g. a company
        that lost a required leg after a restatement) must not linger."""

    @abstractmethod
    def count(self) -> int:
        """Total component rows (for backfill progress / tests)."""

    @abstractmethod
    def close(self) -> None:
        """Release the underlying connection."""

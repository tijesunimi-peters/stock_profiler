"""Repository for per-company DuPont dollar components (staging for the sector aggregate).

Written by `ingest/dupont_backfill.py` (the metric engine's `dupont_components`, per company +
period) and read only by the analytical batch (`analytical/sector_dupont.py`, via DuckDB) which
sums them per SIC group into `sector_dupont`. NOT read on the live request path -- the serving
endpoints read the materialized `sector_dupont` table instead. See
sqlite_dupont_component_repository.py.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from typing import NamedTuple


class DupontComponentRow(NamedTuple):
    cik: int
    fiscal_year: int
    fiscal_period: str
    period_end: str
    net_income: float  # TTM net income (raw reported unit -- USD)
    revenue: float  # TTM revenue
    avg_assets: float  # average total assets over the TTM window
    avg_equity: float  # average stockholders' equity over the TTM window
    approximate: bool  # an average fell back to the ending balance (flagged upstream)


class DupontComponentRepository(ABC):
    """Persists per-company DuPont inputs, one row per (cik, year, period)."""

    @abstractmethod
    def bulk_upsert(self, rows: list[DupontComponentRow]) -> None:
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

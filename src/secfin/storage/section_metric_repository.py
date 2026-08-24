"""Repository interface for derived tone/readability metrics (Track 2 Wave A, Stage 3).

See `normalize/section_metrics.py` for what's computed, the AFINN sourcing, and why the LM-style
uncertainty/litigious categories are absent rather than approximated.

Written only by `ingest/section_backfill.py`.
"""

from __future__ import annotations

from abc import ABC, abstractmethod

from secfin.normalize.section_metrics import TextMetrics


class SectionMetricRepository(ABC):
    """Persists per-section tone/readability metrics, keyed (cik, accession, item_code)."""

    @abstractmethod
    def upsert_metrics(
        self, cik: int, accession: str, item_code: str, metrics: TextMetrics
    ) -> None:
        """Idempotently store one section's metrics."""

    @abstractmethod
    def get_metrics(self, cik: int, accession: str, item_code: str) -> TextMetrics | None:
        """One section's metrics, or None if never scored -- or scored under an older
        `METRICS_SCHEMA_VERSION`, which reads as a cache MISS, not an answer."""

    @abstractmethod
    def close(self) -> None:
        """Release the underlying connection."""

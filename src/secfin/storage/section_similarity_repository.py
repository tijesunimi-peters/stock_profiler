"""Repository interface for YoY section-similarity scores (Track 2 Wave A, Stage 4).

See `normalize/section_similarity.py` for the computation and the "no threshold yet" caution.

Written only by `ingest/section_backfill.py`.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass


@dataclass
class SectionSimilarityRow:
    cik: int
    accession: str
    item_code: str
    prior_accession: str
    cosine_similarity: float
    jaccard_similarity: float


class SectionSimilarityRepository(ABC):
    """Persists per-section YoY similarity scores, keyed (cik, accession, item_code)."""

    @abstractmethod
    def upsert(self, row: SectionSimilarityRow) -> None:
        """Idempotently store one section's similarity score."""

    @abstractmethod
    def get(self, cik: int, accession: str, item_code: str) -> SectionSimilarityRow | None:
        """One section's similarity score, or None if never scored -- or scored under an older
        `SIMILARITY_SCHEMA_VERSION`, which reads as a cache MISS, not an answer."""

    @abstractmethod
    def close(self) -> None:
        """Release the underlying connection."""

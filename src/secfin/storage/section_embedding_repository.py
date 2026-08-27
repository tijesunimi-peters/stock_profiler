"""Repository interface for per-sentence filing-section embeddings (Track 2 Wave B, embedding
infra).

See `normalize/section_embeddings.py` for what gets stored and why: unlike Wave A's regex-based
tone scoring, an embedding costs real ONNX inference -- computed once per sentence at ingest time
and read many times by classification passes (risk themes, CAM topics, ...) against different
anchor sets.

Stores VECTORS ONLY, keyed by (cik, accession, item_code, sentence_index) -- not sentence text.
`sentence_index` is the ordinal into `sec.filing_sections.split_sentences(cleaned_text)`; a reader
that needs the sentence text itself re-derives it from the already-stored `filing_sections` row
rather than duplicating it here, so the two can never drift apart.

Written by ingest (which module, not yet decided -- see `docs/ROADMAP_TRACK2.md` §8.4 step 1).
"""

from __future__ import annotations

from abc import ABC, abstractmethod


class SectionEmbeddingRepository(ABC):
    """Persists per-sentence embedding vectors, keyed (cik, accession, item_code,
    sentence_index)."""

    @abstractmethod
    def upsert_embeddings(
        self, cik: int, accession: str, item_code: str, embeddings: list[list[float]]
    ) -> None:
        """Idempotently store one section's per-sentence embeddings, in sentence order.

        Replaces any prior embeddings for this (cik, accession, item_code) wholesale -- a re-embed
        (model change, re-parse under a newer SECTIONS_SCHEMA_VERSION) must never leave stale
        trailing rows if the new sentence count is smaller than the old one.
        """

    @abstractmethod
    def get_embeddings(self, cik: int, accession: str, item_code: str) -> list[list[float]]:
        """This section's embeddings, ordered by sentence_index.

        A row written under an older `EMBEDDINGS_SCHEMA_VERSION` is excluded -- a cache MISS, not
        an answer, same convention as `SQLiteFilingSectionRepository.get_sections`. Empty list if
        never embedded, inapplicable to the form, or entirely stale.
        """

    @abstractmethod
    def close(self) -> None:
        """Release the underlying connection."""

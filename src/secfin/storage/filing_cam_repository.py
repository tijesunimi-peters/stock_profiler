"""Repository interface for parsed Critical Audit Matters (Track 2 Wave B, §8.2).

See `sec/filing_cam.py` for why this is its own table rather than a `filing_sections` row: CAMs
are a REPEATING block (1-4 matters per filer per year), which breaks `filing_sections`'
`PRIMARY KEY (cik, accession, item_code)` invariant of one row per item_code. Keyed
`(cik, accession, ordinal)` instead.

Written only by ingest (module TBD, mirroring `ingest/section_backfill.py`'s shape -- not yet
wired, see `docs/ROADMAP_TRACK2.md` §8.4).
"""

from __future__ import annotations

from abc import ABC, abstractmethod

from secfin.sec.filing_cam import CamMatterResult


class FilingCamRepository(ABC):
    """Persists parsed CAM matters, keyed (cik, accession, ordinal)."""

    @abstractmethod
    def upsert_matters(self, cik: int, accession: str, matters: list[CamMatterResult]) -> None:
        """Idempotently store one filing's CAM matters, replacing any prior set wholesale.

        A wholesale replace (not a per-ordinal upsert) so a re-parse under a newer
        `CAM_SCHEMA_VERSION` that finds FEWER matters than before never leaves stale trailing
        rows -- the same reasoning `SQLiteSectionEmbeddingRepository.upsert_embeddings` documents.
        """

    @abstractmethod
    def get_matters(self, cik: int, accession: str) -> list[CamMatterResult]:
        """This filing's CAM matters, ordered by ordinal.

        A row written under an older `CAM_SCHEMA_VERSION` is excluded -- a cache MISS, not an
        answer, same convention as `SQLiteFilingSectionRepository.get_sections`. Empty list if
        never parsed or entirely stale (never confused with a real "matched the disclaimer but
        found nothing" `status="na"` row, which IS returned).
        """

    @abstractmethod
    def close(self) -> None:
        """Release the underlying connection."""

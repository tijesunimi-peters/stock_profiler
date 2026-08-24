"""Repository interface for parsed filing sections (Track 2 Wave A, Stage 2).

See `sec/filing_sections.py` for what gets stored and why it's cached rather than re-parsed live:
a primary document is hundreds of KB to a few MB, fetched once, with its sections read many times.

Written only by `ingest/section_backfill.py`.
"""

from __future__ import annotations

from abc import ABC, abstractmethod

from secfin.sec.filing_sections import SectionResult


class FilingSectionRepository(ABC):
    """Persists parsed Item sections, keyed (cik, accession, item_code)."""

    @abstractmethod
    def upsert_sections(self, cik: int, accession: str, sections: list[SectionResult]) -> None:
        """Idempotently store one filing's sections."""

    @abstractmethod
    def get_sections(self, cik: int, accession: str) -> dict[str, SectionResult]:
        """Every section parsed for this filing, keyed by item_code.

        A row written under an older `SECTIONS_SCHEMA_VERSION` is excluded -- a cache MISS, not
        an answer, so the caller re-parses and heals it (same convention as
        `SQLiteFilingCoverRepository.get_cover`). An item_code with no row at all (never parsed,
        or inapplicable to the form) is simply absent from the returned dict.
        """

    @abstractmethod
    def close(self) -> None:
        """Release the underlying connection."""

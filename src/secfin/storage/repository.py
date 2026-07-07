"""Repository interface for the operational store.

Kept abstract so SQLite (dev) can be swapped for Postgres later without touching
callers -- see CLAUDE.md: "keep DB behind an interface; no raw SQL in the API layer."

This is the operational store described in docs/ARCHITECTURE.md 3a -- what `serve`
reads from. It is not the analytical (DuckDB/Parquet) layer, which stays docs-only
until Milestone 2.5.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from collections.abc import Iterable, Sequence

from secfin.normalize.schema import RawFact

# One checkpoint row: (cik, zip_entry_or_None, fact_count).
Checkpoint = tuple[int, str | None, int]


class RawFactRepository(ABC):
    """Persists RawFacts and tracks per-company ingest checkpoints."""

    @abstractmethod
    def upsert_raw_facts(self, facts: Iterable[RawFact]) -> int:
        """Idempotently insert/update facts. Returns the number of rows written.

        Idempotent on (cik, gaap_tag, unit, period_start, period_end, instant, accession):
        re-ingesting the same fact from the same filing updates in place. A restatement
        (same concept+period, different accession/filed) lands as a NEW row -- prior
        values are never deleted; normalize/statements.py picks "current" at read time.
        """

    @abstractmethod
    def upsert_raw_facts_and_checkpoint(
        self,
        facts: Iterable[RawFact],
        checkpoints: Sequence[Checkpoint],
        source: str,
    ) -> int:
        """Write a batch of facts spanning possibly multiple companies, and record one
        checkpoint row per (cik, zip_entry, fact_count) in the SAME transaction as the
        facts, so a crash can never leave a checkpoint committed without its facts (or
        facts committed without their checkpoint) -- required for safe backfill resume.
        """

    @abstractmethod
    def get_raw_facts(self, cik: int) -> list[RawFact]:
        """All facts stored for a company, across all restatement versions."""

    @abstractmethod
    def get_ingested_ciks(self, source: str) -> set[int]:
        """CIKs already checkpointed as ingested for a given source (e.g.
        "bulk_companyfacts"), so a crashed backfill can resume without re-parsing them.
        """

    @abstractmethod
    def screen(self, gaap_tags: Sequence[str], frame: str) -> list[tuple[int, str, float]]:
        """Cross-company screening (Milestone 4): every (cik, gaap_tag, value) row for
        any of `gaap_tags` in an exact SEC frame period (e.g. "CY2023Q4" -- see
        sec/frames.py). Keyed on `frame`, not `fiscal_year`/`fiscal_period`, since frames
        are calendar-aligned and a company's own fiscal period may not line up with the
        calendar -- see normalize/screening.py. Reconciling multiple candidate tags per
        canonical concept into one value per company is normalize/screening.py's job,
        not this repository's -- this is a plain filtered read, no aggregation in SQL.
        """

    @abstractmethod
    def close(self) -> None:
        """Release the underlying connection."""

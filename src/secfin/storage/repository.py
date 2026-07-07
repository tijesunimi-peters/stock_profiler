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
    def get_raw_facts_for_period(
        self, cik: int, fiscal_year: int, fiscal_period: str
    ) -> list[RawFact]:
        """Facts for one company, scoped to a single (fiscal_year, fiscal_period).

        Pre-launch load-test finding (2026-07-07): `get_statement` only ever needs one
        period, but was calling `get_raw_facts` (fetch + Pydantic-validate a company's
        ENTIRE history) and filtering in Python -- ~220ms for an established filer like
        Apple (24,765 rows) vs. a period-filtered SQL query using the existing
        `(cik, fiscal_year, fiscal_period)` index. `get_raw_facts` stays as-is for
        `/periods`, which genuinely needs every period to enumerate what's available.
        """

    @abstractmethod
    def has_any_facts(self, cik: int) -> bool:
        """Cheap existence check: has this company EVER been ingested (any period at
        all)? Lets the period-scoped cache-aside helper (`api/routes.py`'s
        `_statement_facts_for_cik`) distinguish "never ingested, fetch from SEC" from
        "ingested, but this specific period genuinely has no data" -- without which a
        request for an out-of-range period on an already-cached company would refetch
        the whole company from SEC on every single request.
        """

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

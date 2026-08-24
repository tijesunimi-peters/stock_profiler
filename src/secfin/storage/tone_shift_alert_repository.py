"""Repository interface for the sector tone-shift leaderboard (Track 2 Wave A, Stage 6).

A materialized JOIN of `section_similarity` (Risk Factors / Legal Proceedings only) against
`company_profiles` for SIC grouping -- one row per (cik, accession, item_code), NOT a
pre-aggregated top-N: the "biggest rewrites" ordering is applied live by the route over
`get_group()`'s rows, the same live-aggregation-over-precomputed-rows pattern
`sector_governance_stat_repository.py` established in Wave 0, so the leaderboard size isn't baked
into the batch.

**No "meaningfully changed" verdict here either** -- see `normalize/section_similarity.py`'s
docstring. A low `cosine_similarity` is a raw signal a reader should treat as "look at this",
not a confirmed rewrite; the route's caveats say so.

Written only by `analytical/tone_shift_alerts.py`.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass


@dataclass
class ToneShiftAlertRow:
    cik: int
    peer_group: str
    company_name: str | None
    item_code: str
    accession: str
    prior_accession: str
    filing_date: str | None
    cosine_similarity: float
    jaccard_similarity: float


class ToneShiftAlertRepository(ABC):
    """Persists per-(company, filing, item) YoY similarity for sector-level roll-up."""

    @abstractmethod
    def bulk_upsert(self, rows: list[ToneShiftAlertRow]) -> None:
        """Idempotently store a batch, keyed by (cik, accession, item_code)."""

    @abstractmethod
    def get_group(self, peer_group: str) -> list[ToneShiftAlertRow]:
        """Every scored (company, filing, item) in one SIC group.

        An empty list means the batch has not covered this group -- report as "not computed",
        never as a group where nothing changed."""

    @abstractmethod
    def close(self) -> None:
        """Release the underlying connection."""

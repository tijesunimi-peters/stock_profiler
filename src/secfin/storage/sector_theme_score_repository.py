"""Repository for precomputed composite sector THEME SCORES (sector-overview redesign, Phase 0).

Written by the offline batch (`analytical/sector_theme_scores.py`) and read -- cache-aside -- by
`GET /v1/sectors/theme-scores`. The batch is the ONLY producer; the serving path never recomputes
a score.

Two tables, parent + child (the same split as lifecycle_components / sector_lifecycle):
  * `sector_theme_scores`     -- one row per (peer_group, year, period, LIVE theme): the composite
    score, its cross-sector rank + percentile, and the prior-FY trend delta.
  * `sector_theme_components` -- the score decomposition (guide 00 §9a): one row per INCLUDED
    constituent metric, carrying its sector median + oriented z-score contribution. An excluded /
    N/A constituent has NO row (N/A is never rendered as 0).

Only the five backable themes are stored; the two deferred themes are injected at the serve layer
as scored:false markers, never materialized. See sqlite_sector_theme_score_repository.py.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from typing import NamedTuple


class SectorThemeScoreRow(NamedTuple):
    peer_group: str  # the SIC prefix scored within, e.g. "35"
    fiscal_year: int
    fiscal_period: str
    theme: str  # a THEMES key, e.g. "profitability"
    peer_count: int  # max constituent peer_count for the sector (rough context, not a shared set)
    constituent_count: int  # constituents included in the equal-weight average
    composite_z: float  # equal-weight mean of oriented constituent z-scores
    score: int  # 50 + 15*composite_z, clamped [0, 100]
    percentile: float  # percentile rank of composite_z across scored sectors (0-100)
    rank: int  # 1 = most favorable sector on this theme+period
    rank_of: int  # scored sectors for this theme+period
    delta_vs_prior_fy: float | None  # score - prior-FY score; None if no prior (never 0-as-missing)


class SectorThemeComponentRow(NamedTuple):
    peer_group: str
    fiscal_year: int
    fiscal_period: str
    theme: str
    metric: str  # a metric key, e.g. "net_margin"
    higher_is_better: bool  # carried for the UI (orientation, not color)
    median_value: float  # the sector median that fed the z (auditability)
    oriented_z: float  # signed so higher = more favorable


class SectorThemeScoreRepository(ABC):
    """Persists precomputed composite theme scores + their decomposition."""

    @abstractmethod
    def bulk_upsert(
        self, parents: list[SectorThemeScoreRow], components: list[SectorThemeComponentRow]
    ) -> None:
        """Idempotently store scores + components, replacing any existing keys."""

    @abstractmethod
    def clear(self) -> None:
        """Delete all rows -- the batch fully recomputes, so a stale score (e.g. a sector/theme
        that dropped below threshold) must not linger."""

    @abstractmethod
    def list_for_period(self, fiscal_year: int, fiscal_period: str) -> list[SectorThemeScoreRow]:
        """Every scored (sector, theme) for one period. Only rows the batch materialized are
        present; a sector/theme that didn't meet threshold is absent, never zero-filled."""

    @abstractmethod
    def components_for_period(
        self, fiscal_year: int, fiscal_period: str
    ) -> list[SectorThemeComponentRow]:
        """Every included constituent for one period -- the caller groups these under the parent
        rows by (peer_group, theme) to build the decomposition."""

    @abstractmethod
    def latest_fy_year(self) -> int | None:
        """The most recent well-covered annual (FY) year, or None if nothing is materialized --
        the default period for the endpoint when none is given."""

    @abstractmethod
    def count(self) -> int:
        """Total score rows (for batch progress / tests)."""

    @abstractmethod
    def close(self) -> None:
        """Release the underlying connection."""

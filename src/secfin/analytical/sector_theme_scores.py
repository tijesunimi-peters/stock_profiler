"""Composite sector THEME-SCORE batch (sector-overview redesign, Phase 0).

Computes, per (SIC group, period, theme), a 0-100 composite health score with its cross-sector
rank + percentile, prior-FY trend delta, and per-constituent decomposition, and writes it to
`sector_theme_scores` / `sector_theme_components` for `GET /v1/sectors/theme-scores` to read.

**Pure Python -- deliberately NOT DuckDB.** The sibling sector batches (peer_ranks,
peer_distribution, sector_dupont, sector_lifecycle) use DuckDB because they aggregate metric_values
/ raw_facts (millions of rows). This batch's input is `metric_distributions` -- ALREADY the output
of that aggregation stage, only a few thousand median rows -- so it reads via the
MetricDistributionRepository and z-scores in Python. It is still an OFFLINE batch invoked by
`python -m`, never on the live request path (there is simply no DuckDB here to keep off it). See
docs/REDESIGN_SECTOR_OVERVIEW.md.

Method (guide 00 §5/§9/§9a):
  1. Per (year, period), per constituent metric: z-score the per-sector medians ACROSS sectors,
     then ORIENT by favorability (higher_is_better) so a higher z is always more favorable.
  2. Per sector, per theme: equal-weight-average the available oriented z's (if enough
     constituents), map to score = 50 + 15*z clamped [0, 100].
  3. Per (year, period, theme): rank scored sectors by composite z (1 = most favorable) +
     percentile.
  4. Prior-FY delta on the FY series.
N/A is never a low value: a constituent with no sector median, or a metric with too few sectors to
z-score, is EXCLUDED; a theme below the minimum-constituent count is OMITTED for that sector.

Run: `python -m secfin.analytical.sector_theme_scores`
"""

from __future__ import annotations

import argparse
import logging
import statistics
from collections import defaultdict

from secfin.config import settings
from secfin.normalize.metrics import higher_is_better
from secfin.normalize.themes import (
    MIN_SECTORS_FOR_ZSCORE,
    NEAR_ZERO,
    THEMES,
    min_constituents,
)
from secfin.storage.metric_distribution_repository import MetricDistributionRepository
from secfin.storage.sector_theme_score_repository import (
    SectorThemeComponentRow,
    SectorThemeScoreRow,
)
from secfin.storage.sqlite_metric_distribution_repository import (
    SQLiteMetricDistributionRepository,
)
from secfin.storage.sqlite_sector_theme_score_repository import (
    SQLiteSectorThemeScoreRepository,
)

logger = logging.getLogger(__name__)

# Every distinct metric that feeds a theme (deduped -- ocf_growth_yoy is in two themes).
_THEMED_METRICS: tuple[str, ...] = tuple(
    dict.fromkeys(m for _label, metrics in THEMES.values() for m in metrics)
)

# (year, period) -> metric -> {peer_group: median}
_Medians = dict[tuple[int, str], dict[str, dict[str, float]]]
# (year, period) -> peer_group -> max peer_count seen (rough sector-size context)
_PeerCounts = dict[tuple[int, str], dict[str, int]]


def _score_from_z(z: float) -> int:
    """Map a composite z-score to 0-100: 50 = cross-sector average, +/-1sigma ~= 15 points."""
    return int(round(max(0.0, min(100.0, 50.0 + 15.0 * z))))


def _percentile_rank(value: float, population: list[float]) -> float:
    """Percentile rank (0-100) of `value` within `population` (which includes `value`). Uses the
    'below + half-equal' definition so ties share a middle rank."""
    n = len(population)
    if n <= 1:
        return 50.0
    below = sum(1 for v in population if v < value)
    equal = sum(1 for v in population if v == value)
    return 100.0 * (below + 0.5 * equal) / n


def _oriented_z_by_sector(
    medians_by_sector: dict[str, float], metric: str
) -> dict[str, float]:
    """z-score the sector medians across sectors and orient by favorability. Returns {} if too few
    sectors or ~zero dispersion (constituent excluded that period, never zero-scored)."""
    if len(medians_by_sector) < MIN_SECTORS_FOR_ZSCORE:
        return {}
    values = list(medians_by_sector.values())
    mean = statistics.fmean(values)
    stdev = statistics.pstdev(values)
    if stdev < NEAR_ZERO:
        return {}
    sign = 1.0 if higher_is_better(metric) else -1.0
    return {g: sign * (m - mean) / stdev for g, m in medians_by_sector.items()}


def compute_scores(
    medians: _Medians, peer_counts: _PeerCounts
) -> tuple[list[SectorThemeScoreRow], list[SectorThemeComponentRow]]:
    """Pure core: turn the bucketed sector medians into score + component rows. No I/O."""
    # First pass: per (year, period, theme) -> peer_group -> (composite_z, [component rows], count,
    # peer_count). We hold composites so we can rank/percentile/delta before emitting.
    Pending = dict[str, tuple[float, list[SectorThemeComponentRow], int, int]]
    by_key: dict[tuple[int, str, str], Pending] = defaultdict(dict)

    for (year, period), by_metric in medians.items():
        # oriented z per metric per sector for this period
        oriented: dict[str, dict[str, float]] = {
            metric: _oriented_z_by_sector(by_metric.get(metric, {}), metric)
            for metric in _THEMED_METRICS
        }
        for theme, (_label, constituents) in THEMES.items():
            need = min_constituents(len(constituents))
            # collect sectors that appear for any constituent of this theme
            sectors = {
                g
                for metric in constituents
                for g in oriented.get(metric, {})
            }
            for g in sectors:
                zs: list[float] = []
                comps: list[SectorThemeComponentRow] = []
                for metric in constituents:
                    z = oriented.get(metric, {}).get(g)
                    if z is None:
                        continue  # N/A / not z-scoreable -> excluded, no component row
                    zs.append(z)
                    comps.append(
                        SectorThemeComponentRow(
                            peer_group=g,
                            fiscal_year=year,
                            fiscal_period=period,
                            theme=theme,
                            metric=metric,
                            higher_is_better=higher_is_better(metric),
                            median_value=by_metric[metric][g],
                            oriented_z=z,
                        )
                    )
                if len(zs) < need:
                    continue  # theme omitted for this sector (not a low score, not a zero)
                composite_z = statistics.fmean(zs)
                pc = peer_counts.get((year, period), {}).get(g, 0)
                by_key[(year, period, theme)][g] = (composite_z, comps, len(zs), pc)

    # Second pass: rank + percentile within each (year, period, theme).
    parents: list[SectorThemeScoreRow] = []
    components: list[SectorThemeComponentRow] = []
    # score lookup for the prior-FY delta: (peer_group, theme, year) -> score  (FY only)
    fy_score: dict[tuple[str, str, int], int] = {}
    for (year, period, theme), per_sector in by_key.items():
        zs_pop = [v[0] for v in per_sector.values()]
        rank_of = len(per_sector)
        # rank 1 = highest composite_z (most favorable)
        ordered = sorted(per_sector.items(), key=lambda kv: kv[1][0], reverse=True)
        for rank, (g, (composite_z, comps, count, pc)) in enumerate(ordered, start=1):
            score = _score_from_z(composite_z)
            parents.append(
                SectorThemeScoreRow(
                    peer_group=g,
                    fiscal_year=year,
                    fiscal_period=period,
                    theme=theme,
                    peer_count=pc,
                    constituent_count=count,
                    composite_z=composite_z,
                    score=score,
                    percentile=_percentile_rank(composite_z, zs_pop),
                    rank=rank,
                    rank_of=rank_of,
                    delta_vs_prior_fy=None,  # filled below
                )
            )
            components.extend(comps)
            if period == "FY":
                fy_score[(g, theme, year)] = score

    # Third pass: prior-FY delta (FY series only). Never 0-as-missing -- None when no prior year.
    finalized: list[SectorThemeScoreRow] = []
    for p in parents:
        delta = None
        if p.fiscal_period == "FY":
            prior = fy_score.get((p.peer_group, p.theme, p.fiscal_year - 1))
            if prior is not None:
                delta = float(p.score - prior)
        finalized.append(p._replace(delta_vs_prior_fy=delta))
    return finalized, components


def load_medians(dist_repo: MetricDistributionRepository) -> tuple[_Medians, _PeerCounts]:
    """Read every themed metric's distributions and bucket the medians by (year, period)."""
    medians: _Medians = defaultdict(lambda: defaultdict(dict))
    peer_counts: _PeerCounts = defaultdict(dict)
    for metric in _THEMED_METRICS:
        for row in dist_repo.list_for_metric_all_periods(metric):
            key = (row.fiscal_year, row.fiscal_period)
            medians[key][metric][row.peer_group] = row.median
            prev = peer_counts[key].get(row.peer_group, 0)
            if row.peer_count > prev:
                peer_counts[key][row.peer_group] = row.peer_count
    return medians, peer_counts


def run_sector_theme_scores(db_path: str) -> int:
    """Compute composite theme scores from metric_distributions and replace the tables. Returns
    the score-row count."""
    dist_repo = SQLiteMetricDistributionRepository(db_path)
    try:
        medians, peer_counts = load_medians(dist_repo)
    finally:
        dist_repo.close()
    parents, components = compute_scores(medians, peer_counts)
    repo = SQLiteSectorThemeScoreRepository(db_path)
    try:
        repo.clear()  # full recompute -- drop stale scores first
        repo.bulk_upsert(parents, components)
    finally:
        repo.close()
    logger.info(
        "sector theme scores done: %d score rows, %d component rows (%d themed metrics)",
        len(parents),
        len(components),
        len(_THEMED_METRICS),
    )
    return len(parents)


def build_arg_parser() -> argparse.ArgumentParser:
    return argparse.ArgumentParser(
        description="Compute composite per-SIC-group theme scores from metric_distributions "
        "(pure-Python offline batch)."
    )


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    build_arg_parser().parse_args()
    run_sector_theme_scores(settings.secfin_db_path)


if __name__ == "__main__":
    main()

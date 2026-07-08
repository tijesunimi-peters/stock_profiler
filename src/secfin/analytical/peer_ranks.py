"""Peer-ranking batch job (Metrics Phase 2) -- the project's first analytical-layer job.

Computes, per (SIC group, period, metric), each company's **percentile** and **z-score**
within its industry peer distribution, and writes them to `metric_ranks` for the
`/companies/{symbol}/peers` endpoint to read.

Analytical, batch, offline -- NEVER on the live request path (CLAUDE.md). It reads the
materialized `metric_values` + `company_profiles` tables straight out of the SQLite file via
DuckDB's `ATTACH ... (TYPE sqlite)` (the mechanism benchmarked in
`scripts/benchmark_screening.py`), does the cross-company aggregation in DuckDB, then writes
the results back through the ordinary SQLite repository (the write path stays on the
operational store). `duckdb` is the `analytical` extra -- `pip install -e ".[analytical]"`.

Honesty (R7): only `ok`/`approximate` rows with a non-null value enter a distribution -- an
N/A company is excluded, never counted as a low value. A group needs at least
`settings.secfin_peer_min_size` such companies before any rank is emitted for it.

Run: `python -m secfin.analytical.peer_ranks`
"""

from __future__ import annotations

import argparse
import logging

from secfin.config import settings
from secfin.storage.metric_rank_repository import MetricRankRow
from secfin.storage.sqlite_metric_rank_repository import SQLiteMetricRankRepository

logger = logging.getLogger(__name__)

# percent_rank() gives 0..1 (min..max) -> *100 for a 0-100 percentile; z = (v-mean)/stddev_pop,
# 0 when the group is degenerate (all equal). Groups below the min size are dropped.
_RANK_SQL = """
WITH base AS (
    SELECT mv.cik, mv.fiscal_year, mv.fiscal_period, mv.metric, mv.value,
           substr(cp.sic, 1, ?) AS peer_group
    FROM sq.metric_values mv
    JOIN sq.company_profiles cp ON cp.cik = mv.cik
    WHERE mv.value IS NOT NULL
      AND mv.status IN ('ok', 'approximate')
      AND cp.sic IS NOT NULL
      AND length(cp.sic) >= ?
),
ranked AS (
    SELECT cik, fiscal_year, fiscal_period, metric, peer_group, value,
           count(*)   OVER w AS peer_count,
           avg(value) OVER w AS mean,
           stddev_pop(value) OVER w AS sd,
           percent_rank() OVER (
               PARTITION BY peer_group, fiscal_year, fiscal_period, metric ORDER BY value
           ) AS pr
    FROM base
    WINDOW w AS (PARTITION BY peer_group, fiscal_year, fiscal_period, metric)
)
SELECT cik, fiscal_year, fiscal_period, metric, peer_group, peer_count,
       round(pr * 100, 1) AS percentile,
       round(CASE WHEN sd IS NULL OR sd = 0 THEN 0 ELSE (value - mean) / sd END, 3) AS z_score
FROM ranked
WHERE peer_count >= ?
"""


def compute_peer_ranks(db_path: str, sic_digits: int, min_size: int) -> list[MetricRankRow]:
    """Run the DuckDB aggregation over the SQLite file and return the rank rows (no writes)."""
    import duckdb  # analytical extra; imported lazily so the base install/API never needs it

    con = duckdb.connect()
    try:
        con.execute(f"ATTACH '{db_path}' AS sq (TYPE sqlite)")
        rows = con.execute(_RANK_SQL, [sic_digits, sic_digits, min_size]).fetchall()
    finally:
        con.close()
    return [
        MetricRankRow(
            cik=r[0], fiscal_year=r[1], fiscal_period=r[2], metric=r[3],
            peer_group=r[4], peer_count=r[5], percentile=r[6], z_score=r[7],
        )
        for r in rows
    ]


def run_peer_ranks(db_path: str, sic_digits: int, min_size: int) -> int:
    """Compute ranks (DuckDB) then replace `metric_ranks` wholesale (SQLite). Returns the count."""
    rows = compute_peer_ranks(db_path, sic_digits, min_size)
    repo = SQLiteMetricRankRepository(db_path)
    try:
        repo.clear()  # full recompute -- drop stale ranks first
        repo.bulk_upsert(rows)
    finally:
        repo.close()
    logger.info(
        "peer ranks done: %d rows (SIC %d-digit, min group size %d)",
        len(rows),
        sic_digits,
        min_size,
    )
    return len(rows)


def build_arg_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(
        description="Compute per-SIC-group peer percentile/z-score ranks (DuckDB batch job)."
    )
    p.add_argument("--sic-digits", type=int, default=None, help="Override SIC grouping granularity")
    p.add_argument("--min-size", type=int, default=None, help="Override minimum peer-group size")
    return p


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    args = build_arg_parser().parse_args()
    run_peer_ranks(
        settings.secfin_db_path,
        sic_digits=args.sic_digits or settings.secfin_peer_sic_digits,
        min_size=args.min_size or settings.secfin_peer_min_size,
    )


if __name__ == "__main__":
    main()

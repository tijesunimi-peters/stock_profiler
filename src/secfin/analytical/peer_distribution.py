"""Peer-distribution batch job (Metrics Phase 2 follow-on) -- sibling of `peer_ranks.py`.

Computes, per (SIC group, period, metric), the peer group's own value spread -- a five-number
summary (min/p25/median/p75/max) -- and writes it to `metric_distributions` for the
`/companies/{symbol}/peers/{metric}/distribution` endpoint to read. A percentile/z-score alone
(peer_ranks.py) can't drive a distribution chart; this gives the actual peer values.

Analytical, batch, offline -- NEVER on the live request path (CLAUDE.md). Same mechanism as
peer_ranks.py: DuckDB `ATTACH ... (TYPE sqlite)` over the live SQLite file for the aggregation,
then write results back through the ordinary SQLite repository. `duckdb` is the `analytical`
extra -- `pip install -e ".[analytical]"`.

Honesty (R7): only `ok`/`approximate` rows with a non-null value enter a distribution -- an
N/A company is excluded, never counted as a low value. A group needs at least
`settings.secfin_peer_min_size` such companies before any distribution is emitted for it --
same threshold `peer_ranks.py` uses, so a metric that's rankable is also distribution-plottable
and vice versa.

Run: `python -m secfin.analytical.peer_distribution`
"""

from __future__ import annotations

import argparse
import logging

from secfin.config import settings
from secfin.storage.metric_distribution_repository import MetricDistributionRow
from secfin.storage.sqlite_metric_distribution_repository import (
    SQLiteMetricDistributionRepository,
)

logger = logging.getLogger(__name__)

# quantile_cont / median are DuckDB's continuous-interpolation quantile functions. Groups below
# the min size are dropped -- same threshold as peer_ranks.py, computed independently here
# (no cross-job dependency) so this job can run standalone.
_DISTRIBUTION_SQL = """
WITH base AS (
    SELECT mv.value, mv.fiscal_year, mv.fiscal_period, mv.metric,
           substr(cp.sic, 1, ?) AS peer_group
    FROM sq.metric_values mv
    JOIN sq.company_profiles cp ON cp.cik = mv.cik
    WHERE mv.value IS NOT NULL
      AND mv.status IN ('ok', 'approximate')
      AND cp.sic IS NOT NULL
      AND length(cp.sic) >= ?
)
SELECT peer_group, fiscal_year, fiscal_period, metric,
       count(*) AS peer_count,
       min(value) AS min_v,
       quantile_cont(value, 0.25) AS p25,
       median(value) AS median_v,
       quantile_cont(value, 0.75) AS p75,
       max(value) AS max_v
FROM base
GROUP BY peer_group, fiscal_year, fiscal_period, metric
HAVING count(*) >= ?
"""


def compute_peer_distributions(
    db_path: str, sic_digits: int, min_size: int
) -> list[MetricDistributionRow]:
    """Run the DuckDB aggregation over the SQLite file and return the rows (no writes)."""
    import duckdb  # analytical extra; imported lazily so the base install/API never needs it

    con = duckdb.connect()
    try:
        con.execute(f"ATTACH '{db_path}' AS sq (TYPE sqlite)")
        rows = con.execute(_DISTRIBUTION_SQL, [sic_digits, sic_digits, min_size]).fetchall()
    finally:
        con.close()
    return [
        MetricDistributionRow(
            peer_group=r[0],
            fiscal_year=r[1],
            fiscal_period=r[2],
            metric=r[3],
            peer_count=r[4],
            min=r[5],
            p25=r[6],
            median=r[7],
            p75=r[8],
            max=r[9],
        )
        for r in rows
    ]


def run_peer_distribution(db_path: str, sic_digits: int, min_size: int) -> int:
    """Compute distributions (DuckDB) then replace `metric_distributions` wholesale. Returns
    the count."""
    rows = compute_peer_distributions(db_path, sic_digits, min_size)
    repo = SQLiteMetricDistributionRepository(db_path)
    try:
        repo.clear()  # full recompute -- drop stale distributions first
        repo.bulk_upsert(rows)
    finally:
        repo.close()
    logger.info(
        "peer distributions done: %d rows (SIC %d-digit, min group size %d)",
        len(rows),
        sic_digits,
        min_size,
    )
    return len(rows)


def build_arg_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(
        description="Compute per-SIC-group peer value distributions (DuckDB batch job)."
    )
    p.add_argument("--sic-digits", type=int, default=None, help="Override SIC grouping granularity")
    p.add_argument("--min-size", type=int, default=None, help="Override minimum peer-group size")
    return p


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    args = build_arg_parser().parse_args()
    run_peer_distribution(
        settings.secfin_db_path,
        sic_digits=args.sic_digits or settings.secfin_peer_sic_digits,
        min_size=args.min_size or settings.secfin_peer_min_size,
    )


if __name__ == "__main__":
    main()

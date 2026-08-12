"""Materialize per-company metric values into `metric_values` (Metrics Phase 2).

Runs the Phase-1 metric engine (`normalize/metrics.py`) across every CIK with stored facts and
every period it can resolve, serializing the results so the analytical peer-rank batch
(`analytical/peer_ranks.py`) has a flat cross-company table to aggregate. Pure/no-network: it
only reads `raw_facts` and writes `metric_values`.

**Resuming an interrupted run (`--start-after`):** this job has no "already done" state of its
own -- `metric_values` is written by earlier runs too, so "has rows" cannot distinguish a CIK
this run finished from one it never reached. The walk is SORTED and ascending, which is the only
reason a single CIK can stand in for "everything below here is done". A whole-market pass is
~5.4 hours (16,920 CIKs at ~1.15s each, measured 2026-08-12), so restarting from zero after an
interruption costs most of a working day; `backfill_restart.md` called this out after the power
cut and this is that fix.

Run: `python -m secfin.ingest.metrics_backfill [--limit N] [--start-after CIK]`
"""

from __future__ import annotations

import argparse
import logging

from secfin.config import settings
from secfin.normalize.metrics import compute_metrics, metric_periods
from secfin.storage.metric_value_repository import MetricValueRow
from secfin.storage.repository import RawFactRepository
from secfin.storage.sqlite_metric_value_repository import SQLiteMetricValueRepository
from secfin.storage.sqlite_repository import SQLiteRawFactRepository

logger = logging.getLogger(__name__)

_PROGRESS_EVERY = 100


def _rows_for_cik(fact_repo: RawFactRepository, cik: int) -> list[MetricValueRow]:
    facts = fact_repo.get_raw_facts(cik)
    if not facts:
        return []
    rows: list[MetricValueRow] = []
    for p in metric_periods(facts):
        result = compute_metrics(facts, cik, p["year"], p["period"])
        for mv in result.metrics:
            rows.append(
                MetricValueRow(
                    cik=cik,
                    fiscal_year=mv.fiscal_year,
                    fiscal_period=mv.fiscal_period,
                    metric=mv.metric,
                    value=mv.value,
                    status=mv.status,
                    unit=mv.unit,
                )
            )
    return rows


def run_metrics_backfill(
    db_path: str, limit: int | None = None, start_after: int | None = None
) -> None:
    fact_repo = SQLiteRawFactRepository(db_path)
    value_repo = SQLiteMetricValueRepository(db_path)
    try:
        ciks = sorted(fact_repo.all_ciks())
        if limit is not None:
            ciks = ciks[:limit]
        # AFTER --limit, so the two compose the way an operator reads them: "the first N CIKs,
        # resuming partway through that same set". Applying it first would silently change which
        # companies a --limit run covers.
        if start_after is not None:
            total = len(ciks)
            ciks = [c for c in ciks if c > start_after]
            logger.info(
                "metrics backfill: resuming after CIK %d -- %d of %d skipped",
                start_after,
                total - len(ciks),
                total,
            )
        logger.info("metrics backfill: %d CIKs", len(ciks))
        total = 0
        for i, cik in enumerate(ciks, start=1):
            rows = _rows_for_cik(fact_repo, cik)
            value_repo.bulk_upsert(rows)
            total += len(rows)
            if i % _PROGRESS_EVERY == 0:
                logger.info("metrics backfill progress: %d/%d (%d rows)", i, len(ciks), total)
        logger.info("metrics backfill done: %d CIKs, %d metric rows", len(ciks), total)
    finally:
        value_repo.close()
        fact_repo.close()


def build_arg_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(
        description="Materialize per-company metric values from raw_facts (no network)."
    )
    p.add_argument("--limit", type=int, default=None, help="Only process the first N CIKs")
    p.add_argument(
        "--start-after",
        type=int,
        default=None,
        metavar="CIK",
        help=(
            "Skip every candidate CIK <= this one. The walk is sorted ascending, so one CIK "
            "stands in for 'everything below here is done'. Take the value from the DATA, not "
            "from a progress line: re-running a CIK is an idempotent upsert, so erring LOW is "
            "free, while erring high silently skips companies."
        ),
    )
    p.add_argument("--db-path", default=settings.secfin_db_path)
    return p


def main(argv: list[str] | None = None) -> None:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    args = build_arg_parser().parse_args(argv)
    run_metrics_backfill(args.db_path, limit=args.limit, start_after=args.start_after)


if __name__ == "__main__":
    main()

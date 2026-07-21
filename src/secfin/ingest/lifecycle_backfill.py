"""Materialize per-company asset-lifecycle components into `lifecycle_components` (Sector
Analytics D5).

Runs the metric engine's `lifecycle_components` (`normalize/metrics.py`) across every CIK with
stored facts and every period it can resolve, so the analytical sector-aggregate batch
(`analytical/sector_lifecycle.py`) has a flat cross-company table to sum per SIC group. Pure/no-
network: it only reads `raw_facts` and writes `lifecycle_components`. A company/period is written
ONLY when all five legs (inventory, payables, receivables, cost of revenue, revenue) are present
(the shared-membership rule enforced by `lifecycle_components`).

Sibling of `ingest/dupont_backfill.py`.

Run: `python -m secfin.ingest.lifecycle_backfill [--limit N]`
"""

from __future__ import annotations

import argparse
import logging

from secfin.config import settings
from secfin.normalize.metrics import lifecycle_components, metric_periods
from secfin.storage.lifecycle_component_repository import LifecycleComponentRow
from secfin.storage.repository import RawFactRepository
from secfin.storage.sqlite_lifecycle_component_repository import (
    SQLiteLifecycleComponentRepository,
)
from secfin.storage.sqlite_repository import SQLiteRawFactRepository

logger = logging.getLogger(__name__)

_PROGRESS_EVERY = 100


def _rows_for_cik(fact_repo: RawFactRepository, cik: int) -> list[LifecycleComponentRow]:
    facts = fact_repo.get_raw_facts(cik)
    if not facts:
        return []
    rows: list[LifecycleComponentRow] = []
    for p in metric_periods(facts):
        c = lifecycle_components(facts, cik, p["year"], p["period"])
        if c is None:  # missing a leg -> excluded from the aggregate (never zero-filled)
            continue
        rows.append(
            LifecycleComponentRow(
                cik=cik,
                fiscal_year=p["year"],
                fiscal_period=p["period"],
                period_end=c.period_end,
                inventory=c.inventory,
                accounts_payable=c.accounts_payable,
                accounts_receivable=c.accounts_receivable,
                cost_of_revenue=c.cost_of_revenue,
                revenue=c.revenue,
                approximate=c.approximate,
            )
        )
    return rows


def run_lifecycle_backfill(db_path: str, limit: int | None = None) -> int:
    fact_repo = SQLiteRawFactRepository(db_path)
    comp_repo = SQLiteLifecycleComponentRepository(db_path)
    try:
        comp_repo.clear()  # full rematerialize -- drop stale rows first
        ciks = sorted(fact_repo.all_ciks())
        if limit is not None:
            ciks = ciks[:limit]
        logger.info("lifecycle backfill: %d CIKs", len(ciks))
        total = 0
        for i, cik in enumerate(ciks, start=1):
            rows = _rows_for_cik(fact_repo, cik)
            comp_repo.bulk_upsert(rows)
            total += len(rows)
            if i % _PROGRESS_EVERY == 0:
                logger.info("lifecycle backfill progress: %d/%d (%d rows)", i, len(ciks), total)
        logger.info("lifecycle backfill done: %d CIKs, %d component rows", len(ciks), total)
        return total
    finally:
        comp_repo.close()
        fact_repo.close()


def build_arg_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(
        description="Materialize per-company asset-lifecycle components from raw_facts (no network)."
    )
    p.add_argument("--limit", type=int, default=None, help="Only process the first N CIKs")
    return p


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    args = build_arg_parser().parse_args()
    run_lifecycle_backfill(settings.secfin_db_path, limit=args.limit)


if __name__ == "__main__":
    main()

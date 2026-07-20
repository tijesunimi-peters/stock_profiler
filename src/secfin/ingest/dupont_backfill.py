"""Materialize per-company DuPont components into `dupont_components` (Sector Analytics D1).

Runs the metric engine's `dupont_components` (`normalize/metrics.py`) across every CIK with stored
facts and every period it can resolve, so the analytical sector-aggregate batch
(`analytical/sector_dupont.py`) has a flat cross-company table to sum per SIC group.
Pure/no-network: it only reads `raw_facts` and writes `dupont_components`. A company/period is
written ONLY when all four DuPont legs are present (the shared-membership rule enforced by
`dupont_components`).

Sibling of `ingest/metrics_backfill.py`.

Run: `python -m secfin.ingest.dupont_backfill [--limit N]`
"""

from __future__ import annotations

import argparse
import logging

from secfin.config import settings
from secfin.normalize.metrics import dupont_components, metric_periods
from secfin.storage.dupont_component_repository import DupontComponentRow
from secfin.storage.repository import RawFactRepository
from secfin.storage.sqlite_dupont_component_repository import SQLiteDupontComponentRepository
from secfin.storage.sqlite_repository import SQLiteRawFactRepository

logger = logging.getLogger(__name__)

_PROGRESS_EVERY = 100


def _rows_for_cik(fact_repo: RawFactRepository, cik: int) -> list[DupontComponentRow]:
    facts = fact_repo.get_raw_facts(cik)
    if not facts:
        return []
    rows: list[DupontComponentRow] = []
    for p in metric_periods(facts):
        c = dupont_components(facts, cik, p["year"], p["period"])
        if c is None:  # missing a leg -> excluded from the aggregate (never zero-filled)
            continue
        rows.append(
            DupontComponentRow(
                cik=cik,
                fiscal_year=p["year"],
                fiscal_period=p["period"],
                period_end=c.period_end,
                net_income=c.net_income,
                revenue=c.revenue,
                avg_assets=c.avg_assets,
                avg_equity=c.avg_equity,
                approximate=c.approximate,
            )
        )
    return rows


def run_dupont_backfill(db_path: str, limit: int | None = None) -> int:
    fact_repo = SQLiteRawFactRepository(db_path)
    comp_repo = SQLiteDupontComponentRepository(db_path)
    try:
        comp_repo.clear()  # full rematerialize -- drop stale rows first
        ciks = sorted(fact_repo.all_ciks())
        if limit is not None:
            ciks = ciks[:limit]
        logger.info("dupont backfill: %d CIKs", len(ciks))
        total = 0
        for i, cik in enumerate(ciks, start=1):
            rows = _rows_for_cik(fact_repo, cik)
            comp_repo.bulk_upsert(rows)
            total += len(rows)
            if i % _PROGRESS_EVERY == 0:
                logger.info("dupont backfill progress: %d/%d (%d rows)", i, len(ciks), total)
        logger.info("dupont backfill done: %d CIKs, %d component rows", len(ciks), total)
        return total
    finally:
        comp_repo.close()
        fact_repo.close()


def build_arg_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(
        description="Materialize per-company DuPont components from raw_facts (no network)."
    )
    p.add_argument("--limit", type=int, default=None, help="Only process the first N CIKs")
    return p


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    args = build_arg_parser().parse_args()
    run_dupont_backfill(settings.secfin_db_path, limit=args.limit)


if __name__ == "__main__":
    main()

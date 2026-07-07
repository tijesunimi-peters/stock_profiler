"""Bulk-ingest cross-company screening data via the SEC "frames" API (Milestone 4).

    for each requested concept:
        for each candidate GAAP tag (mapping.candidate_tags):
            1 HTTP call -> every reporting company's value for that tag, this exact frame
                                  |
                    normalize/screening.facts_from_frame -> RawFact rows
                    (frame=<exact SEC frame string, e.g. "CY2023Q4">)
                                  |
                    RawFactRepository.upsert_raw_facts (existing, idempotent)

Unlike `ingest/backfill.py` (CPU-bound local zip parsing -> multiprocess) or
`ingest/institutional_backfill.py` (thousands of per-manager network round-trips), this
job's total network cost is tiny -- one frames call already returns EVERY reporting
company at once, so the whole run is at most (candidate tags summed across the
requested concepts) HTTP calls. Single async process, no resumability machinery beyond
the existing idempotent upsert: a re-run just re-fetches the same handful of frames and
overwrites in place, which is cheap enough that a checkpoint table would be
over-engineering for this job's actual cost profile (contrast
`ingest/institutional_backfill.py`'s skip-or-refresh accession comparison, justified
there by thousands of per-manager fetches).

Run: `python -m secfin.ingest.frames_backfill --fiscal-year 2023 --fiscal-period FY`
"""

from __future__ import annotations

import argparse
import asyncio
import logging

from secfin.config import settings
from secfin.normalize.mapping import candidate_tags
from secfin.normalize.schema import FiscalPeriod
from secfin.normalize.screening import (
    SCREENABLE_CONCEPTS,
    facts_from_frame,
    frame_period_for_concept,
)
from secfin.sec.client import SECClient
from secfin.sec.frames import fetch_frame
from secfin.storage.repository import RawFactRepository
from secfin.storage.sqlite_repository import SQLiteRawFactRepository

logger = logging.getLogger(__name__)


async def _ingest_concept(
    client: SECClient,
    repo: RawFactRepository,
    concept: str,
    fiscal_year: int,
    fiscal_period: FiscalPeriod,
) -> dict[str, int]:
    """Fetch every candidate tag's frame for one concept, write through to the repo.

    Returns a per-tag {tag: rows_written} tally (0 for a tag with no data at this frame,
    or whose fetch failed -- logged, not fatal to the rest of the run).
    """
    frame_period = frame_period_for_concept(concept, fiscal_year, fiscal_period)
    tally: dict[str, int] = {}
    for tag in candidate_tags(concept):
        try:
            frame_facts = await fetch_frame(client, tag, frame_period)
        except Exception:
            logger.exception(
                "frames fetch failed: concept=%s tag=%s frame=%s", concept, tag, frame_period
            )
            tally[tag] = 0
            continue
        facts = facts_from_frame(concept, tag, frame_period, frame_facts)
        written = repo.upsert_raw_facts(facts) if facts else 0
        tally[tag] = written
        logger.info(
            "frames backfill: concept=%s tag=%s frame=%s -> %d companies",
            concept,
            tag,
            frame_period,
            written,
        )
    return tally


async def run_frames_backfill(
    fiscal_year: int, fiscal_period: FiscalPeriod, concepts: list[str], db_path: str
) -> None:
    repo = SQLiteRawFactRepository(db_path)
    try:
        async with SECClient() as client:
            for concept in concepts:
                if concept not in SCREENABLE_CONCEPTS:
                    logger.warning("skipping non-screenable concept: %s", concept)
                    continue
                await _ingest_concept(client, repo, concept, fiscal_year, fiscal_period)
    finally:
        repo.close()


def build_arg_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(
        description=(
            "Bulk-ingest one fiscal period's cross-company screening data via the SEC "
            "frames API."
        )
    )
    p.add_argument("--fiscal-year", type=int, required=True, help="Calendar year, e.g. 2023")
    p.add_argument("--fiscal-period", default="FY", choices=["FY", "Q1", "Q2", "Q3", "Q4"])
    p.add_argument(
        "--concepts",
        default=None,
        help=(
            "Comma-separated canonical concepts to backfill "
            "(default: all of normalize.screening.SCREENABLE_CONCEPTS)"
        ),
    )
    p.add_argument("--db-path", default=settings.secfin_db_path)
    return p


def main(argv: list[str] | None = None) -> None:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    args = build_arg_parser().parse_args(argv)
    concepts = args.concepts.split(",") if args.concepts else list(SCREENABLE_CONCEPTS)
    asyncio.run(
        run_frames_backfill(args.fiscal_year, args.fiscal_period, concepts, args.db_path)
    )


if __name__ == "__main__":
    main()

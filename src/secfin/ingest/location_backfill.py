"""Backfill `filing_manager_location` onto cached 13F snapshots that predate the column.

The filing manager's business `stateOrCountry` lives on the 13F cover page
(`primary_doc.xml`). Snapshots ingested before `sec/institutional.parse_filing_manager_location`
existed have `filing_manager_location = NULL`, so the holder-geography choropleth shows the
honest "no filer locations to map yet" state for them.

The bulk `ingest/institutional_backfill.py` will NOT repopulate these: it skips a manager+quarter
whose cached accession already matches (which every existing snapshot's does), so it would
re-fetch nothing. This targeted job instead walks the already-cached snapshots for a quarter and,
per snapshot, fetches ONLY the cover page (one throttled request -- no info-table re-fetch or
re-parse of the 50M-row `holdings` table), parses the location, and writes it via
`HoldingsSnapshotRepository.set_filing_manager_location`.

The cover page is the filing's fixed `primary_doc.xml` (unlike the info table, whose filename
varies -- see `sec/institutional.py`). A snapshot whose cover page can't be fetched or carries no
`stateOrCountry` is left NULL (counted, not crashed) -- it stays honestly "unknown" and a later
run can retry it. Uses the ordinary throttled `SECClient` (process-wide rate limiter + compliant
User-Agent); never raises the throttle.

Run: python -m secfin.ingest.location_backfill --period 2026-03-31 --period 2026-06-30
"""

from __future__ import annotations

import argparse
import asyncio
import logging

from secfin.config import settings
from secfin.sec.client import SECClient
from secfin.sec.institutional import parse_filing_manager_location
from secfin.storage.holdings_repository import HoldingsSnapshotRepository
from secfin.storage.sqlite_holdings_repository import SQLiteHoldingsSnapshotRepository

logger = logging.getLogger(__name__)

# The 13F cover page is always this fixed document (the info table's name varies, the cover's
# does not -- see sec/institutional.py's module docstring).
_COVER_DOC = "primary_doc.xml"

_PROGRESS_EVERY = 200


async def _backfill_one(
    client: SECClient,
    repo: HoldingsSnapshotRepository,
    cik: int,
    report_period: str,
    accession: str,
) -> str:
    """Fetch one snapshot's cover page and write its location. Returns "filled",
    "no_location", or "failed" for the caller's tally. One snapshot's failure never stops
    the run (mirrors ingest/institutional_backfill.py's per-candidate isolation)."""
    try:
        cover_url = client.filing_document_url(cik, accession, _COVER_DOC)
        cover_bytes = await client.get_bytes(cover_url)
        location = parse_filing_manager_location(cover_bytes)
    except Exception:
        logger.exception("failed to fetch/parse cover page for CIK %d at %s", cik, report_period)
        return "failed"
    if not location:
        return "no_location"
    repo.set_filing_manager_location(cik, report_period, location)
    return "filled"


async def run_location_backfill(periods: list[str], db_path: str) -> dict[str, int]:
    """Backfill locations for every location-less cached snapshot in each `periods` quarter.

    Returns a tally dict (filled / no_location / failed). Idempotent: a re-run only revisits
    snapshots still missing a location, so re-running after a partial run resumes cleanly.
    """
    repo = SQLiteHoldingsSnapshotRepository(db_path)
    tally = {"filled": 0, "no_location": 0, "failed": 0}
    try:
        async with SECClient() as client:
            for period in periods:
                candidates = repo.snapshots_missing_location(period)
                logger.info(
                    "location backfill %s: %d snapshots missing a location", period, len(candidates)
                )
                for i, (cik, accession) in enumerate(candidates, start=1):
                    outcome = await _backfill_one(client, repo, cik, period, accession)
                    tally[outcome] += 1
                    if i % _PROGRESS_EVERY == 0:
                        logger.info(
                            "location backfill %s progress: %d/%d (%d filled, %d no-location, "
                            "%d failed)",
                            period, i, len(candidates),
                            tally["filled"], tally["no_location"], tally["failed"],
                        )
        logger.info(
            "location backfill done: %d filled, %d no-location, %d failed",
            tally["filled"], tally["no_location"], tally["failed"],
        )
    finally:
        repo.close()
    return tally


def build_arg_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(
        description=(
            "Backfill filing_manager_location onto cached 13F snapshots by fetching only each "
            "filing's cover page (no info-table re-fetch)."
        )
    )
    p.add_argument(
        "--period", required=True, action="append", dest="periods",
        help="Quarter-end to backfill, e.g. 2026-03-31. Repeatable.",
    )
    p.add_argument("--db-path", default=settings.secfin_db_path)
    return p


def main(argv: list[str] | None = None) -> None:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    args = build_arg_parser().parse_args(argv)
    asyncio.run(run_location_backfill(args.periods, args.db_path))


if __name__ == "__main__":
    main()

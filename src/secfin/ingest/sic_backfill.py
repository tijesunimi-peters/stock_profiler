"""Backfill company SIC industry codes into `company_profiles` (Metrics Phase 2).

The SIC code is the peer-grouping axis for peer ranking (analytical/peer_ranks.py). It lives
in the top level of each company's `submissions.json` (`sic`, `sicDescription`, `name`) -- the
same document we already fetch for insider/13F -- so this iterates every CIK with stored facts
and does one throttled `SECClient` fetch each, mirroring `ingest/insider_backfill.py`.

Run: `python -m secfin.ingest.sic_backfill [--limit N]`
"""

from __future__ import annotations

import argparse
import asyncio
import logging

from secfin.config import settings
from secfin.sec.client import SECClient
from secfin.storage.company_profile_repository import CompanyProfile, CompanyProfileRepository
from secfin.storage.sqlite_company_profile_repository import SQLiteCompanyProfileRepository
from secfin.storage.sqlite_repository import SQLiteRawFactRepository

logger = logging.getLogger(__name__)

_PROGRESS_EVERY = 100


async def _process(client: SECClient, repo: CompanyProfileRepository, cik: int) -> str:
    """Fetch + upsert one company's SIC profile. Returns "fetched" or "failed"."""
    try:
        payload = await client.get_json(client.submissions_url(cik))
    except Exception:
        logger.exception("failed to fetch submissions for CIK %d", cik)
        return "failed"
    sic = payload.get("sic") or None
    repo.upsert(
        CompanyProfile(
            cik=cik,
            sic=str(sic) if sic is not None else None,
            sic_description=payload.get("sicDescription") or None,
            name=payload.get("name") or None,
        )
    )
    return "fetched"


async def run_sic_backfill(db_path: str, limit: int | None = None) -> None:
    fact_repo = SQLiteRawFactRepository(db_path)
    try:
        ciks = sorted(fact_repo.all_ciks())
    finally:
        fact_repo.close()
    if limit is not None:
        ciks = ciks[:limit]
    logger.info("sic backfill: %d CIKs", len(ciks))
    if not ciks:
        return

    repo = SQLiteCompanyProfileRepository(db_path)
    tally = {"fetched": 0, "failed": 0}
    try:
        async with SECClient() as client:
            for i, cik in enumerate(ciks, start=1):
                tally[await _process(client, repo, cik)] += 1
                if i % _PROGRESS_EVERY == 0:
                    logger.info("sic backfill progress: %d/%d", i, len(ciks))
        logger.info("sic backfill done: %d fetched, %d failed", tally["fetched"], tally["failed"])
    finally:
        repo.close()


def build_arg_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(description="Backfill company SIC codes from submissions.json.")
    p.add_argument("--limit", type=int, default=None, help="Only process the first N CIKs")
    return p


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    args = build_arg_parser().parse_args()
    asyncio.run(run_sic_backfill(settings.secfin_db_path, limit=args.limit))


if __name__ == "__main__":
    main()

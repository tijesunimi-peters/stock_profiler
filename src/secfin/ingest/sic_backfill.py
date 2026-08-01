"""Backfill SIC industry codes into `company_profiles` (Metrics Phase 2, extended 2026-08-01).

The SIC code is the peer-grouping axis for peer ranking (analytical/peer_ranks.py). It lives
in the top level of each filer's `submissions.json` (`sic`, `sicDescription`, `name`) -- the
same document we already fetch for insider/13F -- so this does one throttled `SECClient` fetch
per CIK, mirroring `ingest/insider_backfill.py`.

TWO POPULATIONS, one table. `company_profiles` is keyed on a bare CIK, not an issuer CIK:

  * **issuers** -- every CIK with stored XBRL facts. The original population, for peer ranking.
  * **13F managers** -- every CIK with a cached holdings snapshot. Managers file no XBRL, so
    they never appear in `RawFactRepository.all_ciks()` and were unreachable before. Their own
    registration carries an SIC just like an issuer's, and it is the ONLY manager
    classification covering the whole register (Schedule 13D/G's cover-page type reaches only
    the filers above 5%). See `normalize/manager_category.py` for what it does and does not
    say -- it is a registration category, NOT a strategy.

`--only issuers|managers` runs one population; the default runs both.

Run: `python -m secfin.ingest.sic_backfill [--limit N] [--only managers]`
"""

from __future__ import annotations

import argparse
import asyncio
import logging

from secfin.config import settings
from secfin.sec.client import SECClient
from secfin.storage.company_profile_repository import CompanyProfile, CompanyProfileRepository
from secfin.storage.sqlite_company_profile_repository import SQLiteCompanyProfileRepository
from secfin.storage.sqlite_holdings_repository import SQLiteHoldingsSnapshotRepository
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


def _issuer_ciks(db_path: str) -> list[int]:
    repo = SQLiteRawFactRepository(db_path)
    try:
        return sorted(repo.all_ciks())
    finally:
        repo.close()


def _manager_ciks(db_path: str) -> list[int]:
    repo = SQLiteHoldingsSnapshotRepository(db_path)
    try:
        return repo.all_manager_ciks()
    finally:
        repo.close()


async def run_sic_backfill(
    db_path: str, limit: int | None = None, only: str | None = None
) -> None:
    ciks: list[int] = []
    if only in (None, "issuers"):
        ciks += _issuer_ciks(db_path)
    if only in (None, "managers"):
        ciks += _manager_ciks(db_path)
    # A CIK can be BOTH -- an issuer that also files 13F (Berkshire is the obvious one). One
    # fetch each, not two.
    ciks = sorted(set(ciks))
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
    p.add_argument(
        "--only",
        choices=("issuers", "managers"),
        default=None,
        help="Restrict to one population (default: both)",
    )
    return p


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    args = build_arg_parser().parse_args()
    asyncio.run(run_sic_backfill(settings.secfin_db_path, limit=args.limit, only=args.only))


if __name__ == "__main__":
    main()

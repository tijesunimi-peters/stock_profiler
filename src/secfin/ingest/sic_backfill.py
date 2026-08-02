"""Backfill SIC industry codes into `company_profiles` (Metrics Phase 2, extended 2026-08-01).

The SIC code is the peer-grouping axis for peer ranking (analytical/peer_ranks.py). It lives
in the top level of each filer's `submissions.json` (`sic`, `sicDescription`, `name`, plus the
cover-page identity fields the company Overview shows) -- the
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

Run: `python -m secfin.ingest.sic_backfill [--limit N] [--only managers] [--cik 320193]`
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


def _earliest_filing_date(payload: dict) -> str | None:
    """The oldest filing EDGAR holds for this filer.

    `filings.recent` is a ROLLING window -- for a prolific filer it covers about a year. The older
    history lives in `filings.files`, each entry carrying `filingFrom`. Reading only the recent
    window would date Apple's first filing to 2015 when EDGAR actually holds it from 1994-01-26.
    An absence over a window is not an absence over history, and this is the same trap §06 was
    built around.
    """
    filings = payload.get("filings") or {}
    candidates = [f.get("filingFrom") for f in (filings.get("files") or []) if f.get("filingFrom")]
    recent = (filings.get("recent") or {}).get("filingDate") or []
    candidates.extend(d for d in recent if d)
    return min(candidates) if candidates else None


def extract_profile(payload: dict, cik: int) -> CompanyProfile:
    """Shape one `/submissions/` payload into a profile row. Pure, so it is testable offline.

    Every field is `or None`: EDGAR writes "" for not-applicable, and an empty string stored as a
    value would render as a blank fact rather than as unknown.
    """
    sic = payload.get("sic") or None
    addresses = payload.get("addresses") or {}
    business = addresses.get("business") or {}
    # DE-DUPLICATED, order preserved. EDGAR lists one entry per REGISTERED SECURITY, not per
    # venue, so a filer with nine registered classes reports "NYSE" nine times -- JPMorgan does
    # exactly that. Joining naively produced "NYSE, NYSE, NYSE, ..." on a cover-page card.
    exchanges = list(dict.fromkeys(e for e in (payload.get("exchanges") or []) if e))
    return CompanyProfile(
        cik=cik,
        sic=str(sic) if sic is not None else None,
        sic_description=payload.get("sicDescription") or None,
        name=payload.get("name") or None,
        state_of_incorporation=payload.get("stateOfIncorporation") or None,
        hq_city=business.get("city") or None,
        hq_state=business.get("stateOrCountry") or None,
        fiscal_year_end=payload.get("fiscalYearEnd") or None,
        filer_category=payload.get("category") or None,
        ein=payload.get("ein") or None,
        exchanges=", ".join(exchanges) or None,
        first_filing_date=_earliest_filing_date(payload),
    )


async def _process(client: SECClient, repo: CompanyProfileRepository, cik: int) -> str:
    """Fetch + upsert one company's profile. Returns "fetched" or "failed"."""
    try:
        payload = await client.get_json(client.submissions_url(cik))
    except Exception:
        logger.exception("failed to fetch submissions for CIK %d", cik)
        return "failed"
    repo.upsert(extract_profile(payload, cik))
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
    db_path: str,
    limit: int | None = None,
    only: str | None = None,
    ciks_arg: list[int] | None = None,
) -> None:
    ciks: list[int] = []
    if ciks_arg:
        # An explicit list skips the population scan entirely. This is the path for re-fetching a
        # named filer -- after new columns are added, say, when `--limit N` would just re-do the N
        # lowest CIKs and leave the company you actually wanted still null.
        ciks = list(ciks_arg)
        limit = None
    else:
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
        "--cik",
        type=int,
        action="append",
        dest="ciks",
        help="Fetch only these CIKs (repeatable). Skips the population scan entirely.",
    )
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
    asyncio.run(
        run_sic_backfill(
            settings.secfin_db_path, limit=args.limit, only=args.only, ciks_arg=args.ciks
        )
    )


if __name__ == "__main__":
    main()

"""Seed the insider-transactions cache for every company we already track financials for.

This is the M3 "ownership cache-warming" item (docs/ROADMAP.md): unlike statements
(`ingest/backfill.py` + `ingest/incremental.py`), the insider-trades cache
(`storage/insider_repository.py`) has never had a batch job feeding it -- it only grows
one company at a time, on a live `GET /companies/{symbol}/insider-trades`. The 13F half
of "ownership cache-warming" was already covered by `ingest/institutional_backfill.py`
(built for M2.5, reused here); this is the insider half.

**Candidate universe, and why it's NOT "every CIK the SEC daily index mentions":**
verified against real EDGAR data (2026-07-06) that a Form 3/4/5 filing's CIK -- per the
SEC daily index, or a filer's own `submissions.json` -- can belong to a REPORTING OWNER
(e.g. a fund's GP entity), not the issuer being reported on. Example: CIK 1972758 ("325
Capital GP, LLC") lists Form 4s in its OWN `filings.recent`, filed *about* some other
company entirely -- keyed under 325 Capital's CIK because it's a co-filer, not the
issuer. `sec/insider.py`'s `fetch_insider_transactions_with_filings` trusts its `cik`
argument as the issuer identity and `InsiderTransactionRepository.upsert_insider_transactions`
stores rows under that same CIK -- walking the daily index naively and fetching every
CIK it mentions would cache real rows under the WRONG `issuer_cik`, corrupting the
cache. So candidates here are restricted to CIKs we already know are real operating
companies: every CIK with at least one companyfacts row in `raw_facts`
(`RawFactRepository.all_ciks()`), unioned with the checkpoint-tracked CIKs from the two
financials sources (`ingest.backfill.SOURCE`, `ingest.incremental.SOURCE`) for good
measure. This also naturally scopes the job to companies this API actually serves
financials for, rather than every SEC filer.

**Why `all_ciks()` preserves the same safety guarantee, not just a superset of
convenience:** `raw_facts` is written by exactly three call sites --
`ingest.backfill` (bulk companyfacts.zip, keyed by issuer CIK), `ingest.incremental`
(per-CIK companyfacts fetch for issuers that just filed a 10-K/10-Q), and the API's
cache-aside path (`api/routes.py`'s `_facts_for_cik`/`_statement_facts_for_cik`,
which resolves a ticker to a CIK via `ticker_cache.py`'s SEC ticker map before ever
fetching companyfacts). None of those three paths is driven by the daily index's
arbitrary filer-CIK list (the thing that can surface a reporting-owner-only entity like
325 Capital GP) -- every one of them fetches *companyfacts* for a CIK already known to
be a real operating company. So a CIK with any `raw_facts` row is just as trustworthy
an issuer as one with a checkpoint row; the two checkpoint sources only fail to cover
CIKs that reached `raw_facts` through the live cache-aside path (e.g. a DB that grew
mainly from on-demand traffic rather than a completed `ingest.backfill` run -- checkpoint
rows would then be sparse or empty even though the company universe is fully
populated). Found and fixed 2026-07-11: exactly that state on the pre-launch DB
(`ingest_checkpoint` had 0 rows, `raw_facts` had 6,736 distinct CIKs from live traffic),
which silently reduced this job's candidate set to nothing.

**Skip-or-refresh, cheap to rerun:** for each candidate, `cached_filing_count(cik) >=
limit` -- the same check `api/routes.py`'s `_insider_transactions_for_cik` uses for a
live cache hit -- skips it; otherwise `fetch_insider_transactions_with_filings` +
`upsert_insider_transactions`, same as the live path.

**Single async process, sequential:** same "don't add processes to go faster -- the
fair-access limit is per-IP" reasoning as `ingest/incremental.py` and
`ingest/institutional_backfill.py`. Cost per candidate is 1 submissions.json fetch, plus
one ownership-XML fetch per matching filing (bounded by `limit`).

**Known, deliberate limitation (documented, not solved here):** once a company reaches
`limit` cached filings, a rerun of this job always skips it -- so this job closes the
"cache starts empty" gap but does not keep an already-warmed company fresh as new
Forms 3/4/5 are filed afterward. Catching new activity for already-seeded companies
needs a daily-index-driven incremental job (the `ingest/incremental.py` pattern,
generalized to insider forms) -- left as later work; see the "Ownership cache-warming"
item in docs/ROADMAP.md.

Run: `python -m secfin.ingest.insider_backfill [--limit 10]`
"""

from __future__ import annotations

import argparse
import asyncio
import logging

from secfin.config import settings
from secfin.ingest.backfill import SOURCE as BULK_SOURCE
from secfin.ingest.incremental import SOURCE as INCREMENTAL_SOURCE
from secfin.sec.client import SECClient
from secfin.sec.insider import fetch_insider_transactions_with_filings
from secfin.storage.insider_repository import InsiderTransactionRepository
from secfin.storage.repository import RawFactRepository
from secfin.storage.sqlite_insider_repository import SQLiteInsiderTransactionRepository
from secfin.storage.sqlite_repository import SQLiteRawFactRepository

logger = logging.getLogger(__name__)

_PROGRESS_EVERY = 100


def known_issuer_ciks(fact_repo: RawFactRepository) -> set[int]:
    """Every CIK we've already ingested companyfacts for, regardless of how it got into
    `raw_facts` -- bulk/incremental checkpoint sources, or the API's cache-aside path.

    This is the safety filter described in the module docstring: only these CIKs are
    trusted to be real issuers, not reporting-owner-only filer entities. `all_ciks()` is
    the primary source (it reflects every CIK actually in `raw_facts`, so it alone is
    sufficient); the two `get_ingested_ciks` calls are unioned in for defense in depth,
    not because they add coverage `all_ciks()` lacks -- see the module docstring for why
    a checkpoint-only universe silently degrades to empty on a DB that reached its
    current state mainly through live cache-aside traffic rather than a completed
    `ingest.backfill` run.
    """
    return (
        fact_repo.all_ciks()
        | fact_repo.get_ingested_ciks(BULK_SOURCE)
        | fact_repo.get_ingested_ciks(INCREMENTAL_SOURCE)
    )


async def _process_candidate(
    client: SECClient, repo: InsiderTransactionRepository, cik: int, limit: int
) -> str:
    """Fetch + upsert one issuer's insider trades unless already warm. Returns
    "fetched", "skipped", or "failed" for the caller's tally."""
    if repo.cached_filing_count(cik) >= limit:
        return "skipped"
    try:
        filings, transactions = await fetch_insider_transactions_with_filings(
            client, cik, limit=limit
        )
    except Exception:
        logger.exception("failed to fetch insider transactions for CIK %d", cik)
        return "failed"
    if filings:
        repo.upsert_insider_transactions(cik, filings, transactions)
    return "fetched"


async def run_insider_backfill(limit: int, db_path: str) -> None:
    fact_repo = SQLiteRawFactRepository(db_path)
    try:
        ciks = sorted(known_issuer_ciks(fact_repo))
    finally:
        fact_repo.close()
    logger.info("insider backfill: %d known issuer CIKs, limit=%d", len(ciks), limit)
    if not ciks:
        return

    repo = SQLiteInsiderTransactionRepository(db_path)
    tally = {"fetched": 0, "skipped": 0, "failed": 0}
    try:
        async with SECClient() as client:
            for i, cik in enumerate(ciks, start=1):
                outcome = await _process_candidate(client, repo, cik, limit)
                tally[outcome] += 1
                if i % _PROGRESS_EVERY == 0:
                    logger.info(
                        "insider backfill progress: %d/%d (%d fetched, %d skipped, %d failed)",
                        i,
                        len(ciks),
                        tally["fetched"],
                        tally["skipped"],
                        tally["failed"],
                    )
        logger.info(
            "insider backfill done: %d fetched, %d skipped (already warm), %d failed",
            tally["fetched"],
            tally["skipped"],
            tally["failed"],
        )
    finally:
        repo.close()


def build_arg_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(
        description=(
            "Seed the insider-transactions cache for every company already ingested for "
            "financials, via live SEC fetches."
        )
    )
    p.add_argument(
        "--limit",
        type=int,
        default=10,
        help="Filings to fetch per issuer, newest first (default: 10).",
    )
    p.add_argument("--db-path", default=settings.secfin_db_path)
    return p


def main(argv: list[str] | None = None) -> None:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    args = build_arg_parser().parse_args(argv)
    asyncio.run(run_insider_backfill(args.limit, args.db_path))


if __name__ == "__main__":
    main()

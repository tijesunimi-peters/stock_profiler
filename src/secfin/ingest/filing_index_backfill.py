"""Populate the generic filing index from `/submissions/`.

    python -m secfin.ingest.filing_index_backfill --symbol AAPL
    python -m secfin.ingest.filing_index_backfill --cik 320193 --cik 19617
    python -m secfin.ingest.filing_index_backfill --all-issuers --limit 500

One throttled request per company, over a payload the read paths already fetch, so this is a
cheap job by this repository's standards -- no document downloads, no XBRL, no zips.

## What it enables

`sec/filing_index.py` explains the boundary (existence and dates, never terms). What this job
adds is the ability to say **"we looked"**: an absence claim on §06's supply card is only honest
once a company's index exists, and `SupplyEvents` returns `status="na"` until it does.

## Why the whole index rather than only the supply forms

Three consumers want different slices of the same walk (D-filing-index, 2026-08-01) -- supply
events, the acceptance-lag histogram, and V3-P3's 8-K item codes. Storing only what one of them
asks for would mean re-fetching the same JSON for the others.

⚠️ `filings.recent` is EDGAR's ROLLING window, so this indexes recent filings, not a company's
whole history. That is why every consumer reports its window. Older filings sit in the extra
files under `filings.files` and are deliberately not read here.
"""

from __future__ import annotations

import argparse
import asyncio

from secfin.config import settings
from secfin.sec.client import SECClient
from secfin.sec.filing_index import fetch_filing_index
from secfin.sec.ticker_cache import TickerCache
from secfin.storage.repository import RawFactRepository
from secfin.storage.sqlite_filing_index_repository import SQLiteFilingIndexRepository
from secfin.storage.sqlite_repository import SQLiteRawFactRepository


async def _resolve(client: SECClient, cache: TickerCache, symbols: list[str]) -> list[int]:
    out: list[int] = []
    for symbol in symbols:
        cik = await cache.resolve(client, symbol)
        if cik is None:
            print(f"  ! {symbol}: no CIK, skipped")
            continue
        out.append(cik)
    return out


async def run(ciks: list[int], db_path: str) -> int:
    """Index each company's recent filings. Returns the number of rows written."""
    repo = SQLiteFilingIndexRepository(db_path)
    written = 0
    try:
        async with SECClient() as client:
            for i, cik in enumerate(ciks, 1):
                try:
                    entries = await fetch_filing_index(client, cik)
                except Exception as e:  # one bad company must not end the run
                    print(f"  ! CIK {cik}: {type(e).__name__}: {e}")
                    continue
                n = repo.upsert_filings(cik, entries)
                written += n
                lo, hi = repo.indexed_window(cik)
                print(f"  [{i}/{len(ciks)}] CIK {cik}: {n} filings indexed ({lo} .. {hi})")
    finally:
        repo.close()
    return written


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--symbol", action="append", default=[], help="ticker (repeatable)")
    ap.add_argument("--cik", action="append", type=int, default=[], help="CIK (repeatable)")
    ap.add_argument(
        "--all-issuers",
        action="store_true",
        help="every CIK with ingested XBRL facts (bounded by --limit)",
    )
    ap.add_argument("--limit", type=int, default=200, help="cap on --all-issuers")
    args = ap.parse_args()

    db_path = settings.secfin_db_path
    ciks: list[int] = list(args.cik)

    if args.symbol:
        async def _r() -> list[int]:
            async with SECClient() as client:
                return await _resolve(client, TickerCache(ttl_seconds=3600), args.symbol)

        ciks.extend(asyncio.run(_r()))

    if args.all_issuers:
        facts: RawFactRepository = SQLiteRawFactRepository(db_path)
        try:
            ciks.extend(facts.all_ciks()[: args.limit])
        finally:
            facts.close()

    ciks = sorted(set(ciks))
    if not ciks:
        ap.error("nothing to do: pass --symbol, --cik or --all-issuers")

    print(f"indexing filings for {len(ciks)} company(ies) -> {db_path}")
    written = asyncio.run(run(ciks, db_path))
    print(f"done: {written} filing rows written")


if __name__ == "__main__":
    main()

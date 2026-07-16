"""Repair fiscal metadata NULLed by the pre-2026-07-16 frames upsert clobber.

Before the COALESCE fix in storage/sqlite_repository.py's _UPSERT_FACT_SQL, a frames
ingest overwrote fiscal_year/fiscal_period/form/filed with NULL on any existing
companyfacts row it collided with (frames rows carry an accession, so collisions are
the norm, not the exception). Statements select facts by (fiscal_year, fiscal_period),
so damaged rows -- including AAPL's FY2025 revenue and net income -- became invisible.

This script finds CIKs that have BOTH null-fy rows and real companyfacts rows (only
those can have been clobbered; frames-only CIKs never had the metadata to lose) and
re-fetches each one's companyfacts, letting the fixed merge-upsert restore the fiscal
fields while preserving the frames' `frame` column.

Run AFTER deploying the upsert fix, or it will re-clobber `frame` instead:
    docker compose run --rm api python scripts/repair_null_fiscal_metadata.py

Idempotent; safe to re-run. Uses the throttled SECClient (one request per CIK).
"""

from __future__ import annotations

import asyncio
import sqlite3

from secfin.config import settings
from secfin.sec.client import SECClient
from secfin.sec.companyfacts import fetch_raw_facts_all
from secfin.storage.sqlite_repository import SQLiteRawFactRepository

_DAMAGED_CIKS_SQL = """
SELECT cik FROM raw_facts
GROUP BY cik
HAVING SUM(fiscal_year IS NULL) > 0 AND SUM(fiscal_year IS NOT NULL) > 0
"""


async def main() -> None:
    conn = sqlite3.connect(settings.secfin_db_path)
    ciks = [row[0] for row in conn.execute(_DAMAGED_CIKS_SQL)]
    conn.close()
    print(f"repairing fiscal metadata for {len(ciks)} CIKs")

    repo = SQLiteRawFactRepository(settings.secfin_db_path)
    repaired = failed = 0
    try:
        async with SECClient() as client:
            for i, cik in enumerate(ciks, 1):
                try:
                    facts = await fetch_raw_facts_all(client, cik)
                except Exception as exc:  # keep going; one CIK's fetch failing is not fatal
                    failed += 1
                    print(f"  FAIL cik {cik}: {exc}")
                    continue
                repo.upsert_raw_facts(facts)
                repaired += 1
                if i % 10 == 0 or i == len(ciks):
                    print(f"  {i}/{len(ciks)} done")
    finally:
        repo.close()
    print(f"repair complete: {repaired} repaired, {failed} failed")


if __name__ == "__main__":
    asyncio.run(main())

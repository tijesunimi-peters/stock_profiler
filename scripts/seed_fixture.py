"""Seed the operational DB with the test fixtures for a self-contained e2e/dev run.

Loads the trimmed AAPL/JPM/WMT companyfacts fixtures (us-gaap + dei) into the RawFact store at
SECFIN_DB_PATH, plus a couple of CUSIP resolutions so /coverage shows a non-empty rate. No
network — everything comes from tests/fixtures/. Used by docker-compose's `e2e` profile before
uvicorn starts; also handy locally: `SECFIN_DB_PATH=./data/e2e.db python scripts/seed_fixture.py`.
"""

from __future__ import annotations

import json
import os
from pathlib import Path

from secfin.sec.companyfacts import flatten_all_taxonomies
from secfin.storage.sqlite_cusip_repository import SQLiteCusipMapRepository
from secfin.storage.sqlite_repository import SQLiteRawFactRepository

FIXTURES = Path(__file__).resolve().parent.parent / "tests" / "fixtures"
COMPANIES = [
    ("aapl_companyfacts.json", 320193),
    ("jpm_companyfacts.json", 19617),
    ("wmt_companyfacts.json", 104169),
]


def main() -> None:
    db_path = os.environ.get("SECFIN_DB_PATH", "./data/e2e.db")
    Path(db_path).parent.mkdir(parents=True, exist_ok=True)

    repo = SQLiteRawFactRepository(db_path)
    try:
        for name, cik in COMPANIES:
            payload = json.loads((FIXTURES / name).read_text())
            facts = flatten_all_taxonomies(payload, cik)
            repo.upsert_raw_facts(facts)
            print(f"seeded {name} (CIK {cik}): {len(facts)} facts")
    finally:
        repo.close()

    # A resolved + an unresolved CUSIP so /coverage shows a real 50% rate rather than "nothing
    # attempted yet".
    cusip = SQLiteCusipMapRepository(db_path)
    try:
        cusip.record_resolved("037833100", 320193, "APPLE INC")
        cusip.record_unresolved("02005N100", "ALLY FINL INC")
    finally:
        cusip.close()
    print(f"seed complete -> {db_path}")


if __name__ == "__main__":
    main()

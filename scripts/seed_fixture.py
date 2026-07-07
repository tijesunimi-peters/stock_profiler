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

from secfin.normalize.schema import InsiderFilingMeta, InsiderTransaction
from secfin.sec.companyfacts import flatten_all_taxonomies
from secfin.storage.sqlite_cusip_repository import SQLiteCusipMapRepository
from secfin.storage.sqlite_insider_repository import SQLiteInsiderTransactionRepository
from secfin.storage.sqlite_repository import SQLiteRawFactRepository

FIXTURES = Path(__file__).resolve().parent.parent / "tests" / "fixtures"
COMPANIES = [
    ("aapl_companyfacts.json", 320193),
    ("jpm_companyfacts.json", 19617),
    ("wmt_companyfacts.json", 104169),
]

# Synthetic insider filers for the demo Insider tab (there's no companyfacts fixture for
# Forms 3/4/5). Plausible but NOT real transactions -- enough to render the tab offline.
_INSIDER_OWNERS = [
    ("Cook Timothy D", "officer: Chief Executive Officer"),
    ("Maestri Luca", "officer: Chief Financial Officer"),
    ("Adams Katherine L", "officer: General Counsel"),
    ("O'Brien Deirdre", "officer: Senior Vice President"),
    ("Levinson Arthur D", "director"),
]
_INSIDER_FILINGS = 26  # >= the Insider tab's default limit so it serves from cache offline


def _seed_insider(db_path: str) -> None:
    from datetime import date, timedelta

    repo = SQLiteInsiderTransactionRepository(db_path)
    filings, txns = [], []
    base = date(2026, 6, 15)
    shares_after = 3_400_000
    for i in range(_INSIDER_FILINGS):
        filed = (base - timedelta(days=i * 24)).isoformat()
        accession = f"0000320193-26-9{i:05d}"
        filings.append(InsiderFilingMeta(accession=accession, filed=filed, form_type="4"))
        owner, rel = _INSIDER_OWNERS[i % len(_INSIDER_OWNERS)]
        disposed = i % 3 != 0  # mostly sales (typical for insiders), some acquisitions
        shares = 5_000 + (i % 5) * 2_500
        shares_after -= shares if disposed else -shares
        txns.append(
            InsiderTransaction(
                issuer_cik=320193,
                issuer_name="Apple Inc.",
                owner_name=owner,
                owner_relationship=rel,
                transaction_date=filed,
                security_title="Common Stock",
                shares=float(shares),
                price_per_share=190.0 + (i % 8) * 5.0,
                acquired_disposed="D" if disposed else "A",
                ownership_type="direct",
                shares_owned_after=float(shares_after),
                form_type="4",
                accession=accession,
                filed=filed,
                is_holding=False,
            )
        )
    try:
        repo.upsert_insider_transactions(320193, filings, txns)
        print(f"seeded insider: {len(filings)} AAPL filings, {len(txns)} transactions")
    finally:
        repo.close()


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

    _seed_insider(db_path)
    print(f"seed complete -> {db_path}")


if __name__ == "__main__":
    main()

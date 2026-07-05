"""Tests for the SQLite insider-transaction repository (no network).

See storage/insider_repository.py for why caching is keyed at filing granularity
rather than per transaction row.
"""

from __future__ import annotations

from secfin.normalize.schema import InsiderFilingMeta, InsiderTransaction
from secfin.storage.sqlite_insider_repository import SQLiteInsiderTransactionRepository

CIK = 320193


def _txn(accession: str, owner_name: str, **overrides) -> InsiderTransaction:
    fields = {
        "issuer_cik": CIK,
        "issuer_name": "Apple Inc.",
        "owner_name": owner_name,
        "owner_relationship": "officer",
        "form_type": "4",
        "filed": "2026-06-01",
        "accession": accession,
        "transaction_date": "2026-06-01",
        "security_title": "Common Stock",
        "shares": 100.0,
        "price_per_share": 200.0,
        "acquired_disposed": "A",
        "ownership_type": "direct",
        "shares_owned_after": 1000.0,
        "is_holding": False,
    }
    fields.update(overrides)
    return InsiderTransaction(**fields)


def test_empty_repo_has_zero_cached_filings():
    repo = SQLiteInsiderTransactionRepository(":memory:")
    assert repo.cached_filing_count(CIK) == 0
    assert repo.get_insider_transactions(CIK, limit=10) == []
    repo.close()


def test_upsert_stores_filing_and_its_rows():
    repo = SQLiteInsiderTransactionRepository(":memory:")
    filings = [InsiderFilingMeta("0001-1", "2026-06-01", "4")]
    rows = [_txn("0001-1", "Newstead Jennifer")]

    written = repo.upsert_insider_transactions(CIK, filings, rows)

    assert written == 1
    assert repo.cached_filing_count(CIK) == 1
    fetched = repo.get_insider_transactions(CIK, limit=10)
    assert len(fetched) == 1
    assert fetched[0].owner_name == "Newstead Jennifer"
    assert fetched[0].accession == "0001-1"
    repo.close()


def test_zero_row_filing_still_counts_as_cached():
    # A filing can legitimately parse to zero InsiderTransaction rows (e.g. a Form 3
    # with no reportable holdings) -- this must still register as "cached" or the cache
    # would never hit for it (see the module docstring).
    repo = SQLiteInsiderTransactionRepository(":memory:")
    filings = [InsiderFilingMeta("0002-1", "2026-06-02", "3")]

    written = repo.upsert_insider_transactions(CIK, filings, [])

    assert written == 0
    assert repo.cached_filing_count(CIK) == 1
    assert repo.get_insider_transactions(CIK, limit=10) == []
    repo.close()


def test_re_upserting_a_known_filing_does_not_duplicate_rows():
    repo = SQLiteInsiderTransactionRepository(":memory:")
    filings = [InsiderFilingMeta("0001-1", "2026-06-01", "4")]
    rows = [_txn("0001-1", "Newstead Jennifer")]
    repo.upsert_insider_transactions(CIK, filings, rows)

    # Re-fetching the same filing (e.g. a wider `limit` request re-pulls it) must not
    # re-insert its rows.
    written_again = repo.upsert_insider_transactions(CIK, filings, rows)

    assert written_again == 0
    assert repo.cached_filing_count(CIK) == 1
    assert len(repo.get_insider_transactions(CIK, limit=10)) == 1
    repo.close()


def test_joint_filer_rows_in_same_filing_are_both_kept():
    # Two rows sharing one accession (a joint Form 4) must both survive -- filing-level
    # dedup only guards against re-storing the SAME filing twice, not against storing
    # multiple real rows within it.
    repo = SQLiteInsiderTransactionRepository(":memory:")
    filings = [InsiderFilingMeta("0003-1", "2026-05-05", "4")]
    rows = [
        _txn("0003-1", "BERKSHIRE HATHAWAY INC"),
        _txn("0003-1", "BUFFETT WARREN E"),
    ]

    written = repo.upsert_insider_transactions(CIK, filings, rows)

    assert written == 2
    assert repo.cached_filing_count(CIK) == 1
    owners = {r.owner_name for r in repo.get_insider_transactions(CIK, limit=10)}
    assert owners == {"BERKSHIRE HATHAWAY INC", "BUFFETT WARREN E"}
    repo.close()


def test_cache_hit_requires_limit_covered_by_cached_filing_count():
    repo = SQLiteInsiderTransactionRepository(":memory:")
    filings = [InsiderFilingMeta(f"000{i}-1", f"2026-06-0{i}", "4") for i in range(1, 4)]
    rows = [_txn(f.accession, "X") for f in filings]
    repo.upsert_insider_transactions(CIK, filings, rows)

    assert repo.cached_filing_count(CIK) == 3
    # A limit within what's cached is answerable from cache...
    assert repo.cached_filing_count(CIK) >= 3
    # ...but the repo itself doesn't refuse a too-large limit; that check is the
    # caller's job (api/routes.py's _insider_transactions_for_cik) -- it just returns
    # everything it has.
    assert len(repo.get_insider_transactions(CIK, limit=50)) == 3
    repo.close()


def test_get_insider_transactions_orders_newest_filing_first():
    repo = SQLiteInsiderTransactionRepository(":memory:")
    filings = [
        InsiderFilingMeta("0001-1", "2026-01-01", "4"),
        InsiderFilingMeta("0002-1", "2026-06-01", "4"),
    ]
    rows = [_txn("0001-1", "Old Filer"), _txn("0002-1", "New Filer")]
    repo.upsert_insider_transactions(CIK, filings, rows)

    fetched = repo.get_insider_transactions(CIK, limit=10)
    assert [r.owner_name for r in fetched] == ["New Filer", "Old Filer"]
    repo.close()


def test_limit_returns_only_the_newest_n_filings_worth_of_rows():
    repo = SQLiteInsiderTransactionRepository(":memory:")
    filings = [
        InsiderFilingMeta("0001-1", "2026-01-01", "4"),
        InsiderFilingMeta("0002-1", "2026-03-01", "4"),
        InsiderFilingMeta("0003-1", "2026-06-01", "4"),
    ]
    rows = [
        _txn("0001-1", "Filer A"),
        _txn("0002-1", "Filer B"),
        _txn("0003-1", "Filer C"),
    ]
    repo.upsert_insider_transactions(CIK, filings, rows)

    fetched = repo.get_insider_transactions(CIK, limit=2)
    assert [r.owner_name for r in fetched] == ["Filer C", "Filer B"]
    repo.close()


def test_different_issuers_are_isolated():
    repo = SQLiteInsiderTransactionRepository(":memory:")
    repo.upsert_insider_transactions(
        CIK, [InsiderFilingMeta("0001-1", "2026-01-01", "4")], [_txn("0001-1", "Apple Filer")]
    )
    other_cik = 789019
    repo.upsert_insider_transactions(
        other_cik,
        [InsiderFilingMeta("0009-1", "2026-01-01", "4")],
        [_txn("0009-1", "MSFT Filer", issuer_cik=other_cik, issuer_name="Microsoft")],
    )

    assert repo.cached_filing_count(CIK) == 1
    assert repo.cached_filing_count(other_cik) == 1
    assert [r.owner_name for r in repo.get_insider_transactions(CIK, limit=10)] == ["Apple Filer"]
    repo.close()

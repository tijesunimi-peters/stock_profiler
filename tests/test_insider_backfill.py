"""Tests for the insider-trades cache-warming job (secfin.ingest.insider_backfill).

Covers `known_issuer_ciks` (the safety filter that keeps this job from ever fetching a
reporting-owner-only CIK -- see the module docstring for why that would corrupt the
cache) and `_process_candidate`'s skip-or-refresh logic, monkeypatched the same way
test_institutional_backfill.py covers the 13F bulk job.
"""

from __future__ import annotations

from secfin.ingest import insider_backfill as backfill_module
from secfin.ingest.backfill import SOURCE as BULK_SOURCE
from secfin.ingest.incremental import SOURCE as INCREMENTAL_SOURCE
from secfin.ingest.insider_backfill import known_issuer_ciks
from secfin.normalize.schema import InsiderFilingMeta, InsiderTransaction
from secfin.storage.sqlite_insider_repository import SQLiteInsiderTransactionRepository
from secfin.storage.sqlite_repository import SQLiteRawFactRepository

AAPL_CIK = 320193
BULK_ONLY_CIK = 1111111
INCREMENTAL_ONLY_CIK = 2222222
REPORTING_OWNER_CIK = 1972758  # never checkpointed as a financials source


def test_known_issuer_ciks_unions_both_financials_sources(tmp_path):
    repo = SQLiteRawFactRepository(tmp_path / "test.db")
    repo.upsert_raw_facts_and_checkpoint([], [(AAPL_CIK, None, 0)], source=BULK_SOURCE)
    repo.upsert_raw_facts_and_checkpoint(
        [], [(INCREMENTAL_ONLY_CIK, None, 0)], source=INCREMENTAL_SOURCE
    )

    ciks = known_issuer_ciks(repo)

    assert ciks == {AAPL_CIK, INCREMENTAL_ONLY_CIK}
    assert REPORTING_OWNER_CIK not in ciks
    repo.close()


def test_known_issuer_ciks_deduplicates_a_cik_seen_via_both_sources(tmp_path):
    repo = SQLiteRawFactRepository(tmp_path / "test.db")
    repo.upsert_raw_facts_and_checkpoint([], [(BULK_ONLY_CIK, None, 0)], source=BULK_SOURCE)
    repo.upsert_raw_facts_and_checkpoint(
        [], [(BULK_ONLY_CIK, None, 0)], source=INCREMENTAL_SOURCE
    )

    assert known_issuer_ciks(repo) == {BULK_ONLY_CIK}
    repo.close()


async def test_process_candidate_fetches_and_upserts_when_cold(monkeypatch):
    filings = [InsiderFilingMeta(accession="0001-1", filed="2026-07-01", form_type="4")]
    transactions = [
        InsiderTransaction(issuer_cik=AAPL_CIK, accession="0001-1", form_type="4")
    ]

    async def _fake_fetch(client, cik, limit):
        assert cik == AAPL_CIK
        assert limit == 10
        return filings, transactions

    monkeypatch.setattr(
        backfill_module, "fetch_insider_transactions_with_filings", _fake_fetch
    )

    repo = SQLiteInsiderTransactionRepository(":memory:")
    outcome = await backfill_module._process_candidate(None, repo, AAPL_CIK, limit=10)

    assert outcome == "fetched"
    assert repo.cached_filing_count(AAPL_CIK) == 1
    repo.close()


async def test_process_candidate_skips_without_fetching_when_already_warm(monkeypatch):
    async def _boom_fetch(*args, **kwargs):
        raise AssertionError("should not fetch when already warm at this limit")

    monkeypatch.setattr(
        backfill_module, "fetch_insider_transactions_with_filings", _boom_fetch
    )

    repo = SQLiteInsiderTransactionRepository(":memory:")
    repo.upsert_insider_transactions(
        AAPL_CIK,
        [InsiderFilingMeta(accession="0001-1", filed="2026-07-01", form_type="4")],
        [],
    )

    outcome = await backfill_module._process_candidate(None, repo, AAPL_CIK, limit=1)

    assert outcome == "skipped"
    repo.close()


async def test_process_candidate_reports_failed_on_fetch_error(monkeypatch):
    async def _raising_fetch(*args, **kwargs):
        raise RuntimeError("SEC unavailable")

    monkeypatch.setattr(
        backfill_module, "fetch_insider_transactions_with_filings", _raising_fetch
    )

    repo = SQLiteInsiderTransactionRepository(":memory:")
    outcome = await backfill_module._process_candidate(None, repo, AAPL_CIK, limit=10)

    assert outcome == "failed"
    assert repo.cached_filing_count(AAPL_CIK) == 0
    repo.close()

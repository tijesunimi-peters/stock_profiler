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
from secfin.normalize.schema import InsiderFilingMeta, InsiderTransaction, RawFact
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


def test_known_issuer_ciks_falls_back_to_raw_facts_when_checkpoint_table_is_empty(
    tmp_path,
):
    """Regression test for the real 2026-07-11 pre-launch bug (docs/product/tracks/
    data.md): a DB whose companies all arrived through the API's cache-aside path
    (`api/routes.py`'s `_facts_for_cik`, which calls `RawFactRepository.upsert_raw_facts`
    directly -- no checkpoint row) has an empty `ingest_checkpoint` table even though
    `raw_facts` is fully populated. Before this fix, `known_issuer_ciks` only looked at
    checkpoints and silently returned the empty set, no-opping the whole backfill with
    no error. It must instead fall back to (here, unioned with) `all_ciks()`.
    """
    repo = SQLiteRawFactRepository(tmp_path / "test.db")
    fact = RawFact(
        cik=AAPL_CIK,
        taxonomy="us-gaap",
        gaap_tag="Assets",
        label="Assets",
        unit="USD",
        value=100,
        instant="2024-09-28",
        fiscal_year=2024,
        fiscal_period="FY",
        form="10-K",
        filed="2024-11-01",
        accession="acc-cache-aside",
    )
    repo.upsert_raw_facts([fact])  # the cache-aside path -- no checkpoint row written

    ciks = known_issuer_ciks(repo)

    assert ciks == {AAPL_CIK}
    repo.close()


def test_known_issuer_ciks_deliberately_includes_frame_only_ciks(tmp_path):
    """Locks in a deliberate decision (docs/product/tracks/data.md, code-track
    follow-up 2026-07-12): unlike `api/routes.py`'s `has_any_facts` (scoped to real
    companyfacts rows for a DIFFERENT reason -- see its docstring), this job's
    candidate universe must still include CIKs known only via frame-derived screening
    rows (`fiscal_year IS NULL`, e.g. PLTR/GME pre-launch). Frame data only ever comes
    from real SEC registrants, so including them is not a mis-attribution risk -- and
    narrowing this job to real-companyfacts-only CIKs would have thrown away a
    real, already-verified 60,744-filing/162,050-transaction result covering 6,315 of
    6,736 known issuers for essentially zero correctness gain.
    """
    repo = SQLiteRawFactRepository(tmp_path / "test.db")
    frame_only_cik = 1321655  # PLTR, frame-only on the real pre-launch DB
    frame_fact = RawFact(
        cik=frame_only_cik,
        taxonomy="us-gaap",
        gaap_tag="Assets",
        label="Assets",
        unit="USD",
        value=100,
        instant="2023-12-31",
        fiscal_year=None,
        fiscal_period=None,
        accession=None,
        frame="CY2023Q4I",
    )
    repo.upsert_raw_facts([frame_fact])

    assert frame_only_cik in known_issuer_ciks(repo)
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


class TestStartAfterResumesAnInterruptedRefresh:
    """`--refresh` has no "already done" state by design, so an interrupted whole-market run
    restarts from zero -- hours of SEC traffic redoing finished work. `--start-after` is what
    makes it resumable, and it is only sound because the candidate walk is SORTED.
    """

    def _repo_with(self, tmp_path, ciks):
        repo = SQLiteRawFactRepository(tmp_path / "resume.db")
        repo.upsert_raw_facts_and_checkpoint(
            [], [(c, None, 0) for c in ciks], source=BULK_SOURCE
        )
        return repo

    async def _visited(self, tmp_path, ciks, **kwargs):
        """Run the job against a stubbed fetch and return the CIKs it actually walked."""
        seen: list[int] = []

        async def _fake_fetch(client, cik, limit):
            seen.append(cik)
            return [], []

        import secfin.ingest.insider_backfill as mod

        repo = self._repo_with(tmp_path, ciks)
        repo.close()

        orig = mod.fetch_insider_transactions_with_filings
        orig_client = mod.SECClient
        mod.fetch_insider_transactions_with_filings = _fake_fetch

        class _NoopClient:
            async def __aenter__(self):
                return self

            async def __aexit__(self, *a):
                return False

        mod.SECClient = _NoopClient
        try:
            await mod.run_insider_backfill(
                limit=10, db_path=str(tmp_path / "resume.db"), refresh=True, **kwargs
            )
        finally:
            mod.fetch_insider_transactions_with_filings = orig
            mod.SECClient = orig_client
        return seen

    async def test_candidates_at_or_below_the_marker_are_skipped(self, tmp_path):
        seen = await self._visited(tmp_path, [100, 200, 300, 400], start_after=200)
        assert seen == [300, 400]

    async def test_the_marker_itself_is_skipped_because_it_was_processed(self, tmp_path):
        """`--start-after 300` means 300 is DONE. Including it would re-fetch a finished issuer
        on every resume, which is the cost the flag exists to avoid."""
        seen = await self._visited(tmp_path, [100, 200, 300, 400], start_after=300)
        assert 300 not in seen

    async def test_omitting_it_walks_everything(self, tmp_path):
        assert await self._visited(tmp_path, [100, 200, 300]) == [100, 200, 300]

    async def test_a_marker_past_the_end_walks_nothing_rather_than_wrapping(self, tmp_path):
        assert await self._visited(tmp_path, [100, 200], start_after=999) == []

    async def test_the_walk_is_ascending_which_is_what_makes_one_cik_sufficient(self, tmp_path):
        """If the order were not sorted, "everything <= N is done" would be false and the flag
        would silently skip unprocessed issuers."""
        seen = await self._visited(tmp_path, [900, 100, 500, 300])
        assert seen == sorted(seen)


class TestStaleOnlyRepairsThePreParserCorpus:
    """`--refresh` is depth-bounded; `--stale-only` is accession-targeted.

    The distinction is not cosmetic. On the 2026-08-11 corpus 5,112 stale filings sat up to
    52 deep across 1,480 issuers, so reaching them with `--refresh --limit 100` costs ~148k
    document fetches where addressing them directly costs ~5k -- hours against minutes at the
    fair-access throttle.
    """

    @staticmethod
    def _stale_row(cik: int, accession: str) -> InsiderTransaction:
        """A row as the PRE-parser wrote it: no transaction_code, no is_derivative."""
        return InsiderTransaction(
            issuer_cik=cik,
            accession=accession,
            form_type="4",
            filed="2025-04-03",
            shares=100.0,
            is_derivative=None,
            transaction_code=None,
        )

    @staticmethod
    def _fresh_row(cik: int, accession: str) -> InsiderTransaction:
        return InsiderTransaction(
            issuer_cik=cik,
            accession=accession,
            form_type="4",
            filed="2025-04-03",
            shares=100.0,
            is_derivative=False,
            transaction_code="S",
        )

    def _seed(self, repo, cik, accession, row):
        repo.upsert_insider_transactions(
            cik,
            [InsiderFilingMeta(accession=accession, filed="2025-04-03", form_type="4")],
            [row],
        )

    def test_stale_accessions_selects_only_rows_the_current_parser_did_not_write(self):
        repo = SQLiteInsiderTransactionRepository(":memory:")
        self._seed(repo, AAPL_CIK, "0001-1", self._stale_row(AAPL_CIK, "0001-1"))
        self._seed(repo, AAPL_CIK, "0001-2", self._fresh_row(AAPL_CIK, "0001-2"))

        assert repo.stale_accessions() == [(AAPL_CIK, "0001-1")]
        repo.close()

    def test_a_form3_holding_is_not_stale_despite_having_no_transaction_code(self):
        """The marker is `is_derivative IS NULL`, NOT a missing transaction_code.

        A Form 3 holding row has no transaction coding element in the XML at all, so keying
        the repair off the code would drag every genuine initial statement into it and
        re-fetch filings that were never stale.
        """
        repo = SQLiteInsiderTransactionRepository(":memory:")
        holding = InsiderTransaction(
            issuer_cik=AAPL_CIK,
            accession="0003-1",
            form_type="3",
            filed="2025-04-03",
            is_holding=True,
            is_derivative=False,
            transaction_code=None,
        )
        self._seed(repo, AAPL_CIK, "0003-1", holding)

        assert repo.stale_accessions() == []
        repo.close()

    async def test_repair_fetches_only_the_stale_accessions_and_replaces_their_rows(
        self, monkeypatch, tmp_path
    ):
        db = str(tmp_path / "stale.db")
        repo = SQLiteInsiderTransactionRepository(db)
        self._seed(repo, AAPL_CIK, "0001-1", self._stale_row(AAPL_CIK, "0001-1"))
        self._seed(repo, AAPL_CIK, "0001-2", self._fresh_row(AAPL_CIK, "0001-2"))
        repo.close()

        asked: list[tuple[int, list[str]]] = []

        async def _fake_fetch(client, cik, accessions):
            asked.append((cik, sorted(accessions)))
            return (
                [InsiderFilingMeta(accession="0001-1", filed="2025-04-03", form_type="4")],
                [self._fresh_row(cik, "0001-1")],
            )

        monkeypatch.setattr(backfill_module, "fetch_insider_filings_by_accession", _fake_fetch)
        monkeypatch.setattr(backfill_module, "SECClient", _NullClient)

        tally = await backfill_module.run_stale_repair(db)

        # It asked for the stale filing ONLY -- never the fresh one sitting beside it.
        assert asked == [(AAPL_CIK, ["0001-1"])]
        assert tally["repaired"] == 1
        assert tally["aged_out"] == 0

        repo = SQLiteInsiderTransactionRepository(db)
        assert repo.stale_accessions() == []
        codes = {
            t.accession: t.transaction_code for t in repo.get_insider_transactions(AAPL_CIK, 10)
        }
        assert codes == {"0001-1": "S", "0001-2": "S"}
        repo.close()

    async def test_a_filing_aged_out_of_the_submissions_window_is_counted_not_claimed(
        self, monkeypatch, tmp_path
    ):
        """EDGAR's recent list is a ROLLING window, so a filing cached long ago can vanish
        from it. Its rows then stay stale forever, and the run must say so rather than report
        a clean sweep."""
        db = str(tmp_path / "aged.db")
        repo = SQLiteInsiderTransactionRepository(db)
        self._seed(repo, AAPL_CIK, "0001-1", self._stale_row(AAPL_CIK, "0001-1"))
        repo.close()

        async def _empty_fetch(client, cik, accessions):
            return [], []

        monkeypatch.setattr(backfill_module, "fetch_insider_filings_by_accession", _empty_fetch)
        monkeypatch.setattr(backfill_module, "SECClient", _NullClient)

        tally = await backfill_module.run_stale_repair(db)

        assert tally["aged_out"] == 1
        assert tally["repaired"] == 0

        repo = SQLiteInsiderTransactionRepository(db)
        assert repo.stale_accessions() == [(AAPL_CIK, "0001-1")]
        repo.close()

    async def test_one_issuer_failing_does_not_abort_the_rest_of_the_repair(
        self, monkeypatch, tmp_path
    ):
        db = str(tmp_path / "partial.db")
        repo = SQLiteInsiderTransactionRepository(db)
        self._seed(repo, 100, "0001-1", self._stale_row(100, "0001-1"))
        self._seed(repo, 200, "0002-1", self._stale_row(200, "0002-1"))
        repo.close()

        async def _flaky_fetch(client, cik, accessions):
            if cik == 100:
                raise RuntimeError("SEC unavailable")
            return (
                [InsiderFilingMeta(accession="0002-1", filed="2025-04-03", form_type="4")],
                [self._fresh_row(cik, "0002-1")],
            )

        monkeypatch.setattr(backfill_module, "fetch_insider_filings_by_accession", _flaky_fetch)
        monkeypatch.setattr(backfill_module, "SECClient", _NullClient)

        tally = await backfill_module.run_stale_repair(db)

        assert tally["failed"] == 1
        assert tally["repaired"] == 1
        repo = SQLiteInsiderTransactionRepository(db)
        assert repo.stale_accessions() == [(100, "0001-1")]
        repo.close()


class _NullClient:
    """Stands in for SECClient so the repair's `async with` needs no network."""

    async def __aenter__(self):
        return self

    async def __aexit__(self, *exc):
        return False

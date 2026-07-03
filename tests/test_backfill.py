"""Tests for the bulk-backfill pure logic and writer batch-flush (no network, no
multiprocessing -- the parser/writer *processes* are thin wrappers around this logic).
"""

from __future__ import annotations

from unittest import mock

from secfin.ingest.backfill import (
    _flush,
    _flush_batch_safely,
    parse_companyfacts_entries,
    pending_entries,
)
from secfin.normalize.schema import RawFact
from secfin.storage.sqlite_repository import SQLiteRawFactRepository


def test_parse_companyfacts_entries_matches_cik_files():
    names = ["CIK0000320193.json", "CIK0000001750.json", "README.txt", "not-a-cik.json"]
    entries = parse_companyfacts_entries(names)
    assert entries == [(320193, "CIK0000320193.json"), (1750, "CIK0000001750.json")]


def test_pending_entries_skips_checkpointed_ciks():
    entries = [(320193, "CIK0000320193.json"), (1750, "CIK0000001750.json")]
    todo = pending_entries(entries, done={320193})
    assert todo == [(1750, "CIK0000001750.json")]


def _fact(cik: int) -> RawFact:
    return RawFact(
        cik=cik,
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
        accession=f"acc-{cik}",
    )


def test_flush_writes_facts_and_checkpoints_in_one_batch(tmp_path):
    repo = SQLiteRawFactRepository(tmp_path / "secfin.db")
    facts = [_fact(1), _fact(2)]
    checkpoints = [(1, "CIK0000000001.json", 1), (2, "CIK0000000002.json", 1)]

    companies, count = _flush(repo, facts, checkpoints)

    assert (companies, count) == (2, 2)
    assert repo.get_ingested_ciks("bulk_companyfacts") == {1, 2}
    assert len(repo.get_raw_facts(1)) == 1
    repo.close()


def test_flush_is_idempotent_on_rerun(tmp_path):
    repo = SQLiteRawFactRepository(tmp_path / "secfin.db")
    facts = [_fact(1)]
    checkpoints = [(1, "CIK0000000001.json", 1)]

    _flush(repo, facts, checkpoints)
    _flush(repo, facts, checkpoints)  # simulates re-running after a crash mid-batch

    assert len(repo.get_raw_facts(1)) == 1
    assert repo.get_ingested_ciks("bulk_companyfacts") == {1}
    repo.close()


def test_flush_empty_batch_is_a_noop(tmp_path):
    repo = SQLiteRawFactRepository(tmp_path / "secfin.db")
    assert _flush(repo, [], []) == (0, 0)
    repo.close()


def test_flush_batch_safely_drops_a_failing_batch_without_raising(tmp_path):
    """Regression: a batch the repository can't write (e.g. a data-quality outlier)
    must not kill the writer process -- it should be logged and dropped so the CIKs in
    it stay un-checkpointed and get retried on the next backfill run.
    """
    repo = SQLiteRawFactRepository(tmp_path / "secfin.db")
    facts = [_fact(1)]
    checkpoints = [(1, "CIK0000000001.json", 1)]

    with mock.patch(
        "secfin.ingest.backfill._flush", side_effect=RuntimeError("simulated write failure")
    ):
        result = _flush_batch_safely(repo, facts, checkpoints)

    assert result == (0, 0)
    assert repo.get_ingested_ciks("bulk_companyfacts") == set()
    repo.close()

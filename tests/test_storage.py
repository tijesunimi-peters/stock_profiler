"""Tests for the SQLite operational store (no network)."""

from __future__ import annotations

import pytest

from secfin.normalize.schema import RawFact
from secfin.storage.sqlite_repository import SQLiteRawFactRepository


def _fact(accession: str, value: float, filed: str, instant: str | None = "2024-09-28") -> RawFact:
    return RawFact(
        cik=320193,
        taxonomy="us-gaap",
        gaap_tag="Assets",
        label="Assets",
        unit="USD",
        value=value,
        instant=instant,
        fiscal_year=2024,
        fiscal_period="FY",
        form="10-K",
        filed=filed,
        accession=accession,
    )


def test_upsert_same_fact_twice_is_one_row(tmp_path):
    repo = SQLiteRawFactRepository(tmp_path / "secfin.db")
    fact = _fact("0000320193-24-000123", 100, "2024-11-01")
    repo.upsert_raw_facts([fact])
    repo.upsert_raw_facts([fact])
    rows = repo.get_raw_facts(320193)
    assert len(rows) == 1
    assert rows[0].value == 100
    repo.close()


def test_restatement_keeps_both_versions(tmp_path):
    repo = SQLiteRawFactRepository(tmp_path / "secfin.db")
    original = _fact("0000320193-24-000123", 90, "2024-11-01")
    restated = _fact("0000320193-25-000045", 97, "2025-02-01")
    repo.upsert_raw_facts([original, restated])
    rows = repo.get_raw_facts(320193)
    assert len(rows) == 2
    assert {r.value for r in rows} == {90, 97}
    repo.close()


def test_instant_facts_round_trip_none_correctly(tmp_path):
    """Instant facts always have period_start/period_end absent -- these must not
    collide with each other under the coalesce-NULL-to-'' upsert key.
    """
    repo = SQLiteRawFactRepository(tmp_path / "secfin.db")
    a = _fact("0000320193-24-000123", 100, "2024-11-01", instant="2024-09-28")
    b = _fact("0000320193-24-000456", 200, "2024-11-01", instant="2023-09-30")
    repo.upsert_raw_facts([a, b])
    rows = repo.get_raw_facts(320193)
    assert len(rows) == 2
    assert all(r.period_start is None and r.period_end is None for r in rows)
    repo.close()


def test_checkpoint_tracks_ingested_ciks(tmp_path):
    repo = SQLiteRawFactRepository(tmp_path / "secfin.db")
    facts = [_fact("0000320193-24-000123", 100, "2024-11-01")]
    repo.upsert_raw_facts_and_checkpoint(
        facts, [(320193, "CIK0000320193.json", 1)], source="bulk_companyfacts"
    )
    assert repo.get_ingested_ciks("bulk_companyfacts") == {320193}
    assert repo.get_ingested_ciks("daily_incremental") == set()
    repo.close()


def test_value_larger_than_sqlite_int64_does_not_crash(tmp_path):
    """Regression: some real XBRL facts report a value outside signed 64-bit range.
    sqlite3's C binding raises a raw OverflowError for these instead of falling back
    to REAL -- storage must downcast rather than let one outlier kill a whole batch.
    """
    repo = SQLiteRawFactRepository(tmp_path / "secfin.db")
    huge = _fact("0000320193-24-000123", 10**25, "2024-11-01")
    repo.upsert_raw_facts([huge])
    rows = repo.get_raw_facts(320193)
    assert len(rows) == 1
    assert rows[0].value == pytest.approx(10**25)
    repo.close()


def test_checkpoint_and_facts_flush_is_idempotent(tmp_path):
    repo = SQLiteRawFactRepository(tmp_path / "secfin.db")
    facts = [_fact("0000320193-24-000123", 100, "2024-11-01")]
    checkpoints = [(320193, "CIK0000320193.json", 1)]
    repo.upsert_raw_facts_and_checkpoint(facts, checkpoints, source="bulk_companyfacts")
    repo.upsert_raw_facts_and_checkpoint(facts, checkpoints, source="bulk_companyfacts")
    assert len(repo.get_raw_facts(320193)) == 1
    assert repo.get_ingested_ciks("bulk_companyfacts") == {320193}
    repo.close()

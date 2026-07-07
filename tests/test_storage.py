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


def _frame_fact(cik: int, gaap_tag: str, value: float, frame: str) -> RawFact:
    return RawFact(
        cik=cik,
        taxonomy="us-gaap",
        gaap_tag=gaap_tag,
        label="Revenue",
        unit="USD",
        value=value,
        period_start="2023-01-01",
        period_end="2023-12-31",
        accession=f"acc-{cik}",
        frame=frame,
    )


def test_screen_filters_by_gaap_tag_and_exact_frame(tmp_path):
    repo = SQLiteRawFactRepository(tmp_path / "secfin.db")
    repo.upsert_raw_facts(
        [
            _frame_fact(1, "Revenues", 100.0, "CY2023"),
            _frame_fact(2, "Revenues", 200.0, "CY2022"),  # different frame -- excluded
            _frame_fact(3, "UnrelatedTag", 300.0, "CY2023"),  # different tag -- excluded
        ]
    )

    rows = repo.screen(["Revenues"], "CY2023")

    assert rows == [(1, "Revenues", 100.0)]
    repo.close()


def test_screen_matches_any_of_several_candidate_tags(tmp_path):
    repo = SQLiteRawFactRepository(tmp_path / "secfin.db")
    repo.upsert_raw_facts(
        [
            _frame_fact(1, "Revenues", 100.0, "CY2023"),
            _frame_fact(2, "SalesRevenueNet", 200.0, "CY2023"),
        ]
    )

    rows = repo.screen(["Revenues", "SalesRevenueNet"], "CY2023")

    assert {(cik, tag, val) for cik, tag, val in rows} == {
        (1, "Revenues", 100.0),
        (2, "SalesRevenueNet", 200.0),
    }
    repo.close()


def test_screen_with_no_tags_returns_empty(tmp_path):
    repo = SQLiteRawFactRepository(tmp_path / "secfin.db")
    assert repo.screen([], "CY2023") == []
    repo.close()

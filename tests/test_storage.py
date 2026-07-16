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


def test_get_raw_facts_for_period_only_returns_the_matching_period(tmp_path):
    repo = SQLiteRawFactRepository(tmp_path / "secfin.db")
    fy2024 = _fact("acc-2024", 100, "2024-11-01")
    fy2023 = RawFact(**{**fy2024.model_dump(), "fiscal_year": 2023, "accession": "acc-2023"})
    repo.upsert_raw_facts([fy2024, fy2023])

    rows = repo.get_raw_facts_for_period(320193, 2024, "FY")

    assert len(rows) == 1
    assert rows[0].fiscal_year == 2024
    repo.close()


def test_has_any_facts_distinguishes_known_from_unknown_companies(tmp_path):
    repo = SQLiteRawFactRepository(tmp_path / "secfin.db")
    repo.upsert_raw_facts([_fact("acc-1", 100, "2024-11-01")])

    assert repo.has_any_facts(320193) is True
    assert repo.has_any_facts(999999) is False
    repo.close()


def test_has_any_facts_returns_false_for_frame_only_rows(tmp_path):
    """Regression test (code-track follow-up, 2026-07-12; docs/product/tracks/data.md):
    a CIK known ONLY via cross-company frame screening (`ingest/frames_backfill.py`,
    `fiscal_year IS NULL` by design -- see `normalize/screening.py`) must NOT satisfy
    `has_any_facts`. Before this fix, PLTR/GME (and 6,719 other frame-only CIKs on the
    real pre-launch DB) satisfied this check, which made the statements cache-aside
    route (`api/routes.py`'s `_statement_facts_for_cik`) treat every period as "known
    company, genuinely empty" and permanently skip the live SEC fallback -- a real user
    got a 404 on every statement request for that company, forever.
    """
    repo = SQLiteRawFactRepository(tmp_path / "secfin.db")
    pltr_cik = 1321655
    repo.upsert_raw_facts([_frame_fact(pltr_cik, "Assets", 100, "CY2023Q4I")])

    assert repo.has_any_facts(pltr_cik) is False
    repo.close()


def test_frames_and_companyfacts_metadata_merge_instead_of_clobbering(tmp_path):
    # Regression (2026-07-16 incident): the same physical fact arrives from
    # companyfacts (has fy/fp/form/filed, no frame) and from the frames API (has
    # frame, none of the fiscal fields), colliding on the upsert key. Each ingest
    # used to NULL the other source's metadata -- the frames backfill erased
    # fiscal_year on 68 CIKs' statement facts, and cache-aside companyfacts fetches
    # erased `frame`, dropping companies from screening. Metadata must MERGE.
    repo = SQLiteRawFactRepository(tmp_path / "t.db")
    base = dict(
        cik=320193, taxonomy="us-gaap", gaap_tag="Assets", label="Assets",
        unit="USD", value=359241000000.0, instant="2025-09-27",
        accession="0000320193-25-000079",
    )
    companyfacts_row = RawFact(
        **base, fiscal_year=2025, fiscal_period="FY", form="10-K", filed="2025-10-31"
    )
    frames_row = RawFact(**base, frame="CY2025Q4I")

    # companyfacts first, frames second (the frames-backfill clobber direction)
    repo.upsert_raw_facts([companyfacts_row])
    repo.upsert_raw_facts([frames_row])
    (fact,) = repo.get_raw_facts(320193)
    assert fact.fiscal_year == 2025
    assert fact.fiscal_period == "FY"
    assert fact.filed == "2025-10-31"
    assert fact.frame == "CY2025Q4I"

    # frames first, companyfacts second (the cache-aside clobber direction)
    repo2 = SQLiteRawFactRepository(tmp_path / "t2.db")
    repo2.upsert_raw_facts([frames_row])
    repo2.upsert_raw_facts([companyfacts_row])
    (fact2,) = repo2.get_raw_facts(320193)
    assert fact2.frame == "CY2025Q4I"
    assert fact2.fiscal_year == 2025
    assert fact2.form == "10-K"

"""Tests for the SQLite 13F holdings-snapshot repository (no network).

See storage/holdings_repository.py for why caching is keyed on (manager_cik,
report_period) rather than per accession, and why resolved CUSIP->CIK is never persisted.
"""

from __future__ import annotations

import sqlite3

from secfin.normalize.schema import HoldingsSnapshot, InstitutionalHolding, OtherManager13F
from secfin.storage.sqlite_holdings_repository import SQLiteHoldingsSnapshotRepository

MANAGER_CIK = 1067983  # Berkshire Hathaway


def _snapshot(period: str, **overrides) -> HoldingsSnapshot:
    fields = {
        "manager_cik": MANAGER_CIK,
        "manager_name": "BERKSHIRE HATHAWAY INC",
        "report_period": period,
        "filed": "2026-05-15",
        "accession": "0001-1",
        "is_amendment": False,
        "holdings": [
            InstitutionalHolding(cusip="037833100", issuer_name="APPLE INC", shares=300_000_000),
        ],
    }
    fields.update(overrides)
    return HoldingsSnapshot(**fields)


def test_empty_repo_is_a_cache_miss():
    repo = SQLiteHoldingsSnapshotRepository(":memory:")
    assert repo.get_snapshot(MANAGER_CIK, "2026-03-31") is None
    repo.close()


def test_upsert_then_get_round_trips_snapshot_and_holdings():
    repo = SQLiteHoldingsSnapshotRepository(":memory:")
    snapshot = _snapshot("2026-03-31")

    repo.upsert_snapshot(snapshot)
    fetched = repo.get_snapshot(MANAGER_CIK, "2026-03-31")

    assert fetched is not None
    assert fetched.manager_cik == MANAGER_CIK
    assert fetched.manager_name == "BERKSHIRE HATHAWAY INC"
    assert fetched.report_period == "2026-03-31"
    assert fetched.filed == "2026-05-15"
    assert fetched.accession == "0001-1"
    assert fetched.is_amendment is False
    assert len(fetched.holdings) == 1
    assert fetched.holdings[0].cusip == "037833100"
    assert fetched.holdings[0].shares == 300_000_000
    repo.close()


def test_resolved_cik_is_never_persisted():
    # cik is deliberately not cached -- resolve_snapshot_cusips must run fresh every
    # read so previously-unresolved CUSIPs get a chance to resolve later.
    repo = SQLiteHoldingsSnapshotRepository(":memory:")
    holding = InstitutionalHolding(cusip="037833100", issuer_name="APPLE INC", cik=320193)
    repo.upsert_snapshot(_snapshot("2026-03-31", holdings=[holding]))

    fetched = repo.get_snapshot(MANAGER_CIK, "2026-03-31")

    assert fetched.holdings[0].cik is None
    repo.close()


def test_different_quarters_are_isolated():
    repo = SQLiteHoldingsSnapshotRepository(":memory:")
    repo.upsert_snapshot(_snapshot("2025-12-31"))
    repo.upsert_snapshot(_snapshot("2026-03-31"))

    assert repo.get_snapshot(MANAGER_CIK, "2025-12-31") is not None
    assert repo.get_snapshot(MANAGER_CIK, "2026-03-31") is not None
    assert repo.get_snapshot(MANAGER_CIK, "2026-06-30") is None
    repo.close()


def test_different_managers_are_isolated():
    repo = SQLiteHoldingsSnapshotRepository(":memory:")
    other_cik = 1364742  # BlackRock
    repo.upsert_snapshot(_snapshot("2026-03-31"))
    repo.upsert_snapshot(_snapshot("2026-03-31", manager_cik=other_cik, manager_name="BLACKROCK"))

    assert repo.get_snapshot(MANAGER_CIK, "2026-03-31").manager_name == "BERKSHIRE HATHAWAY INC"
    assert repo.get_snapshot(other_cik, "2026-03-31").manager_name == "BLACKROCK"
    repo.close()


def test_re_upserting_a_quarter_replaces_its_holdings_wholesale():
    # An amendment (or a future bulk re-ingest) supersedes the whole snapshot -- old
    # holdings rows for that quarter must not linger alongside the new ones.
    repo = SQLiteHoldingsSnapshotRepository(":memory:")
    repo.upsert_snapshot(_snapshot("2026-03-31"))

    amended = _snapshot(
        "2026-03-31",
        accession="0002-1",
        is_amendment=True,
        holdings=[
            InstitutionalHolding(cusip="037833100", issuer_name="APPLE INC", shares=250_000_000),
            InstitutionalHolding(cusip="02079K107", issuer_name="ALPHABET INC", shares=10_000_000),
        ],
    )
    repo.upsert_snapshot(amended)

    fetched = repo.get_snapshot(MANAGER_CIK, "2026-03-31")
    assert fetched.accession == "0002-1"
    assert fetched.is_amendment is True
    assert len(fetched.holdings) == 2
    assert {h.cusip for h in fetched.holdings} == {"037833100", "02079K107"}
    repo.close()


def test_empty_holdings_list_round_trips():
    repo = SQLiteHoldingsSnapshotRepository(":memory:")
    repo.upsert_snapshot(_snapshot("2026-03-31", holdings=[]))

    fetched = repo.get_snapshot(MANAGER_CIK, "2026-03-31")
    assert fetched is not None
    assert fetched.holdings == []
    repo.close()


def test_joint_filer_roster_and_per_holding_attribution_round_trip():
    repo = SQLiteHoldingsSnapshotRepository(":memory:")
    snapshot = _snapshot(
        "2026-03-31",
        holdings=[
            InstitutionalHolding(
                cusip="02005N100", issuer_name="ALLY FINL INC", shares=12_719_675,
                other_managers=[4],
            ),
            InstitutionalHolding(
                cusip="02079K107", issuer_name="ALPHABET INC", shares=3_585_215,
                other_managers=[2, 4, 11],
            ),
            InstitutionalHolding(cusip="037833100", issuer_name="APPLE INC", shares=692_000),
        ],
        other_managers=[
            OtherManager13F(sequence_number=2, name="Columbia Insurance Co", file_number="28-1517"),
            OtherManager13F(sequence_number=4, name="Buffett Warren E", file_number="28-554"),
            OtherManager13F(sequence_number=11, name="National Indemnity Co", file_number="28-718"),
        ],
    )
    repo.upsert_snapshot(snapshot)

    fetched = repo.get_snapshot(MANAGER_CIK, "2026-03-31")

    assert [m.sequence_number for m in fetched.other_managers] == [2, 4, 11]
    assert fetched.other_managers[1].name == "Buffett Warren E"
    by_cusip = {h.cusip: h.other_managers for h in fetched.holdings}
    assert by_cusip["02005N100"] == [4]
    assert by_cusip["02079K107"] == [2, 4, 11]
    assert by_cusip["037833100"] == []  # filing manager alone had discretion
    repo.close()


def test_filing_manager_location_round_trips():
    repo = SQLiteHoldingsSnapshotRepository(":memory:")
    repo.upsert_snapshot(_snapshot("2026-03-31", filing_manager_location="NE"))

    fetched = repo.get_snapshot(MANAGER_CIK, "2026-03-31")
    assert fetched.filing_manager_location == "NE"
    repo.close()


def test_filing_manager_location_defaults_to_none():
    # A snapshot without a parsed location (older cover page) stays None -- surfaced as an
    # honest "unknown" bucket downstream, never assumed domestic.
    repo = SQLiteHoldingsSnapshotRepository(":memory:")
    repo.upsert_snapshot(_snapshot("2026-03-31"))

    assert repo.get_snapshot(MANAGER_CIK, "2026-03-31").filing_manager_location is None
    repo.close()


def test_holders_of_carries_filing_manager_location():
    repo = SQLiteHoldingsSnapshotRepository(":memory:")
    other_cik = 1364742  # BlackRock, no location parsed (older snapshot)
    repo.upsert_snapshot(_snapshot("2026-03-31", filing_manager_location="NE"))
    repo.upsert_snapshot(
        _snapshot(
            "2026-03-31",
            manager_cik=other_cik,
            manager_name="BLACKROCK",
            holdings=[
                InstitutionalHolding(cusip="037833100", issuer_name="APPLE INC", shares=1)
            ],
        )
    )

    by_manager = {h.manager_cik: h.location for h in repo.holders_of(["037833100"], "2026-03-31")}
    assert by_manager[MANAGER_CIK] == "NE"
    assert by_manager[other_cik] is None  # honest unknown, not a guessed state
    repo.close()


def test_migrates_a_pre_location_column_database(tmp_path):
    # A DB created before filing_manager_location existed must gain the column on open
    # (CREATE TABLE IF NOT EXISTS never alters an existing table), with old rows reading
    # back as location=None -- never a crash, never a fabricated location.
    db = str(tmp_path / "old.db")
    conn = sqlite3.connect(db)
    conn.executescript(
        """
        CREATE TABLE holdings_snapshots (
            manager_cik INTEGER NOT NULL, report_period TEXT NOT NULL, manager_name TEXT,
            filed TEXT, accession TEXT NOT NULL DEFAULT '', is_amendment INTEGER NOT NULL DEFAULT 0,
            PRIMARY KEY (manager_cik, report_period)
        );
        INSERT INTO holdings_snapshots (manager_cik, report_period, manager_name)
            VALUES (1067983, '2026-03-31', 'BERKSHIRE HATHAWAY INC');
        """
    )
    conn.close()

    repo = SQLiteHoldingsSnapshotRepository(db)  # runs the guarded ALTER migration
    fetched = repo.get_snapshot(MANAGER_CIK, "2026-03-31")
    assert fetched is not None
    assert fetched.filing_manager_location is None
    # A fresh write on the migrated DB round-trips the new column, and re-opening is a no-op.
    repo.upsert_snapshot(_snapshot("2026-06-30", filing_manager_location="CA"))
    repo.close()
    repo2 = SQLiteHoldingsSnapshotRepository(db)
    assert repo2.get_snapshot(MANAGER_CIK, "2026-06-30").filing_manager_location == "CA"
    repo2.close()


def test_snapshots_missing_location_lists_only_null_locations():
    repo = SQLiteHoldingsSnapshotRepository(":memory:")
    repo.upsert_snapshot(_snapshot("2026-03-31", accession="A-1"))  # no location
    repo.upsert_snapshot(
        _snapshot("2026-03-31", manager_cik=222, accession="A-2", filing_manager_location="NE")
    )

    missing = repo.snapshots_missing_location("2026-03-31")
    assert missing == [(MANAGER_CIK, "A-1")]  # only the location-less one, with its accession
    repo.close()


def test_snapshots_missing_location_excludes_empty_accession():
    # A snapshot with no accession can't have its cover page located, so it's not a candidate.
    repo = SQLiteHoldingsSnapshotRepository(":memory:")
    repo.upsert_snapshot(_snapshot("2026-03-31", accession=""))
    assert repo.snapshots_missing_location("2026-03-31") == []
    repo.close()


def test_set_filing_manager_location_updates_in_place_without_touching_holdings():
    repo = SQLiteHoldingsSnapshotRepository(":memory:")
    repo.upsert_snapshot(_snapshot("2026-03-31"))  # location NULL, one AAPL holding

    repo.set_filing_manager_location(MANAGER_CIK, "2026-03-31", "CA")

    fetched = repo.get_snapshot(MANAGER_CIK, "2026-03-31")
    assert fetched.filing_manager_location == "CA"
    assert len(fetched.holdings) == 1  # holdings untouched by the location-only update
    assert repo.snapshots_missing_location("2026-03-31") == []  # no longer a candidate
    repo.close()


def test_cached_accession_is_none_on_cache_miss():
    repo = SQLiteHoldingsSnapshotRepository(":memory:")
    assert repo.cached_accession(MANAGER_CIK, "2026-03-31") is None
    repo.close()


def test_cached_accession_reflects_latest_upsert_without_loading_holdings():
    repo = SQLiteHoldingsSnapshotRepository(":memory:")
    repo.upsert_snapshot(_snapshot("2026-03-31", accession="0001-1"))
    assert repo.cached_accession(MANAGER_CIK, "2026-03-31") == "0001-1"

    repo.upsert_snapshot(_snapshot("2026-03-31", accession="0002-1", is_amendment=True))
    assert repo.cached_accession(MANAGER_CIK, "2026-03-31") == "0002-1"
    repo.close()


def test_holders_of_returns_all_managers_holding_a_cusip():
    repo = SQLiteHoldingsSnapshotRepository(":memory:")
    other_cik = 1364742  # BlackRock
    repo.upsert_snapshot(_snapshot("2026-03-31"))  # holds 037833100 (APPLE INC)
    repo.upsert_snapshot(
        _snapshot(
            "2026-03-31",
            manager_cik=other_cik,
            manager_name="BLACKROCK",
            holdings=[
                InstitutionalHolding(cusip="037833100", issuer_name="APPLE INC", shares=50_000_000)
            ],
        )
    )

    holders = repo.holders_of(["037833100"], "2026-03-31")

    assert {h.manager_cik for h in holders} == {MANAGER_CIK, other_cik}
    by_manager = {h.manager_name: h.shares for h in holders}
    assert by_manager["BERKSHIRE HATHAWAY INC"] == 300_000_000
    assert by_manager["BLACKROCK"] == 50_000_000
    repo.close()


def test_holders_of_is_empty_for_an_unheld_cusip_or_period():
    repo = SQLiteHoldingsSnapshotRepository(":memory:")
    repo.upsert_snapshot(_snapshot("2026-03-31"))

    assert repo.holders_of(["037833100"], "2026-06-30") == []  # no data that quarter
    assert repo.holders_of(["00000000X"], "2026-03-31") == []  # cusip nobody holds
    assert repo.holders_of([], "2026-03-31") == []  # nothing to look up
    repo.close()


def test_holders_of_filters_to_only_the_requested_cusips():
    repo = SQLiteHoldingsSnapshotRepository(":memory:")
    repo.upsert_snapshot(
        _snapshot(
            "2026-03-31",
            holdings=[
                InstitutionalHolding(cusip="037833100", issuer_name="APPLE INC", shares=1),
                InstitutionalHolding(cusip="02079K107", issuer_name="ALPHABET INC", shares=2),
            ],
        )
    )

    holders = repo.holders_of(["037833100"], "2026-03-31")

    assert len(holders) == 1
    assert holders[0].cusip == "037833100"
    repo.close()


def test_holders_of_carries_other_managers_attribution():
    repo = SQLiteHoldingsSnapshotRepository(":memory:")
    repo.upsert_snapshot(
        _snapshot(
            "2026-03-31",
            holdings=[
                InstitutionalHolding(
                    cusip="037833100", issuer_name="APPLE INC", shares=1, other_managers=[2, 4]
                ),
            ],
        )
    )

    holders = repo.holders_of(["037833100"], "2026-03-31")

    assert holders[0].other_managers == [2, 4]
    repo.close()


def test_re_upserting_replaces_joint_filer_roster_wholesale():
    repo = SQLiteHoldingsSnapshotRepository(":memory:")
    repo.upsert_snapshot(
        _snapshot(
            "2026-03-31",
            other_managers=[OtherManager13F(sequence_number=1, name="Old Co", file_number="1")],
        )
    )
    repo.upsert_snapshot(
        _snapshot(
            "2026-03-31",
            accession="0002-1",
            other_managers=[OtherManager13F(sequence_number=9, name="New Co", file_number="9")],
        )
    )

    fetched = repo.get_snapshot(MANAGER_CIK, "2026-03-31")
    assert [m.name for m in fetched.other_managers] == ["New Co"]
    repo.close()


def test_manager_periods_returns_quarters_newest_first():
    repo = SQLiteHoldingsSnapshotRepository(":memory:")
    repo.upsert_snapshot(_snapshot("2025-12-31"))
    repo.upsert_snapshot(_snapshot("2026-03-31"))
    repo.upsert_snapshot(_snapshot("2025-06-30"))

    assert repo.manager_periods(MANAGER_CIK) == ["2026-03-31", "2025-12-31", "2025-06-30"]
    repo.close()


def test_manager_periods_is_empty_for_an_unseen_manager():
    repo = SQLiteHoldingsSnapshotRepository(":memory:")
    repo.upsert_snapshot(_snapshot("2026-03-31"))

    assert repo.manager_periods(999999) == []  # nothing ingested for this manager
    repo.close()


def test_issuer_periods_is_distinct_across_managers_newest_first():
    repo = SQLiteHoldingsSnapshotRepository(":memory:")
    other_cik = 1364742  # BlackRock, also holding APPLE the same quarter
    repo.upsert_snapshot(_snapshot("2025-12-31"))  # BRK holds 037833100
    repo.upsert_snapshot(_snapshot("2026-03-31"))  # BRK holds 037833100
    repo.upsert_snapshot(
        _snapshot("2026-03-31", manager_cik=other_cik, manager_name="BLACKROCK")
    )  # BlackRock also holds 037833100 in 2026-03-31 -- must not duplicate the period

    assert repo.issuer_periods(["037833100"]) == ["2026-03-31", "2025-12-31"]
    repo.close()


def test_issuer_periods_is_empty_for_an_unheld_cusip_or_no_cusips():
    repo = SQLiteHoldingsSnapshotRepository(":memory:")
    repo.upsert_snapshot(_snapshot("2026-03-31"))

    assert repo.issuer_periods(["00000000X"]) == []  # cusip nobody holds
    assert repo.issuer_periods([]) == []  # nothing to look up
    repo.close()


# ---- manager_cusip_sets (co-holding-network node CUSIP sets) -----------------------------


def _multi_cusip_snapshot(period, *, manager_cik, name, cusips):
    return HoldingsSnapshot(
        manager_cik=manager_cik,
        manager_name=name,
        report_period=period,
        holdings=[InstitutionalHolding(cusip=c, shares=1.0) for c in cusips],
    )


def test_manager_cusip_sets_returns_each_managers_cusips():
    repo = SQLiteHoldingsSnapshotRepository(":memory:")
    repo.upsert_snapshot(
        _multi_cusip_snapshot("2026-03-31", manager_cik=1, name="A", cusips=["x", "y", "z"]))
    repo.upsert_snapshot(
        _multi_cusip_snapshot("2026-03-31", manager_cik=2, name="B", cusips=["x", "w"]))

    sets = repo.manager_cusip_sets([1, 2], "2026-03-31")
    assert sets == {1: {"x", "y", "z"}, 2: {"x", "w"}}
    repo.close()


def test_manager_cusip_sets_is_bounded_quarter_scoped_and_handles_empty():
    repo = SQLiteHoldingsSnapshotRepository(":memory:")
    repo.upsert_snapshot(
        _multi_cusip_snapshot("2025-12-31", manager_cik=1, name="A", cusips=["old"]))
    repo.upsert_snapshot(
        _multi_cusip_snapshot("2026-03-31", manager_cik=1, name="A", cusips=["x", "y"]))
    repo.upsert_snapshot(_multi_cusip_snapshot("2026-03-31", manager_cik=2, name="B", cusips=["z"]))

    # Bounded to the requested managers; a holding in another quarter must not leak in.
    assert repo.manager_cusip_sets([1], "2026-03-31") == {1: {"x", "y"}}
    assert repo.manager_cusip_sets([1, 999], "2026-03-31") == {1: {"x", "y"}}  # absent omitted
    assert repo.manager_cusip_sets([], "2026-03-31") == {}  # nothing to look up
    repo.close()

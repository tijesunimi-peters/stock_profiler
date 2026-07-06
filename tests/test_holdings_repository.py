"""Tests for the SQLite 13F holdings-snapshot repository (no network).

See storage/holdings_repository.py for why caching is keyed on (manager_cik,
report_period) rather than per accession, and why resolved CUSIP->CIK is never persisted.
"""

from __future__ import annotations

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

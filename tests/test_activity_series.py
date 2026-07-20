"""Tests for the DERIVED holder-activity trend: `flows.summarize_activity` and the
`GET /companies/{symbol}/institutional-activity-series` endpoint.

The endpoint diffs each ingested quarter against its PRIOR CALENDAR quarter (the same
`flows.diff_holders` derivation the single-quarter `/institutional-activity` uses) and rolls
each diff up into per-action counts + share inflow/outflow. Same no-network harness as
test_institutional_viz_routes.py: a numeric CIK short-circuits `_cik_from_symbol`, the browser
bypass header passes the gate keyless, and the stores are seeded directly on the app DB path.
"""

from __future__ import annotations

from fastapi.testclient import TestClient

from secfin.config import settings
from secfin.normalize.flows import diff_holders, summarize_activity
from secfin.normalize.schema import HoldingsSnapshot, InstitutionalHolding
from secfin.storage.sqlite_cusip_repository import SQLiteCusipMapRepository
from secfin.storage.sqlite_holdings_repository import SQLiteHoldingsSnapshotRepository

_BROWSER = {"Sec-Fetch-Site": "same-origin"}
_MANAGER_CIK = 1067983
_OTHER_CIK = 1364742
_AAPL_CUSIP = "037833100"
_AAPL_CIK = 320193


def _configure(tmp_path, monkeypatch) -> str:
    db = str(tmp_path / "test.db")
    monkeypatch.setattr(settings, "secfin_db_path", db)
    monkeypatch.setattr(settings, "sec_user_agent", "clearyfi-test test@example.com")
    cusip_repo = SQLiteCusipMapRepository(db)
    cusip_repo.record_resolved(_AAPL_CUSIP, _AAPL_CIK, "APPLE INC")
    cusip_repo.close()
    return db


def _snapshot(period, *, manager_cik, name, shares) -> HoldingsSnapshot:
    return HoldingsSnapshot(
        manager_cik=manager_cik,
        manager_name=name,
        report_period=period,
        holdings=[
            InstitutionalHolding(
                cusip=_AAPL_CUSIP, issuer_name="APPLE INC", shares=shares, value=shares * 10.0
            )
        ],
    )


# ---- summarize_activity (pure helper) ---------------------------------------------------


def _issuer_holder(manager_cik, shares):
    from secfin.normalize.schema import IssuerHolder

    return IssuerHolder(
        manager_cik=manager_cik,
        manager_name=f"M{manager_cik}",
        cusip=_AAPL_CUSIP,
        issuer_name="APPLE INC",
        shares=shares,
    )


def test_summarize_activity_counts_and_flows():
    # current vs prior across four managers: one new, one added, one reduced, one exited.
    prior = [
        _issuer_holder(2, 100),  # -> added (to 150): +50
        _issuer_holder(3, 100),  # -> reduced (to 40): -60
        _issuer_holder(4, 100),  # -> exited (to 0): -100
    ]
    current = [
        _issuer_holder(1, 30),  # new: +30
        _issuer_holder(2, 150),
        _issuer_holder(3, 40),
    ]
    deltas = diff_holders(current, prior, to_period="2026-03-31", from_period="2025-12-31")
    s = summarize_activity(deltas)
    assert (s.new, s.added, s.reduced, s.exited) == (1, 1, 1, 1)
    assert s.inflow_shares == 30 + 50  # new + added
    assert s.outflow_shares == 60 + 100  # |reduced| + |exited|
    assert s.net_shares == s.inflow_shares - s.outflow_shares
    # net equals the sum of all shares_change
    assert s.net_shares == sum(d.shares_change for d in deltas)


def test_summarize_activity_empty_is_all_zero():
    s = summarize_activity([])
    assert (s.new, s.added, s.reduced, s.exited) == (0, 0, 0, 0)
    assert s.inflow_shares == 0 and s.outflow_shares == 0 and s.net_shares == 0


def test_summarize_activity_new_only_has_no_outflow():
    current = [_issuer_holder(1, 30), _issuer_holder(2, 45)]
    deltas = diff_holders(current, [], to_period="2026-03-31", from_period=None)
    s = summarize_activity(deltas)
    assert s.new == 2 and s.added == 0
    assert s.outflow_shares == 0
    assert s.inflow_shares == 75 and s.net_shares == 75


# ---- endpoint ---------------------------------------------------------------------------


def test_activity_series_returns_transitions_oldest_to_newest(tmp_path, monkeypatch):
    db = _configure(tmp_path, monkeypatch)
    repo = SQLiteHoldingsSnapshotRepository(db)
    # Three consecutive calendar quarters -> two derivable transitions.
    repo.upsert_snapshot(_snapshot("2025-09-30", manager_cik=_MANAGER_CIK, name="BRK", shares=100))
    repo.upsert_snapshot(_snapshot("2025-12-31", manager_cik=_MANAGER_CIK, name="BRK", shares=150))
    repo.upsert_snapshot(_snapshot("2026-03-31", manager_cik=_MANAGER_CIK, name="BRK", shares=120))
    repo.close()

    from secfin.api.main import app

    with TestClient(app) as client:
        resp = client.get(
            f"/v1/companies/{_AAPL_CIK}/institutional-activity-series", headers=_BROWSER
        )

    assert resp.status_code == 200
    body = resp.json()
    tx = body["transitions"]
    assert [t["to_period"] for t in tx] == ["2025-12-31", "2026-03-31"]  # oldest -> newest
    # Q4: 100 -> 150 = added; Q1: 150 -> 120 = reduced.
    assert tx[0]["counts"] == {"new": 0, "added": 1, "reduced": 0, "exited": 0}
    assert tx[0]["inflow_shares"] == 50 and tx[0]["net_shares"] == 50
    assert tx[1]["counts"] == {"new": 0, "added": 0, "reduced": 1, "exited": 0}
    assert tx[1]["outflow_shares"] == 30 and tx[1]["net_shares"] == -30
    assert body["caveats"]  # always present


def test_activity_series_counts_match_single_quarter_endpoint(tmp_path, monkeypatch):
    # AC-2 parity: a to-quarter's counts equal /institutional-activity?period=<q> by action.
    db = _configure(tmp_path, monkeypatch)
    repo = SQLiteHoldingsSnapshotRepository(db)
    repo.upsert_snapshot(_snapshot("2025-12-31", manager_cik=_MANAGER_CIK, name="BRK", shares=100))
    repo.upsert_snapshot(_snapshot("2025-12-31", manager_cik=_OTHER_CIK, name="BLK", shares=200))
    repo.upsert_snapshot(_snapshot("2026-03-31", manager_cik=_MANAGER_CIK, name="BRK", shares=140))
    # _OTHER exits (absent in 2026-03-31); a third manager enters new.
    repo.upsert_snapshot(_snapshot("2026-03-31", manager_cik=9999, name="NEW", shares=10))
    repo.close()

    from secfin.api.main import app

    with TestClient(app) as client:
        series = client.get(
            f"/v1/companies/{_AAPL_CIK}/institutional-activity-series", headers=_BROWSER
        ).json()
        single = client.get(
            f"/v1/companies/{_AAPL_CIK}/institutional-activity?period=2026-03-31", headers=_BROWSER
        ).json()

    tx = {t["to_period"]: t for t in series["transitions"]}["2026-03-31"]
    grouped = {"new": 0, "added": 0, "reduced": 0, "exited": 0}
    for a in single["activity"]:
        grouped[a["action"]] += 1
    assert tx["counts"] == grouped


def test_activity_series_omits_quarter_with_uningested_prior(tmp_path, monkeypatch):
    # AC-7: a quarter whose calendar prior wasn't ingested is OMITTED, never a false all-new bar.
    db = _configure(tmp_path, monkeypatch)
    repo = SQLiteHoldingsSnapshotRepository(db)
    # 2025-06-30 and 2025-12-31 ingested, but the quarters between them are NOT.
    repo.upsert_snapshot(_snapshot("2025-06-30", manager_cik=_MANAGER_CIK, name="BRK", shares=100))
    repo.upsert_snapshot(_snapshot("2025-12-31", manager_cik=_MANAGER_CIK, name="BRK", shares=120))
    repo.close()

    from secfin.api.main import app

    with TestClient(app) as client:
        body = client.get(
            f"/v1/companies/{_AAPL_CIK}/institutional-activity-series", headers=_BROWSER
        ).json()

    # 2025-12-31's prior (2025-09-30) is un-ingested, and 2025-06-30's prior (2025-03-31) too.
    # No adjacent ingested pair exists -> no transitions (and NO all-new spike).
    assert body["transitions"] == []


def test_activity_series_single_quarter_is_empty(tmp_path, monkeypatch):
    # AC-8: one ingested quarter -> nothing to diff -> honest empty list, not an error.
    db = _configure(tmp_path, monkeypatch)
    repo = SQLiteHoldingsSnapshotRepository(db)
    repo.upsert_snapshot(_snapshot("2026-03-31", manager_cik=_MANAGER_CIK, name="BRK", shares=100))
    repo.close()

    from secfin.api.main import app

    with TestClient(app) as client:
        resp = client.get(
            f"/v1/companies/{_AAPL_CIK}/institutional-activity-series", headers=_BROWSER
        )

    assert resp.status_code == 200
    assert resp.json()["transitions"] == []
    assert resp.json()["caveats"]


def test_activity_series_respects_quarters_bound(tmp_path, monkeypatch):
    db = _configure(tmp_path, monkeypatch)
    repo = SQLiteHoldingsSnapshotRepository(db)
    for period, shares in (
        ("2025-06-30", 100),
        ("2025-09-30", 110),
        ("2025-12-31", 120),
        ("2026-03-31", 130),
    ):
        repo.upsert_snapshot(_snapshot(period, manager_cik=_MANAGER_CIK, name="BRK", shares=shares))
    repo.close()

    from secfin.api.main import app

    with TestClient(app) as client:
        body = client.get(
            f"/v1/companies/{_AAPL_CIK}/institutional-activity-series?quarters=2", headers=_BROWSER
        ).json()

    # Four ingested quarters => three derivable transitions, capped to the 2 newest.
    assert [t["to_period"] for t in body["transitions"]] == ["2025-12-31", "2026-03-31"]

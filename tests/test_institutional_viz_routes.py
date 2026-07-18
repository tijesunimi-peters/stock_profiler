"""Route-level tests for the two Phase-1 institutional-viz endpoints (no network).

`GET /companies/{symbol}/institutional-holdings-series` (accumulation axis) and
`GET /companies/{symbol}/institutional-holder-geography` (choropleth) -- both read live from
the operational store the same way `/institutional-holders` does. Same harness as
test_institutional_periods_routes.py: a numeric CIK as the symbol short-circuits
`_cik_from_symbol`, the browser bypass header passes the gate keyless, and the stores are
seeded directly on the app DB path -- nothing here touches the network.
"""

from __future__ import annotations

from fastapi.testclient import TestClient

from secfin.config import settings
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


def _snapshot(period, *, manager_cik, name, shares, location=None) -> HoldingsSnapshot:
    return HoldingsSnapshot(
        manager_cik=manager_cik,
        manager_name=name,
        report_period=period,
        filing_manager_location=location,
        holdings=[
            InstitutionalHolding(
                cusip=_AAPL_CUSIP, issuer_name="APPLE INC", shares=shares, value=shares * 10.0
            )
        ],
    )


# ---- accumulation series ----------------------------------------------------------------


def test_holdings_series_returns_points_per_manager_across_quarters(tmp_path, monkeypatch):
    db = _configure(tmp_path, monkeypatch)
    repo = SQLiteHoldingsSnapshotRepository(db)
    repo.upsert_snapshot(_snapshot("2025-12-31", manager_cik=_MANAGER_CIK, name="BRK", shares=320))
    repo.upsert_snapshot(_snapshot("2026-03-31", manager_cik=_MANAGER_CIK, name="BRK", shares=300))
    repo.close()

    from secfin.api.main import app

    with TestClient(app) as client:
        resp = client.get(
            f"/v1/companies/{_AAPL_CIK}/institutional-holdings-series", headers=_BROWSER
        )

    assert resp.status_code == 200
    body = resp.json()
    assert body["periods"] == ["2026-03-31", "2025-12-31"]  # newest-first axis
    assert len(body["series"]) == 1
    entry = body["series"][0]
    assert entry["manager_cik"] == _MANAGER_CIK
    by_period = {p["period"]: p["shares"] for p in entry["points"]}
    assert by_period == {"2026-03-31": 300, "2025-12-31": 320}
    assert body["caveats"]  # standing + series-specific caveats always present


def test_holdings_series_leaves_a_gap_for_a_quarter_a_holder_is_absent(tmp_path, monkeypatch):
    # A holder present in only one quarter has a point ONLY for that quarter -- no zero point
    # implying a full exit (honesty: missing != zero).
    db = _configure(tmp_path, monkeypatch)
    repo = SQLiteHoldingsSnapshotRepository(db)
    repo.upsert_snapshot(_snapshot("2025-12-31", manager_cik=_MANAGER_CIK, name="BRK", shares=320))
    repo.upsert_snapshot(_snapshot("2026-03-31", manager_cik=_MANAGER_CIK, name="BRK", shares=300))
    repo.upsert_snapshot(_snapshot("2026-03-31", manager_cik=_OTHER_CIK, name="BLK", shares=50))
    repo.close()

    from secfin.api.main import app

    with TestClient(app) as client:
        resp = client.get(
            f"/v1/companies/{_AAPL_CIK}/institutional-holdings-series", headers=_BROWSER
        )

    series = {e["manager_cik"]: e for e in resp.json()["series"]}
    # Only the one quarter it was present -- no zero point implying a full exit.
    assert [p["period"] for p in series[_OTHER_CIK]["points"]] == ["2026-03-31"]


def test_holdings_series_quarters_bound_is_respected(tmp_path, monkeypatch):
    db = _configure(tmp_path, monkeypatch)
    repo = SQLiteHoldingsSnapshotRepository(db)
    for period in ("2025-09-30", "2025-12-31", "2026-03-31"):
        repo.upsert_snapshot(_snapshot(period, manager_cik=_MANAGER_CIK, name="BRK", shares=1))
    repo.close()

    from secfin.api.main import app

    with TestClient(app) as client:
        resp = client.get(
            f"/v1/companies/{_AAPL_CIK}/institutional-holdings-series?quarters=2", headers=_BROWSER
        )

    assert resp.json()["periods"] == ["2026-03-31", "2025-12-31"]  # capped to 2 newest


# ---- holder geography -------------------------------------------------------------------


def test_geography_buckets_holders_by_location(tmp_path, monkeypatch):
    db = _configure(tmp_path, monkeypatch)
    repo = SQLiteHoldingsSnapshotRepository(db)
    repo.upsert_snapshot(
        _snapshot("2026-03-31", manager_cik=_MANAGER_CIK, name="BRK", shares=300, location="NE")
    )
    repo.upsert_snapshot(
        _snapshot("2026-03-31", manager_cik=_OTHER_CIK, name="BLK", shares=50, location="L2")
    )
    repo.upsert_snapshot(
        _snapshot("2026-03-31", manager_cik=999, name="UNKNOWN CO", shares=10, location=None)
    )
    repo.close()

    from secfin.api.main import app

    with TestClient(app) as client:
        resp = client.get(
            f"/v1/companies/{_AAPL_CIK}/institutional-holder-geography?period=2026-03-31",
            headers=_BROWSER,
        )

    assert resp.status_code == 200
    body = resp.json()
    assert body["by_state"] == [{"state": "NE", "filer_count": 1, "value": 3000.0}]
    assert body["outside_states"] == {"filer_count": 1, "value": 500.0}
    assert body["unknown"] == {"filer_count": 1, "value": 100.0}
    assert body["caveats"]


def test_geography_all_unknown_when_no_holder_has_location(tmp_path, monkeypatch):
    # The DEFAULT for real data before a location backfill: holders exist but none has a
    # location. by_state must be EMPTY (nothing to map) while unknown carries the filers -- the
    # precondition the UI uses to show an honest empty state instead of a blank map (round-3 fix).
    db = _configure(tmp_path, monkeypatch)
    repo = SQLiteHoldingsSnapshotRepository(db)
    repo.upsert_snapshot(
        _snapshot("2026-03-31", manager_cik=_MANAGER_CIK, name="BRK", shares=300, location=None)
    )
    repo.upsert_snapshot(
        _snapshot("2026-03-31", manager_cik=_OTHER_CIK, name="BLK", shares=50, location=None)
    )
    repo.close()

    from secfin.api.main import app

    with TestClient(app) as client:
        resp = client.get(
            f"/v1/companies/{_AAPL_CIK}/institutional-holder-geography?period=2026-03-31",
            headers=_BROWSER,
        )

    body = resp.json()
    assert body["by_state"] == []  # nothing mappable -> UI shows the empty state, not a blank map
    assert body["unknown"]["filer_count"] == 2  # both filers surfaced, never dropped
    assert body["outside_states"]["filer_count"] == 0


def test_geography_is_empty_buckets_not_error_for_an_uningested_quarter(tmp_path, monkeypatch):
    db = _configure(tmp_path, monkeypatch)
    repo = SQLiteHoldingsSnapshotRepository(db)
    repo.upsert_snapshot(
        _snapshot("2026-03-31", manager_cik=_MANAGER_CIK, name="BRK", shares=1, location="NE")
    )
    repo.close()

    from secfin.api.main import app

    with TestClient(app) as client:
        resp = client.get(
            f"/v1/companies/{_AAPL_CIK}/institutional-holder-geography?period=2026-06-30",
            headers=_BROWSER,
        )

    assert resp.status_code == 200
    body = resp.json()
    assert body["by_state"] == []
    assert body["outside_states"]["filer_count"] == 0
    assert body["unknown"]["filer_count"] == 0

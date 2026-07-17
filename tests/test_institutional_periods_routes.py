"""Route-level tests for the two 13F periods-axis endpoints (no network).

`GET /companies/{symbol}/institutional-periods` (issuer axis) and
`GET /managers/{manager_cik}/periods` (manager axis) unblock the Institutional tab and the
Manager profile page's quarter selectors -- see docs/ROADMAP_UI.md Phase 2. Both live on the
gated `router`, so the requests carry the first-party browser bypass header (same as our own
pages) to pass the gate keyless. A numeric CIK is used as the symbol so `_cik_from_symbol`
short-circuits without a ticker/SEC lookup, and the holdings/cusip stores are seeded directly
on the app's DB path -- nothing here touches the network.
"""

from __future__ import annotations

from fastapi.testclient import TestClient

from secfin.config import settings
from secfin.normalize.schema import HoldingsSnapshot, InstitutionalHolding
from secfin.storage.sqlite_cusip_repository import SQLiteCusipMapRepository
from secfin.storage.sqlite_holdings_repository import SQLiteHoldingsSnapshotRepository

# First-party bypass: our own pages fetch same-origin, so gated routes render keyless.
_BROWSER = {"Sec-Fetch-Site": "same-origin"}
_MANAGER_CIK = 1067983
_AAPL_CUSIP = "037833100"
_AAPL_CIK = 320193


def _snapshot(period: str, *, manager_cik: int = _MANAGER_CIK) -> HoldingsSnapshot:
    return HoldingsSnapshot(
        manager_cik=manager_cik,
        manager_name="BERKSHIRE HATHAWAY INC",
        report_period=period,
        holdings=[
            InstitutionalHolding(cusip=_AAPL_CUSIP, issuer_name="APPLE INC", shares=100.0)
        ],
    )


def _configure(tmp_path, monkeypatch) -> str:
    """Point the app at a tmp DB and give it a valid User-Agent (SECClient refuses to
    construct with the unset default, even though these routes make no SEC call)."""
    db = str(tmp_path / "test.db")
    monkeypatch.setattr(settings, "secfin_db_path", db)
    monkeypatch.setattr(settings, "sec_user_agent", "clearyfi-test test@example.com")
    return db


def _seed_holdings(db: str, periods: list[str]) -> None:
    repo = SQLiteHoldingsSnapshotRepository(db)
    for period in periods:
        repo.upsert_snapshot(_snapshot(period))
    repo.close()


def test_manager_periods_lists_ingested_quarters_newest_first(tmp_path, monkeypatch):
    db = _configure(tmp_path, monkeypatch)
    _seed_holdings(db, ["2025-12-31", "2026-03-31"])

    from secfin.api.main import app

    with TestClient(app) as client:
        resp = client.get(f"/v1/managers/{_MANAGER_CIK}/periods", headers=_BROWSER)

    assert resp.status_code == 200
    body = resp.json()
    assert body["manager_cik"] == _MANAGER_CIK
    assert body["periods"] == ["2026-03-31", "2025-12-31"]
    assert body["caveats"]  # standing 13F caveats are always present


def test_manager_periods_is_empty_not_404_when_nothing_ingested(tmp_path, monkeypatch):
    _configure(tmp_path, monkeypatch)

    from secfin.api.main import app

    with TestClient(app) as client:
        resp = client.get(f"/v1/managers/{_MANAGER_CIK}/periods", headers=_BROWSER)

    assert resp.status_code == 200
    assert resp.json()["periods"] == []  # nothing ingested != the manager never filed


def test_manager_periods_requires_a_key_without_the_browser_bypass(tmp_path, monkeypatch):
    _configure(tmp_path, monkeypatch)

    from secfin.api.main import app

    with TestClient(app) as client:
        resp = client.get(f"/v1/managers/{_MANAGER_CIK}/periods")  # no key, no browser header

    assert resp.status_code == 401


def test_institutional_periods_lists_quarters_for_an_issuer(tmp_path, monkeypatch):
    db = _configure(tmp_path, monkeypatch)
    cusip_repo = SQLiteCusipMapRepository(db)
    cusip_repo.record_resolved(_AAPL_CUSIP, _AAPL_CIK, "APPLE INC")
    cusip_repo.close()
    _seed_holdings(db, ["2025-12-31", "2026-03-31"])

    from secfin.api.main import app

    with TestClient(app) as client:
        # Numeric CIK as the symbol -> _cik_from_symbol short-circuits, no ticker lookup.
        resp = client.get(f"/v1/companies/{_AAPL_CIK}/institutional-periods", headers=_BROWSER)

    assert resp.status_code == 200
    body = resp.json()
    assert body["cik"] == _AAPL_CIK
    assert body["cusips"] == [_AAPL_CUSIP]
    assert body["periods"] == ["2026-03-31", "2025-12-31"]
    assert body["caveats"]


def test_institutional_periods_404_when_no_cusip_resolved(tmp_path, monkeypatch):
    # Without a resolved CUSIP for the issuer, there's nothing to look holders up by --
    # _cusips_for_issuer 404s (same behavior as /institutional-holders).
    _configure(tmp_path, monkeypatch)

    from secfin.api.main import app

    with TestClient(app) as client:
        resp = client.get(f"/v1/companies/{_AAPL_CIK}/institutional-periods", headers=_BROWSER)

    assert resp.status_code == 404

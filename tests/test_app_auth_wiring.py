"""End-to-end check of the auth wiring across api/main.py's three router inclusions
(public_router, signup_router, router+require_api_key) -- the one thing the
function-level unit tests in test_auth.py / test_auth_routes.py can't verify, since they
call handlers directly rather than going through FastAPI's dependency injection and
routing. No real SEC network calls: `fetch_raw_facts` is monkeypatched, and the
gated-endpoint checks never reach the endpoint body at all (require_api_key rejects
first), so nothing here needs a real ticker/CIK lookup.
"""

from __future__ import annotations

from fastapi.testclient import TestClient

from secfin.api import routes as routes_module
from secfin.config import settings


def _client(tmp_path, monkeypatch) -> TestClient:
    monkeypatch.setattr(settings, "secfin_db_path", str(tmp_path / "test.db"))
    monkeypatch.setattr(routes_module, "fetch_raw_facts", _fake_fetch_raw_facts)
    monkeypatch.setattr(
        routes_module, "fetch_insider_transactions_with_filings", _fake_fetch_insider
    )
    from secfin.api.main import app

    return TestClient(app)


async def _fake_fetch_raw_facts(client, cik):
    return []


async def _fake_fetch_insider(client, cik, limit):
    return [], []


def test_gated_endpoint_requires_an_api_key(tmp_path, monkeypatch):
    with _client(tmp_path, monkeypatch) as client:
        resp = client.get("/v1/companies/AAPL/insider-trades")
    assert resp.status_code == 401


def test_public_endpoint_works_without_a_key(tmp_path, monkeypatch):
    with _client(tmp_path, monkeypatch) as client:
        resp = client.get("/v1/companies/AAPL/periods")
    assert resp.status_code == 200
    assert resp.json() == {"cik": 320193, "periods": []}


def test_signup_then_use_key_on_a_gated_endpoint(tmp_path, monkeypatch):
    with _client(tmp_path, monkeypatch) as client:
        signup_resp = client.post("/v1/signup", json={"email": "a@example.com"})
        assert signup_resp.status_code == 200
        api_key = signup_resp.json()["api_key"]

        resp = client.get(
            "/v1/companies/320193/insider-trades", headers={"X-API-Key": api_key}
        )
        # No longer 401 -- the key is valid. (May still hit real logic downstream; the
        # point here is only that auth itself let the request through.)
        assert resp.status_code != 401


def test_signup_rejects_duplicate_email(tmp_path, monkeypatch):
    with _client(tmp_path, monkeypatch) as client:
        first = client.post("/v1/signup", json={"email": "dup@example.com"})
        assert first.status_code == 200
        second = client.post("/v1/signup", json={"email": "dup@example.com"})
        assert second.status_code == 409

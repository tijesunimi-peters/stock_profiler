"""Pre-launch checklist: "what does a mid-request SEC 403/throttle error do to the
client-facing response?" No real SEC calls -- `fetch_raw_facts_all` is monkeypatched to
raise, simulating an upstream error during a genuine cache miss (same
TestClient-with-monkeypatched-fetch shape as test_app_auth_wiring.py).
`raise_server_exceptions=False` so TestClient behaves like a real client would -- an
unhandled exception becomes whatever status code Starlette's exception handling
produces, not a re-raised Python exception in the test.

Regression coverage for a real finding (2026-07-07): before api/main.py's
`_handle_upstream_http_error`/`_handle_upstream_transport_error`, both scenarios below
surfaced as a bare 500 "Internal Server Error" -- safe (nothing leaked) but wrong (tells
the caller WE are broken, when the real cause is upstream, and gives no actionable
retry signal).
"""

from __future__ import annotations

import httpx
from fastapi.testclient import TestClient

from secfin.api import routes as routes_module
from secfin.config import settings


def _client(tmp_path, monkeypatch, exc: Exception) -> TestClient:
    monkeypatch.setattr(settings, "secfin_db_path", str(tmp_path / "test.db"))

    async def _boom(client, cik):
        raise exc

    monkeypatch.setattr(routes_module, "fetch_raw_facts_all", _boom)
    from secfin.api.main import app

    return TestClient(app, raise_server_exceptions=False)


def _http_status_error(status_code: int) -> httpx.HTTPStatusError:
    req = httpx.Request("GET", "https://data.sec.gov/api/xbrl/companyfacts/CIK0000320193.json")
    resp = httpx.Response(status_code, request=req)
    return httpx.HTTPStatusError(f"{status_code}", request=req, response=resp)


def test_upstream_http_error_becomes_a_502_not_a_bare_500(tmp_path, monkeypatch):
    with _client(tmp_path, monkeypatch, _http_status_error(403)) as client:
        resp = client.get("/v1/companies/320193/statements/income?year=2023")
    assert resp.status_code == 502
    assert "SEC" in resp.json()["detail"]
    assert "403" in resp.json()["detail"]


def test_upstream_timeout_becomes_a_503_not_a_bare_500(tmp_path, monkeypatch):
    with _client(tmp_path, monkeypatch, httpx.ConnectTimeout("timed out")) as client:
        resp = client.get("/v1/companies/320193/statements/income?year=2023")
    assert resp.status_code == 503
    assert "SEC" in resp.json()["detail"]


def test_upstream_error_handling_applies_across_gated_endpoints_too(tmp_path, monkeypatch):
    """Not just /statements -- the handler is global (api/main.py), so a cache miss on
    any cache-aside endpoint gets the same translation.
    """
    monkeypatch.setattr(settings, "secfin_db_path", str(tmp_path / "test.db"))

    async def _boom(client, cik, limit):
        raise _http_status_error(500)

    monkeypatch.setattr(routes_module, "fetch_beneficial_ownership_with_filings", _boom)
    from secfin.api.main import app

    with TestClient(app, raise_server_exceptions=False) as client:
        signup = client.post("/v1/signup", json={"email": "upstream-err@example.com"})
        api_key = signup.json()["api_key"]
        resp = client.get(
            "/v1/companies/320193/beneficial-ownership", headers={"X-API-Key": api_key}
        )
    assert resp.status_code == 502

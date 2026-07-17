"""End-to-end check of the auth wiring across api/main.py's three router inclusions
(public_router, signup_router, router+require_api_key) -- the one thing the
function-level unit tests in test_auth.py / test_auth_routes.py can't verify, since they
call handlers directly rather than going through FastAPI's dependency injection and
routing. No real SEC network calls: `fetch_raw_facts_all` is monkeypatched, and the
gated-endpoint checks never reach the endpoint body at all (require_api_key rejects
first), so nothing here needs a real ticker/CIK lookup.
"""

from __future__ import annotations

from fastapi.testclient import TestClient

from secfin.api import routes as routes_module
from secfin.config import settings


def _client(tmp_path, monkeypatch) -> TestClient:
    monkeypatch.setattr(settings, "secfin_db_path", str(tmp_path / "test.db"))
    monkeypatch.setattr(routes_module, "fetch_raw_facts_all", _fake_fetch_raw_facts)
    monkeypatch.setattr(
        routes_module, "fetch_beneficial_ownership_with_filings", _fake_fetch_beneficial_ownership
    )
    from secfin.api.main import app

    return TestClient(app)


async def _fake_fetch_raw_facts(client, cik):
    return []


async def _fake_fetch_beneficial_ownership(client, cik, limit):
    return [], []


def test_gated_endpoint_requires_an_api_key(tmp_path, monkeypatch):
    with _client(tmp_path, monkeypatch) as client:
        resp = client.get("/v1/companies/AAPL/beneficial-ownership")
    assert resp.status_code == 401


def test_public_endpoint_works_without_a_key(tmp_path, monkeypatch):
    with _client(tmp_path, monkeypatch) as client:
        resp = client.get("/v1/companies/AAPL/periods")
    assert resp.status_code == 200
    assert resp.json() == {"cik": 320193, "periods": []}


def test_first_party_browser_request_bypasses_the_gate(tmp_path, monkeypatch):
    # Our own web pages fetch same-origin -- ungated for now, no key needed.
    with _client(tmp_path, monkeypatch) as client:
        resp = client.get(
            "/v1/companies/AAPL/beneficial-ownership",
            headers={"Sec-Fetch-Site": "same-origin"},
        )
    assert resp.status_code != 401


def test_usage_still_requires_a_key_even_from_a_browser(tmp_path, monkeypatch):
    # Account endpoints have no identity without a key -- the first-party bypass must not
    # let /usage through keyless.
    with _client(tmp_path, monkeypatch) as client:
        resp = client.get("/v1/usage", headers={"Sec-Fetch-Site": "same-origin"})
    assert resp.status_code == 401


def test_signup_then_use_key_on_a_gated_endpoint(tmp_path, monkeypatch):
    with _client(tmp_path, monkeypatch) as client:
        signup_resp = client.post("/v1/signup", json={"email": "a@example.com"})
        assert signup_resp.status_code == 200
        api_key = signup_resp.json()["api_key"]

        resp = client.get(
            "/v1/companies/320193/beneficial-ownership", headers={"X-API-Key": api_key}
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


def test_admin_tier_change_is_503_when_admin_secret_unconfigured(tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "secfin_admin_secret", "")
    with _client(tmp_path, monkeypatch) as client:
        client.post("/v1/signup", json={"email": "a@example.com"})
        resp = client.post(
            "/v1/admin/keys/a@example.com/tier",
            json={"tier": "pro"},
            headers={"X-Admin-Secret": "anything"},
        )
    assert resp.status_code == 503


def test_admin_tier_change_end_to_end(tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "secfin_admin_secret", "test-admin-secret")
    with _client(tmp_path, monkeypatch) as client:
        signup_resp = client.post("/v1/signup", json={"email": "a@example.com"})
        api_key = signup_resp.json()["api_key"]

        # Wrong secret is rejected.
        wrong = client.post(
            "/v1/admin/keys/a@example.com/tier",
            json={"tier": "pro"},
            headers={"X-Admin-Secret": "not-the-secret"},
        )
        assert wrong.status_code == 401

        # Correct secret moves the key onto the new tier.
        resp = client.post(
            "/v1/admin/keys/a@example.com/tier",
            json={"tier": "pro"},
            headers={"X-Admin-Secret": "test-admin-secret"},
        )
        assert resp.status_code == 200
        assert resp.json()["tier"] == "pro"
        assert resp.json()["daily_quota"] == 250_000

        # The upgraded key's higher rate limit is now live on a gated endpoint.
        gated = client.get(
            "/v1/companies/320193/beneficial-ownership", headers={"X-API-Key": api_key}
        )
        assert gated.status_code != 401


def test_admin_revoke_is_503_when_admin_secret_unconfigured(tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "secfin_admin_secret", "")
    with _client(tmp_path, monkeypatch) as client:
        client.post("/v1/signup", json={"email": "a@example.com"})
        resp = client.post(
            "/v1/admin/keys/a@example.com/revoke",
            headers={"X-Admin-Secret": "anything"},
        )
    assert resp.status_code == 503


def test_admin_revoke_end_to_end_key_fails_auth_immediately(tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "secfin_admin_secret", "test-admin-secret")
    with _client(tmp_path, monkeypatch) as client:
        signup_resp = client.post("/v1/signup", json={"email": "a@example.com"})
        api_key = signup_resp.json()["api_key"]

        # The key works before revocation.
        pre = client.get(
            "/v1/companies/320193/beneficial-ownership", headers={"X-API-Key": api_key}
        )
        assert pre.status_code != 401

        # Wrong secret is rejected; the key stays active.
        wrong = client.post(
            "/v1/admin/keys/a@example.com/revoke",
            headers={"X-Admin-Secret": "not-the-secret"},
        )
        assert wrong.status_code == 401
        still_active = client.get(
            "/v1/companies/320193/beneficial-ownership", headers={"X-API-Key": api_key}
        )
        assert still_active.status_code != 401

        # Correct secret revokes the key.
        resp = client.post(
            "/v1/admin/keys/a@example.com/revoke",
            headers={"X-Admin-Secret": "test-admin-secret"},
        )
        assert resp.status_code == 200
        assert resp.json() == {"email": "a@example.com", "active": False}

        # The very next request with the same key -- no restart, no cache to expire --
        # fails auth with a clear 401 body.
        post = client.get(
            "/v1/companies/320193/beneficial-ownership", headers={"X-API-Key": api_key}
        )
        assert post.status_code == 401
        assert "revoked" in post.json()["detail"].lower()


def test_admin_revoke_404s_for_unregistered_email(tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "secfin_admin_secret", "test-admin-secret")
    with _client(tmp_path, monkeypatch) as client:
        resp = client.post(
            "/v1/admin/keys/nope@example.com/revoke",
            headers={"X-Admin-Secret": "test-admin-secret"},
        )
    assert resp.status_code == 404


def test_usage_endpoint_requires_a_key_and_reflects_recorded_requests(tmp_path, monkeypatch):
    with _client(tmp_path, monkeypatch) as client:
        signup_resp = client.post("/v1/signup", json={"email": "a@example.com"})
        api_key = signup_resp.json()["api_key"]

        # No key -> 401, same as any other gated endpoint.
        assert client.get("/v1/usage").status_code == 401

        # Signup itself doesn't count against usage -- it's on signup_router, not the
        # require_api_key-gated router. One gated call should show exactly 1 request today.
        client.get("/v1/companies/320193/beneficial-ownership", headers={"X-API-Key": api_key})

        usage_resp = client.get("/v1/usage", headers={"X-API-Key": api_key})
        assert usage_resp.status_code == 200
        body = usage_resp.json()
        assert body["tier"] == "free"
        assert len(body["usage_by_day"]) == 7
        # The /usage call itself also counts (it's on the gated router), so by the time
        # its own response is built, today's count already includes 2 requests.
        assert body["usage_by_day"][-1]["request_count"] == 2


class _FakeSuggestCache:
    async def suggest(self, client, query, limit=8):
        if query.upper().startswith("AAP"):
            return [{"ticker": "AAPL", "cik": 320193, "name": "Apple Inc."}]
        return []


def test_suggest_endpoint_is_public_and_returns_suggestions(tmp_path, monkeypatch):
    # The autocomplete endpoint backs per-keystroke browser calls from our own pages,
    # so it lives on public_router (no key) -- and never needs a network call in this
    # test because the cache dependency is swapped for a fake. The anon IP limit is
    # raised because three burst requests from the TestClient would otherwise 429
    # (which is the public gating working, just not what this test is about).
    monkeypatch.setattr(settings, "secfin_anon_rate_limit_per_sec", 1000.0)
    with _client(tmp_path, monkeypatch) as client:
        from secfin.api.main import app

        app.state.ticker_cache = _FakeSuggestCache()
        ok = client.get("/v1/companies/suggest?q=aap")
        empty = client.get("/v1/companies/suggest?q=zzz")
        missing = client.get("/v1/companies/suggest")
    assert ok.status_code == 200
    assert ok.json() == {
        "query": "aap",
        "suggestions": [{"ticker": "AAPL", "cik": 320193, "name": "Apple Inc."}],
    }
    assert empty.json() == {"query": "zzz", "suggestions": []}
    assert missing.status_code == 422  # q is required

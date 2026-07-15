"""Tests for GET /v1/admin/ops (api/admin_routes.py) -- the operator observability
snapshot -- and the response-class counter middleware in api/main.py that feeds its
`process` half. Same no-network `_client` pattern as test_app_auth_wiring.py; the
repository half is fed through the real signup + /v1/usage flow, not fixtures, so the
test exercises the same write path production does.
"""

from __future__ import annotations

import datetime as dt

from fastapi.testclient import TestClient

from secfin.config import settings


def _client(tmp_path, monkeypatch) -> TestClient:
    monkeypatch.setattr(settings, "secfin_db_path", str(tmp_path / "test.db"))
    from secfin.api.main import app

    return TestClient(app)


def test_ops_is_503_when_admin_secret_unconfigured(tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "secfin_admin_secret", "")
    with _client(tmp_path, monkeypatch) as client:
        resp = client.get("/v1/admin/ops", headers={"X-Admin-Secret": "anything"})
    assert resp.status_code == 503


def test_ops_rejects_a_wrong_secret(tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "secfin_admin_secret", "test-admin-secret")
    with _client(tmp_path, monkeypatch) as client:
        resp = client.get("/v1/admin/ops", headers={"X-Admin-Secret": "not-the-secret"})
    assert resp.status_code == 401


def test_ops_snapshot_reflects_signups_traffic_and_response_counts(tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "secfin_admin_secret", "test-admin-secret")
    today = dt.datetime.now(dt.UTC).strftime("%Y-%m-%d")
    with _client(tmp_path, monkeypatch) as client:
        signup = client.post("/v1/signup", json={"email": "ops-test@example.com"})
        assert signup.status_code == 200
        key = signup.json()["api_key"]
        # A metered request, so today's traffic row exists (usage is recorded by
        # require_api_key on any gated call; /v1/usage never touches SEC).
        assert client.get("/v1/usage", headers={"X-API-Key": key}).status_code == 200

        resp = client.get("/v1/admin/ops", headers={"X-Admin-Secret": "test-admin-secret"})
    assert resp.status_code == 200
    body = resp.json()

    overview = body["overview"]
    assert overview["keys_total"] >= 1
    assert overview["keys_active"] >= 1
    assert overview["keys_by_tier"].get("free", 0) >= 1
    assert any(
        row["date"] == today and row["request_count"] >= 1 and row["active_keys"] >= 1
        for row in overview["traffic_by_day"]
    )
    assert any(row["date"] == today and row["count"] >= 1 for row in overview["signups_by_day"])

    # Process counters: the module-level app accumulates across tests in this process,
    # so assert presence/floor, not exact values. The signup + usage calls above alone
    # guarantee 2xx > 0 by the time the snapshot itself was counted.
    assert body["process"]["started_at"]
    assert body["process"]["responses_by_class"].get("2xx", 0) >= 2

    # The days window is bounded -- reject out-of-range values rather than scanning
    # unbounded history.
    with _client(tmp_path, monkeypatch) as client:
        assert (
            client.get(
                "/v1/admin/ops?days=0", headers={"X-Admin-Secret": "test-admin-secret"}
            ).status_code
            == 422
        )

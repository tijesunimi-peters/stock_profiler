"""Tests for the per-manager 13F route helpers in api/routes.py (no network)."""

from __future__ import annotations

import pytest
from fastapi import HTTPException

from secfin.api import routes as routes_module
from secfin.normalize.schema import HoldingsSnapshot
from secfin.storage.sqlite_holdings_repository import SQLiteHoldingsSnapshotRepository


def _snapshot(period: str) -> HoldingsSnapshot:
    return HoldingsSnapshot(manager_cik=1000, manager_name="Test Capital", report_period=period)


async def test_manager_snapshot_fetches_and_caches_on_a_miss(monkeypatch):
    expected = _snapshot("2026-03-31")
    repo = SQLiteHoldingsSnapshotRepository(":memory:")
    fetch_calls = []

    async def _fake_fetch(client, manager_cik, period):
        fetch_calls.append((manager_cik, period))
        assert manager_cik == 1000
        assert period == "2026-03-31"
        return expected

    monkeypatch.setattr(routes_module, "fetch_13f_snapshot", _fake_fetch)

    result = await routes_module._manager_snapshot(
        repo=repo, client=None, manager_cik=1000, period="2026-03-31"
    )

    assert result == expected
    assert len(fetch_calls) == 1
    # The miss must have populated the cache -- a repeat call hits it, no re-fetch.
    result2 = await routes_module._manager_snapshot(
        repo=repo, client=None, manager_cik=1000, period="2026-03-31"
    )
    assert result2 == expected
    assert len(fetch_calls) == 1
    repo.close()


async def test_manager_snapshot_serves_a_cache_hit_without_fetching(monkeypatch):
    repo = SQLiteHoldingsSnapshotRepository(":memory:")
    repo.upsert_snapshot(_snapshot("2026-03-31"))

    async def _boom(client, manager_cik, period):
        raise AssertionError("should not fetch on a cache hit")

    monkeypatch.setattr(routes_module, "fetch_13f_snapshot", _boom)

    result = await routes_module._manager_snapshot(
        repo=repo, client=None, manager_cik=1000, period="2026-03-31"
    )
    assert result.report_period == "2026-03-31"
    repo.close()


async def test_manager_snapshot_translates_value_error_to_404(monkeypatch):
    repo = SQLiteHoldingsSnapshotRepository(":memory:")

    async def _boom(client, manager_cik, period):
        raise ValueError(f"no 13F-HR filing found for CIK {manager_cik} at period {period!r}")

    monkeypatch.setattr(routes_module, "fetch_13f_snapshot", _boom)

    with pytest.raises(HTTPException) as exc_info:
        await routes_module._manager_snapshot(
            repo=repo, client=None, manager_cik=1000, period="1999-12-31"
        )

    assert exc_info.value.status_code == 404
    assert "1999-12-31" in exc_info.value.detail
    repo.close()

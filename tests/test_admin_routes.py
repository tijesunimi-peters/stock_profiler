"""Tests for the admin tier-change endpoint's handler (secfin.api.admin_routes), called
directly the same way tests/test_auth_routes.py calls the signup handler.
"""

from __future__ import annotations

import pytest
from fastapi import HTTPException

from secfin.api.admin_routes import TierChangeRequest, change_tier, require_admin_secret
from secfin.config import settings
from secfin.storage.sqlite_api_key_repository import SQLiteApiKeyRepository


async def test_change_tier_moves_a_key_onto_a_new_tier():
    repo = SQLiteApiKeyRepository(":memory:")
    repo.create_key(
        key_hash="hash-1", email="a@example.com", tier="free", rate_limit_per_sec=5,
        daily_quota=1000,
    )

    result = await change_tier(
        "a@example.com", TierChangeRequest(tier="pro"), repo=repo
    )

    assert result.tier == "pro"
    assert result.rate_limit_per_sec == 100
    assert result.daily_quota == 250_000
    repo.close()


async def test_change_tier_rejects_unknown_tier():
    repo = SQLiteApiKeyRepository(":memory:")
    repo.create_key(
        key_hash="hash-1", email="a@example.com", tier="free", rate_limit_per_sec=5,
        daily_quota=1000,
    )

    with pytest.raises(HTTPException) as exc_info:
        await change_tier("a@example.com", TierChangeRequest(tier="ultra"), repo=repo)
    assert exc_info.value.status_code == 400
    repo.close()


async def test_change_tier_404s_for_unregistered_email():
    repo = SQLiteApiKeyRepository(":memory:")

    with pytest.raises(HTTPException) as exc_info:
        await change_tier("nope@example.com", TierChangeRequest(tier="pro"), repo=repo)
    assert exc_info.value.status_code == 404
    repo.close()


async def test_require_admin_secret_503s_when_unconfigured(monkeypatch):
    monkeypatch.setattr(settings, "secfin_admin_secret", "")

    with pytest.raises(HTTPException) as exc_info:
        await require_admin_secret(x_admin_secret="anything")
    assert exc_info.value.status_code == 503


async def test_require_admin_secret_401s_on_wrong_secret(monkeypatch):
    monkeypatch.setattr(settings, "secfin_admin_secret", "correct-secret")

    with pytest.raises(HTTPException) as exc_info:
        await require_admin_secret(x_admin_secret="wrong-secret")
    assert exc_info.value.status_code == 401


async def test_require_admin_secret_401s_on_missing_header(monkeypatch):
    monkeypatch.setattr(settings, "secfin_admin_secret", "correct-secret")

    with pytest.raises(HTTPException) as exc_info:
        await require_admin_secret(x_admin_secret=None)
    assert exc_info.value.status_code == 401


async def test_require_admin_secret_passes_on_correct_secret(monkeypatch):
    monkeypatch.setattr(settings, "secfin_admin_secret", "correct-secret")

    await require_admin_secret(x_admin_secret="correct-secret")

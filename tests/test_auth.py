"""Tests for the auth dependencies (secfin.api.auth): require_api_key and
limit_anonymous_traffic. Called directly as plain async functions, same convention as
tests/test_manager_routes.py uses for other route helpers.
"""

from __future__ import annotations

from unittest.mock import MagicMock

import pytest
from fastapi import HTTPException

from secfin.api.auth import limit_anonymous_traffic, require_api_key
from secfin.auth.keys import hash_api_key
from secfin.auth.models import ApiKeyRecord
from secfin.auth.rate_limiter import TokenBucketLimiter
from secfin.storage.sqlite_api_key_repository import SQLiteApiKeyRepository


def _make_repo_with_key(rate_limit_per_sec: int = 5, daily_quota: int = 1000) -> tuple:
    repo = SQLiteApiKeyRepository(":memory:")
    plaintext = "sfk_test123"
    record = repo.create_key(
        key_hash=hash_api_key(plaintext),
        email="a@example.com",
        tier="free",
        rate_limit_per_sec=rate_limit_per_sec,
        daily_quota=daily_quota,
    )
    return repo, plaintext, record


async def test_require_api_key_rejects_missing_header():
    repo = SQLiteApiKeyRepository(":memory:")
    with pytest.raises(HTTPException) as exc_info:
        await require_api_key(x_api_key=None, repo=repo, limiter=TokenBucketLimiter())
    assert exc_info.value.status_code == 401
    repo.close()


async def test_require_api_key_rejects_unknown_key():
    repo = SQLiteApiKeyRepository(":memory:")
    with pytest.raises(HTTPException) as exc_info:
        await require_api_key(x_api_key="sfk_bogus", repo=repo, limiter=TokenBucketLimiter())
    assert exc_info.value.status_code == 401
    repo.close()


async def test_require_api_key_rejects_revoked_key(monkeypatch):
    repo, plaintext, record = _make_repo_with_key()
    revoked = ApiKeyRecord(**{**record.model_dump(), "active": False})
    monkeypatch.setattr(repo, "get_by_hash", lambda h: revoked)

    with pytest.raises(HTTPException) as exc_info:
        await require_api_key(x_api_key=plaintext, repo=repo, limiter=TokenBucketLimiter())
    assert exc_info.value.status_code == 401
    repo.close()


async def test_require_api_key_accepts_a_valid_key_and_returns_the_record():
    repo, plaintext, record = _make_repo_with_key()

    result = await require_api_key(x_api_key=plaintext, repo=repo, limiter=TokenBucketLimiter())

    assert result.id == record.id
    assert result.email == "a@example.com"
    repo.close()


async def test_require_api_key_enforces_the_per_key_rate_limit():
    repo, plaintext, _ = _make_repo_with_key(rate_limit_per_sec=1)
    limiter = TokenBucketLimiter()

    await require_api_key(x_api_key=plaintext, repo=repo, limiter=limiter)
    with pytest.raises(HTTPException) as exc_info:
        await require_api_key(x_api_key=plaintext, repo=repo, limiter=limiter)
    assert exc_info.value.status_code == 429
    repo.close()


async def test_require_api_key_enforces_the_daily_quota():
    repo, plaintext, _ = _make_repo_with_key(rate_limit_per_sec=1000, daily_quota=2)
    limiter = TokenBucketLimiter()

    await require_api_key(x_api_key=plaintext, repo=repo, limiter=limiter)
    await require_api_key(x_api_key=plaintext, repo=repo, limiter=limiter)
    with pytest.raises(HTTPException) as exc_info:
        await require_api_key(x_api_key=plaintext, repo=repo, limiter=limiter)
    assert exc_info.value.status_code == 429
    assert "quota" in exc_info.value.detail.lower()
    repo.close()


async def test_limit_anonymous_traffic_blocks_after_the_configured_burst(monkeypatch):
    from secfin import config

    monkeypatch.setattr(config.settings, "secfin_anon_rate_limit_per_sec", 1.0)
    limiter = TokenBucketLimiter()
    request = MagicMock()
    request.client.host = "1.2.3.4"

    await limit_anonymous_traffic(request=request, limiter=limiter)
    with pytest.raises(HTTPException) as exc_info:
        await limit_anonymous_traffic(request=request, limiter=limiter)
    assert exc_info.value.status_code == 429


async def test_limit_anonymous_traffic_keys_by_client_ip_independently():
    from secfin import config

    limiter = TokenBucketLimiter()
    r1 = MagicMock()
    r1.client.host = "1.1.1.1"
    r2 = MagicMock()
    r2.client.host = "2.2.2.2"

    for _ in range(int(config.settings.secfin_anon_rate_limit_per_sec)):
        await limit_anonymous_traffic(request=r1, limiter=limiter)
    with pytest.raises(HTTPException):
        await limit_anonymous_traffic(request=r1, limiter=limiter)
    # A different IP is unaffected.
    await limit_anonymous_traffic(request=r2, limiter=limiter)

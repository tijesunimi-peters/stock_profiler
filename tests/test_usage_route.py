"""Tests for the GET /v1/usage route handler (api/routes.py's get_usage), called
directly the same way tests/test_manager_routes.py calls other route handlers.
"""

from __future__ import annotations

import datetime as dt

from secfin.api.routes import get_usage
from secfin.storage.sqlite_api_key_repository import SQLiteApiKeyRepository


async def test_get_usage_reflects_the_calling_keys_tier_and_recorded_usage():
    repo = SQLiteApiKeyRepository(":memory:")
    record = repo.create_key(
        key_hash="hash-1", email="a@example.com", tier="pro", rate_limit_per_sec=100,
        daily_quota=250_000,
    )

    today_str = dt.datetime.now(dt.UTC).strftime("%Y-%m-%d")
    repo.record_usage_and_get_count(record.id, today_str)
    repo.record_usage_and_get_count(record.id, today_str)

    result = await get_usage(days=1, record=record, api_key_repo=repo)

    assert result.tier == "pro"
    assert result.rate_limit_per_sec == 100
    assert result.daily_quota == 250_000
    assert len(result.usage_by_day) == 1
    assert result.usage_by_day[0].request_count == 2
    repo.close()


async def test_get_usage_defaults_to_zero_for_a_brand_new_key():
    repo = SQLiteApiKeyRepository(":memory:")
    record = repo.create_key(
        key_hash="hash-1", email="a@example.com", tier="free", rate_limit_per_sec=5,
        daily_quota=1000,
    )

    result = await get_usage(days=7, record=record, api_key_repo=repo)

    assert len(result.usage_by_day) == 7
    assert all(day.request_count == 0 for day in result.usage_by_day)
    repo.close()

"""Tests for the SQLite API key repository (secfin.storage.sqlite_api_key_repository)."""

from __future__ import annotations

import pytest

from secfin.storage.sqlite_api_key_repository import SQLiteApiKeyRepository


def test_create_and_get_by_hash_round_trips():
    repo = SQLiteApiKeyRepository(":memory:")
    record = repo.create_key(
        key_hash="hash-1", email="a@example.com", tier="free", rate_limit_per_sec=5,
        daily_quota=1000,
    )

    assert record.email == "a@example.com"
    assert record.tier == "free"
    assert record.active is True

    fetched = repo.get_by_hash("hash-1")
    assert fetched == record
    repo.close()


def test_get_by_hash_returns_none_for_unknown_key():
    repo = SQLiteApiKeyRepository(":memory:")
    assert repo.get_by_hash("nope") is None
    repo.close()


def test_create_key_rejects_duplicate_email():
    repo = SQLiteApiKeyRepository(":memory:")
    repo.create_key(
        key_hash="hash-1", email="a@example.com", tier="free", rate_limit_per_sec=5,
        daily_quota=1000,
    )

    with pytest.raises(ValueError, match="already registered"):
        repo.create_key(
            key_hash="hash-2", email="a@example.com", tier="free", rate_limit_per_sec=5,
            daily_quota=1000,
        )
    repo.close()


def test_record_usage_and_get_count_increments_per_day():
    repo = SQLiteApiKeyRepository(":memory:")
    record = repo.create_key(
        key_hash="hash-1", email="a@example.com", tier="free", rate_limit_per_sec=5,
        daily_quota=1000,
    )

    assert repo.record_usage_and_get_count(record.id, "2026-07-06") == 1
    assert repo.record_usage_and_get_count(record.id, "2026-07-06") == 2
    assert repo.record_usage_and_get_count(record.id, "2026-07-06") == 3
    # A different calendar day starts its own counter.
    assert repo.record_usage_and_get_count(record.id, "2026-07-07") == 1
    repo.close()

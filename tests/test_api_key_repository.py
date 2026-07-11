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


def test_get_by_email_round_trips():
    repo = SQLiteApiKeyRepository(":memory:")
    record = repo.create_key(
        key_hash="hash-1", email="a@example.com", tier="free", rate_limit_per_sec=5,
        daily_quota=1000,
    )

    assert repo.get_by_email("a@example.com") == record
    repo.close()


def test_get_by_email_returns_none_for_unknown_email():
    repo = SQLiteApiKeyRepository(":memory:")
    assert repo.get_by_email("nope@example.com") is None
    repo.close()


def test_update_tier_changes_tier_and_limits():
    repo = SQLiteApiKeyRepository(":memory:")
    repo.create_key(
        key_hash="hash-1", email="a@example.com", tier="free", rate_limit_per_sec=5,
        daily_quota=1000,
    )

    updated = repo.update_tier(
        email="a@example.com", tier="pro", rate_limit_per_sec=100, daily_quota=250_000
    )

    assert updated is not None
    assert updated.tier == "pro"
    assert updated.rate_limit_per_sec == 100
    assert updated.daily_quota == 250_000
    # Persisted, not just returned in-memory.
    assert repo.get_by_email("a@example.com") == updated
    repo.close()


def test_update_tier_returns_none_for_unknown_email():
    repo = SQLiteApiKeyRepository(":memory:")
    assert repo.update_tier(
        email="nope@example.com", tier="pro", rate_limit_per_sec=100, daily_quota=250_000
    ) is None
    repo.close()


def test_revoke_key_deactivates_the_key():
    repo = SQLiteApiKeyRepository(":memory:")
    repo.create_key(
        key_hash="hash-1", email="a@example.com", tier="free", rate_limit_per_sec=5,
        daily_quota=1000,
    )

    revoked = repo.revoke_key(email="a@example.com")

    assert revoked is not None
    assert revoked.active is False
    # Persisted, not just returned in-memory.
    assert repo.get_by_email("a@example.com").active is False
    # The row survives revocation -- get_by_hash still round-trips it (see
    # api/auth.py's require_api_key, which needs the record to produce a clear 401).
    assert repo.get_by_hash("hash-1") is not None
    repo.close()


def test_revoke_key_returns_none_for_unknown_email():
    repo = SQLiteApiKeyRepository(":memory:")
    assert repo.revoke_key(email="nope@example.com") is None
    repo.close()


def test_revoke_key_is_idempotent():
    repo = SQLiteApiKeyRepository(":memory:")
    repo.create_key(
        key_hash="hash-1", email="a@example.com", tier="free", rate_limit_per_sec=5,
        daily_quota=1000,
    )

    first = repo.revoke_key(email="a@example.com")
    second = repo.revoke_key(email="a@example.com")

    assert first is not None and first.active is False
    assert second is not None and second.active is False
    repo.close()


def test_revoke_key_does_not_change_other_keys():
    repo = SQLiteApiKeyRepository(":memory:")
    repo.create_key(
        key_hash="hash-1", email="a@example.com", tier="free", rate_limit_per_sec=5,
        daily_quota=1000,
    )
    repo.create_key(
        key_hash="hash-2", email="b@example.com", tier="free", rate_limit_per_sec=5,
        daily_quota=1000,
    )

    repo.revoke_key(email="a@example.com")

    assert repo.get_by_email("a@example.com").active is False
    assert repo.get_by_email("b@example.com").active is True
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


def test_usage_by_day_returns_only_days_on_or_after_since_day_ordered():
    repo = SQLiteApiKeyRepository(":memory:")
    record = repo.create_key(
        key_hash="hash-1", email="a@example.com", tier="free", rate_limit_per_sec=5,
        daily_quota=1000,
    )
    repo.record_usage_and_get_count(record.id, "2026-07-01")
    repo.record_usage_and_get_count(record.id, "2026-07-03")
    repo.record_usage_and_get_count(record.id, "2026-07-03")
    repo.record_usage_and_get_count(record.id, "2026-07-05")

    rows = repo.usage_by_day(record.id, since_day="2026-07-02")

    assert [(r.date, r.request_count) for r in rows] == [
        ("2026-07-03", 2),
        ("2026-07-05", 1),
    ]
    repo.close()


def test_usage_by_day_is_sparse_not_zero_filled():
    repo = SQLiteApiKeyRepository(":memory:")
    record = repo.create_key(
        key_hash="hash-1", email="a@example.com", tier="free", rate_limit_per_sec=5,
        daily_quota=1000,
    )
    repo.record_usage_and_get_count(record.id, "2026-07-05")

    rows = repo.usage_by_day(record.id, since_day="2026-07-01")

    assert len(rows) == 1
    assert rows[0].date == "2026-07-05"
    repo.close()


def test_usage_by_day_scopes_to_the_given_key():
    repo = SQLiteApiKeyRepository(":memory:")
    a = repo.create_key(
        key_hash="hash-1", email="a@example.com", tier="free", rate_limit_per_sec=5,
        daily_quota=1000,
    )
    b = repo.create_key(
        key_hash="hash-2", email="b@example.com", tier="free", rate_limit_per_sec=5,
        daily_quota=1000,
    )
    repo.record_usage_and_get_count(a.id, "2026-07-05")
    repo.record_usage_and_get_count(b.id, "2026-07-05")
    repo.record_usage_and_get_count(b.id, "2026-07-05")

    assert [r.request_count for r in repo.usage_by_day(a.id, "2026-07-01")] == [1]
    assert [r.request_count for r in repo.usage_by_day(b.id, "2026-07-01")] == [2]
    repo.close()

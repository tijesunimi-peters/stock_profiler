"""Tests for auth.usage.usage_summary -- the pure gap-filling function GET /v1/usage
(api/routes.py) sits on top of.
"""

from __future__ import annotations

import datetime as dt

from secfin.auth.models import ApiKeyRecord, DailyUsage
from secfin.auth.usage import usage_summary


def _record(**overrides) -> ApiKeyRecord:
    defaults = dict(
        id=1,
        email="a@example.com",
        tier="free",
        rate_limit_per_sec=5,
        daily_quota=1000,
        active=True,
        created_at="2026-01-01T00:00:00",
    )
    defaults.update(overrides)
    return ApiKeyRecord(**defaults)


def test_usage_summary_carries_the_record_limits():
    result = usage_summary(
        _record(tier="pro", rate_limit_per_sec=100, daily_quota=250_000),
        stored=[],
        days=1,
        today=dt.date(2026, 7, 6),
    )
    assert result.tier == "pro"
    assert result.rate_limit_per_sec == 100
    assert result.daily_quota == 250_000


def test_usage_summary_fills_gaps_with_zero_count_days():
    stored = [DailyUsage(date="2026-07-05", request_count=42)]

    result = usage_summary(_record(), stored, days=3, today=dt.date(2026, 7, 6))

    assert [d.date for d in result.usage_by_day] == ["2026-07-04", "2026-07-05", "2026-07-06"]
    assert [d.request_count for d in result.usage_by_day] == [0, 42, 0]


def test_usage_summary_days_equals_one_returns_only_today():
    result = usage_summary(_record(), stored=[], days=1, today=dt.date(2026, 7, 6))
    assert len(result.usage_by_day) == 1
    assert result.usage_by_day[0].date == "2026-07-06"
    assert result.usage_by_day[0].request_count == 0


def test_usage_summary_ignores_stored_rows_outside_the_window():
    stored = [DailyUsage(date="2026-06-01", request_count=999)]
    result = usage_summary(_record(), stored, days=2, today=dt.date(2026, 7, 6))
    assert sum(d.request_count for d in result.usage_by_day) == 0

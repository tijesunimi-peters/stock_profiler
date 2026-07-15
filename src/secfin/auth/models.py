"""API key record (Milestone 3 auth) -- not SEC domain data, so deliberately kept out
of normalize/schema.py (which is scoped to canonical financial/ownership models).
"""

from __future__ import annotations

from pydantic import BaseModel


class ApiKeyRecord(BaseModel):
    """One issued API key. The plaintext key itself is never stored -- see auth/keys.py."""

    id: int
    email: str
    tier: str
    rate_limit_per_sec: int
    daily_quota: int
    active: bool
    created_at: str


class DailyUsage(BaseModel):
    """One (day, request count) pair from `api_key_usage` -- the billing-relevant
    counter, distinct from the in-memory per-second rate limiter (auth/rate_limiter.py).
    """

    date: str
    request_count: int


class UsageSummary(BaseModel):
    """Response shape for `GET /v1/usage` (api/routes.py) -- the calling key's current
    tier/limits plus a trailing window of daily request counts, gaps filled with
    explicit zero-count days (see auth/usage.py's `usage_summary`).
    """

    tier: str
    rate_limit_per_sec: int
    daily_quota: int
    usage_by_day: list[DailyUsage]


class DailyTraffic(BaseModel):
    """One day of aggregate metered traffic across ALL keys (admin ops view): total
    request count plus how many distinct keys produced it. Days with no traffic simply
    don't appear -- unlike UsageSummary this is an operator glance, not a billing series.
    """

    date: str
    request_count: int
    active_keys: int


class DailyCount(BaseModel):
    """One (day, count) pair -- signups per day in the admin ops view."""

    date: str
    count: int


class OpsOverview(BaseModel):
    """Aggregate key/traffic snapshot for `GET /v1/admin/ops` (api/admin_routes.py) --
    the "yesterday's traffic without SSHing around" view, sourced from the same
    `api_keys` / `api_key_usage` tables the auth path already writes.
    """

    keys_total: int
    keys_active: int
    keys_by_tier: dict[str, int]
    traffic_by_day: list[DailyTraffic]
    signups_by_day: list[DailyCount]

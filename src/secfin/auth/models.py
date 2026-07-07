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

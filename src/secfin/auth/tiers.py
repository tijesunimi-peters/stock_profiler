"""Tier definitions for API keys.

`POST /v1/signup` always issues `DEFAULT_TIER` -- there's no self-service upgrade path
yet (that needs real payment integration, a separate not-yet-decided task). Moving an
existing key onto a paid tier is a manual, admin-secret-gated action
(`api/admin_routes.py`) until then. No usage-metering rollup beyond the existing daily
`api_key_usage` counter (storage/api_key_repository.py) is built here -- see
docs/ROADMAP.md for that half of "Usage metering + subscription tiers".
"""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class TierLimits:
    rate_limit_per_sec: int
    daily_quota: int


DEFAULT_TIER = "free"

TIERS: dict[str, TierLimits] = {
    DEFAULT_TIER: TierLimits(rate_limit_per_sec=5, daily_quota=1000),
    "basic": TierLimits(rate_limit_per_sec=20, daily_quota=25_000),
    "pro": TierLimits(rate_limit_per_sec=100, daily_quota=250_000),
}

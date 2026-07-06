"""Tier defaults for newly-issued API keys.

Only one tier exists today ("free") -- paid subscription tiers are a separate,
not-yet-built roadmap item (docs/ROADMAP.md's "Usage metering + subscription tiers").
Keeping a `tier` column on the stored record now (storage/api_key_repository.py) avoids
a migration when paid tiers land; this dict is where their limits will get added.
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
}

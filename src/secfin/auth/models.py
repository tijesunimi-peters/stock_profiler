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

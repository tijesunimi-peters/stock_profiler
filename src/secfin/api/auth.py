"""FastAPI dependencies enforcing API-key auth, per-key rate limiting, and daily quotas.

`require_api_key` is applied at `include_router` granularity in api/main.py -- NOT
per-route -- so gated endpoints are gated by which router they're registered on, not by
remembering to add `Depends(...)` to each new route. The two read-only endpoints the
public Data Explorer (`/explorer`) calls live on `api/routes.py`'s `public_router`
instead of `router` specifically so they're excluded from this; see that module's
docstring. Those still get `limit_anonymous_traffic` below, a per-IP limiter, so the
public demo surface isn't wide open to scraping just because it's keyless.
"""

from __future__ import annotations

import datetime as dt

from fastapi import Depends, Header, HTTPException, Request

from secfin.auth.keys import hash_api_key
from secfin.auth.models import ApiKeyRecord
from secfin.auth.rate_limiter import TokenBucketLimiter
from secfin.config import settings
from secfin.storage.api_key_repository import ApiKeyRepository


def get_api_key_repo(request: Request) -> ApiKeyRepository:
    return request.app.state.api_key_repo


def get_rate_limiter(request: Request) -> TokenBucketLimiter:
    return request.app.state.rate_limiter


async def require_api_key(
    x_api_key: str | None = Header(default=None, alias="X-API-Key"),
    repo: ApiKeyRepository = Depends(get_api_key_repo),
    limiter: TokenBucketLimiter = Depends(get_rate_limiter),
) -> ApiKeyRecord:
    """401 on a missing/unknown/revoked key; 429 on a burst-rate or daily-quota breach.

    Order matters: identity (401) is checked before any limit (429) -- an unknown key
    should never learn its own rate limit via a 429's wording.
    """
    if not x_api_key:
        raise HTTPException(status_code=401, detail="Missing X-API-Key header.")
    record = repo.get_by_hash(hash_api_key(x_api_key))
    if record is None or not record.active:
        raise HTTPException(status_code=401, detail="Invalid or revoked API key.")
    if not limiter.allow(f"key:{record.id}", record.rate_limit_per_sec):
        raise HTTPException(status_code=429, detail="Rate limit exceeded -- slow down.")
    today = dt.datetime.now(dt.UTC).strftime("%Y-%m-%d")
    used = repo.record_usage_and_get_count(record.id, today)
    if used > record.daily_quota:
        raise HTTPException(
            status_code=429,
            detail=f"Daily quota exceeded ({record.daily_quota} requests/day).",
        )
    return record


async def limit_anonymous_traffic(
    request: Request, limiter: TokenBucketLimiter = Depends(get_rate_limiter)
) -> None:
    """Per-IP burst limit for the keyless public endpoints (statements, periods) --
    protects the Data Explorer's demo surface from scraping without requiring a key.
    """
    client_ip = request.client.host if request.client else "unknown"
    if not limiter.allow(f"ip:{client_ip}", settings.secfin_anon_rate_limit_per_sec):
        raise HTTPException(status_code=429, detail="Too many requests -- slow down.")

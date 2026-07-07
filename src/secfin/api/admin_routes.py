"""Admin-only endpoints -- not customer-facing.

Today this is exactly one operation: moving an existing key onto a different
subscription tier (auth/tiers.py). There's no payment integration yet, so a paid-tier
upgrade is this manual step performed by whoever runs the service, not a self-service
flow. Gated by a shared secret (`X-Admin-Secret`, config.secfin_admin_secret) rather than
`require_api_key` -- an admin isn't a customer and shouldn't need a "key" of that kind.
If the secret isn't configured, every request here 503s rather than falling back to some
"any request accepted" behavior.
"""

from __future__ import annotations

import secrets

from fastapi import APIRouter, Depends, Header, HTTPException, Request
from pydantic import BaseModel

from secfin.auth.models import ApiKeyRecord
from secfin.auth.tiers import TIERS
from secfin.config import settings
from secfin.storage.api_key_repository import ApiKeyRepository

admin_router = APIRouter()


def get_api_key_repo(request: Request) -> ApiKeyRepository:
    return request.app.state.api_key_repo


async def require_admin_secret(
    x_admin_secret: str | None = Header(default=None, alias="X-Admin-Secret"),
) -> None:
    if not settings.secfin_admin_secret:
        raise HTTPException(status_code=503, detail="Admin endpoints are not configured.")
    if not x_admin_secret or not secrets.compare_digest(
        x_admin_secret, settings.secfin_admin_secret
    ):
        raise HTTPException(status_code=401, detail="Invalid admin secret.")


class TierChangeRequest(BaseModel):
    tier: str


class TierChangeResponse(BaseModel):
    email: str
    tier: str
    rate_limit_per_sec: int
    daily_quota: int


@admin_router.post(
    "/admin/keys/{email}/tier",
    response_model=TierChangeResponse,
    dependencies=[Depends(require_admin_secret)],
    include_in_schema=False,
)
async def change_tier(
    email: str,
    body: TierChangeRequest,
    repo: ApiKeyRepository = Depends(get_api_key_repo),
) -> TierChangeResponse:
    """Move the key registered to `email` onto `body.tier`, applying that tier's current
    rate_limit_per_sec/daily_quota from auth/tiers.py. 404 if no key is registered to
    that email; 400 for an unknown tier name.
    """
    limits = TIERS.get(body.tier)
    if limits is None:
        raise HTTPException(status_code=400, detail=f"Unknown tier: {body.tier}")
    record: ApiKeyRecord | None = repo.update_tier(
        email=email,
        tier=body.tier,
        rate_limit_per_sec=limits.rate_limit_per_sec,
        daily_quota=limits.daily_quota,
    )
    if record is None:
        raise HTTPException(status_code=404, detail=f"No API key registered to {email}")
    return TierChangeResponse(
        email=record.email,
        tier=record.tier,
        rate_limit_per_sec=record.rate_limit_per_sec,
        daily_quota=record.daily_quota,
    )

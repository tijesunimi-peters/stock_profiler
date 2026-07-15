"""Admin-only endpoints -- not customer-facing.

Two operations: moving an existing key onto a different subscription tier
(auth/tiers.py), and revoking a key outright (setting `active = False`). Neither has a
self-service equivalent -- no payment integration yet for tier changes, and no
self-serve "delete my key" flow for revocation -- so both are manual steps performed by
whoever runs the service. Gated by a shared secret (`X-Admin-Secret`,
config.secfin_admin_secret) rather than `require_api_key` -- an admin isn't a customer
and shouldn't need a "key" of that kind. If the secret isn't configured, every request
here 503s rather than falling back to some "any request accepted" behavior.

Revocation takes effect on the very next request: `api/auth.py`'s `require_api_key`
reads the key record fresh from the repository on every call (no in-memory caching of
`ApiKeyRecord`s), so there is no propagation delay to reason about beyond normal SQLite
write/read visibility on the same file.
"""

from __future__ import annotations

import datetime as dt
import secrets

from fastapi import APIRouter, Depends, Header, HTTPException, Query, Request
from pydantic import BaseModel

from secfin.auth.models import ApiKeyRecord, OpsOverview
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


class RevokeKeyResponse(BaseModel):
    email: str
    active: bool


@admin_router.post(
    "/admin/keys/{email}/revoke",
    response_model=RevokeKeyResponse,
    dependencies=[Depends(require_admin_secret)],
    include_in_schema=False,
)
async def revoke_key(
    email: str,
    repo: ApiKeyRepository = Depends(get_api_key_repo),
) -> RevokeKeyResponse:
    """Disable the key registered to `email` -- it fails auth (401) on its very next
    use. 404 if no key is registered to that email. Idempotent: revoking an
    already-revoked key just re-confirms it's inactive.
    """
    record: ApiKeyRecord | None = repo.revoke_key(email=email)
    if record is None:
        raise HTTPException(status_code=404, detail=f"No API key registered to {email}")
    return RevokeKeyResponse(email=record.email, active=record.active)


class OpsProcess(BaseModel):
    started_at: str
    responses_by_class: dict[str, int]


class OpsResponse(BaseModel):
    process: OpsProcess
    days: int
    overview: OpsOverview


@admin_router.get(
    "/admin/ops",
    response_model=OpsResponse,
    dependencies=[Depends(require_admin_secret)],
    include_in_schema=False,
)
async def ops_snapshot(
    request: Request,
    days: int = Query(default=7, ge=1, le=90),
    repo: ApiKeyRepository = Depends(get_api_key_repo),
) -> OpsResponse:
    """Operator observability snapshot: process-lifetime response counts by status
    class (in-memory, reset on restart -- see api/main.py's counter middleware) plus
    aggregate traffic/signups/key totals for the trailing `days` window, straight from
    the `api_keys`/`api_key_usage` tables. Complements, not replaces, the Caddy
    log-review routine (docs/DEPLOYMENT.md §10) -- this is the one-curl "is production
    healthy and did anyone show up yesterday?" answer.
    """
    since = (dt.datetime.now(dt.UTC).date() - dt.timedelta(days=days - 1)).isoformat()
    return OpsResponse(
        process=OpsProcess(
            started_at=request.app.state.ops_started_at,
            responses_by_class=dict(request.app.state.ops_response_counts),
        ),
        days=days,
        overview=repo.ops_overview(since),
    )

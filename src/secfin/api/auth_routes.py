"""Public signup endpoint -- issues a new API key.

Free-tier only today (auth/tiers.py) -- no payment integration, no email verification.
One key per email; signing up again with an already-registered email is rejected (409),
not reissued -- key rotation/reissue is unbuilt, a later concern (e.g. once "usage
metering + subscription tiers" needs a real account model, docs/ROADMAP.md). The
plaintext key is returned exactly once, in this response -- it is never recoverable
afterward (only its hash is stored; see auth/keys.py).

Deliberately its own router, included in api/main.py WITHOUT `require_api_key` --
signing up can't itself require a key. Still gated by `limit_anonymous_traffic` (the
same per-IP limiter the public Data Explorer endpoints use) as basic abuse protection
against mass key creation.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field

from secfin.api.auth import limit_anonymous_traffic
from secfin.auth.keys import generate_api_key, hash_api_key
from secfin.auth.tiers import DEFAULT_TIER, TIERS
from secfin.storage.api_key_repository import ApiKeyRepository

signup_router = APIRouter()


def get_api_key_repo(request: Request) -> ApiKeyRepository:
    return request.app.state.api_key_repo


class SignupRequest(BaseModel):
    # Not pydantic's EmailStr -- that needs the optional `email-validator` dependency,
    # not currently installed (see pyproject.toml). A loose shape check is enough for a
    # v1 signup with no verification email to send anyway.
    email: str = Field(min_length=3, max_length=254, pattern=r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


class SignupResponse(BaseModel):
    api_key: str
    tier: str
    rate_limit_per_sec: int
    daily_quota: int


@signup_router.post(
    "/signup", response_model=SignupResponse, dependencies=[Depends(limit_anonymous_traffic)]
)
async def signup(
    body: SignupRequest, repo: ApiKeyRepository = Depends(get_api_key_repo)
) -> SignupResponse:
    """Issue a new free-tier API key for `email`. Returns 409 if that email already has one."""
    plaintext = generate_api_key()
    limits = TIERS[DEFAULT_TIER]
    try:
        record = repo.create_key(
            key_hash=hash_api_key(plaintext),
            email=body.email,
            tier=DEFAULT_TIER,
            rate_limit_per_sec=limits.rate_limit_per_sec,
            daily_quota=limits.daily_quota,
        )
    except ValueError as e:
        raise HTTPException(status_code=409, detail=str(e)) from e
    return SignupResponse(
        api_key=plaintext,
        tier=record.tier,
        rate_limit_per_sec=record.rate_limit_per_sec,
        daily_quota=record.daily_quota,
    )

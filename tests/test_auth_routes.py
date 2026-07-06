"""Tests for the signup endpoint's handler (secfin.api.auth_routes.signup), called
directly the same way tests/test_manager_routes.py calls other route handlers.
"""

from __future__ import annotations

import pytest
from fastapi import HTTPException

from secfin.api.auth_routes import SignupRequest, signup
from secfin.storage.sqlite_api_key_repository import SQLiteApiKeyRepository


async def test_signup_issues_a_free_tier_key():
    repo = SQLiteApiKeyRepository(":memory:")

    result = await signup(SignupRequest(email="a@example.com"), repo=repo)

    assert result.tier == "free"
    assert result.api_key.startswith("sfk_")
    assert result.rate_limit_per_sec > 0
    assert result.daily_quota > 0
    repo.close()


async def test_signup_rejects_a_second_signup_for_the_same_email():
    repo = SQLiteApiKeyRepository(":memory:")
    await signup(SignupRequest(email="a@example.com"), repo=repo)

    with pytest.raises(HTTPException) as exc_info:
        await signup(SignupRequest(email="a@example.com"), repo=repo)
    assert exc_info.value.status_code == 409
    repo.close()


def test_signup_request_rejects_malformed_email():
    with pytest.raises(ValueError):
        SignupRequest(email="not-an-email")

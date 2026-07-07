"""Tests for SECClient's User-Agent guard and the shared process-wide RateLimiter.

Regression coverage for a pre-launch audit finding (2026-07-07): api/routes.py
constructs a fresh SECClient() per request handler; before this fix each one built its
own independent RateLimiter, so concurrent requests weren't actually coordinated
through one throttle budget -- see sec/client.py's `_shared_default_limiter` docstring.
"""

from __future__ import annotations

import asyncio

import pytest

from secfin.sec import client as client_module
from secfin.sec.client import RateLimiter, SECClient


@pytest.fixture(autouse=True)
def _reset_shared_limiter():
    """Each test starts with no shared limiter constructed yet, so tests can't leak
    timing state (`_last`) into one another via the module-level singleton."""
    client_module._shared_limiter = None
    yield
    client_module._shared_limiter = None


def test_rejects_the_placeholder_user_agent():
    with pytest.raises(RuntimeError, match="SEC_USER_AGENT is not configured"):
        SECClient(user_agent="sec-financials-api unset@example.com")


def test_default_constructed_clients_share_one_process_wide_limiter():
    a = SECClient(user_agent="sec-financials-api you@example.com")
    b = SECClient(user_agent="sec-financials-api you@example.com")
    assert a._limiter is b._limiter


def test_explicit_max_rps_gets_an_independent_limiter():
    a = SECClient(user_agent="sec-financials-api you@example.com")
    b = SECClient(user_agent="sec-financials-api you@example.com", max_rps=3)
    assert a._limiter is not b._limiter


async def test_rate_limiter_spaces_concurrent_waiters_apart(monkeypatch):
    """The actual bug scenario: N concurrent callers sharing one limiter must be
    spaced at least min_interval apart, not let through simultaneously."""
    fake_now = [0.0]
    sleeps: list[float] = []

    async def _fake_sleep(seconds: float) -> None:
        sleeps.append(seconds)
        fake_now[0] += seconds

    monkeypatch.setattr(client_module.time, "monotonic", lambda: fake_now[0])
    monkeypatch.setattr(client_module.asyncio, "sleep", _fake_sleep)

    limiter = RateLimiter(max_rps=10)  # min_interval = 0.1s
    for _ in range(5):
        await limiter.wait()

    # fake_now starts at 0.0, same as _last's initial value, so even the first call's
    # delay computes as > 0 -- all 5 calls wait out the min_interval, not just 4.
    assert len(sleeps) == 5
    assert all(s == pytest.approx(0.1) for s in sleeps)


async def test_concurrent_secclient_requests_share_the_throttle_budget(monkeypatch):
    """Reproduces the pre-fix bug directly: 5 concurrent SECClient().get_json() calls
    (the shape every /v1 route handler makes) must all funnel through ONE limiter, not
    5 independent ones that would let 5x the configured rate through at once.
    """
    fake_now = [0.0]

    async def _fake_sleep(seconds: float) -> None:
        fake_now[0] += seconds

    monkeypatch.setattr(client_module.time, "monotonic", lambda: fake_now[0])
    monkeypatch.setattr(client_module.asyncio, "sleep", _fake_sleep)

    wait_calls = []
    orig_wait = RateLimiter.wait

    async def _tracked_wait(self):
        wait_calls.append(self)
        await orig_wait(self)

    monkeypatch.setattr(RateLimiter, "wait", _tracked_wait)

    async def _make_client_and_wait():
        c = SECClient(user_agent="sec-financials-api you@example.com")
        await c._limiter.wait()
        return c

    clients = await asyncio.gather(*[_make_client_and_wait() for _ in range(5)])

    limiters = {c._limiter for c in clients}
    assert len(limiters) == 1  # all 5 "requests" shared one limiter, not 5 independent ones
    assert len(wait_calls) == 5
    assert all(w is clients[0]._limiter for w in wait_calls)

"""Tests for the in-memory token-bucket limiter (secfin.auth.rate_limiter)."""

from __future__ import annotations

from secfin.auth import rate_limiter as rate_limiter_module
from secfin.auth.rate_limiter import TokenBucketLimiter


def test_allows_up_to_the_bucket_capacity_then_blocks():
    limiter = TokenBucketLimiter()
    # capacity defaults to rate_per_sec -- 3 tokens available immediately, no refill yet.
    assert [limiter.allow("k", rate_per_sec=3) for _ in range(3)] == [True, True, True]
    assert limiter.allow("k", rate_per_sec=3) is False


def test_distinct_keys_have_independent_buckets():
    limiter = TokenBucketLimiter()
    for _ in range(3):
        assert limiter.allow("a", rate_per_sec=3) is True
    assert limiter.allow("a", rate_per_sec=3) is False
    # "b" is untouched by "a" exhausting its bucket.
    assert limiter.allow("b", rate_per_sec=3) is True


def test_refills_over_time(monkeypatch):
    limiter = TokenBucketLimiter()
    fake_now = [1000.0]
    monkeypatch.setattr(rate_limiter_module.time, "monotonic", lambda: fake_now[0])

    assert limiter.allow("k", rate_per_sec=2) is True
    assert limiter.allow("k", rate_per_sec=2) is True
    assert limiter.allow("k", rate_per_sec=2) is False

    fake_now[0] += 0.5  # half a second at rate 2/s -> 1 new token
    assert limiter.allow("k", rate_per_sec=2) is True
    assert limiter.allow("k", rate_per_sec=2) is False


def test_burst_capacity_caps_accumulation(monkeypatch):
    limiter = TokenBucketLimiter()
    fake_now = [0.0]
    monkeypatch.setattr(rate_limiter_module.time, "monotonic", lambda: fake_now[0])

    limiter.allow("k", rate_per_sec=1, burst=2)  # starts full at capacity 2, now at 1
    fake_now[0] += 100  # would refill far past capacity without the cap
    assert limiter.allow("k", rate_per_sec=1, burst=2) is True
    assert limiter.allow("k", rate_per_sec=1, burst=2) is True
    assert limiter.allow("k", rate_per_sec=1, burst=2) is False

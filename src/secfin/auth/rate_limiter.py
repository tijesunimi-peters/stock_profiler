"""In-memory token-bucket rate limiter, shared by per-API-key and per-IP callers.

Deliberately in-process, not SQLite-backed: this is short-window burst protection
(requests/sec), not the billing-relevant daily quota (storage/api_key_repository.py
handles that, persisted so it survives a restart). CLAUDE.md / docker-compose.yml
describe a single `api` service process, so there's no multi-instance case where
in-process state would fragment across processes -- if that changes, this needs to move
to a shared store (e.g. Redis), same as any other single-process-only cache here.

One limiter instance is shared across call sites by namespacing the `key` argument
(e.g. `f"key:{api_key_id}"` for a paying caller, `f"ip:{client_ip}"` for the anonymous
Data Explorer endpoints) so the two never collide in the same bucket dict.
"""

from __future__ import annotations

import time
from dataclasses import dataclass


@dataclass
class _Bucket:
    tokens: float
    last_refill: float


class TokenBucketLimiter:
    def __init__(self) -> None:
        self._buckets: dict[str, _Bucket] = {}

    def allow(self, key: str, rate_per_sec: float, burst: float | None = None) -> bool:
        """Consume one token for `key`. Returns False if none are available.

        `burst` (bucket capacity) defaults to `rate_per_sec` -- one second's worth of
        headroom, not an unbounded accumulation while idle.
        """
        capacity = burst if burst is not None else rate_per_sec
        now = time.monotonic()
        bucket = self._buckets.get(key)
        if bucket is None:
            bucket = _Bucket(tokens=capacity, last_refill=now)
            self._buckets[key] = bucket
        else:
            elapsed = now - bucket.last_refill
            bucket.tokens = min(capacity, bucket.tokens + elapsed * rate_per_sec)
            bucket.last_refill = now
        if bucket.tokens < 1:
            return False
        bucket.tokens -= 1
        return True

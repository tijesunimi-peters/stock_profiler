"""Repository interface for API keys (Milestone 3 auth).

Keys are stored hashed (see auth/keys.py) -- `get_by_hash` is the only lookup path,
there is no "list keys by plaintext" anything. Usage is tracked per (key, UTC calendar
day) for the daily quota -- a longer-window, billing-relevant cap, distinct from the
in-memory per-second rate limiter (auth/rate_limiter.py) which doesn't need to survive
a process restart.
"""

from __future__ import annotations

from abc import ABC, abstractmethod

from secfin.auth.models import ApiKeyRecord


class ApiKeyRepository(ABC):
    @abstractmethod
    def create_key(
        self,
        key_hash: str,
        email: str,
        tier: str,
        rate_limit_per_sec: int,
        daily_quota: int,
    ) -> ApiKeyRecord:
        """Create and return a new key record.

        Raises ValueError if `email` is already registered -- one key per email, v1
        simplicity (no key rotation/reissue flow yet; see api/auth_routes.py).
        """

    @abstractmethod
    def get_by_hash(self, key_hash: str) -> ApiKeyRecord | None:
        """The key record matching this hash, active or not, or None if it doesn't
        exist. Callers check `.active` themselves (see api/auth.py) -- kept out of the
        query so a revoked key still round-trips its own record for a clear 401 message
        ("revoked") rather than an indistinguishable "not found".
        """

    @abstractmethod
    def record_usage_and_get_count(self, api_key_id: int, day: str) -> int:
        """Atomically increment today's request count for this key and return the new
        total -- the caller compares it against `daily_quota` to decide whether to 429.
        `day` is a caller-supplied 'YYYY-MM-DD' (UTC) so the caller controls the clock,
        keeping this method pure w.r.t. wall-clock time for testing. Usage is recorded
        even for the request that pushes a key over quota -- the counter reflects
        attempted, not just served, requests (useful for spotting abusive over-quota
        traffic), so it can end up above `daily_quota`.
        """

    @abstractmethod
    def close(self) -> None:
        """Release the underlying connection."""

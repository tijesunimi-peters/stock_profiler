"""Repository interface for API keys (Milestone 3 auth).

Keys are stored hashed (see auth/keys.py) -- `get_by_hash` is the only lookup path,
there is no "list keys by plaintext" anything. Usage is tracked per (key, UTC calendar
day) for the daily quota -- a longer-window, billing-relevant cap, distinct from the
in-memory per-second rate limiter (auth/rate_limiter.py) which doesn't need to survive
a process restart.
"""

from __future__ import annotations

from abc import ABC, abstractmethod

from secfin.auth.models import ApiKeyRecord, DailyUsage, OpsOverview


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
    def get_by_email(self, email: str) -> ApiKeyRecord | None:
        """The key record registered to this email, or None. Email is unique per key
        (one key per email, same constraint `create_key` enforces) -- this is the lookup
        an admin tier change (`api/admin_routes.py`) uses, since an operator knows the
        customer's email, not their key hash.
        """

    @abstractmethod
    def update_tier(
        self, email: str, tier: str, rate_limit_per_sec: int, daily_quota: int
    ) -> ApiKeyRecord | None:
        """Move the key registered to `email` onto `tier` with the given limits, and
        return the updated record -- or None if no key is registered to that email.
        There's no self-service upgrade path (no payment integration yet); this is the
        manual mechanism admin_routes.py's tier-change endpoint calls.
        """

    @abstractmethod
    def revoke_key(self, email: str) -> ApiKeyRecord | None:
        """Set `active = False` on the key registered to `email` and return the updated
        record -- or None if no key is registered to that email. This is the mechanism
        `api/admin_routes.py`'s revoke endpoint calls (same admin-secret-gated,
        manual-only shape as `update_tier` -- no self-service path). A revoked key keeps
        its row (never deleted, same reasoning as tier changes) so `get_by_hash` still
        round-trips it for `api/auth.py`'s `not record.active` check to produce a clear
        401 rather than an indistinguishable "not found". Idempotent: revoking an
        already-inactive key just re-confirms `active = False` and returns it.
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
    def usage_by_day(self, api_key_id: int, since_day: str) -> list[DailyUsage]:
        """Stored per-day usage rows for this key on/after `since_day` ('YYYY-MM-DD'
        UTC), ordered by date ascending. Sparse -- a day with no recorded requests has no
        row here; a caller needing a complete window (e.g. `GET /v1/usage`, via
        `auth/usage.py`'s `usage_summary`) fills the gaps itself.
        """

    @abstractmethod
    def ops_overview(self, since_day: str) -> OpsOverview:
        """Aggregate operator snapshot across ALL keys: key totals (overall, active,
        active-by-tier), per-day traffic (total request count + distinct keys) and
        per-day signups on/after `since_day` ('YYYY-MM-DD' UTC). Sparse like
        `usage_by_day` -- days without traffic/signups have no row. Backs
        `GET /v1/admin/ops` (api/admin_routes.py); read-only.
        """

    @abstractmethod
    def close(self) -> None:
        """Release the underlying connection."""

# Code track notes

Working from `docs/product/LAUNCH_READINESS.md` §1 (pricing/tier-limit plumbing) and §6
(ops/abuse handling), scoped per the launch-code agent brief to: key revocation (the
priority), Stripe/billing plumbing (only if `docs/product/PRICING.md` exists and chose
self-serve), and tier-limit consistency across code/docs/static pages.

## 2026-07-11

### Starting state

- `docs/product/PRICING.md` does **not exist**. Confirmed before starting any billing
  work. Per the brief: do not invent prices, do not build Stripe plumbing. This blocks
  the entire pricing/billing half of §1. Reported as a blocker below, not attempted.
- Worktree branched from an older point on `master` (`ca3d1f9`, before the writing/infra
  tracks' merges landed). Merged current `master` into this branch (clean, no conflicts
  — the writing/infra tracks touched `src/secfin/api/static/*`, `docs/DEPLOYMENT.md`,
  `deploy/`, etc.; none of the files this track owns) so tier-limit verification could
  run against the real merged `/terms` and `/guide` pages rather than a stale copy.

### 1. Key revocation (§6, the priority)

Built exactly the pattern requested — the tier-change endpoint in
`api/admin_routes.py` as the template, same `X-Admin-Secret` header +
`secrets.compare_digest` gating, same 503-when-secret-unset behavior.

**What shipped:**

- `src/secfin/storage/api_key_repository.py` — new abstract method
  `ApiKeyRepository.revoke_key(email) -> ApiKeyRecord | None`.
- `src/secfin/storage/sqlite_api_key_repository.py` — SQLite impl: `UPDATE api_keys SET
  active = 0 WHERE email = ?`, returns the updated record (or `None` if no key is
  registered to that email). Idempotent — revoking an already-inactive key is a no-op
  UPDATE that still returns the (still-inactive) record.
- `src/secfin/api/admin_routes.py` — new `POST /v1/admin/keys/{email}/revoke`
  (`include_in_schema=False`, same as the tier-change route). 200 with
  `{"email": ..., "active": false}` on success, 404 if no key is registered to that
  email, 401/503 from the shared `require_admin_secret` dependency exactly like the
  tier-change route.

**Revocation semantics (as verified, not assumed):**

- Endpoint: `POST /v1/admin/keys/{email}/revoke`, header `X-Admin-Secret`.
- Auth failure modes: 503 if `SECFIN_ADMIN_SECRET` is unset; 401 on a missing/wrong
  secret; 404 if the email has no key.
- **A revoked key fails auth on its very next use — not eventually, immediately.**
  `api/auth.py`'s `require_api_key` was *already* checking `not record.active` (that
  line existed before this change, but nothing could ever set `active = False`, so it
  was dead code in production — only reachable in tests via a monkeypatch). `get_by_hash`
  reads fresh from SQLite on every call; there is no in-memory `ApiKeyRecord` cache
  anywhere in the request path (confirmed by reading `api/auth.py` and
  `api_key_repository.py` end to end — the only cache-shaped thing in this codebase is
  the *rate limiter's* token buckets, which are per-key-id counters, not identity/active
  -state; they don't need invalidating). So propagation delay is exactly "the next HTTP
  request", bounded only by ordinary SQLite same-file write/read visibility (WAL mode,
  same process). Verified end-to-end in
  `tests/test_app_auth_wiring.py::test_admin_revoke_end_to_end_key_fails_auth_immediately`:
  key works pre-revoke -> wrong secret rejected + key still works -> correct secret
  revokes -> the *next* request with the same key gets 401 with `"revoked"` in the
  detail string.
- The key's row is never deleted (matches `update_tier`'s precedent) — `get_by_hash`
  still round-trips a revoked key so the 401 body can say "revoked" rather than an
  indistinguishable "not found".

**Tests added** (all passing — see evidence below):
- `tests/test_api_key_repository.py`: `test_revoke_key_deactivates_the_key`,
  `test_revoke_key_returns_none_for_unknown_email`, `test_revoke_key_is_idempotent`,
  `test_revoke_key_does_not_change_other_keys`.
- `tests/test_admin_routes.py`: `test_revoke_key_deactivates_the_key`,
  `test_revoke_key_404s_for_unregistered_email`, `test_revoke_key_is_idempotent` (direct
  handler calls, mirroring the existing `change_tier` tests exactly).
- `tests/test_app_auth_wiring.py`: `test_admin_revoke_is_503_when_admin_secret_unconfigured`,
  `test_admin_revoke_end_to_end_key_fails_auth_immediately`,
  `test_admin_revoke_404s_for_unregistered_email` (full FastAPI TestClient, real
  signup -> real key -> real gated request -> real revoke -> real re-request).

Also updated the stale note in `docs/ROADMAP.md`'s M3 section ("No admin CLI / key
revocation yet -- unbuilt") to record what shipped and when, matching that doc's own
verification-log convention.

### 2. Pricing / Stripe plumbing (§1) — BLOCKED, not attempted

`docs/product/PRICING.md` does not exist, so there is no self-serve-vs-beta-notice
decision to build against. Per the brief and CLAUDE.md's "don't invent prices"
constraint, no Stripe integration, no billing code, no price points were written. This
is an operator decision (price points + self-serve vs. beta-notice posture), not a code
gap — `auth/tiers.py`'s limits and the manual admin-gated tier-change endpoint are
already the correct shape to sit behind a future Stripe webhook (it would call the same
`ApiKeyRepository.update_tier`), so no rework is anticipated once pricing is decided.

### 3. Tier-limit consistency (§1)

Checked every place tier numbers are stated against `auth/tiers.py`'s actual `TIERS`
dict (`free`: 5 req/s / 1,000 req/day; `basic`: 20 req/s / 25,000 req/day; `pro`: 100
req/s / 250,000 req/day):

- `src/secfin/api/static/terms.html` (writing track, already merged) — matches exactly.
  Already test-asserted by `tests/test_static_pages.py::test_terms_page_matches_published_tier_limits`.
- `src/secfin/api/static/guide.html` (writing track, already merged) — matches exactly.
  **Was not previously test-asserted** — added
  `tests/test_static_pages.py::test_guide_page_tier_table_matches_auth_tiers`.
- `docs/ROADMAP.md`, `docs/product/MARKET_FEASIBILITY.md` — matches exactly (both state
  free = 5 req/s / 1,000/day, basic = 20 req/s / 25K/day, pro = 100 req/s / 250K/day).
- `POST /v1/signup` response — not a duplicated number at all: `api/auth_routes.py`
  reads `TIERS[DEFAULT_TIER]` directly, so it's structurally incapable of drifting
  independent of `auth/tiers.py`.
- `GET /v1/admin/keys/{email}/tier` response — same: reads `TIERS.get(body.tier)`
  directly.

**Finding: no numeric drift found anywhere.** Everything already matches
`auth/tiers.py`'s current numbers exactly.

**Strengthened, not just re-verified:** `tests/test_static_pages.py`'s existing
`test_terms_page_matches_published_tier_limits` hard-coded the expected strings
(`"5 req/sec"`, `"1,000 req/day"`, etc.) — correct today, but if `auth/tiers.py` ever
changes, that test would keep passing against the *old* hard-coded numbers unless
someone remembered to update both the HTML and the test in lockstep. Changed it (and
the new guide.html test) to derive the expected strings from `TIERS` at import time
(`_EXPECTED_TIER_STRINGS` in `tests/test_static_pages.py`), so a future tier-limit
change breaks these tests immediately if the static pages aren't updated to match —
catching drift at the source of truth instead of relying on someone's memory.

**Enforcement-side check** (not just the published numbers): re-read
`api/auth.py::require_api_key` end to end. Confirmed both limits are actually
enforced, not just documented — per-key burst via `TokenBucketLimiter.allow(f"key:{id}",
record.rate_limit_per_sec)` (429 on exhaustion) and the daily quota via
`repo.record_usage_and_get_count` compared against `record.daily_quota` (429 when
`used > daily_quota`, so e.g. free's "1,000 req/day" allows exactly 1,000 successful
requests/day, matching the published number precisely — not off-by-one). Both read
`record.rate_limit_per_sec` / `record.daily_quota` fresh off the DB record on every
request, so a tier change (or the new revocation) takes effect on the very next request,
not after a restart. No gaps found; existing `tests/test_auth.py` already covers burst
and quota enforcement at the unit level, and `test_app_auth_wiring.py`'s
`test_admin_tier_change_end_to_end` covers a tier bump taking effect live.

### Evidence

```
docker compose build                              # clean rebuild, image bakes in src/
docker compose --profile test run --rm test       # 305 passed, 6 skipped, 1 warning
```

(Baseline after the writing+infra merge was 294 passed / 6 skipped per
`LAUNCH_READINESS.md`'s run log; +11 new tests here, all passing: 4 repository tests, 3
admin-route unit tests, 3 end-to-end wiring tests, 1 guide.html consistency test.)

### File-ownership compliance

Touched only: `src/secfin/storage/api_key_repository.py`,
`src/secfin/storage/sqlite_api_key_repository.py`, `src/secfin/api/admin_routes.py`,
`tests/test_api_key_repository.py`, `tests/test_admin_routes.py`,
`tests/test_app_auth_wiring.py`, `tests/test_static_pages.py`, `docs/ROADMAP.md`, this
file. Did not touch `src/secfin/api/static/`, `deploy/`, `docs/DEPLOYMENT.md`,
`scripts/verify_deployment.py`, `docker-compose*.yml`, other tracks' notes, or
`LAUNCH_READINESS.md`. Ran no ingest/backfill jobs; all tests use `:memory:` SQLite or
`tmp_path`, never `./data` or the compose volume; never ran `docker compose up api`.

### Blocked on the operator

1. **Price points** (`docs/product/PRICING.md` doesn't exist) — needed before any
   Stripe/billing code can be written without inventing numbers.
2. **Self-serve vs. beta-notice posture** — the launch posture decision in §1 gates
   whether Stripe plumbing is even the right next code task, or whether the
   already-shipped "free during beta" copy on `/terms` is sufficient for launch.

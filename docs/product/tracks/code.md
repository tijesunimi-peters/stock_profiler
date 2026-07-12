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

## 2026-07-11 (follow-up) — fixed a real bug the data track hit in this lane

The data track ran `python -m secfin.ingest.insider_backfill` against the live volume
(§3) and it silently no-opped: `insider backfill: 0 known issuer CIKs, limit=10`, exit
0, no error. Root cause traced by the data track (not fixed by them — forbidden to
patch source from that lane; see `docs/product/tracks/data.md` in the main checkout for
their full trace) and fixed here:

- `ingest/insider_backfill.py`'s `known_issuer_ciks()` only unioned
  `RawFactRepository.get_ingested_ciks(source)` for the two checkpoint sources
  (`ingest.backfill`, `ingest.incremental`). On the live DB, all 6,736 companies arrived
  via the API's cache-aside path (`upsert_raw_facts`, called directly by
  `api/routes.py`, which never writes a checkpoint row) — so `ingest_checkpoint` had 0
  rows even though `raw_facts` had 6,736 distinct CIKs.
- **Fix:** union in `RawFactRepository.all_ciks()` — `SELECT DISTINCT cik FROM
  raw_facts`, which **already existed** in the abstract repo + SQLite impl (added
  earlier for `metrics_backfill.py`, same "must cover every company with facts
  regardless of checkpoint" reasoning) — no repository/interface change needed, just
  wiring it into this one call site. Safe to trust as an issuer-only universe for the
  same reason the module's docstring gives for the checkpoint sources: `raw_facts` is
  written only by companyfacts fetches keyed on a real issuer CIK (bulk zip,
  incremental, or a ticker-resolved cache-aside fetch) — never by the SEC daily index's
  arbitrary filer-CIK list, which is the actual reporting-owner mis-attribution risk
  the filter guards against.
- `ingest_checkpoint` semantics untouched; this job remains a pure reader (no writes to
  `ingest_checkpoint`, no change to the single-writer backfill/incremental path).
- Regression test added: `tests/test_insider_backfill.py::
  test_known_issuer_ciks_falls_back_to_raw_facts_when_checkpoint_table_is_empty` —
  writes a fact via `upsert_raw_facts` only (no checkpoint), asserts
  `known_issuer_ciks()` still returns that CIK.
- Verified via `docker compose --profile test run --rm test` only, against this
  worktree's own isolated Docker project (`agent-a178622e33cfab826-*`) — **306 passed, 6
  skipped** (was 305/6 before this fix's one new test). Did not run the actual insider
  backfill, did not touch the live volume, did not rebuild or restart
  `stock_profiler-api-1` or the data track's in-flight `stock_profiler-api-run-...`
  container (both confirmed still `Up` via `docker ps -a` after this work).
- Commit: `eb49d6b` on this same branch (`worktree-agent-a178622e33cfab826`), on top of
  the earlier revocation/tier-consistency work.

## 2026-07-12 — follow-up round 2: two more real bugs the data track hit

The data track completed §3 (insider 294 -> 162,050 transactions; 13F 585 -> 7,321
snapshots) and found two more real bugs while running the 13F backfill and spot-checking
the launch basket. Full traces in `docs/product/tracks/data.md` (main checkout). Both
fixed here, read-only diagnosis credit to the data track.

### Bug 1: `institutional_backfill._process_candidate` didn't isolate storage failures

`repo.upsert_snapshot(snapshot)` sat OUTSIDE any try/except. A real manager (CIK
1890906, accession 0001890906-26-000040) crashed a live Q1 2026 run ~1h05m in:
`sqlite3.IntegrityError: UNIQUE constraint failed:
holdings_other_managers.manager_cik, .report_period, .sequence_number`. Candidate order
is deterministic (zip `namelist()` order) and CIK 1890906's data doesn't change, so a
bare rerun would have hit the identical crash and made zero progress on the ~2,040
candidates after it (8,803 total, 6,759 attempted before the crash).

**Fixes (both, not just the must-have):**
1. **Per-candidate isolation** (`src/secfin/ingest/institutional_backfill.py`):
   `_process_candidate` now wraps `resolve_snapshot_cusips` + `repo.upsert_snapshot`
   in their own `try/except Exception`, logs CIK/report_period/accession, returns
   `"failed"` (tallied and logged like fetch-side failures already were) instead of
   propagating. The job's own final log line already reported a failure count -- no
   change needed there, just making sure a bad candidate reaches it instead of killing
   the process.
2. **Root cause itself, also fixed** (`src/secfin/sec/institutional.py`'s
   `parse_cover_page_xml`): the actual EDGAR quirk was two DIFFERENT co-filing
   managers listed under the SAME `sequenceNumber` on one cover page. Deduped at parse
   time -- first entry for a given `sequenceNumber` wins, later duplicates dropped
   (lossy but deterministic; the alternative was a hard constraint violation). This
   means CIK 1890906's own quarter can now actually be stored, not just fail cleanly.

**Tests added:**
- `tests/test_institutional_backfill.py::test_process_candidate_isolates_a_storage_failure_and_keeps_going`
  -- reproduces the exact mechanism (two `OtherManager13F` entries sharing a
  `sequence_number`) against the REAL `SQLiteHoldingsSnapshotRepository`, confirms
  `_process_candidate` returns `"failed"` rather than raising, and confirms the failed
  candidate leaves no partial row (`get_snapshot` returns `None`).
- `tests/test_institutional.py::test_parse_cover_page_xml_dedupes_a_reused_sequence_number`
  -- synthetic cover-page XML with a reused `sequenceNumber`, asserts the roster keeps
  only the first entry.

### Bug 2: `has_any_facts` didn't distinguish real companyfacts rows from frame-only rows

Confirmed live by the data track: `GET /companies/PLTR/statements/income` (and every
other statement, every period) 404s permanently, with no self-heal -- same for GME, and
structurally for 6,721 of the 6,736 known CIKs on the pre-launch DB. Root cause:
`api/routes.py`'s `_statement_facts_for_cik` treats `repo.has_any_facts(cik) is True` as
"known company, this period is genuinely empty" and skips the live SEC fallback that's
supposed to self-heal a cache miss. But `has_any_facts` was just `SELECT 1 FROM
raw_facts WHERE cik = ?` -- true for a CIK that only ever got a ROW via cross-company
frame screening (`ingest/frames_backfill.py`, which deliberately leaves `fiscal_year`
unset -- see `normalize/screening.py`), not just for a real companyfacts ingestion.

**Fix:** scoped `has_any_facts` (`src/secfin/storage/sqlite_repository.py` +
`repository.py`'s interface docstring) to `fiscal_year IS NOT NULL` -- true only for a
real companyfacts ingestion (bulk, incremental, or a ticker-resolved cache-aside
fetch), false for frame-only rows. One-line SQL change behind the existing interface,
no new method needed; `_statement_facts_for_cik` itself is unchanged, it just gets a
correct answer now.

**Per-call-site check on `all_ciks()`/`has_any_facts()` more broadly** (the coordinator
asked me to think this through, not apply one fix everywhere):
- `metrics_backfill.py`'s `all_ciks()` use: **left unchanged, correctly**. The metrics
  engine (`normalize/metrics.py`) derives periods from `period_start`/`period_end`/
  `instant` date math, not from `fiscal_year`/`fiscal_period` -- frame-only rows carry
  real dates, so metrics genuinely compute over them. This is WHY peer ranking works
  at all for PLTR/GME today (confirmed by the data track: FY2023 peer ranks exist
  precisely because of this frame-scan data). Not a bug.
- `sic_backfill.py`'s `all_ciks()` use: **left unchanged**. SIC classification is a
  per-company lookup that applies equally to a frame-only-known company; scoping it
  down would only lose SIC coverage for peer-grouping with no correctness upside.
- `insider_backfill.py`'s `all_ciks()` use (my own earlier fix, round 1): **left
  unchanged, deliberately** -- the coordinator's brief specifically floated narrowing
  this too ("probably ALSO wants real issuers only"). Traced through it and concluded
  narrowing would be WRONG: frame data only ever comes from real SEC registrants (same
  safety property the module's docstring already relies on for the checkpoint
  sources), so a frame-only CIK is not a mis-attribution risk. The data track's own
  real run already confirmed the current behavior is good: 6,315 of 6,736 candidates
  came back with real cached Forms 3/4/5 (60,744 filings, 162,050 transactions).
  Narrowing to the 15 real-companyfacts-only CIKs would have thrown that entire,
  already-verified result away for zero correctness gain -- the statements route's
  self-heal concern and this job's mis-attribution-safety concern are different
  questions that happen to both touch `all_ciks()`, not the same bug. Documented this
  reasoning directly in `insider_backfill.py`'s module docstring so a future reader
  doesn't "fix" it into a regression, and added
  `tests/test_insider_backfill.py::test_known_issuer_ciks_deliberately_includes_frame_only_ciks`
  to lock the decision in as a regression test.

**Tests added:**
- `tests/test_storage.py::test_has_any_facts_returns_false_for_frame_only_rows` --
  direct repository-level test (PLTR's real CIK, a frame-only fact).
- `tests/test_routes_cache.py::test_statement_facts_frame_only_cik_still_falls_back_to_sec`
  -- route-level, using the REAL `SQLiteRawFactRepository` (not `_FakeRepo`, which
  hand-implements `has_any_facts` as `bool(self._facts)` and so cannot reproduce this
  bug at all): seeds one frame-only fact for PLTR's CIK, confirms
  `_statement_facts_for_cik` still calls the live SEC fetch instead of returning `[]`.
- `tests/test_insider_backfill.py::test_known_issuer_ciks_deliberately_includes_frame_only_ciks`
  -- see above.

### Regression check

Did NOT regress the round-1 checkpoint-empty fix: `known_issuer_ciks`'s existing tests
(including `test_known_issuer_ciks_falls_back_to_raw_facts_when_checkpoint_table_is_empty`)
still pass unchanged -- that fix used a real-fiscal-anchored fact, which is untouched by
the `has_any_facts` scoping (a different method, different table semantics, no shared
code path).

### Evidence

```
docker compose build                              # clean rebuild, this worktree's own
                                                   # isolated compose project
docker compose --profile test run --rm test       # 311 passed, 6 skipped, 1 warning
```

(Was 306/6 after round 1; +5 new tests here, all passing.) Confirmed via `docker ps -a`
throughout that `stock_profiler-api-1` (the live API) was untouched -- no rebuild, no
restart, no live-volume access, no backfill run.

### Handoff

Per the coordinator's plan: the ~2,040 never-attempted 13F candidates from the crashed
run can now be picked up by a plain rerun of `institutional_backfill --period
2026-03-31` (already-cached managers skip instantly via `cached_accession`; the
previously-fatal manager and everything after it will now be attempted, and any
individual failure will be isolated rather than fatal). PLTR/GME (and the other 6,721
frame-only CIKs) should now self-heal on their NEXT statement request -- the fix takes
effect the moment the rebuilt image is deployed, no data migration needed (existing
frame-only rows are left as-is; the fix only changes how `has_any_facts` reads them).

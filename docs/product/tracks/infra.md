# Infra track notes

Working from `docs/product/LAUNCH_READINESS.md` §2 (Production deployment). This
track is prep-only: no VPS/domain exists yet, so everything below is written and
tested against a local `docker compose up api`, not a real host. See the final
message of this run for the ordered operator-action list.

## 2026-07-11

### Files produced

- `docs/DEPLOYMENT.md` -- the deploy runbook: why single-process is a hard
  constraint (not a TODO), operator prerequisites, server setup, full env-var
  checklist cross-referenced against `src/secfin/config.py`, domain+TLS via Caddy,
  volume layout (unchanged two-mount split), restoring from a local backup instead of
  re-backfilling on the VPS, scheduled jobs, uptime monitoring, log-review routine,
  post-deploy verification, day-2 ops, and the ordered operator-only checklist.
- `docker-compose.prod.yml` (repo root) -- standalone production compose file (NOT a
  merge overlay on `docker-compose.yml` -- documented why: Compose concatenates
  list-valued keys like `ports` across `-f` files rather than replacing them, so an
  overlay approach would leave the dev file's `0.0.0.0:8000:8000` binding active
  alongside a loopback-only one, defeating the point). Adds a `caddy` service and
  binds `api` to `127.0.0.1:8000` only.
- `deploy/Caddyfile` -- reverse proxy + automatic Let's Encrypt TLS config, JSON
  access logging to stdout (feeds the log-review routine).
- `deploy/systemd/secfin-incremental.{service,timer}` -- daily incremental ingest,
  06:00 UTC.
- `deploy/systemd/secfin-backup.{service,timer}` -- scheduled backup + retention
  pruning, 07:00 UTC (after incremental, so the day's backup includes that day's
  data).
- `deploy/scripts/run-incremental.sh`, `deploy/scripts/run-backup.sh` -- wrapper
  scripts the systemd units call; each appends an `OK`/`FAIL` status line to
  `/var/log/secfin/{incremental,backup}.status` in addition to normal
  stdout/stderr (captured by journald) -- two independent ways to check for a
  failure, neither requiring an alerting stack.
- `deploy/install.sh` -- one-shot installer: creates an unprivileged `secfin` system
  user (in the `docker` group), installs + enables both timers.
- `scripts/verify_deployment.py` -- end-to-end post-deploy check, runnable from
  outside the host via `--base-url`.

### What's verified locally (with evidence)

All of the following ran against this worktree's own Docker, using a real (if
placeholder) `SEC_USER_AGENT` -- confirmed outbound network access to
`data.sec.gov` works from this sandbox (`curl -I https://data.sec.gov` -> HTTP 403
from SEC's WAF, the expected response to a generic non-compliant client per
CLAUDE.md, not a network failure).

1. **`docker compose build`** -- succeeds, image builds clean.
2. **`docker-compose.prod.yml` structural validation** -- `docker compose -f
   docker-compose.prod.yml config` resolves correctly: `api` bound to
   `127.0.0.1:8000` only (not `0.0.0.0`), `caddy` on `80`/`443`, both env-var
   substitution and the `SEC_USER_AGENT` required-var guard work identically to the
   dev file.
3. **`docker-compose.prod.yml` actually starts** -- brought up both `api` and
   `caddy` locally. `api` answered `/health` on `127.0.0.1:8000` as expected. Caddy
   logs confirm the ACME flow runs correctly end to end (registers an account,
   requests a certificate) and fails gracefully with a placeholder domain
   (`api.example.com` -- Let's Encrypt's policy-based rejection, not a config bug),
   retrying in the background rather than crashing the container. This is exactly
   the behavior an operator would see if they forgot to edit the Caddyfile, which
   is reassuring rather than concerning.
4. **`scripts/verify_deployment.py` -- full 10/10 pass against a live
   `docker compose up api`**, including a REAL SEC network call (not a stub): the
   gated `/v1/companies/AAPL/beneficial-ownership` check returned actual live SEC
   data (3 real beneficial-ownership rows for Apple, cache-aside fetched from SEC on
   the first request). Also verified: `/health` 200, `POST /v1/signup` issues a
   real key, unknown-ticker 404 (found and fixed a script bug along the way -- the
   statements endpoint requires a `year` query param, which 422s before ticker
   resolution if omitted; fixed by passing `year=2024`), a burst of 15 requests
   against `/v1/usage` on one free-tier key produced 5 `200`s then `429`s (matches
   `auth/tiers.py`'s free tier: 5 req/s), `/docs` and all four static pages
   (`/`, `/explorer`, `/guide`, `/coverage`) loaded. Exit code confirmed `0`.
5. **Restore-into-fresh-volume, end to end**: seeded real data (signed up 4 keys,
   fetched real AAPL beneficial-ownership data via the gated endpoint), ran
   `docker compose run --rm api python -m secfin.storage.backup`, confirmed via a
   read-only sqlite3 connection that `beneficial_ownership` had 3 rows and
   `api_keys` had 4 rows, then `docker compose down -v` (destroying the
   `secfin-data` volume entirely), then `docker compose run --rm api python -m
   secfin.storage.restore --latest` into the resulting fresh volume, then
   `docker compose up -d api` and re-ran the same read-only checks: **identical row
   counts survived the volume wipe**, and a pre-wipe API key still authenticated
   successfully post-restore against the gated endpoint, serving the restored data
   from cache with no new SEC call. Then re-ran `verify_deployment.py` once more
   post-restore: 10/10 again. This is the local proxy for docs/DEPLOYMENT.md §7's
   cross-machine restore (scp a backup to a fresh VPS) -- the restore mechanism
   itself is proven; only the "copy the file to a different machine" step is
   untested (nothing to test without a second host).

### What's prepped but unverifiable without a real host

- TLS certificate issuance actually succeeding (needs a real domain resolving to a
  real public IP the ACME HTTP-01 challenge can reach -- confirmed the *mechanism*
  works up to the point where Let's Encrypt's policy rejects the placeholder
  domain, per the log excerpt above).
- The systemd timer units and `deploy/install.sh` (needs a systemd host; this
  sandbox's Docker containers don't run systemd as PID 1). Reviewed by hand
  (`bash -n` syntax-checked both wrapper scripts) but not executed under systemd
  itself.
- The external uptime-pinger integration (needs an account -- operator action).
- `scripts/verify_deployment.py` against an actual public domain over real TLS
  (tested over plain HTTP against localhost/loopback only).
- Cross-machine backup transfer (`scp ... your-vps:...` in §7) -- the restore
  mechanism is proven locally; only the "different machine" part is unexercised.

### Guardrails followed

- No application source under `src/secfin/` touched.
- No paid service provisioned or account created on the operator's behalf --
  `deploy/Caddyfile`'s domain and every "operator action" in
  `docs/DEPLOYMENT.md` are explicit placeholders/checklist items, not filled in.
  `.env` created locally in this worktree only, for testing; it's git-ignored and
  was not committed.
- Did not touch `docs/product/LAUNCH_READINESS.md` -- checkbox state is
  orchestrator-owned; this file is my report instead.
- Did not touch `tests/`, static pages, or other tracks' files.

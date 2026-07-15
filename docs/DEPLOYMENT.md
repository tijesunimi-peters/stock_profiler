# Deployment runbook: single small VPS

Target shape: **one small VPS, running the existing Docker image, one uvicorn
process, behind a reverse proxy for TLS.** Nothing here needs a second server, a
managed database, or an orchestrator -- that's deliberate, not a stopgap; see
docs/product/LAUNCH_READINESS.md §2 and the "Why one process" section below before
reaching for `--workers` or a bigger box.

This is a prep-only document: everything in it is written and testable against a local
`docker compose up api` today, without a host. The operator-only actions (buying a
domain, provisioning a VPS, pointing DNS, creating secrets) are called out explicitly
and collected in the checklist at the end.

> **A real deployment now exists** (2026-07-14): DigitalOcean droplet serving
> clearyfi.com / api.clearyfi.com. `docs/DEPLOYMENT_DO.md` is the as-built record --
> what's running, the exact provisioning commands, where it deviates from this
> runbook (notably: rsync instead of `git clone`, two-host Caddyfile), and the
> current day-2 flow. This file stays the generic runbook; that one is the truth
> about production.

## Contents

1. [Why one process -- read this first](#1-why-one-process----read-this-first)
2. [Operator prerequisites](#2-operator-prerequisites)
3. [Server setup](#3-server-setup)
4. [Environment checklist](#4-environment-checklist)
5. [Domain + TLS (Caddy)](#5-domain--tls-caddy)
6. [Volume layout](#6-volume-layout)
7. [First boot: bootstrap from a local backup instead of re-backfilling](#7-first-boot-bootstrap-from-a-local-backup-instead-of-re-backfilling)
8. [Scheduled jobs](#8-scheduled-jobs)
9. [Uptime monitoring](#9-uptime-monitoring)
10. [Log-review routine](#10-log-review-routine)
11. [Post-deploy verification](#11-post-deploy-verification)
12. [Day-2 operations](#12-day-2-operations)
13. [Operator action checklist (ordered)](#13-operator-action-checklist-ordered)

## 1. Why one process -- read this first

The app keeps two pieces of state **in a single process's memory**, not in SQLite or
any shared store:

- **`auth/rate_limiter.py`'s `TokenBucketLimiter`** -- the per-API-key and per-IP
  token buckets that back `require_api_key`'s 429s and `limit_anonymous_traffic`. One
  dict, one process. Two uvicorn workers means two independent buckets per key, each
  silently allowing the configured rate -- a key's real limit doubles (or Nx's) with
  no code change and no error, just quietly weaker abuse protection.
- **`sec/client.py`'s `_shared_default_limiter`** -- the process-wide `RateLimiter`
  every `SECClient()` instance shares, which is what keeps aggregate outbound SEC
  request volume under `sec_max_rps` even when many concurrent API requests each
  construct their own `SECClient`. Confirmed live (2026-07-07, docs/ROADMAP.md) that a
  per-instance limiter -- the pre-fix behavior, and exactly what you get again with N
  independent worker processes each holding their own module-level singleton --
  lets concurrent requests each get an independent, uncoordinated budget. With N
  worker processes you can burst to N times `sec_max_rps` against SEC's servers,
  which is the one hard compliance line in CLAUDE.md.

**Do not add `uvicorn --workers N`, a process manager that forks workers, or multiple
container replicas behind a load balancer without first moving both of the above into
shared state** (e.g. Redis-backed rate limiting, or a separate outbound-request
gateway process). Until that redesign happens, this is a hard single-process
constraint, not a performance knob left un-turned. If load ever justifies revisiting
it, that's a code-track task, not an infra config change.

Practically, this means the deploy target is sized for "one small VPS is enough," not
"start small and add workers later" -- vertical headroom (a bigger single-core-bound
box) is the correct lever if the free/warm-cache path ever needs more throughput, per
the load-test evidence in docs/ROADMAP.md (warm hits ~11-14ms).

## 2. Operator prerequisites

These cannot be scripted or done in advance -- they need a person with a payment
method and account access. Everything else in this document works without them
already prepared, and is written to consume them once they exist. Full ordered list
in §13; the short version:

- A domain name (or a subdomain of one you already own)
- A VPS (any provider; 1 vCPU / 1-2GB RAM is plenty for this workload -- it's I/O- and
  SEC-throttle-bound, not CPU-bound)
- DNS: an A/AAAA record for the chosen (sub)domain pointed at the VPS's IP
- A long random value for `SECFIN_ADMIN_SECRET` (generate with e.g. `openssl rand -hex 32`)
- (Optional, §9) a free-tier account with an uptime-ping service

## 3. Server setup

Any small Ubuntu/Debian VPS works; adjust package manager names for other distros.

```bash
# 1. Install Docker + Compose plugin (Docker's official convenience script covers both)
curl -fsSL https://get.docker.com | sh

# 2. Clone the repo to the path the systemd units below expect
sudo mkdir -p /opt/secfin
sudo git clone <your-fork-or-repo-url> /opt/secfin
cd /opt/secfin

# 3. Configure environment (see §4 for what each var means)
cp .env.example .env
$EDITOR .env   # set SEC_USER_AGENT (real contact email) and SECFIN_ADMIN_SECRET at minimum

# 4. Point the Caddyfile at your real domain (see §5)
$EDITOR deploy/Caddyfile   # replace api.example.com

# 5. Build and start
docker compose -f docker-compose.prod.yml build
docker compose -f docker-compose.prod.yml up -d

# 6. Confirm it's up (from the VPS itself, before DNS/TLS are live)
curl http://127.0.0.1:8000/health
```

`docker-compose.prod.yml` (repo root) is a **standalone** production compose file, not
an overlay on top of the dev `docker-compose.yml` -- see the comment at the top of that
file for why (Compose merges list-valued keys like `ports` by concatenation, not
replacement, so overlaying a loopback-only binding on top of the dev file's
`0.0.0.0:8000:8000` would leave both active). It adds one thing beyond the dev file: a
`caddy` service that terminates TLS and reverse-proxies to the `api` service, which
itself is now published to `127.0.0.1:8000` only, not `0.0.0.0` -- so the only public
entry point is Caddy on 80/443.

## 4. Environment checklist

Every variable `docker-compose.prod.yml` forwards into the container, from
`src/secfin/config.py` (the compose allowlist mirrors it exactly -- if you add a new
setting there, add it to both compose files):

| Variable | Required in prod? | What it does | Default |
|---|---|---|---|
| `SEC_USER_AGENT` | **Yes -- compose refuses to start without it** | Sent on every SEC request; SEC blocks requests without a descriptive UA + real contact email (CLAUDE.md, non-negotiable). Use a real address you monitor -- SEC has been known to email operators of misbehaving clients. | none (fails fast) |
| `SECFIN_DB_PATH` | No (fixed by compose) | SQLite file location inside the container. Compose sets `/app/data/secfin.db`, under the `secfin-data` volume. | `/app/data/secfin.db` |
| `SECFIN_BACKUP_DIR` | No (fixed by compose) | Where `storage/backup.py` writes snapshots. Compose sets `/app/backups`, bind-mounted to `./data/backups` on the host -- deliberately a *separate* mount from the data volume (§6). | `/app/backups` |
| `SEC_MAX_RPS` | No, but do not raise carelessly | Outbound SEC request ceiling, enforced by the process-wide limiter (§1). Verified 2026-07-07: SEC's own published ceiling is 10 req/s/IP; the default of 8 keeps a safety margin. | `8` |
| `SECFIN_ADMIN_SECRET` | **Set before you rely on admin endpoints** | Shared secret (`X-Admin-Secret` header) gating `api/admin_routes.py` (moving a key to a paid tier). Admin routes 503 while empty -- safe default, but you'll want this set before doing any manual tier changes on real customers. Generate with `openssl rand -hex 32`; treat it like a password. | `""` (admin routes disabled) |
| `SECFIN_ANON_RATE_LIMIT_PER_SEC` | No | Per-IP burst limit for the keyless public endpoints (`/statements`, `/periods`) and the Data Explorer. | `2.0` |
| `SECFIN_BACKFILL_WORKERS` / `_BATCH_SIZE` / `_QUEUE_MAXSIZE` | No | Bulk-backfill tuning only -- irrelevant to steady-state serving; only matters if you run `secfin.ingest.backfill` on the VPS instead of restoring from a local backup (§7 recommends restoring). | `0` / `5000` / `50` |

Not in the compose allowlist, and deliberately not exposed as an env var to tune per
deploy: `secfin_bulk_data_dir`, `secfin_ticker_cache_ttl_seconds`,
`secfin_peer_sic_digits`, `secfin_peer_min_size` -- these are fixed application
behavior, not per-environment configuration (see `config.py`'s own comments for why
each is fixed).

## 5. Domain + TLS (Caddy)

Caddy is the recommended reverse proxy here because it needs the least ongoing care:
point a domain at the box, hand it a `Caddyfile` with that domain, and it obtains and
renews a Let's Encrypt certificate on its own -- no certbot timers, no manual renewal.
This is a recommendation for a solo operator, not a technical requirement of the app;
swap in nginx+certbot or Cloudflare Tunnel if you already run one of those and don't
want to add Caddy to your toolbox.

Steps:

1. Operator action: buy/choose a domain, create an A (and/or AAAA) record for e.g.
   `api.yourdomain.com` pointed at the VPS's public IP. Wait for it to resolve
   (`dig api.yourdomain.com` from another machine).
2. Edit `deploy/Caddyfile`, replacing `api.example.com` with your real domain.
3. Make sure ports 80 and 443 are open on the VPS's firewall/security group -- Caddy
   needs 80 for the ACME HTTP-01 challenge even though the app itself is only ever
   reached over 443 afterward.
4. `docker compose -f docker-compose.prod.yml up -d` (or restart the `caddy` service if
   already running). The first request to the domain triggers certificate issuance;
   check `docker compose -f docker-compose.prod.yml logs caddy` if it doesn't come up
   within a minute or two.

## 6. Volume layout

Unchanged from local dev (docs/DEVELOPMENT.md §6-7), and deliberately so -- the
production compose file uses the same two-mount split:

- **`secfin-data`** (named Docker volume, mounted at `/app/data`): the SQLite DB
  (`secfin.db`, its `-wal`/`-shm` sidecars) and the bulk backfill's downloaded zips.
  Lost if you ever run `docker compose down -v`.
- **`./data/backups`** (host bind mount, mounted at `/app/backups`): `storage/backup.py`
  snapshots, including the rolling `secfin-latest.db`. A real directory on the VPS's
  disk, independent of the named volume above -- it survives `down -v` and is what you
  actually rely on for disaster recovery. Back this directory up off-host too (e.g. an
  encrypted rsync/rclone to object storage) if the VPS's disk itself is a single point
  of failure you care about -- that's beyond this runbook's scope but worth a line in
  your own notes once you pick a provider.

## 7. First boot: bootstrap from a local backup instead of re-backfilling

If you already ran the bulk backfill locally (`docs/DEVELOPMENT.md` §4, or the data
track's seeded volume), **do not re-run `secfin.ingest.backfill` against SEC's bulk
zips a second time on the VPS** -- that's hours of redundant download+parse for data
you already have. Instead, hydrate the VPS's fresh volume from a local backup:

```bash
# On your local machine (wherever the source DB/backup already lives):
docker compose run --rm api python -m secfin.storage.backup
# -> writes ./data/backups/secfin-<timestamp>.db and secfin-latest.db

# Copy that file to the VPS (scp, rsync, whatever you have):
scp ./data/backups/secfin-latest.db your-vps:/opt/secfin/data/backups/secfin-latest.db

# On the VPS, with the stack not yet started (or stopped first):
cd /opt/secfin
docker compose -f docker-compose.prod.yml run --rm api python -m secfin.storage.restore --latest
docker compose -f docker-compose.prod.yml up -d
```

`storage/restore.py` requires the destination not be held open by another process
(hence restoring before `up -d`, or after a `down`) and cleans up stale `-wal`/`-shm`
sidecars before copying the backup in, so a re-restore onto an existing volume is
safe. This is the exact round-trip already verified against the live volume locally
(docs/ROADMAP.md, 2026-07-07) -- this section only adds the "and now do it across
machines via scp" step, no new mechanism.

If you're starting a VPS with no prior backup at all, the app still works from an
empty DB (cache-aside on every route) -- it'll just be cold on every first request per
company until either the scheduled incremental job or organic traffic warms it. Not
recommended as the actual launch plan (see LAUNCH_READINESS.md §3, the data track);
mentioned here only because it's not a hard failure if you end up here.

## 8. Scheduled jobs

Two recurring jobs, both already run manually in dev (docs/DEVELOPMENT.md §5, §7) and
now wrapped as systemd timers under `deploy/`:

- **Daily incremental ingest** (`secfin-incremental.timer` -> `.service`, 06:00 UTC) --
  runs `python -m secfin.ingest.incremental` via the same image/command as dev.
- **Scheduled backup** (`secfin-backup.timer` -> `.service`, 07:00 UTC, one hour after
  the incremental job so the day's backup includes that day's newly-ingested data) --
  runs `python -m secfin.storage.backup`, then prunes timestamped snapshots older than
  `SECFIN_BACKUP_RETENTION_DAYS` (default 14; never touches `secfin-latest.db`).

**Why systemd timers instead of cron:** the VPS already runs systemd (true of every
mainstream distro this runbook targets), so timers need no extra package, unlike cron
on some minimal cloud images. More importantly for a solo operator, systemd gives
failure visibility for free -- `systemctl list-timers`, `systemctl status
secfin-incremental.service`, and `journalctl -u secfin-incremental.service` all work
out of the box, whereas cron's default failure mode is a silent no-op unless you've
separately wired up `MAILTO` and a working local MTA. Each job's wrapper script
(`deploy/scripts/run-*.sh`) *also* appends a plain `OK`/`FAIL` line to
`/var/log/secfin/{incremental,backup}.status` -- a second, even lower-ceremony check
that doesn't require knowing `journalctl` flags (`tail /var/log/secfin/*.status`).

Install (as root, once):

```bash
cd /opt/secfin
sudo ./deploy/install.sh
```

This creates an unprivileged `secfin` system user (in the `docker` group, so it can run
`docker compose` without being root), copies the unit files into
`/etc/systemd/system/`, and enables+starts both timers. Re-run it after editing a unit
file to pick up the change (`systemctl daemon-reload` + re-enable happens inside the
script).

Check on it later:

```bash
systemctl list-timers 'secfin-*'                       # next/last run time for each
journalctl -u secfin-incremental.service --since today  # full stdout/stderr
tail -5 /var/log/secfin/incremental.status /var/log/secfin/backup.status
```

## 9. Uptime monitoring

Recommendation: one free-tier external ping service (e.g. UptimeRobot, Better Stack,
or Healthchecks.io's "heartbeat" mode) hitting:

```
GET https://api.yourdomain.com/health
```

at a 1-5 minute interval, alerting you (email/push -- whatever the free tier offers)
on a failed check or a run of consecutive failures. `/health` (`api/main.py`) returns
a bare `{"status": "ok"}` with no DB/SEC dependency check -- it's a liveness probe for
"is uvicorn up and answering," not a full dependency health check. That's
proportionate for a solo-operator product; if it ever needs to also verify the DB
connection or cache-aside path is healthy, that's a code-track addition to `/health`
itself, not something to fake from the outside.

This is the entire monitoring stack recommended here -- no Prometheus/Grafana, no
paging service, no SLO dashboard. One external pinger plus the log-review routine
below (§10) is proportional to what a single VPS serving a beta product needs;
revisit only if traffic/revenue justifies more.

## 10. Log-review routine

No log aggregation service -- proportionate to one VPS. A short, repeatable routine
using tools already on the box:

```bash
# Yesterday's request volume + status-code breakdown, from Caddy's JSON access log
# (the Caddyfile's `log { output stdout; format json }` block, §5):
docker compose -f docker-compose.prod.yml logs --since 24h caddy \
  | grep -o '"status":[0-9]*' | sort | uniq -c | sort -rn

# 5xx spikes specifically -- anything here is either an uncaught app bug or (more
# likely, per api/main.py's exception handlers) a run of upstream SEC failures:
docker compose -f docker-compose.prod.yml logs --since 24h caddy | grep '"status":5'

# The app's own stdout/stderr (uvicorn access log + any traceback that reached it):
docker compose -f docker-compose.prod.yml logs --since 24h api | tail -200
```

Suggested cadence: once a day while traffic is low (a couple of minutes, e.g. right
after checking the scheduled-job status files in §8), moving to "on uptime-pinger
alert" once you trust the steady state. This is intentionally a routine, not
automation -- building an alerting/log-shipping stack for a single-VPS beta product
would cost more operator time than it saves; revisit if/when traffic volume makes
manual review impractical.

## 11. Post-deploy verification

`scripts/verify_deployment.py` is the automated version of
LAUNCH_READINESS.md §2's "verify end-to-end: signup -> key -> gated request -> 429
behavior, from outside the host." Run it from any machine with network access to the
deployed domain (it only needs `httpx`, already a production dependency):

```bash
python3 scripts/verify_deployment.py --base-url https://api.yourdomain.com
```

It checks, in order: `/health`, `POST /v1/signup` (issues a real free-tier key),
a gated endpoint with that key returns 200, an unknown ticker 404s, a burst of
requests on the fresh key trips the free-tier 429, `/docs` loads, and the static
marketing/product pages (`/`, `/explorer`, `/guide`, `/coverage`) load. Exits nonzero
if anything fails, with a PASS/FAIL line per check -- see the script's own docstring
for exact behavior. Verified locally against `docker compose up api` (see
`docs/product/tracks/infra.md` for the run and its output); running it again against
the real deployed host once one exists is the actual convergence-phase gate.

## 12. Day-2 operations

**Deploying a code change:**

```bash
cd /opt/secfin
git pull
docker compose -f docker-compose.prod.yml build   # image bakes in src/ -- must rebuild
docker compose -f docker-compose.prod.yml up -d   # recreates only the changed service
```

There will be a few seconds of downtime while the `api` container restarts (single
process, no rolling replacement without a second process -- see §1 for why not to
add more processes casually). Acceptable for a solo-operator beta product; note it if
that ever changes.

**Restarting after a host reboot:** `restart: unless-stopped` on both services in
`docker-compose.prod.yml` means Docker's own restart policy brings them back once the
Docker daemon starts, without any extra systemd unit needed for the app itself
(only the two ingest/backup timers in §8 are separate systemd units).

**Rotating `SECFIN_ADMIN_SECRET` or `SEC_USER_AGENT`:** edit `.env`, then
`docker compose -f docker-compose.prod.yml up -d` (recreates the `api` container with
the new environment; no rebuild needed since these are runtime env vars, not baked
into the image).

## 13. Operator action checklist (ordered)

Everything else in this document is already written/scripted; these are the only
steps that need a human with account/payment access, in the order they actually block
each other:

1. **Buy/choose a domain** (or a subdomain of one already owned).
2. **Provision a VPS** (any provider; 1 vCPU/1-2GB RAM is enough -- see §1).
3. **Point DNS** (A/AAAA record) at the VPS's IP; wait for propagation.
4. **Generate `SECFIN_ADMIN_SECRET`** (`openssl rand -hex 32`) and put it in the
   VPS's `.env` -- can be done any time before you need admin/tier-change endpoints.
5. **Confirm/re-confirm `SEC_USER_AGENT`'s contact email is real and monitored** --
   already required to build/run at all, called out again here because it's the one
   env var the SEC itself may act on.
6. Run through §3-§8 of this runbook on the VPS.
7. (Optional but recommended) **Sign up for a free-tier uptime-ping account** (§9)
   and point it at `/health`.
8. Run `scripts/verify_deployment.py --base-url https://<your-domain>` (§11) as the
   final go/no-go check.

# As-built: DigitalOcean deployment of clearyfi.com (2026-07-14)

The concrete instantiation of `docs/DEPLOYMENT.md` (the provider-agnostic runbook --
read that first for the *why* of every step, especially §1's single-process
constraint). This file records what actually exists, the exact commands used to
create it, where reality deviates from the runbook, and the day-2 flow as it works
today. Update it when the deployment changes; it is the answer to "what is running
in production and how do I touch it."

## 1. What exists

| Thing | Value |
|---|---|
| Provider | DigitalOcean (`doctl` context on the operator's machine) |
| Droplet | `secfin-api`, ID **584697256**, region TOR1 |
| Size / image | `s-1vcpu-2gb` Basic ($12/mo, 1 vCPU / 2GB / 50GB SSD), `ubuntu-24-04-x64`, monitoring enabled, tag `secfin` |
| Swap | **4 GB `/swapfile`** added 2026-08-14, persisted in `/etc/fstab`, `vm.swappiness=10` via `/etc/sysctl.d/60-secfin-swap.conf`. The box had NO swap: with 2 GB of RAM and DuckDB batch jobs, an out-of-memory condition kills a process outright, and the OOM killer picks by footprint -- which can be `secfin-api-1`, taking the live API down. Swap turns that into slowness instead. A mitigation, not a fix: if a batch genuinely needs >2 GB the answers are a larger droplet or a bounded job. |
| Public IP | **143.198.37.67** |
| Firewall | `secfin-api-fw` (applies by tag `secfin`): inbound TCP 22/80/443 from anywhere, all outbound. Nothing else reachable -- `:8000` confirmed closed from outside. |
| SSH access | root, key `secfin-popos` (DO key ID 57796503 = the operator's `~/.ssh/id_ed25519.pub`) |
| Domain | **clearyfi.com**, registered at Namecheap, DNS on Namecheap default nameservers (`dns{1,2}.registrar-servers.com`) |
| DNS records | A `@` → 143.198.37.67, A `api` → 143.198.37.67, CNAME `www` → clearyfi.com |
| Hostname layout | `clearyfi.com` = site/frontend, `api.clearyfi.com` = documented API base -- **both proxy to the same FastAPI process** (operator decision 2026-07-14); `www` 301s to the bare domain. `deploy/Caddyfile` encodes this. |
| TLS | Let's Encrypt via Caddy, all three hosts, auto-renewing (`caddy-data` volume holds the ACME state) |
| App path | `/opt/secfin` (working tree **rsynced**, not cloned -- see §4) |
| Stack | `docker compose -f docker-compose.prod.yml` : `api` (loopback-only :8000) + `caddy` (80/443), both `restart: unless-stopped` |
| Data | SQLite in the `secfin-data` volume -- never re-backfilled on the droplet. Hydrated 2026-07-14 from the operator machine's seeded backup (695MB); re-hydrated 2026-07-16 with the 5-year deep seeding (**7.7GB**: 20 13F quarters / 50.2M holding rows, frames FY2021-FY2025, metrics for 8,917 CIKs). Disk after: ~20/48GB. |
| Secrets | `/opt/secfin/.env` (mode 600): `SEC_USER_AGENT` (real contact address), `SECFIN_ADMIN_SECRET` (generated on-box with `openssl rand -hex 32`; exists nowhere else -- read it from that file if you need admin calls) |
| Scheduled jobs | **As deployed 2026-08-14, only two timers are ENABLED**: `secfin-insider-peer-ratio.timer` 05:30 UTC and `secfin-incremental.timer` 06:00 UTC. `secfin-peer-analytics.timer` (Sun 08:00) and `secfin-disclosure-stats.timer` (Sat 08:00) are **installed but disabled** pending a hand-measured run -- see §5b. `secfin-backup.timer` remains disabled (§6). ⚠️ `deploy/install.sh` uses `enable --now`, which would also START a chain; units were therefore copied and enabled selectively rather than by running it. |
| Verified | `scripts/verify_deployment.py --base-url https://api.clearyfi.com` from outside the host, **11/11**, 2026-08-14 (was 10/10 on 2026-07-14) |
| Images | `secfin-api` (272MB) serves; `secfin-analytics` (360MB) is a separate build target adding duckdb for batch jobs. Verified on-box: `import duckdb` succeeds in `analytics`, fails in `api`. |

Pre-existing in the same DO account and **not part of this deployment**: a k8s
cluster (`k8s-1-36-0-do-2-tor1-...`, one 2GB worker, ~$12/mo) and its two firewalls.
Left untouched; decide separately whether it should keep running.

## 2. Provisioning (doctl, one-time -- done 2026-07-14)

Recorded for reproducibility; you only run these again to rebuild from scratch.

```bash
# SSH key (once per operator machine)
doctl compute ssh-key import secfin-popos --public-key-file ~/.ssh/id_ed25519.pub

# Droplet
doctl compute droplet create secfin-api \
  --region tor1 --size s-1vcpu-2gb --image ubuntu-24-04-x64 \
  --ssh-keys <key-id> --enable-monitoring --tag-name secfin --wait

# Firewall (attached by tag, so future secfin-tagged droplets inherit it)
doctl compute firewall create --name secfin-api-fw --tag-names secfin \
  --inbound-rules "protocol:tcp,ports:22,address:0.0.0.0/0,address:::/0 protocol:tcp,ports:80,address:0.0.0.0/0,address:::/0 protocol:tcp,ports:443,address:0.0.0.0/0,address:::/0" \
  --outbound-rules "protocol:tcp,ports:all,address:0.0.0.0/0,address:::/0 protocol:udp,ports:all,address:0.0.0.0/0,address:::/0 protocol:icmp,address:0.0.0.0/0,address:::/0"
```

DNS was added manually in the Namecheap dashboard (Advanced DNS; the default
parking records must be deleted or they conflict with `@`). Propagation was fast
(~minutes), but stale parking A records lingered in public resolver caches for a
while -- Caddy/Let's Encrypt validated against the authoritative servers
immediately, so cert issuance did not have to wait for caches.

## 3. First boot (what was run on the droplet, in order)

Follows runbook §3-§8 with the deviations in §4:

```bash
# Docker (installs the compose plugin too)
curl -fsSL https://get.docker.com | sh

# Code -- rsync from the operator machine (see §4), then:
cd /opt/secfin
printf 'SEC_USER_AGENT="sec-financials-api <real-contact-email>"\nSECFIN_ADMIN_SECRET="%s"\n' \
  "$(openssl rand -hex 32)" > .env && chmod 600 .env

docker compose -f docker-compose.prod.yml build
# The analytical batch image is a SEPARATE build target (it adds duckdb, which the serving
# image deliberately does not carry) and sits behind a compose profile, so the line above
# does not build it. The timer's runner self-heals by building on first fire, but doing it
# here keeps that fire fast.
docker compose -f docker-compose.prod.yml --profile analytics build analytics

# Hydrate the DB from a backup uploaded to data/backups/secfin-latest.db
# (695MB up from the operator machine; runbook §7 -- never re-backfill on the box)
docker compose -f docker-compose.prod.yml run --rm api python -m secfin.storage.restore --latest

docker compose -f docker-compose.prod.yml up -d     # api + caddy; certs issue on first start
sudo ./deploy/install.sh                            # all timers (daily + the two weekly chains)
```

Smoke checks that were run and should pass after any rebuild: `curl
http://127.0.0.1:8000/health` from the droplet; `https://api.clearyfi.com/v1/companies/AAPL/statements/income?year=2023`
returns real data from outside; `curl http://143.198.37.67:8000/health` from outside
**times out** (loopback + firewall); `verify_deployment.py` 10/10.

## 4. Deviations from the runbook

- **rsync instead of `git clone`.** The GitHub remote is private over SSH and the
  droplet has no deploy key yet, so the working tree was rsynced from the operator
  machine (excluding `data/`, `.env`, caches). Consequence: **runbook §12's
  `git pull` day-2 flow does not work yet** -- use the rsync flow in §5 below, or
  add a read-only deploy key to the repo and clone properly (open item, §6).
- **Two-host Caddyfile.** The runbook's placeholder was a single `api.example.com`
  block; the committed `deploy/Caddyfile` now carries the real
  `clearyfi.com, api.clearyfi.com` block plus the `www` redirect.
- **`api` was started alone first** (`up -d api`) while no domain existed, then the
  full stack once DNS was live -- starting Caddy before DNS points at the box just
  makes it fail ACME challenges in a retry loop; harmless but noisy.

## 5. Day-2 operations (as they work today)

**Deploy a code change** (until a deploy key replaces rsync):

```bash
# From the operator machine, repo root:
rsync -az --exclude /data/ --exclude .env --exclude __pycache__ \
      --exclude .pytest_cache --exclude .ruff_cache --exclude .git/ \
      --exclude 'clearyfi_frontend/node_modules' --exclude 'clearyfi_frontend/app-dist' \
      --exclude 'clearyfi_frontend/dist' \
      ./ root@143.198.37.67:/opt/secfin/
ssh root@143.198.37.67 \
  'cd /opt/secfin && docker compose -f docker-compose.prod.yml build && docker compose -f docker-compose.prod.yml up -d'
```

> ### ⛔ NEVER add `--delete-excluded` to that rsync
>
> It deletes the EXCLUDED paths at the destination -- which is precisely `.env` and `data/`.
> Done on 2026-08-17: it removed `/opt/secfin/.env` (SEC_USER_AGENT, admin secret, rate limits)
> and `/opt/secfin/data/`. The site never went down, because the running container holds its
> environment in memory and the SQLite DB lives in the named `secfin-data` volume rather than in
> `./data` -- so nothing was lost and nothing was served wrong. But between that moment and the
> repair, ANY container restart would have failed to start, and the first symptom was the build
> refusing to interpolate `SEC_USER_AGENT`.
>
> `.env` was reconstructed from `docker inspect secfin-api-1`'s own environment, verified
> byte-identical on all four values. That recovery only worked because the container was still
> running. **If it had been restarted first, the admin secret would have been gone.**
>
> The excludes above are a keep-out list, not a clean-up list. `--delete` and `--delete-excluded`
> both have no business here: the droplet's tree is allowed to hold files the repo does not.
>
> ### ⛔ And the exclude is `/data/`, ANCHORED
>
> rsync patterns without a leading slash match at ANY DEPTH. `--exclude data/` -- which this
> runbook carried until 2026-08-17 -- was correct while `./data/` was the only such directory in
> the repo. The React frontend has `clearyfi_frontend/app/data/`, which is its entire data layer
> (`api.ts`, the fixtures, the catalogs), and that pattern silently excluded it too. The build then
> failed with `Could not resolve "./data/prototype" from "app/state.tsx"` -- a confusing error whose
> real cause was three directories away, in the transfer.
>
> The leading slash anchors the pattern to the transfer root, so it means "the `data/` beside
> `docker-compose.prod.yml`" and nothing else.

The frontend excludes matter for a different reason: `node_modules` is ~400 MB of host-platform
binaries and `app-dist` is a local build, and both are produced inside the image by the
Dockerfile's `frontend` stage. Sending them wastes the transfer and risks shadowing the build.

A few seconds of downtime while the `api` container recreates -- known and accepted
(runbook §12). The image bakes in `src/` **and now the built SPA**, so the `build` is not
optional -- and the build stage runs `npm ci` + `vite build` on the droplet's single core.

**Check the scheduled jobs** (first fires: 2026-07-15 06:00/07:00 UTC):

```bash
ssh root@143.198.37.67 'systemctl list-timers "secfin-*" --no-pager; tail -5 /var/log/secfin/*.status'
```

**Logs / yesterday's traffic:** runbook §10 verbatim (Caddy JSON access log via
`docker compose -f docker-compose.prod.yml logs caddy`).

**Rotate `SECFIN_ADMIN_SECRET` / `SEC_USER_AGENT`:** edit `/opt/secfin/.env`, then
`docker compose -f docker-compose.prod.yml up -d` (no rebuild -- runtime env only).

**Raw-facts lookup (INTERNAL-ONLY, admin-gated -- docs/ROADMAP_DATA_DEPTH.md Phase 1):**
`GET /v1/companies/{symbol}/facts` serves the store's raw facts with provenance --
useful for mapping research and debugging a served number back to its filing. Gated by
`X-Admin-Secret` like the §5 admin endpoints, absent from the public OpenAPI schema, and
NOT a customer feature until the go-public decision (see the roadmap). Requires at least
one filter (`tag=`, repeatable, and/or `year=` + optional `period=`); `limit=`/`offset=`
paginate (default 100, cap 1000). Mind the fy/fp trap: `fiscal_year`/`fiscal_period` are
the FILING's period, so filter by `period_end`/`instant` -- the response's `caveats`
field spells this out.

```bash
curl -H "X-Admin-Secret: $SECFIN_ADMIN_SECRET" \
  'https://clearyfi.com/v1/companies/AAPL/facts?tag=ContractWithCustomerLiability&year=2025&period=FY'
```

**Resize:** vertical only (runbook §1 -- never `--workers`, never a second
replica). `doctl compute droplet-action resize 584697256 --size <bigger> --wait`
(disk resize is one-way; RAM/CPU-only resize is reversible).

**Rebuild from nothing:** §2 provisioning → §3 first boot, hydrating from the
newest backup in the operator machine's `./data/backups/` (or the droplet's
`/opt/secfin/data/backups` if the volume died but the disk survived).

## 5b. Deployed 2026-08-14 -- the peer/insider views and their batches

Deployed master `bdb2f93` (27 commits). What changed on the droplet:

- **A second image.** `docker-compose.prod.yml` now pins `target: api` for the serving image
  and adds a profiled `analytics` service built from a new Dockerfile stage that installs
  `.[analytical]`. The analytics stage is LAST in the Dockerfile, so an untargeted
  `docker build .` would resolve to it and put duckdb in the serving image -- hence the explicit
  target. `docker compose build` does NOT build profiled services, so the analytics image needs
  its own `--profile analytics build analytics` (done here, and the timer runners self-heal by
  building on first fire).
- **Four new endpoints**: `/proposed-sale-notices`, `/peers/insider-net-ratio`,
  `/theme-percentiles`, `/disclosure-stats`.
- **Three new tables**, created lazily by their repositories: `insider_peer_ratios`,
  `disclosure_stats`, plus the filing-index growth. No migration ran; nothing existing was
  rewritten.

**The two weekly chains are installed but NOT enabled, deliberately (operator, 2026-08-14).**
They were sized on a 16-core workstation: `metrics_backfill` alone is ~5.4 h there -- and **~16 h
here**, re-measured 2026-08-14 at 9.4 companies/min. And
`peer_ranks` runs DuckDB over millions of rows. This droplet is **1 vCPU / 1,967 MB / no swap**,
and that single core also serves the API. Enabling them unattended risks a DuckDB OOM, or
`metrics_backfill` exceeding `TimeoutStartSec=28800` and being killed mid-chain, while the API
competes for the CPU. Measure each by hand first:

```bash
ssh root@143.198.37.67 'cd /opt/secfin && time ./deploy/scripts/run-disclosure-stats.sh'   # ~40 min on 16 cores
ssh root@143.198.37.67 'cd /opt/secfin && time ./deploy/scripts/run-peer-analytics.sh'     # ~16 h HERE (~5.5 h on 16 cores)
# then, if the cost is acceptable:
ssh root@143.198.37.67 'systemctl enable --now secfin-disclosure-stats.timer secfin-peer-analytics.timer'
```

Until they run, `/disclosure-stats` and `/peers/insider-net-ratio` return `status: "na"` with a
reason saying the batch has not been run -- which is the designed behaviour, not a fault.

**No backup was taken** (operator, 2026-08-14: still developing; `data/backups` was empty and
stays empty, timer stays off). The code change is additive and does not migrate data, so the
rollback is redeploying the previous tree; `secfin-api:rollback-jul17` is also still on the box.

Disk after: **13G / 48G used**, unchanged by the deploy.

### 5e. Deploy 2026-08-17 — the React app ships at /app, and two rsync traps

**What went live.** The SQLite busy timeout (120s, `storage/connection.py`), the new
`GET /v1/companies/{symbol}/filings`, the geographic-mix floors, and — for the first time — the
built React frontend, mounted at **`/app`**.

`/app` and not `/` deliberately: `/`, `/company/{symbol}` and `/sectors` are live server-rendered
routes and the SPA's router claims exactly those paths. Under a prefix the deploy is additive and
the rollback is deleting two routes in `api/main.py`. Verified after: `/`, `/company/AAPL`,
`/sectors`, `/guide`, `/coverage`, `/docs` all still 200, and `verify_deployment.py` 11/11.

The image now has a Node build stage. On this droplet it cost **32 s** with the `npm ci` layer
warm and never touched swap — cheaper than feared, but it does mean a frontend change now
requires a rebuild here, not just an rsync.

**Two rsync traps, both hit on the way in. Both are written up at §5's deploy command; read that
before running it.**

1. `--delete-excluded` deleted `/opt/secfin/.env` and `data/`. Recovered from the running
   container's own environment — which only worked *because* it was still running.
2. `--exclude data/` is UNANCHORED and also matched `clearyfi_frontend/app/data/`, the frontend's
   whole data layer, so the build failed on a missing module three directories from the real
   cause. The runbook had carried that unanchored pattern since 2026-07-14; it is `/data/` now.

**A backup was taken first** (operator, 2026-08-17, reversing the 2026-08-14 skip):
`data/backups/secfin-20260817T045227Z.db`, 9.2 GB, 1 m 23 s.

⚠️ `storage/backup.py` writes the timestamped copy **and** `secfin-latest.db` — 18.4 GB per
backup at this DB size, on a 48 GB disk (34 G used after). `secfin_backup_retention` defaults to
**7**, which cannot fit. `secfin-backup.timer` is still disabled, so this is latent — but lower
the retention before ever enabling it. Same shape as the 2026-07-21 disk-fill in §6b.

### 5f. Deploy 2026-08-17 (second) — one frontend: React at the root

Operator ruling: the React app is the only frontend app. It now serves **`/company/*`,
`/sectors/*`, `/manager/*`, `/compare*` and `/screen`** at the root; the server-rendered shells
(`company.html`, `sector-analytics.html`, `manager.html`, `compare.html`, `screen.html`) are no
longer routed to. Their files stay in `static/` for one release as the rollback.

**`/` did not move.** The React app has no landing page — its router redirects `/` to `/sectors` —
so handing it the front door would have replaced the page explaining what the product is with a
data view that is currently EMPTY here (§5c). `/`, `/guide`, `/coverage`, `/methodology`,
`/privacy`, `/terms`, `/disclaimer`, `/components` and `/docs` stay server-rendered.

Verified from outside after the deploy:

| | |
|---|---|
| Front door | `/` still the marketing page, title unchanged |
| Prose / legal / reference | all 8 → 200 |
| App routes | all 7 → 200, `/assets/*` → 200 |
| `/sectors/36` | 301 → `/sectors/sector?sector=36` (group PRESERVED) |
| `/app/company/AAPL/insider` | 301 → `/company/AAPL/insider` |
| `verify_deployment.py` | **11/11** |
| Driven browser | company page shows a real `LAST FILED 4 · 13 Aug 2026`, no synthetic banner, complete legal footer, zero failed requests |

**Two things the swap would have broken, fixed in the same change:**

* The **legal footer** (disclaimer / privacy / terms / support) lived only on server-rendered
  pages. Every data page would have lost it. It is in the app's shell now and asserted on both
  sides — `test_static_pages.py` for server pages, `verify_sectors.mjs` §J for the app.
* **Sector bookmarks** would have shown a DIFFERENT industry: React reads path segment 1 as a
  view, so `/sectors/36/...` fell back to the default view and lost the group. Hence the 301.

`/coverage` and `/components` also had no footer at all — the only public pages without one — and
now do.

⚠️ **`/sectors` renders an honest empty state in production** ("No composite theme scores have
been computed for SIC 36"), because none of the sector tables have a producer scheduled here.
See §5c. The company views are fully populated; the filing index is backfilled.

### 5g. 🔴 `.env` holds a COMPOSE-level variable that `docker inspect` cannot show you

**2026-08-17, and it is the second failure from one root cause.** After `--delete-excluded` removed
`/opt/secfin/.env` (§5e), it was reconstructed from `docker inspect secfin-api-1`'s environment —
which looked complete and was not. `SECFIN_DATA_MOUNT` is interpolated into the compose
`volumes:` block, **not passed to the container**, so it does not appear in `.Config.Env` and the
reconstruction silently dropped it.

`docker-compose.prod.yml` reads `${SECFIN_DATA_MOUNT:-secfin-data}`, so the default took over and
the next `up -d` moved production onto the **pre-migration named volume** — the copy §7 says was
"retained as the rollback".

| table | Volume `/mnt/secfin_data_vol/data` (correct) | named volume (served ~50 min) |
|---|---:|---:|
| `raw_facts` | **64,657,414** | 4,805,056 |
| `filing_index` | **4,684,555** | **1,000** |
| `metric_values` | 2,719,004 | 1,738,360 |
| `api_keys` | 60 | 59 |
| size | 34.2 GB | 9.2 GB |

**`filing_index` is the one to learn from.** While on the stale copy, `GET
/companies/AAPL/filings` returned `indexed_filings: 1000` — which looks exactly right, because
Apple really does have about a thousand indexed filings. It was the ENTIRE TABLE. A per-company
figure can be indistinguishable from a whole-database figure, and that is precisely the reading
that was taken as confirmation the deploy had worked.

The site stayed up and served correct-looking answers the whole time, which is what made it hard
to see: the stale DB is a real database, just a 13×-smaller one from before the granular
re-ingest. Nothing detected it — not `/health`, not `verify_deployment.py` 11/11, not a browser.
It surfaced only because a documentation sweep read §7 and asked whether the mount matched.

**No customer data was lost.** The two keys the stale copy had that the Volume did not were both
`verify-deploy-*@example.com` — created by `verify_deployment.py`'s own signup during that window.

**Rules this leaves behind:**

1. **Never reconstruct `.env` from a container.** It cannot contain compose-level variables. If
   `.env` is ever lost again, rebuild it from `.env.example` + `docker-compose.prod.yml`'s
   `${...}` references, and check EVERY one — including those in `volumes:`, `ports:` and
   `build:`, which never reach the container.
2. **Verify the MOUNT after any recreate**, not just health:
   `docker inspect secfin-api-1 --format '{{range .Mounts}}{{.Source}}{{println}}{{end}}'`
   must show `/mnt/secfin_data_vol/data`. A row count is the cheap confirmation — `raw_facts`
   should be tens of millions, not ~4.8 M.
3. `verify_deployment.py` passes against BOTH databases. It checks that data is served, never that
   it is the CURRENT data. Worth an assertion on a row-count floor or a known recent filing.

A timestamped `.env.bak-*` is written on the droplet before any future edit to it.

### 5c. The sector surface has NO producer scheduled here (found 2026-08-14)

Every table behind `/v1/sectors*` is empty on this droplet, and this is not a fault of any
deploy — those batches have never had a timer. Recorded here rather than fixed because the
operator's call (2026-08-14) was to keep the sector work local for now.

| Endpoint | Table | Producer | Timer? | Rows here |
|---|---|---|---|---|
| `/sectors` (the roster) | `sector_dupont` | `ingest.dupont_backfill` → `analytical.sector_dupont` | **none** | 0 (`dupont_components` does not exist) |
| `/sectors/theme-scores` | `sector_theme_scores` | `analytical.sector_theme_scores` | **none** | 0 |
| `/sectors/{g}/spreads` | `metric_distributions` | `analytical.peer_distribution` | yes — chain step 2 | **0** (see below) |
| `/sectors/{g}/insider-flow` | `sector_insider_flow` | `analytical.sector_insider_flow` | **none** | 0 |
| `/sectors/{g}/lifecycle` | `sector_lifecycle` | `ingest.lifecycle_backfill` → `analytical.sector_lifecycle` | **none** | 0 (`lifecycle_components` does not exist) |
| `/sectors/{g}/geographic-mix` | `sector_geographic_mix` | DERA ingest → `analytical.sector_geographic_mix` | **none** | 0 (`dimensional_geo_facts` does not exist) |

`metric_distributions` is empty for its own reason: the peer-analytics chain has **never reached
step 2**. Its first hand-run (2026-08-14) died in step 1 on a SQLite lock, and the timer is still
disabled pending measurement. `metric_ranks` has 262k rows from an older run, so the *company*
peer-rank features work — it is the *sector* rollups that are absent.

The order any fix has to follow, because each step reads what the previous wrote:

```
metrics_backfill -> peer_distribution -> sector_theme_scores
dupont_backfill  -> sector_dupont          (independent; this one gates the ROSTER)
lifecycle_backfill -> sector_lifecycle     (independent)
sector_insider_flow                        (independent; reads insider_transactions)
```

`sector_dupont` is the one that matters first: with it empty, `/v1/sectors` returns zero groups,
so there is nothing for a reader to navigate to and every other sector endpoint is unreachable
through the UI.

**Measured cost, on the operator's 16-core box (2026-08-16)** — the droplet has 1 vCPU, so read
these as a floor, not an estimate for here:

| Step | Wall clock | Wrote |
|---|---|---|
| `ingest.dupont_backfill` | **1h 45m** over 16,920 CIKs | `dupont_components` 31,418 → 280,871 rows |
| `analytical.sector_dupont` | seconds | `sector_dupont` 562 → 4,214 rows |
| `ingest.dimensional_backfill` (3 DERA quarters) | ~1 min | 9,173 geo rows + 24,161 §03 facts |
| `analytical.sector_geographic_mix` | seconds | 35 group rows |
| `analytical.sector_theme_scores` | seconds | 22,746 score + 91,309 component rows |

Only the first is expensive, and it is the one nothing schedules. Its staleness is invisible from
the outside: the roster still serves, just with fewer groups and fewer filers. Refreshing it took
the local roster from 59 groups / 3,265 filers to **62 / 4,345**, and FY2023 from 189 companies to
4,973 — nothing had broken, it had simply never been re-run.

⚠️ `sector_dupont` and `sector_lifecycle` need the **analytics** image (DuckDB); running them on
`api` fails with `ModuleNotFoundError: No module named 'duckdb'`.

### 5d. A SQLite lock killed the first peer-analytics run (2026-08-14, fixed in code)

`secfin-incremental.timer` fired at 06:02:13 while the chain was materializing metrics. At
06:02:33 `metrics_backfill` raised `sqlite3.OperationalError: database is locked` and the chain
stopped, discarding 76 minutes at company 600 of 9,055.

Nothing was corrupted. WAL gives one writer, and this box has three by design — the API's
cache-aside writes, the incremental ingest, and the analytics chains. `sqlite3.connect`'s
`timeout=` **is** the busy timeout and defaults to 5 seconds; no repository ever passed it.
`storage/connection.py` now centralizes the connect and sets 120s, so a collision is a pause.

**Not yet deployed here.** Until it is, any batch that overlaps another writer can still die this
way — including the 06:00 incremental, which the ~16-hour chain now certainly crosses.

## 6. Monitoring & observability (as built, 2026-07-14)

Three layers, all free, no third-party vendors (proportionality argument in runbook
§9-§10 -- deliberately no Prometheus/Grafana/log-shipping):

**DO Uptime** (external probe, us_east + us_west): check `secfin-health`
(`039c3697-310c-4d27-a691-5dc758a3db15`) GETs `https://api.clearyfi.com/health`;
email alerts on **down for 2m** and on **TLS cert < 14 days from expiry** (belt and
suspenders -- Caddy should renew long before that; this alert firing means renewal is
broken). `doctl monitoring uptime get <id>` / `... uptime alert list <id>`.

**DO droplet alerts** (agent was enabled at droplet creation), applied by tag
`secfin`, email to the operator: CPU > 80% for 10m, memory > 90% for 10m,
disk > 85% for 1h. The disk one matters most -- the DB, Docker images, and local
backups share the 50GB disk, and the failure mode is gradual. `doctl monitoring
alert list`.

**In-app ops snapshot** -- `GET /v1/admin/ops` (`X-Admin-Secret`-gated, added
2026-07-14): process-lifetime response counts by status class (5xx visibility
without grepping Caddy logs; in-memory by design -- single process, resets on
restart) plus trailing per-day traffic (total requests + distinct active keys),
per-day signups, and key totals by tier from `api_keys`/`api_key_usage`.
The launch-day "is production healthy and did anyone show up?" one-liner:

```bash
curl -s https://api.clearyfi.com/v1/admin/ops -H "X-Admin-Secret: $(ssh root@143.198.37.67 '. /opt/secfin/.env && echo $SECFIN_ADMIN_SECRET')" | python3 -m json.tool
```

The Caddy log-review routine (runbook §10) stays the source of truth for per-path
detail and anonymous/unauthenticated traffic -- `/v1/admin/ops` only sees metered
(keyed) requests plus process-wide response classes.

## 6b. Deploy log & incidents

- **2026-07-21 — deployed `sector-lifecycle-trends`** (Sector Analytics D5: DIO/DSO/DPO/CCC
  metrics + `/v1/sectors/{group}/lifecycle` + the `/sectors` lifecycle trend). Standard §5 flow
  (rsync + build + up -d), rollback image tagged `secfin-api:rollback-jul17` (id `2b3a1ebf68b9`,
  the pre-deploy Jul-17 image). Post-deploy: 38 routes (was 23), `verify_deployment.py` 11/11 PASS.
  Company-level `dio/dpo/ccc` compute live on existing data (e.g. AAPL FY2024 = ok); the SECTOR
  aggregate (`/v1/sectors*`, incl. lifecycle) returns **honest empty** until the data step runs
  (see below) — the prod volume is still the pre-granular-backfill DB.
- **2026-07-21 — DISK-FULL INCIDENT (resolved).** Root disk hit 48G/48G (0 free); `dockerd`/
  `rsyslogd` were logging write failures and `docker exec` failed with "no space left on device".
  **Cause:** `secfin-backup.timer` writes a full ~7.3G SQLite snapshot to
  `/opt/secfin/data/backups` **daily with NO retention** — 8 snapshots (~37G) filled the disk, and
  the Jul-20/Jul-21 snapshots were left **corrupt partials** (5.9G / 1.4M) because the disk was
  already full. **Fix:** pruned the old dailies (Jul 15/16/17) + the two corrupt partials,
  **kept Jul 18, Jul 19, and `secfin-latest.db`** (last known-good = Jul 19), + `docker builder
  prune`. Freed to 33G/48G (16G free). Live volume DB verified intact throughout (AAPL metrics
  served real data the whole time).
- **2026-07-21 — RECURRENCE FIXED (deployed).** Root cause: `run-backup.sh`'s retention was
  **time-based (`find -mtime +14`)**, which at 7.3G/snapshot could never trigger before a week
  overran the 48G disk. Replaced with **count-based** retention in `storage/backup.py` (`--keep N`,
  prunes to newest N; `secfin-latest.db` never pruned; orphaned sidecars cleaned). `run-backup.sh`
  now passes `--keep "${SECFIN_BACKUP_KEEP:-7}"`. Droplet interim set to **`keep=2`** via a systemd
  drop-in (`/etc/systemd/system/secfin-backup.service.d/override.conf`, `Environment=SECFIN_BACKUP_KEEP=2`)
  because 48G can't hold more. Verified live: a timer-equivalent run wrote a fresh snapshot, pruned
  to 2, disk steady at 15G free. Raise `keep` back to 7 once the data moves to a bigger Volume.

## 7. Open items (tracked in docs/product/LAUNCH_READINESS.md)

- ~~Backup retention~~ — **FIXED & deployed 2026-07-21** (count-based `--keep`, droplet `keep=2`).
  See §6b. Raise to `keep=7` after Part B moves the data to a bigger Volume.
- **🔴 NO BACKUPS EXIST — ZERO COVERAGE (2026-07-25).** All three droplet snapshots
  (`secfin-20260719T070054Z.db`, `secfin-20260722T000743Z.db`, `secfin-latest.db`; 22G total) were
  **deleted at the operator's explicit instruction** to reclaim root disk (34G→12G used, 72%→26%).
  `secfin-backup.timer` remains **stopped + disabled** (paused 2026-07-21 ahead of the Part B
  migration: once the DB is ~57G a local full snapshot won't fit the 100 GiB Volume, so backups must
  move to **DO Spaces**). **Net effect: prod has no restore point of any kind.**
  - **What is at risk:** `raw_facts` / metrics / holdings are all **regenerable** from SEC. The
    **`api_keys` table (59 rows) is NOT** — it exists only in the live DB. Losing it breaks every
    customer's key with no way to reconstruct it.
  - **MUST do before this matters:** wire Spaces-backed backups and re-enable the timer
    (`systemctl enable --now secfin-backup.timer`). Until then every signup is unprotected, not just
    those after Jul 22. A cheap stopgap that costs ~KBs: export just the `api_keys` table off-box.
  - `secfin-incremental.timer` left running.
- **Part B — DB MOVED TO THE VOLUME (2026-07-25).** `/app/data` is now the block-storage Volume
  (`/mnt/secfin_data_vol/data`), not the droplet root disk. Mechanism: `docker-compose.prod.yml`'s
  data mount is now `${SECFIN_DATA_MOUNT:-secfin-data}` and the droplet `.env` sets it to the Volume
  path (`.env` is rsync-excluded, so a deploy can't revert it). An `/etc/fstab` entry with `nofail`
  was added and validated — **the Volume had been manually mounted only** and would not have survived
  a reboot. ~15s downtime; row counts verified identical (`api_keys` 59, `raw_facts` 4,805,056,
  `metric_values` 1,738,360), health 200, AAPL FY2023 real. Old `secfin_secfin-data` named volume
  retained as the rollback (remove `SECFIN_DATA_MOUNT`, `up -d api`); delete after a bake period.
  Details in `docs/DEPLOYMENT_BLOCK_STORAGE.md`. **Still open below: the granular re-ingest and
  Spaces backups — the Volume move alone does NOT populate the sector aggregates.**
- **Granular data + sector aggregates — Part B, MIGRATION PENDING (2026-07-21).** The whole-market
  granular `raw_facts` is ~57G — it does NOT fit the 48G droplet, so the data moves to a **DO Block
  Storage Volume** (droplet = app serving only). Full plan in **`docs/DEPLOYMENT_BLOCK_STORAGE.md`**.
  **Current state — provisioned, not yet migrated:**
  - Volume `secfin-data-vol` (**100 GiB**, ext4, region `tor1`) is **created, attached, and mounted
    at `/mnt/secfin_data_vol`** on the droplet (`/dev/sda` via
    `scsi-0DO_Volume_secfin-data-vol`). ~$10/mo.
  - Chosen path: **on-box re-ingest** (not offline-then-rsync); **backups → DO Spaces** (a local 57G
    snapshot won't fit the 100 GiB Volume) — Spaces not yet wired, backup timer paused (see above).
  - **Not yet done:** repoint compose `/app/data` → the Volume, seed the DB from a fresh consistent
    copy (preserving API keys), run the ordered on-box backfills (`ingest.backfill → metrics_backfill
    → peer_ranks → peer_distribution → dupont_backfill → sector_dupont → lifecycle_backfill →
    sector_lifecycle`, `SECFIN_BACKFILL_WORKERS=1`), reclaim bulk zips, verify populated sectors,
    wire Spaces backups + re-enable the timer.
  - Until the migration runs, the sector aggregates (`sector_dupont`, `sector_lifecycle`,
    `metric_distributions`) stay unmaterialized on prod and the sector views show honest empty states
    (company-level DIO/DSO/DPO/CCC already compute live).
- Off-droplet backup destination -- backups currently live only on the droplet's
  own disk; operator deliberately deferred the decision (Spaces+rclone hourly vs.
  Litestream were the assessed options, 2026-07-14). **Now also the disk-fill cause (§6b).**
- GitHub deploy key on the droplet so day-2 becomes `git pull` (runbook §12)
  instead of §5's rsync.
- ~~Verify the first timer runs (morning of 2026-07-15 UTC)~~ — done. The first
  scheduled ingest FAILED (`open /opt/secfin/.env: permission denied`: `.env` was
  root-owned 600, timers run as the `secfin` user). Fixed live (`chown
  secfin:secfin /opt/secfin/.env`) and permanently in `deploy/install.sh`;
  re-run verified: 35 companies ingested for 2026-07-14.

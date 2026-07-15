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
| Public IP | **143.198.37.67** |
| Firewall | `secfin-api-fw` (applies by tag `secfin`): inbound TCP 22/80/443 from anywhere, all outbound. Nothing else reachable -- `:8000` confirmed closed from outside. |
| SSH access | root, key `secfin-popos` (DO key ID 57796503 = the operator's `~/.ssh/id_ed25519.pub`) |
| Domain | **clearyfi.com**, registered at Namecheap, DNS on Namecheap default nameservers (`dns{1,2}.registrar-servers.com`) |
| DNS records | A `@` → 143.198.37.67, A `api` → 143.198.37.67, CNAME `www` → clearyfi.com |
| Hostname layout | `clearyfi.com` = site/frontend, `api.clearyfi.com` = documented API base -- **both proxy to the same FastAPI process** (operator decision 2026-07-14); `www` 301s to the bare domain. `deploy/Caddyfile` encodes this. |
| TLS | Let's Encrypt via Caddy, all three hosts, auto-renewing (`caddy-data` volume holds the ACME state) |
| App path | `/opt/secfin` (working tree **rsynced**, not cloned -- see §4) |
| Stack | `docker compose -f docker-compose.prod.yml` : `api` (loopback-only :8000) + `caddy` (80/443), both `restart: unless-stopped` |
| Data | SQLite in the `secfin-data` volume, hydrated 2026-07-14 from the operator machine's fully seeded backup (`secfin-20260715T022201Z.db`, 695MB) via `storage/restore.py` -- never re-backfilled on the droplet |
| Secrets | `/opt/secfin/.env` (mode 600): `SEC_USER_AGENT` (real contact address), `SECFIN_ADMIN_SECRET` (generated on-box with `openssl rand -hex 32`; exists nowhere else -- read it from that file if you need admin calls) |
| Scheduled jobs | systemd timers via `deploy/install.sh`: `secfin-incremental.timer` 06:00 UTC, `secfin-backup.timer` 07:00 UTC (backups land in `/opt/secfin/data/backups` on the droplet's own disk -- off-droplet copy is an open decision, see §6) |
| Verified | `scripts/verify_deployment.py --base-url https://api.clearyfi.com` from outside the host, **10/10**, 2026-07-14 |

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

# Hydrate the DB from a backup uploaded to data/backups/secfin-latest.db
# (695MB up from the operator machine; runbook §7 -- never re-backfill on the box)
docker compose -f docker-compose.prod.yml run --rm api python -m secfin.storage.restore --latest

docker compose -f docker-compose.prod.yml up -d     # api + caddy; certs issue on first start
sudo ./deploy/install.sh                            # ingest + backup timers
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
rsync -az --exclude data/ --exclude .env --exclude __pycache__ \
      --exclude .pytest_cache --exclude .ruff_cache \
      ./ root@143.198.37.67:/opt/secfin/
ssh root@143.198.37.67 \
  'cd /opt/secfin && docker compose -f docker-compose.prod.yml build && docker compose -f docker-compose.prod.yml up -d'
```

A few seconds of downtime while the `api` container recreates -- known and accepted
(runbook §12). The image bakes in `src/`, so the `build` is not optional.

**Check the scheduled jobs** (first fires: 2026-07-15 06:00/07:00 UTC):

```bash
ssh root@143.198.37.67 'systemctl list-timers "secfin-*" --no-pager; tail -5 /var/log/secfin/*.status'
```

**Logs / yesterday's traffic:** runbook §10 verbatim (Caddy JSON access log via
`docker compose -f docker-compose.prod.yml logs caddy`).

**Rotate `SECFIN_ADMIN_SECRET` / `SEC_USER_AGENT`:** edit `/opt/secfin/.env`, then
`docker compose -f docker-compose.prod.yml up -d` (no rebuild -- runtime env only).

**Resize:** vertical only (runbook §1 -- never `--workers`, never a second
replica). `doctl compute droplet-action resize 584697256 --size <bigger> --wait`
(disk resize is one-way; RAM/CPU-only resize is reversible).

**Rebuild from nothing:** §2 provisioning → §3 first boot, hydrating from the
newest backup in the operator machine's `./data/backups/` (or the droplet's
`/opt/secfin/data/backups` if the volume died but the disk survived).

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

## 7. Open items (tracked in docs/product/LAUNCH_READINESS.md)

- Off-droplet backup destination -- backups currently live only on the droplet's
  own disk; operator deliberately deferred the decision (Spaces+rclone hourly vs.
  Litestream were the assessed options, 2026-07-14).
- GitHub deploy key on the droplet so day-2 becomes `git pull` (runbook §12)
  instead of §5's rsync.
- Verify the first timer runs (morning of 2026-07-15 UTC).

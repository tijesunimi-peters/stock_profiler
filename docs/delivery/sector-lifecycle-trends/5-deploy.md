# 5 — Deploy: Sector Asset-Lifecycle Trends

**Task slug:** `sector-lifecycle-trends`  ·  **Stage:** 5 — DevOps Engineer
**Date:** 2026-07-21  ·  **Target:** DigitalOcean droplet `secfin-api` (`clearyfi.com`)

## Verdict: ✅ Part A (code) DEPLOYED & VERIFIED. ⚠️ Part B (data) parked on an operator decision.

## What happened
1. **Committed + merged + pushed:** branch `sector-lifecycle-trends` → commit `30be878` →
   merged to `master` (`aca6b8c`, `--no-ff`) → pushed to `origin/master`.
2. **Pre-deploy discovery = production incident.** The droplet root disk was **100% full**
   (48G/48G): `dockerd`/`rsyslogd` write failures, `docker exec` failing. Cause: `secfin-backup`
   writes a ~7.3G snapshot **daily with no retention** — 37G of snapshots filled the disk, and the
   last two were corrupt partials. **Remediated (operator-approved):** pruned old dailies + the
   corrupt partials, kept Jul 18 / Jul 19 / `secfin-latest.db`, `docker builder prune` → **16G
   free**. Live volume DB verified intact throughout.
3. **Part A code deploy** (§5 flow): tagged rollback image `secfin-api:rollback-jul17`
   (`2b3a1ebf68b9`), rsynced the merged tree, `docker compose -f docker-compose.prod.yml build &&
   up -d`. Clean recreate, disk stayed at 16G free.

## Verification
- **On the box:** 38 routes (was 23); `/v1/sectors` + `/v1/sectors/{group}/lifecycle` present;
  `/health` ok; **AAPL FY2024 `dio/dpo/ccc` = ok** (company-level lifecycle metrics compute live on
  the existing prod data); `/v1/sectors` + `/lifecycle` return **honest empty** (0 points, 7
  caveats) — the sector aggregates aren't materialized on prod yet (that's Part B).
- **External (`scripts/verify_deployment.py --base-url https://clearyfi.com`): 11/11 PASS** —
  signup, gated endpoint, free-tier 429, unknown-ticker 404, `/docs`, `/explorer`→hub redirect,
  home, `/company/AAPL`, `/guide`, `/coverage`.

## What's live vs. pending
- **Live now:** the code, the new endpoint, and **company-level DIO/DSO/DPO/CCC on real data**
  (any company that reports the inputs). The `/sectors` lifecycle UI renders its honest empty state.
- **Pending (Part B):** market-wide sector aggregates need the granular bulk backfill, which needs
  a data home larger than the 48G droplet (raw_facts ~57G). **Operator is deciding whether to move
  the DB to a separate resource** (droplet = app serving only). Until then, sector views are
  honestly empty — no customer-facing falsehood.

## Rollback
Code: `docker tag secfin-api:rollback-jul17 secfin-api:latest && docker compose -f
docker-compose.prod.yml up -d` (the pre-deploy Jul-17 image is retained on the box). Data: untouched
by this deploy; last known-good backup Jul 19 (`secfin-latest.db`).

## Open follow-ups (also in DEPLOYMENT_DO.md §6b/§7)
1. **URGENT — backup retention.** No retention → the daily 7.3G snapshot refills the disk in ~2
   days. Interim: prune-to-last-2 or pause `secfin-backup.timer`; permanent: retention in
   `storage/backup.py` or off-droplet backups. **Awaiting operator go.**
2. **Part B data home / droplet resize.** Operator deferred ("ask again after step 1").
3. Scheduled jobs (`secfin-incremental.timer` 06:00, `secfin-backup.timer` 07:00) left intact.

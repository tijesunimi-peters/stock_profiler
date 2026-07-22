# Part B — Move the data to a DigitalOcean Block Storage Volume (scoping)

**Status:** scoping / awaiting operator provisioning decision (2026-07-21).
**Context:** the granular whole-market `raw_facts` is ~57G and does not fit the 48G droplet root
disk (DEPLOYMENT_DO.md §6b/§7). Decision taken: keep the SQLite/DuckDB architecture, move the
**data** onto a **DO Block Storage Volume**, leave the droplet for app serving. **I do not
provision — this is the plan for the operator to execute.**

## Why block storage fits (vs. the alternatives)
- **Keeps the architecture unchanged.** SQLite stays the operational store, DuckDB-over-SQLite the
  analytical batch. A Volume is just a bigger disk mounted at a path — the app only needs
  `SECFIN_DB_PATH` (and the bulk/backup dirs) pointed at the mount. No Postgres migration, no code
  change beyond compose/env.
- **Cheap and elastic.** ~**$0.10/GiB/mo** (e.g. 100 GiB ≈ $10/mo, 250 GiB ≈ $25/mo). Resizable
  **up** online (never down). Independent lifecycle from the droplet — survives droplet
  rebuild/resize.
- **vs. a bigger droplet:** droplet disk resize is **one-way** and couples compute cost to disk. A
  Volume decouples them (the whole point: droplet = app serving, Volume = data).
- **vs. DO Managed Postgres:** would abandon the SQLite/DuckDB design and cost more (~$15+/mo for a
  small instance) for no benefit at this single-process, read-mostly scale. Not now.

## Caveat to accept
A Volume is **network-attached SSD**, not local NVMe — a little more latency per I/O than the
droplet's local disk. For this workload (cache-aside **point reads** under WAL + offline batch
aggregation) it's fine; just don't expect local-disk latency. Volume must be in the **same region**
as the droplet and attaches to **one droplet at a time**.

## Sizing
Live data after the granular re-ingest ≈ the scratch DB today = **54G** (granular `raw_facts` +
~7G holdings + materialized metrics/dupont/lifecycle/distributions). Plus transient bulk zips
(~10–15G during a backfill) and backups.

| Option | Volume | Backups | ~Cost/mo | Notes |
|--------|--------|---------|----------|-------|
| **A (recommended)** | **250 GiB** | on-Volume, `keep=2` (~110G) | ~$25 | DB (~60G) + 2 backups + bulk + headroom, all on one Volume. Simplest. |
| **B (lean)** | **100 GiB** | to DO Spaces (object) | ~$10 + Spaces (~$5) | DB (~60G) + bulk + headroom on the Volume; backups off-box (also closes DEPLOYMENT_DO.md §7's "off-droplet backups" item). More moving parts. |

Recommend **A** to get running, revisit **B** (Spaces) later since it also solves off-box backups.
On a 250G Volume, `SECFIN_BACKUP_KEEP` can rise from the droplet's interim `2` back to `7`.

## Migration plan (operator executes; ~preserves all prod data)
1. **Provision (operator).** `doctl compute volume create secfin-data --region <droplet-region>
   --size 250GiB --fs-type ext4`, then attach: `doctl compute volume-action attach <vol-id>
   <droplet-id>`. (Or the DO UI.)
2. **Mount.** On the droplet it appears as `/dev/disk/by-id/scsi-0DO_Volume_secfin-data`. Mount at
   e.g. `/mnt/secfin_data`, add to `/etc/fstab` with `nofail,discard,defaults` so a reboot is safe.
3. **Seed the DB — preserve operational data (IMPORTANT).** Do **not** just ship the 54G scratch
   copy: it was hydrated from the Jul-16 backup and would **lose prod's since-then API keys and
   incremental filings**. Instead: stop the api container, copy the **current prod** `secfin.db`
   onto the Volume, then run the granular re-ingest **there** (it's idempotent + additive — the
   `raw_facts` COALESCE upsert only adds granular rows, leaving `api_keys`/holdings/insider intact):
   ```
   ingest.backfill  →  metrics_backfill → peer_ranks → peer_distribution
                    →  dupont_backfill → sector_dupont → lifecycle_backfill → sector_lifecycle
   ```
   (The scratch DB can instead be used as a **fast cross-check** of expected row counts, not as the
   live seed.)
4. **Repoint the app.** In `docker-compose.prod.yml`, move the `secfin-data` volume + `./data/bulk`
   (and backups if Option A) onto the Volume mount; set `SECFIN_BACKUP_KEEP=7` in the drop-in.
   `up -d`. Verify with `scripts/verify_deployment.py` + a `/v1/sectors` that now returns populated
   aggregates.
5. **Backfill duration/load.** The bulk companyfacts step is multi-hour and hits SEC — run it once,
   off-peak; the throttle stays at `sec_max_rps=8`. Watch disk during the run (raw_facts grows to
   ~57G). Alternatively run the whole re-ingest on the **operator machine** against a copy and rsync
   the finished DB to the Volume (the runbook's "never re-backfill on the box" preference) — cleaner
   if the merge-preserve of api_keys is handled by backfilling a copy of the *current prod* DB.

## Rollback
The Volume is additive: the current droplet-root DB stays until you cut over in step 4. If the
cutover misbehaves, point `SECFIN_DB_PATH` back at the droplet volume and `up -d`. Detach the Volume
without deleting it.

## Operator decisions needed
1. **Volume size + backup location:** Option A (250G, backups on-Volume) or B (100G + Spaces)?
2. **Region confirm** (Volume must match the droplet's region).
3. **Re-ingest location:** on the box (simplest, multi-hour) or offline-then-rsync (runbook-preferred).

Once you pick, I can prepare the exact compose/env/mount changes and the backfill run sheet — but
the `doctl` volume create/attach is yours to run.

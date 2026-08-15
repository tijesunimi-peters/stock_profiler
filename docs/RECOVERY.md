# Recovery after an interrupted run

After a hard power cut, three things in order: check the volume survived, recover the exact
commands, then restart — and the jobs do not behave alike on restart.

*Written after the 2026-08-03 power cut; corrected 2026-08-14 as the resume flags landed and the
volume grew. Where a figure is quoted below it is the figure measured that day, not a promise.*

## 1. Bring the stack up and check the DB

```bash
docker compose up -d api
docker compose exec -T api python -c "
import sqlite3
c=sqlite3.connect('file:/app/data/secfin.db?mode=ro',uri=True)
print(c.execute('pragma integrity_check').fetchone())
for t in ('raw_facts','holdings','insider_transactions','filing_index',
          'metric_values','metric_ranks','disclosure_stats'):
    print(t, c.execute(f'select count(*) from {t}').fetchone()[0])
"
```

SQLite is in WAL mode, which is exactly the case a power cut is designed around — an interrupted write rolls back from the `-wal` file on the next open rather than corrupting the main file. But `integrity_check` is cheap insurance and the counts tell you whether you're looking at the
real volume or, again, the empty 100 KB host file. As of 2026-08-14 that is ~55 GB: raw_facts
≈ 121.3M, holdings ≈ 50.2M, filing_index ≈ 7.6M, metric_values ≈ 17.7M, metric_ranks ≈ 6.2M.

⚠️ `integrity_check` on a 55 GB file takes a long time and holds a read connection. Run it in a
**standalone** container (`docker compose run -d --rm api …`), not `exec` into the API — a
`docker compose up -d api` while it runs recreates the container and kills it silently, with
exit code 0 and no output.

## 2. Recover the exact command lines

Don't retype them from memory — mine included. Stopped containers survive a reboot unless they were started with `--rm`:

```bash
docker ps -a --format '{{.Names}}\t{{.Status}}\t{{.Command}}'
docker inspect insider-refresh --format '{{join .Config.Cmd " "}}'
```

## 3. Restart each job — they do *not* behave alike

**Companyfacts backfill — resumes cleanly, just re-run.**
```bash
docker compose run --rm api python -m secfin.ingest.backfill
```
The checkpoint table and the partially-downloaded zips are both on `secfin-data`, which is why `CLAUDE.md` insists they share one volume. It picks up where it stopped.

**Filing-index backfill — idempotent, just re-run.**
```bash
docker compose run --rm api python -m secfin.ingest.filing_index_backfill --all-issuers --limit 20000
```
Upserts on `(cik, accession)`, so re-covering ground costs time, not correctness.

⚠️ **`--limit` defaults to 200** on `--all-issuers`: a bare run indexes 200 companies and reports
success. And `--all-issuers` did nothing at all until 2026-08-12 — it sliced the set returned by
`all_ciks()`, raising `TypeError` before the first fetch. If the index looks thin, check its
distinct-CIK count rather than assuming the job ran.

**Insider refresh — prefer `--stale-only`; a whole-market `--refresh` is the wrong tool now.**
`--refresh` has no "already done" state by design (it exists to *stop* skipping cached
accessions), so it restarts from zero and takes ~6–7 hours across all known issuer CIKs.

Since 2026-08-11 there is a targeted repair that is minutes rather than hours:

```bash
docker compose run --rm api python -m secfin.ingest.insider_backfill --stale-only
```

It re-parses ONLY the filings whose cached rows predate the current parser (a NULL
`is_derivative`, which the parser never writes), addressing accessions directly instead of
re-fetching everything above them. Use `--start-after <cik>` to resume an interrupted
whole-market `--refresh`; the walk is sorted, and erring low is free because the upsert replaces.

**Derived tables — re-run the chain, in order.** `metric_values`, `metric_distributions`,
`metric_ranks` and `disclosure_stats` are all derived, and a stale derived table looks exactly
like a working one. If an ingest was interrupted, the tables built on top of it are now wrong
without saying so:

```bash
docker compose run --rm api python -m secfin.ingest.metrics_backfill --start-after <cik>
docker compose --profile analytics run --rm analytics python -m secfin.analytical.peer_distribution
docker compose --profile analytics run --rm analytics python -m secfin.analytical.peer_ranks
docker compose --profile analytics run --rm analytics python -m secfin.analytical.disclosure_stats
```

`metrics_backfill` is ~16 hours whole-market on the 1-vCPU droplet (9.4 companies/min, measured
2026-08-14; ~5.4 h on a 16-core workstation) and takes `--start-after <cik>` (sorted walk, so
one CIK stands for "everything below is done"). In production these run as two weekly chains —
see docs/DEPLOYMENT.md §8; the commands above are the manual equivalents.

## Before you restart the re-ingest

Your standing ruling from 2026-08-02 applies: **backups first**. Take one by hand:

```bash
docker compose run --rm api python -m secfin.storage.backup   # -> ./data/backups (host bind, not the volume)
```

That directory is deliberately a host bind mount rather than part of `secfin-data`, so it
survives even a `docker compose down -v`.

**Do not un-pause `secfin-backup.timer` as part of recovery.** It stays stopped and disabled
until off-droplet (Spaces) backups are wired — each run writes a full multi-gigabyte snapshot to
the droplet's own disk and filled it once (docs/DEPLOYMENT_DO.md §6). `deploy/install.sh` no
longer enables it either, precisely so that re-running the installer cannot quietly reverse that.
A manual snapshot before a re-ingest is the right move; re-arming the timer is a separate,
deliberate decision with a prerequisite.

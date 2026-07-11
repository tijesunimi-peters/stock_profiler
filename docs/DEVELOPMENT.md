# Development: running this project with Docker

This documents the `Dockerfile` and `docker-compose.yml` already in the repo root, as
they actually behave — every command below was run against the real files to confirm it.
For running directly with a local Python install instead, see the README's `Setup`/`Run`
sections.

## What's in the compose file

`docker-compose.yml`'s always-on service is `api`:

```yaml
services:
  api:
    build: .
    ports:
      - "8000:8000"
    environment:
      SEC_USER_AGENT: "${SEC_USER_AGENT:?Set SEC_USER_AGENT, e.g. 'sec-financials-api you@example.com'}"
      SECFIN_DB_PATH: "/app/data/secfin.db"
      SECFIN_BACKUP_DIR: "/app/backups"
      SEC_MAX_RPS: "${SEC_MAX_RPS:-8}"
      SECFIN_ADMIN_SECRET: "${SECFIN_ADMIN_SECRET:-}"
      SECFIN_BACKFILL_WORKERS: "${SECFIN_BACKFILL_WORKERS:-0}"
      SECFIN_BACKFILL_BATCH_SIZE: "${SECFIN_BACKFILL_BATCH_SIZE:-5000}"
      SECFIN_BACKFILL_QUEUE_MAXSIZE: "${SECFIN_BACKFILL_QUEUE_MAXSIZE:-50}"
    volumes:
      - secfin-data:/app/data
      - ./data/backups:/app/backups
```

The same file also defines three opt-in, profile-gated services — `test`, `e2e-app`,
`e2e` — none of which start with a plain `docker compose up`; see "Running tests / lint"
below.

`Dockerfile` builds a `python:3.11-slim` image, `WORKDIR /app`, and runs
`pip install --no-cache-dir .` (production deps only, **not** the `[dev]` extra) against
a `COPY src ./src` taken at build time — the image does not bind-mount your working
tree. Its `CMD` is `uvicorn secfin.api.main:app --host 0.0.0.0 --port 8000`.

There's no separate service or Dockerfile for the ingest jobs — `backfill` and
`incremental` run as one-off overrides of the same `api` service/image via
`docker compose run`, so they get the same build, environment, and volume.

## 1. Configure `.env` once

`docker compose` auto-loads a `.env` file from the project root for variable
substitution — this is the **same** `.env` the app itself reads (`config.py`, via
`pydantic-settings`), so one file covers both. Without it, `SEC_USER_AGENT` has no
default and **every** `docker compose` subcommand fails at parse time, including `build`:

```
error while interpolating services.api.environment.SEC_USER_AGENT: required variable SEC_USER_AGENT is missing a value
```

**This is deliberate, not a bug to smooth over** — `SEC_USER_AGENT` is CLAUDE.md's
non-negotiable SEC-compliance requirement (requests without a descriptive User-Agent +
contact email get blocked), so making it impossible to `docker compose up` without
setting one for real is the intended forcing function. Compose interpolates the
**entire file up front**, regardless of which service or subcommand you actually asked
for, so this hard-fails `build`, `config`, `down`, `ps`, etc. too — not just `up`/`run` —
even though those don't make any SEC request themselves. Knowing that going in avoids
being confused by, say, `docker compose down` failing on a repo you haven't touched yet.
This also applies to the `test`/`e2e` profiles in "Running tests / lint" below — they're
services in this same file, so they need `SEC_USER_AGENT` resolvable too, even though
neither actually makes an SEC request.

Set it up once:

```bash
cp .env.example .env
# edit .env: set SEC_USER_AGENT to something like "stock-profiler you@example.com"
# (a real contact email — the SEC blocks requests without one)
```

`SECFIN_DB_PATH` and `SEC_MAX_RPS` also come from `.env`/the shell if set; compose
otherwise falls back to the defaults baked into `docker-compose.yml`
(`/app/data/secfin.db`, `8`). The bulk-backfill tuning vars
(`SECFIN_BACKFILL_WORKERS`/`_BATCH_SIZE`/`_QUEUE_MAXSIZE`) work the same way — see §4.

## 2. Build the image

```bash
docker compose build
```

**Rebuild whenever `src/` changes.** The image bakes in a `COPY src ./src` at build
time — it is not a live bind mount — so `docker compose run`/`up` will silently run
whatever code was in `src/` the last time you built, not your current working tree.
Concretely: if you build once, then add a new module under `src/secfin/`, `docker compose
run --rm api python -m secfin.some_new_module` will fail with `ModuleNotFoundError` until
you `docker compose build` again.

## 3. Run the API

```bash
docker compose up api
```

The Dockerfile's `CMD` binds uvicorn to `0.0.0.0:8000` inside the container, and compose
maps that to the host with `ports: ["8000:8000"]`, so it's reachable at:

```bash
curl http://localhost:8000/health
# {"status":"ok"}
```

`docker compose down` stops and removes the container/network but leaves the
`secfin-data` volume (and everything in it) alone.

## 4. Run the bulk backfill

```bash
docker compose run --rm api python -m secfin.ingest.backfill
```

Same service, same image, same volume, different command — `docker compose run`
overrides the `CMD` but keeps the `api` service's `environment:` and `volumes:` as
declared. Tuning flags (all optional; see `secfin.ingest.backfill.build_arg_parser`):

```bash
docker compose run --rm api python -m secfin.ingest.backfill \
  --workers 4 --batch-size 5000 --queue-maxsize 50 \
  --data-dir ./data/bulk --db-path ./data/secfin.db
```

Paths are relative to the container's `WORKDIR` (`/app`), so the defaults
(`./data/bulk`, `./data/secfin.db`) resolve to `/app/data/bulk` and
`/app/data/secfin.db` — both under the one mounted volume (see §6).

The same three tuning values (workers/batch-size/queue-maxsize, everything but
`--data-dir`) can also be set once in `.env` instead of passed as flags every time —
`docker-compose.yml`'s `environment:` block now forwards `SECFIN_BACKFILL_WORKERS`,
`SECFIN_BACKFILL_BATCH_SIZE`, and `SECFIN_BACKFILL_QUEUE_MAXSIZE` (each with the same
default `config.py` itself uses, so leaving them unset in `.env` changes nothing). CLI
flags still win if you pass both. `SECFIN_BULK_DATA_DIR` is deliberately not
forwarded here the same way -- it's a path under the same `secfin-data` volume as
`SECFIN_DB_PATH`, so like that one it's meant to stay fixed inside the container, not be
tuned per run.

## 5. Run the daily incremental job

```bash
docker compose run --rm api python -m secfin.ingest.incremental
```

Optional flags (`secfin.ingest.incremental.build_arg_parser`):

```bash
docker compose run --rm api python -m secfin.ingest.incremental \
  --date 2026-07-02 --forms 10-K 10-Q --db-path ./data/secfin.db
```

`--date` defaults to yesterday if omitted.

## 6. Where the data lives, and why the backfill is resumable

Everything persists in the single named volume declared in `docker-compose.yml`,
`secfin-data`, mounted at `/app/data`. Compose namespaces it by the project name (the
directory name, unless overridden) — confirmed on this repo:

```bash
$ docker compose config
...
volumes:
  secfin-data:
    name: stock_profiler_secfin-data
```

Both of the following land under that one volume, since neither is redirected
elsewhere by `docker-compose.yml`'s `environment:` block:

- the SQLite DB (`SECFIN_DB_PATH=/app/data/secfin.db`, set explicitly in compose)
- the downloaded bulk zips (`companyfacts.zip`, `submissions.zip`), because
  `secfin_bulk_data_dir` defaults to `./data/bulk` (`config.py`), which resolves
  against the container's `/app` `WORKDIR` to `/app/data/bulk`

That's what makes `docker compose run --rm api python -m secfin.ingest.backfill`
resumable across separate invocations: each `run` is a fresh, disposable *container*,
but the *volume* isn't torn down with it. On a re-run, `ingest/downloader.py` sees the
zip already on disk (via its sidecar `.meta.json` + size check) and skips or resumes it
instead of re-downloading, and the writer skips any CIK already present in the
`ingest_checkpoint` table in `secfin.db`.

`docker compose down` does **not** remove this volume. `docker compose down -v` does —
only do that if you actually want to discard the downloaded zips and the ingested
database and start over.

## 7. Backing up and restoring the SQLite store

`docker-compose.yml` adds a second, separate mount on the `api` service specifically for
this: a host bind mount, `./data/backups:/app/backups` (`SECFIN_BACKUP_DIR=/app/backups`).
It is intentionally **not** the same volume as `/app/data` — a backup that lived inside
`secfin-data` would vanish along with the DB itself the moment you `docker compose
down -v`. `./data/backups` is a real directory in the project root, already covered by
the repo's blanket `data/` `.gitignore` rule, so backups don't need a separate ignore entry.

Take a backup any time (the API can be running — see below for why this is safe):

```bash
docker compose run --rm api python -m secfin.storage.backup
```

This writes a timestamped `secfin-<UTC timestamp>.db` into `./data/backups/` and also
refreshes `./data/backups/secfin-latest.db` to match, so scripts/CI can always grab "the
most recent one" without parsing timestamps.

Restore (hydrate) into a fresh volume — the order matters, since restoring into a file
another process already has open isn't supported:

```bash
docker compose down -v                                          # or: brand new environment
docker compose run --rm api python -m secfin.storage.restore --latest
docker compose up api
```

`storage/restore.py` also deletes any stale `-wal`/`-shm` sidecar files at the destination
before copying the backup in — otherwise SQLite would try to replay them against the
restored file's unrelated page contents on next open.

**Why backing up a live database is safe:** `storage/backup.py` uses sqlite3's *online
backup API* (`Connection.backup()`), not a raw file copy. A plain `cp` of a WAL-mode
database can capture an inconsistent snapshot (uncommitted pages still sit in the `-wal`
sidecar); the backup API is built to copy a live, concurrently-written database
correctly, retrying pages that change mid-copy. It also opens the source connection
read-only (`mode=ro`), the same pattern §8 below uses for inspection — this script can
never itself write to the live DB.

## 8. Inspecting the DB without contending with an active writer

The store uses SQLite WAL mode with exactly one writer at a time (`storage/
sqlite_repository.py`: `PRAGMA journal_mode=WAL`, `PRAGMA synchronous=NORMAL`). WAL
allows concurrent readers while a writer is active, but open your inspection connection
**read-only** anyway, so a stray write attempt errors instead of contending for the
writer lock:

```bash
docker compose run --rm api python3 -c "
import sqlite3
c = sqlite3.connect('file:/app/data/secfin.db?mode=ro', uri=True)
print(c.execute('SELECT COUNT(*) FROM ingest_checkpoint').fetchone())
"
```

This is a second, independent container attached to the same `secfin-data` volume — it
can run at the same time as a `backfill`/`incremental` container without needing to be
stopped first. `mode=ro` refuses to create the file if it doesn't exist yet (rather than
silently starting a new empty DB), which is a useful sanity check that you're pointed at
real data.

## Running tests / lint (Docker)

The prod `api` image deliberately ships without `tests/` or the `[dev]` extra, so
`docker compose run --rm api pytest` won't work. Instead, two **opt-in compose profiles**
bind-mount the repo into the public `python:3.11-slim` (and the Puppeteer) image — they are
NOT started by `docker compose up`. Both need `SEC_USER_AGENT` resolvable (see §Open
questions), the same as every other compose command.

### Unit tests

```bash
docker compose --profile test run --rm test
```

Bind-mounts the repo, `pip install -e ".[dev]"`, runs `pytest -q`. Same result as a local
venv, no host Python needed.

### Headless-browser e2e (real Chromium)

```bash
docker compose --profile e2e up --abort-on-container-exit --exit-code-from e2e
```

Two containers: `e2e-app` seeds the AAPL/JPM/WMT fixtures into a throwaway DB
(`scripts/seed_fixture.py`, no network) and serves the app with a `/health` healthcheck;
once healthy, `e2e` runs `scripts/headless_check.js` in the official Puppeteer image against
it — loading `/company/AAPL`, `/coverage`, `/components` in Chromium, **failing on any
console/page/request error**, and writing a full-height screenshot per page to
`./data/e2e-shots/` (gitignored). The `--exit-code-from e2e` makes the whole command exit
with the check's pass/fail code (CI-friendly). Tear down with
`docker compose --profile e2e down`.

To point the check at a different app or page set, override `BASE_URL` / `PAGES` on the `e2e`
service (see `scripts/headless_check.js`).

### Social-media slide deck (interactive HTML, no rendering step)

`src/secfin/api/static/social-slides.html` is a self-contained, interactive 1080x1080 carousel —
a 9-slide "company profile" for AAPL (cover, vitals, 5-year trend, peer percentile standing,
three named-peer comparisons, a recap, and a closing CTA) — open it directly in a browser, or via
the running app at `/static/social-slides.html`. Its data is inline (copied from
`infographic-template.html`'s own verified FY2023 numbers and its FY2021-FY2025 `trendSeries`,
not fetched), and it ships its own prev/next buttons, dot navigation, keyboard arrow-key support,
and touch swipe — there's no Puppeteer/PNG rendering step; the HTML page itself is the deliverable.

## Open questions / mismatches

- ~~**No tested path to run tests/lint via the project's own Docker image.**~~ **Resolved:**
  the prod image stays a slim runtime artifact (no `tests/`/`[dev]`); testing runs through the
  `test` and `e2e` compose profiles above, which bind-mount the repo into the base/Puppeteer
  images. Both verified: `test` → full pytest suite green; `e2e` → headless Chromium renders the
  data pages with zero console errors.
- ~~**`.env.example` doesn't list the backfill tuning variables**~~ **Resolved:**
  `.env.example` now lists `SECFIN_BULK_DATA_DIR`, `SECFIN_BACKFILL_WORKERS`,
  `SECFIN_BACKFILL_BATCH_SIZE`, `SECFIN_BACKFILL_QUEUE_MAXSIZE`, and the three tuning
  *integers* (not the path) are wired into `docker-compose.yml`'s `api` service
  `environment:` block (`${VAR:-default}`, matching `config.py`'s own defaults), so
  setting them in `.env` reaches a Docker-run backfill instead of silently doing
  nothing. `SECFIN_BULK_DATA_DIR` itself is deliberately not forwarded the same way —
  it's a path under the same `secfin-data` volume as `SECFIN_DB_PATH`, so like that one
  it stays fixed in-container rather than tuned per run.
- **Every `docker compose` subcommand — including `build`, `config`, `down` — fails
  without `SEC_USER_AGENT` resolvable**, since compose interpolates the whole file
  up front. This is deliberate, not a gap to smooth over (see §1) — a soft fallback
  would undercut CLAUDE.md's non-negotiable SEC User-Agent requirement by letting
  `docker compose up` silently start the API in a state the SEC blocks. Worth knowing
  going in rather than discovering it via the error.

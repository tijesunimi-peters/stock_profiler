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

## 9. Developing from somewhere else (SSH over ngrok)

Two profile-gated services let you keep working from a laptop that has nothing installed on it
but an SSH client: `devbox`, a container with the toolchain and `tmux` in it, and `ngrok`, the
agent that makes it reachable. The agent dials **out**, so there is no inbound port to open and
no router configuration involved.

```
laptop                          ngrok edge          this machine (compose network)
------                          ----------          -----------------------------
ssh -p N ....tcp.ngrok.io ----> TCP endpoint -----> devbox:22   (sshd, tmux, node, python)
  -L 8000:api:8000                                    |  repo bind-mounted at /workspace
  -L 5174:localhost:5174                              +--> api:8000     (the running API)
                                                      +--> vite :5174   (npm run dev in the box)
browser -> localhost:8000, localhost:5174
```

### One-time setup

```bash
# 1. Put an ngrok authtoken in .env  (https://dashboard.ngrok.com/get-started/your-authtoken)
echo 'NGROK_AUTHTOKEN=...' >> .env

# 2. Build and start both services
docker compose --profile remote up -d --build

# 3. Install the frontend deps INSIDE the box (its node_modules is a container-owned volume,
#    deliberately separate from the host's -- see below)
docker compose exec -u dev -w /workspace/clearyfi_frontend devbox npm ci
```

By default the box authorises whatever is in this machine's `~/.ssh/authorized_keys` — the keys
already trusted to log in here, which is what the laptop holds. Override with
`DEVBOX_AUTHORIZED_KEYS`. Note that `~/.ssh/id_ed25519.pub` would be the **wrong** file: it
authorises this computer, not the one connecting. This machine's own key is mounted separately
and always authorised, so `ssh -p 2222 dev@127.0.0.1` works locally.

### Connecting

ngrok's TCP endpoint is a **new random host:port every time the agent restarts**, so look it up
rather than remembering it:

```bash
bash deploy/scripts/remote-dev-url.sh
```

It prints the full command, which looks like:

```bash
ssh -p 12345 dev@8.tcp.ngrok.io \
    -o HostKeyAlias=clearyfi-devbox \
    -L 8000:api:8000 \
    -L 5174:localhost:5174

tmux new -A -s dev          # attach, or create on the first run
```

`HostKeyAlias` pins `known_hosts` to the devbox's own persistent host key instead of to the ngrok
address. Without it every session produces a fresh "authenticity of host" prompt, which is how
you stop reading them.

With that session open, on the laptop:

| URL | What it is |
|---|---|
| `http://localhost:8000` | the API and the built app — the `api` container |
| `http://localhost:5174` | the vite dev server, once you run `npm run dev` in the box |

`-L 8000:api:8000` is resolved from the **container's** side of the compose network, so `api` is
a Docker DNS name and the API needs no published port for this to work.

### Why the app is not tunnelled directly

It would be one line to point an ngrok HTTP tunnel at `api:8000`, and it would be a mistake.
`api/auth.py`'s `_is_first_party_browser` treats any request carrying `Sec-Fetch-Site:
same-origin` as first-party and **skips both the API-key requirement and the rate limit** — and
every browser sends that header. A public URL would therefore serve the entire API, keyless and
unthrottled, to anyone who found it, over a multi-GB store, while spending our SEC request
budget. Its own docstring says it is "NOT a security boundary".

Routing everything through SSH means that gate never faces the internet. It also means the
browser's `Host` header stays `localhost`, so vite's `allowedHosts` check and its HMR websocket
both work untouched — a public tunnel would have needed both reconfigured.

ngrok is still a third party in the path, but SSH is end-to-end encrypted, so the edge relays
ciphertext it cannot read. That is a materially different position from an HTTP tunnel, where
TLS terminates at their edge.

### Things that will bite you

- **tmux sessions do not survive a container restart.** They are process state. `restart:
  unless-stopped` carries the box across host reboots and Docker daemon restarts, which is most
  of the value, but `docker compose build` followed by a recreate ends every session.
- **The box is a second SQLite writer.** `api` holds a write connection; an ingest job run from
  the devbox is another against the same lock. This is exactly the contention `notebook` avoids
  with `:ro`. Fine for editing and `pytest`; think before starting a backfill while the API
  serves.
- **`node_modules` inside the box is a named volume, not the host's.** The host tree is host-built
  binaries (`.dockerignore` already refuses to copy it for the same reason), so the two are kept
  apart in both directions. `npm ci` has to be run once inside the box, and again after a
  dependency change.
- **A TCP endpoint needs a card on file, even on ngrok's free tier.** The agent authenticates
  fine, connects, and is then refused with `ERR_NGROK_8013`: "You must add a credit or debit card
  before you can use TCP endpoints on a free account... This card will NOT be charged." Add one
  at <https://dashboard.ngrok.com/settings#id-verification> and it works. This is the one
  external dependency in the whole setup, and it is worth knowing before you build on it.
  `docker compose logs ngrok` is where that error appears; the container will have given up
  after three tries rather than looping.
- **Locked accounts fail as "Permission denied (publickey)".** If you ever rebuild the user in
  `deploy/devbox/Dockerfile`, keep the `usermod -p '*'`: `useradd` leaves the account
  password-*locked*, and sshd refuses a locked account before it ever reads `authorized_keys`.
  The real reason appears only in `docker compose logs devbox`.

### Local checks, without involving ngrok

`devbox` publishes `127.0.0.1:2222` so the container can be verified on its own:

```bash
ssh -p 2222 dev@127.0.0.1 'whoami; tmux -V; node -v; python -V'
ssh -p 2222 dev@127.0.0.1 'curl -sf http://api:8000/health'      # docker DNS works
ssh -p 2222 -o PubkeyAuthentication=no dev@127.0.0.1             # must be denied
docker compose logs devbox                                        # sshd's own reasons
```

Both `devbox` and `ngrok` bind loopback only, sit behind the `remote` profile, and are absent
from `docker-compose.prod.yml`. `tests/test_compose_shape.py` asserts all three, plus that the
sshd config stays key-only and that neither service introduces a required environment variable
(compose evaluates those even when the profile is not selected, which would break every other
compose command).

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

## Exploring the database in a notebook (dev only)

JupyterLab against the local SQLite database, with `pandas` and `duckdb`:

```bash
docker compose --profile notebook up -d notebook
docker compose --profile notebook exec -T notebook jupyter lab list   # prints the token URL
# open http://127.0.0.1:8888/?token=...
docker compose --profile notebook down
```

Notebooks live in `./notebooks` on the host (gitignored except the README), so they survive the
container.

**It cannot run in production, by three independent mechanisms** — not by convention:

1. the service exists only in `docker-compose.yml`, and `docker-compose.prod.yml` is a
   **standalone** file rather than an overlay, so production cannot start a service it does not
   define;
2. it sits behind the `notebook` profile, so a bare `docker compose up` never starts it;
3. it binds **127.0.0.1 only** — verified unreachable on the host's LAN address.

`tests/test_compose_shape.py` asserts 1 and 3, plus the read-only data mount, by parsing the
compose files. "We would never do that" is not a guarantee.

**The data volume is mounted `:ro`.** The API and the batch jobs contend for the single SQLite
write lock, and a notebook holding a write connection open between cells is a real hazard — a
write attempt fails with `attempt to write a readonly database`.

For big aggregations, prefer DuckDB over pandas — it reads the SQLite file directly, the same
mechanism `analytical/` uses, and returns a DataFrame:

```python
import duckdb
con = duckdb.connect()
con.execute("ATTACH '/app/data/secfin.db' AS sq (TYPE sqlite)")
con.execute("SELECT peer_group, peer_count FROM sq.sector_dupont WHERE fiscal_year=2025").df()
```

⚠️ `pd.read_sql("SELECT * FROM raw_facts")` is 121M rows and will exhaust memory. Aggregate in
SQL, not in pandas.


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

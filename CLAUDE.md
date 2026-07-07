# CLAUDE.md

Context and working agreement for this repository. Read this first before making changes.

## What this project is

A pipeline and API that ingests **structured financial data from the SEC**, normalizes it
into one clean canonical schema, and serves it as developer-friendly JSON. The business goal
is a low-cost subscription API that undercuts existing financial-data providers by turning
messy SEC filings into consistent, queryable data.

## Scope: Track 1 only (structured numeric data)

**In scope right now:**
- Income statements
- Balance sheets
- Cash flow statements
- Insider trades (Forms 3 / 4 / 5)
- Institutional ownership (Form 13F holdings; Schedules 13D / 13G)

All of these are filed with the SEC in structured form (XBRL for financials, ownership XML
for insider trades, an XML information table for 13F). We **ingest and re-shape structured
data — we do not scrape or parse HTML.**

**Critical 13F caveat:** 13F is a quarter-end *holdings snapshot*, NOT transactions. Any
"buy/sell" is DERIVED by diffing consecutive quarters (`normalize/flows.py` → `HoldingDelta`).
Never present derived deltas as reported trades. Carry the long-only / ~45-day-lag caveats.

**Explicitly out of scope (do not build yet):**
- MD&A, risk factors, footnotes, or any free-text narrative ("Track 2")
- Any LLM-based summarization of filings
- Cross-company screening query language (planned; see docs/ROADMAP.md — do not start early)

If a task drifts toward Track 2 or free-text extraction, **stop and flag it** rather than
implementing it. Track 2 has a recurring per-token cost that fights the "cheap subscription" goal
and is a deliberate later decision.

## Architecture (four stages)

```
  ingest            normalize             store              serve
  ------            ---------             -----              -----
  SEC APIs   -->    map raw GAAP    -->   canonical    -->   FastAPI
  (XBRL /          tags to our           records in         REST JSON
   ownership       canonical             DB / cache
   XML)            schema
```

- **ingest** (`src/secfin/sec/`, `src/secfin/ingest/`): thin, rate-limited clients over the
  SEC's public JSON/XML APIs (`sec/`), plus pipeline orchestration (`ingest/`) that runs a
  bulk backfill and a daily incremental job through the same parse+store path. See
  `docs/ARCHITECTURE.md` for the pipeline diagram.
- **normalize** (`src/secfin/normalize/`): the value-add. Maps inconsistent source tags to one
  canonical schema. **This is the moat — most of our real work lives here.**
- **store** (`src/secfin/storage/`): two distinct stores, not one replacing the other:
  - *Operational* — SQLite now (WAL mode, concurrent point reads for the API), with a planned
    path to Postgres. Sits behind repository interfaces (`RawFactRepository` plus the `Cusip`,
    `Insider`, and `Holdings` repositories). This is what `serve` reads from — routes read it
    **cache-aside** (`_facts_for_cik`, `_insider_transactions_for_cik`, `_manager_snapshot`),
    falling back to SEC only on a miss — and what `ingest/` writes to.
  - *Analytical* — DuckDB for batch aggregation only (13F cross-manager inversion, cross-company
    screening), **never on the live request path**. The exact mechanism (DuckDB-over-Parquet vs
    DuckDB reading the SQLite file directly) is under evaluation — see ROADMAP 2.5.
    See `docs/ARCHITECTURE.md`.
- **serve** (`src/secfin/api/`): FastAPI endpoints returning canonical JSON.

## Data sources (SEC — all public, all free)

Base host for structured data: `https://data.sec.gov`

- **Company filing index:** `/submissions/CIK##########.json`
  (10-digit zero-padded CIK) — lists all filings for one company.
- **Company facts (all XBRL numbers for a company):**
  `/api/xbrl/companyfacts/CIK##########.json` — primary source for income/balance/cashflow.
- **Single concept across periods:** `/api/xbrl/companyconcept/CIK##########/us-gaap/{Concept}.json`
- **Frames (one concept across ALL companies for one period):**
  `/api/xbrl/frames/us-gaap/{Concept}/{Unit}/{Period}.json`
  — powers cross-company screening (`GET /v1/screen`, Milestone 4; `sec/frames.py`,
  `ingest/frames_backfill.py`). Confirmed live: frame periods are CALENDAR-quarter
  aligned (not fiscal-period aligned), `data[]` rows carry no `fy`/`fp`/`filed`/`form`,
  and a bare annual instant (`CY2023I`) 404s -- see `docs/DATA_MODEL.md`'s "Cross-company
  screening" section.
- **Ticker → CIK map:** `https://www.sec.gov/files/company_tickers.json`
- **Insider trades (Forms 3/4/5):** discovered via `/submissions/...`, then fetch the ownership
  XML document from the filing's EDGAR directory. Parsed in `src/secfin/sec/insider.py`.
- **Bulk companyfacts (all companies, nightly rebuild):**
  `https://www.sec.gov/Archives/edgar/daily-index/xbrl/companyfacts.zip` — one
  `CIK##########.json` per company, same shape as the companyfacts API. Used by
  `ingest/backfill.py`. Verified 2026-07-03; re-check before relying on it long-term.
- **Bulk submissions (all filers' history, nightly rebuild):**
  `https://www.sec.gov/Archives/edgar/daily-index/bulkdata/submissions.zip` — downloaded by
  the backfill; not parsed yet, earmarked for the M2.5 whole-market 13F ingest. (Per-company
  insider/13F already work via the per-company `/submissions/...` JSON through the API, not
  this bulk zip.)
- **Daily filing index (for the incremental job):**
  `https://www.sec.gov/Archives/edgar/daily-index/{year}/QTR{n}/form.{YYYYMMDD}.idx` — used
  by `ingest/incremental.py` to find CIKs that filed 10-K/10-Q on a given date.

## Tech stack

- Python 3.11+
- `httpx` — HTTP client (async-capable)
- `pydantic` v2 — schema + validation (canonical models live in `normalize/schema.py`)
- `FastAPI` + `uvicorn` — API layer
- `pytest` — tests
- SQLite for local dev; keep DB access behind a small interface so Postgres is a drop-in later.
- `DuckDB` (planned, Milestone 2.5) — **analytical only**, for batch jobs (13F cross-manager
  inversion, cross-company screening). Queries Parquet on disk **or** the SQLite file directly
  via DuckDB's `sqlite` extension — the mechanism is under evaluation (see ROADMAP 2.5), so treat
  Parquet as likely-but-not-decided. Not the API's transactional backend; never on the live
  per-request read path. Serverless — no DB process to run or pay for, which fits the
  cheap-subscription goal. Pin a version and verify its multi-process read/write concurrency
  semantics against that version's docs before implementing — this has changed across DuckDB
  releases, so "verify, don't assume."

## Repository layout

```
src/secfin/
  config.py              # settings (User-Agent, DB path, backfill tuning) from env
  sec/
    client.py            # rate-limited SEC HTTP client (User-Agent + throttle)  [implemented]
    companyfacts.py      # fetch + shape companyfacts JSON                        [implemented]
    ticker_cache.py      # in-memory ticker->CIK map (TickerCache)                [implemented]
    insider.py           # fetch + parse Forms 3/4/5 ownership XML               [implemented]
    institutional.py     # fetch + parse 13F info table + cover page, 13D/G      [implemented]
    frames.py            # fetch + parse SEC frames API (cross-company screening) [implemented]
  normalize/
    schema.py            # canonical Pydantic models                            [implemented]
    mapping.py           # canonical concept -> candidate US-GAAP tags (the moat) [implemented, growing]
    statements.py        # build canonical statements from company facts         [implemented]
    flows.py             # derive 13F buy/sell by diffing snapshots              [implemented]
    cusip.py             # CusipResolver + resolve_snapshot_cusips (13F CUSIP->CIK) [implemented]
    screening.py          # SCREENABLE_CONCEPTS + frames<->RawFact reconciliation [implemented]
  storage/
    repository.py                 # abstract RawFactRepository                   [implemented]
    sqlite_repository.py          # SQLite impl: WAL, idempotent upsert, checkpoint [implemented]
    cusip_repository.py           # abstract CusipMapRepository                  [implemented]
    sqlite_cusip_repository.py    # SQLite impl (resolved + unresolved CUSIPs)   [implemented]
    insider_repository.py         # abstract InsiderTransactionRepository        [implemented]
    sqlite_insider_repository.py  # SQLite impl (filing-granularity cache)       [implemented]
    holdings_repository.py        # abstract HoldingsSnapshotRepository          [implemented]
    sqlite_holdings_repository.py # SQLite impl (keyed manager_cik + period)     [implemented]
    backup.py                     # sqlite3 online-backup snapshot               [implemented]
    restore.py                    # hydrate a fresh volume from a backup         [implemented]
  ingest/
    downloader.py         # resumable download of SEC bulk zips                [implemented]
    backfill.py           # bulk backfill: downloader -> N parsers -> 1 writer [implemented]
    incremental.py        # daily incremental via SEC daily index + SECClient  [implemented]
    frames_backfill.py    # bulk-ingest frames data for cross-company screening [implemented]
  api/
    main.py              # FastAPI app + wiring                                [implemented]
    routes.py            # endpoints (statements, insider, manager 13F, ...)   [implemented]
tests/
docs/                    # ARCHITECTURE, DATA_MODEL, ROADMAP, DEVELOPMENT
```

## Conventions (follow these — they prevent whole classes of bugs)

- **CIK is always stored/passed as an `int` internally** and zero-padded to 10 digits only when
  building SEC URLs. Never store the padded string as the identity.
- **Values are stored in their raw reported unit** (usually USD, sometimes shares). Never silently
  rescale. Carry the `unit` on every fact.
- **Periods:** duration facts carry `period_start`/`period_end`; instant facts carry `instant`.
  A fiscal key is `(fiscal_year, fiscal_period)` e.g. `(2024, "Q3")` / `(2024, "FY")`.
- **Every canonical fact records its source `gaap_tag` and whether it was a company extension tag**
  (`is_extension`). This is required for auditability and for improving the mapping over time.
- **Restatements:** the same concept+period can appear in multiple filings with different values.
  Keep the `accession` + `filed` date on each fact; latest `filed` wins for "current" views, but
  never delete prior values.
- Type hints on all public functions. Keep `sec/` clients free of business logic — mapping belongs
  in `normalize/`.
- **Docker persistence:** the `api` service's `secfin-data` volume (mounted at `/app/data`)
  holds both the SQLite DB (`SECFIN_DB_PATH=/app/data/secfin.db`) and the downloaded bulk
  zips (`secfin_bulk_data_dir` defaults to `./data/bulk`, which resolves to `/app/data/bulk`
  under the container's `/app` `WORKDIR`). That's a single volume, not two — both the
  checkpoint table and the resumable downloads need to survive the same container restarts
  for backfill resumability to work. See `docs/DEVELOPMENT.md`.
- **Backups live on a separate mount, deliberately.** `docker-compose.yml` also binds
  `./data/backups:/app/backups` (`SECFIN_BACKUP_DIR`) — a host directory, not part of the
  `secfin-data` volume above, so `storage/backup.py`'s snapshots survive `docker compose
  down -v`. `storage/restore.py` hydrates a fresh volume from one. See `docs/DEVELOPMENT.md` §7.

## SEC compliance (non-negotiable — do not bypass)

- **Every request must send a descriptive `User-Agent`** identifying the app and a contact email
  (set via `SEC_USER_AGENT` env var). Requests without it get blocked.
- **Respect the SEC fair-access rate limit** (the client throttles requests). Do not remove or raise
  the throttle to "go faster."
- SEC data is public domain, but **verify current fair-access / redistribution terms** before launch
  at the SEC developer resources page — treat the numbers in `client.py` as "verify, don't assume."

## Common commands

```bash
# install (editable) + dev deps
pip install -e ".[dev]"

# run the API locally
uvicorn secfin.api.main:app --reload

# tests
pytest

# lint/format (if configured)
ruff check . && ruff format .

# bulk backfill (downloads SEC companyfacts.zip/submissions.zip, parses with a
# multiprocessing pool, writes to SQLite via a single writer process)
python -m secfin.ingest.backfill

# daily incremental (companies that filed 10-K/10-Q recently, via the throttled SECClient)
python -m secfin.ingest.incremental
```

Or via Docker (`docs/DEVELOPMENT.md` has the full workflow, including why you must
`docker compose build` again after any source change — the image bakes in `src/` rather
than mounting it live):

```bash
cp .env.example .env   # then set a real SEC_USER_AGENT — required even for `build`
docker compose build
docker compose up api                                          # API on :8000
docker compose run --rm api python -m secfin.ingest.backfill    # same image, same volume
docker compose run --rm api python -m secfin.ingest.incremental

docker compose run --rm api python -m secfin.storage.backup            # snapshot -> ./data/backups
docker compose run --rm api python -m secfin.storage.restore --latest  # hydrate a fresh volume

# tests / lint run via a separate compose file (no api service, so no SEC_USER_AGENT needed)
docker compose -f docker-compose.test.yml run --rm test
```

## Guardrails for the agent

1. Don't expand into Track 2 (free text / summarization) — flag instead.
2. Don't weaken SEC rate limiting or drop the User-Agent.
3. When you add a new canonical concept, update `normalize/mapping.py` AND `docs/DATA_MODEL.md`.
4. Prefer extending the mapping table over hard-coding company-specific fixes in `statements.py`.
5. Keep the DB behind an interface; no raw SQL in the API layer.
6. Never put DuckDB on the live request path — it's for batch/analytical jobs only. The API
   keeps reading from the operational store (SQLite → Postgres).
7. Analytical queries (13F inversion, cross-company screening) run as separate batch jobs
   against the analytical store (Parquet, or DuckDB-over-SQLite — mechanism TBD, see ROADMAP
   2.5), not inline with a request handler.
8. In the bulk backfill pipeline (`ingest/backfill.py`): parsers never open the database —
   exactly one process (the writer) owns the SQLite connection. If you add a new bulk data
   source, route it through the same single-writer queue rather than giving parsers their
   own connections.

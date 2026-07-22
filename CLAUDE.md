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
    screening), **never on the live request path**. **Decided (benchmarked 2026-07-06):** it
    reads the live SQLite file directly via `ATTACH '<db>' (TYPE sqlite)` — no Parquet landing
    for the single-quarter inversion (~2.8× faster than plain SQLite, zero ETL; both-directions
    WAL concurrency verified live, not assumed). Parquet stays deferred to Milestone 4
    (whole-market, multi-quarter scale). See `docs/ARCHITECTURE.md` §3b.
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
- `DuckDB` (`analytical` extra, pinned `duckdb==1.4.5`) — **analytical only**, for batch jobs
  (13F cross-manager inversion, cross-company screening). Not the API's transactional backend;
  never on the live per-request read path. Serverless — no DB process to run or pay for, which
  fits the cheap-subscription goal. **Decided (benchmarked 2026-07-06):** it reads the live
  SQLite file directly via `ATTACH '<db>' (TYPE sqlite)` — no Parquet landing for the
  single-quarter inversion (~2.8× faster than plain SQLite, zero ETL; both-directions WAL
  concurrency verified live, not assumed). Parquet stays deferred to Milestone 4 (whole-market,
  multi-quarter scale). Never a dependency of the base install or the live API. See
  `docs/ARCHITECTURE.md` §3b.

## Repository layout

Everything below is implemented unless noted. See `docs/ROADMAP.md` for what's shipped
per milestone and what's still open.

```
src/secfin/
  config.py                    # settings (User-Agent, DB path, backfill tuning) from env
  sec/
    client.py                  # rate-limited SEC HTTP client (User-Agent + throttle)
    companyfacts.py            # fetch + shape companyfacts JSON -> RawFacts (us-gaap + dei)
    ticker_cache.py            # in-memory ticker->CIK map (TickerCache), one per process
    insider.py                 # fetch + parse Forms 3/4/5 ownership XML (joint filers)
    institutional.py           # fetch + parse 13F info table + cover page, 13D/G
    frames.py                  # fetch + parse SEC frames API (cross-company screening)
  normalize/
    schema.py                  # canonical Pydantic models
    mapping.py                 # canonical concept -> candidate US-GAAP tags (the moat)
    statements.py              # build canonical statements from company facts
    flows.py                   # derive 13F buy/sell by diffing snapshots (diff_snapshots,
                               #   diff_holders, prior_quarter_end)
    cusip.py                   # CusipResolver + resolve_snapshot_cusips (13F CUSIP->CIK,
                               #   exact-name-match, conservative)
    geography.py               # US_STATE_CODES + classify_location: bucket a 13F filer's raw
                               #   stateOrCountry (state/other/unknown) for the holder choropleth
    screening.py                # SCREENABLE_CONCEPTS + frames<->RawFact reconciliation (M4)
    metrics.py                  # fundamental metrics over RawFact history -> MetricValue
                               #   (period_end-anchored, TTM/as-of, status+reason; R1-R8) +
                               #   METRIC_DIRECTION favorability map (higher_is_better)
    themes.py                   # composite-health THEMES (theme -> constituent metrics) +
                               #   DEFERRED_THEMES; source of truth for the sector theme scores
  storage/                     # all SQLite impls: WAL mode, own connection, same db file
    repository.py              # abstract RawFactRepository
    sqlite_repository.py       # RawFact SQLite impl: idempotent upsert, checkpoint
    insider_repository.py      # abstract InsiderTransactionRepository (filing-granular cache)
    sqlite_insider_repository.py
    holdings_repository.py     # abstract HoldingsSnapshotRepository (13F, (cik, period) key)
    sqlite_holdings_repository.py
    cusip_repository.py        # abstract CusipMapRepository (CUSIP<->CIK, unresolved tracking)
    sqlite_cusip_repository.py
    beneficial_ownership_repository.py  # abstract cache for Schedule 13D/13G rows
    sqlite_beneficial_ownership_repository.py
    api_key_repository.py               # abstract API key store (M3 auth/tiers/quotas)
    sqlite_api_key_repository.py
    company_profile_repository.py       # abstract cik->SIC profile store (Metrics Phase 2)
    sqlite_company_profile_repository.py
    metric_value_repository.py          # abstract materialized-metric store (Metrics Phase 2)
    sqlite_metric_value_repository.py
    metric_rank_repository.py           # abstract precomputed peer-rank store (Metrics Phase 2)
    sqlite_metric_rank_repository.py
    sector_theme_score_repository.py    # abstract composite theme-score + decomposition store
    sqlite_sector_theme_score_repository.py  # sector_theme_scores + sector_theme_components tables
    sector_company_repository.py        # abstract per-company-in-sector value read (Company view)
    sqlite_sector_company_repository.py  # metric_values JOIN company_profiles (+ ranks); no new table
    backup.py                  # sqlite3 online-backup API snapshot (safe on live WAL DB)
    restore.py                 # hydrate a fresh volume from a backup
  analytical/                  # analytical-layer BATCH jobs (DuckDB over the SQLite file) --
                               #   never on the live request path (see guardrail 6)
    peer_ranks.py              # Metrics Phase 2: per-SIC-group percentile/z-score -> metric_ranks
    sector_theme_scores.py     # composite 0-100 theme scores from metric_distributions ->
                               #   sector_theme_scores (+ decomposition). PURE-PYTHON (input
                               #   already aggregated, no DuckDB); still offline, never live path
  ingest/
    downloader.py              # resumable download of SEC bulk zips
    backfill.py                # bulk companyfacts backfill: downloader -> N parsers -> 1 writer
    incremental.py              # daily incremental via SEC daily index + SECClient
    frames_backfill.py          # bulk-ingest frames data for cross-company screening (M4)
    institutional_backfill.py  # bulk 13F ingest for one quarter (offline candidate discovery)
    insider_backfill.py        # bulk-seed the insider-trades cache (M3 ownership cache-warming)
    location_backfill.py       # backfill filing_manager_location onto cached 13F snapshots
                               #   (cover-page-only fetch; for the holder-geography choropleth)
    sic_backfill.py            # backfill cik->SIC into company_profiles (Metrics Phase 2)
    metrics_backfill.py        # materialize per-company metrics into metric_values (Phase 2)
  api/
    main.py                    # FastAPI app + wiring + upstream-SEC-error handlers
    routes.py                  # endpoints: statements, periods, metrics, metric history, peers,
                               #   insider, 13D/G, 13F manager + issuer-centric (holders,
                               #   activity, holdings-series, holder-geography), sector DuPont +
                               #   spreads + lifecycle + theme-scores (composite health),
                               #   cusip-resolution-stats, screening (M4), usage/tiers/admin (M3)
    static/                    # server-rendered UI: index, company hub (absorbed the data
                               #   explorer, /explorer redirects there),
                               #   coverage/guide pages (see docs/ROADMAP_UI.md)
scripts/                       # committed, reusable one-off scripts (benchmarks, load tests)
tests/
docs/                          # ARCHITECTURE, DATA_MODEL, DEVELOPMENT, DEPLOYMENT
                               #   (generic runbook), DEPLOYMENT_DO (as-built prod:
                               #   clearyfi.com on DigitalOcean), ROADMAP,
                               #   ROADMAP_DATA_DEPTH (raw-facts endpoint, tier-2
                               #   concepts, dimensional-data spike), ROADMAP_METRICS,
                               #   ROADMAP_UI, STYLE_GUIDE
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
  (set via `SEC_USER_AGENT` env var). Requests without it get blocked. Enforced at construction in
  both `SECClient.__init__` and `ingest/downloader.py`'s `download_resumable` (the latter doesn't
  go through `SECClient` — see its module docstring — so it needed its own copy of the same guard;
  found missing and fixed 2026-07-07).
- **Respect the SEC fair-access rate limit** (the client throttles requests). Do not remove or raise
  the throttle to "go faster." The throttle is a single **process-wide** `RateLimiter`
  (`sec/client.py`'s `_shared_default_limiter`), not one per `SECClient` instance — every `/v1`
  route handler constructs its own `SECClient()`, so a per-instance limiter (the pre-2026-07-07
  behavior) let concurrent requests each get an independent, uncoordinated budget. Don't
  reintroduce that by passing an explicit `max_rps=` at a real call site (that path exists so
  tests can get an isolated limiter, not for production use).
- Confirmed live 2026-07-07 (`docs/ROADMAP.md`'s pre-launch checklist) against SEC's own developer
  pages, fetched with our own compliant User-Agent (generic tools get 403'd by SEC's WAF): current
  max rate is 10 req/s (config.py's `sec_max_rps=8` stays under it); no explicit redistribution
  restriction found (consistent with EDGAR's public-domain status, but re-verify before launch if
  much time has passed — treat this as "verify, don't assume" like everything else here).

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
# REQUIRED for full market-wide concept coverage: this is the ONLY path that ingests the
# full ~500-tag payload per company. A volume seeded only by frames_backfill (6 headline
# concepts) + daily incremental is headline-concepts-only -- the granular balance-sheet/income
# concepts (AssetsCurrent, LiabilitiesCurrent, LongTermDebt, InventoryNet, InterestExpense,
# OperatingIncomeLoss) that the sector liquidity/solvency spreads + lifecycle metrics need stay
# near-empty until this runs. (Root-caused + re-ingested 2026-07-21; see ROADMAP_SECTOR_ANALYTICS
# #3.) Whole-market run ~= 20k companies / 120M+ facts; grows raw_facts a lot -- size the volume.
python -m secfin.ingest.backfill

# daily incremental (companies that filed 10-K/10-Q recently, via the throttled SECClient)
python -m secfin.ingest.incremental

# bulk-ingest one quarter's 13F filings (offline candidate discovery from submissions.zip,
# seeds the same HoldingsSnapshotRepository the manager endpoints read from)
python -m secfin.ingest.institutional_backfill --period YYYY-MM-DD

# backfill filing_manager_location onto already-cached 13F snapshots (cover-page-only fetch;
# the bulk institutional_backfill skips already-cached accessions, so it can't do this).
# Powers the holder-geography choropleth. --period is repeatable.
python -m secfin.ingest.location_backfill --period 2026-03-31 --period 2026-06-30

# analytical extra (DuckDB, batch/analytical jobs only — never the live API)
pip install -e ".[analytical]"

# peer-ranking pipeline (Metrics Phase 2): SIC profiles -> materialize metrics -> rank.
# The first two touch SEC / are pure; the third needs the analytical extra above.
python -m secfin.ingest.sic_backfill          # cik -> SIC into company_profiles
python -m secfin.ingest.metrics_backfill      # materialize metrics into metric_values (no network)
python -m secfin.analytical.peer_ranks        # DuckDB: percentile/z-score -> metric_ranks

# composite sector theme scores (sector-overview redesign, Phase 0): reads metric_distributions
# (materialized by peer_distribution) and z-scores per-sector medians across sectors. PURE PYTHON
# (no DuckDB / no analytical extra) -- still an offline batch, never the live path.
python -m secfin.analytical.sector_theme_scores
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
docker compose run --rm api python -m secfin.ingest.institutional_backfill --period 2026-03-31

docker compose run --rm api python -m secfin.storage.backup            # snapshot -> ./data/backups
docker compose run --rm api python -m secfin.storage.restore --latest  # hydrate a fresh volume

# tests in Docker (opt-in profiles; bind-mount the repo, not the prod image)
docker compose --profile test run --rm test                             # pytest
docker compose --profile e2e up --abort-on-container-exit --exit-code-from e2e  # headless-Chromium render check
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

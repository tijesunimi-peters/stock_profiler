# Architecture

Four stages. Each stage has one job; keep the boundaries clean so any stage can be
swapped without rewriting the others.

```
  ingest              normalize             store                    serve
  ------              ---------             -----                    -----
  SEC public APIs --> map raw GAAP    -->   canonical          -->   FastAPI
  (XBRL JSON /       tags to our            records                  REST JSON
   ownership XML)    canonical schema       (SQLite/Postgres)
                                        \
                                         `-> Parquet landing -> DuckDB
                                             (batch analytical jobs only;
                                              never on the request path)
```

## 1. Ingest — `src/secfin/sec/` and `src/secfin/ingest/`

Thin clients over the SEC's free public APIs live in `sec/`. **No business logic there.**
Pipeline orchestration (downloading, multiprocessing, batching into the store) lives in
`ingest/`, which is the only place that reaches into `storage/`.

- `client.py` — one HTTP client for everything. Enforces the required `User-Agent` and
  throttles to the SEC fair-access rate. All SEC access goes through it.
- `companyfacts.py` — pulls the `companyfacts` JSON (all XBRL numbers for a company) and
  flattens it to `RawFact`s via `flatten_company_facts`, a pure function with no I/O. Also
  resolves ticker → CIK.
- `insider.py` — pulls Forms 3/4/5 ownership XML and parses to `InsiderTransaction`s. **Known
  limitation:** a filing with multiple `<reportingOwner>` blocks (joint filers) currently yields
  only the first owner's row — see `DATA_MODEL.md`; tracked as a must-fix in `ROADMAP.md` M2.
- `institutional.py` — pulls Form 13F information-table XML → `HoldingsSnapshot`s
  (implemented; CUSIP→CIK resolution is a separate opt-in step, `normalize/cusip.py`).
  13F is a quarter-end *snapshot*, not trades. Also pulls Schedules 13D/G → one
  `BeneficialOwnership` per reporting person, but **only for the SEC's modern
  structured-XML filings** (`SCHEDULE 13D`/`SCHEDULE 13G` form types) — legacy
  "SC 13D"/"SC 13G" filings are plain HTML/text with no fixed schema, and parsing those
  would mean HTML scraping (out of scope per CLAUDE.md).

The financials source is already structured (companyfacts gives us clean data points), so
there's no HTML parsing. Insider trades and 13F are structured XML — again no HTML scraping.

### Two ingestion entry points, one parse+store path

Both call `flatten_company_facts` and the same `storage.RawFactRepository`, so a fact
ingested via either path is indistinguishable in the store.

- **Bulk backfill** (`ingest/backfill.py`, `python -m secfin.ingest.backfill`) — a bounded
  producer–consumer pipeline for a full historical load:

  ```
    ingest/downloader.py          N parser processes           1 writer (main process)
    (sequential, ~2-3 requests)         |                              |
    companyfacts.zip, submissions.zip   |                              |
              |                          v                              v
              `---------> [bounded work queue] -----> flatten_company_facts -----> [bounded result queue] -----> batched
                          (cik, zip entry name)         (no DB access)                (cik, entry, facts)         upsert + checkpoint
  ```

  - `ingest/downloader.py` fetches `companyfacts.zip` and `submissions.zip` to local disk,
    streamed and resumable (HTTP Range + a size/sha256 sidecar file). This is ~2-3 HTTP
    requests total for the whole backfill — the SEC per-IP rate limit is irrelevant at that
    volume, so downloads are **not** parallelized and don't go through `SECClient`'s limiter
    (they still send the required `User-Agent`).
  - The main process enumerates `companyfacts.zip`'s entries (one `CIK##########.json` per
    company), skips CIKs already checkpointed, and feeds the rest into a bounded
    `multiprocessing.Queue` — this is the backpressure point on the producer side.
  - N parser processes (default `cpu_count() - 1`) each open the zip once and, per entry,
    call `flatten_company_facts` — the same pure function `sec/companyfacts.py` uses for the
    live per-request path, so the two are guaranteed to produce identical `RawFact`s.
    **Parsers never open the database.**
  - The main process doubles as the single DB writer: it drains a second bounded queue,
    batches ~5-10k facts across companies, and commits each batch's facts *and* its
    per-company checkpoint rows in one SQLite transaction — so a crash mid-backfill can't
    leave a checkpoint without its facts, or vice versa. Re-running the backfill skips
    everything already checkpointed.

- **Daily incremental** (`ingest/incremental.py`, `python -m secfin.ingest.incremental`) — for
  ongoing updates: reads the SEC daily index (`form.YYYYMMDD.idx`) to find CIKs that filed a
  10-K/10-Q on a given date, then fetches each via the existing throttled `SECClient` and
  feeds the same `flatten_company_facts` → repository path. Volume is small (hundreds/day),
  so this runs as a single process — no pool, and no extra processes to "go faster", since
  the SEC's fair-access limit is per-IP, not per-process.

## 2. Normalize — `src/secfin/normalize/`  ← the value-add

The SEC's data is structured but *inconsistent*: companies use different us-gaap tags for
the same concept, invent extension tags, and change tags year to year. This stage maps all
of that onto one small, stable canonical schema.

- `schema.py` — models. `RawFact` (source-faithful) vs. canonical outputs
  (`Statement`, `StatementLine`, `InsiderTransaction`).
- `mapping.py` — `canonical concept → ordered candidate GAAP tags`. The heart of the moat.
- `statements.py` — assembles a `Statement` for a company+period by choosing, per concept,
  the first candidate tag that has a value (latest-filed wins for restatements).
- `flows.py` — derives institutional buy/sell (`HoldingDelta`) by diffing two consecutive
  13F `HoldingsSnapshot`s (`diff_snapshots`), plus `prior_quarter_end` (pure quarter-end
  date arithmetic). Wired into `GET /v1/managers/{manager_cik}/activity` (see §4).
- `cusip.py` — resolves 13F CUSIPs to issuer CIKs by exact-normalized-name match against
  SEC's `company_tickers.json` (`CusipResolver`), and `resolve_snapshot_cusips` to apply
  it across a whole `HoldingsSnapshot` in place. Deliberately conservative — no fuzzy
  matching (see `DATA_MODEL.md`).

See `DATA_MODEL.md` for the schema and mapping details.

## 3. Store — `src/secfin/storage/`

Two distinct stores, not one replacing the other — different jobs, different access
patterns.

### 3a. Operational store — what `serve` reads from

- `storage/repository.py` — abstract `RawFactRepository`. All DB access goes through this
  interface (CLAUDE.md: "keep DB behind an interface; no raw SQL in the API layer"), so
  moving to Postgres later is a drop-in.
- `storage/sqlite_repository.py` — the SQLite implementation. WAL mode + `synchronous=NORMAL`
  so the API's concurrent point reads don't block on the backfill/incremental writer.
  Caches the flattened `RawFact`s per company so we don't hit the SEC on every request (also
  the only way to respect fair-access limits at scale). The API routes read through this
  cache (see §4): `api/routes.py`'s `_facts_for_cik` serves from SQLite when a company is
  already there (from a prior request, `ingest/backfill.py`, or `ingest/incremental.py`) and
  only calls SEC live on a miss, writing the result back before returning.
- **Single-writer rule:** exactly one process holds a writer connection at a time. In the
  bulk backfill that's the main/orchestrator process; parser processes never touch the DB.
  The daily incremental is already single-process, so this is automatic there.
- **Idempotent upsert, keyed on** `(cik, gaap_tag, unit, period_start, period_end, instant,
  accession)`. Re-ingesting the same fact from the same filing updates in place; a
  restatement (same concept+period, different accession/filed) lands as a new row — nothing
  is ever deleted, and `normalize/statements.py` picks "current" (latest `filed`) at read
  time. Absent `period_start`/`period_end`/`instant` are stored as `''` rather than `NULL`,
  because SQLite treats every `NULL` as distinct in a `UNIQUE` index — leaving them `NULL`
  would let idempotent upsert silently duplicate every instant (balance-sheet) fact.
- **Checkpoint table** (`ingest_checkpoint`, keyed on `(cik, source)`) records which
  companies have been ingested per source (`bulk_companyfacts` / `daily_incremental`), so a
  crashed backfill resumes without re-parsing already-done companies and without re-hitting
  the SEC (the zip is already local).
- `storage/cusip_repository.py` — abstract `CusipMapRepository`, and
  `storage/sqlite_cusip_repository.py`'s SQLite impl. Its own connection to the same db
  file (fine under WAL mode). Persists CUSIP→CIK resolutions and tracks unresolved
  CUSIPs; wired in via `normalize/cusip.py`'s `CusipResolver` (see §4).
- **Planned, not yet built:** an `InsiderTransactionRepository` and a
  `HoldingsSnapshotRepository`, same interface-then-SQLite-impl shape as
  `RawFactRepository`/`SQLiteRawFactRepository` above. Right now `/insider-trades`,
  `/managers/{manager_cik}/holdings`, and `/managers/{manager_cik}/activity` all
  re-fetch and re-parse from SEC on *every* call — there is no cache-aside read for any
  of them the way `_facts_for_cik` gives statements (see §4 and `docs/ROADMAP.md`'s
  Milestone 2).

### 3b. Analytical engine — DuckDB over Parquet (planned, Milestone 2.5)

Batch aggregation only. This is **not** the API's transactional backend and must **never**
sit on the live per-request read path — it exists for jobs that need to scan across many
companies/managers at once, which a per-company operational store isn't shaped for:

- the 13F cross-manager inversion (Milestone 2.5) — "who holds this issuer, across all
  managers, this quarter?"
- cross-company screening via the SEC `frames` API (Milestone 4).

Data pattern: cached SEC data is *also* landed as Parquet files on disk (a serialization of
the same operational records — see `DATA_MODEL.md`), and DuckDB runs vectorized scans over
those files as a separate batch job. Serverless — no DB process to run or pay for, which
fits the cheap-subscription goal. DuckDB can also read the SQLite file directly via its
`sqlite` extension, so the two stores coexist without a sync pipeline being mandatory.

**Verify, don't assume:** DuckDB's multi-process read/write concurrency semantics have
changed across releases. Pin a version and confirm the concurrency behavior in that
version's docs before implementing anything on top of it.

## 4. Serve — `src/secfin/api/`

FastAPI. `main.py` wires the app; `routes.py` exposes:

- `GET /v1/companies/{symbol}/statements/{income|balance|cashflow}?year=&period=`
- `GET /v1/companies/{symbol}/periods`
- `GET /v1/companies/{symbol}/insider-trades?limit=` — fetched live from SEC on every
  request; no cache-aside store for insider transactions yet (unlike statements below —
  see §3a's "planned, not yet built" note and `docs/ROADMAP.md`).
- `GET /v1/managers/{manager_cik}/holdings?period=` — one manager's 13F snapshot
  (`fetch_13f_snapshot`), with CUSIPs resolved to CIKs in place via
  `normalize/cusip.resolve_snapshot_cusips` before returning. 404 if that manager has no
  13F-HR for the given quarter-end.
- `GET /v1/managers/{manager_cik}/activity?period=&include_unchanged=` — DERIVED buy/sell
  for one manager: fetches the requested quarter's snapshot and the prior one
  (`normalize/flows.prior_quarter_end`; a missing prior quarter — e.g. the manager's
  first 13F — is treated as `None`, so `diff_snapshots` reports everything "new"),
  resolves CUSIPs on both, and returns `diff_snapshots`' output alongside an
  always-present `caveats` list (derived-not-reported, long-only, ~45-day lag). No
  cache-aside store yet — both endpoints re-fetch and re-parse from SEC on every call.
- `GET /v1/companies/{symbol}/institutional-holders`,
  `GET /v1/companies/{symbol}/institutional-activity` (501 until implemented — these are
  *issuer*-centric and need the cross-manager 13F index from Milestone 2.5, unlike the
  *manager*-centric endpoints above which only need one manager's filings)

`symbol` accepts a ticker or a raw CIK. Statement/period facts are served cache-aside from
the storage layer (§3a): populated by `ingest/`, or by the route itself on a cache miss.
Ticker→CIK resolution is cached too, but in memory rather than SQLite (`sec/ticker_cache.py`'s
`TickerCache`, one instance for the process lifetime) — it's a single small map shared
across all companies, not per-company data, so it doesn't belong in the RawFact store.

## Data flow example (income statement for AAPL, FY2024)

1. `routes` resolves `AAPL` → CIK `320193`.
2. `companyfacts.fetch_raw_facts` pulls + flattens all XBRL points.
3. `statements.build_statement` filters to (2024, "FY"), maps concepts, emits lines.
4. FastAPI returns the `Statement` as JSON.

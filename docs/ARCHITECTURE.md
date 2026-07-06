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
- `insider.py` — pulls Forms 3/4/5 ownership XML and parses to `InsiderTransaction`s. Joint
  filers (multiple `<reportingOwner>` blocks — e.g. an insider and a trust or holding company
  filing together) yield one row per reporting owner per transaction/holding row, since the XML
  doesn't attribute a shared table row to a single owner.
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

- **Institutional (13F) bulk ingest** (`ingest/institutional_backfill.py`,
  `python -m secfin.ingest.institutional_backfill --period YYYY-MM-DD`) — Milestone 2.5's
  whole-market ingest: unlike the two paths above (which target the *statements* store),
  this seeds `storage.HoldingsSnapshotRepository`, which otherwise only grows one manager at
  a time via live requests to `GET /managers/{cik}/holdings`. Candidate managers for a given
  quarter are found **locally, offline** by scanning `submissions.zip` (`ingest/downloader
  .download_submissions_file` — the same bulk file `ingest/backfill.py` already downloads,
  fetched standalone here so this job doesn't force a companyfacts.zip download it doesn't
  need) and reusing `sec/institutional.py`'s pure `recent_13f_filings` filter — no network
  involved in discovery. For each candidate, a cheap `HoldingsSnapshotRepository
  .cached_accession` lookup is compared against the winning filing's accession: a match
  skips (already current), a mismatch (nothing cached yet, or a newer `13F-HR/A` appeared)
  fetches via `sec.institutional.fetch_13f_snapshot_for_filing` — a variant of
  `fetch_13f_snapshot` split out specifically so this job, which already knows the winning
  filing from the local zip scan, skips the redundant live `submissions.json` lookup per
  manager — and upserts. Single async process, sequential, same "the fair-access limit is
  per-IP, not per-process" reasoning as daily incremental; this job's cost is network I/O
  against the shared throttled `SECClient`, not CPU, so there's no producer/consumer pool
  like the companyfacts backfill's.

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
- `storage/insider_repository.py` — abstract `InsiderTransactionRepository`, and
  `storage/sqlite_insider_repository.py`'s SQLite impl (own connection, same db file).
  Unlike `RawFactRepository`, caching is keyed at **filing** granularity (an
  `insider_filings` table of fetched accessions), not per transaction row — a Form 3/4/5
  is immutable once accepted (an amendment gets its own accession, never rewrites a
  prior one), so there's no restatement-in-place case to handle, and filing-level dedup
  sidesteps a schema gap where two distinct real rows in one filing can be
  field-for-field identical (see `docs/DATA_MODEL.md`). `api/routes.py`'s
  `_insider_transactions_for_cik` serves `/insider-trades` cache-aside from it, the same
  shape as `_facts_for_cik`, but the cache-hit check is "have we cached at least `limit`
  filings for this issuer" rather than "do we have this company at all" — `limit` bounds
  filings fetched, not rows, so a smaller cached limit isn't a superset of a larger one.
- `storage/holdings_repository.py` — abstract `HoldingsSnapshotRepository`, and
  `storage/sqlite_holdings_repository.py`'s SQLite impl (own connection, same db file).
  Keyed on `(manager_cik, report_period)` — not per accession like the insider store,
  because a 13F CAN be superseded (an original 13F-HR plus a later 13F-HR/A for the same
  quarter; the newer-filed one wins), so a re-store replaces that quarter's holdings
  wholesale. `api/routes.py`'s `_manager_snapshot` serves both
  `/managers/{manager_cik}/holdings` and `/managers/{manager_cik}/activity` cache-aside
  from it. Resolved CUSIP→CIK is deliberately not persisted — every cached row comes
  back `cik=None`, so `normalize/cusip.resolve_snapshot_cusips` always re-runs on read
  (see §4), letting CUSIPs that were unresolved at cache time resolve later as the
  mapping improves. **Known, deliberate staleness window:** once a quarter is cached,
  the read path never re-checks SEC for a later amendment — same trade-off
  `_facts_for_cik` already makes for statements.

### 3b. Analytical engine — DuckDB over SQLite, Parquet deferred (Milestone 2.5)

Batch aggregation only. This is **not** the API's transactional backend and must **never**
sit on the live per-request read path — it exists for jobs that need to scan across many
companies/managers at once, which a per-company operational store isn't shaped for:

- the 13F cross-manager inversion (Milestone 2.5) — "who holds this issuer, across all
  managers, this quarter?"
- cross-company screening via the SEC `frames` API (Milestone 4).

**Decision (benchmarked 2026-07-06, not assumed): DuckDB reads the live SQLite file
directly (`ATTACH '<db>' (TYPE sqlite)`) — no Parquet landing for the single-quarter
inversion.** The roadmap treated this as an open question ("evaluate before building");
here's what the evaluation found, against a synthetic-but-realistic single quarter (5,500
managers, 561,471 holding rows, 6,000 distinct CUSIPs, Zipf-weighted so large-caps cluster
across many managers' books like real filings do — not a uniform distribution, which would
make the aggregation unrealistically cheap):

| Approach | Median latency (5 runs) |
|---|---|
| Plain SQLite, existing `(manager_cik, report_period)` index | 285ms |
| Plain SQLite, **+ a new `(report_period, cusip)` index** | 946ms (slower — see below) |
| DuckDB `ATTACH ... (TYPE sqlite)` over the same file, no new index | 103ms |

The full-quarter inversion query (`GROUP BY cusip` across every row for one
`report_period`) touches every row regardless of index, since `report_period` has only one
distinct value within a single quarter's data — an index keyed on it adds random I/O
(index → heap lookups) instead of avoiding a scan, which is *why the added index made it
slower*, not faster. DuckDB's win is vectorized scan+aggregate, not index usage — a ~2.8×
speedup with **zero ETL**: no serialization step, no second copy of the data to keep in
sync, just a read-only attach to the file the API and `ingest/` already write to.

**Concurrency, verified both directions against the pinned version (not assumed):**
confirmed live (not just read from docs) that with the SQLite file in WAL mode (already
true for every repository in `storage/` — see their `PRAGMA journal_mode=WAL`), a DuckDB
`ATTACH` read succeeds while a writer holds an open, uncommitted transaction (and
correctly does *not* see the uncommitted row — proper MVCC snapshot isolation), and
symmetrically, a writer commits normally while DuckDB holds a long-running scan open
against the same file. Neither direction blocks the other. This matches DuckDB's own
`sqlite` extension docs ("more than one thread or process can read... at the same time...
locking is handled by the SQLite library, not DuckDB") but was confirmed empirically here
rather than taken on faith.

**Pinned:** `duckdb==1.4.5` (the 1.4.x LTS line, not the newer 1.5.x — a batch-only
dependency should need minimal maintenance attention; see `pyproject.toml`'s `analytical`
extra, `pip install ".[analytical]"`). Never a dependency of the base install or the live
API process.

**Parquet is deferred to Milestone 4, not built now.** The roadmap's own fallback logic
applies exactly as written: land Parquet only if DuckDB-over-SQLite proves insufficient
for the single-quarter case, and it didn't. Revisit if/when the workload becomes
*whole-market, multi-quarter* (M4 cross-company screening) rather than one quarter's
inversion — that's a different data volume where a columnar landing may start to earn its
keep; a serialization step purely for one quarter's ~560K rows would not.

**Follow-up (shipped): the issuer-centric endpoints did NOT end up using this path.**
`GET /v1/companies/{symbol}/institutional-holders` / `.../institutional-activity` (§4)
need one issuer's holder list, which is a point lookup by CUSIP — not the whole-quarter,
every-security aggregate this benchmark was about. They're served by a plain indexed
SQLite query (`HoldingsSnapshotRepository.holders_of`, a new `(cusip, report_period)`
index) straight from the operational store, confirmed with the user before building
rather than reflexively reusing the DuckDB result for a workload it wasn't benchmarked
for. DuckDB-over-SQLite stays reserved for genuinely whole-market aggregates (a future
holders leaderboard, M4 screening) — the "stand up the analytical query path" roadmap item
is still open for exactly that, separate from what shipped here.

## 4. Serve — `src/secfin/api/`

FastAPI. `main.py` wires the app; `routes.py` exposes:

- `GET /v1/companies/{symbol}/statements/{income|balance|cashflow}?year=&period=`
- `GET /v1/companies/{symbol}/periods`
- `GET /v1/companies/{symbol}/insider-trades?limit=` — cache-aside via
  `_insider_transactions_for_cik` + `InsiderTransactionRepository` (§3a): a hit requires
  at least `limit` filings already cached for the issuer, since `limit` bounds filings
  fetched, not rows; a miss re-fetches the full requested `limit` from SEC and grows the
  cache.
- `GET /v1/managers/{manager_cik}/holdings?period=` — one manager's 13F snapshot, served
  cache-aside via `_manager_snapshot` + `HoldingsSnapshotRepository` (§3a), with CUSIPs
  resolved to CIKs in place via `normalize/cusip.resolve_snapshot_cusips` before
  returning (cache hit or miss — resolution is never cached, see §3a). 404 if that
  manager has no 13F-HR for the given quarter-end.
- `GET /v1/managers/{manager_cik}/activity?period=&include_unchanged=` — DERIVED buy/sell
  for one manager: fetches the requested quarter's snapshot and the prior one
  (`normalize/flows.prior_quarter_end`; a missing prior quarter — e.g. the manager's
  first 13F — is treated as `None`, so `diff_snapshots` reports everything "new"), each
  via the same cache-aside `_manager_snapshot`, resolves CUSIPs on both, and returns
  `diff_snapshots`' output alongside an always-present `caveats` list
  (derived-not-reported, long-only, ~45-day lag).
- `GET /v1/companies/{symbol}/institutional-holders?period=` — managers holding this
  issuer this quarter, across ALL 13F filings: the issuer-centric inverse of
  `/managers/{cik}/holdings`. Resolves `symbol` → CIK → CUSIP(s) via a new
  `CusipMapRepository.cusips_for_cik` (the reverse of the existing CUSIP→CIK direction),
  then a new `HoldingsSnapshotRepository.holders_of(cusips, period)` — a live, indexed
  point lookup (`(cusip, report_period)`), **not** a precomputed cross-manager inversion;
  see §3b for why that distinction is deliberate. 404 if the issuer's CUSIP hasn't been
  resolved yet (points at `/cusip-resolution-stats`). Response carries
  `_ISSUER_CENTRIC_CAVEATS`: an empty holder list is ambiguous between "no manager holds
  this issuer" and "this quarter isn't ingested yet" — a live-query trade-off, surfaced
  rather than hidden.
- `GET /v1/companies/{symbol}/institutional-activity?period=&include_unchanged=` — DERIVED
  buy/sell for this issuer, aggregated across managers: same CIK/CUSIP resolution, then
  `holders_of` at both the requested and prior quarter (`normalize/flows.prior_quarter_end`),
  diffed via a new `normalize/flows.diff_holders` — `diff_snapshots`' transpose (one
  issuer's CUSIP(s), many managers, instead of one manager, many securities), classifying
  each `(manager_cik, cusip)` pair independently rather than summing a multi-class
  issuer's CUSIPs together.
- `GET /v1/cusip-resolution-stats` — coverage snapshot for 13F CUSIP→CIK resolution
  (`normalize/cusip.cusip_resolution_stats`), a first-class metric rather than an
  endpoint about any one company/manager. Not cached — a cheap single-COUNT query over
  `CusipMapRepository` on every call, since the whole point is to reflect current, drifting
  coverage rather than a snapshot from whenever it was first requested.

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

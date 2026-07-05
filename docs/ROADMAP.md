# Roadmap

Track 1 = structured numeric data. Everything below stays inside Track 1 unless marked
"deferred".

## Now (scaffold — done / in progress)

- [x] SEC client: User-Agent + rate limiting
- [x] companyfacts fetch + flatten to RawFact
- [x] Canonical schema (RawFact / Statement / StatementLine / InsiderTransaction)
- [x] Starter concept → GAAP tag mapping
- [x] Statement builder (concept selection + restatement handling)
- [x] API skeleton (statements, periods)
- [x] Ticker→CIK map caching -- `sec/ticker_cache.py`'s `TickerCache` holds the whole map
      in memory (one instance for the process lifetime), refetching only once per TTL

## Milestone 1 — reliable financials for one statement type

- [x] Storage layer: cache RawFacts per company (SQLite behind a repository interface) --
      `storage/repository.py` + `storage/sqlite_repository.py`
- [x] Bulk backfill pipeline: SEC companyfacts.zip -> bounded producer/consumer ->
      SQLite (`ingest/backfill.py`, `python -m secfin.ingest.backfill`)
- [x] Daily incremental ingest via the SEC daily index + existing throttled SECClient
      (`ingest/incremental.py`, `python -m secfin.ingest.incremental`)
- [x] Put the cache in front of API routes (stop hitting SEC per request) -- routes.py's
      `_facts_for_cik` reads SQLite first, only fetching+storing from SEC on a miss
- [x] Expand mapping coverage for the income statement; measured with `coverage_report()`
      against real filings for 7 companies -- added 3 more `interest_expense` candidate
      tags, closing that gap for 6/7 (see `docs/DATA_MODEL.md`'s worked example + known
      limitations for the bank/retailer gaps that are structural, not tagging gaps)
- [x] Real tests against saved companyfacts fixtures (Apple, a bank, a retailer) --
      `tests/fixtures/` + `tests/test_real_fixtures.py`

## Milestone 2 — all three statements + ownership & flows

- [x] Balance sheet + cash flow mapping coverage -- measured with `build_statement()` /
      `coverage_report()` against the AAPL/WMT/JPM fixtures; AAPL and WMT fully covered,
      one real gap closed (JPM's `CashAndDueFromBanks`), remaining gaps documented as
      structural (bank shape) or genuine tagging absences in `docs/DATA_MODEL.md`
- [x] Implement `sec/insider.py` (Forms 3/4/5 XML parsing) -- `parse_ownership_xml`
      (pure) + `fetch_insider_transactions` (submissions.json -> filter -> fetch -> parse);
      verified against real Apple Form 3/4/5 fixtures, including the primaryDocument
      viewer-vs-raw-XML quirk (see `docs/DATA_MODEL.md`). Known gap: joint filers
      (multiple `<reportingOwner>` per filing) only capture the first owner.
- [x] Insider-trades endpoint -- `GET /v1/companies/{symbol}/insider-trades?limit=`
      wires `fetch_insider_transactions` straight through, fetched live from SEC on
      every request (no cache-aside store for insider transactions yet -- unlike
      `/statements`, that's a deliberate gap, not an oversight). Verified end-to-end
      against the real running API (Docker) with real AAPL data, ticker + CIK symbol
      forms, unknown-ticker 404, and `limit` validation.
- [ ] Cache-aside store for insider transactions -- add an `InsiderTransactionRepository`
      (interface + SQLite impl) the same shape as `storage/repository.py` /
      `sqlite_repository.py`, and change `get_insider_trades` to read it first the way
      `_facts_for_cik` does for statements, only calling SEC (+ writing back) on a miss.
      Needs an idempotency key (e.g. `(issuer_cik, accession, ...)` — a filing can carry
      multiple transaction/holding rows) and a decision on what "cache hit" means for a
      `limit`-bounded live source (a smaller cached `limit` isn't a superset of a larger
      one the way a company's full RawFact set is).
- [ ] Cache-aside store for 13F holdings snapshots -- add a `HoldingsSnapshotRepository`
      (interface + SQLite impl) and change `fetch_13f_snapshot`'s caller(s) to read
      through it first, keyed on `(manager_cik, report_period)`. Same rationale as
      above: repeated per-manager/per-quarter requests currently re-fetch and re-parse
      from SEC every time.
- [x] Implement `sec/institutional.py` 13F info-table XML parsing → `HoldingsSnapshot` --
      `parse_info_table_xml` (pure) + `fetch_13f_snapshot` (submissions.json -> match
      quarter -> locate info table via directory listing -> fetch -> parse); verified
      against real Berkshire Hathaway 13F-HR fixtures spanning 2016-2026, including the
      cover-page-vs-info-table filename quirk and a confirmed `value` unit convention
      change (thousands -> whole dollars, ~2023) -- see `docs/DATA_MODEL.md`. `cik`
      (CUSIP resolution) intentionally left `None` -- that's the next item below.
- [x] CUSIP→CIK mapping table (+ track unresolved CUSIPs) -- `storage/cusip_repository.py`
      (interface) + `storage/sqlite_cusip_repository.py`, and `normalize/cusip.py`'s
      `CusipResolver` (matches a 13F row's issuer name against SEC's own
      `company_tickers.json`, exact-normalized-match only, no fuzzy matching). Persists
      both resolved and unresolved CUSIPs; `unresolved_cusips()` surfaces the latter for
      review. Confirmed against a real, deliberately-declined mismatch (Berkshire's
      "ALLY FINL INC" vs SEC's "Ally Financial Inc.") -- see `docs/DATA_MODEL.md`. Now
      wired into the two manager endpoints below via `resolve_snapshot_cusips`.
- [x] Wire `normalize/flows.diff_snapshots` into a per-manager activity endpoint --
      `GET /v1/managers/{manager_cik}/holdings?period=` (implemented `get_manager_holdings`,
      previously a 501 stub) and new `GET /v1/managers/{manager_cik}/activity?period=`,
      which fetches the current snapshot, computes the prior quarter-end
      (`normalize/flows.prior_quarter_end`), fetches that snapshot (treating "no filing"
      as `prior=None`, i.e. everything "new" -- the manager's first 13F), resolves CUSIPs
      on both via `CusipResolver` (its first real caller), and returns `diff_snapshots`'
      output alongside an always-present `caveats` list (derived-not-reported, long-only,
      ~45-day lag -- CLAUDE.md's non-negotiable 13F caveats). Verified end-to-end against
      the real running API with real Berkshire Hathaway data (2026-07-05): resolved CIKs
      for cleanly-matching issuers (Alphabet, Apple, Amazon, ...), left abbreviated ones
      unresolved (e.g. "BANK AMERICA CORP", "CAPITAL ONE FINL CORP"), and correctly
      derived new/added/reduced/exited activity between 2025-12-31 and 2026-03-31. No
      cache-aside store yet (see the item above) -- both endpoints re-fetch from SEC live.
- [x] 13D/G beneficial-ownership parsing → `BeneficialOwnership` -- `parse_schedule_13dg_xml`
      (pure) + `fetch_beneficial_ownership`. Confirmed the SEC transitioned Schedule
      13D/G to structured XML (real Apple history: legacy "SC 13G/A" HTML/text through
      2024-02-14, modern "SCHEDULE 13G"/"SCHEDULE 13G/A" from 2025-07-29 onward) --
      **only the modern structured filings are parsed**; legacy HTML/text ones are
      silently excluded (CLAUDE.md rules out HTML scraping), not attempted. Discovered
      and fixed a wrong assumption baked into the schema: `BeneficialOwnership.form_type`
      previously guessed `"SC 13D"`/`"SC 13G"`, but real filings use `"SCHEDULE 13D"`/
      `"SCHEDULE 13G"`. 13D and 13G turned out to be two different XML schemas (not
      variants of one) -- confirmed against a real 6-reporting-person Schedule 13D/A
      (joint filers), which is why `parse_schedule_13dg_xml` dispatches to a separate
      parser per form type and returns one row per reporting person. Verified end-to-end
      against live SEC data (not just fixtures) -- including a real, legitimate 0-shares/
      0%-of-class Schedule 13G/A (a corporate realignment, not a bug). No API endpoint
      yet -- standalone building block, same position the 13F functions were in before
      their endpoints existed. See `docs/DATA_MODEL.md` and
      `tests/fixtures/institutional/README.md`.

## Milestone 2.5 — institutional aggregation (cross-manager)

Answering "who holds / is accumulating this stock?" needs the whole-market view, so it's
its own step rather than part of the per-manager work above. This is also where the
**analytical layer** (DuckDB over Parquet; see `ARCHITECTURE.md` 3b and `DATA_MODEL.md`)
enters — the operational store (SQLite/Postgres) is shaped for per-company reads, not
whole-market inversion, so the cross-manager view runs as a separate batch query path
rather than another API-serving query.

- [ ] Bulk-ingest a quarter's 13F filings and invert the index by security (CUSIP/CIK)
- [ ] `institutional-holders` and `institutional-activity` (issuer-centric) endpoints
- [ ] Surface the long-only / 45-day-lag caveats in every institutional response
- [ ] Land cached `RawFact`/`HoldingsSnapshot` data as Parquet on disk (a serialization of
      existing records — no new canonical model; see `DATA_MODEL.md`)
- [ ] Pin a DuckDB version and confirm its multi-process read/write concurrency semantics
      in that version's docs before building on it ("verify, don't assume")
- [ ] Build the 13F cross-manager inversion as a DuckDB-over-Parquet batch query
- [ ] Stand up the analytical query path as infrastructure separate from the serving path —
      DuckDB never sits behind a live API request; batch jobs write results the operational
      store (or a cache) serves from
- [ ] Note: DuckDB can read the SQLite file directly via its `sqlite` extension, so the two
      stores coexist without requiring a sync pipeline
- [ ] Milestone 4's cross-company screening (below) is the second consumer of this same
      analytical layer — design the Parquet landing and query path to serve both

## Milestone 3 — productization

- [ ] API keys + auth + per-key rate limiting / quotas
- [ ] Usage metering (for billing) + subscription tiers
- [ ] Bulk/batch ingestion job to warm the cache (respecting SEC limits)
- [ ] OpenAPI polish, examples, and docs site

## Milestone 4 — queryability beyond single-company lookups

- [ ] Filtered listing endpoints (by concept, period)
- [ ] Cross-company screening — **built on the SEC `frames` API** (one concept across all
      companies for one period) rather than home-grown indexing where possible. Second
      consumer of the analytical layer stood up in Milestone 2.5 (DuckDB over Parquet) —
      reuses that batch query path rather than a new one.

## Deferred (NOT Track 1 — decide later, deliberately)

- [ ] Track 2: MD&A / risk factors / footnotes (free-text narrative)
- [ ] Any LLM summarization of filings (recurring per-token cost — revisit only with a
      clear pricing story)

## Pre-launch checklist

- [ ] Confirm current SEC fair-access + redistribution terms
- [ ] Verify User-Agent is enforced everywhere and throttle can't be bypassed
- [ ] Load test the cache path (not the live-SEC path)

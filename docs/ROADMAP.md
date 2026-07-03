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
- [ ] Ticker→CIK map caching (currently refetched per request)

## Milestone 1 — reliable financials for one statement type

- [ ] Storage layer: cache RawFacts per company (SQLite behind a repository interface)
- [ ] Put the cache in front of API routes (stop hitting SEC per request)
- [ ] Expand mapping coverage for the income statement; measure with `coverage_report()`
- [ ] Real tests against a few saved companyfacts fixtures (Apple, a bank, a retailer)

## Milestone 2 — all three statements + ownership & flows

- [ ] Balance sheet + cash flow mapping coverage
- [ ] Implement `sec/insider.py` (Forms 3/4/5 XML parsing) per its docstring plan
- [ ] Insider-trades endpoint
- [ ] Implement `sec/institutional.py` 13F info-table XML parsing → `HoldingsSnapshot`
- [ ] CUSIP→CIK mapping table (+ track unresolved CUSIPs)
- [ ] Wire `normalize/flows.diff_snapshots` into a per-manager activity endpoint
- [ ] 13D/G beneficial-ownership parsing → `BeneficialOwnership`

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

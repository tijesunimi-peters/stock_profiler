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
      viewer-vs-raw-XML quirk (see `docs/DATA_MODEL.md`). Joint-filer capture (multiple
      `<reportingOwner>` per filing) fixed below.
- [x] Insider-trades endpoint -- `GET /v1/companies/{symbol}/insider-trades?limit=`
      wires `fetch_insider_transactions` straight through, fetched live from SEC on
      every request (no cache-aside store for insider transactions yet -- unlike
      `/statements`, that's a deliberate gap, not an oversight). Verified end-to-end
      against the real running API (Docker) with real AAPL data, ticker + CIK symbol
      forms, unknown-ticker 404, and `limit` validation.
- [x] Cache-aside store for insider transactions -- `InsiderTransactionRepository`
      (`storage/insider_repository.py`) + `SQLiteInsiderTransactionRepository`
      (`storage/sqlite_insider_repository.py`), wired into `get_insider_trades` via
      `_insider_transactions_for_cik`. **Keyed at filing granularity, not per
      transaction row** -- resolved the idempotency-key question by observing a Form
      3/4/5 is immutable once accepted (an amendment gets its own accession, never
      rewrites a prior one), unlike XBRL facts which restate in place; this also
      sidesteps a real schema gap where two distinct rows in one filing can be
      field-for-field identical under `InsiderTransaction`'s current fields (see
      `DATA_MODEL.md`, `aapl_form3_newstead.xml`). **Cache-hit decision:** a hit
      requires `cached_filing_count(cik) >= limit` (a smaller cached limit is not a
      superset of a larger one); a miss re-fetches the *full* requested `limit` from SEC
      (not just the delta) and re-upserts, which is safe (already-cached filings are
      skipped) but wastes the overlap -- a deliberate v1 simplicity trade-off, not
      incremental top-up. Verified end-to-end against real AAPL data (2026-07-05): cold
      `limit=5` populated the cache (~1s); repeat `limit=5` hit in <0.05s; `limit=10`
      correctly missed, grew the cache to 10 filings, then hit on repeat.
- [x] Cache-aside store for 13F holdings snapshots -- `HoldingsSnapshotRepository`
      (`storage/holdings_repository.py`) + `SQLiteHoldingsSnapshotRepository`
      (`storage/sqlite_holdings_repository.py`), wired into both
      `/managers/{manager_cik}/holdings` and `/managers/{manager_cik}/activity` via
      `_manager_snapshot`. Keyed on `(manager_cik, report_period)` -- NOT per accession
      like the insider store, because a 13F CAN be superseded (an original 13F-HR plus a
      later 13F-HR/A for the same quarter; the newer-filed one wins), so a re-store
      replaces that quarter's holdings wholesale rather than merging rows.
      **Deliberately not cached:** resolved CUSIP→CIK -- every cached row comes back
      `cik=None`, so `resolve_snapshot_cusips` always re-runs on read (hit or miss),
      letting a CUSIP unresolved at cache time resolve later as the mapping improves,
      instead of freezing that outcome. **Known, accepted trade-off:** once a quarter is
      cached, the read path never re-checks SEC for a later amendment -- same as
      `_facts_for_cik`'s existing behavior for statements; picking up new data is
      `ingest/`'s job, not the read path's, and there's no 13F bulk-ingest job yet.
      Verified end-to-end against real Berkshire Hathaway 13F data (2026-07-05): a cold
      fetch for one quarter populated the cache (~0.8s, 90 holdings); a repeat request
      for the same quarter hit instantly with identical data; a different,
      never-fetched quarter still correctly missed.
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
- [x] **Fix joint-filer capture in INSIDER (Forms 3/4/5) parsing** -- `parse_ownership_xml`
      now iterates every `<reportingOwner>` and emits one `InsiderTransaction` per
      (reporting owner x transaction/holding row), the same "duplicate the shared row per
      filer" shape `parse_schedule_13dg_xml` already used for 13D/G joint filers, instead of
      collapsing a joint filing to its first owner. Verified against a real joint Form 4
      (Berkshire Hathaway Inc. / Warren E. Buffett, DaVita Inc., accession
      `0001193125-26-207021`) -- one shared `nonDerivativeTransaction` row correctly yields 2
      records, not 1 -- plus a second real example (JPMorgan Chase & Co. / DNT Asset Trust)
      confirming the pattern isn't Berkshire-specific. See
      `tests/fixtures/insider/brka_form4_davita_joint.xml` and `DATA_MODEL.md` insider section.
- [x] **13F joint filers are now attributed** (distinct from the insider fix above — was
      tracked separately deliberately). `sec/institutional.py`'s `parse_cover_page_xml`
      parses the cover page's numbered `otherManagers2Info` roster into
      `HoldingsSnapshot.other_managers` (`OtherManager13F`); each infoTable row's own
      `<otherManager>` tag (a comma-separated list of `sequenceNumber`s) becomes
      `InstitutionalHolding.other_managers`, attributing that specific position to 1+
      co-filing managers instead of just the filing manager. `fetch_13f_snapshot` now
      fetches both top-level XML documents per snapshot (info table + cover page).
      Persisted in the holdings cache (`storage/sqlite_holdings_repository.py`, two new
      columns/tables) as-reported -- no resolution step needed, unlike CUSIP→CIK.
      Discovered a related, deliberately-unmodeled quirk along the way: some older
      filings (confirmed 2016 Berkshire) also carry a separate, unnumbered
      `<otherManagersInfo>` block that nothing can reference positionally -- only the
      numbered roster is parsed. Verified end-to-end against the real running API with
      real Berkshire Hathaway data (2026-07-06): a cold fetch for the 2026 Q1 13F
      returned the real 14-co-filer roster (GEICO Corp, National Indemnity Co, Buffett
      Warren E, ...) with correct per-holding attribution across all 90 holdings; a
      repeat request hit the cache with identical roster and attribution.
- [x] **Surface both data-coverage floors in the "Limitations to surface" list** (docs). The
      13D/G structured-XML floor is already *described* in `DATA_MODEL.md` ("13D / 13G" section) —
      the real gap was that neither it nor the ~2009 XBRL financials floor appeared in a
      user-facing coverage-limits list, so an empty result ("no 13D/G before ~mid-2025") could
      read as "nobody filed." Added a **"Coverage boundaries (surface these)"** section to
      `DATA_MODEL.md` covering both floors (13D/G structured-XML cutover; XBRL financials phased
      in 2009→~2012, capped at each company's first XBRL filing). *(Corrects an earlier version of
      this item that wrongly implied the 13D/G floor was undocumented and cited a 2009-floor doc
      precedent that didn't exist — it does now.)*

## Milestone 2.5 — institutional aggregation (cross-manager)

Answering "who holds / is accumulating this stock?" needs the whole-market view, so it's
its own step rather than part of the per-manager work above. This is also where the
**analytical layer** (DuckDB over Parquet; see `ARCHITECTURE.md` 3b and `DATA_MODEL.md`)
enters — the operational store (SQLite/Postgres) is shaped for per-company reads, not
whole-market inversion, so the cross-manager view runs as a separate batch query path
rather than another API-serving query.

- [ ] Bulk-ingest a quarter's 13F filings and invert the index by security (CUSIP/CIK)
- [ ] **Track CUSIP resolution rate as a first-class metric.** Exact-normalized-match-only
      resolution (correctly declining "BANK AMERICA CORP", "CAPITAL ONE FINL CORP", etc.) means
      the cross-manager "who holds X" view has holes proportional to the unresolved-CUSIP rate.
      Surface that rate (built on `unresolved_cusips()`) as a headline number — it directly
      bounds how complete the institutional-holders answer can be, and it's the signal for when
      fuzzy matching or a real CUSIP source becomes worth the effort.
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
- [ ] Load test the cache path (financials `/statements`, and now `/insider-trades` and
      `/managers/*` too — all three are cache-aside as of this pass) — the fast path under
      subscriber load.
- [ ] Load / failure test the **cold path** (a genuine cache miss) on all three cache-aside
      endpoints separately — a miss still hits SEC live and is the real rate-limit exposure, not
      the warm-cache path. Verify behavior as concurrent *cold* traffic approaches the 8 req/s
      ceiling, and what a mid-request SEC 403/throttle does to a response. Worth noting: the
      insider/13F caches only ever grow via live requests today (no bulk-ingest job seeds them
      the way `ingest/backfill.py` does for statements), so "mostly cold" traffic patterns are
      more likely for those two than for `/statements` at launch.

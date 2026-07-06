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
- [ ] **Expose 13D/G beneficial ownership via an endpoint** — the one remaining ownership
      *serving* gap in M2. Parsing (`fetch_beneficial_ownership`) is done and verified above but
      has no route. Add an issuer-centric `GET /v1/companies/{symbol}/beneficial-ownership`,
      cache-aside like the others, carrying the coverage-floor note (structured-XML only,
      ~mid-2025 floor) so a pre-transition company reads as "outside coverage window," not
      "nobody filed." (Issuer-centric *aggregation* across 13F is separate — that's M2.5.)
- [ ] *(Known limitation, optional)* `InsiderTransaction` can't distinguish two field-for-field
      identical real rows within one filing; filing-granularity dedup sidesteps it for caching,
      but the model can't represent them distinctly. Only worth a schema change if the collision
      proves material in practice.

**M2 status: effectively complete.** All ingestion, parsing, caching, both joint-filer fixes,
and the manager-centric endpoints are done. Open: the 13D/G serving endpoint above (small) and
the optional schema note. The issuer-centric aggregation endpoints are M2.5, below.

## Milestone 2.5 — institutional aggregation (cross-manager)

Answering "who holds / is accumulating this stock?" needs the whole-market view, so it's
its own step rather than part of the per-manager work above.

**Re-scoped against what's now shipped:** the per-manager 13F cache (`HoldingsSnapshotRepository`)
and a working `CusipResolver` are real building blocks — but they are *manager-scoped and
on-demand*. Inversion needs *every* manager's 13F for a quarter, which is a different ingestion
pattern (a bulk 13F backfill) that does not exist yet and is the actual heart of 2.5.

**The analytical mechanism is now an open decision, not a given.** So much structure now lives in
SQLite (five repositories, WAL, online-backup) that DuckDB reading the SQLite file directly (the
`ARCHITECTURE.md` 3b "coexist" path) may be sufficient for a single-quarter inversion. Treat the
Parquet landing as *evaluate, likely defer to M4* (whole-market screening scale is what justifies
it), rather than a prerequisite for 2.5.

- [x] **Bulk-ingest a quarter's 13F filings** (the missing heart of 2.5) --
      `ingest/institutional_backfill.py`, `python -m secfin.ingest.institutional_backfill
      --period YYYY-MM-DD`. Candidate managers are discovered **locally, offline** from
      `submissions.zip` (already downloaded by `ingest/backfill.py` for exactly this,
      reusing `sec/institutional.py`'s `recent_13f_filings` pure filter) — no new download
      step, and no live `submissions.json` round-trip per manager. Fetching reuses a new
      `fetch_13f_snapshot_for_filing` (split out of `fetch_13f_snapshot`, which is now a
      thin live-lookup wrapper over it) and writes through the same
      `HoldingsSnapshotRepository.upsert_snapshot` the on-demand manager endpoints use —
      this **is** the seed job for the manager caches (today they also still grow via live
      requests; see pre-launch cold-path note, now narrowed by this job existing). Single
      async process, sequential, same "don't add processes to go faster — the fair-access
      limit is per-IP" reasoning as `ingest/incremental.py`. The cross-manager inversion by
      security (CUSIP/CIK) is separate, still open below. Verified end-to-end against real
      SEC data (2026-07-06): fetched Berkshire Hathaway's real `submissions.json`, ran it
      through `find_13f_candidates` (correctly resolved to its real 2026 Q1 13F-HR,
      accession `0001193125-26-226661`), then `fetch_13f_snapshot_for_filing` against the
      real filing (90 holdings, 14 co-filing managers) and `upsert_snapshot` — then
      confirmed `GET /v1/managers/1067983/holdings?period=2026-03-31` served that exact
      data straight from the cache the job populated.
- [x] **Amendment freshness across the aggregate** — resolved as a side effect of the bulk
      job's skip-or-refresh design rather than a separate mechanism: a new
      `HoldingsSnapshotRepository.cached_accession(manager_cik, report_period)` (a cheap
      indexed lookup, no full snapshot deserialization) is compared against the winning
      filing's accession from the local `submissions.zip` scan. A match skips (already
      current — this is also what makes a crashed/resumed run cheap); a mismatch — including
      a newer `13F-HR/A` that appeared since the last run — always re-fetches and upserts.
      Requires periodic re-runs of a given quarter to actually catch late amendments (an
      operational/scheduling concern, not a code gap). Verified against real data
      (2026-07-06): re-running the job against the same already-cached manager+quarter
      correctly skipped (matching accession), with no second live document fetch.
- [x] **Track CUSIP resolution rate as a first-class metric** —
      `GET /v1/cusip-resolution-stats` (`api/routes.py`), backed by a new
      `normalize/cusip.cusip_resolution_stats(repo) -> CusipResolutionStats` (pure) over a
      new `CusipMapRepository.resolution_counts() -> (resolved, unresolved)` — a single
      `COUNT(cik), COUNT(*)` query, deliberately not `len(unresolved_cusips())` plus a
      second query, so this stays cheap as the map grows. `resolution_rate` is `None`
      (not `0.0`) when nothing has been attempted yet — a fresh DB isn't "0% covered." Note
      it *drifts upward, never down*: the global `cusip_map` table (unlike the per-snapshot
      `InstitutionalHolding.cik`, which is genuinely never persisted — see
      `storage/holdings_repository.py`) IS persisted across runs, and a CUSIP recorded
      unresolved on one attempt can resolve on a later one as the SEC's own
      `company_tickers.json` grows — `record_unresolved` never clobbers an existing
      resolution (already enforced, see `test_record_unresolved_never_clobbers_an_existing_resolution`),
      so the rate is monotonically non-decreasing. Exact-normalized-match-only resolution
      (correctly declining "BANK AMERICA CORP", "CAPITAL ONE FINL CORP", etc.) means the
      "who holds X" view has holes proportional to `unresolved` here — this metric is what
      lets that be surfaced as "coverage improving," not hidden.
- [x] `institutional-holders` and `institutional-activity` (issuer-centric) endpoints — the
      user-facing payoff. **Turned out not to need a precomputed cross-manager inversion at
      all:** a single issuer's holder list is a point lookup ("every `holdings` row for this
      CUSIP this quarter"), not the whole-quarter aggregate scan DuckDB was benchmarked for
      (confirmed with the user before building — see the DuckDB item below). Served live from
      the operational store via a new `HoldingsSnapshotRepository.holders_of(cusips,
      report_period)` (a join against `holdings_snapshots` for `manager_name`, backed by a
      new `(cusip, report_period)` index) and a new reverse lookup,
      `CusipMapRepository.cusips_for_cik(cik)`, to get from an issuer's CIK to its CUSIP(s)
      in the first place. New `normalize/flows.diff_holders` is `diff_snapshots`' transpose
      (one issuer's CUSIP(s), many managers, instead of one manager, many securities) —
      classifies each `(manager_cik, cusip)` pair independently, deliberately not summing a
      multi-class issuer's several CUSIPs (e.g. Alphabet's Class A/C) into one manager-level
      number, which would conflate distinct instruments. **Real gap discovered and fixed
      along the way:** `ingest/institutional_backfill.py` was upserting snapshots without
      ever resolving CUSIPs, so `cusip_map` had no reverse-lookup entries for anything only
      ever seen via the bulk path — it now calls `resolve_snapshot_cusips` per snapshot
      before upserting. Both endpoints carry a new caveat (`_ISSUER_CENTRIC_CAVEATS`)
      alongside the existing 13F ones: an empty holder list is ambiguous between "no manager
      reported holding this issuer" and "this quarter hasn't been ingested for any manager
      yet," since this is a live query over whatever's been ingested so far, not a
      precomputed, coverage-guaranteed index.
- [x] ~~Surface long-only / 45-day-lag caveats in every institutional response~~ — **already done
      for the manager endpoints** (`/activity` returns an always-present `caveats` list). Remaining
      2.5 work is only to carry that same `caveats` list into the two issuer-centric endpoints when
      they land (reuse, not new work).
- [x] **Evaluate the analytical mechanism before building it** — benchmarked
      DuckDB-over-SQLite (the coexist path, `ATTACH ... (TYPE sqlite)`) against plain
      SQLite for the single-quarter inversion, on a synthetic-but-realistic quarter
      (5,500 managers, 561K holding rows, Zipf-weighted CUSIP distribution). DuckDB won
      by ~2.8x (103ms vs. 285ms median) with **zero ETL** — no Parquet landing needed for
      this workload, so Parquet is deferred to M4 per this item's own fallback rule.
      Concurrency verified live in both directions, not assumed from docs: a DuckDB read
      succeeds (and correctly excludes uncommitted rows) while a writer holds an open WAL
      transaction, and a writer commits normally while DuckDB holds a long scan open —
      neither blocks the other. Pinned `duckdb==1.4.5` (the LTS line) as a new
      `analytical` extra, never a dependency of the base install or the live API. Full
      writeup + numbers in `docs/ARCHITECTURE.md` §3b. Building the actual inversion query
      and endpoints on top of this is the next step, not part of this evaluation.
- [ ] Stand up the analytical query path as infrastructure separate from the serving path —
      DuckDB never sits behind a live API request; batch jobs write results the operational store
      (or a cache) serves from. (M4 cross-company screening is the second consumer — design the
      query path to serve both.) **Still genuinely open:** the DuckDB evaluation above was a
      benchmark only — no production batch job writes DuckDB-computed results anywhere yet. The
      issuer-centric endpoints landed without needing this (see above), so this item is now purely
      about future whole-market aggregates (a holders leaderboard, M4 screening), not a blocker for
      anything shipped so far.

**M2.5 status: effectively complete for single-issuer / single-manager use cases.** Bulk
ingest, amendment freshness, the CUSIP resolution-rate metric, the DuckDB-vs-SQLite
evaluation, and both issuer-centric endpoints are all done. What's left is explicitly
whole-market-scale work that nothing shipped so far depends on: the CUSIP resolution-rate
metric's underlying map still improves gradually rather than being backfilled in bulk, and
the analytical query path (DuckDB batch jobs actually writing somewhere) stays deferred
until a feature needs a genuine whole-market aggregate rather than one issuer or manager at
a time.

## Milestone 3 — productization

- [ ] API keys + auth + per-key rate limiting / quotas
- [ ] Usage metering (for billing) + subscription tiers
- [x] Statements cache-warming — `ingest/backfill.py` (bulk `companyfacts.zip`) + daily
      `ingest/incremental.py` seed and refresh the `RawFact`/statements cache, respecting SEC
      limits.
- [ ] **Ownership cache-warming** (the remaining half of "warm the cache"). Unlike statements,
      the insider and 13F caches only grow via live requests — no batch job seeds them. Add
      seed jobs (the 13F one overlaps the M2.5 bulk 13F ingest; build once, use for both).
- [x] Deployment via Docker — `Dockerfile` + `docker-compose.yml` (single `api` service; ingest
      jobs as `docker compose run` overrides), documented in `docs/DEVELOPMENT.md`.
- [x] Backup / restore tooling — `storage/backup.py` (sqlite3 online-backup API, safe on a live
      WAL DB) + `storage/restore.py`, with a separate host-mounted backups dir; documented in
      `DEVELOPMENT.md` §7.
- [ ] OpenAPI polish, examples, and a public **docs site** (distinct from `DEVELOPMENT.md`, which
      is internal dev/ops docs). FastAPI `/docs` (Swagger) is auto-generated but is not a portal.

### Dev/ops hygiene (from `DEVELOPMENT.md` "Open questions / mismatches")

- [ ] Decide the test-in-Docker story: the shipped image installs prod-only deps and omits
      `tests/`, so `docker compose run api pytest` fails. Either document the bind-mount base-image
      pattern as the intended path, or add a dev image — but stop leaving it ambiguous.
- [ ] Add the backfill tuning vars to `.env.example` (`SECFIN_BULK_DATA_DIR`,
      `SECFIN_BACKFILL_WORKERS`, `SECFIN_BACKFILL_BATCH_SIZE`, `SECFIN_BACKFILL_QUEUE_MAXSIZE`) —
      they're read by `config.py` but undocumented and not surfaced in compose.
- [ ] Document (or smooth) the `SEC_USER_AGENT`-required-for-every-`docker compose`-subcommand
      gotcha — interpolation fails even `build`/`config`/`down` without it.

## Milestone 4 — queryability beyond single-company lookups

- [ ] Filtered listing endpoints (by concept, period)
- [ ] Cross-company screening — **built on the SEC `frames` API** (one concept across all
      companies for one period) rather than home-grown indexing where possible. Second consumer of
      the analytical layer. **This — whole-market scale — is where the Parquet landing most likely
      earns its place** (2.5's single-quarter inversion may not need it; see 2.5's "evaluate"
      item). Reuse the same batch query path; don't stand up a second one.

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
      more likely for those two than for `/statements` at launch. *(The fix is the M3 "ownership
      cache-warming" / M2.5 bulk-13F-ingest item — if that lands pre-launch, cold-path exposure
      drops for ownership too.)*
- [ ] Verify the backup/restore round-trip (`storage/backup.py` → `storage/restore.py`) into a
      fresh volume before launch — the tooling exists (`DEVELOPMENT.md` §7); confirm a restored
      DB opens clean (stale `-wal`/`-shm` handling) and serves.

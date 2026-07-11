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
- [x] **Expose 13D/G beneficial ownership via an endpoint** — closes the last ownership
      *serving* gap in M2. `GET /v1/companies/{symbol}/beneficial-ownership?limit=` (`api/routes.py`)
      wraps rows in `{cik, caveats, beneficial_ownership}` -- `caveats` always present, carrying
      the structured-XML/~mid-2025 coverage-floor note so a pre-transition company reads as
      "outside coverage window," not "nobody filed" (same convention as the 13F caveats).
      Cache-aside at **filing granularity**, mirroring `insider_repository.py` exactly (a 13D/G
      filing is immutable once accepted -- an amendment gets its own accession, never rewrites a
      prior one): new `BeneficialOwnershipRepository` / `SQLiteBeneficialOwnershipRepository`
      (`storage/beneficial_ownership_repository.py`), fed by a new
      `fetch_beneficial_ownership_with_filings` (`sec/institutional.py`, split out of
      `fetch_beneficial_ownership` the same way `fetch_insider_transactions_with_filings` was
      split out earlier) and a new `BeneficialOwnershipFilingMeta` (`normalize/schema.py`). A
      cache hit requires `cached_filing_count(cik) >= limit`, same as insider trades. Verified
      end-to-end against the real running API with real Apple data (2026-07-06): cold
      `limit=5` returned 3 real structured Schedule 13G/13G-A rows (Vanguard) in ~1.2s (only 3
      modern filings exist for AAPL within the fetch window, so `cached_filing_count` stayed
      below 5); a subsequent `limit=2` request correctly hit the cache (3 cached >= 2) in
      ~0.02s; the repeated `limit=5` request correctly missed again (3 cached < 5), re-fetching
      live rather than silently returning a stale, incomplete answer. (Issuer-centric
      *aggregation* across 13F is separate — that's M2.5.)
- [ ] *(Known limitation, optional)* `InsiderTransaction` can't distinguish two field-for-field
      identical real rows within one filing; filing-granularity dedup sidesteps it for caching,
      but the model can't represent them distinctly. Only worth a schema change if the collision
      proves material in practice.

**M2 status: complete.** All ingestion, parsing, caching, both joint-filer fixes, the
manager-centric endpoints, and the 13D/G serving endpoint are done. Only the optional
(not-yet-material) `InsiderTransaction` schema note above remains open. The issuer-centric
aggregation endpoints are M2.5, below.

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

- [x] **API keys + auth + per-key rate limiting / quotas** — self-serve `POST
      /v1/signup` (`api/auth_routes.py`) issues a free-tier key (`auth/tiers.py`); every
      `/v1` endpoint except the two the public Data Explorer calls
      (`.../statements/{statement}`, `.../periods`, now split onto `api/routes.py`'s
      `public_router`) requires it via an `X-API-Key` header, enforced by
      `api/auth.py`'s `require_api_key` applied at `include_router` granularity in
      `api/main.py` (not per-route, so a new endpoint defaults to gated). **Real
      conflict discovered and resolved before writing code:** the already-shipped
      Data Explorer (`8fc75fd`) calls `/v1` directly from browser JS with no key, by
      design (its own handoff doc: "public, unauthenticated ... deliberately scoped to
      not need any"). A blanket key requirement would have broken it -- confirmed the
      fix with the user first: split the router so those two endpoints stay keyless,
      but gained a per-IP burst limiter (`limit_anonymous_traffic`,
      `SECFIN_ANON_RATE_LIMIT_PER_SEC`) instead of a per-key one, so the public demo
      surface isn't wide open to scraping. Keys are stored hashed (SHA-256 -- high
      -entropy random tokens don't need a slow hash; `auth/keys.py`) in a new
      `ApiKeyRepository` / `SQLiteApiKeyRepository`
      (`storage/api_key_repository.py`); rate limiting is an in-memory per-key token
      bucket (`auth/rate_limiter.py`, resets on restart -- fine, matches the
      single-process deployment CLAUDE.md describes) while the daily quota is a SQLite
      counter (`api_key_usage` table) since it must survive a restart to mean anything.
      Verified end-to-end against the real running API (Docker, 2026-07-06): signup
      issued a real key; a duplicate signup 409'd; the key worked against a gated
      endpoint (real AAPL insider-trade data); 6 rapid requests against the free
      tier's 5 req/s limit correctly returned `200 200 200 200 200 429`; the public
      `/periods` endpoint kept serving real data with no key at all. **Key revocation
      added 2026-07-11** (launch-readiness §6): admin-secret-gated `POST
      /v1/admin/keys/{email}/revoke` (`api/admin_routes.py`), same shape as the
      tier-change endpoint below, backed by new `ApiKeyRepository.revoke_key`. Sets
      `active = False` rather than deleting the row, so `require_api_key`'s existing
      `not record.active` check (already there, previously untriggerable in
      production since nothing could ever set it) 401s with "Invalid or revoked API
      key." on the very next request -- no cache to expire, `get_by_hash` reads fresh
      from SQLite every call.
- [x] **Subscription tiers (manual upgrade path)** -- `auth/tiers.py` now defines
      "basic" (20 req/s, 25K/day) and "pro" (100 req/s, 250K/day) alongside "free". No
      payment integration yet, so there's no self-service upgrade: `POST
      /v1/signup` still always issues "free". Moving an existing key onto a paid tier is
      a new admin-secret-gated `POST /v1/admin/keys/{email}/tier`
      (`api/admin_routes.py`), backed by new `ApiKeyRepository.get_by_email` /
      `update_tier` methods. Gated by a shared secret (`X-Admin-Secret` header vs.
      `config.secfin_admin_secret`, compared with `secrets.compare_digest`), deliberately
      not `require_api_key` -- an admin isn't a customer. **503s, not silently open, when
      the secret is unset** -- caught a real gap during verification: `docker-compose.yml`
      only forwards an explicit allowlist of env vars into the container (`SEC_USER_AGENT`,
      `SECFIN_DB_PATH`, `SECFIN_BACKUP_DIR`, `SEC_MAX_RPS`), so `.env` alone wasn't enough;
      added `SECFIN_ADMIN_SECRET: "${SECFIN_ADMIN_SECRET:-}"` there too. Verified
      end-to-end against the real running API (Docker, 2026-07-06): missing/wrong secret
      both 401; correct secret + unknown tier name 400s; correct secret + unregistered
      email 404s; correct secret + valid tier moves a real signed-up key from
      free (5/1000) to pro (100/250000) limits, persisted (not just returned in-memory).
- [x] **Usage metering (billing half)** -- `GET /v1/usage` (`api/routes.py`, gated like
      every other `/v1` endpoint) surfaces the calling key's own daily request counts
      from the existing `api_key_usage` table, which previously fed only the quota check
      and was never exposed. New `ApiKeyRepository.usage_by_day(api_key_id, since_day)`
      returns the stored rows (sparse -- no row for a zero-request day); a new pure
      `auth/usage.py`'s `usage_summary` fills the requested trailing window (`?days=`,
      default 7, max 90) with explicit zero-count days so the response reads as a
      complete billing series, not a sparse one -- same "pure function over a repository"
      shape as `normalize/cusip.py`'s `cusip_resolution_stats`. Verified end-to-end
      against the real running API (Docker, 2026-07-06): no key 401s; a brand-new key's
      default 7-day window is all zeros except today (the `/usage` call itself counts,
      being on the same gated router); after 2 more real requests against a gated
      endpoint, `?days=1` correctly shows a request_count of 4 (1 prior `/usage` call + 2
      insider-trades calls + this call); `days=90` succeeds, `days=91` 422s (FastAPI's
      `Query(..., le=90)` bound).
- [x] Statements cache-warming — `ingest/backfill.py` (bulk `companyfacts.zip`) + daily
      `ingest/incremental.py` seed and refresh the `RawFact`/statements cache, respecting SEC
      limits.
- [x] **Ownership cache-warming** (the remaining half of "warm the cache"). Unlike statements,
      the insider and 13F caches only grew via live requests — no batch job seeded them. The
      13F half reuses the M2.5 bulk 13F ingest (`ingest/institutional_backfill.py`) as-is. The
      insider half is new: `ingest/insider_backfill.py`
      (`python -m secfin.ingest.insider_backfill [--limit 10]`), seeding
      `storage/insider_repository.py`'s cache for every company already ingested for
      financials. **Real gap discovered along the way:** a naive "walk the SEC daily index (or
      any filer's own `submissions.json`) for Forms 3/4/5 and fetch every CIK it mentions"
      approach is unsafe — verified against real EDGAR data (2026-07-06) that a Form 4's CIK
      can belong to a REPORTING OWNER (e.g. CIK 1972758, "325 Capital GP, LLC", a fund GP
      entity), not the issuer being reported on; that CIK's own `submissions.json` lists Form
      4s filed *about* some other company entirely. `sec/insider.py`'s
      `fetch_insider_transactions_with_filings` trusts its `cik` argument as the issuer
      identity, so blindly fetching a reporting-owner CIK this way would cache real rows under
      the WRONG `issuer_cik`. Candidates are therefore restricted to the union of
      `RawFactRepository.get_ingested_ciks` across both financials sources (`bulk_companyfacts`,
      `daily_incremental`) — CIKs already known to be real operating companies, which also
      naturally scopes the job to companies this API actually serves. Skip-or-refresh via
      `cached_filing_count(cik) >= limit` (same check the live route uses) makes reruns cheap.
      **Known, deliberate limitation:** once a company reaches `limit` cached filings, a rerun
      always skips it, so this closes the "cache starts empty" gap but doesn't keep an
      already-warmed company fresh as new Forms 3/4/5 are filed afterward — a daily-index-driven
      incremental job (the `ingest/incremental.py` pattern, generalized to insider forms) is
      left as later work. Verified end-to-end against real AAPL data (2026-07-06): seeding one
      checkpoint (CIK 320193) and running `--limit 3` fetched 3 real Form 4 filings (10 rows,
      Jennifer Newstead transactions) via live SEC calls; an immediate rerun at the same limit
      skipped with zero HTTP requests.
- [x] Deployment via Docker — `Dockerfile` + `docker-compose.yml` (single `api` service; ingest
      jobs as `docker compose run` overrides), documented in `docs/DEVELOPMENT.md`.
- [x] Backup / restore tooling — `storage/backup.py` (sqlite3 online-backup API, safe on a live
      WAL DB) + `storage/restore.py`, with a separate host-mounted backups dir; documented in
      `DEVELOPMENT.md` §7.
- [x] **OpenAPI polish + a public docs site**. Two pieces, scoped with the user first:
      (1) **OpenAPI polish**, entirely inside FastAPI's auto-generated `/docs`: app-level
      `title`/`description`/`openapi_tags` (`api/main.py`), a `tags=` + `summary=` on
      every `/v1` endpoint grouping them into Financials / Insider Trades / Institutional
      Ownership / Account, and hand-written JSON `responses={...}` examples on the
      endpoints that return a bare `dict` (`periods`, `beneficial-ownership`,
      `institutional-holders`, `institutional-activity`, `managers/.../activity`) --
      those had no schema at all in Swagger before, unlike the `response_model=`
      endpoints. The admin tier-change endpoint (`api/admin_routes.py`) got
      `include_in_schema=False` -- it's not a customer-facing operation and doesn't
      belong in the public spec. (2) **A new static docs page**, `GET /guide`
      (`api/static/guide.html` + `guide.css`, served by `api/main.py` the same way
      `/explorer` is) -- what "Docs" in the landing-page nav actually points to now,
      distinct from "API Reference" (`/docs`, Swagger). Covers quickstart (signup →
      authenticated request), auth/rate-limit tiers, error codes, a grouped endpoint
      reference table, and the 13F/derived-data caveats (long-only, ~45-day lag,
      ambiguous-empty-result, and both coverage floors -- XBRL ~2009, 13D/G structured-XML
      ~mid-2025). Reuses the existing brand design system (`style.css`'s nav/footer/
      code-panel), not a new visual language. `index.html`/`explorer.html`'s nav and
      footer links updated to point "Docs" at `/guide` (previously both "Docs" and "API
      Reference" pointed at the same `/docs` Swagger UI). Verified: full test suite green
      (192 tests), `app.openapi()` schema inspected directly (title, tags, every `/v1`
      endpoint has a summary, admin endpoint absent from `paths`), and the built Docker
      image serves `/guide` and `/docs` with 200s and correct tags/summaries in the live
      `/openapi.json`.

### Dev/ops hygiene (from `DEVELOPMENT.md` "Open questions / mismatches") -- all resolved

- [x] Decide the test-in-Docker story — **done**: opt-in `test` and `e2e` compose profiles
      bind-mount the repo into the base/Puppeteer images (prod image stays slim). `docker compose
      --profile test run --rm test` runs pytest; `docker compose --profile e2e up
      --exit-code-from e2e` runs a headless-Chromium render check of the data pages
      (`scripts/headless_check.js` + `scripts/seed_fixture.py`). See `docs/DEVELOPMENT.md`.
- [x] **Added the backfill tuning vars to `.env.example`** (`SECFIN_BULK_DATA_DIR`,
      `SECFIN_BACKFILL_WORKERS`, `SECFIN_BACKFILL_BATCH_SIZE`,
      `SECFIN_BACKFILL_QUEUE_MAXSIZE`), and went further than the item literally asked --
      wired the three tuning *integers* (not the path) into `docker-compose.yml`'s `api`
      service `environment:` block too (`${VAR:-default}`, matching each one's real
      `config.py` default), so setting them in `.env` actually reaches a
      Docker-run backfill instead of silently doing nothing (the same class of gap
      caught with `SECFIN_ADMIN_SECRET` in an earlier pass -- compose only forwards an
      explicit allowlist of vars into the container, `.env` alone isn't enough).
      `SECFIN_BULK_DATA_DIR` itself is deliberately NOT forwarded the same way -- it's a
      path under the same `secfin-data` volume as `SECFIN_DB_PATH`, so like that one it
      stays a fixed in-container path rather than something to tune per run. Verified:
      `docker compose config` resolves all three with correct defaults; a full
      `docker compose build api && docker compose up -d api` smoke-tested clean
      (`/health` → `200`).
- [x] **Documented (chose not to smooth) the `SEC_USER_AGENT` gotcha** -- weakening the
      hard `${SEC_USER_AGENT:?...}` requirement (e.g. a soft fallback) would undercut
      CLAUDE.md's non-negotiable SEC User-Agent rule by letting `docker compose up`
      silently start the API in a blocked state, so this stays a hard failure by design.
      `DEVELOPMENT.md` §1 now says so explicitly and spells out that compose interpolates
      the *whole file* up front (so `build`/`config`/`down`/`ps` fail too, not just
      `up`/`run`).

## Milestone 4 — queryability beyond single-company lookups

- [x] **Cross-company screening — built on the SEC `frames` API.** `GET /v1/screen`
      (`api/routes.py`) filters companies by canonical-concept thresholds
      (`{concept}_min`/`{concept}_max` over `normalize/screening.py`'s
      `SCREENABLE_CONCEPTS`: revenue, net_income, total_assets, total_liabilities,
      stockholders_equity, cash_and_equivalents) for one fiscal period, AND semantics
      only. Deliberately a bounded MVP, not the open-ended "screening query language"
      CLAUDE.md flags as a separate, later decision.

      **Frames data reuses the existing `RawFact`/`RawFactRepository` — no new
      canonical model, no new table.** A frames data point is shape-identical to an
      existing `RawFact` row; `ingest/frames_backfill.py` (new, single async process --
      one frames HTTP call already returns every reporting company at once, so the
      whole job is a handful of calls, not thousands of round-trips) writes
      frames-sourced points straight into `raw_facts`, tagged with the exact SEC frame
      string (`RawFact.frame`). A new `RawFactRepository.screen()` + `idx_raw_facts_frame
      (gaap_tag, frame)` index filters on that exact string. **Real gap discovered and
      fixed before writing any ingestion code:** verified live (2026-07-06) that frame
      `data[]` rows carry no `fy`/`fp`/`filed`/`form` fields at all (unlike what the
      companyconcept API returns), and that frames are CALENDAR-quarter aligned, not
      fiscal-period aligned — a company with a non-calendar fiscal year would mismatch
      against our own `fiscal_year`/`fiscal_period` key. Keying `screen()` on the exact
      frame string instead of `(fiscal_year, fiscal_period)` sidesteps that mismatch
      entirely. Also verified live: a bare annual instant period (`CY2023I`) 404s --
      instant (balance-sheet) concepts always need an explicit quarter suffix, so `FY`
      maps to that calendar year's Q4-end (`instant_frame_period`).

      **Analytical engine: benchmarked, not assumed — and the answer flipped vs. this
      doc's own prediction.** This item's note above (now removed) predicted frames
      screening as "where the Parquet landing most likely earns its place." A committed,
      reusable benchmark (`scripts/benchmark_screening.py` — unlike the M2.5 13F-inversion
      benchmark, which was never committed) found the opposite: at realistic frames scale
      (~8,000 companies × 6 concepts, ~41K synthetic rows) a representative 3-concept AND
      screen ran ~3.3x FASTER on plain indexed SQLite (11.27ms median) than DuckDB-over-SQLite
      (37.46ms median) — frames scale is two orders of magnitude below the 561K-row 13F
      inversion that justified DuckDB there. `screen()` stays plain SQLite; no new `duckdb`
      runtime dependency on the screening path. See `docs/ARCHITECTURE.md` §3b for the full
      write-up.

      A new `TickerCache.resolve_name` (`sec/ticker_cache.py`) reuses the already-fetched
      `company_tickers.json` payload's `title` field to attach a company name to each
      result's bare CIK, at zero extra network cost. `_SCREENING_CAVEATS`
      (`api/routes.py`) is always present: the calendar-vs-fiscal alignment caveat above,
      a new coverage gap specific to frames (a company using a custom extension tag for
      a concept is invisible to frames screening, unlike `/statements` which does catch
      it), and the existing ~2009–2012 XBRL coverage floor.

      Verified end-to-end against the real running API (Docker, 2026-07-06):
      `frames_backfill --fiscal-year 2023 --fiscal-period FY --concepts
      revenue,net_income,total_assets` fetched real frames data (one candidate tag
      404'd -- `SalesRevenueNet` has no CY2023 frame -- logged and skipped, not fatal;
      the rest succeeded, e.g. `Assets`/`CY2023Q4I` -> 6,428 real companies);
      `revenue_min=300000000000&net_income_min=50000000000` correctly returned real
      Apple (`revenue: 383285000000, net_income: 96995000000`) and Alphabet
      (`revenue: 307394000000, net_income: 73795000000`) with correct entity names; a
      request with no filters 400'd; a request with no API key 401'd; an impossible
      filter returned an empty `results` list with `caveats` still present; a
      `total_assets` range filter (exercising the instant/`Q4I` frame path) correctly
      matched Exxon Mobil, Lincoln National, and Apple.
- [x] **Filtered listing endpoints (by concept, period)** — the rank/browse complement to
      screening above. `GET /v1/concepts/{concept}?fiscal_year=&fiscal_period=&sort=&limit=`
      (`api/routes.py`) lists every reporting company's value for one
      `SCREENABLE_CONCEPTS` entry + period, sorted (`asc`/`desc`, default `desc`) and
      capped at `limit` (default 100, max 500) — no min/max thresholds, just a ranked
      list (e.g. "top 10 companies by revenue this quarter"). Confirmed with the user
      first which of two readings this roadmap line meant (a cross-company ranked list
      vs. a single-company concept-history time series) before building, since the two
      imply different data sources and infrastructure.

      **Reuses essentially all of the screening infrastructure just built, so this
      landed as a small addition, not a new subsystem:** a new `_list_concept`
      (`api/routes.py`) is `_run_screen`'s sibling — same `RawFactRepository.screen()`
      + `resolve_concept_values` call per concept, just sorted-and-capped instead of
      threshold-filtered-and-intersected. The two endpoints' caveats were unified into
      one renamed `_FRAMES_CAVEATS` (was `_SCREENING_CAVEATS`) since both read the same
      frames-sourced data and share the same coverage gaps (calendar alignment,
      extension-tag blind spot, XBRL floor). No new ingestion, no new storage, no new
      analytical-engine question to re-benchmark.

      Verified end-to-end against the real running API (Docker, 2026-07-07) using the
      frames data already backfilled for the screening item above: `GET
      /v1/concepts/revenue?fiscal_year=2023&fiscal_period=FY&sort=desc&limit=5`
      correctly returned real Walmart ($642,637,000,000), Amazon ($574,785,000,000),
      Apple ($383,285,000,000), UnitedHealth ($371,622,000,000), and CVS Health
      ($357,776,000,000) in that order — the real top-5 US companies by FY2023 revenue;
      `sort=asc` on `net_income` correctly surfaced the largest losses first; an unknown
      concept 404'd; a request with no API key 401'd; an invalid `sort` value 422'd
      (FastAPI's `Query(..., pattern=...)` validation).

**M4 status: complete.** Both items — cross-company screening and concept
listing/ranking — are done, verified against real SEC data end-to-end. What's left
project-wide is the pre-launch checklist below and the deliberately-deferred Track 2
items, neither of which is more Track-1 feature work.

## Deferred (NOT Track 1 — decide later, deliberately)

- [ ] Track 2: MD&A / risk factors / footnotes (free-text narrative)
- [ ] Any LLM summarization of filings (recurring per-token cost — revisit only with a
      clear pricing story)

## Pre-launch checklist

- [x] **Confirm current SEC fair-access + redistribution terms.** Fetched
      `sec.gov/search-filings/edgar-search-assistance/accessing-edgar-data` and
      `.../edgar-application-programming-interfaces` directly with `curl` + our own
      compliant User-Agent (2026-07-07) -- generic `WebFetch` got 403'd by SEC's own WAF,
      itself a live confirmation of exactly the policy being verified. Confirmed: rate
      limit is "10 requests/second" (matches `config.py`'s `sec_max_rps=8`, described as
      staying under it); SEC's own sample `User-Agent`/`Accept-Encoding` header format
      matches `SECClient`'s exactly; `companyfacts.zip`/`submissions.zip` URLs and the
      "recompiled nightly" cadence match `CLAUDE.md`'s existing notes exactly. New detail:
      frames aggregates "the last filed fact that most closely fits the calendrical period
      requested" -- confirms the calendar-alignment behavior M4 already found live.
      Redistribution: no explicit restriction found on SEC's developer docs or privacy
      page (consistent with EDGAR's established public-domain status), but no explicit
      clause to quote either -- noted honestly rather than overclaimed.
- [x] **Verify User-Agent is enforced everywhere and throttle can't be bypassed.** Found
      and fixed two real gaps:
      1. `ingest/downloader.py`'s `download_resumable` (used by `ingest/backfill.py` and
         `ingest/institutional_backfill.py`, both of which call it *before* any
         `SECClient` is ever constructed) never checked the `"unset@example.com"`
         placeholder the way `SECClient.__init__` does -- a misconfigured
         `SEC_USER_AGENT` would silently send real requests to SEC's bulk endpoints with
         that literal placeholder. `docker-compose.yml`'s `${SEC_USER_AGENT:?...}` only
         guards the containerized path; this is now guarded at the lowest common point
         (`download_resumable` itself) for a bare `pip install -e .` run too. Covered by
         `tests/test_downloader.py`.
      2. **The bigger finding: the SEC-bound rate limiter was per-`SECClient`-instance,
         not process-wide.** Every `/v1` route handler constructs its own `SECClient()`
         (`async with SECClient() as client:`), and each one built an independent
         `RateLimiter` -- under concurrent cache-miss traffic, N simultaneous requests
         each got their own uncoordinated throttle budget, so the *effective* aggregate
         request rate against SEC scaled with concurrency instead of staying capped at
         `sec_max_rps` process-wide. The throttle was structurally bypassable, not just
         theoretically. Fixed with `sec/client.py`'s `_shared_default_limiter` -- one
         process-wide `RateLimiter` shared by every default-configured `SECClient`
         (correct for this deployment: `Dockerfile` runs a single uvicorn process, no
         `--workers`); an explicit `max_rps=` override still gets its own independent
         limiter. Covered by `tests/test_sec_client.py`, and empirically verified against
         the real API below.
- [x] **Load test the warm cache path** (`/statements`, `/insider-trades`,
      `/managers/{cik}/holdings` -- all three cache-aside). Found and fixed a real
      latency bug along the way: `/statements` took a consistent ~220ms on a genuine
      cache HIT for an established filer (Apple, 24,765 stored `raw_facts` rows) --
      `_facts_for_cik` fetched and Pydantic-validated the company's ENTIRE fact history
      on every request, then filtered to one period in Python
      (`normalize/statements.build_statement`), even though only ~15 rows were ever
      relevant. Fixed with a period-scoped cache-aside helper,
      `_statement_facts_for_cik` (`api/routes.py`), backed by two new repository
      methods -- `get_raw_facts_for_period` (SQL-filtered via the existing
      `(cik, fiscal_year, fiscal_period)` index) and `has_any_facts` (a cheap existence
      check so an out-of-range period on an already-cached company stays a local
      negative instead of re-triggering a live SEC fetch on every request). `/periods`
      keeps using the original full-history `_facts_for_cik` -- it genuinely needs every
      period. Verified end-to-end against the real running API (Docker, 2026-07-07):
      warm `/statements` for Apple dropped from ~220ms to ~11-14ms (matches the ~15-20x
      estimate), same response content confirmed byte-for-byte equivalent (the fix only
      changes fetch efficiency, not `build_statement`'s selection logic). A committed,
      reusable load-test script (`scripts/load_test_cache_path.py`) signs up multiple
      free-tier keys via the real `POST /v1/signup` flow (simulating distinct
      subscribers, since the per-key token-bucket limiter gives each an independent
      budget) and drives concurrent traffic at `/insider-trades` and
      `/managers/.../holdings`: 120 concurrent requests sustained 113-164 req/s
      aggregate with median latency 93-124ms and only the EXPECTED per-key 429s (a few
      of one key's 8 rapid requests exceeding its own 5 req/s free-tier budget -- the
      auth layer working as designed, not a cache-path defect). A single non-concurrent
      request to the same endpoints confirmed ~12ms baseline -- the elevated burst
      latency is pure single-process event-loop/SQLite-connection queueing under an
      artificial simultaneous-120-request burst, not a per-request inefficiency like the
      `/statements` case, and stays well within acceptable bounds.
- [x] **Load / failure test the cold path.** Two parts:
      1. *Concurrent cold traffic approaching the 8 req/s ceiling:* a committed script
         (`scripts/load_test_cold_path.py`) found 3,907 genuinely never-ingested real
         CIKs (diffed the cached set against a live `company_tickers.json` fetch --
         mostly foreign private issuers: ASML, HSBC, Novartis, Shell, Toyota, etc.) and
         fired 8 concurrent first-ever requests using 8 distinct free-tier keys (so the
         app's own per-key/anon limiters couldn't reject the burst before it reached the
         SEC-facing throttle being tested). Verified end-to-end against real SEC data
         (2026-07-07): all 8 succeeded (200), took 3.88s aggregate (not the ~0s a broken
         throttle would allow), with visibly increasing per-request latency (416ms up to
         3,877ms) as later requests queued behind the shared limiter -- direct empirical
         confirmation the process-wide `RateLimiter` fix above holds under real
         concurrent load, not just in a unit test.
      2. *What a mid-request SEC 403/throttle does to a response:* found that an
         upstream `httpx.HTTPStatusError` or `httpx.TransportError` (timeout/connect
         failure) during a live fetch previously propagated uncaught, becoming a bare,
         unhandled `500 Internal Server Error` with no body (Starlette's generic
         default) -- safe (nothing leaked) but wrong: tells the caller WE are broken
         when the real cause is upstream, with no actionable retry signal. Fixed with
         two global FastAPI exception handlers (`api/main.py`) -- `HTTPStatusError` ->
         `502` ("Upstream SEC request failed (HTTP `<code>`)... please retry"),
         `TransportError` -> `503` ("...timed out or could not connect... please
         retry") -- applied uniformly across every endpoint via `@app.exception_handler`,
         no per-route changes needed. Covered by `tests/test_upstream_error_handling.py`
         (full-stack `TestClient` with `raise_server_exceptions=False`, confirming the
         real Starlette response a client would see, not just that Python code doesn't
         crash). Simulated only (no real SEC 403s exist to trigger on demand) -- the
         concurrency half above already exercises the real live-SEC path.
      Note superseded from an earlier draft of this item: the insider/13F caches now DO
      have a bulk-seeding path (M2.5's `institutional_backfill.py`, M3's
      `insider_backfill.py`), so "mostly cold" traffic is less of a given at launch than
      originally assumed here -- though still not guaranteed for every company a
      subscriber might request.
- [x] **Verify the backup/restore round-trip into a fresh volume.** Executed the exact
      documented `DEVELOPMENT.md` §7 workflow against the real live volume (2026-07-07),
      not a toy example: `storage.backup` (156MB, online backup API against a live DB),
      recorded baseline counts (6,735 distinct `raw_facts` CIKs, 395,518 total rows, 72
      insider filings, 2 holdings snapshots, 50 API keys), `docker compose down -v`
      (genuinely destroyed the volume), `storage.restore --latest` into the fresh
      volume, then verified: `PRAGMA integrity_check` -> `ok`; no stale `-wal`/`-shm`
      sidecars; every count matched the baseline EXACTLY; the live API served real data
      correctly afterward (`GET /statements` for Apple returned the correct 15 lines,
      ~10ms -- confirming the warm-path fix above also survives a restore, since it's a
      fresh WAL-mode reinit, not a carried-over state).

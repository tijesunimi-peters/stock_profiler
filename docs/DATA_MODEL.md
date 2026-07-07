# Data model & normalization

## Why two layers

- **`RawFact`** — exactly what the SEC reported: the original tag, unit, period, filing,
  and whether it was a company *extension* tag. We keep this verbatim for auditability and
  to keep improving the mapping.
- **Canonical outputs** (`Statement` / `StatementLine` / `InsiderTransaction`) — the clean,
  consistent shape subscribers actually consume.

Never let the canonical layer lose the audit trail: every `StatementLine` carries the
`source_tag` it was mapped from and an `is_extension` flag.

## Coverage boundaries (surface these)

These are *availability* limits: inside a boundary we have the data; outside it we don't — and
"outside" means **we don't carry it**, not "it didn't happen." Never let an empty result read as
"nothing was filed." Both floors below should be shown to users, not just tracked internally.

- **Financials (XBRL) — from ~2009, phased through ~2012, capped per company.** The SEC only
  required XBRL financial data starting in 2009, phased in by filer size (large accelerated filers
  2009; accelerated 2010; the remainder 2011, effectively complete by ~2012). A company's statement
  history therefore starts at its **first XBRL filing** — which for a recently-public company is
  much later than 2009 (a 2021 IPO has no pre-2021 financials here). Pre-XBRL financials exist only
  as legacy HTML/text filings, which we deliberately don't parse (no HTML scraping — CLAUDE.md).
  There is **no pre-~2009 fundamentals history by design.**
- **Beneficial ownership (13D/13G) — structured-XML filings only (from ~mid-2025).** The SEC
  transitioned Schedule 13D/G to structured XML during 2025 (confirmed against real Apple history:
  legacy `SC 13G/A` HTML/text as recently as 2024-02-14; modern `SCHEDULE 13G`/`SCHEDULE 13G/A`
  from 2025-07-29). We parse **only** the modern structured filings; legacy HTML/text ones are
  excluded by design (no HTML scraping). A company whose 5%+-ownership history predates the
  transition returns an **empty list, not an error** — read that as "outside our coverage window,"
  not "no one crossed 5%." (See the "13D / 13G" section below for the parsing detail.)

For contrast, the sources *without* a recent floor: insider trades (Forms 3/4/5) and 13F holdings
moved to structured XML much earlier, so their usable history runs far deeper — bounded by each
filer's EDGAR history and the (earlier) date each form adopted XML, not by the 2025 cutover above.

## Canonical concepts

A small, stable set of keys (e.g. `revenue`, `net_income`, `total_assets`,
`cash_from_operations`). These are the public contract — renaming one is a breaking change,
so add rather than rename.

Each concept maps to an **ordered list of candidate US-GAAP tags** in `mapping.py`. Example:

```
revenue -> [
  "RevenueFromContractWithCustomerExcludingAssessedTax",  # preferred (modern standard)
  "Revenues",
  "SalesRevenueNet",                                       # older filings
  "RevenueFromContractWithCustomerIncludingAssessedTax",
]
```

When building a statement, for each concept we take the **first candidate that has a value**
for that period. This is how we absorb tag inconsistency across companies and across years.

## Handling the messy realities

- **Different tags, same concept** → the candidate list. Add tags as you find gaps.
- **Extension tags** (company-specific, outside us-gaap/dei) → flagged via `is_extension`.
  We generally *don't* map these automatically; surface them for review. A recurring
  extension tag worth supporting becomes a new candidate in the mapping.
- **Tag changes year to year** → covered by the ordered candidate list.
- **Restatements** (same concept+period, multiple filings, different values) → keep all
  versions in the store; the builder picks the latest `filed` as "current" and never deletes
  prior ones.
- **Units** → carried on every fact (`USD`, `shares`, `USD/shares`). Never silently rescale.
- **Duration vs. instant** → income/cashflow lines are durations (`period_start`+`period_end`);
  balance-sheet lines are instants (`instant`).

## Improving coverage

`statements.coverage_report()` counts mapped vs. unmapped facts. Unmapped high-frequency
tags are your best candidates to add next. Every time you add a concept or candidate tag:

1. update `mapping.py` (`CONCEPTS` and, if new, `STATEMENT_CONCEPTS`),
2. update this doc,
3. add/extend a test in `tests/`.

**Worked example (2026-07-03):** `coverage_report()` against real filings for AAPL, MSFT,
JPM, WMT, COST, TGT, BAC showed `interest_expense` unmapped for half the sample even
though most of them clearly report it — just under a different tag than `InterestExpense`.
Checking what each company actually uses turned up three more real candidates:
`InterestExpenseNonoperating` (MSFT, TGT), `InterestExpenseDebt` (WMT), and
`InterestExpenseOperating` (JPM/BAC — confirmed by summing their granular
deposit/repo/debt/trading-liability interest-expense tags, which matches this one).
Coverage across that sample went from 3/7 to 6/7 companies. See `tests/test_real_fixtures.py`
for the regression tests this was verified against.

### Known limitations (structural, not tagging gaps — don't "fix" with more candidate tags)

- **Banks / financial institutions don't fit this schema.** A bank's income statement is
  built around net interest income + noninterest income/expense, not
  cost-of-revenue/gross-profit/operating-income — there's no better tag to add for
  `cost_of_revenue`, `gross_profit`, `research_and_development`, `sga_expense`,
  `operating_expenses`, or `operating_income` for a bank, because the concept genuinely
  isn't reported that way. `interest_expense` is the one line that *does* map cleanly (see
  above). A proper fix would mean a separate canonical schema for financial-sector
  companies — a bigger, deliberate decision, not a mapping-table tweak.
- **Retailers often don't tag a discrete `gross_profit` or aggregate `operating_expenses`
  line**, even though they clearly compute both internally (confirmed against WMT, COST,
  TGT) — SG&A is tagged, but the rollup isn't. R&D is correctly absent for retailers (not
  applicable, not a gap). `build_statement` already skips concepts with no value rather
  than emitting a blank/zero row, which is the right behavior for all of the above.
- **Apple's recent 10-Ks don't tag a discrete `interest_expense` line at all** — it's
  netted into "other income/expense." Absent is correct here, not a regression.

**Worked example, balance sheet + cash flow (2026-07-04):** checked `build_statement()`
against the same AAPL/WMT/JPM fixtures for `balance` and `cashflow`. AAPL and WMT come out
fully covered on every applicable concept. JPM was missing `cash_and_equivalents` — it
doesn't use the commercial `CashAndCashEquivalentsAtCarryingValue` tag at all, reporting
`CashAndDueFromBanks` instead (added as a second candidate). See
`tests/test_real_fixtures.py` for the regression tests.

### Known limitations — balance sheet / cash flow (structural or real gaps, not tagging bugs)

- **Banks' balance sheets aren't classified into current/noncurrent**, and banks hold
  loans/deposits rather than receivables/inventory — `total_current_assets`,
  `total_current_liabilities`, `accounts_receivable`, `inventory`, and `long_term_debt`
  have no better tag to add for JPM; this mirrors the income-statement bank limitation
  above. JPM's closest long-term-debt line
  (`LongTermDebtAndCapitalLeaseObligationsIncludingCurrentMaturities`) mixes in current
  maturities, so it isn't a like-for-like substitute for the noncurrent-only concept.
- **Banks don't tag a discrete `capital_expenditures` line in XBRL** the way commercial
  filers do (confirmed against JPM) — nothing to map it to.
- **Walmart's 10-K has no aggregate `Liabilities` tag** — only the combined
  `LiabilitiesAndStockholdersEquity` total. There's no second candidate tag that means
  "total liabilities" on its own; correctly deriving one would mean subtracting
  `stockholders_equity`, which is a "combine multiple tags" capability the mapping
  doesn't have (same category as the `debt_current` split limitation above) — tracked as
  a gap, not fixed here.
- **`shares_outstanding`'s `dei` fallback (`EntityCommonStockSharesOutstanding`) is
  currently dead in practice** — confirmed against the WMT fixture, which only tags
  `CommonStockSharesOutstanding` in `us-gaap`... except it doesn't, either (WMT reports no
  us-gaap shares-outstanding tag this period at all). `fetch_raw_facts`/`flatten_company_facts`
  default to `taxonomy="us-gaap"` everywhere they're called (`ingest/backfill.py`,
  `ingest/incremental.py`, `api/routes.py`), so `dei` facts are never actually ingested —
  the fallback tag can't fire until something in the ingest path fetches `dei` too. Flagging
  as a real, verified gap rather than fixing here: it's an ingestion-pipeline change (touches
  all three call sites plus storage), not a mapping-table tweak.

## Insider transactions

`InsiderTransaction` captures issuer, reporting owner + relationship, and per-trade fields
(date, security, shares, price, acquired/disposed, direct/indirect ownership, shares after).
Holdings-only rows are kept but flagged with `is_holding`. Parsing lives in `sec/insider.py`.

`fetch_insider_transactions(client, cik, limit)` reads `/submissions/CIK##########.json`'s
`filings.recent` block, filters to Forms 3/4/5 (+ `/A` amendments), and for each fetches +
parses the ownership XML via `parse_ownership_xml` — a pure, network-free function (same
design intent as `companyfacts.flatten_company_facts`) so a future bulk path can reuse it
against raw bytes from a different source.

**Confirmed quirk (2026-07-04, against a real Apple Form 4):** `primaryDocument` in
`filings.recent` (e.g. `"xslF345X06/form4.xml"`) points at EDGAR's *rendered-HTML* viewer
path — fetching that exact URL returns HTML, not XML. The raw ownership XML lives at the
filing's directory root under the same filename, with the `xslF345X0N/` viewer prefix
stripped (`_raw_document_name`). See `tests/fixtures/insider/README.md`.

**Joint filers:** a filing can have more than one `<reportingOwner>` — confirmed against
real Berkshire Hathaway Inc. / Warren E. Buffett and JPMorgan Chase & Co. / DNT Asset Trust
Form 4s (`tests/fixtures/insider/brka_form4_davita_joint.xml`). The XML doesn't attribute a
transaction/holding row to one specific owner — a joint filing's tables apply to all listed
owners jointly — so `parse_ownership_xml` emits one `InsiderTransaction` per
(reporting owner x row), the same "duplicate the shared row per filer" shape used for 13D/G
joint filers below. A cluster of 3 joint filers reporting the same sale therefore reads as 3
rows sharing one `transaction_date`/`shares`/`accession`, not 1 — this is what makes insider
cluster-buying detection possible.

**API:** `GET /v1/companies/{symbol}/insider-trades?limit=` (`api/routes.py`) is now
cache-aside via `_insider_transactions_for_cik` + `InsiderTransactionRepository`
(`storage/insider_repository.py` / `storage/sqlite_insider_repository.py`) — same spirit
as `/statements`' `_facts_for_cik`, but keyed at **filing** granularity, not per
transaction row, since (unlike XBRL facts) a Form 3/4/5 is immutable once accepted — an
amendment gets its own accession ("4/A"), it never rewrites a prior one. Caching by
filing also sidesteps a real gap in `InsiderTransaction`'s current fields: two genuinely
distinct rows in the same filing can be field-for-field identical under our schema (two
`derivativeHolding` rows with the same security title and ownership type, differing only
in the underlying-security share count we don't parse — see
`aapl_form3_newstead.xml`) — a natural-key UNIQUE constraint built from those fields would
silently collapse them, so identity is tracked at the filing level instead.

**Cache-hit rule:** `limit` bounds *filings* fetched, not rows, so a cache holding 10
filings can answer `limit=5` but not `limit=50` — a smaller previously-cached limit is
not a superset of a larger one. `_insider_transactions_for_cik` checks
`cached_filing_count(cik) >= limit` before trusting the cache; on a miss it re-fetches
the **full** requested `limit` from SEC (not just the delta) and re-upserts — safe
because `upsert_insider_transactions` skips rows for any filing already cached, so
re-fetching overlapping filings is a no-op, just wasted SEC calls for the overlap
(a deliberate v1 simplicity trade-off, not incremental top-up). A filing that parses to
zero transaction rows (e.g. a Form 3 with no reportable holdings) still counts as
"cached" via a separate `insider_filings` table, or the cache would never register a hit
for it. Verified end-to-end against real AAPL data (2026-07-05): a cold `limit=5` call
populated the cache in ~1s; a repeat `limit=5` call returned identically in <0.05s (no
SEC call); a `limit=10` call correctly missed, grew the cache to 10 filings, and a repeat
`limit=10` call then hit.

## Institutional ownership (13F, 13D/G)

This is the "ownership & flows" module that pairs with insider trades. It answers "who
owns / is accumulating this stock?" — a different question from insider activity, and a
different filing set.

### The one distinction that shapes everything: snapshot ≠ transaction

**Form 13F is a quarter-end holdings snapshot, not a record of trades.** A manager reports
the positions it held at the end of the quarter. There is no "bought 500k shares on date X".

So the models split cleanly:

- `InstitutionalHolding` — one position line from a 13F information table (CUSIP, issuer,
  value, shares, put/call, discretion).
- `HoldingsSnapshot` — a manager's full 13F for one quarter (`manager_cik`, `report_period`).
- `HoldingDelta` — **derived** buy/sell, computed by diffing two consecutive snapshots
  (`new` / `added` / `reduced` / `exited` / `unchanged`). This is a *computed* result, and
  the API surfaces it as such — we never present it as reported trade data.

The diff lives in `normalize/flows.py` (`diff_snapshots`) and is fully implemented.
13F XML parsing (`sec/institutional.py`) is now implemented too:
`fetch_13f_snapshot(client, manager_cik, report_period)` reads the manager's
submissions.json, matches `reportDate` to the requested quarter-end, locates the info
table (see below), and parses it via `parse_info_table_xml` — pure and network-free, same
design intent as `companyfacts.flatten_company_facts` / `insider.parse_ownership_xml`.

**Cache-aside store, keyed on `(manager_cik, report_period)`** —
`HoldingsSnapshotRepository` (`storage/holdings_repository.py`) +
`SQLiteHoldingsSnapshotRepository` (`storage/sqlite_holdings_repository.py`), wired into
`/managers/{manager_cik}/holdings` and `/managers/{manager_cik}/activity` via
`api/routes.py`'s `_manager_snapshot`. Unlike the insider store (keyed at filing/accession
granularity, since a Form 3/4/5 is immutable once accepted), this is keyed at
**quarter** granularity, matching what `fetch_13f_snapshot` itself resolves to — a 13F
CAN be superseded (an original 13F-HR + a later 13F-HR/A for the same quarter; the newer
filed one wins), so a re-store (e.g. from a future bulk-ingest job) replaces the whole
snapshot's holdings wholesale rather than merging rows. **Known, deliberate staleness
window:** once a quarter is cached, the live read path serves it forever and never
re-checks SEC for a later amendment — the same trade-off `_facts_for_cik` already makes
for statements (picking up new data is `ingest/`'s job, not the read path's). Resolved
CUSIP→CIK (`InstitutionalHolding.cik`) is deliberately **not** persisted — every cached
row comes back with `cik=None`, so `resolve_snapshot_cusips` always re-runs on read
(cache hit or miss), letting a CUSIP that was unresolved at cache time resolve later as
the CUSIP map improves, instead of freezing that outcome forever. Verified end-to-end
against real Berkshire Hathaway 13F data (2026-07-05): a cold fetch for one quarter
populated the cache (~0.8s, 90 holdings); a repeat request for the same quarter hit
instantly with identical data; a different, never-fetched quarter still correctly missed.

**Confirmed quirk (2026-07-04, against real Berkshire Hathaway 13F-HR filings):** unlike
Forms 3/4/5, a 13F's `primaryDocument` in `filings.recent` is the *cover page* (filer
info, signature — no holdings at all), not the information table. The info table's
filename isn't standardized across filer software — one quarter names it an arbitrary
digit string (`"53405.xml"`), an older one names it `"form13fInfoTable.xml"`. The one
constant: it's the filing's other top-level `.xml` document, so
`_find_info_table_document` lists the filing directory (`SECClient.filing_index_json_url`)
and picks whichever `.xml` isn't the cover page. See
`tests/fixtures/institutional/README.md`.

**Confirmed UNIT CAVEAT:** the SEC's convention for `InstitutionalHolding.value` changed
from thousands of dollars to whole dollars at some point around 2023 — confirmed by
cross-checking real filings against real share prices, not assumed. A 2016 Berkshire info
table reports `$488,930` (thousands) for 13.36M American Airlines shares (≈$36.60/share
once scaled); a 2026 one reports `$498,992,850` (whole dollars, no scaling needed) for
12.72M Ally Financial shares (≈$39.23/share directly). `value` is stored exactly as
reported — this module does **not** detect or normalize the convention change; a caller
comparing `value` across quarters spanning it must account for the shift itself.

CUSIP→issuer-CIK resolution is explicitly **not** done inside `sec/institutional.py` —
`InstitutionalHolding.cik` is always `None` from this parser. Resolution is a separate,
opt-in step: `normalize/cusip.py`'s `CusipResolver.resolve(client, cusip, issuer_name)`
matches a 13F row's `nameOfIssuer` against SEC's own `company_tickers.json` (the same
source `sec/ticker_cache.py` uses for ticker→CIK — confirmed it carries no CUSIP field,
so there's no shortcut there), and persists the outcome via a `CusipMapRepository`
(`storage/cusip_repository.py` + SQLite impl) so the same CUSIP is a cache hit across
every manager's 13F, not just one.

**Deliberately conservative, not fuzzy:** only an EXACT match after normalization
(`normalize_issuer_name` — uppercase, strip punctuation, drop common legal suffixes)
counts as resolved; nothing attempts to expand abbreviations. Confirmed against a real
mismatch this correctly declines rather than guesses at: Berkshire's 2026 Q1 13F reports
CUSIP `02005N100` as issuer `"ALLY FINL INC"`, but SEC's registered title is `"Ally
Financial Inc."` — normalizing both sides gives `"ALLY FINL"` vs `"ALLY FINANCIAL"`, which
don't match, so that CUSIP stays unresolved (and tracked) rather than silently attached to
the wrong or right CIK by chance. A wrong CIK on a position is worse than an honestly
unresolved one for data served as fact. See `tests/test_cusip.py`.

`CusipMapRepository.unresolved_cusips()` surfaces everything still unmatched
(issuer name as last reported, attempt count, first/last seen) for review or a future,
more capable resolver — not silently dropped.

**Resolution rate is a first-class, surfaced metric** — `GET /v1/cusip-resolution-stats`
(`api/routes.py`) returns `CusipResolutionStats` (`resolved`, `unresolved`, `total`,
`resolution_rate`), built by `normalize/cusip.cusip_resolution_stats` over a cheap
`CusipMapRepository.resolution_counts()` (`SELECT COUNT(cik), COUNT(*)` — one query, not
`len(unresolved_cusips())` plus a second one). `resolution_rate` is `None`, not `0.0`, when
`total == 0` — an empty map hasn't "failed," nothing has been attempted yet. The rate is
monotonically non-decreasing, never a fixed number: `cusip_map` persists across runs (this
is *unlike* the per-snapshot `InstitutionalHolding.cik`, which is genuinely re-resolved on
every read — see the holdings-cache section above), and `record_unresolved` never clobbers
an existing resolution, so a CUSIP unresolved on one attempt can only improve, never
regress, as SEC's `company_tickers.json` grows.

**Joint filers ARE attributed** (this used to be a known limitation — resolved). A 13F
cover page's `otherManagers2Info` numbers each co-filing manager (`sequenceNumber`), and
each infoTable row carries its own `<otherManager>` tag listing which of those numbers
exercised discretion for THAT specific position — confirmed against a real Berkshire
Hathaway 13F-HR (accession `0001193125-26-226661`, 2026-03-31) with **14 co-filing
insurance-subsidiary managers** (GEICO Corp, National Indemnity Co, Buffett Warren E,
...), where individual holdings are attributed to 1-3 of them (e.g. Ally Financial's two
info-table rows are `[4]` and `[2, 4, 11]`). `sec/institutional.py`'s
`parse_cover_page_xml` returns the numbered roster as `HoldingsSnapshot.other_managers`
(`OtherManager13F`: `sequence_number`, `name`, `file_number`);
`InstitutionalHolding.other_managers` carries each row's reference list — empty means
the filing manager alone had discretion. `fetch_13f_snapshot` now fetches **both**
top-level XML documents per snapshot (info table + cover page), not just one. Both
fields are cached as-reported (unlike CUSIP→CIK, there's no resolution step to re-run on
a hit) — see `storage/holdings_repository.py`. Verified end-to-end against the real
running API (2026-07-06): a cold fetch for Berkshire's 2026 Q1 13F returned the 14-entry
roster and correct per-holding attribution alongside the 90 holdings; a repeat request
hit the cache with identical roster and attribution.

**Deliberately not modeled:** some older filings (confirmed 2016 Berkshire) also carry a
separate, unnumbered `<otherManagersInfo>` block — a flat list with no `sequenceNumber`,
so nothing in the info table can reference it positionally. Only the numbered
`otherManagers2Info` roster supports attribution, so only it is parsed.

### API: per-manager endpoints

`GET /v1/managers/{manager_cik}/holdings?period=` (`api/routes.py`) wires
`fetch_13f_snapshot` straight through, then resolves CUSIPs to CIKs in place via
`normalize/cusip.resolve_snapshot_cusips` — `CusipResolver`'s first real caller. 404s if
that manager has no `13F-HR`/`13F-HR/A` for the requested quarter-end.

`GET /v1/managers/{manager_cik}/activity?period=&include_unchanged=` wires
`normalize/flows.diff_snapshots` into an endpoint: fetches the requested quarter's
snapshot and, via the new `normalize/flows.prior_quarter_end`, the immediately preceding
one; resolves CUSIPs on both; diffs them. A missing prior quarter (e.g. the manager's
first-ever 13F) is treated as `prior=None`, so every current position comes back as
`"new"` — the same designed behavior `diff_snapshots` already had, just reachable from
the API now. The response always carries a `caveats` list (derived-not-reported,
long-only, ~45-day lag) alongside `activity` — CLAUDE.md is explicit that these three
facts must never be left implicit in an institutional response.

Verified end-to-end against the real running API with real Berkshire Hathaway data
(2026-07-05): cleanly-matching issuers resolved (Alphabet, Apple, Amazon, Chevron,
Coca-Cola, ...), abbreviated ones correctly stayed unresolved (e.g. `"BANK AMERICA
CORP"`, `"CAPITAL ONE FINL CORP"`, `"LOUISIANA PAC CORP"`), and the 2025-12-31 →
2026-03-31 diff produced real new/added/reduced/exited activity. Neither endpoint has a
cache-aside store yet (see the "Cache-aside store for 13F holdings snapshots" roadmap
item) — both re-fetch and re-parse from SEC on every call.

### Bulk ingest (Milestone 2.5)

The per-manager cache above only grows one manager at a time, via live requests. Answering
"who holds this issuer, across all managers, this quarter?" needs *every* manager's 13F for
a quarter first — that's what `ingest/institutional_backfill.py`
(`python -m secfin.ingest.institutional_backfill --period YYYY-MM-DD`) produces, seeding the
exact same `HoldingsSnapshotRepository` the manager endpoints read from.

**Also resolves CUSIPs as it goes** (added when the issuer-centric endpoints below were
built): the job now calls `normalize/cusip.resolve_snapshot_cusips` on every fetched
snapshot before upserting it. This was a real gap, not a hypothetical one — CUSIP
resolution previously only ran on the live manager-read path, so a snapshot that only ever
arrived via this bulk job left `cusip_map` with no entry for its CUSIPs, and the
issuer-centric endpoints' CIK→CUSIP reverse lookup would find nothing for it.

Candidate managers are found **offline**: the job scans `submissions.zip` (already
downloaded by `ingest/backfill.py` for exactly this; fetched standalone here via
`ingest/downloader.download_submissions_file`) and reuses `recent_13f_filings` — the same
pure filter `fetch_13f_snapshot` uses — to pick each manager's winning 13F-HR/13F-HR/A for
the target quarter, no network involved. Fetching then goes through a new
`fetch_13f_snapshot_for_filing`, split out of `fetch_13f_snapshot` specifically so this job
(which already knows the winning filing) doesn't repeat a live `submissions.json` lookup
per manager the way the single-manager path needs to.

**Amendment freshness solved via accession comparison, not a checkpoint table:** a new
`HoldingsSnapshotRepository.cached_accession(manager_cik, report_period)` — one indexed
lookup, no full snapshot deserialization — is compared against the winning filing's
accession from the zip scan. Equal → already current, skip (this doubles as crash/resume
safety). Unequal — including "nothing cached yet" — → fetch and upsert. A later-filed
`13F-HR/A` always has a different accession than what's cached, so re-running the job for
a quarter picks it up automatically; it does still require an operational re-run, not a
one-time backfill, to actually catch amendments filed after the first pass.

Single async process, sequential — no producer/consumer pool like the companyfacts
backfill. That pipeline parallelizes because parsing huge local JSON is CPU-bound; this
job's cost is network I/O (1 directory listing + 2 document fetches per manager) against
the same rate-limited `SECClient`, so extra processes wouldn't help — same reasoning
`ingest/incremental.py` already documents ("the fair-access limit is per-IP, not
per-process").

### API: issuer-centric endpoints

`GET /v1/companies/{symbol}/institutional-holders?period=` and
`GET /v1/companies/{symbol}/institutional-activity?period=&include_unchanged=` answer "who
holds this issuer" and its DERIVED buy/sell — the inverse of the per-manager endpoints
above (those start from a manager and ask "what does it hold"; these start from an issuer
and ask "who holds it").

**Deliberately NOT built on a precomputed cross-manager inversion or DuckDB**, confirmed
with the user before building: a single issuer's holder list is a point lookup ("every
`holdings` row for this CUSIP this quarter"), not the whole-quarter, every-security
aggregate the DuckDB-vs-SQLite benchmark was about (see `docs/ARCHITECTURE.md` §3b) — that
benchmark answers a different, more expensive question. Instead:

- `CusipMapRepository.cusips_for_cik(cik)` — new, the reverse of the existing CUSIP→CIK
  `get_cik`. `cusip_map` already stores this; nothing new to persist, just a new read
  direction. A multi-class issuer (Alphabet) can resolve to more than one CUSIP.
- `HoldingsSnapshotRepository.holders_of(cusips, report_period)` — new, a live join against
  `holdings_snapshots` (for `manager_name`, not stored on `holdings` rows) backed by a new
  `(cusip, report_period)` index. Returns `IssuerHolder` rows: one per (manager, CUSIP,
  quarter) — the issuer-centric inverse of `InstitutionalHolding`.
- `normalize/flows.diff_holders` — new, `diff_snapshots`' transpose: one issuer's CUSIP(s),
  many managers, instead of one manager, many securities. Classifies each
  **(manager_cik, cusip)** pair independently via the same `_classify` helper
  `diff_snapshots` uses — deliberately does **not** sum a multi-class issuer's several
  CUSIPs into one manager-level position (unlike `_by_cusip`, which sums same-cusip
  duplicate rows *within* one manager's snapshot); collapsing distinct share classes
  together would conflate different instruments. Returns plain `HoldingDelta` rows — no new
  model needed, this is genuinely the same shape as the manager-centric activity endpoint's
  output, just inverted which axis is "the one" and which is "the many."

**New caveat, honestly surfaced rather than hidden:** because both endpoints read live from
whatever's been ingested so far (no precomputed, coverage-guaranteed inversion table), an
empty holder list is ambiguous between "no manager reported holding this issuer" and "this
quarter hasn't been ingested for any manager yet." `_ISSUER_CENTRIC_CAVEATS`
(`api/routes.py`) carries this alongside the existing derived-not-reported / long-only /
45-day-lag caveats on every response.

### 13D / 13G

`BeneficialOwnership` captures 5%+ ownership filings — 13D (activist) and 13G (passive) —
with owner, percent of class, shares, and event date. Event-driven, not periodic.
Implemented in `sec/institutional.py`: `parse_schedule_13dg_xml` (pure) +
`fetch_beneficial_ownership(client, issuer_cik, limit)`.

**Confirmed (2026-07-05): the SEC transitioned Schedule 13D/G to structured XML.**
Real Apple filing history shows legacy form types (`SC 13G/A`, plain HTML/text) as
recently as 2024-02-14, and modern structured-XML form types (`SCHEDULE 13G`,
`SCHEDULE 13G/A`) from 2025-07-29 onward — mirroring the same transition Forms 3/4/5 and
13F already went through. **Deliberate scope decision:** only the modern structured-XML
form types are parsed (`FORM_13DG` in `sec/institutional.py`); the legacy HTML/text ones
are silently excluded by `_recent_13dg_filings`, not attempted — parsing them would mean
HTML scraping, which CLAUDE.md rules out. A company whose only beneficial-ownership
history predates the transition returns an empty list, not an error. This also required
correcting `BeneficialOwnership.form_type`'s `Literal` — it previously guessed the
abbreviated `"SC 13D"`/`"SC 13G"` strings, but the real structured filings'
`submissionType` (and `filings.recent`'s `form` field) use `"SCHEDULE 13D"`/
`"SCHEDULE 13G"` instead.

**13D and 13G are two different XML schemas**, not variants of one shared schema —
confirmed against real filings for both: 13G's cover page has `issuerCik`/
`issuerCusips`/`eventDateRequiresFilingThisStatement` and exactly ONE
`coverPageHeaderReportingPersonDetails` block; 13D has `issuerCIK` (different casing!)/
`issuerCUSIP`/`dateOfEvent` and a `reportingPersons` list that can hold SEVERAL
`reportingPersonInfo` blocks for joint filers (confirmed against a real 6-reporting-person
Schedule 13D/A — RSLGH, LLC's chain of parent entities up to Green Thumb Industries).
`parse_schedule_13dg_xml` dispatches on the caller-supplied `form_type` to the matching
parser and returns one `BeneficialOwnership` per reporting person — 1 row for a typical
13G, N rows for a jointly-filed 13D. Dates are converted from the XML's MM/DD/YYYY to
this app's ISO YYYY-MM-DD convention (`_mmddyyyy_to_iso`).

**Confirmed real edge case:** a Schedule 13G/A can legitimately report 0 shares / 0% of
class — verified via a live fetch against a real Vanguard amendment for Apple, filed
after an internal corporate realignment moved beneficial ownership to subsidiaries.
Surfaced as-is, not treated as missing data.

**Not modeled (deliberately, not an oversight):** `typeOfReportingPerson` (e.g.
"IA"/"OO"/"CO"), citizenship, the sole/shared voting-vs-dispositive power breakdown, and
free-text comments/items are all present in the raw XML but not carried onto
`BeneficialOwnership` — that model already answers "who crossed 5%, how much, when."
See `tests/fixtures/institutional/README.md` for the fixtures this was verified against.

**API:** `GET /v1/companies/{symbol}/beneficial-ownership?limit=` (`api/routes.py`) wires
`fetch_beneficial_ownership_with_filings` through, returning
`{cik, caveats, beneficial_ownership}` — `caveats` always carries the structured-XML/
~mid-2025 coverage-floor note above, so an empty list reads as "outside our coverage
window," not "nobody filed." Cache-aside at **filing granularity** (a 13D/G filing is
immutable once accepted — an amendment gets its own accession, never rewriting a prior
one), the same shape as `insider_repository.py`: `BeneficialOwnershipRepository` /
`SQLiteBeneficialOwnershipRepository` (`storage/beneficial_ownership_repository.py`)
track `cached_filing_count(issuer_cik)`, and `limit` bounds *filings* fetched, not rows
— a jointly-filed 13D can still produce several rows from one cached filing.

### Limitations to surface (never hide these)

- 13F is **long positions in 13(f) securities only** — no shorts, no cash, no non-US.
- **~45-day reporting lag** after quarter-end, so the data is inherently stale.
- Amendments (`13F-HR/A`) can restate a quarter; keep both, latest filed is current.
- The `value` unit convention (thousands vs. whole dollars) changed mid-history — see
  above.
- Answering "who holds AAPL?" requires **aggregating across all managers' 13Fs** and
  inverting the index by security — closer to the cross-company/frames problem than to a
  per-company lookup, so it's more infrastructure than just another endpoint.
- CUSIP→CIK resolution isn't a single free SEC endpoint (confirmed:
  `company_tickers.json` has no CUSIP field) — it's a best-effort, exact-name-match
  mapping table (`normalize/cusip.py`) that intentionally leaves ambiguous/abbreviated
  names unresolved rather than guessing; see `unresolved_cusips()` for what's tracked.

## Analytical layer (Milestone 2.5) — not a new model, no serialization step (for now)

The DuckDB analytical engine (see `ARCHITECTURE.md`, stage 3b) reads the existing
`holdings`/`holdings_snapshots` tables **directly from the live SQLite file**
(`ATTACH ... (TYPE sqlite)`) — benchmarked against a Parquet-landing alternative and found
unnecessary for the single-quarter cross-manager inversion (~2.8x faster than plain SQLite,
zero ETL; see `ARCHITECTURE.md` §3b for the numbers). It is not a new canonical model and
does not get its own schema section here: the shapes above (`InstitutionalHolding`,
`HoldingsSnapshot`) stay the single source of truth, and a batch job's derived output (e.g.
an inverted holder-by-security index for the 13F cross-manager view) is a query result, not
a new canonical concept. A Parquet serialization stays deferred to Milestone 4, for if/when
the workload becomes whole-market, multi-quarter screening rather than one quarter's
inversion.

## Cross-company screening (Milestone 4)

`GET /v1/screen` filters companies by canonical-concept thresholds for one period, built
on the SEC `frames` API (one GAAP tag across ALL filers for one period, one HTTP call —
`sec/frames.py`). Deliberately a bounded MVP (typed `{concept}_min`/`{concept}_max` query
params, AND semantics only) rather than an open-ended query language — see CLAUDE.md's
scope note.

**Not a new canonical model, same as the M2.5 analytical layer above.** A frames data
point is shape-identical to an existing `RawFact` row; `ingest/frames_backfill.py` writes
frames-sourced points straight into the existing `raw_facts` table, tagged with the exact
SEC frame string (`RawFact.frame`, e.g. `"CY2023Q4"`). `RawFactRepository.screen()`
(`storage/sqlite_repository.py`) filters on that exact `frame` string via a dedicated
`idx_raw_facts_frame (gaap_tag, frame)` index — **not** `fiscal_year`/`fiscal_period`,
confirmed live (2026-07-06) that:

- Frames are **calendar-quarter aligned** (`CY2023Q4` = Oct–Dec 2023 by the calendar), not
  fiscal-period aligned — a company with a non-calendar fiscal year end reports its own
  "FY2023" over a different date range than frame `CY2023`. Keying on the exact frame
  string sidesteps reconciling the two rather than attempting it, and also means
  frames-sourced rows are never silently conflated with ordinary per-company companyfacts
  rows for a nominally-same period.
- Frame `data[]` rows carry only `accn`, `cik`, `entityName`, `loc`, `start` (duration
  only), `end`, `val` — **no `fy`/`fp`/`form`/`filed` fields**, unlike the companyconcept
  API's shape. `facts_from_frame` (`normalize/screening.py`) therefore leaves
  `fiscal_year`/`fiscal_period` unset on frames-sourced `RawFact`s.
- A bare annual instant period (`CY2023I`) 404s — instant (balance-sheet) concepts always
  need an explicit quarter suffix, so "FY" maps to that calendar year's `Q4`-end
  (`instant_frame_period`).

**`SCREENABLE_CONCEPTS`** (`normalize/screening.py`) is a small, deliberately curated
starter subset of the full `mapping.CONCEPTS` table — `revenue`, `net_income`,
`total_assets`, `total_liabilities`, `stockholders_equity`, `cash_and_equivalents` — grown
the same way `mapping.py` itself grows, per CLAUDE.md guardrail 3.

**A real, new coverage gap vs. `/statements`:** frames only covers standard `us-gaap`
candidate tags — a company that tags a concept via a company-specific *extension* element
is invisible to frames screening, even though `/statements` (which reads per-company
`companyfacts`, not frames) does catch that same company's extension-tagged value. Surfaced
in `_FRAMES_CAVEATS` (`api/routes.py`), always present on the response, alongside the
existing ~2009–2012 XBRL coverage floor.

**`GET /v1/concepts/{concept}`** is the rank/browse complement to `/screen` — no
min/max thresholds, just every reporting company's value for one concept + period,
sorted (`sort=asc|desc`) and capped at `limit` (max 500), e.g. "top 10 companies by
revenue this quarter." Same frames-sourced data, same `_FRAMES_CAVEATS`. Shares
`_list_concept`'s DB-only core with `_run_screen`'s equivalent for `/screen` — both call
`RawFactRepository.screen()` + `normalize.screening.resolve_concept_values` and differ
only in what they do with the resulting per-CIK value map (threshold-filter-and-intersect
vs. sort-and-cap).

**Analytical engine: benchmarked, not DuckDB.** `scripts/benchmark_screening.py` compared
plain indexed SQLite against DuckDB-over-SQLite for a representative multi-concept AND
screen at realistic frames scale (~8,000 companies × 6 concepts) and found plain SQLite
~3.3x faster — the opposite of the M2.5 13F-inversion result, because frames scale is two
orders of magnitude below the 561K-row 13F inversion that justified DuckDB there. See
`ARCHITECTURE.md` §3b for the full numbers. `screen()` is plain SQLite; no new `duckdb`
dependency on the screening path.

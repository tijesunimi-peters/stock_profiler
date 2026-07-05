# Data model & normalization

## Why two layers

- **`RawFact`** — exactly what the SEC reported: the original tag, unit, period, filing,
  and whether it was a company *extension* tag. We keep this verbatim for auditability and
  to keep improving the mapping.
- **Canonical outputs** (`Statement` / `StatementLine` / `InsiderTransaction`) — the clean,
  consistent shape subscribers actually consume.

Never let the canonical layer lose the audit trail: every `StatementLine` carries the
`source_tag` it was mapped from and an `is_extension` flag.

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

**Known limitation:** a filing can have more than one `<reportingOwner>` (joint filers) —
only the first is parsed; multi-owner attribution isn't implemented.

**API:** `GET /v1/companies/{symbol}/insider-trades?limit=` (`api/routes.py`) wires
`fetch_insider_transactions` straight through — fetched live from SEC on every request.
Unlike `/statements`, there's no cache-aside store for insider transactions yet (no
`InsiderTransactionRepository`), so this is a heavier request: one submissions.json fetch
plus one ownership-XML fetch per matching filing, up to `limit` filings (default 50, max
200). Verified end-to-end against the real API (2026-07-05) — deliberately not treated
as a gap to close in the same pass as the endpoint itself; tracked as its own roadmap
item ("Cache-aside store for insider transactions", `docs/ROADMAP.md` Milestone 2) —
a repository the same shape as `storage/repository.py`'s.

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
No cache-aside store yet either — every call re-fetches and re-parses from SEC, same
situation as insider transactions above. Tracked as its own roadmap item ("Cache-aside
store for 13F holdings snapshots", `docs/ROADMAP.md` Milestone 2), keyed on
`(manager_cik, report_period)`.

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

**Known limitation:** a filing can have more than one `<reportingOwner>`-equivalent
concept on the 13F side too (multiple managers filing jointly, listed in the cover page's
`otherManagers2Info`) — not resolved or attributed here; the snapshot is keyed on the
filing manager only.

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

### 13D / 13G

`BeneficialOwnership` captures 5%+ ownership filings — 13D (activist) and 13G (passive) —
with owner, percent of class, shares, and event date. Event-driven, not periodic. Still a
stub in `sec/institutional.py` — deliberately: these cover pages are far less uniformly
structured than 13F's XML info table (older filings are HTML/text, not a fixed schema),
so it's scoped as its own follow-up rather than rushed alongside 13F.

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

## Analytical layer (planned, Milestone 2.5) — serialization, not a new model

The DuckDB/Parquet analytical engine (see `ARCHITECTURE.md`, stage 3b) reads a **Parquet
serialization of the existing `RawFact` and `HoldingsSnapshot` records** — it is not a new
canonical model, and it does not get its own schema section here. Batch jobs land the same
operational records to disk in columnar form so DuckDB can scan them; the shapes above stay
the single source of truth. If a batch job needs a derived output (e.g. an inverted
holder-by-security index for the 13F cross-manager view), that's a query result, not a new
canonical concept.

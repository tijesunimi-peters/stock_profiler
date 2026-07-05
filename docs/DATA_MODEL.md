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

The diff lives in `normalize/flows.py` (`diff_snapshots`) and is fully implemented; the
13F XML parsing that feeds it lives in `sec/institutional.py` (stub + plan).

### 13D / 13G

`BeneficialOwnership` captures 5%+ ownership filings — 13D (activist) and 13G (passive) —
with owner, percent of class, shares, and event date. Event-driven, not periodic.

### Limitations to surface (never hide these)

- 13F is **long positions in 13(f) securities only** — no shorts, no cash, no non-US.
- **~45-day reporting lag** after quarter-end, so the data is inherently stale.
- Amendments (`13F-HR/A`) can restate a quarter; keep both, latest filed is current.
- Answering "who holds AAPL?" requires **aggregating across all managers' 13Fs** and
  inverting the index by security — closer to the cross-company/frames problem than to a
  per-company lookup, so it's more infrastructure than just another endpoint.
- CUSIP→CIK resolution isn't a single free SEC endpoint; maintain a mapping table and
  track unresolved CUSIPs.

## Analytical layer (planned, Milestone 2.5) — serialization, not a new model

The DuckDB/Parquet analytical engine (see `ARCHITECTURE.md`, stage 3b) reads a **Parquet
serialization of the existing `RawFact` and `HoldingsSnapshot` records** — it is not a new
canonical model, and it does not get its own schema section here. Batch jobs land the same
operational records to disk in columnar form so DuckDB can scan them; the shapes above stay
the single source of truth. If a batch job needs a derived output (e.g. an inverted
holder-by-security index for the 13F cross-manager view), that's a query result, not a new
canonical concept.

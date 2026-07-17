# Roadmap — Fundamental Metrics & Peer Comparison (post-MVP)

Separate workstream, implemented **after the MVP** (Milestone 1 financials shipped). This
layer computes fundamental ratios/signals — both point-in-time and as **trends over the quarterly
statement history** — and ranks companies against industry peers. It is the analytical payoff of the
normalized data and a prerequisite for Milestone 4 cross-company screening (screening = peer-ranked
metrics + filters).

## How to use this doc (for the implementing agent)

1. Read `CLAUDE.md`, `src/secfin/normalize/mapping.py`, `src/secfin/normalize/schema.py`,
   `src/secfin/normalize/statements.py`, and `docs/DATA_MODEL.md` first. Match existing
   conventions (repository interface, cache-aside serving, analytical layer for cross-company).
2. **Build order: Phase 1 → Phase 1b → Phase 2.** Phase 1 (per-company metric engine) and Phase 1b
   (trend analysis) are concrete and ready — 1b is a small extension of 1, not a separate build.
   Phase 2 (peer comparison) is a design sketch — confirm the open questions before building.
3. The correctness rules (R1–R10) are non-negotiable. Most caveats in the metric tables are just
   pointers to one of those rules. Implement each rule once, centrally.
4. Do **not** touch the serving-path design, add price/OHLC/market data, or introduce Track 2
   free-text work. See guardrails at the bottom.

## Prerequisites (already in place)

- MVP financials: normalized `Statement`/`RawFact` history in SQLite, cache-aside routes.
- Mapping concepts required by these metrics are all present in `mapping.py` as of the latest
  update: including `accounts_receivable`, `inventory`, `debt_current`, `shares_outstanding`,
  `shares_basic`, `shares_diluted`. No metric below is blocked on a missing tag.

---

## Conventions

- **TTM (trailing twelve months)** = sum of the trailing 4 quarterly values, for **flow**
  concepts only (income statement, cash flow).
- **Point-in-time** = the period-end value, for **stock** concepts (balance sheet).
- **Average balance** = mean of the begin and end balance across a TTM window, used whenever a
  TTM flow is divided by a stock item (returns, turnovers).
- **Flow vs stock is read from the data, not hardcoded:** a `RawFact` with `period_start` and
  `period_end` is a duration (flow); a `RawFact` with `instant` set is a stock. Key TTM logic off
  this so it stays correct as concepts are added.

## Correctness rules (R1–R10) — implement centrally, reference from every metric

- **R1 — Point-in-time / filed-date correctness (MANDATORY).** Any metric as-of period *T* must
  use only facts with `filed <= T`'s public date. Respect filing lag (Q3 isn't public until the
  10-Q is filed). Restatements: `RawFact` preserves original and restated values (distinct
  `accession`/`filed`); default to latest-filed for "current" views, but keep as-originally-
  reported reachable for any future backtest. Getting this wrong silently poisons every historical
  series — it is the #1 credibility rule.
- **R2 — TTM for flows, point-in-time for stocks.** Never sum a stock concept across quarters.
  Determine flow/stock from the duration/instant flag (see Conventions).
- **R3 — Average balance** for TTM-flow-over-stock ratios (ROA, ROE, asset/inventory turnover, DSO).
- **R4 — Units.** Respect `RawFact.unit`. Share counts are `shares`; EPS is `USD/shares`. Never mix
  a share count into a USD sum. Each metric asserts its expected unit family.
- **R5 — `debt_current` undercount.** `total_debt = long_term_debt + debt_current`, but the pick-one
  selector can miss the split case (a filer reporting `LongTermDebtCurrent` and/or
  `ShortTermBorrowings` with no aggregate `DebtCurrent`). When that pattern is detected, mark the
  company's leverage metrics (ROIC, debt-to-equity, net debt) as **approximate** rather than
  reporting a silently-low number. Proper fix = a "sum multiple tags" capability in the mapping;
  track that as a separate enhancement, do not block on it.
- **R6 — dei ingestion dependency.** `shares_outstanding`'s fallback
  `EntityCommonStockSharesOutstanding` is in the **dei** taxonomy; `fetch_raw_facts` defaults to
  `us-gaap`. Confirm dei facts are ingested, or book-value-per-share coverage will be poor
  (especially multi-class filers). Run `coverage_report()` on `shares_outstanding` before exposing
  any metric that depends on it.
- **R7 — Industry N/A, never zero.** Some metrics are structurally meaningless for banks /
  insurers / REITs / software (no `LiabilitiesCurrent`, no inventory, interest as core cost).
  Return an explicit **N/A with a reason code**, never `0` or a divide error. N/A-ness is useful
  industry metadata — surface it and feed it to the peer layer (Phase 2).
- **R8 — Arithmetic guards.**
  - Effective tax rate in ROIC: clamp to a sane band (e.g. 0–35%); when `income_before_tax <= 0`
    or the ratio falls outside the band, fall back to a statutory rate.
  - Growth ratios: a negative base or a sign flip (loss→profit) makes a percentage meaningless —
    return **N/M ("not meaningful")**, not a misleading number.
  - Gross profit: fall back to `revenue - cost_of_revenue` when `gross_profit` is untagged (common).
  - Capex: `capital_expenditures` is a positive outflow — subtract as-is in FCF, do not double-negate.
  - Any near-zero denominator → N/A.
- **R9 — Series correctness (trend).** A metric *series* is not exempt from R1 — **every point must
  independently satisfy it** (each point uses only facts filed by that point's date; a 20-quarter line
  that's partly retroactive looks smooth and is fiction). Pick **one restatement basis for the whole
  series and label it**: *as-originally-reported* (each point = what was known then) or
  *as-restated / current* (latest-filed values throughout). **Never mix bases within one line.** Gaps
  (missing quarters) are gaps — do not zero-fill or interpolate unless explicitly labeled.
- **R10 — Period alignment across companies (comparison trend).** When plotting/comparing series for
  multiple companies, align on a **common calendar axis** (calendar quarter-end), **not** fiscal-period
  labels — fiscal calendars differ, so "Q3" can mean different dates. Surface as-of / filing-lag
  differences. A shorter-history company (recent IPO) has a genuinely shorter line — show that, don't
  backfill.

---

## Metric set (Phase 1)

All formulas use canonical concept names from `mapping.py`. "Rules" column references R1–R8 above;
R1/R2/R4 apply to every metric and are omitted from the column for brevity.

### Profitability

| Metric | Formula | Rules |
|---|---|---|
| Gross margin | `gross_profit / revenue` (fallback `(revenue - cost_of_revenue)/revenue`) | R8 fallback |
| Operating margin | `operating_income / revenue` | |
| Net margin | `net_income / revenue` | prefer `NetIncomeLoss` over `ProfitLoss` |
| ROA | `net_income / avg(total_assets)` | R3 |
| ROE | `net_income / avg(stockholders_equity)` | R3 |
| ROIC | `NOPAT / invested_capital`; `NOPAT = operating_income * (1 - income_tax_expense/income_before_tax)`; `invested_capital = long_term_debt + debt_current + stockholders_equity - cash_and_equivalents` | R5, R8 tax clamp |

### Growth

| Metric | Formula | Rules |
|---|---|---|
| Revenue growth (YoY) | `revenue[t] / revenue[t-4Q] - 1` | R8 sign |
| Earnings growth (YoY) | `net_income[t] / net_income[t-4Q] - 1` | R8 sign |
| OCF growth (YoY) | `cash_from_operations[t] / cash_from_operations[t-4Q] - 1` | R8 sign |
| Growth acceleration | Δ in the YoY rate, quarter over quarter | needs ≥5 quarters |

### Financial health

| Metric | Formula | Rules |
|---|---|---|
| Current ratio | `total_current_assets / total_current_liabilities` | R7 (banks) |
| Quick ratio | `(total_current_assets - inventory) / total_current_liabilities` | R7 (banks) |
| Debt-to-equity | `(long_term_debt + debt_current) / stockholders_equity` | R5 |
| Net debt | `long_term_debt + debt_current - cash_and_equivalents` | R5 |
| Interest coverage | `operating_income / interest_expense` | R7 (banks) |

### Cash flow

| Metric | Formula | Rules |
|---|---|---|
| Free cash flow (FCF) | `cash_from_operations - capital_expenditures` | R8 capex sign |
| FCF margin | `FCF / revenue` | |
| Accruals / earnings quality | `net_income - cash_from_operations` (scale ÷ `avg(total_assets)`) | R3; persistent large positive = warning |

### Efficiency

| Metric | Formula | Rules |
|---|---|---|
| Asset turnover | `revenue / avg(total_assets)` | R3 |
| Inventory turnover | `cost_of_revenue / avg(inventory)` | R3, R7 (no-inventory firms) |
| Days sales outstanding | `avg(accounts_receivable) / revenue * 365` | R3, R7 |

### Per-share

| Metric | Formula | Rules |
|---|---|---|
| EPS (basic / diluted) | reported directly (`eps_basic`, `eps_diluted`) | |
| Book value per share | `stockholders_equity / shares_outstanding` | R6 |
| FCF per share | `FCF / shares_diluted` | |
| Share-count trend | `shares_diluted` series over time (falling = buyback, rising = dilution) | |

### Backlog — unlocked by the tier-2 concepts (landed 2026-07-16, ROADMAP_DATA_DEPTH Phase 2)

Candidates only — NOT scheduled; pick up demand-driven like the concepts themselves.
Formulas use the tier-2 canonical concepts now in `mapping.py`:

| Metric | Formula | Notes |
|---|---|---|
| Payout ratio | `dividends_paid / net_income` | dividends_paid includes preferred where filers tag the aggregate (JPM) |
| Buyback yield ingredient | `share_repurchases` series | pair with share-count trend above |
| SBC / revenue | `share_based_compensation / revenue` | dilution-cost signal |
| Cash tax rate | `income_taxes_paid / income_before_tax` | vs. accrual `income_tax_expense` rate |
| Goodwill / assets | `goodwill / total_assets` | acquisition-heaviness; goodwill absent for AAPL-shaped filers (see DATA_MODEL) |

---

## Phase 1 — Metric computation engine

Proposed module: `src/secfin/normalize/metrics.py` (pure functions over the statement/fact history;
no I/O, no DB, no network — same "clients-free-of-business-logic" spirit as the rest of `normalize/`).

Design intent:
- Input: a company's `RawFact` series (from the repository) or built `Statement`s; output a typed
  `MetricValue` (value, unit, period, `as_of`/`filed` basis, and a `status` of `ok | approximate |
  na | nm` with a reason code).
- **Return a series by default.** Each metric function produces the full historical sequence of
  `MetricValue`s; the single point-in-time value is just the latest element. This is what makes trend
  (Phase 1b) nearly free — do **not** build single-value-only functions you'd have to retrofit.
- One function per metric; a TTM helper and an average-balance helper shared across them, both keyed
  off the duration/instant flag (R2/R3).
- Serving: per-company metrics can be computed on-demand over cached `RawFact`s and cached like
  statements (cache-aside, same pattern as `_facts_for_cik`). They are NOT cross-company, so they do
  not need the analytical layer.

### Phase 1 tasks

**Status: Phase 1 done** (`normalize/metrics.py`, `GET /v1/companies/{symbol}/metrics`,
`tests/test_metrics.py`). Note one design decision made during the build: the engine anchors on
`period_end` rather than the SEC's `(fy, fp)` labels — those labels stamp every restated
comparative year with the *filing's* `fy`, which would collapse distinct annual figures. See the
"Anchored on period_end" note in `docs/DATA_MODEL.md`. Series-by-default is provided at the
concept-accessor level (`available_metric_periods` + the period-keyed helpers); the point-set
endpoint is Phase 1, the trend/history endpoint is Phase 1b (below). Restatement basis: as-restated
(latest-filed), labeled on every value.

- [x] `MetricValue` result type (value, unit, period, filed/as-of basis, status + reason) --
      plus a `CompanyMetrics` container (`normalize/schema.py`).
- [x] Central implementations of R1–R8 (TTM helper with YTD-differencing + Q4 derivation,
      average-balance helper flagging `approximate` when the prior balance is missing, tax clamp,
      sign/N-M handling, N/A reason codes, debt-split detection for R5).
- [x] One function per metric in the tables above (registered in `_METRICS`).
- [x] Per-company metrics endpoint `GET /v1/companies/{symbol}/metrics?year=&period=`,
      cache-first over the existing store (same `_facts_for_cik` path as `/statements`).
- [x] dei ingestion added so `shares_outstanding`'s cover-page fallback resolves (R6) --
      `sec/companyfacts.INGEST_TAXONOMIES`; per-industry resolution map recorded in
      `docs/DATA_MODEL.md` (verified against the AAPL/WMT/JPM fixtures).
- [x] Tests (no network) against saved fixtures + synthetic RawFacts: TTM correctness
      (annual-direct, quarterly YTD-differencing, derived Q4, missing-quarter → None),
      average-balance, restatement/period-end anchoring, each N/A and N/M path, ROIC tax clamp,
      gross-profit fallback, capex sign, debt-split → approximate, dei → BVPS, endpoint 200/404.
- [x] Docs: metrics section in `docs/DATA_MODEL.md` (formulas pointer + R1–R8 + per-industry N/A
      map); this phase marked.

---

## Phase 1b — Trend analysis (build with / right after Phase 1)

Trend analysis is the **same metric engine run across the quarterly history** — not a new data source.
The full history is already in the `RawFact` store (~2009 onward, bounded per company by the XBRL
coverage floor — see DATA_MODEL.md "Coverage boundaries"; a recent IPO simply has a shorter series,
per R10), so once Phase 1 returns series by default (above), trend is mostly already in hand. **This
is fundamentals-over-time, NOT price/OHLC** — it carries none of the market-data licensing baggage of
the deferred daily-signals work.

**Tier 1 — the series itself (free with Phase 1).** The quarter-by-quarter sequence of each metric.
Powers the sparklines in the design briefs and the "compare trajectories" mode. No work beyond
returning series by default.

**Tier 2 — derived trend signals (the immediate follow-on; where trend becomes genuinely useful).**
A handful of functions over a metric's series:
- Direction/shape over a window: margin expansion vs compression; multi-quarter CAGR.
- Growth acceleration (already a metric) generalized to any metric's series.
- Streaks: consecutive quarters of positive YoY growth / margin expansion.
- Distance from a trailing high/low (e.g. % below the 8-quarter peak margin).
Each returns a `MetricValue`-style result with status — insufficient history to cover the window →
`nm`/insufficient-data, not a fabricated number.

**Tier 3 — statistical trend (DEFER).** Trend-line slope/regression ("is it significantly rising"),
regime flags (first margin decline after a long expansion), seasonality-adjusted trend. Valuable
later; not needed for a strong v1.

**Trend in comparison (yes — the higher-value use).** Trajectory side-by-side ("Northwind's margins
expanding while Cascade's have been flat six quarters") is often the real decision driver, more than
the snapshot. It feeds directly into the comparison view, governed by **R10** (align on a calendar
axis across companies) and **R9** (each series internally point-in-time correct, one basis, labeled).

**Design-brief implications (keep the three briefs consistent):**
- *Single-company metrics UI:* the per-metric sparkline is Tier 1; an expandable fuller trend chart;
  Tier-2 signals surface as small annotations ("6 quarters of margin expansion", "−1.2%/yr dilution").
- *Comparison UI (max 3):* add a **"compare trajectories"** mode — series overlaid on one calendar
  axis per metric — with R10's alignment/as-of surfacing and R9's basis label. Status flags still ride
  along: an `nm`/gap point **breaks the line honestly** (no interpolation across it).

### Phase 1b tasks

- [x] Confirm Phase 1 metric functions return the full series by default (point value = latest element).
      `compute_metric_history` (normalize/metrics.py) runs the same per-anchor engine across every
      resolvable period; the last point equals the single-value `compute_metrics` result (tested).
- [x] Tier-2 trend-signal functions (expansion/compression, CAGR, acceleration, streaks,
      distance-from-peak), each returning a `TrendSignal` with status + reason (insufficient history
      → `nm`/`na`); gaps skipped, never interpolated.
- [x] Implement **R9** (one labeled restatement basis per series — **as-restated**, latest-filed
      throughout; gaps emitted as `value=None` points, not interpolated) and **R10** (each point
      carries its calendar `period_end`; the cross-company *overlay* is the comparison-UI step, not
      this per-company endpoint).
- [x] Endpoint: per-company metric history
      `GET /v1/companies/{symbol}/metrics/{metric}/history?frequency=quarterly|annual` (public,
      cache-aside on the serving path — single-company trend is NOT cross-company). Unknown metric
      → 404; a company with no computable history → 200 with empty points/signals.
- [x] Tests (`tests/test_metric_history.py`, no network): oldest→newest series; latest point ==
      single-value `compute_metrics` (single-basis consistency); streak/CAGR/distance/acceleration/
      expansion correctness; gap handling (no interpolation across na/nm); R7 na points for a bank;
      route shape + unknown-metric 404.
- [x] Docs: extended the `docs/DATA_MODEL.md` metrics section with trend signals + R9/R10.

**Path note:** single-company trend stays on the **serving path** (it's one company's history). Only
*cross-company trend at scale* (many companies) touches the analytical layer — and that overlaps
Phase 2 / screening, so don't stand up a separate path for it.

---

## Phase 2 — Peer comparison & ranking (design sketch, build after Phase 1)

Turns per-company metrics into "how does this company stack up in its industry." This is inherently
**cross-company**, so it runs on the **analytical layer** (DuckDB; see `ARCHITECTURE.md` 3b and
ROADMAP 2.5), NOT the per-company serving path. It is a consumer of that layer alongside the 13F
inversion and Milestone 4 screening — **reuse whatever analytical mechanism 2.5 settles on**
(DuckDB-over-SQLite, or a Parquet landing — TBD, do not presuppose Parquet) and its batch query path,
rather than standing up a new one.

Approach:
1. **Peer grouping.** Group by **SIC code** (already available in the submissions metadata used for
   company profiles). SIC is coarse and dated — document its limits; treat it as a starting axis, not
   ground truth. Leave room for a better sector taxonomy later.
2. **Peer-relative ranking.** Per metric, per peer group, per period: percentile rank and z-score
   against the peer distribution. Raw values aren't comparable across industries; ranks are. Exclude
   N/A (R7) companies from a metric's distribution rather than treating N/A as a low value.
3. **Composite scores.** Optional quality/value/growth style blends of peer-relative metrics. Expose
   the **components transparently** (not a black-box number).

### Phase 2 open questions (resolve before building)

- SIC granularity: 2-, 3-, or 4-digit grouping? Minimum peer-group size before ranks are meaningful?
- Point-in-time peer sets: a historical rank must use each peer's data as of that period (R1 applies
  across the whole peer group, not just one company).
- Where composite-score weights live and whether they're user-configurable (if so, that part is
  compute-on-demand, not pre-computed).

### Phase 2 tasks

- [x] Confirm SIC grouping + min-peer-size decisions above. **Decided: 2-digit SIC grouping,
      minimum peer-group size 5** (`config.py`: `secfin_peer_sic_digits`, `secfin_peer_min_size`).
      SIC comes from `submissions.json`'s top-level `sic` — it was not previously ingested; a new
      `ingest/sic_backfill.py` populates `company_profiles` (cik → sic).
- [x] Serialize per-company metric outputs into the analytical store — `ingest/metrics_backfill.py`
      materializes Phase-1 `compute_metrics` output into a flat `metric_values` table (no new
      canonical model). No Parquet: consistent with 2.5's decision, DuckDB reads the SQLite file
      directly via `ATTACH`.
- [x] Batch job: `analytical/peer_ranks.py` (the project's first analytical-layer job) computes
      per-metric `percent_rank`→percentile and z-score within each 2-digit-SIC group per period in
      DuckDB (over `ATTACH`ed SQLite), excluding N/A rows (R7) and groups below the min size.
- [x] Write ranked results where the serving store can read them — the batch writes `metric_ranks`
      through the ordinary SQLite repo (write path stays operational, per CLAUDE.md); the
      issuer-centric **`GET /v1/companies/{symbol}/peers`** endpoint reads those precomputed rows
      (no live DuckDB).
- [x] **Peer-rankings UI** — each company-hub Fundamentals metric card shows a **peer position
      bar** (`ClearyFi.positionBar`) with "Nth pctile · k peers · SIC {group}" from `/peers`, fetched
      alongside `/metrics` (best-effort — a peers miss never breaks the grid). Percentile is
      position, not a verdict (one accent, no good/bad color — §9.2/§10); shown only where a rank
      exists. Verified headless.
- [x] **Peer distribution** — sibling batch job `analytical/peer_ranks.py` -> `peer_distribution.py`
      computes a five-number summary (min/p25/median/p75/max) per (peer group, period, metric),
      same DuckDB/`ATTACH` mechanism, same N/A-exclusion and min-group-size rules. Written to a new
      `metric_distributions` table (keyed by peer group, not by company -- the distribution is
      shared by the whole group) via `SQLiteMetricDistributionRepository`. Served by
      **`GET /v1/companies/{symbol}/peers/{metric}/distribution`** (public router), a point lookup
      plus the company's own `metric_values` row -- no live DuckDB. `distribution: None` is a valid
      response (insufficient peers), not an error. See `docs/DATA_MODEL.md`'s "Peer distribution"
      section.
- [ ] Feed peer-ranked metrics into Milestone 4 screening (shared query path, not a new one).

---

## Guardrails / do-nots

- Point-in-time correctness (R1) is mandatory in every historical calculation — not optional, not
  "later."
- N/A and N-M are first-class results (R7, R8). Never emit `0`, a raw divide error, or a misleading
  percentage in their place.
- Per-company metrics stay on the serving path (cache-aside); peer/cross-company work stays on the
  analytical layer. DuckDB never sits behind a live API request.
- Do NOT add price/OHLC or any market data here — this workstream is fundamentals-only, **including
  trend** (trend = fundamentals over time, not price). Daily price signals are a separate, later effort.
- A metric **series must be point-in-time correct at every point** (R9), on **one** labeled
  restatement basis; gaps are gaps — never interpolated or zero-filled.
- Multi-company trend aligns on a **calendar axis** (R10); never compare series across mismatched
  as-of dates without surfacing it.
- Do NOT start Track 2 (free-text) or add new canonical models for Phase 2 (the analytical
  serialization is just existing records in another form, whatever the mechanism).
- Prefer extending `mapping.py` (and the future sum-multiple-tags capability) over hard-coding
  company-specific fixes in metric functions.

## Verify, don't assume

- Confirm dei facts are actually ingested before relying on R6's fallback — as of the last check the
  ingest path defaults to `us-gaap` (see DATA_MODEL.md's shares-outstanding note), so today
  book-value-per-share leans on the us-gaap `CommonStockSharesOutstanding` alone, and the dei fallback
  is effectively dead until ingest is widened.
- Re-run `coverage_report()` on real filings for any concept a metric leans on; the `⚠️` rows above
  are expectations until backed by fixture data.
- Pin and confirm DuckDB concurrency semantics for the Phase 2 batch path (same note as ROADMAP 2.5)
  — and inherit 2.5's analytical-mechanism decision (Parquet vs DuckDB-over-SQLite) rather than
  making a separate one for metrics.
- Decide the **default series restatement basis** (as-originally-reported vs as-restated) as a product
  choice **before** building Phase 1b — it changes what every trend line means (R9).

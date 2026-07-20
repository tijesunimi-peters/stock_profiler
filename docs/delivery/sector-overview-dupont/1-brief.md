# 1 — Product Brief: Sector Performance Overview (dashboard home) + DuPont

**Task slug:** `sector-overview-dupont`
**Source:** `docs/ROADMAP_SECTOR_ANALYTICS.md` → *Deliverable 1* (scoping locked 2026-07-20)
**Stage:** Product Manager (1 of 4) → Principal Architect
**Scope gate:** **PASS** — squarely Track 1 (structured income/balance/cash-flow facts,
per-SIC aggregation), no free text, no LLM, no market-price data, no new base dependency.
DuckDB-over-SQLite batch aggregation is an already-established analytical pattern
(`analytical/peer_ranks.py`, `peer_distribution.py`), reused here per guardrails 6/7.

---

## Problem / user

The product has 26 materialized fundamental metrics and a **company-anchored** peer surface
(`/companies/{symbol}/peers`, `/companies/{symbol}/peers/{metric}/distribution`) — but there is
**no sector-first entry point**. A user who wants to start from "how do industries compare" rather
than "look up one ticker" has nowhere to land. The SIC-group aggregation machinery already exists
(`peer_ranks.py` produces 262K rows over 70 SIC-2 groups; 8,711 companies with SIC), so the
industry-level view is the natural, low-cost payoff of investment already shipped — it just has no
surface.

**Who it serves:** analysts/developers evaluating the API who want an at-a-glance, cross-industry
performance overview, and a flagship analytic (DuPont: ROE decomposed into margin × turnover ×
leverage) that shows the data is *clean and decomposable*, not just a number dump.

**How we'd know it's solved:** a sector overview page exists as a first-class navigation
destination; it ranks all qualifying SIC-2 groups by ROE and its three DuPont drivers; each sector
expands to an identity-reconciled DuPont tree and a performance trend over time; every figure
carries the honesty caveats and no figure is fabricated or mislabeled.

---

## Operator decisions (locked this stage)

1. **Placement — new destination, not a replacement.** The overview is a **new page reachable from
   a new "Home"/Sectors entry in the shared app-shell sidebar** (`script.js` `GROUPS`, the sidebar
   used by the company hub / compare / screen). The existing marketing landing page at `/` is
   **left untouched.** (Operator: "a new /home menu on the sidebar.")
2. **Period — a trend over time, not a single snapshot.** The per-sector view includes a
   **performance trend chart with `1Y` / `5Y` / `All-time` range toggles.** So the sector
   aggregate is materialized as a **multi-period time series**, not one latest-FY snapshot.
   (Operator: "there should be a trend chart with 1Y, 5Y, All time options.")

---

## Scope (smallest slice that delivers the value)

### Data / metric
- **New canonical metric `equity_multiplier`** (Assets / Equity) — the only missing DuPont leg;
  facts already mapped (`total_assets`, `stockholders_equity`). Its **basis must match the existing
  `roe` and `asset_turnover`** so the *per-company* DuPont identity `net_margin × asset_turnover ×
  equity_multiplier = roe` holds exactly (architect to pin the averaging basis; see Risks).
  Doc updates: `docs/ROADMAP_METRICS.md` and `docs/DATA_MODEL.md`.

### Batch aggregation (analytical, offline — never the live request path)
- **New batch job** (sibling of `peer_ranks.py` / `peer_distribution.py`; DuckDB `ATTACH … (TYPE
  sqlite)` over the live SQLite file, results written back through an ordinary SQLite repository)
  that materializes, **per `(SIC group, period)`**, the **asset-weighted DuPont aggregate**:

  ```
  sector_net_margin       = ΣNI / ΣRev
  sector_asset_turnover   = ΣRev / ΣAssets
  sector_equity_multiplier= ΣAssets / ΣEquity
  sector_roe (aggregate)  = ΣNI / ΣEquity   ( == product of the three, by construction )
  ```

  materialized across **all available periods** (to feed the trend). New store: repository +
  SQLite table (mirroring `metric_ranks` / `metric_distributions`).

### API (read the materialized table cache-aside; no live aggregation)
- **Sector list** endpoint — the qualifying SIC-2 groups for the overview grid at the latest common
  period (ROE + the three drivers, plus `peer_count`), each carrying its caveats.
- **Per-sector series** endpoint — the multi-period DuPont time series for one sector (feeds the
  trend chart; range filtering is a UI concern over the returned series or a `range` param —
  architect's call).

### UI (new app-shell page)
- New static page in the shared app shell (`<body class="app" data-shell="…">`, empty `#appSide`/
  `#appTopbar` mounts, rendered by `script.js`), new route in `main.py`, and a **new sidebar entry**
  in `script.js`'s `GROUPS`.
- **Overview grid** of all qualifying sectors: ROE (aggregate) + the three DuPont drivers,
  **sortable/rankable** by any column.
- **Expandable per sector** → **DuPont decomposition tree** (ROE = margin × turnover × leverage,
  identity shown) **+ the trend chart** with `1Y` / `5Y` / `All-time` toggles.
- Theme-aware, CSP-safe (vendored assets only — Observable Plot is already vendored), honesty
  caveats visibly carried, **no value ever rendered as `0` when it is N/A**.

---

## Acceptance criteria (what QA will verify)

**Metric**
- **AC-1** `equity_multiplier` (Assets/Equity) is a registered metric returning a `MetricValue`
  with status/reason like the others; N/A (never `0`) when equity is missing/zero-or-near-zero
  (mirror `debt_to_equity`'s guard).
- **AC-2** For a company where all legs are `ok`, `net_margin × asset_turnover × equity_multiplier`
  equals that company's `roe` to within rounding (identity holds per-company — proves the bases
  are consistent). Verified on ≥2 real companies (e.g. AAPL, WMT) on the hydrated volume.
- **AC-3** `docs/ROADMAP_METRICS.md` and `docs/DATA_MODEL.md` document `equity_multiplier`
  (definition, basis, and the DuPont identity).

**Aggregation honesty (the roadmap's flagged fixes)**
- **AC-4** The sector DuPont figure is the **asset-weighted aggregate** `ΣNI/ΣRev × ΣRev/ΣAssets ×
  ΣAssets/ΣEquity`, **not** a median/mean of per-company ratios. The materialized
  `sector_roe` equals the product of the three materialized drivers to within rounding (identity
  preserved by construction).
- **AC-5** It is **labeled explicitly "sector aggregate — not a median"** everywhere it is shown.
- **AC-6** A company enters a sector-period aggregate **only if it contributes to every sum it
  needs** (NI, Revenue, Assets, Equity all present and `ok`/`approximate` for that period) — so the
  three sums share one company set and the identity cannot be broken by mismatched membership.
  A company N/A on any required fact is **excluded, never counted as 0** (R7).
- **AC-7** Only SIC groups meeting the **minimum group size** (`settings.secfin_peer_min_size`,
  same threshold the peer jobs use) appear; smaller groups are dropped, not shown as sparse/zero.

**Caveats & no-fabrication**
- **AC-8** Every sector view carries the SIC caveats, reusing the `_PEER_CAVEATS` vocabulary:
  SIC is coarse/dated; groups below min size dropped; **N/A excluded, never counted as 0**;
  ~quarter reporting lag; restatements (latest `filed` wins); **and** the "sector aggregate, not a
  median" label from AC-5.
- **AC-9** **No missing value renders as `0`** anywhere on the page — a missing sector, driver, or
  trend point shows an explicit N/A / empty state with a reason, not a zero bar or zero cell.
- **AC-10** **No alpha, timing, market-price, or "beats the market" claim** appears (the pipeline
  never ingested price data — position as a native strength, not a subtraction).

**Trend**
- **AC-11** The per-sector view shows a performance trend with working **`1Y` / `5Y` / `All-time`**
  range toggles; the plotted series is the materialized aggregate over time (not re-aggregated live
  in the browser from raw facts).

**Architecture / compliance**
- **AC-12** The cross-company aggregation runs **only** in the offline batch job (DuckDB), **never**
  on a live request handler; the API serves cache-aside from the materialized table (guardrails
  6/7). No raw SQL in the API layer; DB stays behind a repository interface (guardrail 5).
- **AC-13** `pytest` green (new tests cover: `equity_multiplier`, the per-company identity, the
  aggregate identity + shared-membership rule, min-size drop, N/A-exclusion); Docker e2e headless
  render check green with the new page reachable and rendering on real data (hydrated volume).

---

## Out of scope (do not build — deferred / flag)

- **The other four sector models** (roadmap #2 OCF-vs-NI scatter, #3 box-and-whisker spreads, #4
  100% common-size DNA, #5 DIO/DSO/DPO lifecycle) — deferred; they reuse this deliverable's sector
  page + aggregation scaffold. Do **not** add `dio`/`dpo` metrics or run `peer_distribution.py` here.
- **Replacing or restyling the marketing `/` landing page** — untouched (operator decision 1).
- **Any market-price / valuation / timing / alpha content**, and any Track-2 free-text or LLM
  summarization — if the design drifts there, STOP and flag.
- **Cross-company screening query language** beyond what's already shipped (M4) — not part of this.

---

## Risks / open decisions (for the Principal Architect)

1. **`equity_multiplier` averaging basis** — must match `roe` and `asset_turnover` (which use a
   TTM-flow-over-average-balance basis) so the *per-company* identity (AC-2) holds exactly. Pin the
   basis and confirm on real data before the aggregate is trusted.
2. **Sector-aggregate averaging basis** — decide whether the sums use point-in-time (period-end)
   or average balances for ΣAssets/ΣEquity, and keep it internally consistent so `sector_roe ==
   product of drivers` (AC-4). Point-in-time is simpler and still identity-preserving; document
   whichever is chosen.
3. **Trend granularity** — FY-only vs quarterly points for the `1Y`/`5Y`/`All` ranges. Quarterly
   (TTM-based) gives a richer trend but larger materialization; FY is simpler. Architect's call —
   just make the range labels honest for whatever granularity ships.
4. **SIC grouping level** — roadmap says SIC-2 (70 groups); `peer_ranks.py` uses
   `settings.secfin_peer_sic_digits`. Reconcile (reuse the existing setting) and state it.
5. **Sector display names** — SIC-2 codes are opaque; decide whether to show a human-readable
   SIC-division label (needs a small static code→name map) or the bare code. Showing the bare code
   is honest but poor UX; a code→name map is low-cost. Architect to decide; if a map is added it's
   a static lookup, not new ingested data.
6. **Route/label naming** — operator said "Home"; `/` is already the marketing landing, so the new
   data-page route needs a distinct path (e.g. `/sectors`) even if the sidebar label reads as the
   overview home. Trivial — architect picks the path.
7. **Verification substrate** — build/verify **requires a hydrated Docker volume** (real ~8.7K-company
   data lives in the 7.2G backup `data/backups/secfin-latest.db`; `data/secfin.db` is a 100K stub).
   Host has no local pip/venv — all build/test via Docker. Batch job needs the `analytical` extra.

---

## Handoff → Principal Architect

Design against the acceptance criteria above. Key shape: **new metric → new offline batch
aggregation (DuckDB-over-SQLite, asset-weighted, identity-preserving, shared-membership) → new
materialized table + repository → two read-only cache-aside endpoints → new app-shell page with a
sortable sector grid, expandable DuPont tree, and a 1Y/5Y/All trend chart, plus a new sidebar
entry.** Resolve decisions 1–6; keep the aggregation strictly off the live request path (guardrails
6/7) and the DB behind a repository (guardrail 5). Full-stack: **backend first** (metric + batch +
endpoints + pytest), then **frontend** (page + trend + e2e) on the same branch.

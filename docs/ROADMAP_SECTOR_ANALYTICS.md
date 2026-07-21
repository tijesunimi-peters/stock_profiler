# ROADMAP — Sector Analytics (pure-fundamentals industry overviews)

Tracking doc for a proposed set of **sector/industry-aggregate** visualizations built strictly
from structured financial-statement data (income / balance / cash-flow) — no market price data.
Squarely Track 1. This file is the scoping + status record; the active build is driven through
`/deliver` (see `docs/delivery/`).

Status: **scoping locked for Deliverable 1** (2026-07-20). Not yet handed to `/deliver`.

---

## Why this fits (grounded in the codebase, 2026-07-20)

All five models are the natural payoff of the Metrics Phase 2 + M4 investment already shipped.
What exists today:

- **26 materialized metrics** (`normalize/metrics.py`), incl. `net_margin`, `roe`, `roa`,
  `asset_turnover`, `debt_to_equity`, `current_ratio`, `quick_ratio`, `interest_coverage`,
  `inventory_turnover`, `dso`, `ocf_growth_yoy`, `earnings_growth_yoy`, `accruals`, `fcf`,
  `fcf_margin`.
- **SIC-group aggregation already running** (the correct batch/analytical pattern — never the
  live path, per guardrails 6/7):
  - `analytical/peer_ranks.py` → `metric_ranks` (**262K rows**): per-(SIC group, period, metric)
    percentile + z-score.
  - `analytical/peer_distribution.py` → `metric_distributions` (**currently 0 rows** — batch not
    yet run): min / p25 / median / p75 / max per group.
- **Coverage is sufficient**: 8,711 companies with SIC across **70 SIC-2 groups**, 1.74M
  `metric_values` — measured in the latest backup.
- **UI already has** `commonSizeChart` (single-company) and percentile peer bars
  (`static/company.js`).
- **API**: `/companies/{symbol}/peers` and `/companies/{symbol}/peers/{metric}/distribution` —
  but **company-anchored**; there is **no sector-first entry point** today.

### Infra caveat (read before building/verifying)

`data/secfin.db` is a **100K stub**. The real data (~8.7K companies) lives in the **7.2G backup**
(`data/backups/secfin-latest.db`). Any build/verify needs a **hydrated Docker volume** (this host
has no local pip/venv — use Docker per `docs/DEVELOPMENT.md`). The host has no `sqlite3` CLI;
inspect via Python's `sqlite3` with `file:...?immutable=1`.

---

## The five proposed models

| # | Model | State (2026-07-20) | Work needed |
|---|-------|--------------------|-------------|
| 1 | DuPont decomposition tree (ROE → margin × turnover × leverage) | Metrics exist except **`equity_multiplier`** (facts mapped) | Add metric; **median→aggregate fix**; sector-aggregate batch; tree viz |
| 2 | OCF-growth vs NI-growth scatter, bubble = assets/capex | Growth + `accruals` metrics exist; assets/capex mapped | Sector-aggregate batch; scatter viz |
| 3 | Box-and-whisker metric spreads (profitability + liquidity/solvency) | **SHIPPED** (2026-07-20, `sector-box-whisker-spreads`) | Done: 2 cache-aside endpoints over `metric_distributions` + `boxWhiskerChart` on `/sectors`. See note below. |
| 4 | 100% common-size structural DNA | `commonSizeChart` exists (single-co) | Sector-aggregate path; decide CapEx (cash-flow) mixing; page |
| 5 | DIO/DSO/DPO asset-lifecycle multi-line trend | **SHIPPED** (2026-07-21, `sector-lifecycle-trends`) | Done: `dio`/`dpo`/`ccc` metrics + `sector_lifecycle` aggregate (ratio-of-sums) + `GET /v1/sectors/{group}/lifecycle` + multi-line trend on `/sectors`. Alpha claim cut. See note below. |

Shared prerequisite for all five: a **sector-first surface** (index + per-sector page). None exists
today.

---

## Honesty / correctness flags (must be fixed before building)

Per CLAUDE.md's data-honesty guardrails:

1. **DuPont on a sector *median* is mathematically invalid.**
   `median(ROE) ≠ median(margin) × median(turnover) × median(leverage)` — the identity only holds
   per-company. **Fix:** asset-weighted aggregate `ΣNI/ΣRev × ΣRev/ΣAssets × ΣAssets/ΣEquity`
   (identity preserved), labelled explicitly **"sector aggregate, not a median."**
2. **#5's "weeks before management publicly addresses it" is false — CUT it.** The DIO number *is*
   management's own filed figure, carrying the standard ~quarter reporting lag. No alpha/timing
   claim survives the honesty posture (`_PEER_CAVEATS` deliberately avoids exactly this).
3. **#2's "paper profit" / "cash trapped" language overreaches** — it's a signal (we have an
   `accruals` metric), not a diagnosis. Keep as a flagged signal with caveats.
4. **"Strip away market price" is a strawman** — this pipeline never ingested price data, so it's a
   native strength, not a deliberate subtraction. Position accordingly.
5. **Carry the existing SIC caveats** on every view: SIC grouping is coarse/dated; groups below
   min size are dropped; **N/A companies excluded, never counted as 0**; ~quarter reporting lag;
   restatements (latest `filed` wins). Reuse the `_PEER_CAVEATS` vocabulary.

---

## Decisions (locked 2026-07-20)

- **Lead deliverable** = a **sector-first dashboard HOME page** — an at-a-glance performance
  overview across all industries — **combined with the DuPont decomposition (#1)** as its flagship
  analytic. (User decision: the sector page is the home/overview surface, and DuPont rides on it.)
- **Aggregation method = both, per-model:** asset-weighted **aggregate** for DuPont (#1) and
  common-size (#4); **distribution** (min/p25/median/p75/max) for box-whisker (#3). Chosen per
  model as appropriate.

---

## Deliverable 1 — Sector Performance Overview (dashboard home) + DuPont (#1)

**What it is:** a new sector-first dashboard home page giving a performance overview across all
industries (the ~70 SIC-2 groups meeting min size), with DuPont decomposition as the flagship
analytic.

**Scope:**
- **New metric** `equity_multiplier` (Assets/Equity) — the only missing DuPont leg; facts already
  mapped (`total_assets`, `stockholders_equity`). Doc updates: `ROADMAP_METRICS.md`,
  `DATA_MODEL.md`.
- **New batch aggregation** per `(SIC group, period)` → materialized table, following the
  `peer_ranks.py` / `peer_distribution.py` pattern (DuckDB-over-SQLite, offline, **never the live
  request path** — guardrails 6/7). Served cache-aside from the materialized table.
- **DuPont as asset-weighted aggregate** (`ΣNI/ΣRev × ΣRev/ΣAssets × ΣAssets/ΣEquity`),
  identity-preserving, **labelled "sector aggregate, not median."**
- **New API:** sector list + per-sector aggregate (read the materialized table; no live
  aggregation).
- **UI:** dashboard home = overview grid of all sectors (ROE + the three drivers, ranked/sortable),
  each expandable to the DuPont tree. Theme-aware, CSP-safe, honesty caveats carried (SIC
  coarse/dated, min-group-size drop, **N/A ≠ 0**, ~quarter lag, aggregate-not-median). No
  alpha/timing claims. Show only groups meeting the min-size threshold.

**Verify:** hydrated Docker volume required (real data in the 7.2G backup). Docker e2e headless
render check + `pytest` green.

### Open questions for the architect (stage 2)
- Does the dashboard **replace** the current index page or **sit alongside** it?
- Sector overview defaults to **latest FY**, or offers a **period selector**?

---

## Deferred (reuse Deliverable 1's sector page + aggregation scaffold)

- **#3** box-and-whisker spreads — **SHIPPED** 2026-07-20 (`sector-box-whisker-spreads`).
  `/v1/sectors/spreads` (cross-sector, a box per SIC group for one metric) + `/v1/sectors/{group}/
  spreads` (per-sector, a box per metric) read `metric_distributions` cache-aside; the `/sectors`
  page gained a metric-selectable cross-sector box chart + a per-sector small-multiple in the expand
  detail. **Coverage caveat (found on the hydrated volume):** the liquidity/solvency metrics
  (`current_ratio`/`quick_ratio`/`debt_to_equity`/`interest_coverage`) are near-empty market-wide —
  the ingest has headline concepts (Assets/Equity/NetIncome, ~8.6K ciks) but the granular ones
  (AssetsCurrent 68 ciks, LongTermDebt 34, InterestExpense 49) for only tens. Per operator decision
  the spread selector was **broadened** to the broadly-covered profitability/efficiency metrics
  (net_margin/roe/roa/asset_turnover/rev+earnings growth — populated ~60 sectors) plus the L/S
  metrics (offered, honest empties that fill in as coverage improves). **Follow-up (separate task):
  granular balance-sheet/income concept coverage** — why current-asset/liability/debt/operating-
  income concepts are near-absent in the whole-market ingest, and a re-ingest to light up the L/S
  spreads.
  - **RESOLVED** 2026-07-21 (`granular-concept-coverage`). **Root cause was operational, not a
    parse bug:** the flatten path (`sec/companyfacts.py`) captures every tag, but the **per-company
    bulk companyfacts backfill** (`ingest/backfill.py`, `source=bulk_companyfacts`) — the only path
    that ingests the full ~500-tag payload per company — **had never been run** on the volume (0
    `bulk_companyfacts` checkpoints). The market-wide breadth came solely from `frames_backfill`,
    whose `SCREENABLE_CONCEPTS` is 6 headline concepts (revenue/net_income/total_assets/
    total_liabilities/stockholders_equity/cash), so granular concepts stayed at tens of CIKs.
    **Fix (operator chose the full backfill over a lighter frames-concept extension):** ran
    `secfin.ingest.backfill` whole-market (20,072 companies, 121M facts), then re-ran
    `metrics_backfill → peer_ranks → peer_distribution`. The `raw_facts` UNIQUE-key COALESCE upsert
    (added 2026-07-16) merged companyfacts fiscal metadata into the existing frames rows
    non-destructively (screening `frame` values preserved). **Coverage lift (distinct CIKs):**
    AssetsCurrent 68→13,177, LiabilitiesCurrent 67→13,138, LongTermDebt 34→7,200, InventoryNet
    38→6,943, InterestExpense 49→10,954, OperatingIncomeLoss 64→13,097. The four L/S spread metrics
    now return boxes at parity with `net_margin` (current_ratio/quick_ratio 19, debt_to_equity 11,
    interest_coverage 12 — up from 0–1). **Note:** a fresh volume seeded only by frames/incremental
    is headline-concepts-only; **full market coverage requires the bulk companyfacts backfill.**
    Verified on a scratch hydrated copy; the **prod-volume re-ingest is a deferred DevOps step**
    (size the prod volume for the larger `raw_facts` first — see below).
- **#4** 100% common-size DNA — sector-aggregate path; resolve CapEx (cash-flow) mixing.
- **#2** OCF-vs-NI scatter — sector-aggregate; bubble viz.
- **#5** DIO/DSO/DPO lifecycle — **SHIPPED** 2026-07-21 (`sector-lifecycle-trends`). Added canonical
  metrics `dio` (`avg(inventory)/cost_of_revenue × 365`) and `dpo` (`avg(accounts_payable)/
  cost_of_revenue × 365`) mirroring `dso` (same period-end-anchored TTM/as-of, status+reason,
  `approximate` on a period-end-balance fallback), plus the derived **CCC = DIO + DSO − DPO** with
  strict **N/A propagation** (any leg N/A ⇒ CCC N/A, never a leg-as-0). No new raw concept (inputs
  already mapped). Sector aggregate `sector_lifecycle` is a **ratio of summed dollars** (ΣInventory/
  ΣCostOfRevenue × 365, etc.), per `(SIC group, period)`, all-five-legs shared membership so CCC is
  exact — materialized offline (`ingest/lifecycle_backfill.py` → `analytical/sector_lifecycle.py`,
  DuckDB-over-SQLite, **never the live path**) and served cache-aside by `GET /v1/sectors/{group}/
  lifecycle` (FY-only series). The `/sectors` expand-detail gained a **multi-line lifecycle trend**
  (DIO/DSO/DPO/CCC over the FY series), lines break on coverage gaps, `approximate` points flagged.
  **Alpha/timing claim CUT** — framed as descriptive working-capital structure, standard sector
  caveats carried, N/A never rendered as 0. Verified on a scratch re-ingested copy; the **prod-volume
  re-ingest + the two new batches (`lifecycle_backfill`, `sector_lifecycle`) are a deferred DevOps
  step** (the live site stays sparse until then).

---

## Source proposal (as received, for reference)

Five "pure fundamental overview" models: (1) normalized DuPont decomposition trees; (2) multi-
industry OCF scatter matrices; (3) box-and-whisker liquidity/solvency spreads; (4) 100% stacked
common-size bars ("structural DNA"); (5) multi-line asset-lifecycle clustered trends (DIO/DSO/DPO).
Full text and its citations are preserved in the originating conversation; the analytical claims
were reviewed and reconciled against the honesty guardrails above.

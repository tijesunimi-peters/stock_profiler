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
| 3 | Box-and-whisker liquidity/solvency spreads | **~80% built**: API + `peer_distribution.py` exist; `metric_distributions` **empty** | Run batch; box/strip viz; reuse sector page |
| 4 | 100% common-size structural DNA | `commonSizeChart` exists (single-co) | Sector-aggregate path; decide CapEx (cash-flow) mixing; page |
| 5 | DIO/DSO/DPO asset-lifecycle multi-line trend | `dso` + `inventory_turnover` exist; **`dio`, `dpo` missing** (facts mapped) | Add 2 metrics; multi-line sector time-series; **cut alpha claim** |

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

- **#3** box-and-whisker spreads — run `peer_distribution.py`; box/strip viz. (~80% built already.)
- **#4** 100% common-size DNA — sector-aggregate path; resolve CapEx (cash-flow) mixing.
- **#2** OCF-vs-NI scatter — sector-aggregate; bubble viz.
- **#5** DIO/DSO/DPO lifecycle — add `dio` + `dpo` metrics; multi-line time-series; **cut the alpha
  claim**.

---

## Source proposal (as received, for reference)

Five "pure fundamental overview" models: (1) normalized DuPont decomposition trees; (2) multi-
industry OCF scatter matrices; (3) box-and-whisker liquidity/solvency spreads; (4) 100% stacked
common-size bars ("structural DNA"); (5) multi-line asset-lifecycle clustered trends (DIO/DSO/DPO).
Full text and its citations are preserved in the originating conversation; the analytical claims
were reviewed and reconciled against the honesty guardrails above.

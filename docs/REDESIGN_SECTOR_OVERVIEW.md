# Redesign plan — Sector overview (Altitude 1)

Redesign of the `/sectors` page to adopt the `docs/layout_guides/` design language
(specifically `00-global-conventions.md` + `01-sector-overview.md`), reconciled against
Track-1 scope and the data actually materialized today.

Status: **scoping locked (2026-07-21).** **Phase 0 backend built** (`sector-theme-scores` branch,
delivered via `/deliver` → `docs/delivery/sector-theme-scores/`): `sector_theme_scores` +
`sector_theme_components` tables, the pure-Python `analytical/sector_theme_scores.py` batch, and the
cache-aside `GET /v1/sectors/theme-scores` endpoint. Verified on the re-ingested scratch volume (all
five themes populate; sector 60 correctly omits operating-efficiency — banks have no inventory/COGS;
score reproduces by hand). **Prod batch run = deferred DevOps.** Phases 1–3 (the UI) are the next
tasks.

## Decisions locked (operator, 2026-07-21)

- **Composite scoring is defined and signed off BEFORE the page is built** (`00 §9` forbids
  inventing a scoring function silently). Phase 0 is the gate.
- **Full single-sector information architecture** — a persistent sector pill-row selector as
  the spine, one sector on screen at a time (`00 §11`). This **replaces** today's all-sectors
  sortable DuPont table.
- **Four altitudes hang off a "Sectors" submenu** in the existing left sidebar
  (`static/script.js` `GROUPS`), not four top-level items.
- Scoring specifics (operator accepted the recommendations):
  1. **Score the 5 backable themes now; defer Accounting quality + Structure & activity**
     (render as "not yet scored" tiles). Do not block the hero on Track-2 work.
  2. **Equal-weight constituents** as the labeled shipping default (tunable later).
  3. **Normalization = z-score of per-sector medians** across qualifying sectors (not
     percentile-average).
  4. Sector selector for ~70 SIC-2 groups = **searchable combobox + a most-recently-viewed
     pill cluster** (the pill row alone wraps past two rows — `00 §11.1` said to decide this,
     not silently truncate).

## Theme → materialized-metric mapping (the basis for scoring)

30 metrics are materialized (`normalize/metrics.py` `_METRICS`). Mapped onto the guide's
seven themes:

| Theme | Constituents available (materialized) | Status |
|---|---|---|
| Profitability & returns | gross/operating/net margin, roa, roe, roic | full |
| Growth | revenue_growth_yoy, earnings_growth_yoy, ocf_growth_yoy, growth_acceleration | full (no 3-yr CAGR/dispersion metric; derivable from series) |
| Financial health | debt_to_equity, net_debt, interest_coverage, current_ratio, quick_ratio | backable but **granular ratios coverage-sparse** market-wide |
| Cash & investment | fcf, fcf_margin, ocf_growth_yoy | partial — **no capex-intensity / R&D-intensity metric** yet |
| Operating efficiency | inventory_turnover, dso, dio, dpo, ccc, asset_turnover | full (no revenue/employee — needs headcount) |
| **Accounting quality** | accruals only | **deferred** — material-weakness / late-filing = Track-2/filing-metadata (not built); restatement rate derivable but unbuilt |
| **Structure & activity** | — | **deferred** — S-1/Form 15/8-K/insider/institutional not sector-aggregated; events Track-2-adjacent |

## Phase 0 (gating) — Composite scoring model

**Scoring method:**
- Per sector, take the sector **median** of each constituent (already in `metric_distributions`),
  orient by the metric's `higherIsBetter` flag (`00 §5`), **z-score that median across all
  qualifying sectors** for the metric+period, average the constituents' oriented z-scores
  (equal weight, labeled default), map to 0–100.
- Raw material exists: `metric_distributions` (five-number summaries) and `metric_ranks`
  (per-group percentile + z-score, ~262K rows).
- **Rank badge (`00 §3a`):** sector's rank on that theme z-average vs all sectors — a
  cross-sector rank computed in the batch.
- **Trend delta:** current-period composite minus prior FY composite, same method.
- **Decomposition (`00 §9a`, mandatory):** each constituent's oriented z-score contribution,
  surfaced when the score is clicked.

**New backend:**
- A `sector_theme_scores` materialized table.
- A DuckDB-over-SQLite batch (mirrors `analytical/peer_ranks.py` / `peer_distribution.py`,
  **never the live request path** — guardrails 6/7).
- A cache-aside `GET /v1/sectors/theme-scores` endpoint reading the materialized table.

**Honesty posture:** carry the existing `_PEER_CAVEATS` / `_SECTOR_CAVEATS` vocabulary; SIC
coarse/dated; below-min groups dropped; **N/A excluded, never counted as 0**; scores labeled
with the equal-weight + z-score-of-medians normalization in one line of `text.muted`; the two
deferred themes render as explicit "not yet scored" tiles, never as 0 or a fabricated number.

## Phase 1 — Single-sector page shell + sidebar submenu

**Almost entirely frontend** (`static/`): every endpoint it needs already exists
(`/sectors`, `/sectors/{group}`, `/sectors/{group}/spreads`, `/sectors/{group}/lifecycle`). The
Phase 0 `/sectors/theme-scores` endpoint is **not** consumed yet (that's Phase 2).

**Locked decisions (operator, 2026-07-21):**
- **Body = re-home the existing analytics.** Replace the all-sectors table with the guide's spine,
  and drive **today's per-sector detail** (DuPont tree, ROE trend, per-sector spreads, lifecycle)
  off the selected sector instead of table-row expansion. Nothing regresses; the page is shippable
  and testable on its own. Phase 2 (scorecard hero) and Phase 3 (peer strip / biggest-shifts /
  drill-down tiles) layer on top.
- **Sidebar submenu = Overview only, rest deferred.** Convert the flat `Sectors` link
  (`static/script.js` `GROUPS`) into an **expandable parent** whose only child for now is
  **Overview → /sectors**. Company / Compare / Qualitative are added as children **only when** their
  dedicated sector-altitude views are built (later phases). The existing top-level Company hub /
  Compare / Screen entries are **left untouched** (no move, no duplication) this phase.

**Scope:**
- **Searchable sector selector** — combobox + a most-recently-viewed pill cluster (the ~70-sector
  decision). Selecting a sector re-derives the page and updates `?group=` + `localStorage`.
- **Default sector on load:** largest by `peer_count` on first visit; `?group=` URL param overrides;
  last-viewed persisted in `localStorage` (reuse app.js's guarded try/catch pattern).
- **Shared header** (`00 §6`): breadcrumb, peer-count pill, as-of FY. **Filing-coverage % and
  same-store logic don't exist yet** — ship without them, don't fake them.
- **Sidebar submenu affordance** — a new expandable-group mechanism (none exists today; extends the
  token-driven `side-group` / `side-link` CSS). Overview marked `current` on `/sectors`.
- **Cross-page state** (`00 §7`, `§11.2`): selected sector + as-of period carried via URL params
  (mirroring `compare.js`) + `localStorage` for last-viewed.
- **Acknowledged trade-off:** the single-sector model removes today's at-a-glance cross-sector
  DuPont table; the **peer strip** (Phase 3) is the intended substitute (one theme at a time). No
  cross-sector overview exists between the Phase 1 ship and Phase 3.

**Verify:** Docker e2e headless render check (real UI change → screenshots, eyeballed) + `pytest`.

## Phase 2 — Scorecard hero + decomposition

Seven theme tiles (5 live, 2 "not yet scored"), each with score, favorability-colored trend
chip, cross-sector percentile line, and rank badge; clicking the score opens the `00 §9a`
decomposition. Depends on Phase 0 sign-off.

## Phase 3 — Peer strip · biggest-shifts · theme drill-down

- **Peer strip** (`00 §3b`) re-points to the expanded theme — from the theme-scores endpoint.
- **Biggest-shifts band** (`00 §12`) — standardized deltas off the per-sector FY series
  (`/sectors/{group}`).
- **Theme drill-down** — the median + IQR **tile grammar** (`00 §3`), reusing the existing
  `boxWhiskerChart` / distribution plumbing. **DuPont-aggregate stays** as an honest analytic
  here (labeled "aggregate, not median"), not folded into a median tile.

## Sidebar submenu (nav)

Convert the flat `Sectors` link (`static/script.js` `GROUPS`) into an expandable parent whose
submenu is the four altitudes:

- **Overview** → `/sectors` (this redesign)
- **Company** → `/company/…` (exists; needs a selected filer)
- **Compare** → `/compare` (exists)
- **Qualitative** → **shown disabled with a "Track 2" affordance** — free-text topic modeling,
  out of scope per CLAUDE.md guardrail 1. Not built.

Plus the cross-page state the guide requires (`00 §7`, `§11.2`): selected sector + as-of period
+ expanded theme persist across altitude switches.

## Explicitly out of scope / deferred (flagged, not built)

- **Altitude 4 (Qualitative)** and the **"What's moving" filing-event feed** (`01 §7`) —
  Track 2 / 8-K-item parsing not ingested.
- **Sub-industry drill** (`00 §11.3`) — needs SIC-4 aggregation (new batch); deferred follow-up.
- **Filing-coverage % / same-store deltas** (`00 §6`) — needs per-period completeness tracking;
  deferred.
- **Accounting-quality & Structure-activity themes** — pending data that's largely Track-2.

## Infra note (read before build/verify)

Per `ROADMAP_SECTOR_ANALYTICS.md`: `data/secfin.db` is a stub; real data lives in the backup.
Build/verify needs a **hydrated Docker volume** (no local pip/venv on this host — use Docker per
`docs/DEVELOPMENT.md`). The new `sector_theme_scores` batch is a **deferred DevOps step** on the
prod volume, like the other sector-analytics batches.

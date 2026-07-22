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

**Built** (`sector-scorecard` branch, stacked on Phase 1): the seven-theme scorecard hero + inline
decomposition + the favorability token trio. Adds the seven-theme composite scorecard (guide
`01 §3`) to the single-sector page, consuming the Phase 0 `GET /v1/sectors/theme-scores`. **Mostly
frontend**, plus a small fixture-seeding addition.

**Locked decisions (operator, 2026-07-21):**
- **Full favorability color** (`00 §5`): the trend-delta chip and a score affordance carry
  positive/caution/negative color. This is a **deliberate departure** from the sectors page's prior
  "descriptive, no good/bad coloring" stance — the operator chose legibility here. **Consequence:**
  the project has **no favorability color tokens today**, so Phase 2 **introduces a
  positive/caution/negative token trio**, hues chosen to harmonize with the warm ClearyFi palette
  (muted sage / amber / brick — not primary green/red), documented as a new addition to the token
  system (`STYLE_GUIDE`). The score itself stays framed as a **position, not a verdict** (the
  endpoint caveats still say so, and are surfaced).
- **Scorecard on top, DuPont below:** the scorecard becomes the page hero directly under the sector
  bar; the DuPont tree + ROE trend + per-sector spreads + lifecycle move **below** it as the deeper
  per-sector analytics (guide: judgments up top, raw metrics one click deeper). Demotes the DuPont
  signature — accepted.
- **Decomposition = inline expand** (not a modal), matching the existing `.disclosure`/`details`
  pattern.

**Scope:**
- A **scorecard grid** of seven tiles (`01 §3`), rendered from the selected sector's `themes[]`:
  - five **scored** tiles: theme name, **0–100 score** (large), a **trend-delta chip**
    (`delta_vs_prior_fy`, favorability-colored + up/down/flat glyph), a **percentile line**
    ("82nd pctile vs all sectors"), and a **rank badge** ("3rd of 11" from `rank`/`rank_of`);
  - two **"not yet scored"** tiles (the deferred themes) — muted, no number, the `reason` as caption.
- **Score click → inline decomposition** (`00 §9a`): the constituents with each one's `median` +
  favorability-oriented `oriented_z` contribution, the **equal-weight** note, and the one-line
  **normalization** string from the payload.
- **Data flow:** fetch `/sectors/theme-scores` once; pick `state.group`'s entry; re-render on sector
  switch from the same payload (no refetch). Honest empty/loading/error per the shared states; when
  the batch hasn't run (prod today), the scorecard shows an **honest empty state**, never fabricated
  tiles.
- **Fixture:** seed a few `sector_theme_scores` + `sector_theme_components` rows in
  `scripts/seed_fixture.py` so the e2e render check exercises a **populated** scorecard *and* the
  empty state (a sector with no theme scores, and the two deferred tiles).
- **Not in Phase 2:** the tile-body click → theme drill-down expansion and the peer-strip
  re-pointing are **Phase 3**; in Phase 2 only the **score** is interactive (opens decomposition).

**Verify:** Docker e2e headless render check (screenshots eyeballed — scorecard populated, empty,
decomposition open, deferred tiles) + `pytest`.

## Phase 3 — Peer strip · biggest-shifts · theme drill-down

**Built** (`sector-drilldown` branch, stacked on Phase 2): peer strip + biggest-shifts band + theme
drill-down + the tile-body-click theme-expand. This completes the sector-overview altitude.

The final phase: three surfaces (`01 §4–6`) + the **tile-body click** as the theme-expand trigger
(the score click already opens the Phase 2 decomposition). **Mostly frontend** — the peer strip and
the drill-down read data already fetched; the metric-level shifts compute off the DuPont + lifecycle
series already in `state`. Largest phase of the redesign.

**Locked decisions (operator, 2026-07-22):**
- **Biggest-shifts = metric-level standardized change** (`00 §12`): top 3–5 individual metrics by
  standardized YoY change over the **DuPont series** (`roe`, `net_margin`, `asset_turnover`,
  `equity_multiplier`) + **lifecycle series** (`dio`, `dso`, `dpo`, `ccc`), both already fetched.
  Favorability via a **display-only direction map** for those metrics (like the existing
  `PERCENT_SPREAD` maps). `equity_multiplier` (leverage) is treated as **context/neutral** (no
  favorability color — leverage-up isn't cleanly "bad" for a sector). Honest basis label; a metric
  with too little history to standardize is omitted (never a fabricated shift).
- **Peer strip = context only, NOT clickable** (`00 §3b` default): one bar per sector on the focused
  theme (every sector's composite score, from the already-fetched `/sectors/theme-scores`), selected
  sector in `accent`, others neutral; caption names the theme + basis. Sectors that don't score the
  theme are omitted (no zero bars). The header selector stays the only way to switch sectors.
- **Keep both spread surfaces:** add the theme drill-down (the focused theme's median+IQR tiles,
  reusing `boxWhiskerChart` / `/sectors/{group}/spreads`) under the scorecard, **and keep** the
  existing always-on "Metric spread across &lt;sector&gt;" panel lower in the body. Constituents
  without a distribution are honestly omitted (never zero boxes).

**Interaction model** (guide `01 §3`): the **tile body** click expands the theme → re-points the
peer strip + shows the theme drill-down; the **score** button still opens the decomposition (Phase
2). Two distinct affordances on the tile — needs clear hover/expand affordances (design pass). The
**focused theme persists across sector switches** (`00 §11.2` metric-axis preservation); default
focused theme on load = the first scored tile (confirm in design).

**Page order** (`01` ordering): sector bar → scorecard → **peer strip** → **biggest-shifts** →
**theme drill-down** → aggregation banner → DuPont tree + trend → (kept) per-sector spreads →
lifecycle.

**Out of scope (flagged):** the **threshold-alert layer** (`00 §13`) that would pin threshold-
crossing metrics to the shifts band — no threshold layer exists (thresholds-with-metrics unbuilt);
the shifts band is standardized-change-ranked only. The **"what's moving" filing-event feed**
(`01 §7`) stays Track-2 / out.

**Verify:** Docker e2e headless render check (peer strip on a focused theme, shifts band, drill-down
open, focus persisting across a sector switch) + `pytest`.

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

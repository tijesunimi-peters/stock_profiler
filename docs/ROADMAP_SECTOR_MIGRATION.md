# Roadmap — migrate `/sectors` to the Sector Analytics app

> **SUPERSEDED IN PART (2026-07-24):** the app is being updated to **v2**
> (`docs/ROADMAP_SECTOR_APP_V2.md`). **Phase M1 (parity port) is obsolete** — the operator decided to
> **drop** the DuPont tree / ROE trend / lifecycle to match v2's Sector layout, so the `sector-parity`
> branch will **not** be merged. **M2 (routing swap) + M3 (decommission) still stand**, but run
> **after** the v2 build (see the v2 roadmap's P7).

Status: **planning (2026-07-22).** Owner: operator + delivery pipeline.
Related: `docs/REDESIGN_SECTOR_APP.md` (the new app), `docs/delivery/sector-app-followups.md`
(fidelity backlog, now DONE across all four views).

## Goal

Make the **Sector Analytics app** (`/sector-analytics`) the **canonical sector page**, replacing the
old single-sector page (`/sectors`, `sectors.js/html/css`) — **without losing any data or
functionality** the old page has today.

## Guiding principles

1. **Parity before swap.** Never flip the route until the new app is a **strict superset** of the old
   page. Port the missing pieces first; retire the old page last.
2. **The backend is already complete.** The new app already consumes **every** endpoint the old page
   uses — `/v1/sectors`, `/sectors/theme-scores`, `/sectors/{group}` (DuPont series),
   `/sectors/{group}/spreads`, `/sectors/{group}/lifecycle`. The migration is **frontend + routing
   only** — **no new endpoints, no schema, no backend work.**
3. **Honesty carries over.** N/A never 0; caveats + provenance intact; scores are positions, not
   verdicts. Favorability **color** is now allowed (F4 reversal) per the `STYLE_GUIDE §1` exception —
   color accompanies direction, never alone.
4. **Reversible.** The swap keeps a one-release rollback path (old page behind a flag) before the old
   assets are deleted.

## Parity audit (2026-07-22)

| Old `/sectors` feature | New app Sector view | Data fetched? |
|---|---|---|
| Composite scorecard (5 scored + 2 deferred) + decomposition | ✅ present | ✅ `themeScores` |
| Peer strip · biggest shifts | ✅ present | ✅ `series`/`lifecycle` |
| Per-sector **spreads** (box-and-whisker) | ✅ present (drill-down) | ✅ `spreads` |
| `?group=` deep-link, caveats, aggregation provenance | ✅ present / adaptable | — |
| **DuPont tree** (ROE = net margin × asset turnover × equity multiplier) | ❌ **GAP** | ✅ `series` |
| **ROE / DuPont trend** (FY series over time) | ❌ **GAP** | ✅ `series` |
| **Lifecycle trend** (DIO/DSO/DPO/CCC + CCC synthesis over time) | ❌ **GAP** | ✅ `lifecycle` |

**Net gap = 3 client-side visualizations** to port from `sectors.js` into `sectorapp.js`. The data is
already loaded in `state.series`/`state.lifecycle` (used today for biggest-shifts), so this is a render
port, not a data project.

---

## Phase M1 — Parity: port the missing visualizations (frontend-only)

Bring the new app's **Sector view** to full parity by porting the missing pieces. One `/deliver`
iteration (branch off `master`, `senior-frontend-engineer`).

### Confirmed Sector-view layout & placement (operator, 2026-07-22)

Full inventory of the old page reviewed; placements decided (no assumptions). The Sector view becomes,
top → bottom:

1. Control bar · **Scorecard** (7 tiles) · Provisional banner — unchanged.
2. **Decomposition + DuPont row (2-column):** the **decomposition panel** (`.pa-decomp`) on the LEFT,
   the **DuPont tree + ROE/DuPont trend** (with the **1Y/5Y/All range control**) on the RIGHT.
   - **Behavior change:** the decomposition is **open by default** on the **first scored theme** (so
     the tree always has its left neighbor); clicking another score/tile just re-points it.
3. **Peer strip · Biggest shifts** — unchanged.
4. **Drill-down row** — the existing **theme-scoped** dispersion spreads (+ the placeholder feed),
   unchanged.
5. **New "Sector aggregate" section (bottom):** the **all-metric spreads** small-multiple (kept
   **in addition to** the theme-scoped drill-down — "keep both"), then the **lifecycle (CCC) trend**
   (DIO/DSO/DPO/CCC).
6. **Footer disclosure:** the **aggregation provenance** ("Aggregate · asset-weighted, not a median ·
   SIC grouping is descriptive, not a ranking") + the **"How to read these figures (N notes)"** caveats
   as an expandable disclosure at the bottom of the view.

Open/minor: the old masthead **lede** copy (DuPont / multi-year history / working-capital) — keep the
new app's title+subtitle, optionally fold the lede in (architect's call). Behaviors to carry:
**`?range=`** deep-link, **focused-theme persistence** across sector switch, **MRU** recent sectors in
the selector (architect confirms feasibility against the new app's store).

**Scope** (per the confirmed layout above; port from `sectors.js`, reuse `window.ClearyFi.*` chart
helpers; self-contained in `sectorapp.js/css`):
- **M1a — Decomposition default-open + DuPont tree (right of decomp).** Default `state.decompTheme`
  to the first scored theme on Sector-view entry; lay the decomp panel + **DuPont tree** (ROE = net
  margin × asset turnover × equity multiplier, latest FY from `state.series`) in a 2-column row
  (decomp left / tree right). Adapt `dupontTree(...)`.
- **M1b — ROE/DuPont trend under the tree** with the **1Y/5Y/All range control** (adapt `rangeControls`
  + `paintTrend` + `wireRange`; carry `?range=`). Thin/one-point → honest empty state.
- **M1c — "Sector aggregate" section (bottom):** the **all-metric spreads** small-multiple
  (`paintDetailSpreads` port — kept alongside the theme-scoped drill-down) **then** the **lifecycle
  (CCC) trend** (`paintLifecycle`/`drawLifecycle` port) with the CCC explanation.
- **M1d — Footer disclosure:** the aggregation **provenance** banner text + the **"How to read these
  figures (N notes)"** caveats as an expandable disclosure at the bottom (`aggregationBlock` port).

**Acceptance criteria**
- M1-AC-1 On Sector-view entry the **decomposition is open by default** (first scored theme) with the
  **DuPont tree to its right** (ROE + 3 drivers, labels, latest-FY provenance); clicking another
  score/tile re-points the decomp, tree stays.
- M1-AC-2 A **ROE/DuPont trend** renders under the tree with a working **1Y/5Y/All** range control
  (`?range=` reflected); thin/one-point data → honest empty state.
- M1-AC-3 The **"Sector aggregate"** section shows the **all-metric spreads** small-multiple **plus**
  (below) the **lifecycle (CCC) trend** (DIO/DSO/DPO + CCC); negative-CCC + `~` approx preserved;
  one-FY → honest "not enough history".
- M1-AC-4 The **footer disclosure** carries the aggregation provenance + the caveats notes.
- M1-AC-5 **Honesty:** N/A never 0; caveats/provenance present; favorability color (if used) always
  accompanies direction + the value stays neutral; `equity_multiplier` neutral (not "good/bad"); the
  theme-scoped drill-down is unchanged (kept).
- M1-AC-6 Mobile 390px reflow (the 2-col decomp/tree row stacks); `pytest` green (no backend); Docker
  e2e passes + eyeballed; Company/Compare/Qualitative + old `/sectors` still render.

**Verification:** the fixture already renders the Sector view for scored groups (73/60/35/28) with
`series` + `lifecycle` seeded, so the e2e captures all three charts. Add `sectorapp` shots for the
DuPont tree + the two trends.

---

## Phase M2 — The swap (routing + retire, small change)

Once M1 lands (new app = superset), make `/sector-analytics` the canonical sector page under
`/sectors`. One small `/deliver` (or direct) change.

**Scope**
- **Route:** `main.py` — `/sectors` serves `sector-analytics.html`; pick a canonical URL and
  **301-redirect** the other (recommend canonical **`/sectors`**, redirect `/sector-analytics` →
  `/sectors` so existing links + bookmarks keep working). `?group=` (and `?view=`, `?symbol=`, `?a=&b=`)
  query params pass through — the app already honors them.
- **Nav links:** update the sidebar/nav across `static/*` (`sectorapp.js` sidebar, `index.html`, any
  page linking "Sector analytics" / "/sectors") to the canonical URL.
- **Old page behind a flag (rollback):** keep `sectors.*` served at a temporary URL (e.g.
  `/sectors-legacy`) or behind an env flag for **one release**, so a swap regression can be reverted
  instantly. Do **not** delete `sectors.*` yet.
- **e2e:** repoint the `sectors*` headless shots to the new app (or drop them in favor of the
  `sectorapp*` shots); keep one `/sectors-legacy` shot while the flag exists.

**Acceptance criteria**
- M2-AC-1 `GET /sectors` serves the **new app** (`#app` + `sectorapp.js`), not the old page; the old
  page is reachable only at the legacy URL/flag.
- M2-AC-2 `/sector-analytics` **301-redirects** to `/sectors` (or the chosen canonical); `?group=` and
  the other params survive the redirect.
- M2-AC-3 Every internal "Sector analytics"/"/sectors" nav link points at the canonical URL; no dead
  links.
- M2-AC-4 The old page still works at the legacy URL/flag (rollback path verified).
- M2-AC-5 `pytest` green; e2e passes + eyeballed; the app renders at `/sectors` incl. deep-links.

**Rollback:** flip the flag / revert the one-line route change → `/sectors` serves the old page again.

---

## Phase M3 — Decommission the old page (after a bake period)

After M2 has run in production for a release with no rollback needed.

**Scope**
- Delete `static/sectors.js` / `sectors.html` / `sectors.css`; remove the `/sectors-legacy` route/flag.
- Remove the old `sectors*` e2e shots + any old-page references in docs.
- Update `docs/REDESIGN_SECTOR_APP.md` "supersedes" note + `CLAUDE.md` repo-layout to reflect the
  single sector page.

**Acceptance criteria**
- M3-AC-1 `sectors.*` and the legacy route are gone; no references remain (grep clean).
- M3-AC-2 `pytest` + e2e green; `/sectors` is the app; nothing else regressed.

---

## Deployment note

On prod the scorecard/compare/DuPont surfaces stay **honest-empty until the analytical batch runs**
(`python -m secfin.analytical.sector_theme_scores`, plus the metrics/peer-distribution pipeline for
spreads). Sequence the batch before/with the swap so `/sectors` isn't empty on cutover.

## Risks / open decisions

- **R1 — canonical URL.** `/sectors` (familiar, redirect `/sector-analytics` in) vs `/sector-analytics`
  (redirect `/sectors` in). Recommend **`/sectors`** canonical. Operator call.
- **R2 — DuPont/trend range affordance.** Match the old page's 1Y/5Y/All range, or simplify to a fixed
  window in the new app. Architect/operator call in M1.
- **R3 — color in the ported charts.** Carry favorability color (F4/STYLE_GUIDE exception) into the
  DuPont/trend/lifecycle, or keep them neutral like the current Sector view body. Recommend color
  **accompanying** direction, value neutral — consistent with the scorecard delta chip.
- **R4 — legacy retention window.** How long `/sectors-legacy` stays before M3 (one release vs a fixed
  date). Operator call.

## Sequence at a glance

**M1 (parity port: DuPont tree + trends + lifecycle) → M2 (swap route + redirect + retire behind flag)
→ M3 (delete old assets after bake).** Backend: none. Each phase is a `/deliver` iteration with its own
brief/architecture/QA in `docs/delivery/`.

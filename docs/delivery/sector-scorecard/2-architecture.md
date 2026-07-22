# Architecture — Composite scorecard hero (Phase 2)

Stage 2 (Principal Architect). Designs against `1-brief.md`. **Frontend-only** (single stage).
Owner: `senior-frontend-engineer` (owns `static/` **and** the `scripts/` fixture/e2e-harness edits —
see D-ownership). No `src/secfin/` change; the endpoint already exists.

Scope re-check: **Track 1, in-architecture.** UI over the shipped `GET /v1/sectors/theme-scores` +
test-fixture seeding. No new dependency, no request-path change, CSP-safe. Branch **stacks on Phase 1
(`sector-overview-shell`)**; Phase 0+1 unmerged — rebases clean once they land.

Endpoint contract (Phase 0, `SectorThemeScoreList`): `{ fiscal_year, fiscal_period, peer_basis,
normalization, caveats[], sectors[{ group, group_label, themes[{ theme, theme_label, scored, score,
percentile, rank, rank_of, delta_vs_prior_fy, constituents[{ metric, label, higher_is_better,
median, oriented_z }], reason }] }] }`. Returns **all** scored sectors; the deferred themes are
already appended per sector as `scored:false` markers.

---

## Decisions resolved

### R1 — score-affordance coloring: RESTRAINED (reads as position, not verdict)
- The **score number stays neutral** (`--ink`), never a saturated colored fill.
- Favorability shows on the score via a **thin favorability accent bar** (a 3px left border / top
  strip on the tile) keyed to the **score band**:
  - `score ≥ 60` → `positive`; `40 ≤ score < 60` → `caution` (the cross-sector-average band);
    `score < 60`… i.e. `score < 40` → `negative`.
- The **trend-delta chip** is the primary favorability signal and **is** tinted (wash bg + colored
  text + glyph) — see R2.
- This keeps the tile from reading "buy this sector": the loud color is on *change*, the score
  carries only a quiet band accent, and the caveats (surfaced) frame the score as a position.

### R2 — delta favorability + flat threshold
`delta_vs_prior_fy` is in **score points** (score is favorability-oriented, so +delta = improved).
- `delta ≥ +2` → **positive**, up glyph (▲), chip text `+N`.
- `delta ≤ −2` → **negative**, down glyph (▼), chip text `−N`.
- `|delta| < 2` → **caution/flat**, flat glyph (▬), chip text `±0` / "flat" (muted).
- `delta === null` (no prior FY) → **no colored chip**: a muted "no prior FY" pill, **never `0`**.

### R3 — favorability token trio (names + roles; hues finalized in the design pass)
New tokens in `style.css` `:root` (the sanctioned addition — operator chose full favorability
color). Names/roles fixed here; exact hex is the design-stage's call (`frontend-design`), chosen to
**harmonize with the warm palette** (anchor off the existing `--syntax-string #a6b58c` /
`--syntax-get #8fae7e` greens, `--syntax-key #e0a55e` amber, and the `--accent #c0703a` terracotta):

```
--positive: <muted sage, e.g. ~#6f8f5e>;   --positive-wash: <e.g. ~#e7ecdf>;
--caution:  <warm amber, e.g. ~#b5842c>;    --caution-wash:  <e.g. ~#f2e6cf>;
--negative: <brick/rust, e.g. ~#a8452f>;    --negative-wash: <e.g. ~#f0dcd3>;
```
Used **only** for favorability (delta chips + score band accent). Documented in `STYLE_GUIDE.md`
with the "favorability only; the score is a position, not a verdict" rule.

### R4 — fixture realism (`scripts/seed_fixture.py`, `_seed_sector_theme_scores`)
Seed `sector_theme_scores` + `sector_theme_components` **directly** via the Phase 0 repo
(`SQLiteSectorThemeScoreRepository`, `SectorThemeScoreRow`, `SectorThemeComponentRow`) — same
pattern as `_seed_sector_dupont`. Mirror Phase 0 shapes:
- **Group 73** (Business Services — the default landing): **all five** themes scored; a **mix** of
  deltas — one `+`, one `−`, one **`None`** (no prior FY); varied score/percentile/rank; a
  **decomposition** (≥3 constituents) on at least the theme used for the decomp screenshot.
- **Group 60** (Depository Institutions/banks): **omit `operating_efficiency`** (banks lack it —
  matches Phase 0 real behavior) → 4 scored + the 2 deferred markers.
- **Groups 28 / 52**: seed **nothing** → they are **absent** from the payload → the frontend renders
  the **honest empty scorecard** for that sector.
Deferred themes are **not** seeded (the endpoint injects `accounting_quality`/`structure_activity`
as `scored:false` at the serve layer).

### R5 — fetch once, pick by sector
Fetch `/sectors/theme-scores` **once** in `init()`/`render()`; store the whole payload in
`state.themeScores`. `renderScorecard()` picks `state.themeScores.sectors.find(s => s.group ===
state.group)`. On sector switch, **re-pick + re-render** from the cached payload — **no refetch**.
Loads independently of `/sectors` (its own loading skeleton), so the sector bar + DuPont body never
wait on it.

### D-ownership — one frontend stage
The `scripts/seed_fixture.py` seeding is **test-fixture data** (not app logic) and is what the
frontend engineer needs to self-verify via e2e; it reuses Phase 0 repo classes (no new backend
logic). **Assigned to `senior-frontend-engineer`** along with `scripts/headless_check.js`. No
dedicated backend stage.

---

## Layout & state (in the Phase 1 `sectors.js` / `sectors.html`)

**`sectors.html`** — new `#scorecard` mount, the hero, **between `#sectorbar` and `#aggregation`**:
```
#masthead → #sectorbar → #scorecard (NEW hero) → #aggregation → #view (DuPont body) → #disclosure
```
The DuPont tree/trend/spreads/lifecycle stay in `#view` (unchanged), now visually **below** the
scorecard. The aggregation banner (DuPont-aggregate honesty) stays with the DuPont body it explains.

**`sectors.js`** — add to `state`: `themeScores: null`, `themeScoresErr: false`. In `render()`:
after resolving `state.group`, call `ensureThemeScores()` (fetch once → store → `renderScorecard()`)
and `renderScorecard()` (loading skeleton until loaded). In `selectSector()`: also
`renderScorecard()`. New functions:
- `ensureThemeScores()` — `P.api("/sectors/theme-scores")` once; on success store + render; on error
  set `themeScoresErr` + render the per-panel error (page still fine).
- `renderScorecard()` — mount `#scorecard`:
  - not loaded & no error → `P.states.loading` skeleton;
  - error → `P.states.error` (scoped to the scorecard);
  - no entry for `state.group` (sector absent from payload, or empty payload) → **honest empty**
    ("Sector health scores aren't available yet for <label> — they materialize once the scoring
    batch runs" — never tiles, never 0);
  - else → the **tile grid** + a `.disclosure` carrying the payload `normalization` + `caveats`.
- `scoreTile(t)` — scored tile: `theme_label`; `score` (large, neutral); **delta chip**
  (`deltaChip(t.delta_vs_prior_fy)`); **percentile line** `"P" + round(percentile) + " · vs all
  sectors"`; **rank badge** `rank + " of " + rank_of`; a favorability **band accent** by score; the
  score is a `<button>` (`data-theme`) that toggles the decomposition.
- `deferredTile(t)` — muted "not yet scored" + `t.reason` caption (no number/color).
- `deltaChip(d)` — R2 rules; null → muted "no prior FY".
- `renderDecomp(theme)` — a **shared inline panel below the grid** (one theme at a time; clicking the
  same score closes). Shows the theme's `constituents[]` — each `label`, a formatted `median`
  (percent-metric heuristic reusing the existing `PERCENT_SPREAD` map, else plain/`×`), and the
  **oriented contribution** (`oriented_z`, signed, as a small diverging bar or `+1.2σ` text) — plus
  the **equal-weight** note ("equal-weight mean of N constituents") and the `normalization` string.
  A constituent absent from `constituents[]` was excluded upstream (N/A) — never shown as 0.

Honesty: N/A never 0 (null delta, absent theme, absent constituent all render explicitly);
deferred/absent never fabricated; caveats + normalization always surfaced; position-not-verdict copy
on the scorecard header.

---

## Files to touch (all frontend / harness)

`static/sectors.html` (#scorecard mount); `static/sectors.js` (scorecard + decomp + state);
`static/sectors.css` (grid/tiles/chip/badge/accent/decomp); `static/style.css` (favorability
tokens); `docs/STYLE_GUIDE.md` (document tokens + rule); `scripts/seed_fixture.py`
(`_seed_sector_theme_scores`, called from the fixture entrypoint); `scripts/headless_check.js`
(shots). Update `docs/REDESIGN_SECTOR_OVERVIEW.md` Phase 2 status. **No `src/secfin/` change.**

e2e shots (`headless_check.js`): the existing `sectors` (group 73) now shows the **populated
scorecard** above the body; `sectors-selected` (group 60) shows **4 scored + 2 deferred** (banks omit
operating_efficiency). **Add:** `sectors-decomp` (`/sectors?group=73`, click a score → decomposition
open) and `sectors-scorecard-empty` (`/sectors?group=52`, no theme scores → honest empty scorecard,
DuPont still below).

---

## AC → concrete check

| AC | Check |
|----|-------|
| AC-1 | e2e `sectors`: scorecard renders under the sector bar, **above** the DuPont tree; 5 scored + 2 deferred tiles for group 73. |
| AC-2 | Each scored tile shows theme name, 0–100 score, delta chip, "P## · vs all sectors", "rank of rank_of" (screenshot + driven read). |
| AC-3 | Drive: a `+` delta → positive/▲, a `−` → negative/▼, `|Δ|<2` → flat/▬, `null` → "no prior FY" muted (never 0/colored). Fixture group 73 seeds all cases. |
| AC-4 | Deferred tiles (accounting_quality, structure_activity) render muted "not yet scored" + reason; no number/color/0. |
| AC-5 | Drive: click a score → inline decomposition (constituents + median + oriented contribution + equal-weight note + normalization); click again closes. Not a modal. `sectors-decomp` shot. |
| AC-6 | DuPont tree + trend + spreads + lifecycle still render below the scorecard (existing `sectors`/`sectors-lifecycle` shots). |
| AC-7 | Drive: switch sector (combobox/pill) → scorecard re-renders for the new sector from the cached payload (no second `/sectors/theme-scores` request — assert via request count). |
| AC-8 | e2e `sectors-scorecard-empty` (group 52, unseeded): honest empty scorecard; DuPont body still renders. Also force empty payload via interception → same empty state. |
| AC-9 | Group 60: `operating_efficiency` **absent** (not a "not yet scored" tile); only the 2 deferred are "not yet scored". |
| AC-10 | Scorecard surfaces `caveats` + `normalization`; header copy frames score as position-not-verdict; grep the rendered page for "buy"/"sell"/alpha — absent. |
| AC-11 | Favorability tokens used only on delta chips + score band accent; no other element colored; tokens in `:root` + documented in STYLE_GUIDE. |
| AC-12 | Token-driven (light-only app); mobile width: tiles reflow (auto-fit grid), decomposition wraps, no clipped labels, no horizontal bleed (drive at 390px). |
| AC-13 | `_seed_sector_theme_scores` seeds groups 73 (5 themes, mixed deltas, decomp) + 60 (omit op-eff); 28/52 unseeded (empty case). |
| AC-14 | `docker compose build api` → e2e headless check PASS (errors=0), screenshots eyeballed; `pytest` green. |

---

## Handoff → `senior-frontend-engineer`

Continue on the Phase 1 branch chain (new branch `sector-scorecard` **off `sector-overview-shell`**).
**Invoke `/frontend-design:frontend-design` first** to fix the favorability hues (R3) + the tile
grammar within the ClearyFi system. Order: (1) favorability tokens in `style.css` + STYLE_GUIDE; (2)
`#scorecard` mount in `sectors.html`; (3) `sectors.js` scorecard + decomposition + fetch-once state;
(4) `sectors.css`; (5) `scripts/seed_fixture.py` `_seed_sector_theme_scores` (reuse Phase 0 repo
classes); (6) `scripts/headless_check.js` shots; (7) docs. Self-verify: `pytest` green, then
`docker compose build api` + e2e headless check, and **eyeball** the scorecard shots (populated,
banks 4+2, decomposition open, empty) incl. mobile.

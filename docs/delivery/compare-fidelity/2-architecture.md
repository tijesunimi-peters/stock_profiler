# Architecture — Compare view prototype-fidelity pass

Stage 2 (Principal Architect). Task slug: `compare-fidelity`.
Designs against `1-brief.md` (AC-1…AC-7). **Verdict: FRONTEND-ONLY** — `sectorapp.js` + `sectorapp.css`.
No backend/schema; **no new data** (Compare is all real → no placeholders). Branch off `master`.
Owner: **`senior-frontend-engineer`**. Reference: prototype altitude-3 (lines ~302–360).

## Scope re-check

Track 1, no drift. Pure layout refactor of the existing real-data Compare view; all honesty properties
(no color, no winner, true-length, "lower is better" marker, N/A, categorical A/B) preserved.

## Plan — exact changes

### `static/sectorapp.js`

- **`cmpHead(A, B)`** (was arg-less) — replace the "01 Sector compare" section head with the prototype
  header row: `[accent swatch] {A name}  vs  [blue swatch] {B name}  <spacer>  {counts}`. Names via
  `sectorLabel`; counts via a new `sectorPeerCount(group)` (from `state.sectors`) → e.g. "59 vs 44
  filers" (or "—" for an unknown/unset side, never fabricated). `renderCompareView` passes `A, B`.
- **`cmpSelectorsHtml`** — **unchanged** functionally (operator kept the dropdowns); keep the A/B
  identity note (trimmed).
- **`cmpThemesHtml`** — wrap the rows in a **card**: header label "**Composite scores · shared 0–100
  scale**" + a `.pa-cmp-scorecard` (`--bg-card` + shadow) containing the rows; keep the provisional
  note below. Keep the derived composite row + the not-scored rows + theme order.
- **`cmpScoreRow`** — restructure to the prototype **`170px 1fr 84px`** grid:
  `<span .pa-cmp-theme>{label}{derived?}</span>` · `<div .pa-cmp-bars>{cmpBar A}{cmpBar B}</div>` ·
  `<span .pa-cmp-gap …>{gap}</span>`. (Move the gap from the old rowhead to the right cell; the two
  `cmpBar` lines stack in the middle cell.) `cmpBar` unchanged.
- **`cmpNotScoredRow`** — same `170px 1fr 84px` grid: name · the two "not scored" bars · a "not
  scored"/"not yet scored" gap cell. Drop the extra reason sub-line (prototype rows are single-line;
  the deferred reason still shows in the Sector view).
- **`cmpMetricsHtml`** — unchanged markup; only the grid/card **CSS** changes (below). Keep the
  heading, the "lower is better" marker, N/A cells, raw values, and the footer caption.

### `static/sectorapp.css`

- **Header:** `.pa-cmp-head2` (flex row, `border-bottom:2px solid var(--ink)`, wrap), `.pa-cmp-sw`
  (11px rounded swatch; `.pa-cmp-idA` bg `--accent`, `.pa-cmp-idB` bg `--pa-b`), `.pa-cmp-aname`
  (bold 18px), `.pa-cmp-vs` (mono muted), `.pa-cmp-counts` (mono `--ink-soft`, pushed right).
- **Composite card:** `.pa-cmp-scorecard` (`--bg-card`, border, radius 12, `var(--shadow)`, padding).
  `.pa-cmp-row` → `display:grid; grid-template-columns:170px 1fr 84px; gap:16px; align-items:center;
  padding:11px 0; border-top:1px solid var(--rule)` (drop the old card-block look). `.pa-cmp-bars`
  (middle cell) → `display:flex; flex-direction:column; gap:5px`. `.pa-cmp-gap` → `text-align:right`
  (ink-weight emphasis kept: `.strong`/`.soft`). Retire `.pa-cmp-rowhead` (unused). Composite row
  keeps a subtle emphasis (`.pa-cmp-row.composite`).
- **Metric cards:** `.pa-cmp-cards` → `grid-template-columns:repeat(auto-fit,minmax(280px,1fr))`;
  `.pa-cmp-card` → background `--bg-tint`.
- **Mobile (≤560px):** `.pa-cmp-row` → `grid-template-columns:1fr auto; ` name + gap on the top line,
  `.pa-cmp-bars { grid-column:1 / -1 }` full-width; `.pa-cmp-cards` → 1fr. No horizontal overflow.

### `scripts/headless_check.js`

- The existing `sectorapp-compare*` shots cover Compare; they'll capture the new header + composite
  card + metric cards. No new shot required (QA eyeballs the updated `sectorapp-compare.png`).

## Acceptance criteria → concrete checks

| AC | Check |
|----|-------|
| AC-1 | `.pa-cmp-head2` shows A name + accent swatch · "vs" · B name + blue swatch · a counts string ("N vs M filers"); no "01 Sector compare". |
| AC-2 | `#cmpSelA/#cmpSelB` dropdowns present; `change` recomputes (drive it). |
| AC-3 | Computed `.pa-cmp-row` = `170px 1fr 84px` inside `.pa-cmp-scorecard`; composite + not-scored rows present. |
| AC-4 | `.pa-cmp-cards` computed ≈ `minmax(280px,1fr)` auto-fit; `.pa-cmp-card` bg = `--bg-tint`; "lower is better" + N/A intact. |
| AC-5 | No `--positive/--caution/--negative`; A = `--accent`, B = `--pa-b` only; no winner text; bars true-length; gap = ink weight. |
| AC-6 | 390px overflow=0; `pytest` green; e2e PASS + eyeballed. |
| AC-7 | Sector/Company/Qualitative + `/sectors` render; pin-to-compare + `?a=&b=` still work. |

## Handoff → Senior Frontend Engineer

Frontend-only, branch off `master`. Implement the header, composite-scores card + `170/1fr/84` rows,
and metric-card grid/`--bg-tint` per above; keep the dropdowns and every honesty property. Verify:
`pytest` green (no backend), `docker compose build api` → e2e, eyeball `sectorapp-compare.png` (new
header + composite card + metric cards) + mobile, and confirm the other views + `/sectors` still render.

# Architecture — Sector view prototype-fidelity pass

Stage 2 (Principal Architect) handoff. Task slug: `sector-fidelity`.
Designs against `1-brief.md` (AC-1…AC-11). **Verdict: FRONTEND-ONLY** — `sectorapp.js` + `sectorapp.css`;
no backend/endpoint/schema/`normalize`/`storage` change. Branch off `master`.
Owner: **`senior-frontend-engineer`**. Reference: `docs/design/sector-app-prototype/prototype.dc.html`
altitude-1 block (lines ~134–240).

## Operator decision folded in (color scope)

The prototype is **color-free** (§3.1 — its scorecard delta + shifts render neutral `--ink`). The
operator resolved the conflict between "exactly as the prototype" and "add color": **color ONLY the
scorecard trend-delta chip**; **biggest-shifts stays neutral** (prototype-faithful). This matches the
`STYLE_GUIDE §1` favorability exception verbatim ("the trend-delta chip") — so no STYLE_GUIDE/REDESIGN
revert is needed; the earlier annotations already describe exactly this.

## Scope re-check

Track 1, no drift. Placeholders are honest empty states; the color is a display treatment of an
already-derived delta. No data ingested or fabricated. **Honesty rail:** every placeholder
unmistakably empty ("… — to be defined"), never a fabricated value.

## Plan — exact changes

### `static/sectorapp.js`

1. **Control-bar placeholders (AC-1, AC-2)** — in `controlBarHtml()`:
   - After the sector dropdown, add a **sub-industry placeholder** row matching the prototype's pill
     row — one disabled/muted pill reading **"Sub-industry — to be defined"** (no fabricated SIC-4
     names). Wrap in `.pa-subind` (placeholder styling, R1).
   - In the meta row (`.pa-meta`), add a **coverage placeholder** item **"coverage — to be defined"**
     (a `.pa-meta-item.pa-ph`), never a "% filed" number.
2. **Tile click shows both (AC-6, F5)** — change `expandTheme(theme)` to set **both**
   `state.expandedTheme = theme` **and** `state.decompTheme = theme`, then `renderApp()`. The
   score-button `toggleDecomp` (with `stopPropagation`) stays so the decomposition can be collapsed
   independently; `paDecompClose` stays. (Clicking a tile now opens the decomposition **and** re-points
   the peer strip + drill-down.) Update `secHead()` copy to "click a tile to open its decomposition,
   peers & dispersion".
3. **Scorecard delta color (AC-7, F4-Sector)** — in `scorecardHtml`, add a sign class to the delta
   chip: `deltaClass(t.delta_vs_prior_fy)` → `pos` (delta>0), `neg` (delta<0), `""` (0/null). Render
   `<span class="pa-tile-delta {cls}">…arrow + label…</span>`. The **arrow glyph stays inside the
   chip** (color never alone); the **score button stays neutral `--ink`** (unchanged). Null delta
   still renders "→ no prior FY" with **no color**.
4. **Biggest-shifts layout + flag (AC-4)** — in `shiftsHtml`, keep the row **neutral** (no favorability
   color) and add the prototype's **flag chip**: when `|z| ≥ 1.5` render a `.pa-shift-flag` chip
   ("notable") between the name and the delta (a real threshold on the real z, not fabricated). Row
   markup order becomes glyph · name · [flag] · delta · basis to match the prototype's flex row.
5. **Drill-down + feed row (AC-5, F7)** — wrap the drill-down + a new placeholder in a `.pa-drill-row`
   (`3fr 2fr`): left = the existing `drilldownHtml(entry, g)` output; right = a **placeholder feed
   card** `feedPlaceholderHtml()` → a `.pa-feed.pa-ph` card titled "What's moving" with body
   **"Placeholder · filing-event feed (8-K / Form 4 / S-1) is Track 2 — to be defined."** No fabricated
   items. `renderSectorView` wraps `drilldownHtml(...)` + `feedPlaceholderHtml()` in the row container.
6. No change to `peerStripHtml`, `mountDrilldown`, data fetching, or `wireSectorView` beyond the
   above (the tile handler already calls `expandTheme`, which now sets both).

### `static/sectorapp.css`

- **`.pa-decomp-row`** → `grid-template-columns: 200px 60px 1fr 52px` (AC-3). Keep the 560px mobile
  fallback.
- **`.pa-shift-row`** → **flex** (`display:flex; align-items:baseline; gap:12px`): `.pa-shift-glyph`
  `width:14px`, `.pa-shift-name` `flex:1`, `.pa-shift-flag` (auto, ext-colored chip), `.pa-shift-delta`
  `width:80px; text-align:right`, `.pa-shift-basis` `width:150px; text-align:right` (AC-4). Update the
  560px rule to keep it from overflowing (basis wraps/hides).
- **`.pa-drill-row`** → `display:grid; grid-template-columns:3fr 2fr; gap:16px; align-items:start;
  margin-top:16px` (AC-5); at ≤900px → `1fr` (stack). The drill-down card loses its own top-margin
  inside the row.
- **`.pa-tile-delta.pos`** → `color:var(--positive); background:var(--positive-wash)`; **`.neg`** →
  `color:var(--negative); background:var(--negative-wash)`; small chip padding/radius; the glyph
  inherits. Flat/null = no class = neutral (AC-7). (Tokens exist in `style.css`.)
- **Placeholder styling (R1)** — `.pa-ph` / `.pa-subind` / `.pa-feed`: dashed `--border-strong`,
  `--bg-tint`/transparent, muted `--mono-muted` text, an uppercase "placeholder" micro-label; reads
  unmistakably as empty. `.pa-shift-flag`: mono uppercase chip in the ext palette.
- **`--ext` tokens (AC-8, R4)** — define locally on `.pa-app` (self-contained, like Compare's
  `--pa-b`): `--ext:#b04a3a; --ext-bg:#f5e2da; --ext-border:#e8c4b4;` (the `app.css` values) so the
  provisional banner + the shift flag chip render with the prototype's rust tint.
- **Mobile (AC-10)** — `.pa-drill-row`→1col at 900px; `.pa-subind`/coverage placeholder wrap; no
  horizontal overflow at 390px.

### `scripts/headless_check.js`

- The existing `sectors`/`sectorapp*` shots cover the Sector view. Ensure a shot lands on an
  **expanded tile** so the `3fr 2fr` drill row + placeholder feed + decomposition (from the tile
  click) + the colored delta are captured. Reuse/extend the `sectorapp-decomp` interaction (click a
  **tile**, not just the score) or add a `sectorapp-drill` shot. Confirm the control-bar placeholders
  render on the default `sectorapp` shot.

### Docs

- `docs/delivery/sector-app-followups.md`: mark **F5** and **F7** as being delivered by this iteration;
  narrow **F4** to "scorecard trend-delta chip (Sector); shifts stay neutral per prototype"; note **F6**
  (sub-industry) is now a **placeholder** here (real data still deferred).

## Acceptance criteria → concrete checks

| AC | Check |
|----|-------|
| AC-1 | Control bar shows a "Sub-industry — to be defined" **placeholder** pill; grep JS/DOM → no fabricated SIC-4 names. |
| AC-2 | Meta row shows a "coverage — to be defined" **placeholder**; no "%". |
| AC-3 | Computed style of `.pa-decomp-row` → `200px 60px 1fr 52px`. |
| AC-4 | `.pa-shift-row` is flex; glyph 14px / name flex:1 / delta 80px / basis 150px; a `|z|≥1.5` shift shows a flag chip. |
| AC-5 | `.pa-drill-row` computed `grid-template-columns` ≈ 3:2; right cell is a labeled placeholder feed, **no feed items**. |
| AC-6 | Clicking a **tile** opens `.pa-decomp` **and** re-points peer strip + drill-down (both present). |
| AC-7 | `.pa-tile-delta.pos` computed color = `--positive`, `.neg` = `--negative`; the arrow is inside the chip; `.pa-tile-score` stays `--ink`; null delta uncolored. No green/red **stoplight** (muted trio). |
| AC-8 | Provisional banner background/text resolve (ext tokens defined); rust tint visible. |
| AC-9 | Grep + eyeball: no fabricated coverage/sub-industry/feed value or count; placeholders labeled; scores read "position, not verdict"; null delta "→ no prior FY" not 0. |
| AC-10 | No `--positive/--caution/--negative` misuse (only on the delta chip); no CDN added; 390px overflow=0; `pytest` green; e2e PASS + eyeballed. |
| AC-11 | Company/Compare/Qualitative + `/sectors` still render (e2e shots unaffected). |

## Handoff → Senior Frontend Engineer

Frontend-only, branch off `master`. Implement the JS + CSS above, keep the Track-2 feed a **labeled
placeholder** (never fabricated), color **only** the scorecard delta chip (arrow always present, score
neutral), define `--ext` locally, add the exact prototype column widths, and make a tile click open
both the decomposition and the peer strip/drill-down. Verify: `pytest` green (no backend), `docker
compose build api` → e2e, **eyeball** the expanded-tile shot (3fr/2fr + placeholder feed + colored
delta + decomposition) + mobile 390px, and confirm the other views + `/sectors` still render.

# Architecture — Qualitative view prototype-fidelity pass

Stage 2 (Principal Architect). Task slug: `qual-fidelity`.
Designs against `1-brief.md` (AC-1…AC-7). **Verdict: FRONTEND-ONLY** — `sectorapp.js` (`renderQualView`)
+ `sectorapp.css`. No backend; **no data** (all placeholders). Branch off `master`. Owner:
**`senior-frontend-engineer`**. Reference: prototype altitude-4 (lines ~362–453).

## Scope re-check — the honesty landmine

Track 1, no drift, **because nothing is data**. This replicates the prototype's *layout*; every cell
is an unmistakable placeholder. **Non-negotiable:** no fabricated (or synthetic) figure, count, %, `●`
flag, direction chip, filled coverage bar, filer name, or matrix row. If any of those would render,
STOP — that's the Track-2 line. The prominent "Track 2 · not yet derived from filings" banner stays so
the layout can never read as imminent data.

## Plan — `renderQualView` rebuild

Keep the honest base (section head + subhead + the **Track-2 banner** with its "why" + "nothing here is
fabricated" copy + the closing foot line). **Replace** the "What Track 2 would cover" + 5 planned cards
with the prototype layout, all placeholders:

### `static/sectorapp.js`
- Add `QUAL_THEMES` = the **7 real theme labels** (`CO_THEMES` 5 + `CO_DEFERRED` 2) — labels only.
- **`3fr 2fr` grid** (`.pa-qual-cols`):
  - **Left — "Risk-factor themes"** card (`.pa-qual-rt`): heading + "share of filers citing · YoY
    direction" caption; one row per `QUAL_THEMES` entry on a **`1fr 130px 74px`** grid: theme name ·
    (an **empty** `.pa-qual-rtbar` placeholder track + a **"—"** value) · a **"planned"** chip
    (`.pa-qual-planned`, not a direction). Footer note reframed to Track-2.
  - **Right — 3 cards** (`.pa-qual-side`): "Emerging this year", "Going-concern watch", "Material
    litigation" — each = heading + a **"—"** count + a `.pa-qual-phbody` **"To be defined · no filers
    shown"** placeholder body. **No fabricated filers/items.**
- **"Per-filer signals" matrix** (`.pa-qual-matrix`): heading + the **column headers** (Filer · Risk
  factors · New · Going concern · Litigation) on the prototype's **`2fr 1fr 1fr 1fr 1fr`** grid + a
  **placeholder body** ("Per-filer flags will list here — to be defined; no filers shown, nothing
  fabricated"). **No fabricated rows/●.**
- Static — no fetch, no state, no interaction (the prototype's "click a theme"/matrix are Track-2 stubs
  → omit the click handlers; the rows are inert placeholders).

### `static/sectorapp.css`
- `.pa-qual-cols` (`grid 3fr 2fr`, → 1col at 900px). `.pa-qual-rt`/`.pa-qual-side` cards (reuse the
  card look). `.pa-qual-rtrow` (`grid 1fr 130px 74px`), `.pa-qual-rtbar` (an **empty** dashed/muted
  track, no fill), `.pa-qual-dash` ("—" muted). Reuse `.pa-qual-planned` (chip) + `.pa-ph`/
  `.pa-qual-phbody` (placeholder body, dashed muted). `.pa-qual-matrix` + `.pa-qual-mhead`
  (`grid 2fr 1fr 1fr 1fr 1fr`, `border-bottom:2px ink`). Keep the local `--ext` tokens for the
  Track-2 accents (banner/emerging card). Mobile: cols → 1, matrix header stacks/scrolls, no overflow.

### `scripts/headless_check.js`
- The `sectorapp-qual` shot already clicks the Qualitative rail → it captures the new layout. Keep it
  (waits for `.pa-qual-banner`, which remains).

## Acceptance criteria → concrete checks

| AC | Check |
|----|-------|
| AC-1 | `.pa-qual-banner` prominent at top; `.pa-qual-rt` (7 rows), 3 `.pa-qual-side` cards, `.pa-qual-matrix` headers all render. |
| AC-2 | Coverage bars are empty (no `.pa-qual-rtbar > *` fill); values "—"; chips "planned"; side/matrix bodies "to be defined / no filers shown"; no filer names. |
| AC-3 | Grep + DOM: after stripping "Track 2"/"13F", the view body has **no data digit**; **no** `●`, no direction word (rising/new/fading), no filled bar, no synthetic filer/row. |
| AC-4 | "why" + "nothing here is fabricated" + "nothing derived from filings" present; banner is first. |
| AC-5 | No `--positive/--caution/--negative`; placeholder styling reads empty. |
| AC-6 | 390px overflow=0; `pytest` green; e2e PASS + eyeballed. |
| AC-7 | Sector/Company/Compare + `/sectors` render; Qualitative rail routes here. |

## Handoff → Senior Frontend Engineer

Frontend-only, branch off `master`. Rebuild `renderQualView` to the prototype layout with **only
placeholders** (empty bars, "—", "planned", "to be defined / no filers shown"), keep the Track-2
banner + honesty copy, and **fabricate nothing**. Verify: `pytest` green, `docker compose build api` →
e2e, eyeball `sectorapp-qual.png` (layout with placeholders, nothing reads as data) + mobile, confirm
the other views + `/sectors` render. **Flag to the operator for a hands-on check** — the honesty
landmine ("nothing reads as data") warrants an operator eyeball despite the view being static.

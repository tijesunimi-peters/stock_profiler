# Architecture — Company view prototype-fidelity pass

Stage 2 (Principal Architect). Task slug: `company-fidelity`.
Designs against `1-brief.md` (AC-1…AC-9). **Verdict: FRONTEND-ONLY** — `sectorapp.js` + `sectorapp.css`
(+ `headless_check.js`); no backend/endpoint/schema. Branch off `master`.
Owner: **`senior-frontend-engineer`**. Reference: prototype altitude-2 block (lines ~243–300).

## Scope re-check

Track 1, no drift. Reuses `/sectors`, `/companies/{symbol}/peers`, `/sectors/{group}/{metric}/companies`.
No data ingested or fabricated. Composite stays a **real derived percentile**; the trend + (unknown)
ticker are honest placeholders/omissions. **Honesty rail:** never a fake ticker/rank/trend/count.

## Plan — exact changes

### `static/sectorapp.js`

- **State:** add `focalTicker` (R3) and `defaultFocalTried`, `coCompOpen` to the store.
- **R1 — default focal.** New `resolveDefaultFocal()`:
  - guard: return if `state.focalCik` or `state.defaultFocalTried` or no `state.sectors`.
  - largest = `state.sectors.sectors` max by `peer_count`; `state.focalGroup = largest.group`;
    fetch `/sectors/{largest.group}/net_margin/companies?year=&period=FY`; sort `companies` by `name`;
    `selectFocalCik(first.cik, first.name)` + `ensureCompanyData()`. On empty/catch → `renderApp()`
    (honest empty/error state, unchanged).
  - **Trigger:** in `setView("company")` when `!state.focalCik`; and in `init()` after `/sectors`
    resolves when `state.view==="company"` **and** no `?symbol=`. `?symbol=` still wins (unchanged).
- **R3 — ticker.** In `selectFocal(symbol)`: set `state.focalTicker = /^\d+$/.test(symbol.trim()) ?
  null : symbol.trim().toUpperCase()` (a ticker search only). `selectFocalCik` and `resolveDefaultFocal`
  set `state.focalTicker = null` (cik/dot-click/default have no known ticker). **Never derive a ticker.**
- **F3 header — `coHead()`** rebuilt to the prototype's row:
  `sector › [name dropdown] [ticker pill?] · [context pill] [filing basis]`
  - name → a `<select id="coFocalSel">` of the group's peers (R2): from
    `state.coValues[group|"net_margin"].companies` (fallback any loaded metric), de-duped by cik,
    sorted by name, current = `focalCik`; `change` → `selectFocalCik`. Styled into the breadcrumb.
  - ticker pill: only if `state.focalTicker` (`.pa-co-ticker`).
  - context pill `.pa-co-ctx`: "N peers · SIC {group}" where N = the companies count for the group
    (from the loaded dot-cloud; else "—" while loading, never a fake number).
  - filing basis `.pa-co-basis`: "FY" + `focalYear()`.
- **F3 main heading + affordance** — in `renderCompanyView`, above the dot-plots add a
  **"Peer distribution"** heading (`.pa-co-sech`) and keep/relabel the caption; add the affordance line
  **"Click any peer dot to make it the focal filer."** (`.pa-co-afford`).
- **F3/operator composite — `coRailHtml()`** composite card:
  - keep the derived percentile + its "derived · … not a ranked position" note (unchanged, real).
  - add a **"trend — to be defined"** placeholder line (`.pa-ph`) where the prototype's "vs last FY"
    move was — **no computed delta**.
  - make the composite value a button (`#coCompBtn`) toggling `state.coCompOpen`; when open, render a
    small breakdown `.pa-co-comp-decomp` listing the **per-theme percentiles that feed the average**
    (already computed in `coRailHtml` as `themePcts`/the rows) — no new data. Wire in `wireCompanyView`.
- **F4-Company:** no color changes (prototype color-free; dots neutral + focal `--accent` diamond stay).
- **`ensureCompanyData`** already fills `coValues[group|metric]`; the breadcrumb dropdown + context
  pill read from it. No fetch changes.
- **`wireCompanyView`** — attach the `#coFocalSel` change handler + the `#coCompBtn` toggle (in
  addition to the existing dot handlers).

### `static/sectorapp.css`

- `.pa-co-head` → the prototype's baseline row (sector mono · `›` · name select · ticker pill ·
  spacer · context pill · basis), `border-bottom:2px solid var(--ink)` to match. `.pa-co-ticker` (dark
  pill: `--ink` bg / `--bg-page` text, like the prototype). `.pa-co-ctx`/`.pa-co-basis` (mono, tinted
  pill / muted). `.pa-co-sel` (breadcrumb `<select>` styled minimal, dashed underline).
- `.pa-co-sech` ("Peer distribution" bold heading) + `.pa-co-afford` (mono muted line).
- `.pa-co-comp-trend.pa-ph` (placeholder line) + `.pa-co-comp-decomp` (the toggle breakdown) +
  `#coCompBtn` (dashed-underline button, neutral).
- Mobile: the header row wraps at 390px (name select full-width, pills wrap); `.pa-co-comp-decomp`
  stacks. No horizontal overflow.

### `scripts/headless_check.js`

- `sectorapp-company` (currently `?symbol=900001`) stays. Add/adjust:
  - **`sectorapp-company-default`** → `/sector-analytics?view=company` (no symbol) — the **default
    focal** populated (largest sector's first-alpha filer). (Replaces/augments the old empty-state
    shot — keep one no-symbol shot but expect it POPULATED now; add a separate check that the empty
    state still exists as the fallback when the universe can't resolve — hard to force with the
    fixture, so QA drives the resolved default and notes the fallback path is code-only.)
  - Exercise the **breadcrumb dropdown** (select a peer) and the **composite decompose** click in the
    `sectorapp-company` shot's interaction block; confirm the header pills render.

### Docs

- `docs/delivery/sector-app-followups.md`: mark **F1, F2** DONE (company-fidelity); **F3** DONE except
  the data-gated bits (composite trend = placeholder here; ticker-on-cik still needs the identity to
  carry a ticker — omitted-when-unknown is the shipped behaviour); **F4** Company = color-free (no-op).

## Acceptance criteria → concrete checks

| AC | Check |
|----|-------|
| AC-1 | `?view=company` (no symbol) → rail + dot-plots for a real default filer (largest sector, first-alpha); empty/error only on no-resolve (code path). |
| AC-2 | `#coFocalSel` lists the group's peers; `change` → focal + rail + dot-plots recompute. |
| AC-3 | Header shows `.pa-co-ctx` ("N peers · SIC …") + `.pa-co-basis` ("FY…"); `.pa-co-ticker` only when `focalTicker` set; grep → no fabricated ticker. |
| AC-4 | `.pa-co-sech` "Peer distribution" + `.pa-co-afford` affordance present. |
| AC-5 | Composite shows real "P##" + "derived · not a ranked position" + a "trend — to be defined" placeholder; `#coCompBtn` toggles the per-theme breakdown. No fabricated rank/trend. |
| AC-6 | Computed styles: dots neutral, focal diamond `--accent`; no `--positive/--caution/--negative` in the Company view. |
| AC-7 | Grep + DOM: no fake ticker/rank/trend/count; placeholders labeled; N/A excluded (dot-cloud counts differ), never 0. |
| AC-8 | No CDN added; 390px overflow=0; `pytest` green; e2e PASS + eyeballed. |
| AC-9 | Sector/Compare/Qualitative + `/sectors` render; header search + `?symbol=` + dot-click still work. |

## Handoff → Senior Frontend Engineer

Frontend-only, branch off `master`. Implement the JS + CSS above (default focal, breadcrumb dropdown,
header pills, Peer-distribution heading + affordance, composite real-%+placeholder-trend+decompose),
keep the Company view **color-free**, and **never fabricate** a ticker/rank/trend. Verify: `pytest`
green (no backend), `docker compose build api` → e2e, eyeball the default-focal + dropdown + header +
composite shots + mobile, confirm the other views + `/sectors` still render.

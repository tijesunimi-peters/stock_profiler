# 2 · Architecture & implementation plan — P5 Filings view (drill-in, placeholder)

Stage 2 (Principal Architect) handoff. Reads `1-brief.md`. Owner of build: **`senior-frontend-engineer`**.

---

## Scope re-check (architect)

- **Track 1 / architecture boundaries:** clean. This is **frontend-only** — no `sec/`, `ingest/`,
  `normalize/`, `storage/`, or `api/` (Python) changes; **no new endpoint, route, network call, or
  dependency**; no data-model / `mapping.py` / `DATA_MODEL.md` change; DuckDB untouched. The
  Filings view reads **nothing** from the API — it is a static placeholder layout. Nothing here
  touches SEC compliance, the rate limiter, or the single-process constraint.
- **Track-2 posture:** the *content* (per-theme filing lists, cited passages) is Track-2
  narrative we do not ingest. Per `CLAUDE.md` guardrail 1 + roadmap decision 3, we render the
  **shape** as an **honest placeholder** and fabricate nothing. No scope drift to flag.
- **Backend stage: N/A** (confirmed — matches the state file's expectation).

## Files to touch (all under `src/secfin/api/static/`)

| File | Change |
|---|---|
| `sectorapp.js` | Add `filings` to the state store; route `view==="filings"` in `renderViewport`; add `renderFilingsView` + `wireFilingsView`; replace the two inert entry-point no-ops in `wireQualView` with real navigation. |
| `sectorapp.css` | Add `.pa-fil-*` classes for the Filings view (breadcrumb, coverage/direction chip, count line, language block, form tabs, list/empty-state, pager, back link), reusing existing tokens/`.pa-ph`/`.pa-qual-*` idioms. |

No HTML/template file change needed (`sector-analytics.html` just loads the JS/CSS; the view is
rendered into `#viewport`).

## State model changes (`sectorapp.js`, the single `state` store ~line 19)

Add four keys (prototype §6):

```
filingsTheme: null,   // the drilled risk-theme label (string); breadcrumb + language-block context
prevView:     null,   // the view to return to on Back (e.g. "qual"); captured at open
filingsPage:  0,      // 0-based pager index; RESET to 0 every time the view is opened from a "Filings →"
filingsForm:  "All",  // active form-type tab: "All" | "10-K" | "10-Q" | "8-K"
```

## Navigation wiring

### Entry points — replace the inert no-ops in `wireQualView` (`sectorapp.js` ~line 638–641)

A shared helper opens the drill:

```
function openFilings(theme) {
  state.filingsTheme = theme;
  state.prevView = state.view;      // "qual" in the normal flow
  state.filingsForm = "All";
  state.filingsPage = 0;            // reset on open (AC-7)
  state.view = "filings";
  renderApp();
}
```

- **"Filings →" buttons** (`.pa-qual-filings[data-qual-filings]`): the existing handler currently
  `stopPropagation` + `preventDefault` + nothing. Keep the `stopPropagation` (so the row's
  language-toggle doesn't also fire) but call `openFilings(b.getAttribute("data-qual-filings"))`.
- **"Open filings in ClearyFi"** — per the brief this is the second entry point. In P4 that phrase
  is **static text inside the representative-language panel** (`renderQualView` ~line 553–555), not
  a button. The frontend engineer must **make it a real control**: render it as a
  `<button class="pa-qual-langfilings" data-qual-filings="<theme>">Open filings in ClearyFi</button>`
  inside the open language panel, and wire it in `wireQualView` to the same `openFilings(theme)`.
  (Small, contained change to the P4 language-panel markup; keep the surrounding copy.)

### Routing — `renderViewport` (~line 479)

```
if (state.view === "filings") return renderFilingsView(vp);
```

### View rail & right rail

- **View rail (`railHtml`, ~line 345):** unchanged — stays the **four** buttons
  (Sector/Company/Compare/Qualitative). During `view==="filings"` none is `active` (Filings is a
  drill-in, not a rail item — AC-13). The rail buttons remain wired via `wireShell` (`data-view` →
  `setView`), so clicking one leaves the drill normally.
- **Right rail (`renderApp`, ~line 255):** do **not** render the right rail for `filings` — leave the
  condition as-is (it excludes `filings`). The drill is a focused, full-width sub-view (content stays
  under the 960px cap).

### Back link

Render a Back control in the Filings view; on click:

```
function backFromFilings() {
  state.view = state.prevView || "qual";
  renderApp();
}
```

Keyboard-operable (button element). No page reload, no external URL (AC-5).

## `renderFilingsView(vp)` — structure (mirror `renderQualView`; reuse the placeholder vocabulary)

Compose `vp.innerHTML` from these regions (all data slots are placeholders — see Honesty):

1. **Header row + breadcrumb (AC-3):** a back link + breadcrumb
   `<sector group_label> › Risk theme › <state.filingsTheme>`. Sector label from
   `selectedSector().group_label` (live, real); theme from `state.filingsTheme` (real). Use
   `P.esc` on both. These two strings are genuinely known → **not** placeholders. If
   `filingsTheme` is somehow null (defensive), fall back to a neutral "Risk theme" label — never
   invent one.
2. **Track-2 framing line (AC-11):** a short banner/flag consistent with the P4 Qualitative tone
   ("Track 2 · not yet derived from filings — the filings behind this theme will list here; nothing
   is fabricated"). Reuse `.pa-qual-flag`/`.pa-qual-why` idiom or a `.pa-fil-note`.
3. **Coverage + direction chip (AC-4):** the share-of-filers coverage bar + YoY direction chip
   shape from the Qualitative row — rendered as **placeholders** (empty bar + `—` / "planned", no %,
   no new/rising/fading/stable value). Mirror `.pa-qual-rtbar` / `.pa-qual-planned`.
4. **Filing-count line (AC-9/AC-12):** "— filings · to be defined" — a **placeholder**, never an
   integer, never `0`.
5. **Representative-language block (AC-4):** the same shape as the P4 language panel — a placeholder
   ("a verbatim excerpt + its source filing will appear here · to be defined · no filing text
   shown"). No fabricated excerpt/source/date. Reuse `.pa-qual-langpanel` idiom.
6. **Form-type tabs (AC-6):** `All / 10-K / 10-Q / 8-K` as real buttons; the one equal to
   `state.filingsForm` gets an `active` class + `aria-selected`. `role="tab"` group;
   keyboard-operable. Clicking sets `state.filingsForm` and re-renders. **Every tab resolves to the
   same empty list** (the placeholder set is empty for all forms).
7. **Filing list (AC-10):** an **honest empty state** — `P.states.empty({...})` or a
   `.pa-fil-empty` block reading e.g. "Filings will list here · to be defined · none shown". **No
   rows** — no filer ticker, company name, accession no., filed date, section label, or cited
   passage (AC-8). Optionally render the column-header shape (Filer / Form / Filed / Section /
   Passage) **above** the empty body (headers are labels, not data — same pattern as the P4
   per-filer matrix `.pa-qual-mhead`), but this is optional; the empty body is the requirement.
8. **Pager (AC-7/AC-9):** prev/next + numbered page buttons + a **range label** that shows
   **"— of —"** (never "1–6 of 14"). With an empty list there is effectively one empty page: render
   the controls (they must not throw), disable prev/next at the ends, and keep the range label a
   placeholder. `filingsPage` changes on click and re-renders; behavior at the ends is a no-op, not
   an error.

Then `wireFilingsView()` (called at the end of `renderFilingsView`, like `wireQualView`): wire the
Back link, the form tabs, and the pager buttons.

### Honesty (LOAD-BEARING — maps to AC-8..AC-12)

- Every data slot is an **unmistakable placeholder**: `—`, "to be defined", "none shown", "planned".
  Reuse the `.pa-ph` / `.pa-qual-phtag` / `.pa-qual-planned` classes so it reads identically to P4.
- **Range label = "— of —"** (AC-9); **filing count = placeholder** (AC-9); **N/A never `0`** (AC-12).
- **List body = empty state**, not zero-filled/synthetic rows (AC-10).
- **No fabricated string** matching a ticker/accession/date/%/excerpt anywhere in the rendered
  output (AC-8) — the only "real" strings are the live sector label and the theme label (both
  genuinely known), plus static UI copy and form-type **labels** ("10-K"/"10-Q"/"8-K", which are
  control labels, not data).
- Keep the **Track-2 framing** so the empty state reads as *deliberate*, not broken/loading (AC-11).

## CSS (`sectorapp.css`)

Add `.pa-fil-*` classes styled with existing tokens (`--pa-*` vars, `.pa-card`, borders, mono
labels). Match the STYLE_GUIDE / paper-terminal language already used by `.pa-qual-*`. No new fonts,
no external assets (CSP-safe). Theme-aware via the existing variables (no hard-coded light-only
colors beyond what the app already uses). The form tabs and pager should visually echo existing
control styling (e.g. `.pa-rail-btn` / `.pa-dd-opt` idioms) for consistency.

## Acceptance criteria → concrete checks

| AC | Check |
|---|---|
| AC-1 | Click a `.pa-qual-filings` button in the Qualitative view → `state.view==="filings"`, viewport shows the Filings view. |
| AC-2 | Open a theme's language panel, click "Open filings in ClearyFi" → same Filings view for that theme. |
| AC-3 | Breadcrumb text = `<selectedSector().group_label> › Risk theme › <clicked theme>`; changes with the theme clicked. |
| AC-4 | Filings view DOM contains: breadcrumb, coverage bar + direction chip, count line, language block, 4 form tabs, list region, pager + range label. |
| AC-5 | Back control → `state.view === state.prevView` (qual); sectorIdx/theme/focal unchanged; no `location` change, no external link. |
| AC-6 | Clicking each form tab sets it active (single) + updates `state.filingsForm`; keyboard (Enter/Space) works; no console error; list stays the same empty state. |
| AC-7 | `filingsPage===0` right after open; prev/next/number clicks change it without throwing; ends are no-ops. |
| AC-8 | Grep the rendered viewport HTML: no fabricated ticker/accession/date/%/count/excerpt; every data slot is `—`/"to be defined"/"none shown"/"planned". |
| AC-9 | Range label renders "— of —" (assert the string, assert NOT `/\d+\s*[–-]\s*\d+\s+of\s+\d+/`); count line has no integer. |
| AC-10 | List body is the empty-state block; no `<tr>`/row elements with data. |
| AC-11 | A Track-2 framing line is present in the Filings view. |
| AC-12 | No `>0<` coercion of an N/A; count/range are placeholders (covered by AC-9). |
| AC-13 | View rail still has exactly 4 buttons; Sector/Company/Compare/Qualitative render + switch as before; no 5th button. |
| AC-14 | No new Python route (grep `routes.py` unchanged); no `fetch(`/network in `renderFilingsView`; no external asset; `docker compose --profile e2e` headless render passes. |

## Test strategy

- **Frontend is static JS** (no unit-test harness for the sector app). Primary verification is the
  **Docker e2e headless render check** (`docker compose --profile e2e up --abort-on-container-exit
  --exit-code-from e2e`) — it must render the app, and QA will drive the flow: open Qualitative →
  click a "Filings →" → assert the Filings view regions + placeholder strings + Back.
- **Non-regression:** confirm the four existing views still render (e2e render check + manual
  drive). No `pytest` change expected (no Python touched) — but run `pytest` once to confirm the
  suite is still green (nothing server-side moved).
- **Self-verify (engineer, before handoff):** rebuild the `api` image (source is baked in, not
  mounted), run the e2e headless check, and eyeball screenshots of: the Filings view (all regions,
  placeholders visible), each form tab active, the pager, and Back returning to Qualitative.

## Honesty requirements called out (for QA)

- No fabricated filer/ticker/accession/date/count/%/excerpt (AC-8); range label "— of —" (AC-9);
  empty list body (AC-10); Track-2 framing present (AC-11); N/A never `0` (AC-12). These are the
  load-bearing checks — a single invented value fails the iteration.

---

## Handoff → Senior Frontend Engineer

Implement the above on a branch off `master` (`sector-v2-filings`). This is **frontend-only**;
**`senior-frontend-engineer` owns the whole change** (no backend stage). Order within the branch:

1. State keys + `renderViewport` route + `openFilings`/`backFromFilings` helpers.
2. `renderFilingsView` + `wireFilingsView` (breadcrumb, coverage/direction placeholder, count,
   language block, form tabs, empty list, pager) — all placeholders, "— of —" range label.
3. Replace the two `wireQualView` entry-point no-ops (the `.pa-qual-filings` buttons **and** the
   "Open filings in ClearyFi" text → button) with `openFilings(theme)`.
4. `.pa-fil-*` CSS.
5. Self-verify via Docker e2e headless render + screenshots; confirm the 4 existing views
   unaffected and `pytest` still green; then hand off to QA.

Open decisions: **none.** Proceed to implementation.

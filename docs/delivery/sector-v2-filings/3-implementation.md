# 3 · Implementation handoff — P5 Filings view (drill-in, placeholder)

Stage 3 (Senior Frontend Engineer). Reads `1-brief.md` + `2-architecture.md`. Branch:
**`sector-v2-filings`** (off `master` @ e43be08). **Frontend-only** — no Python/backend changes.

## What changed & why

Added the v2 **Filings view** (5th) as an **on-site theme drill** reached from the P4 Qualitative
view, replacing the two inert "Filings" no-ops with real navigation. It replicates the prototype's
§5.5 shape as an **honest Track-2 placeholder** — real controls (form tabs, pager, Back) over an
empty placeholder list; nothing fabricated.

### Files touched

- **`src/secfin/api/static/sectorapp.js`**
  - **State (`state` store):** added `filingsTheme`, `prevView`, `filingsForm` (default `"All"`),
    `filingsPage` (0) with a comment block explaining the Track-2 placeholder posture.
  - **Nav helpers:** `openFilings(theme)` (captures `prevView`, resets `filingsForm`/`filingsPage`,
    switches to `view="filings"`) and `backFromFilings()` (returns to `prevView || "qual"`).
  - **Routing:** `renderViewport` routes `view==="filings"` → `renderFilingsView`.
  - **`renderFilingsView(vp)` + `wireFilingsView()`:** breadcrumb (`<sector> › Risk theme
    › <theme>`, both real strings), Track-2 framing banner, coverage bar + direction chip
    (placeholder), filing-count line (`— · to be defined`), representative-language block
    (placeholder), form-type tabs (All/10-K/10-Q/8-K, real single-select), list header labels +
    honest empty body, pager (prev/next + `— of —` range label). `filingsTotalPages()` returns 1
    (one empty page — never a fabricated count) and `setFilingsPage` clamps so the ends are no-ops.
  - **Qualitative entry points (`renderQualView`/`wireQualView`):** the row "Filings →" button and a
    new **"Open filings in ClearyFi →"** button (promoted from static text inside the
    representative-language panel) both call `openFilings(theme)`. Removed the old `preventDefault`
    no-op.
- **`src/secfin/api/static/sectorapp.css`:** `.pa-fil-*` classes (breadcrumb, back, note, meta/
  coverage/direction/count, language block, form tabs, list header + empty state, pager) and
  `.pa-qual-langfoot`/`.pa-qual-langfilings` for the new language-panel button. **All colors via
  existing `var(--…)` tokens** (no hard-coded hex/rgb) — matches the app's paper-terminal theme.
- **`scripts/headless_check.js`:** added a `sectorapp-filings` render-check case — opens Qualitative,
  clicks a "Filings →" stub, asserts the drill renders (breadcrumb + empty list), **asserts the
  range label matches `/^—\s*of\s*—$/`** (guards against a fabricated "1–6 of 14"), and flips a form
  tab. Fails the check on any JS error in the drill/tab/pager wiring.

### Design note

The drill is deliberately a **quieter continuation** of the dense Qualitative grid: the breadcrumb
is the navigational spine, and the empty list is a calm "filings will list here" **invitation**
(direction, not error), reusing the P4 dashed-blueprint placeholder idiom so it reads as *deliberate
Track-2*, not broken/loading. No new rail button — Filings is drill-in only (prototype §4/§6).

## How I verified

- **JS/CSS syntax:** `node --check` clean on `sectorapp.js` and `headless_check.js`; no hard-coded
  colors in the new CSS.
- **Docker e2e headless render check** (`docker compose --profile e2e up --abort-on-container-exit
  --exit-code-from e2e`): **`sectorapp-filings` rendered with errors=0** (and the inline range-label
  assertion passed). All four existing sector-app views + the qual view still render errors=0.
- **Eyeballed `data/e2e-shots/sectorapp-filings.png`:** every region present; breadcrumb reflects
  the live sector + clicked theme; 10-K tab active after the drive; range "— OF —", count "—", empty
  list body, Track-2 banner. Matches the brief's ACs.

### ⚠️ Pre-existing e2e failure (NOT this change) — read before running the gate

The full headless check currently exits **FAIL**, but **only** on `sectorapp-company` /
`sectorapp-company-refocus` (8–13 × `502 Bad Gateway` on the Company view's data fetches for
synthetic symbol **900001** — an upstream fetch with no network in the e2e sandbox). **I confirmed
this is pre-existing:** I stashed all my frontend changes (reverting `sectorapp.js`/`.css` to
`master`) and re-ran those two cases — the identical 502s reproduce. So the red exit code is
**unrelated to P5**; it predates this branch. My `sectorapp-filings` case and every other case pass
with errors=0. (Flagging for QA so the pre-existing failure isn't misattributed to the Filings view;
it may warrant a separate fix/ticket for the company-view fixture, out of scope here.)

## Handoff → QA Tester

Branch `sector-v2-filings`. Verify against `1-brief.md` ACs (AC-1 … AC-14). Suggested drive:

1. Open `/sector-analytics` → click the **Qualitative** rail → click a risk-theme **"Filings →"** →
   confirm you land on the Filings view (AC-1) with the breadcrumb reflecting that theme (AC-3).
2. Back to Qualitative → expand a theme's language panel → click **"Open filings in ClearyFi →"** →
   same Filings view (AC-2).
3. In Filings: click each **form tab** (single-select, keyboard) — list stays the same empty state
   (AC-6); click **Prev/Next** (no-op at ends, no error) (AC-7).
4. Click **Back** → returns to Qualitative with state preserved, no external nav (AC-5).
5. **Honesty (load-bearing):** confirm **no** fabricated ticker/accession/date/count/%/excerpt
   anywhere (AC-8); **range label = "— of —"** not "1–6 of 14" (AC-9); **empty list body**, not
   zero-rows (AC-10); Track-2 framing present (AC-11); nothing shows `0` for N/A (AC-12).
6. **Non-regression:** the four existing views still work; view rail still 4 buttons, no 5th (AC-13).
7. **Self-contained:** no new backend route (`routes.py` unchanged), no network from the Filings
   view, no external assets (AC-14).

**Gate note:** run the e2e check for the `sectorapp-filings` case (errors=0) and treat the
`sectorapp-company` 502 as the documented pre-existing failure above (reproduce by stashing this
branch's static changes if you want to re-confirm). This is a **placeholder/layout-only** iteration
→ per the roadmap it may be accepted at the QA-tester level, but the 4b operator questionnaire is
still generated + offered.

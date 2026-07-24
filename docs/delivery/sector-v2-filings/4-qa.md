# 4 · QA report — P5 Filings view (drill-in, placeholder)

Stage 4 (QA Tester). Branch: **`sector-v2-filings`**. Tested against `1-brief.md` ACs by
**exercising the running app** (Docker e2e + an independent puppeteer drive), not by reading the diff.

**Verdict: PASS — pending operator manual UI verification.** All 14 acceptance criteria pass with
observed evidence; `pytest` green; the new Filings view renders with zero console errors. Because the
change introduces **new interactive controls + navigation** (a new view, two entry points, form
tabs, a pager, Back), it carries the operator hands-on gate — though, per
`ROADMAP_SECTOR_APP_V2.md` (placeholder/layout-only iterations), the operator **may accept it at the
QA-tester level**. Questionnaire emitted: `4b-manual-verification.md`.

## Test environment

- `docker compose --profile test run --rm test` → **511 passed, 6 skipped** (no Python changed;
  non-regression confirmed).
- `docker compose --profile e2e up …` → the new `sectorapp-filings` case **rendered with errors=0**;
  all four existing sector-app views + the qual view still errors=0.
- Independent QA drive (`qa_filings_drive.js`, puppeteer against the live e2e-app) → **QA DRIVE:
  PASS**, every AC assertion green, no console errors.
- Screenshots: `data/e2e-shots/sectorapp-filings.png` (10-K tab active), `qa-filings-main.png`
  (All tab active after cycling 10-Q→8-K→All).

## Pass/fail per acceptance criterion

| AC | Verdict | Evidence |
|---|---|---|
| **AC-1** row "Filings →" opens the Filings view | ✅ PASS | QA drive `AC-1`: click → `.pa-fil-list` present, `view="filings"`. |
| **AC-2** "Open filings in ClearyFi →" opens it too | ✅ PASS | QA drive `AC-2`: expand language panel → click the button → Filings view renders. |
| **AC-3** breadcrumb = `<sector> › Risk theme › <clicked theme>` | ✅ PASS | QA drive `AC-3`: `Business Services›Risk theme›Profitability & returns` (matches the clicked row). |
| **AC-4** all §5.5 regions render | ✅ PASS | Screenshots: breadcrumb, coverage bar + PLANNED direction chip, FILINGS count line, representative-language block, All/10-K/10-Q/8-K tabs, list header + body, pager + range. |
| **AC-5** Back returns to the previous view (qual), state preserved, no external nav | ✅ PASS | QA drive `AC-5`: `#paFilBack` → `.pa-qual-banner`/`.pa-qual-rtrow` present; no `location`/external URL. |
| **AC-6** form tabs operable, single-select, keyboard | ✅ PASS | QA drive `AC-6`: 10-Q→8-K→All each leaves exactly one `.pa-fil-tab.active` = clicked form; buttons are native `<button>` (Enter/Space fire click); list unchanged. |
| **AC-7** pager operable; `filingsPage` reset to 0; ends no-op | ✅ PASS | QA drive `AC-7`: prev/next `disabled` at the single empty page (clicks are no-ops, no throw); `openFilings` resets `filingsPage=0`; `setFilingsPage` clamps. |
| **AC-8** no fabricated ticker/accession/date/%/count/excerpt | ✅ PASS | QA drive `AC-8` honesty scan of `#viewport` text: no `%`, no EDGAR accession `\d{10}-\d{2}-\d{6}`, no ISO date. Every slot is `—`/"to be defined"/"none shown"/"planned". |
| **AC-9** range label "— of —" (not "1–6 of 14"); count a placeholder | ✅ PASS | QA drive `AC-9`: `range='— of —'` matches `/^—\s*of\s*—$/`; count = `Filings— · to be defined` (no digit). |
| **AC-10** list body an honest empty state, no data rows | ✅ PASS | QA drive `AC-10`: `.pa-fil-empty` = "Filings will list here … to be defined · none shown. No filing is fabricated." — no row elements. |
| **AC-11** Track-2 framing present | ✅ PASS | QA drive `AC-11`: `.pa-fil-note` contains "TRACK 2 · NOT YET DERIVED FROM FILINGS" + the honest explanation. |
| **AC-12** N/A never rendered as `0` | ✅ PASS | Count + range are placeholders, no `0` anywhere in the view (subsumed by AC-8/AC-9). |
| **AC-13** four existing views unchanged; rail stays 4 buttons, no 5th | ✅ PASS | QA drive `AC-13`: `.pa-rail-btn[data-view]` = `["sector","company","compare","qual"]`; no `filings`. Existing views render errors=0 in e2e. |
| **AC-14** frontend-only, CSP-safe, no new route/network/external asset | ✅ PASS | `git diff` touches no `.py`; no `fetch`/XHR in `renderFilingsView`/`wireFilingsView`; no external URL in the new CSS; e2e render passes. |

## Review questionnaire

1. **What shipped** — From the Qualitative view, a risk theme's "Filings →" (or "Open filings in
   ClearyFi →") now opens a new on-site **Filings view**: a breadcrumb back to the theme, a Track-2
   "not yet derived" banner, placeholder coverage/direction/count, a representative-language
   placeholder, working form-type tabs (All/10-K/10-Q/8-K), an empty filing list, and a pager with a
   "— of —" label. A **Back** link returns to Qualitative. Everything resolves in-app; nothing is
   fabricated.
2. **Surfaces touched** — `/sector-analytics` only: `sectorapp.js` (state keys, `renderViewport`
   route, `openFilings`/`backFromFilings`, `renderFilingsView`/`wireFilingsView`, the two Qualitative
   entry points) and `sectorapp.css` (`.pa-fil-*`, `.pa-qual-langf*`). `scripts/headless_check.js`
   gained a `sectorapp-filings` render case. No API/backend surface.
3. **AC → evidence** — see the table above; every AC is tied to a QA-drive assertion or a named
   screenshot.
4. **States exercised** — **Populated-shell / empty-data** (the whole view is the placeholder empty
   state — drove it and read the empty list + placeholders); **interaction states**: form-tab
   selected state (cycled three tabs, verified single-select), pager disabled-at-ends state, Back
   navigation. No loading/error state applies (the view fetches nothing). Non-placeholder loading/
   error paths belong to other views and were left untouched (still errors=0).
5. **Edge cases probed** — **N/A vs 0**: the count and range render placeholders, never `0` (AC-8/9/
   12). **Pager at the ends**: both prev/next disabled over the single empty page — clicking is a
   no-op, no throw (AC-7). **Both entry points**: row button and language-panel button both route
   correctly (AC-1/2). **Breadcrumb reflects the actual click**, not a hard-coded string (AC-3). 13F/
   restatement/multi-class/429/502 paths are **N/A** to this view (it reads no data). Noted: the
   pre-existing Company-view 502 (below) is unrelated.
6. **Honesty contract** — Confirmed: Track-2 framing banner present (deliberate, not broken);
   **no fabricated** filer/ticker/accession/date/%/count/excerpt (scanned the rendered text);
   range "— of —" not a fake total; empty list body, not zero-rows; **no missing value shown as
   `0`**; no over-claiming copy (no alpha/price/timing language). The only "real" strings are the
   live sector label + the drilled theme label (both genuinely known) and static UI/control labels.
7. **Deltas from the brief** — None material. Implementation note (as designed in stage 2): "Open
   filings in ClearyFi" was static text in P4; it was correctly promoted to a real button — verified
   as the second entry point (AC-2). Nothing built beyond the brief. No AC went unverified by
   automation.
8. **Residual risk** — Low. The view reads no data, so there's no data-honesty surface to regress
   beyond the placeholder copy. What a human should confirm by hand: the **felt** interaction —
   keyboard focus order across tabs/pager/Back, and that the drill→Back→re-drill loop feels right in
   a live browser (the scripts confirm it functionally). Worst-case-if-wrong: an entry point that
   silently no-ops (regressing to the P4 dead-end) — but both are verified live.

## UI/UX review

- **States**: the empty state is honest and *intentional* — dashed "blueprint" cards + mono "to be
  defined / none shown / planned" tags, matching the P4 Qualitative idiom, so it reads as deliberate
  Track-2, not a load failure. No broken/partial chart, no zero passed off as data.
- **Legibility & layout**: at 1280px everything sits within the 960px content column; header labels
  (Filer/Form/Filed/Section/Cited passage) align, no clipping/overflow. The 900px responsive rule
  tightens the header grid. Breadcrumb wraps gracefully (flex-wrap).
- **Theme**: all new CSS uses existing `var(--…)` tokens — no hard-coded colors. (The sector app is
  a single "paper terminal" light theme by design; the new view inherits it consistently.)
- **Copy**: active voice, sentence case, direction-giving ("Filings will list here — …"); no
  over-claiming. Control labels name what the user recognizes (form types, Back).
- **Affordances & a11y**: tabs are `role="tab"` with `aria-selected`; the active tab shows a filled
  accent-wash state; Back and pager are real buttons (focus-visible via the app's button styles);
  disabled pager buttons carry the `disabled` attribute + dimmed style.
- **Consistency**: reuses the `.pa-qual-*` placeholder vocabulary and the app's control styling
  (rail/dd button idioms) rather than a one-off look — the drill reads as part of the same app.

## Defects

- **None attributable to this change.**
- **Pre-existing (NOT this change) — `sectorapp-company` / `sectorapp-company-refocus` e2e 502s.**
  The full headless check exits FAIL on the Company view fetching data for synthetic symbol 900001
  (8–13 × `502 Bad Gateway`, an upstream fetch with no network in the e2e sandbox). **Confirmed
  pre-existing:** stashing this branch's `sectorapp.js`/`.css` (reverting to `master`) and re-running
  those two cases reproduces the identical 502s. Unrelated to P5; every other case, including
  `sectorapp-filings`, passes errors=0. Recommend a separate ticket for the company-view fixture;
  **out of scope here.** (Flagged so the red exit code isn't misattributed to the Filings view.)

## Manual UI verification

**Classification: interactive/logic change** (new view, two navigation entry points, form tabs,
pager, Back) → operator hands-on requested. Per `ROADMAP_SECTOR_APP_V2.md` this placeholder-only
iteration **may instead be accepted at the QA-tester level** — the operator's call.

Run against a live app (`docker compose up api` → `http://localhost:8000/sector-analytics`, or the
running instance):

1. Open `/sector-analytics`. → The Sector view loads (scorecard). **Expected:** view rail shows
   Sector / Company / Compare / Qualitative (4 buttons).
2. Click **Qualitative** in the view rail. → The Track-2 placeholder view with risk-theme rows.
3. Click a row's **"Filings →"**. → Navigates to the **Filings view**; breadcrumb reads
   `<sector> › Risk theme › <that theme>` (matches the row). *(AC-1, AC-3)*
4. Read the view top-to-bottom. **Expected:** Track-2 banner; COVERAGE empty bar + "—"; DIRECTION
   "planned"; FILINGS "— · to be defined"; representative-language placeholder; **no** number,
   ticker, accession, date, %, or excerpt anywhere. *(AC-4, AC-8, AC-11)*
5. Check the list + pager. **Expected:** header labels only (Filer/Form/Filed/Section/Cited
   passage); an empty "Filings will list here … none shown" body; range label **"— of —"**;
   Prev/Next disabled. *(AC-9, AC-10)*
6. Click **10-K**, then **10-Q**, then **8-K**, then **All** (try Enter/Space via keyboard too).
   **Expected:** exactly one tab highlighted at a time; the list stays the same empty state; no
   error. *(AC-6)*
7. Click **← Back**. **Expected:** returns to the **Qualitative** view (not Sector), your sector/
   theme intact; no page reload, no jump to EDGAR. *(AC-5)*
8. Expand a theme (click the row body) → click **"Open filings in ClearyFi →"** in the language
   panel. **Expected:** opens the Filings view for that theme. *(AC-2)*
9. Confirm the view rail still shows only the **four** buttons (no "Filings" rail item). *(AC-13)*

**Gate:** verdict stays **"PASS — pending manual UI verification"** until the operator runs
`4b-manual-verification.md` and records a verdict — *or* explicitly accepts at the QA-tester level
(permitted for this placeholder-only iteration). A ❌ on any row is a defect → back to
`senior-frontend-engineer`.

## Handoff

- **Verdict:** PASS — pending operator manual UI verification (see `4b-manual-verification.md`).
- **Evidence:** 511 pytest passed; e2e `sectorapp-filings` errors=0; QA drive all-green; two
  eyeballed screenshots.
- **Not ready to deploy** on automated evidence alone — this is an interactive change; surface the
  questionnaire to the operator. A completed/accepted `4b` unlocks a deploy *request* (operator-
  gated), never the deploy itself.
- **Pre-existing** company-view 502 noted; not a blocker for P5.

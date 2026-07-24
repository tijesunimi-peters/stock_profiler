# P4 — Qualitative view v2 (placeholder expansion) · Implementation handoff

**Stage:** 3 — Senior Frontend Engineer (backend stage N/A)
**Branch:** `sector-v2-qualitative` (stacked on `sector-v2-compare`; **not** committed — working tree)
**Input:** `2-architecture.md`

## What changed & why

Expanded the shipped Qualitative view (altitude 4) from the banner + partial placeholder to the v2
prototype's fuller **honest-placeholder** layout. Frontend-only; no Python, no route, no data.

**`src/secfin/api/static/sectorapp.js`**
- Added state: `qualThemeOpen` (single-open theme whose representative-language panel is expanded)
  and `qualFilerOpen` (map of revealed filer-count panels). Both drive **empty** reveals only.
- Added `QUAL_DISCLOSURE` — the 7 Disclosure-landscape blocks as `[title, source-line, reveal?]`
  **labels only** (Cybersecurity, Critical Audit Matters, Auditor landscape, Risk-factor volume,
  Non-GAAP & charges, Late & deficient filings, Human-capital & climate). Descriptions state *what
  the block will show + its SEC source*, never a value.
- Added `qualReveal(id, label)` helper — a wired click-to-reveal control that, when open, renders an
  honest "…to be defined · none shown. No tickers are fabricated." panel. **Never lists a ticker.**
- Rewrote `renderQualView`: kept the honesty banner + closing foot verbatim; made each of the 7
  risk-factor rows a keyboard-operable `role="button"` that toggles an inline representative-language
  **empty** panel; added a persistent inert `Filings →` affordance per row; added a filer-count
  reveal in the matrix; added a new **02 Disclosure landscape** section rendering the 7 blocks (three
  carry a filer reveal). Ends by calling `wireQualView()`.
- Added `wireQualView()` — row click/Enter/Space toggles `qualThemeOpen`; `Filings →` is a
  `stopPropagation` + `preventDefault` **no-op** (P5 Filings view not built); `[data-qual-filer]`
  toggles `qualFilerOpen[id]`. All re-render via `renderApp()` (the app's single idiom).

**`src/secfin/api/static/sectorapp.css`** — extended the `pa-qual-*` block: clickable/hoverable row
with focus ring + `.is-open`, the `Filings →` affordance (muted mono, dashed underline — *not* an
action color), the representative-language + filer-count empty panels, the reveal control + caret,
and the 7-block `pa-qual-landscape`/`pa-qual-block` blueprint cards. Reused existing theme tokens
(no hard-coded colors); **no favorability color**; adjusted the mobile row grid.

**`scripts/headless_check.js`** — strengthened the existing `sectorapp-qual` e2e step to also wait
for the landscape blocks, expand a theme (assert `.pa-qual-langpanel`), and open a filer reveal
(assert `.pa-qual-filerpanel`) — so a JS error in either new handler now fails the check.

## How I verified

- `docker compose build api` (image bakes in `static/`), then
  `docker compose --profile e2e up --abort-on-container-exit --exit-code-from e2e`.
- **`sectorapp-qual` rendered `errors=0`** — the new landscape section + theme-expand + filer-reveal
  all render and toggle with **no console/JS error** (the step now drives those interactions).
- **Eyeballed `data/e2e-shots/sectorapp-qual.png`** (light theme): banner + honesty copy intact; 7
  risk rows with empty dashed bars + `—` + `PLANNED` + `Filings →`; one row expanded to the honest
  language empty state; side cards + matrix empty states; matrix filer-reveal open showing "…none
  shown. No tickers are fabricated."; all 7 Disclosure-landscape blocks with source lines + "to be
  defined" bodies; closing "Nothing … derived … or estimated." No figure/ticker/count/●/direction
  word anywhere. No good/bad color.

## Known / out of scope (for QA)

- **Overall e2e exit is non-zero, but NOT from this change.** It fails on the **pre-existing
  Company-view 502 baseline** (`sectorapp-company` / `-refocus`, `symbol=900001`) — documented in
  `docs/delivery/sector-v2-compare/4-qa.md` (AC-9, "reproduced on clean base, out of P3 scope"). My
  diff touches only qual JS/CSS + the qual e2e step and cannot affect Company routes; the qual step
  itself is `errors=0`. Don't read the raw exit code as a P4 defect.
- **`pytest`:** no Python touched → expected to match the P2/P3 baseline (511 passed, 6 skipped). QA
  should still run it (AC-9).
- **Dark theme:** verified by construction (reused theme tokens only, like the rest of `pa-qual-*`);
  the e2e shot is light — QA should confirm dark visually.
- **`Filings →`:** intentionally inert (P5 owns the Filings view). Clicking does nothing.

## Follow-up (post-acceptance) — Qualitative right rail

After the operator's interactive acceptance flagged the empty far-right region (Qualitative had no
right rail while Sector/Company/Compare do), the operator chose to **add a "How to read" rail**
(over centering the content or leaving as-is). Implemented on the same branch:
- `sectorapp.js`: added `qualRailHtml()` — two honest cards (a "Qualitative disclosures · Track 2"
  note + a "How to read this" card with the "nothing derived/estimated" message and a Methodology
  link); **no data**. Wired it via `rightRailHtml()` dispatch + the shell condition in `renderApp`
  (added `|| state.view === "qual"`). Reused existing `pa-rr-*` classes → **no CSS change**.
- The rail hides < 1240px (existing CSS), same as the other views.
- **Tradeoff:** at ~1240–1280px the 262px rail narrows the content, so some theme names wrap to two
  lines — degrades gracefully (no clip/overflow), roomier on wider screens.
- Verified: `docker compose build api` + e2e → `sectorapp-qual errors=0` (only the pre-existing
  Company-502 baseline nonzero); screenshot `sectorapp-qual.png` shows the rail rendered.

## Handoff → QA Tester

Drive the real UI on `/sector-analytics` → Qualitative. Verify AC-1…AC-10 from `1-brief.md`. Probe:
**expand every risk-theme row and open every filer reveal** and confirm each revealed panel is an
honest empty state (AC-2/AC-6/AC-10 — the load-bearing no-fabrication rule); all 7 landscape blocks
present (AC-4); `Filings →` no-ops without error (AC-7); both themes legible + no favorability color
(AC-8); `pytest` green and Sector/Company/Compare + view-switching unaffected (AC-9). Placeholder-
only view → acceptable at the QA-tester level per the roadmap (no operator hands-on gate required).

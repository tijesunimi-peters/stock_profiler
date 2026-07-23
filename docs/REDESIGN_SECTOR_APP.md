# Redesign — Sector Analytics single-page app ("paper terminal")

A **from-scratch** redesign of the sector surface, driven by the external prototype in
`docs/design/sector-app-prototype/` (`HANDOFF.md` + `prototype.dc.html` + `preview.webp`). It
**supersedes the previous `/sectors` redesign** (Phases 0–3, `docs/REDESIGN_SECTOR_OVERVIEW.md`) at
the UI level — the **backend is kept** (theme scores, DuPont/spreads/lifecycle endpoints); only the
page is rebuilt.

Status: **scoping (2026-07-22).** Not yet handed to `/deliver`.

## Locked decisions (operator, 2026-07-22)

- **Full four-view single-page app**: Sector · Company · Compare · Qualitative, switched by an
  in-page left **view rail**, with **selection state persisting across all four views**
  (`{view, sectorIdx, subIdx, expandedTheme, decompTheme, focalTicker, compareA, compareB}`).
- **No favorability color** (prototype §3.1) — direction via **arrow glyphs (↑ ↓ →) + track
  position only**, single terracotta accent. This **reverts the Phase 2 favorability trio**
  (`--positive/--caution/--negative`) and restores the original `STYLE_GUIDE §7` "never color alone"
  rule. The favorability tokens are removed from the new sector UI.
  - **⚠ REVERSED (operator, 2026-07-22 — Phase 1 manual UI verification):** favorability color is
    coming **back**. The `--positive/--caution/--negative` trio (the documented `STYLE_GUIDE §1`
    scorecard exception) will signal up/down direction on the score **deltas + biggest shifts** (and
    consistently across views), **always paired with the arrow glyph/position** (never color alone),
    with the score/value kept a neutral `--ink` (still a **position, not a verdict**). The decision is
    recorded here + in honesty-flag 3 below; the code + full doc rewrite are deferred to **followup
    F4** (`docs/delivery/sector-app-followups.md`).
- **Keep the backend** — reuse the shipped Track-1 endpoints; do **not** fabricate the synthetic
  parts of the prototype. Where the backend can't honestly fill a prototype element, omit/defer it
  or mark it unmistakably illustrative (see per-view mapping).

## Design language ("paper terminal")

The prototype's tokens are **identical to our existing palette** (`static/style.css` `:root`), so
this is our design language in a new, more polished layout — **not** a new visual identity.
Hanken Grotesk + IBM Plex Mono; warm paper surfaces; 12–14px cards with the soft shadow
`0 18px 40px -26px rgba(40,30,15,.35)`; mono uppercase micro-labels (9–11px, ls 0.06–0.12em).

**Stack:** rebuild in our **vanilla-JS + vanilla-CSS, CSP-safe** app (no Tailwind, no React, no
CDN — the prototype ships all three). The `.dc.html` is the **layout/spacing/interaction
reference**, not code to port.

## Shell & IA

Fixed 210px sidebar (brand + nav) → sticky top header (search stub ⌘K + API-ref) → main (max
1440px): page title + as-of note → **persistent sector control bar** (sector dropdown · sub-industry
pills · meta row: filers/period/coverage · status legend · "pin to compare") → two-column body:
**132px view rail** (Sector/Company/Compare/Qualitative) + content.

Global state is one store; every control mutates it and re-renders the active view. Sector/period/
company/compare-pair persist across view switches (prototype §7).

## Per-view mapping — prototype (synthetic) → real backend

| View | Real data source | Honest gaps / Track-2 |
|------|------------------|-----------------------|
| **Sector** | `/v1/sectors/theme-scores` (scores + decomposition), `/v1/sectors/{group}` (DuPont), `/v1/sectors/{group}/spreads` (drill-down), `/v1/sectors/{group}/lifecycle` | Only **5 of 7 themes scored**; Accounting quality + Structure & activity render as **"not yet scored"** (their constituents are Track-2/filing-metadata). **Filing-event feed** (8-K/Form 4/S-1) = Track-2 → omit or clearly-illustrative. **Sub-industry pills** (SIC-4) + **coverage %/filed %** = no backend → omit or "full peer set", no fabricated %. |
| **Company** (Phase 2) | `/v1/companies/{symbol}/peers`, `/peers/{metric}/distribution`, `/metrics` + **a NEW read endpoint** for per-company values | **LOCKED (operator 2026-07-22): full dot-cloud** — add a new read endpoint returning **each company's value** for a sector+metric (from `metric_values` joined by SIC — Track 1, over existing tables) so the peer dots are real + clickable (click-to-refocus). **Focal company is search-driven** (the ⌘K ticker search; its SIC gives the peer set; empty state until one is picked). Percentiles favorability-adjusted, N/A·N/M excluded. **Phase 2 is full-stack** (backend endpoint first, then frontend). |
| **Compare** | `/v1/sectors/theme-scores` (both sectors' theme scores → paired composite bars), sector metric medians from `/sectors/{group}` + `/spreads` | Sector-vs-sector (the prototype's real intent); the existing `/compare` page is company-vs-company and is unrelated. True-length bars, "lower is better" text marker on inverted metrics, **no winner**, A=accent / B=GAAP-blue **categorical identity only**. |
| **Qualitative** | **NONE — Track 2.** Risk-theme clustering, going-concern, litigation, per-filer signals are all free-text/filing-metadata we do **not** ingest. | **Honesty landmine — see below.** Must be built **unmistakably illustrative** ("Track 2 · not derived from filings · illustrative") or a "coming" placeholder. Do **not** present synthetic going-concern/litigation as real. |

## Scoring / decomposition

Keep the shipped scoring (z-score of per-sector medians, equal weight) but adopt the prototype's
**"provisional" framing** + the **click-a-score-to-decompose** interaction. The decomposition reads
the endpoint's constituents (`median`, favorability-oriented `oriented_z`) — presented as a
contribution bar per constituent, no favorability color (the bar is a single-accent magnitude, sign
via ↑/↓). Provisional banner on the scorecard, as in the prototype.

## Honesty flags (must resolve before/while building)

1. **Qualitative view is Track 2** (CLAUDE.md guardrail 1). **LOCKED (operator 2026-07-22): a
   "Coming — Track 2" stub view** — build the view's frame with a prominent "Track 2 · not yet
   derived from filings" message and **no fabricated figures**. The rail entry stays; the panel is
   an honest placeholder. (Phase 4 — shipped as the stub.)
   - **UPDATED (operator, 2026-07-22 — prototype-fidelity directive):** the view will be rebuilt to
     the **prototype's full Qualitative layout** (risk matrix / going-concern / litigation / per-filer
     signals), with **every cell an empty, clearly-labeled placeholder** — **still no fabricated
     figures** (the Track-2 rule holds; the layout is replicated, the data is a placeholder). Tracked
     as a followup; **do this last** (Sector → Company → Compare → Qualitative). The prominent "Track
     2 · not yet derived from filings" framing must remain so the placeholder grid can't be mistaken
     for imminent data.
2. **No fabricated coverage % / sub-industry / filing feed** — ~~omit or mark illustrative~~; never
   show a made-up "94% filed". **REFRAMED (operator, 2026-07-22 — prototype-fidelity directive):**
   these are no longer *omitted* — the app now matches the prototype's layout and renders each as a
   **clearly-labeled EMPTY placeholder** ("placeholder — to be defined"), which the operator fills
   later. The rule that survives unchanged: **never a fabricated value** — a placeholder must be
   unmistakably empty, never dressed as real data. See the governing directive in
   `docs/delivery/sector-app-followups.md`.
3. ~~**No favorability color anywhere** in the new sector UI (revert Phase 2).~~ **REVERSED
   (operator, 2026-07-22):** favorability color returns per the locked-decisions note above —
   direction color on deltas + biggest shifts (and across views), **paired** with the arrow/position
   (never color alone), score kept neutral. Implementation deferred to **followup F4**.
4. Everything real stays traceable + carries the status vocabulary (OK / ≈ approx / ∅ N/A / ~ N/M).

## Proposed phasing (each a `/deliver` run, branched, stacked)

1. **Shell + Sector view** — **BUILT** (`sector-app-shell` branch): new route `/sector-analytics`
   (existing `/sectors` untouched); self-contained `static/sector-analytics.html` + `sectorapp.js` +
   `sectorapp.css` (reuses `style.css` tokens + `app.js` helpers; no favorability color). Shell
   (sidebar/header/control bar/view rail + persistent store) + Sector view on real data (scorecard
   5+2, provisional framing, click-score decomposition, click-tile peer strip + drill-down,
   biggest-shifts — all arrow-glyph, no color). Company/Compare/Qualitative rail entries render as
   inert stubs. **This is the "sector page from scratch."**
2. **Company view** — **BUILT** (`sector-app-company`, stacked on Phase 1): new read endpoint
   `GET /v1/sectors/{group}/{metric}/companies` (per-company values, `metric_values` ⨝
   `company_profiles`) + the Company view in `sectorapp.js` — search-driven focal (⌘K / `?symbol=`),
   a derived per-theme percentile rail + composite card, per-metric **dot-plots** (dot per filer,
   client-computed IQR band + median, focal `--accent` diamond, click-to-refocus). No favorability
   color.
3. **Compare view** — **BUILT** (`sector-app-compare`, stacked on Phase 2): the Compare view in
   `sectorapp.js` — **frontend-only** (reuses `/v1/sectors/theme-scores` all-sectors +
   `/sectors/{group}/spreads`, no new endpoint). Two sector selectors (A `--accent` / B
   `--gaap-color`, **categorical identity only**); paired **true-length** composite + per-theme
   bars with a signed, non-verdict gap label (ink weight, `|gap|≥10` fuller); a **derived**
   composite row (mean of scored themes, labeled); paired **metric-median cards** (per-metric
   normalized bars, raw value at bar end, "lower is better" text marker on inverted). Deferred/
   absent themes render "not scored"; a sector missing a metric renders **N/A** — never 0. The
   control-bar "pin to compare" jumps here with A pinned. **No winner, no favorability color.**
4. **Qualitative view** — **BUILT** (`sector-app-qualitative`, stacked on Phase 3): the honest
   **"Coming — Track 2" placeholder** frame in `sectorapp.js` (replaces the inert stub) —
   **frontend-only**. A prominent "Track 2 · not yet derived from filings" banner + a plain-language
   "why" (structured-data-only / Track 1; free-text narrative is a deliberate later decision) + a
   grid of **planned-category cards** (risk-theme landscape, emerging risks, going-concern watch,
   litigation, per-filer signals) as **labels + one-liners only** — **no fabricated figures, counts,
   ● flags, chips, or matrices**. The locked honesty decision (flag 1) realized: unmistakably
   "coming", never presented as data.

**The four-view app is now complete** (Sector · Company · Compare · Qualitative). Phase 1 delivered
the actual sector page; 2–4 completed the app.

## What this supersedes / preserves

- **Supersedes:** the `/sectors` UI shipped in `REDESIGN_SECTOR_OVERVIEW.md` Phases 1–3 (single-
  sector shell, scorecard-with-color, peer strip/shifts/drill-down). Kept on `master`'s history but
  replaced on the page.
- **Preserves:** all backend from Phase 0 (theme scores + batch + endpoint) and the DuPont/spreads/
  lifecycle endpoints. No `src/secfin/` change expected except possibly one new read endpoint for
  the Company dot-plot (Phase 2).

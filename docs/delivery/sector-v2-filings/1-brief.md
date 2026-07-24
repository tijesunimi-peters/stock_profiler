# 1 · Product brief — Sector Analytics v2 **P5: Filings view** (drill-in, placeholder)

Stage 1 (Product Manager) handoff. Task slug: `sector-v2-filings`.
Source: `docs/ROADMAP_SECTOR_APP_V2.md` P5 · `docs/design/sector-app-prototype-v2/HANDOFF.md` §5.5 + §6.

---

## Problem / user

The v2 Sector Analytics app ("ClearyFi", `/sector-analytics`) has, as of P4, a Qualitative view
whose risk-theme rows and representative-language panel each expose a **"Filings →"** affordance
(and an "Open filings in ClearyFi" link). Both are currently **inert no-ops** (`wireQualView`,
`sectorapp.js`) — they *look* clickable but do nothing, which is a dead end for anyone exploring a
risk theme.

**User:** a developer/analyst browsing one sector's disclosures who clicks a risk theme's
"Filings →" expecting to see *which filings* that theme was drawn from. **Solved when:** the click
lands them on an on-site Filings view that replicates the prototype's §5.5 shape (breadcrumb, form
tabs, paginated list) — and, because the underlying data is Track-2 (full-text-parsed narrative we
do not yet ingest), does so as an **honest placeholder**: the layout and controls are real, every
data cell is an unmistakable "to be defined / none shown", and **nothing is fabricated**.

This is **P5 of the v2 phasing** (P0–P4 merged to master). It is a **frontend-only, placeholder
layout** iteration — the same classification the roadmap assigns the Filings view (Track-2 →
placeholder), and the same honesty posture as the P4 Qualitative view it is reached from.

## Scope (the smallest slice that delivers value)

Add an on-site **Filings drill-in view** to `/sector-analytics`, reached from the P4 Qualitative
view's existing "Filings →" buttons and "Open filings in ClearyFi" link (replace their inert
no-ops with real navigation). Per prototype §5.5, the view renders:

1. **Breadcrumb** — `sector › Risk theme › <theme name>` (theme name from the row that was clicked;
   sector name from the live selection). Real strings from live selection state — the sector and
   theme label are genuinely known, so these are **not** placeholders.
2. **Coverage + direction chip** — the theme's share-of-filers coverage bar + YoY direction chip
   (new/rising/fading/stable), mirroring the Qualitative row. Coverage/direction in the P4
   Qualitative view are themselves placeholders → render them here with the **same placeholder
   treatment** (no fabricated %).
3. **Filing count** — a "N filings" figure → **placeholder** ("— filings" / "to be defined"), never
   a fabricated integer.
4. **Representative-language block** — verbatim-excerpt panel (the same shape as the P4 Qualitative
   representative-language panel) → **placeholder** (no fabricated excerpt / source / date).
5. **Form-type tabs** — `All / 10-K / 10-Q / 8-K`. **Real, operable controls** (clickable, keyboard-
   operable, single-selected, active state) that filter a **placeholder (empty) list** — i.e. they
   toggle `filingsForm` state and re-render, but every tab resolves to the same honest empty state.
6. **Paginated filing list** — the prototype's 6-per-page pager: prev/next + numbered pages + a
   "1–6 of 14"-style range label. **Real, operable pager controls** over a **placeholder (empty)
   list**: the range label must **not** show a fabricated count (render "— of —" or equivalent), and
   the list body is an **honest empty state** ("filings will list here · to be defined · none
   shown"). No fabricated rows (no filer ticker, company name, accession no., filed date, section
   label, or cited passage).
7. **Back link** — returns to the **previous view** (`prevView`, captured on open; the Qualitative
   view in practice). Everything resolves in-app — **no EDGAR redirect**.

State (per prototype §6, add to the single store): `filingsTheme` (the drilled theme label),
`prevView` (the view to return to), `filingsPage` (reset to 0 on open), and `filingsForm` (the
active form tab, default "All"). "Filings →" and "Open filings in ClearyFi" both set
`filingsTheme` + `prevView` and switch `view` to `filings`.

### Placement decision (PM call — no operator fork needed)

Filings is a **drill-in sub-view reached from Qualitative**, **not** a 5th top-level view-rail
button. This matches the prototype: §4's rail is the four items Sector/Company/Compare/Qualitative,
and §6's model reaches Filings via the Qualitative "Filings →" affordance with a Back link to
`prevView`. The view rail stays **four buttons**; Filings has no rail entry and is only reachable by
drilling in. (The state notes flagged this for PM confirmation — confirmed: drill-in only.)

## Out of scope (do not build)

- **Any real filings data.** No fetching, listing, or counting of actual filings; no EDGAR
  full-text search; no accession numbers, filer names, tickers, dates, sections, or excerpts —
  real or synthetic. The whole view is a placeholder layout. (Risk-factor themes, representative
  language, and per-theme filing lists are **Track-2** — full-text-parsed narrative we do not
  ingest; per `CLAUDE.md` and roadmap decision 3 they stay honest placeholders.)
- **A 5th view-rail button** (see placement decision — drill-in only).
- **Backend work** — no new endpoint, route, or aggregation. The Filings view reads nothing from
  the API. (The optional "make Track-2 real" work is roadmap **P6**, explicitly separate and not
  required here.)
- **Wiring the sidebar/search/other stubs** — unchanged; still `preventDefault` no-ops.
- **P6/P7** (backend spikes; `/sectors` migration swap) — later iterations.
- Any market data, price, valuation multiple, or Track-2 summarization (standing constraints).

## Acceptance criteria (what QA will check — observable & testable)

**Navigation & shape**
- **AC-1** From the Qualitative view, clicking a risk theme's **"Filings →"** navigates to the
  Filings view (no longer an inert no-op); the app shows the Filings view, not the Qualitative view.
- **AC-2** The "Open filings in ClearyFi" link in the representative-language panel also opens the
  Filings view for that theme.
- **AC-3** The Filings view shows a **breadcrumb** reading `<sector> › Risk theme › <theme name>`,
  where `<sector>` is the live-selected sector and `<theme name>` is the theme whose "Filings →" was
  clicked (i.e. the breadcrumb reflects the actual click, not a hard-coded string).
- **AC-4** The Filings view renders all §5.5 regions: coverage + direction chip, filing-count line,
  representative-language block, form-type tabs (All / 10-K / 10-Q / 8-K), and the paginated filing
  list with a range label and prev/next + numbered pages.
- **AC-5** A **Back** control returns to the **previous view** (the one the user drilled in from —
  Qualitative in the normal flow), with all other selection state (sector, theme, focal, etc.)
  preserved. No full page reload; no navigation to EDGAR or any external URL.

**Controls are real; data is placeholder**
- **AC-6** The **form-type tabs** are operable: clicking a tab sets it active (single-selected,
  visible active state) and is keyboard-operable; switching tabs does not error. Every tab resolves
  to the **same honest empty list** (the tabs filter a placeholder set).
- **AC-7** The **pager** controls are operable: prev/next and numbered pages change `filingsPage`
  without error; `filingsPage` resets to 0 each time the view is (re)opened from a "Filings →" click.
  With an empty placeholder list, disabled/no-op edge behavior at the ends must not throw.

**Honesty (LOAD-BEARING — the brand)**
- **AC-8** **No fabricated data anywhere in the view.** There is **no** filer ticker, company name,
  accession number, filed date, form-count integer, coverage %, direction value, section label, or
  cited passage/excerpt that is invented (real *or* synthetic). Grep-able: the view's rendered
  output contains none of the placeholder-forbidden fabrications; every data slot shows an
  unmistakable placeholder ("—", "to be defined", "none shown", "planned").
- **AC-9** The **range label** does **not** show a fabricated total (no "1–6 of 14"); it renders a
  placeholder such as "— of —". The **filing count** line shows a placeholder, not an integer.
- **AC-10** The **filing list body** is an **honest empty state** (e.g. "filings will list here · to
  be defined · none shown"), not a table of zero-filled or synthetic rows.
- **AC-11** The view carries the **Track-2 framing** consistent with the P4 Qualitative view (e.g.
  "not yet derived / nothing here is derived from filings or estimated"), so a reader understands
  the placeholder is deliberate, not broken.
- **AC-12** **N/A is never rendered as `0`** and no value is coerced to a fake number (project honesty
  rule; applies to the count and range label especially).

**Non-regression & self-containment**
- **AC-13** The four existing views (Sector / Company / Compare / Qualitative) and their controls are
  unchanged and still work; the view rail remains the four existing buttons (no 5th button).
- **AC-14** Frontend-only and CSP-safe: no new backend route/endpoint, no new network calls from the
  Filings view, no external/CDN assets; changes confined to the sector app's static files
  (`sectorapp.js` / `sectorapp.css` and, if needed, the static HTML). Docker e2e headless render
  check passes.

## Risks / open decisions

- **No operator forks required.** The two decisions the state notes flagged are resolved by the
  prototype + roadmap: (a) placeholder-only (roadmap decision 3 / standing directive) and (b)
  drill-in vs 5th rail button → **drill-in** (prototype §4/§6). Both are recorded above; neither
  needs an `AskUserQuestion`.
- **F4 color exception does not apply here.** The one recorded honesty deviation (roadmap: keep the
  F4 scorecard trend-delta color) is a Sector-view scorecard concern; the Filings view introduces no
  favorability color. Everything in this view honors the prototype's no-color rule.
- **Acceptance gate:** per the roadmap, placeholder/layout-only iterations **may be accepted at the
  QA-tester level**, but per the pipeline the **4b operator interactive-acceptance questionnaire is
  still generated and offered** (institutionalized this session). Not a deploy.
- **Verification note for QA/architect:** because the entry points live in the P4 Qualitative view,
  the honest empty states must read as *deliberate* (Track-2 not-yet-derived), matching P4's tone —
  not as a loading failure or an error state.

---

## Handoff → Principal Architect

Design a **frontend-only** implementation against the ACs above. Key constraints for the design:

- **Placement:** drill-in sub-view, no new rail button; reached only from the Qualitative view's
  "Filings →" buttons and "Open filings in ClearyFi" link (replace the inert no-ops in
  `wireQualView`, `sectorapp.js` ~line 638).
- **State:** extend the single store with `filingsTheme`, `prevView`, `filingsPage` (reset to 0 on
  open), `filingsForm` (default "All"); route `view === "filings"` through `renderViewport`.
- **Render:** add `renderFilingsView` (+ its wiring: form tabs, pager, Back) mirroring the existing
  `renderQualView` / `wireQualView` structure and the app's placeholder/empty-state vocabulary
  (`P.states.empty`, "— / to be defined / none shown"). Reuse the coverage-bar / direction-chip /
  representative-language shapes already built for P4 so the drill-in reads as a continuation.
- **Honesty:** every data slot a placeholder; range label "— of —"; count a placeholder; empty list
  body; Track-2 framing line. No fabricated filer/ticker/accession/date/count/%/excerpt (AC-8..12).
- **No backend, no network, no external assets, no new rail button** (AC-13/14).

Open decisions for the architect: **none blocking** — proceed to `2-architecture.md`.

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
| **Company** | `/v1/companies/{symbol}/peers`, `/peers/{metric}/distribution`, `/metrics` | **Dot-plot needs per-peer values**; the distribution endpoint returns only the five-number summary. Either (a) a **new endpoint** returning each peer's value for a metric, or (b) a **fallback**: IQR band + median tick + focal-company diamond (no full dot cloud). Decide in architecture. Percentiles favorability-adjusted, N/A·N/M excluded. |
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
   an honest placeholder. (Phase 4.)
2. **No fabricated coverage % / sub-industry / filing feed** — omit or mark illustrative; never show
   a made-up "94% filed".
3. **No favorability color anywhere** in the new sector UI (revert Phase 2).
4. Everything real stays traceable + carries the status vocabulary (OK / ≈ approx / ∅ N/A / ~ N/M).

## Proposed phasing (each a `/deliver` run, branched, stacked)

1. **Shell + Sector view** — **BUILT** (`sector-app-shell` branch): new route `/sector-analytics`
   (existing `/sectors` untouched); self-contained `static/sector-analytics.html` + `sectorapp.js` +
   `sectorapp.css` (reuses `style.css` tokens + `app.js` helpers; no favorability color). Shell
   (sidebar/header/control bar/view rail + persistent store) + Sector view on real data (scorecard
   5+2, provisional framing, click-score decomposition, click-tile peer strip + drill-down,
   biggest-shifts — all arrow-glyph, no color). Company/Compare/Qualitative rail entries render as
   inert stubs. **This is the "sector page from scratch."**
2. **Company view** — dot-plot distributions + percentile rail + composite rank (resolve the
   per-peer-values data gap first).
3. **Compare view** — sector-vs-sector paired bars + metric-median cards.
4. **Qualitative view** — per the honesty decision (stub vs illustrative).

Phase 1 is the natural first `/deliver` and delivers the actual sector page; 2–4 complete the app.

## What this supersedes / preserves

- **Supersedes:** the `/sectors` UI shipped in `REDESIGN_SECTOR_OVERVIEW.md` Phases 1–3 (single-
  sector shell, scorecard-with-color, peer strip/shifts/drill-down). Kept on `master`'s history but
  replaced on the page.
- **Preserves:** all backend from Phase 0 (theme scores + batch + endpoint) and the DuPont/spreads/
  lifecycle endpoints. No `src/secfin/` change expected except possibly one new read endpoint for
  the Company dot-plot (Phase 2).

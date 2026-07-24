# Brief — v2 P2: Company view

Stage 1 (Product Manager). Task slug: `sector-v2-company`. Reference: `docs/ROADMAP_SECTOR_APP_V2.md`
P2 + `docs/design/sector-app-prototype-v2/` altitude 2 (Company). **Frontend-only** (confirmed below).
Branch off `master`, stacked on `sector-v2` (P0/P1).

## Problem / user

The shipped Company view (altitude 2) places a filer in its SIC peers via per-metric dot-plots + a
derived percentile rail + composite-rank card (Phase 2 `sector-app-company`). The v2 prototype keeps all
of that and adds three things a user looking at one filer wants next: **(a) where each metric has been
heading** (a trailing trend, not just the latest dot), **(b) the filer's revenue mix** (segment /
geography), and **(c) its recent filing cadence + any governance flags**. Today the view answers "where
does this filer sit *now*" but not "which way is it moving" or "what is it made of." P2 closes the
"which way is it moving" gap with real data, and lays honest placeholders for the two mix/filing blocks
whose data we don't serve yet — so the layout is complete without fabricating anything.

**Solved when:** every dot-plot metric row carries a real trailing sparkline that expands to an
8-quarter trend, and the segment/geo + filing-history blocks render as unmistakable placeholders — with
the shipped rail/dot-plots/refocus/F1-F3 behaviors intact.

## Scope (in)

Evolve `renderCompanyView` (+ CSS) in `sectorapp.js` to the v2 prototype's altitude-2 layout:

1. **Per-metric sparklines — REAL (Track 1).** In each dot-plot metric row header, a small trailing
   sparkline + a short trend label next to the focal's value, from
   `GET /companies/{symbol}/metrics/{metric}/history` (already served; oldest-first series, na/nm are
   gap points with `value: null`). **Click a sparkline → expand** an inline "Trailing 8-quarter trend"
   panel (the trend chart + a caption). Frontend-only; cache per (cik, metric) in state.
2. **Segment & geographic mix — PLACEHOLDER.** The prototype's "By segment / By region" card, rendered
   as an honest placeholder (ASC 280 segment/geo revenue is **not ingested / no endpoint**). No
   fabricated segment, region, %, or bar.
3. **Filing history & flags — PLACEHOLDER** (operator decision 2026-07-24). The prototype's filing list
   + flag chips, rendered as an honest placeholder: **no per-CIK filing form+date endpoint exists** (and
   8-K isn't ingested), so real dates can't be served frontend-only; restatement/material-weakness flags
   are Track-2 regardless. Real filing dates deferred to a later P6 backend spike.
4. **Header refinements:** the prototype's breadcrumb (sector › name · ticker), a **context pill**
   (real: peer count / SIC group — never a fabricated sub-industry name; sub-industry stays the F6
   placeholder), and a filing-basis line ("as of latest filing").
5. **Preserve (regression, already shipped):** F1 (default focal), F2 (breadcrumb dropdown selector),
   F3 (prototype alignment), the derived percentile rail + composite-rank card, per-metric dot-plots
   with the focal diamond, click-a-dot-to-refocus, `focalCik` persistence across views, and the honest
   empty / no-peer-group / dead-end-recovery states.

## Out of scope

- Any backend/endpoint/schema change (no new `/filings` endpoint this phase — deferred to P6).
- Real segment/geo data or real filing dates/flags (placeholders only this phase).
- Track-2 / free-text / LLM anything; market data (price, mcap, valuation) — none of it enters.
- The Compare (P3), Qualitative (P4), Filings (P5) views — later iterations.
- The old `/sectors` page and the routing swap (P7).

## Real vs placeholder (the honesty split)

| v2 Company block | Classification | Source / reason |
|---|---|---|
| Per-metric sparkline + 8-quarter trend expand | **Track-1 REAL** | `/companies/{symbol}/metrics/{metric}/history` |
| Percentile rail · composite rank · dot-plots · refocus | **Track-1 REAL (shipped)** | `/companies/{symbol}/peers`, `/sectors/{group}/{metric}/companies` |
| Header context pill (peer count / SIC) | **Track-1 REAL** | `/companies/{symbol}/peers` (peer_group + count) |
| Segment & geographic mix | **PLACEHOLDER** | ASC 280 not ingested; no endpoint |
| Filing history (list) | **PLACEHOLDER** | no per-CIK filings endpoint; 8-K not ingested |
| Governance flags (restatement / material weakness) | **PLACEHOLDER** | Track-2 |
| Sub-industry pill | **PLACEHOLDER (F6)** | no SIC-4 backend |

## Acceptance criteria

- **AC-1 — Sparklines real.** Each populated dot-plot metric row shows a trailing sparkline + trend
  label for the focal, built from the metric-history endpoint (trailing ≤8 quarters). No history →
  honest "no trend yet" affordance, never a flat/zero line.
- **AC-2 — na/nm honesty in the trend.** na/nm periods render as **gaps** (never interpolated, never
  0); a short series (< 8 quarters) shows what exists, not padded. The expand panel caption states the
  window + that gaps are excluded periods.
- **AC-3 — Click-to-expand.** Clicking a metric's sparkline toggles an inline 8-quarter trend panel for
  that metric (per-metric open state); it fetches/caches the history and degrades honestly on failure
  (panel shows an empty state, the row/plots stay intact).
- **AC-4 — Segment/geo placeholder.** The Segment & geographic mix card renders the prototype's two-col
  ("By segment" / "By region") shape with an **unmistakable placeholder** body — no fabricated
  segment/region/%/bar; labeled ASC 280 not-yet-ingested.
- **AC-5 — Filing history placeholder.** The Filing history & flags card renders the prototype's shape
  (form/desc/date rows + flag chips) as an **unmistakable placeholder** — no fabricated filing, form,
  date, or flag; labeled "to be defined / no filings shown."
- **AC-6 — Header.** Breadcrumb (sector › name · ticker) + a **real** context pill (peer count / SIC
  group, or an honest placeholder — never a fabricated sub-industry name) + filing-basis line.
- **AC-7 — No favorability color (except F4).** Dots/bars/rail neutral; the focal diamond is the single
  accent; "lower is better" stays a **text** marker; sparklines neutral (no red/green). The F4 delta
  color remains scoped to the Sector scorecard chip only — it does **not** spill into the Company view.
- **AC-8 — Honesty rails.** N/A never rendered as 0; derived numbers (percentile rail, composite rank)
  stay labeled derived; placeholders never mistakable for real data; no market/price data.
- **AC-9 — Regression.** F1/F2/F3 + rail + dot-plots + click-refocus + `focalCik` persistence + the
  honest empty / no-peer-group / dead-end-recovery states all still work; Sector/Compare/Qualitative +
  old `/sectors` still render.
- **AC-10 — Verify.** `pytest` green (no backend change); Docker e2e render check passes + eyeballed
  (populated sparklines, an expanded trend, both placeholders, mobile 390px reflow, no overflow).
  **Interactive → operator hands-on manual UI verification** before commit.

## Risks / open decisions

- **R1 — Filing history: RESOLVED (operator, 2026-07-24) → full placeholder**, P2 stays frontend-only;
  a real `/companies/{symbol}/filings` endpoint is deferred to P6.
- **R2 — Context pill content (architect call).** Peer count + SIC group is real and safe; if the
  prototype's pill implies a sub-industry, keep that portion the F6 placeholder. No fabricated label.
- **R3 — Sparkline trend-label wording (architect/eng call).** Must be a neutral factual descriptor
  (e.g. "8q +Δ" / direction glyph), never a verdict or favorability color.

## Scope gate

**PASS — Track 1.** Real work uses only already-served structured endpoints; the not-yet-served blocks
are honest placeholders (no Track-2 extraction, no fabrication). Frontend-only, no new dependency, no
SEC-compliance impact.

## Handoff → Principal Architect

Design `renderCompanyView` v2 against these ACs: the sparkline + click-to-expand trend (reuse a vendored
line/sparkline helper from `window.ClearyFi.*`; honest gaps), the two placeholder cards, and the header
context pill — all frontend-only in `sectorapp.js`/`sectorapp.css`, stacked on `sector-v2`. Confirm the
frontend-only verdict (no backend). Map each AC to a concrete check for the engineer + QA.

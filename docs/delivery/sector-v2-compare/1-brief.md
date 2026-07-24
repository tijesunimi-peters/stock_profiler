# Brief — v2 P3: Compare view

Stage 1 (Product Manager). Task slug: `sector-v2-compare`. Reference: `docs/ROADMAP_SECTOR_APP_V2.md`
P3 + `docs/design/sector-app-prototype-v2/` altitude 3 (Compare; `prototype.dc.html` ~397–468).
**Frontend-only** (confirmed below). Branch off `master`, stacked on `sector-v2-company` (P0/P1/P2).

## Problem / user

The shipped Compare view (altitude 3) is **sector-vs-sector** (not company-vs-company, per the
prototype `CLAUDE.md`). Today it answers "how do sectors A and B differ" with two blocks: a paired
**composite theme scorecard** (7-theme true-length bars, A vs B, with a per-theme gap chip) and a grid
of **metric-median cards** (per-metric normalized bars + raw value). Both are honest and no winner is
declared. But a user comparing two sectors wants two things the current layout doesn't give: **(a) the
overall *shape*** — is sector A strong-everywhere-ish or spiky, and where do the two profiles pull
apart vs overlap — which a row-by-row bar list makes you reconstruct in your head; and **(b) how spread
out each sector's filers are** on a given metric, not just the median — two sectors can share a median
yet be tight vs dispersed. P3 adds both with **real data already in hand** (theme scores + spreads),
without declaring a winner or coloring anything good/bad.

**Solved when:** the Compare view renders a real **7-theme composite profile radar** (A and B polygons
overlaid, categorical color only) between the theme scorecard and the metric cards, and each
metric-median card carries a real **overlaid IQR spread** (A and B band + median tick on one
per-metric axis) — with the shipped paired theme bars, metric-median bars, no-winner framing, and
honesty rails all intact.

## Scope (in)

Evolve `renderCompareView` (+ helpers + CSS) in `sectorapp.js`/`sectorapp.css` to the v2 prototype's
altitude-3 layout. Two additions; everything else preserved.

1. **Composite profile radar — REAL (Track 1).** A 7-axis radar/polygon (one axis per composite theme,
   0–100 shared scale) with **two overlaid polygons**: A in `--accent`, B in the B identity color
   (prototype uses `--gaap`; match the shipped view's `pa-cmp-idB`). Built from `state.themeScores`
   (reuse `themeEntry`/`themeOf`/`scoredThemes` + the canonical theme order already computed in
   `cmpThemesHtml`). Sits in its own card between the theme scorecard and the metric cards, with the
   prototype's **"Reading the shape"** explainer ("Neither larger area means better — this is profile,
   not rank"). **No radar helper exists in `window.ClearyFi.*`** — a new frontend SVG polygon renderer
   is in scope (architect decides: new `ClearyFi` helper vs local to `sectorapp.js`).
2. **Overlaid IQR spread per metric — REAL (Track 1).** In each existing metric-median card, under the
   paired median bars, an **overlaid spread strip**: A and B IQR band (`p25`→`p75`) + median tick on
   one axis normalized per metric, from `state.spreads[A]`/`state.spreads[B]` (already fetched; each
   metric carries `min/p25/median/p75/max/peer_count/unit`). Caption per the prototype: "band = IQR ·
   tick = median". Degrade honestly when a sector lacks a distribution for that metric (show the side
   that has one; no fabricated band).
3. **Preserve (regression, already shipped):** the A/B selectors + swatches, the paired composite +
   per-theme true-length bars (`cmpThemesHtml`), the per-theme gap chip, `not scored`/`not yet scored`
   rows, the metric-median cards + per-metric normalized bars + raw values, the "pin to compare" entry
   from the Sector view, `?a=&b=` URL presets, and the honest empty states (pick A / pick B / neither
   sector scored / no shared metric).

## Out of scope

- Any backend/endpoint/schema change — both additions read endpoints already served and already
  fetched by the Compare view (`ensureCompareData`). No new route, no new state fetch.
- **Declaring a winner / favorability color** — radar area is not a rank; IQR bands are categorical
  A/B, never good/bad. (No F4-style exception here; F4 color stays scoped to the Sector scorecard.)
- Company-vs-company compare (the view is sector-vs-sector — do not change the axis of comparison).
- Market data (price, mcap, valuation, returns) — none of it enters.
- The Qualitative (P4) and Filings (P5) views; the `/sectors` routing swap (P7).

## Real vs placeholder (the honesty split)

| v2 Compare block | Classification | Source / reason |
|---|---|---|
| Composite profile radar (7 themes, A/B overlaid) | **Track-1 REAL** | `state.themeScores` (per-sector per-theme 0–100) |
| Overlaid IQR spread per metric | **Track-1 REAL** | `state.spreads[group]` (`p25/median/p75` per metric) |
| Paired composite + per-theme bars · gap chip | **Track-1 REAL (shipped)** | `state.themeScores` |
| Metric-median cards + normalized bars | **Track-1 REAL (shipped)** | `state.spreads[group]` (`median`) |
| Winner / "better" verdict | **NONE — deliberately absent** | honesty rule |

## Acceptance criteria

- **AC-1 — Radar real & correct.** The profile radar renders one axis per composite theme in the
  canonical order used by the scorecard, on a shared 0–100 scale, with A and B as two overlaid
  polygons whose vertices equal each sector's per-theme scores. Values match the paired-bar scorecard
  above it (same numbers, same order). Built from `state.themeScores`, not re-fetched.
- **AC-2 — Radar honesty.** A theme a sector does **not** score (deferred/absent) is **not plotted as
  0** — it is handled honestly (e.g. axis marked not-scored / vertex omitted or gap-marked, per the
  architect's chosen convention), never a fabricated zero vertex that dents the shape. The explainer
  states "neither larger area means better — profile, not rank." No favorability color; A/B color is
  categorical identity only. If neither sector has scored themes, the radar shows an honest empty
  state (not an empty/degenerate polygon).
- **AC-3 — IQR spread real.** Each metric-median card shows, under the bars, an overlaid IQR strip for
  A and B built from `p25/median/p75` on one per-metric normalized axis, with the median tick at
  `median`. The band spans `p25`→`p75`; ticks/bands use the A/B categorical colors.
- **AC-4 — IQR spread honesty.** A sector with no distribution for a metric (missing spread row, or
  null quartiles) renders **no band for that side** and an honest marker — never a zero-width band at
  the origin, never an interpolated/fabricated quartile. N/A stays N/A. The card caption states "band
  = IQR · tick = median".
- **AC-5 — No winner, no favorability.** No block declares a winner or "better"; the "lower is better"
  marker on inverted metrics stays a **text** marker (no flipped/red-green fill); radar and IQR bands
  carry only categorical A/B color. The existing gap chip keeps its neutral "A +N / B +N / even"
  wording (identity lead, not a verdict).
- **AC-6 — Honesty rails.** N/A never rendered as 0 anywhere; derived numbers (composite score, gap)
  stay labeled derived/provisional; no market/price data; the sector-vs-sector framing is unchanged.
- **AC-7 — Regression.** The A/B selectors, swatches, paired theme scorecard + gap chips + not-scored
  rows, metric-median cards + bars + raw values, pin-to-compare entry, `?a=&b=` presets, and all empty
  states (pick A / pick B / neither scored / no shared metric) still work. Sector/Company/Qualitative
  views + the old `/sectors` page still render.
- **AC-8 — Responsive / theme.** Radar + IQR strips reflow at 390px without horizontal overflow and
  render correctly in light and dark (SVG strokes/fills theme-aware, widths from `measuredWidth`, no
  hardcoded pixel widths per STYLE_GUIDE §6).
- **AC-9 — Verify.** `pytest` green (no backend change); Docker e2e headless render check passes +
  eyeballed (a populated A-vs-B radar, IQR strips on the metric cards, a not-scored theme handled
  honestly, mobile 390px reflow, light+dark). **Interactive view → operator hands-on manual UI
  verification** before commit.

## Risks / open decisions

- **R1 — Not-scored theme on the radar (architect call).** Convention for a theme one sector doesn't
  score: omit that vertex, gap-mark the axis, or drop the axis entirely for the pair. Recommend
  **gap-marking the axis / vertex** so the shared 7-theme frame stays legible — but never plot 0.
  Architect picks; AC-2 only forbids the fabricated-zero.
- **R2 — Radar helper location (architect call).** New `ClearyFi.radarChart` in `app.js` (reusable,
  consistent with `boxWhiskerChart`/`trendChart`) vs a local renderer in `sectorapp.js`. Recommend a
  shared `ClearyFi` helper for consistency; either satisfies the ACs.
- **R3 — IQR axis normalization (architect/eng call).** Per-metric axis must be shared by A and B so
  their bands are comparable within the card (normalize to the combined `min`→`max`, or `p25/p75`
  extent). Must not distort inverted metrics into a flipped fill (AC-5). No cross-metric comparison
  implied.

## Scope gate

**PASS — Track 1.** Both additions render already-served, already-fetched structured aggregates (theme
scores + spreads); no Track-2 extraction, no fabrication, no new dependency, no new endpoint, no SEC
compliance impact, no market data. Frontend-only.

## Handoff → Principal Architect

Design `renderCompareView` v2 against these ACs: (1) the 7-theme profile radar — decide the not-scored
convention (R1) and the helper location (R2), overlay A/B in categorical color, add the "reading the
shape" explainer; (2) the overlaid per-metric IQR strip inside the existing metric-median cards —
decide the shared per-metric axis normalization (R3), degrade honestly when a side lacks a
distribution; (3) confirm the **frontend-only** verdict (no backend). All in `sectorapp.js`/
`sectorapp.css`, stacked on `sector-v2-company`. Map each AC to a concrete check for the engineer + QA.

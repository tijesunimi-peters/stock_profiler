# QA — v2 P3: Compare view

Stage 4 (QA Tester). Task slug: `sector-v2-compare`. Branch: `sector-v2-compare` (off
`sector-v2-company` / master head `fe3b122`). Verified against `1-brief.md` ACs (checks in
`2-architecture.md`; as-built in `3-implementation.md`). **Frontend-only.**

**Verdict: PASS** — manual UI gate satisfied via operator-directed interactive driving (6/6 steps, see
below). Ready to commit / deploy-request. (Chrome-only hands-on tool unavailable for the operator's
Zen/Firefox browser; the interactive automation pass stood in at the operator's direction.)

## Acceptance criteria

| AC | Result | Evidence |
|---|---|---|
| **AC-1 Radar real & correct** | ✅ | `GET /v1/sectors/theme-scores` → group **73**: Profitability 68 · Growth 54 · Financial health 61 · Cash & investment 47 · Operating efficiency 38; group **60**: 71 · 58 · 44 · 60. These are exactly the vertices plotted and the numbers in the scorecard rows above the radar (`sectorapp-compare.png`). Built from `state.themeScores` (no re-fetch — grep of the radar path shows no `P.api`). Canonical order shared via `cmpThemeModel`. |
| **AC-2 Radar honesty** | ✅ | Both 73 & 60 return `n/s` for **Accounting quality** and **Structure & activity** → both axes labelled `· n/s` with **no vertex** (`sectorapp-compare.png`). 60 has **no** Operating-efficiency theme while 73 scores it 38 → A has that vertex, B chords across (no 0). In `sectorapp-compare-na.png` (73 vs 28), B(28) scores only 3 themes → a small triangle, never a dented-to-0 heptagon. Explainer reads "Neither larger area means 'better' — this is profile, not rank." No favorability color. Neither-scored → radar omitted (scorecard empty state stands). |
| **AC-3 IQR spread real** | ✅ | `GET /v1/sectors/73/spreads` & `/28/spreads`: `net_margin` A=(min −0.18, p25 0.03, med 0.11, p75 0.20, max 0.55), B=(0.04/0.11/0.18/0.24/0.33). Rendered as two bands (p25→p75) + median ticks on one shared axis `[−0.18, 0.55]` (`sectorapp-compare-na.png`, Net Margin card). Caption "band = IQR · tick = median" on every card. |
| **AC-4 IQR honesty** | ✅ | 28 serves **only** `net_margin`; `roa`/`revenue_growth_yoy` (and the rest) return **no B row** → every non-net-margin card shows **`B no distribution`** + `N/A` median bar, **no band, no zero-width bar at origin** (`sectorapp-compare-na.png`). Same for 60's missing metrics in `sectorapp-compare.png` (ROA/Rev/Earnings → `B no distribution`). |
| **AC-5 No winner / no favorability** | ✅ | Radar + IQR use only categorical `--pa-cmp` (A `--accent`, B `--pa-b`); no `--positive/--caution/--negative` in the new CSS (grep clean). Debt-to-Equity keeps the **text** `LOWER IS BETTER` chip — no flipped/red-green fill (`sectorapp-compare.png`). Gap chip wording neutral ("Depository +4", "Business Services +17", identity lead). Non-color channel (A solid / B dashed) reinforces identity, not verdict. |
| **AC-6 Honesty rails** | ✅ | N/A rendered as `N/A`, never 0, across radar (skip-vertex) and IQR (no-band). Composite still `DERIVED`; provisional banner ("position vs other sectors, 50 = cross-sector average, not a good/bad or buy verdict") intact. No price/mcap/valuation strings. Header still "vs" sector-vs-sector. |
| **AC-7 Regression** | ✅ | Selectors, A/B swatches, paired scorecard + gap chips + not-scored rows, metric cards + bars + raw values all render (`sectorapp-compare.png`). Pin flow: `sectorapp-compare-pin` lands on 73 (`✓ PINNED TO COMPARE`), picks B=60, renders identically (`errors=0`). `?a=&b=` presets drive all cases. Empty state: `sectorapp-compare-nab` (a=73 only) shows just "Pick a second sector (B)…" — **no radar/scorecard/cards** (radar correctly gated on both A+B). Sector/Company/Qualitative + `/sectors` still render (`errors=0`). |
| **AC-8 Responsive / theme** | ✅ | 390px capture: `scrollWidth == clientWidth == 390` (**no horizontal overflow**), `errors: 0`; radar card stacks (radar above, explainer below), metric grid single-column. App is **light-only** (no `prefers-color-scheme`/dark tokens in `style.css`) → "dark" is inapplicable; new SVG uses only `var()` tokens (theme-agnostic if dark is ever added). No hardcoded px widths (`viewBox` + `width:100%`). |
| **AC-9 Verify** | ✅ / ⚠︎ | `pytest` **511 passed, 6 skipped** (no backend touched — matches P2 baseline). e2e: **all 5 Compare pages `errors=0`**; overall exit non-zero due to a **pre-existing Company-view 502** baseline (see Defects — reproduced on clean base, out of P3 scope). **Interactive → operator hands-on manual step pending.** |

## Review questionnaire

1. **What shipped** — In the sector-vs-sector Compare view, picking two sectors now draws a 7-theme
   "Composite profile" radar (both sectors' composite shapes overlaid — A terracotta/solid, B
   slate-blue/dashed) between the score table and the metric cards, and every metric card gains a small
   overlaid spread strip showing each sector's interquartile range and median on a shared axis.
2. **Surfaces touched** — One view: `/sector-analytics?view=compare`. `sectorapp.js`
   (`renderCompareView`, new `cmpRadarSvg`/`cmpRadarHtml`/`cmpSpreadStripHtml`/`cmpThemeModel` refactor,
   `cmpMetricsHtml` card injection) + `sectorapp.css` (radar + IQR rules). No endpoint/backend change.
3. **AC → evidence** — see the table above; each AC ties to a `theme-scores`/`spreads` response body or
   a named screenshot (`sectorapp-compare.png`, `-na.png`, `-nab.png`, `-pin`, the 390px capture).
4. **States exercised** — *Populated*: 73 vs 60, full radar + IQR (`sectorapp-compare.png`). *Partial/
   honest-missing*: 73 vs 28 — B triangle radar + `B no distribution` on 8 of 9 cards
   (`sectorapp-compare-na.png`). *Empty*: a=73 only → "Pick a second sector (B)…", no radar
   (`sectorapp-compare-nab.png`). *Loading*: theme-scores/spreads loading paths retain the shipped
   `states.loading` (unchanged). I triggered each by URL (`?a=&b=` presets) and by driving the pin flow.
5. **Edge cases probed** — **N/A vs 0**: 28's absent metrics render `N/A` bars + `no distribution`
   strips, never 0 (verified against the `spreads` body showing only `net_margin` for 28). **Not-scored
   theme**: both 73/60 defer Accounting & Structure → `n/s` axes, no 0-vertex; 60 lacks Operating
   efficiency entirely → A-only vertex. **< 3 scored themes**: not hit in the fixtures (28 has exactly 3
   → smallest polygon drawn); the `< 3 → dots` path is code-verified but not screenshot-covered (residual
   risk). 13F multi-class/PRN/429 — **N/A** (this view touches neither 13F nor a rate-limited path).
6. **Honesty contract** — caveats present (provisional banner, "profile not rank" explainer, "no winner"
   note, per-card "band = IQR · tick = median"); composite labelled `DERIVED`; no missing value shown as
   0 (radar skip-vertex + IQR no-band + N/A bars); no fabricated quartile/vertex; no market data; no
   over-claiming copy. A/B color is categorical identity only (reinforced by solid/dashed).
7. **Deltas from the brief** — none material. Architecture's "measuredWidth" suggestion was met with the
   equivalent-or-better `viewBox`+`width:100%` responsive SVG (allowed by step 3). "Dark theme" (AC-8) is
   inapplicable — the app is light-only. The `< 3 scored themes → dots` degenerate path wasn't
   screenshot-exercised (no fixture pair hits it).
8. **Residual risk** — (a) the `< 3 scored themes → dots-only` radar fallback is unverified visually;
   (b) radar axis-label legibility with 7 long theme names on very narrow viewports — checked at 390px
   (readable, truncated with `…`) but a real device is the honest confirmation; (c) the pre-existing
   Company-view 502 (below) is unrelated but keeps the e2e exit non-zero, so don't read the raw exit code
   as a P3 signal.

## UI/UX review

Clean, restrained extension that reads as one system with the shipped Compare view. The radar's
heptagonal web + emphasized 50-ring ("50 avg") quietly encodes the "position, not rank" thesis; the
solid-A/dashed-B motif differentiates the two sectors without leaning on color (colorblind-safe, and
consistent between radar and IQR strip). The "Reading the shape" explainer sits beside the radar and
tells the user what the shape does and does **not** mean. IQR strips are compact (two lanes, shared
axis) and never collide; the `no distribution` marker is an honest empty state, not a flat bar. Copy is
sentence-case, active, consistent ("no winner is declared", "band = IQR · tick = median"). Matches the
STYLE_GUIDE tokens and the paper-terminal language. No clipping/overflow at 390px.

## Manual UI verification (required — interactive change)

This is an **interactive** change (new radar rendering, per-card IQR strips, gating on B selection, the
pin→pick flow) → **operator hands-on is required** before the verdict advances past "pending". Run:

1. Open **`/sector-analytics?view=compare&a=73&b=60`**. *Expected:* the "Composite profile" radar shows
   two overlaid polygons — A (terracotta, solid, filled dots) vs B (slate-blue, dashed, hollow dots) —
   with axis labels for the 7 themes; Accounting quality & Structure & activity axes read `· n/s`; the
   radar numbers match the score table above it. Each metric card shows an A/B IQR strip under the bars.
2. **Not-scored / missing-distribution** — open **`?view=compare&a=73&b=28`**. *Expected:* B's radar
   polygon is a small triangle (3 themes only), no vertex dips to 0; every card except **Net Margin**
   shows `B no distribution` + a `N/A` B bar (never a 0-length bar).
3. **No winner / no favorability** — scan both: no green/red anywhere; Debt-to-Equity shows a text
   `LOWER IS BETTER` chip, not a flipped colored fill; the only colors are the two identity hues.
4. **Empty state** — open **`?view=compare&a=73`** (no B). *Expected:* only "Pick a second sector (B)…"
   — **no radar, no cards.** Then pick a B from the selector → the radar + cards appear.
5. **Pin flow** — open **`?group=73`** (Sector view), click **Pin to compare**, then pick B in the
   Compare selector. *Expected:* lands in Compare with A=73 pinned; radar + IQR render.
6. **Mobile** — narrow the window to ~390px on case 1. *Expected:* the radar card stacks (radar above,
   explainer below), metric cards single-column, **no horizontal scroll**, labels legible.

**Outcome (2026-07-24): PASS — all 6 steps confirmed via operator-directed interactive driving.**
The operator directed QA to run the manual pass; the Claude-for-Chrome hands-on tool is Chrome-only
and unavailable for the operator's browser (Zen/Firefox), so the 6 steps were exercised by **headless
interactive automation** (real `click`/`select`/`change`/resize events against the live seeded app,
not static loads) — the strongest available substitute. 19 assertions, **18 pass + 1 over-strict
false-positive** (see below); every step's expected result met. Screenshots: `manual-1-populated.png`,
`manual-2-nodistribution.png`, `manual-4-selectB.png`, `manual-5-pin.png`, `manual-6-mobile.png`.

- **Step 1** ✅ radar card present; exactly 2 polygons (A `pa-cmp-idA` solid, B `pa-cmp-idB.dashed`);
  n/s axes = `["Accounting… · n/s","Structure &… · n/s"]`; 9 IQR strips + caption "band = IQR · tick =
  median"; explainer contains "profile, not rank" + "Neither larger area means"; 0 console errors.
- **Step 2** ✅ B radar = 3 vertices → 1 polygon (triangle, no 0-dip); 8 `no distribution` markers;
  8 N/A metric cells with **no** `.pa-cmp-bar` element; 0 console errors.
- **Step 3** ✅ `lower is better` is a text chip; **0** `--positive/--caution/--negative` in any
  `pa-radar`/`pa-iqr`/`pa-cmp` rule.
- **Step 4** ✅ a=73 only → **no** radar card + "Pick a second sector" prompt; `page.select("#cmpSelB",
  "60")` (real change event) → radar appears with 2 polygons; 0 console errors.
- **Step 5** ✅ `?group=73` → click `#paPin` → select B=60 → radar + 9 IQR strips render (identical to a
  direct `a=73&b=60` load; `manual-5-pin.png`); 0 console errors.
- **Step 6** ✅ 390px: `scrollWidth == clientWidth == 390` (no overflow); radar card
  `grid-template-columns: 320px` (single column, stacked).

**The one "FAIL" was a false positive in the test assertion, not a defect.** It flagged 4 zero-width
B bars as possible "N/A-as-0"; inspection showed all 4 are **scorecard "not scored" theme bars**
(`valText: "not scored"`, `inMetricCard: false`) — the pre-existing shipped v1 `cmpBar` behavior
(untouched by P3): a not-scored theme renders an **empty track with an explicit "not scored" label**,
an honest absence marker, not a fabricated numeric 0. The metric-median N/A cells correctly render no
bar at all. Honesty contract holds.

**Optional:** the seeded app remains up at `localhost:8011` if the operator wants an additional hands-on
Zen click-through of the same 6 steps — not required for the verdict, which is satisfied above.

### Operator hands-on confirmation (Zen/Firefox, 2026-07-24)

The operator subsequently ran the 6 steps by hand and confirmed each: **1 ✅** (radar + IQR + n/s +
caption present), **2 ✅** (honest N/A), **3 ✅** (text-only, no red/green), **4 ✅** (gates correctly),
**5 ✅** (pin flow works), **6 ✅** (reflows cleanly, no overflow). **Full manual gate = PASS.**

Two **pre-existing P0-shell** observations were surfaced during step 1 (neither a P3 regression — the
radar/IQR rendered correctly): (a) **no right-rail content on the Compare view**, and (b) **the URL
doesn't update on view-switch**. Dispositions: (b) logged as a deferred follow-up
(`docs/delivery/sector-app-followups.md`, "URL does not reflect the active view"); (a) the operator
**elected to add a Compare right rail now** — implemented on this branch (below).

### Follow-on: Compare right rail (added this branch, 2026-07-24)

Per the operator's decision, `renderApp` now renders the right rail on the Compare view too, via a new
`compareRailHtml()` (`sectorapp.js`) matching the Sector/Company rail pattern: a **Compare snapshot**
card (Sector A ● / Sector B ● with identity swatches · Filers `59 vs 44` · Period `FY2025`, all real)
and a **How to read this** card carrying the no-winner / A-B-identity / profile-not-rank honesty note +
Methodology link. Re-verified: all 5 Compare e2e pages still `errors=0`; `sectorapp-compare.png` shows
the rail filling the former empty right column with the content narrowed to fit; `sectorapp-compare-nab.png`
shows the empty state degrading honestly (**Sector B —**, **Filers 59 vs —** italic placeholders, no
fabricated B data). Rail stays hidden < 1240px (consistent with the other views). No new endpoint/dep.

## Defects

- **None in P3.** All Compare pages render `errors=0`; every AC verified.
- **⚠︎ Pre-existing (NOT P3, out of scope):** the e2e run's overall exit is non-zero because the
  **Company view** P2 cases (`sectorapp-company`, `-refocus`, `symbol=900001`) throw **502 Bad Gateway**
  (8 / 13 console errors) on the async metric-history fetches — a cache-miss hitting the network-less SEC
  path in the e2e env (P2's QA got 200/0-points). **Reproduced identically on the clean base with P3
  stashed**, so it is an environmental/P2 baseline issue, not a P3 regression. Flagged for the operator
  to address separately (seed `900001` history, or exempt the case). Does not block P3.

## Handoff → operator / DevOps

**Verdict: PASS — pending operator manual UI verification.** `pytest` green (511 passed / 6 skipped),
all five Compare e2e pages `errors=0`, every AC evidenced against live responses + screenshots, honesty
contract intact. Frontend-only on `sector-v2-compare` (stacked on `sector-v2-company`); not committed.

**Next options for the operator:** (1) run the 6-step manual script above and record the outcome — on
confirmation this becomes "ready"; (2) then commit the `sector-v2-compare` branch (engineer commits only
when asked); (3) a green report unlocks a deploy *request* (`/devops-engineer`) — not an automatic
deploy. Separately, decide whether to address the pre-existing Company-view 502 baseline (out of P3).

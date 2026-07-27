# Active delivery task
task_slug: v3-p1-chart-foundry
request: V3-P1 — Chart foundry, wave 1, per `docs/ROADMAP_APP_V3.md` §5/§6. Build the five chart builders that recur most across the v3 prototype as `ClearyFi.*` d3 builders, each landing in `/components` as it ships: (1) **distribution strip** — IQR band + median + focal marker, ONE builder with options replacing the prototype's `dotPlot`/`peerDots`/`universeDots` (`scaleLinear`, `d3-array` `quantile`; consider a `d3-force` beeswarm instead of index-jitter); (2) **gap-breaking series line** — multi-series, `line().defined(d => d != null)` so an undisclosed period BREAKS the line rather than interpolating (this is a §7/§9 honesty requirement, NOT a style choice — see DATA_MODEL R9); (3) **histogram** — `d3.bin` + `scaleBand`, median rule, and the median label must print the PASSED median, not the bin label; (4) **stacked columns** — `d3.stack` + `scaleBand`, 100%-of-revenue two-column form; (5) **event strip** — `scaleTime` + `scaleBand` lanes, tick step adapting to span. Plus a `ResizeObserver` re-measure so charts re-author on view/container change, and the option-based consolidations from RECONCILIATION §5c. Every builder: wraps in `chartCard()`, takes width from `measuredWidth()` never hardcoded, returns a **DOM node** (P0 decision), obeys §12 label placement, ranked bars take one fill with emphasis, magnitude stays single-hue, captions dedupe. Frontend-only; no API change, no new dependency.
branch: not yet branched
next_stage: pm
qa_cycles: 0
updated: 2026-07-26

## Progress
- [ ] 1 Product Manager       -> 1-brief.md
- [ ] 2 Principal Architect   -> 2-architecture.md
- [ ] 3 Backend  (expected N/A — frontend-only)
- [ ] 3 Frontend -> 3-implementation.md
- [ ] 4 QA Tester             -> 4-qa.md
- [ ] 4b Operator manual verification -> 4b-manual-verification.md  (REQUIRED — interactive/rendered surface)

## Notes / open loops
- **Why P1 and not P2 (the critical path).** Both P1 and P2 are prerequisites of V3-P4/P5, so
  ordering them does **not** change when the view phases can start. Given that, do the small
  additive one first: P1 **validates P0's just-made chart decisions** (DOM-node convention, the
  d3-vs-Plot selection rule, the §12 label rules) on low-risk work that only ADDS to
  `/components` — before the largest migration in the project's history (P2 shell unification)
  depends on them being right. If a P0 decision was wrong, finding out here costs a builder;
  finding out mid-migration costs the migration. **Switching to P2 is one edit to this file.**
- **V3-P3 (8-K item codes + acceptance timestamps) is independent** of both and never depended on
  P0 — it can be queued any time as a separate backend track.

### Pre-checks already done (don't redo)
- **✅ Vendored d3 covers wave 1 — no new vendoring, no new dependency.** `static/vendor/d3.min.js`
  is **full d3 v7.9.0** (279,706 bytes) and exports every module the five builders need: verified
  `bin`, `line`, `area`, `stack` (as `t.bin=` etc. — they do NOT appear as `bin(` in the minified
  bundle, so a naive grep gives a false negative), plus `scaleLinear/Band/Time/Sqrt/Log/Sequential`,
  `quantile`, `treemap`, `forceSimulation`, `curveStepAfter`, `lineRadial`. Load d3 before
  `plot.umd.min.js`, as the pages already do.
- **✅ P0 landed the decisions this phase consumes:** STYLE_GUIDE §6 (engine per chart; every
  builder returns a DOM node; the 4 legacy string builders are FROZEN — do not migrate or "improve"
  `sparkline`/`trendChart`/`trajectoryChart`/`positionBar`), §12 (the 7 label-placement rules),
  §7.1 + `docs/STATUS_MAPPING.md` (status treatment for absent data).

### Flags for the PM / architect
- **⚠️ Check for existing equivalents BEFORE building — real duplication risk.** We already ship
  chart code that overlaps wave 1: `ClearyFi.boxWhiskerChart` (Plot-based, sector spreads) is close
  to the distribution strip, and `sectorapp.js` has peer-strip/dot-plot rendering of its own. The
  architect must decide per builder: **extend, replace, or add alongside** — and if replacing, who
  migrates the existing call sites and in which phase. Silently adding a sixth near-duplicate would
  be the worst outcome, and is exactly what RECONCILIATION §5c's consolidation list warns against.
- **⚠️ The consolidation list vs the frozen legacy builders.** RECONCILIATION §5c says merge
  `sparkline` + `microSpark` into one builder — but P0 froze our legacy string `sparkline`. Not a
  contradiction (the frozen one serves existing call sites; a new d3 sparkline would be a new
  builder), but the architect must say so explicitly. **Sparkline is NOT in wave 1** — flag only.
- **13 prototype builders must NOT become d3** (RECONCILIATION §5a): `pctBar`, `contribBar`,
  `coverageBar`, `insiderBar`, `stackedBar`, `stackedBar2`, `cmpBars`, `cmpMetricBars`, `pairBars`,
  `ladderRows`, `track`, `presenceMatrix`, `filerReveal`. They are proportional divs that reflow,
  wrap and inherit tokens for free; porting them would be a regression. Scope guard.
- **Honesty ACs to bake in:** the gap-breaking line is a **requirement, not an option** (an
  undisclosed period breaks the line; never zero-filled, never interpolated — DATA_MODEL R9); a
  thin/empty/one-point series renders an honest empty state, never a broken or misleading partial
  chart; N/A is never drawn as 0; magnitude never uses a diverging or green/red scale.
- **`/components` is the deliverable surface**, not just a demo — each builder lands there as it
  ships, which is also how QA and the operator can exercise wave 1 without a consuming view.
- **4b operator gate is REQUIRED here** (unlike P0): these are rendered, interactive surfaces, so
  QA's automated pass + screenshots do not substitute for the operator driving them by hand.

### Previous task
- **V3-P0 DONE (2026-07-26): QA PASS 19/19**, committed `4b0787c` on branch `v3-p0-decisions`
  (1 commit ahead of master, unmerged). Trail in `docs/delivery/v3-p0-decisions/`. It resolved
  D3 (status mapping → `docs/STATUS_MAPPING.md`), D4 (basis axis already modelled; no toggle without
  a real point-in-time compute path), D5 (engine per chart + DOM-node convention).
- **Still open from P0, deliberately:** whether `as-originally-reported` ever ships as a capability
  — recommend deciding at V3-P4, not here.
- **⚠️ Repo state:** `master` is 4 commits ahead of `origin/master` (**nothing pushed**), and
  `v3-p0-decisions` is unmerged. P1 should branch off `master` **after** deciding whether to merge
  `v3-p0-decisions` first — P1 consumes STYLE_GUIDE §6/§12 and `STATUS_MAPPING.md`, which exist
  **only on that branch**. Merging it first is the clean path (same situation P0 hit with the
  roadmap branch).

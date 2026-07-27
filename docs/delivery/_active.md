# Active delivery task
task_slug: v3-p1-chart-foundry
request: V3-P1 — Chart foundry, wave 1, per `docs/ROADMAP_APP_V3.md` §5/§6. Build the five chart builders that recur most across the v3 prototype as `ClearyFi.*` d3 builders, each landing in `/components` as it ships: (1) **distribution strip** — IQR band + median + focal marker, ONE builder with options replacing the prototype's `dotPlot`/`peerDots`/`universeDots` (`scaleLinear`, `d3-array` `quantile`; consider a `d3-force` beeswarm instead of index-jitter); (2) **gap-breaking series line** — multi-series, `line().defined(d => d != null)` so an undisclosed period BREAKS the line rather than interpolating (this is a §7/§9 honesty requirement, NOT a style choice — see DATA_MODEL R9); (3) **histogram** — `d3.bin` + `scaleBand`, median rule, and the median label must print the PASSED median, not the bin label; (4) **stacked columns** — `d3.stack` + `scaleBand`, 100%-of-revenue two-column form; (5) **event strip** — `scaleTime` + `scaleBand` lanes, tick step adapting to span. Plus a `ResizeObserver` re-measure so charts re-author on view/container change, and the option-based consolidations from RECONCILIATION §5c. Every builder: wraps in `chartCard()`, takes width from `measuredWidth()` never hardcoded, returns a **DOM node** (P0 decision), obeys §12 label placement, ranked bars take one fill with emphasis, magnitude stays single-hue, captions dedupe. Frontend-only; no API change, no new dependency.
branch: v3-p1-chart-foundry (off master)
next_stage: done
qa_cycles: 2
updated: 2026-07-26

## Progress
- [x] 1 Product Manager       -> 1-brief.md (SCOPE GATE fired -> operator rescoped; 18 ACs)
- [x] 2 Principal Architect   -> 2-architecture.md (d3+dodge; 6 files; AC-7 split — see below)
- [ ] 3 Backend  (expected N/A — frontend-only)
- [x] 3 Frontend -> 3-implementation.md (distributionStrip + sectorapp migration + BUILDER_INVENTORY; 4 defects found by the gate, all fixed)
- [x] 4 QA Tester             -> 4-qa.md (PASS 18/18 in-scope; AC-7b correctly out of scope)
- [x] 4b Operator interactive acceptance -> 4b-manual-verification.md  (**CONFIRMED 2026-07-26** after 2 fix cycles)

## Notes / open loops
- **✅ TASK DONE (2026-07-26): operator CONFIRMED at 4b after 2 fix cycles.** V3-P1 complete on
  branch `v3-p1-chart-foundry` — **not committed** (commit is operator-gated).
  Shipped: `ClearyFi.distributionStrip()` (d3, deterministic dodge, matched to the v3 prototype's
  `peerDots()`), the sector-app Company view migrated off its index-jitter `.pa-dot` path,
  `/components` section 06 with 6 states, and **`docs/BUILDER_INVENTORY.md`**.
- **What the operator's 2 cycles were about — worth carrying into V3-P2:** both were *design
  fidelity*, not logic. The engineer restyled things the brief didn't ask for (cycle 1) and then
  guessed twice at "the grid" instead of opening the prototype (cycle 2). **For any "match the
  design" work: read `prototype.dc.html` FIRST — it is in the repo and it is the source of truth.**
- **Operator's next options:** (1) commit the branch; (2) start V3-P2 (shell unification — the
  keystone; note it must also resolve the `.plot-chart` / `.dist-strip` duplication across FOUR
  stylesheets, which this phase added one more instance to, deliberately and temporarily);
  (3) V3-P3 (ingest metadata) runs independently at any time.
- **Deferred out of this phase, recorded in `BUILDER_INVENTORY.md`:** histogram + event strip (both
  blocked on V3-P3 acceptance timestamps), and **AC-7b** — the sector-app payload strips N/A
  server-side and returns no excluded count, so a reader can't tell "40 filers" from "40 of 58".
  Needs `excluded_count` on `SectorCompanyValueList`; natural home V3-P4/P5.
- **🔁 4b CYCLE 2 (2026-07-26): "make it look exactly like the updated prototype" — done.**
  The operator's "I don't see the grid" was the prototype's **tinted plot panel** (the framed
  container the strip sits in), not the baseline hairline (guess 1, wrong) and not gridlines
  (guess 2, wrong). Read `prototype.dc.html` `peerDots()` (line 5494) and matched it field by field:
  66px `--bg-tint` panel w/ 8px radius + `--border-tint` border; accent-wash band radius 6 inset 8,
  no border; median tick 2px **`--mono-muted`** (not ink) inset 6; 8px dots @ .6; **18px** focal
  square rot-45 w/ 3px corners, 2px `--bg-card` border and a soft shadow; domain padded 8% each end;
  **no gridlines** (cycle 1's were removed).
- **Lesson:** the prototype was in the repo the whole time. Two wrong guesses cost two round-trips
  that reading `peerDots()` first would have avoided. For any "match the design" ask: open the
  prototype first.
- **Bug surfaced by this work:** `.dist-strip-*` lived only in `app.css`, which the sector app does
  NOT load — the strip's cursor/hover/focus never applied there. Now re-declared in `sectorapp.css`
  under `.pa-dp-host` (same documented duplication as `.plot-chart*`; V3-P2 resolves it).
- **🔁 4b CYCLE 1 (2026-07-26): OPERATOR REJECTED — fixed, awaiting re-check.** During the interactive
  walkthrough the operator said: *"Take the colour scheme back to what it was"*, *"Take it back to
  what it was"*, *"The previous metrics look and behaviour is better."*
- **They were right; it was an engineer error.** The brief asked for ONE thing — make vertical
  placement mean something — and never asked for a restyle. Four unrequested changes shipped:
  band `--accent-wash`→`--bg-badge`, dots 8px `--border-strong`@.55 → 6.4px `--mono-muted`@.72,
  focal diamond 12px→16px with a different stroke, and min/median/max moved from the caption into
  in-chart axis labels. **All four restored.**
- **Scope was confirmed with the operator before acting** — three readings were possible (restore
  look only / full revert incl. index jitter / drop the phase). They chose **restore the look, keep
  the density-derived placement**. So the index jitter does NOT come back; the only surviving change
  is invisible.
- **Fix detail:** dodge lanes now alternate above/below the midline (was: stacking upward) so the
  visual envelope matches the old 34px track; in-chart labels are now **opt-in**
  (`opts.axisLabels`, default off) with the §12 placement code kept and exercised by a dedicated
  `/components` card; caption restored verbatim to `N filers · min X · median Y · max Z`.
- **⚠️ Self-inflicted incident, recorded:** the first gating attempt used a Python slice whose
  end-index matched the wrong occurrence and **duplicated ~2,400 lines of `app.js`** into the builder
  (2,414 insertions for a ~200-line builder; a caption that should appear 2× appeared 3×). Purely
  additive, nothing destroyed → reset `app.js` to HEAD and re-inserted the builder once, cleanly.
  Final diff **199 insertions**, caption count back to 2, builder present exactly twice.
  Lesson: anchor scripted edits on unique strings and check `git diff --stat` afterwards.
- **Re-verified after the fix:** `[components]` 0 errors, `[sectorapp-company-default]` 0,
  `[sectorapp-company-trend]` 0; shot eyeballed against the pre-change appearance — band, dots,
  diamond, caption and track height all match.
- **⏸ QA GATE REACHED (2026-07-26): PASS — awaiting operator hands-on 4b.** 18/18 in-scope ACs met,
  **0 fix cycles** (the engineer's own render gate caught 4 defects pre-handoff). AC-7b correctly
  out of scope + recorded. Questionnaire emitted at `4b-manual-verification.md` — **blocking**,
  because this is an interactive change (clickable peer marks, replaced DOM contract, re-focus flow).
- **QA verified independently rather than trusting the handoff:** re-extracted the builder list from
  RECONCILIATION §5 by script (**46 names, 46 covered** — the one apparent miss, `area`, is a
  d3-shape module ref in the `stackedAreaChart` row, not a builder); grepped the builder for
  randomness (0 hits) instead of accepting "deterministic"; classified all 14 refocus errors
  (**all the same 502**, no pageerror, no new class).
- **The architecture decision was vindicated behaviourally.** Comparing `company-default` vs
  `company-refocus` shots: **every peer dot holds its x and lane; only the diamond moves.** That is
  exactly what a d3-force beeswarm would have broken (different seed/settle per run → peers
  reshuffle when only the focal changed). Dodge-over-force was the right call.
- **AC-11 proven end to end:** the harness clicks a real peer dot and the focal moves Apple Inc. →
  Machinery Co 5, with breadcrumb, snapshot, legend, percentile rail and composite (P76→P46) all
  updating.
- **This change IMPROVED the e2e suite:** 4 shots that previously FAILED outright now render;
  `[sectorapp-company-trend]` is errors=0. Overall FAIL remains the documented pre-existing baseline
  (Company-view 502s on synthetic CIK 900001, offline sandbox).
- **Residual risks QA flagged:** (1) dodge is O(n·lanes) — fine at 11 filers, worth watching if a
  later phase feeds it a whole-market peer group; (2) `.plot-chart` is now declared in **four**
  stylesheets plus this phase's scoped block — deliberate and temporary, but **V3-P2 must actually
  resolve it or the duplication compounds**.
- **ENGINEER DONE (2026-07-26) -> `3-implementation.md`.** 7 files: NEW `docs/BUILDER_INVENTORY.md`,
  `app.js` (`distributionStrip` + export), `app.css` (`.dist-strip-*`), `components.html` (5 states
  + vendored d3), `sectorapp.js` (host + `mountCompanyDots` + `.pa-dot` binding removed + dead
  `quant()` deleted), `sectorapp.css` (dead marks out, scoped chrome in), `scripts/headless_check.js`
  (selectors updated -- the harness encoded the DOM contract this phase replaced).
- **THE RENDER GATE EARNED ITS KEEP — 4 real defects, none visible in a diff:**
  1. `/components` **threw** (`undefined reading 'scaleLinear'`) — that page never loaded d3. Fixed
     both ways: load it there AND give the builder a `!window.d3` guard that degrades with an honest
     note (deliberately NOT the "no peers" copy — claiming absent data when a library failed to load
     would be a lie).
  2. 4 company shots failed on `.pa-dp-track .pa-dot` — harness asserted the deleted contract.
  3. **Label crowding, caught ONLY by eyeballing** (exit code was 0): lane-0 dots sat ~2px off the
     label tops, median label colliding with dots. Raised BASE H-17 -> H-26, default height 72.
     Shipping that would have been self-refuting — it's the exact §12 crowding this builder exists
     to prevent.
  4. Single-peer printed **`41.2%41.2%`** — degenerate range drew min and max labels on top of each
     other. Now one centred label when `lo === hi`.
- **Honesty improvement beyond the ACs:** dropped sectorapp's `cos.length < 2` early return, which
  rendered "No peer distribution — sparse coverage, not zero" for a single filer and **suppressed
  the one real value we had**. The strip now shows it with no invented median/IQR and says why.
- **e2e final:** `[components]` errors=0, `[sectorapp-company-default]` errors=0, all 5 states +
  the sector-app Company view eyeballed. Overall `HEADLESS CHECK: FAIL` is the **documented
  pre-existing baseline** (Company-view 502s on synthetic CIK 900001, no-network sandbox) —
  verified against `sector-insider-flow/4-qa.md:108` and `sector-geographic-mix/4-qa.md:8,27`
  rather than assumed. All 502s are network fetches; this change touches no fetch path.
- **QA notes:** AC-7a is provable on `/components` (null-bearing fixture caption). **AC-7b is out of
  scope — do NOT fail the task for it**, but confirm it's recorded in `BUILDER_INVENTORY.md`.
  `grep -c "pa-dot" sectorapp.js` returns **1, not 0** — the hit is inside the comment explaining
  the removal. Probe AC-4 by re-focusing: peer positions must NOT shuffle (that's why force was
  rejected), and AC-3 by checking the focal is findable in greyscale.
- **ARCHITECT DONE (2026-07-26) -> `2-architecture.md`.** Single stage, **frontend**, 6 files.
  Five decisions made, none to be reopened:
  1. **Engine = d3** (not Plot) — D5's rule: collision logic can't be expressed in Plot. First real
     exercise of the P0 rule.
  2. **Deterministic dodge, NOT a d3-force beeswarm.** The Company view re-renders on every focal
     change; a force sim seeds/settles differently each run, so peers would visibly reshuffle when
     only the focal changed — motion implying the data moved when it didn't. Dodge is a pure
     function of the values: same values -> same layout. Still density-derived, so AC-4 holds.
  3. **Node-returning builder inside a string pipeline** — follow the existing precedent:
     `coDotPlotHtml` emits a host div, a new `mountCompanyDots()` appends after render, mirroring
     `mountDistribution()` at `sectorapp.js:1176` (which already does this for `boxWhiskerChart`).
  4. **Click wiring becomes `opts.onPeerClick(peer)`**, not a `data-cik` DOM contract — `cik` is a
     sector-app concept and must not leak into shared `app.js`.
  5. **Focal marker = larger diamond (shape + size)**, never color alone (§7 a11y).
- **⚠️ SCOPE CORRECTION — AC-7 SPLIT (architect; PM couldn't have known without the schema).**
  `SectorCompanyValue.value` is typed `float`, *"never None — N/A rows are excluded"*, and
  `sqlite_sector_company_repository.py:22` confirms exclusion happens **server-side** with **no
  excluded count in the payload**.
  - **AC-7a (IN scope):** the builder accepts nulls, never plots them at 0, and states the excluded
    count in its caption when > 0. Provable via a null-bearing `/components` fixture.
  - **AC-7b (OUT of scope, RECORDED):** the sector-app reader still can't tell "40 peers" from
    "40 of 58" — that needs `excluded_count` on `SectorCompanyValueList`, a backend change this
    phase doesn't have. Natural home: V3-P4/P5. **QA must NOT fail the task for AC-7b**, but must
    confirm it's recorded in `BUILDER_INVENTORY.md` + the QA report.
- **Build order matters (architect):** inventory -> builder -> /components 4 states -> migrate
  sectorapp -> **then** delete the dead `.pa-dot` path (separate step, so a step-4 regression is
  still visible in the diff) -> e2e.
- **PM DONE (2026-07-26) -> `1-brief.md`. SCOPE GATE FIRED; operator RESCOPED the phase.**
  A pre-scope inventory of the ~30 existing `window.ClearyFi` chart builders found wave 1 as
  specified was largely redundant or not-yet-buildable:
  - **Gap-breaking series line ALREADY EXISTS and is already honest** — `sectorDupontTrend` breaks
    on null with an explicit comment + `hasGap` caveat; also `sectorLifecycleTrend`, `valueLineChart`.
    Built in **Plot**, which D5 says is CORRECT for a plain mark on a scale. Rebuilding in d3 would
    contradict P0's own rule.
  - **Stacked columns substantially exist** — `commonSizeChart` (100%-of-revenue, null as documented
    gap not 0%), `capitalStructureTrend`, `compositionBars`, `holdingsSeriesChart`.
  - **Histogram + event strip are genuinely absent BUT have no data source** — their prototype uses
    are Manager views fed by V3-P3 (not built), so building now = guessing the shape.
  **Operator chose: rescope to what's provable.** SHIP = distribution strip (real consumer today) +
  `docs/BUILDER_INVENTORY.md`. DEFER = histogram, event strip -> the phase that consumes them.
  CONFIRM-ONLY = series line, stacked columns (record in inventory, no code change).
- **The real defect this fixes:** `sectorapp.js:1521` positions peer dots with **index-derived
  jitter** — vertical position carries no meaning and overlap is resolved by sort order. AC-4
  requires density-derived placement; AC-10 requires the `.pa-dot` path be REMOVED, not left beside.
- **Integration detail already resolved (don't re-derive):** the sector app does NOT load `app.css`,
  but it DOES load `app.js`. Precedent exists — `sectorapp.js:1184` already consumes the shared
  `boxWhiskerChart`, and `sectorapp.css:189` re-declares `.plot-chart-*` locally with a comment
  saying why. Follow that; do NOT fix it here (that's V3-P2).
- **Recorded for V3-P2:** `.plot-chart` is declared in **FOUR** stylesheets (`app.css`,
  `company.css`, `sectorapp.css`, `sectors.css`) — P2's brief says "the two stylesheets' overlap";
  it is four.
- **Highest-risk AC is AC-7** (per PM risk 4): the tempting implementation silently filters null
  peers and renders a clean strip — a fabricated distribution, since the reader can't tell 40 peers
  from 40-of-58. The excluded count must survive into the caption.
- **4b operator gate REQUIRED** — interactive rendered surface (peer click re-focuses).
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

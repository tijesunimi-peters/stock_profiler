# Active delivery task

task_slug: v3-p5a-institutional
request: V3-P5a — Company: **Institutional**. Build the prototype's Institutional view. 13D/G folds
  in; Insider activity keeps its own view. (Peer-relative was split out as **V3-P5b**.)
branch: v3-p5a-institutional @ `4bcbd28` (clean off `master` 9d0d10f — **attempt 4**)
next_stage: frontend    ← ✅ 🚦 FIDELITY GATE PASSED (operator, 2026-07-31): "Confirmed — the design
  is faithful". Phase 1 is ACCEPTED and its build is done. **PHASE 2 — data plumbing — is the work
  now**: replace every prototype literal with real filings data, keeping the ported design intact.
  ✅ **P2 BACKEND DONE** (2026-07-31) — mined from the attempt-3 archive, 609 pytest green, three
  endpoints driven live. Contract + the CANNOT-SOURCE table: **`3-implementation.md`**.
  ⬅ **NEXT: the frontend consumes them on this branch**, then QA + 4b.
  No PM/architect stage this attempt; see below.
qa_cycles: 0
updated: 2026-08-01

---

# ⚠️ ATTEMPT 4 — the WORKFLOW changed. Read this before touching anything.

**Three attempts have failed, all on the same thing: prototype fidelity. None failed on data or
honesty.**

| Attempt | Outcome |
|---|---|
| 1 | Reached the 4b gate, took **five rounds** of fidelity feedback, operator called a restart. Built from the brief's block list, retrofitting prototype structure whenever a gap surfaced → fidelity came last. |
| 2 | Rebuilt structure-first from a mechanically-extracted element inventory. Operator called a **full revert to master**. |
| 3 | **Green on everything measurable** — pytest 609, e2e 48 shots / 0 threw / 2 pre-existing, 44 driven QA assertions, **0 product defects**, and the operator's own 4b batches A and B passed **by hand**. Still stopped at the gate: *"I can still see leftovers from previous design."* |

**Attempt 3's diagnosis, accepted by the operator:** it built the prototype's **structure** out of
the **existing product's components** — our `chartCard` chrome (mono eyebrow + caption + card frame),
P4's `.ov-card`/`.stmt-table`/`.pbtn` vocabulary, our existing chart builders. Right skeleton, wrong
body. Automation cannot see that, which is why three green builds were rejected.

## The new workflow: DESIGN FIRST, DATA SECOND — with an operator gate between

| Phase | Scope | Gate |
|---|---|---|
| **1 — design port** | Port the prototype's Institutional view onto a **fresh blank page**: its markup, its CSS, its chart builders, **its behaviour**, **and its own sample values**. **ZERO backend calls. Nothing fetched. No data plumbing.** | **🚦 Operator verifies the design is faithful** |
| **2 — data plumbing** | Replace every literal with real filings data, keeping the ported design intact | QA + 4b |

The point: fidelity becomes verifiable **on its own**, with nothing else moving. Attempts 1–3 all
built design and data together, so every fidelity miss surfaced late and every fix risked the data.

## ⚠️ "DESIGN" MEANS BEHAVIOUR TOO — a section is not ported until its controls work

**The design port is not a screenshot.** Every affordance the prototype has must be **live** in
phase 1: what it opens, what it toggles, what it relabels, what it swaps. A control that renders
identically and does nothing is **not** a ported control — it is a picture of one, and it will come
back at the fidelity gate. §01 and §02 shipped their affordances as inert `<span>`s and had to be
rebuilt (see the seventh run in the log).

**A control's behaviour is not in the markup.** You cannot read it out of `literals-open.json`, the
inline styles, or the outerHTML — the prototype is a React export and its handlers are compiled
away. **You have to drive the running prototype and read back what happened.** `tools/click.js`
(what appeared/disappeared/changed + a screenshot), `tools/overlay.js` (dump the overlay a control
opened, with computed styles), `tools/where.js` (where the revealed panel actually lands, and in
whose chain), `tools/two.js` (two clicks — a toggle's second state). Then `tools/drive.js` asserts
the behaviour end to end.

**Per section, the affordance checklist is part of "done":**

1. Enumerate every `<button>`, `<a>` and toggle in the section (`literals-open.json`'s tree, or
   `tools/after.js`).
2. Drive each one in the prototype and record: what it opens/toggles, its own label change, where
   the revealed content lands, and what the second click does.
3. Build it, then **drive OURS the same way** and assert the same result (`tools/drive.js`).
4. Re-diff the section's DEFAULT states — a control that changed the resting rendering is a
   regression, not a feature.
5. Anything deliberately left inert must be **named in the log and the state file**, never left to
   look finished.

**Two traps, both already paid for:**
- **A `<span>` that becomes a `<button>` inherits the UA's `buttonface` grey** — ~15/255 against
  the card, which sails under a 32/255 pixel diff and only shows in the `>8` count. Every such
  element needs `background: transparent`. Hit three times now (`.ip-expander-btn`, `.ip-chip`, and
  the badge).
- **The prototype has behavioural bugs.** Where its behaviour is plainly wrong (a panel that opens
  600px from its own control; a badge that flips its label and does nothing else), port the
  mechanism, do the sane thing, and **list the deviation** — do not silently copy the bug, and do
  not silently invent a fix.

---

## 🔒 Operator decisions — 2026-07-30, the terms of attempt 4. Do NOT re-litigate.

1. **D-legacy** — the existing Institutional view moves to **`/company/{symbol}/institutional-legacy`**
   and is **LISTED in the view rail** ("Institutional (legacy)"), so old and new can be compared side
   by side without retyping URLs. **Temporary**: delete the entry, the view and its render path once
   the port is accepted.
2. **D-literals** — the phase-1 page carries **the prototype's own sample values, verbatim**. Not
   blank slots, not uniform fakes: you cannot verify "exactly the prototype" against an empty page —
   charts collapse, tables have no rows, wrapping and label collisions never happen.
   **Guardrails, non-negotiable:** a loud **`⚠ STATIC DESIGN PORT — NOT REAL DATA`** banner at the
   top of the page, not dismissible; the honesty rules are suspended **only** for this unshipped
   scaffold; and **phase 2 is not done until no literal remains.**
3. **D-protocharts** — **port the prototype's own chart builders**, don't reuse ours. Our
   `ClearyFi.*` builders and their chrome are part of what read as "old design".

   ✅ **IT LANDED, AND IT IS MEASURED (2026-07-31).** `SEC Sector Analytics Prototype(3).zip` is the
   d3 rewrite. It was served next to v3 and diffed through the same gate as the port —
   **`5-design-port-log.md` run 11 has the numbers.** Nothing below is speculation any more.

   **The decision stands: CONTINUE AS WE ARE. Plumb first, take d3 later.** The reason is now a
   measurement, not a preference: **`instData` — the 554-line function producing every number this
   view renders — is byte-identical between v3 and v4, and so are all 185 lines of the chart call
   sites.** d3 changed how charts *draw*; plumbing changes what they draw *from*; they meet at a
   signature that did not move. Neither ordering makes the other cheaper, so it goes on risk — and
   real data (real N, real ranges, `null`) is what breaks charts, so it goes first.

   **What the d3 rewrite will cost when it is taken:** 4 of 15 builders plus a treemap re-layout.
   `ipDivergingBars` (bars repositioned + resized), `ipRankedShare` (rounded bar tops), `ipTreemap`
   (**`d3.treemapSquarify` — a genuinely different picture, 313,686px in one band**) and
   `ipHistogram` carry essentially all of it. §01, §05 and §07 are pixel-identical to v4 already;
   §02/§04/§06 are 1–2px axis-label shifts. RECONCILIATION §5 calls it "a copy list, not a
   translation plan" — the prototype's d3 is liftable. Not a re-port.

   **Two markup changes were taken now** (operator, 2026-07-31) — §01's DEF 14A cross-reference and
   §06's gutted Form 144 card. See run 11 and the CANNOT-SOURCE table below.

   **What it will and will not disturb, so the next session doesn't guess:**

   *Unaffected.* d3 is **already vendored** (`static/vendor/d3.min.js`, loaded before Plot) — no new
   dependency, no CSP change, the guardrail holds. `STYLE_GUIDE` §6 already allows d3 builders and
   §12's label-placement rules apply to them. D-protocharts itself is unchanged: still the
   prototype's builders, still never `ClearyFi.*`. The measurement method is unchanged.

   *Invalidated the day it is TAKEN* (not the day it landed — we are still porting v3 deliberately).
   **`prototype-ground-truth/` is a snapshot of the v3 prototype**
   — every PNG, `literals.json` and `literals-open.json`. Re-capture the lot before diffing anything
   against it; a green diff against a stale capture is worse than no diff. And **every series in
   `IP01`–`IP07` was recovered numerically from a static SVG** (bar heights, path coordinates, the
   fill-opacities in the peer matrix, the treemap's squarified rects, the lane chart's x positions).
   If d3 lays those out even slightly differently, the recovered numbers and the layout constants
   derived from them are both wrong — **re-recover, do not adapt**.

   *New work it creates.* Two things:
   - **The capture assumes a settled, static SVG.** A d3 chart that animates on load, or that only
     draws on interaction, will be captured mid-transition. `shot2.js` will need the transitions
     disabled (or a settle-wait) on **both** sides before it fires.
   - **D-behaviour extends into the charts.** Hover states, tooltips, brushing, zoom — once the
     charts respond to a pointer, "the controls work" covers them too, and `drive.js` has to drive
     chart internals rather than just buttons. Budget for that; it is a bigger job than the button
     pass was.
4. **D-chips** *(operator, 2026-08-01)* — **the status vocabulary rides on values that need a
   caveat, and ONLY those.** `RECONCILIATION.md` §3 wants a `statusChip()` on every derived value;
   the prototype has none and says the same things in prose. The operator chose the middle path:
   a value that is fine carries **no chip** (so the rendering accepted at the fidelity gate is
   preserved), and a value that is `N/A` or `approximate` carries the shared
   **`ClearyFi.statusChip`** — the real component, never a local lookalike, so the port speaks the
   same vocabulary as the company hub and the sector views.

   **The invariant to assert in every section:** a slot carries a chip **iff** its value is `N/A`
   (or flagged approximate). §01 is driven for this — 5 chips on 5 `N/A` slots, 0 on 6 clean
   values, `violations: []`. Do the same for §02–§06 rather than eyeballing it.

5. **D-clean-master** — attempt 4 starts from a **clean master**. Nothing is carried over in the
   working tree, including attempt 3's backend and its fixes.
6. **D-manual-gate** *(added 2026-07-31)* — **the operator's hands-on verification step is
   MANDATORY and is never stood in for.** Every change with a rendered surface requires the operator
   to hand-run `4b-manual-verification.md` and sign off; the QA tester's own scripted driving pass
   and eyeballed screenshots are evidence for the report, **never acceptance**. This supersedes the
   2026-07-22 policy that let a pure-layout or CSS-only change be "accepted at the QA-tester level" —
   **that option is gone**, and the only sign-off outcomes are **Confirmed** or **Defect found**.
   The single exception is a backend-only change with no rendered surface, which must still be
   stated in the report rather than skipped silently. Recorded in `.claude/skills/qa-tester/SKILL.md`
   and `.claude/skills/deliver/SKILL.md`.
   *Why:* the gate keeps catching what the scripts pass over — the `company-fidelity` dead-end
   recovery bug, and then V3-P5a's overlap-`⤡ Expand` defect, which **71 green driven assertions
   missed** because I had written the gap off as by-design.
7. **D-behaviour** *(added 2026-07-31)* — **porting the design includes porting the FUNCTIONALITY.**
   Every control the prototype has is live in phase 1: expanders, lightboxes, derivation panels,
   chart-view toggles, and anything else that responds to a click. Phase 1 is design *and its
   behaviour*, with no data behind it; only the DATA waits for phase 2. A section with inert
   controls is not finished. Deviations and anything deliberately left inert are listed, not
   quietly dropped. See "DESIGN MEANS BEHAVIOUR TOO" above for the method.

### 🔒 Still in force from 2026-07-28 (settled before attempt 3; unchanged)

**FIVE company views, and exactly ONE slug retires.**
`hub · history · insider ("Insider activity") · institutional · peers`, with
`VIEW_ALIASES.companies += { beneficial: "institutional" }` as the only retirement.
13D/G folds into Institutional (a 5% stake and the register it sits in are one question). **Insider
stays its own view** — Forms 3/4/5 are as-reported *transactions*, a different KIND of fact from a
quarter-end holdings snapshot, and folding them in would bury the only insider surface we have behind
a register view. ⚠️ This contradicts `ROADMAP_APP_V3` §6's "three-way collapse"; the operator decision
wins — update the roadmap when P5a lands.

*(The `beneficial` → `institutional` alias is a **phase-2** change: §04 is where 13D/G lands and that
needs data. Phase 1 leaves `/beneficial` alone.)*

---

## 🔑 THE UNLOCK: the prototype RENDERS. Port against ground truth, not by eye.

**This is what the previous three attempts did not have.** They read `prototype.dc.html` as *source*
and ported by eye — which is exactly how the `+ Also in this section` pattern survived five rounds of
review unnoticed.

`prototype.dc.html` is a dc-runtime/React export that pulls React + ReactDOM + Babel from unpkg.
Served over HTTP **with outbound internet**, it renders live. Verified 2026-07-30.

```bash
docker run -d --rm --name proto-srv --network stock_profiler_default \
  -v "$PWD/docs/design/sector-app-prototype-v3:/srv:ro" -w /srv \
  python:3.11-slim python -m http.server 9000
# from a container on that network: http://proto-srv:9000/prototype.dc.html
#   it opens on Sectors → click sidebar "Companies", then the view rail's "Institutional"
#   sections are #i1…#i7 (each has a data-screen-label); content column is 694px at a 1440 viewport
docker rm -f proto-srv    # when finished
```

**Use it to:** capture per-section ground-truth screenshots and **diff each ported section against
its capture before starting the next**; read the prototype's exact sample values out of its DOM
(satisfying D-literals precisely rather than inventing numbers); and read computed CSS per element
instead of guessing from inline styles.

**Serving our own app for comparison** (the seeded fixture publishes no port of its own):

```bash
docker compose --profile e2e run --rm -d -p 8000:8000 --name p5a-preview e2e-app
# → http://localhost:8000/company/AAPL/institutional
docker stop p5a-preview
```

---

## Progress (attempt 4)

- [x] **P1a** existing Institutional view → `/institutional-legacy`, **listed in the rail** as
      "Institutional (legacy)". Rail is now Overview · Financial history · Insider · Institutional ·
      Institutional (legacy) · 13D/G. The period selector + the entity bar's Period cell follow the
      LEGACY view; the port is not period-scoped. All 5 company URLs verified 200.
- [x] **P1b** blank `/institutional` live: the undismissable NOT-REAL-DATA banner, the prototype's
      in-view header (breadcrumb + source line), and the seven section shells with the prototype's
      headings and scope notes verbatim. `renderInstitutionalPort()` in `company.js`; CSS namespace
      `.ip-*` in `company.css`.  *(P1a+P1b committed as `54d1522`, pushed.)*
- [x] **P1c** prototype ground truth captured → `v3-p5a-institutional/prototype-ground-truth/`
      (PNG per section `#i1`…`#i7` + full page, `literals.json` = every element's text AND computed
      CSS, `tokens.json`). Re-runnable: `v3-p5a-institutional/tools/{capture,ours,boxes,shot,frac}.js`.
      **Two things this settled:** the prototype's tokens are byte-identical to `style.css`'s (only
      `--rule` → `--border-tint-rule` is renamed), and it loads the same Google Fonts request we
      already do — so nothing had to be vendored or re-picked.
- [x] **P1d** the prototype's CSS primitives ported under `.ip-*`, read off the live render with
      `getComputedStyle` rather than inferred from its markup.
- [x] **P1e-§01** built and diffed. **Pixel-identical**: of 3.1M pixels, 753 differ at all, 48 by
      more than 8/255, exactly **1** by more than 32/255, and there are **zero contiguous bands**.
      69 of 73 element boxes match to under 0.01px (the other 4 are a nesting artifact — see the
      log); section height 1127px in both, at 1× and 2×.
- [x] **🚦 OPERATOR READ (2026-07-30): §01 IS the fidelity bar** — with one gap the operator caught
      that I had not surfaced: the prototype's Institutional view has a **right rail** and a
      **SECTIONS jump list**, and the port had neither. Both now built. Four more decisions taken:
      **pacing** = build §02–§07 then show; **expanders** = build and wire them (done for §01);
      **right rail** = the prototype's frame with OUR honest empty state, NOT its nine sample
      filings (no filing index until V3-P3, and P4 deliberately refused to invent one); **rail
      scope** = the ported view only, other views unchanged; **narrow widths** = port as drawn.
- [x] **P1e-§02** built. **Collapsed is pixel-identical** (808px both; 32 pixels above 32/255, in
      four 4-pixel spots at the mini charts' end markers). Three more chart builders ported
      (`ipAreaChart`, `ipStackedArea`, `ipSparkline`), every series recovered numerically from the
      captured SVG path data. ⚠️ **Its EXPANDER is structurally right but not yet pixel-clean**:
      2026.8px against 2025.8px, ~5.7% of pixels differing, concentrated in the 12-panel grid and
      the card head above it. One measurement pass (`tools/boxes.js` on `#i2` with expanders open),
      not a rebuild.
- [x] **Columns fixed app-wide** (operator, 2026-07-31). The port's content column was 732px, not
      the prototype's 694px, and the view rail 132px against its 178px — so six of seven jump-list
      labels wrapped to two lines and one to three. Three rules, all shell-wide:
      `.page` padding 32→**28**, `.shell-rail` 132→**178**, `.shell-viewport` max-width 960→**976**
      (= 694 + 20 + 262; at 960 the cap bound before the column reached its designed width).
      `1440 = 210 + 28 + 178 + 20 + 694 + 20 + 262 + 28`. Now identical to the prototype band for
      band. Checked: e2e clean, no overflow on any page at 1440 or 1280, and §01 improved to
      **0 pixels** above 32/255.
      ⚠️ `/manager` (4) and the legacy Institutional view (3) render SVGs authored wider than their
      mount — **pre-existing**, confirmed by re-measuring with the old widths. That is the
      `ClearyFi.chartWidth()` bug fix 1 solved on the archive branch; it is NOT on this branch and
      is worth pulling across.
- [x] **§02's two cards resized to the prototype** (operator, 2026-07-31). Root cause was a class of
      transcription error worth remembering: **`getComputedStyle` RESOLVES `grid-template-columns`
      to the tracks it worked out at that width.** The capture read back `340px 340px`, which is the
      *answer* at a 694px column, not the rule — the prototype declares
      `repeat(auto-fit, minmax(320px, 1fr))`. Pinned at 340px the cards stopped filling any wider
      column. **Five grids were transcribed this way** and are now the prototype's own declarations:
      `.ip-grid2`, `.ip-panels`, `.ip-mtab-*` (`minmax(120px,1.6fr) 64px 54px 58px`, gap 8 not 9),
      `.ip-ftab-*` and `.ip-speed-row` in §01. **Always read grid rules from the raw inline style,
      never from the computed dump.** Verified across widths: cards now 340/420/445 at
      1440/1600/1920 — identical to the prototype at every one.
      Also found: each expander panel carries a **3px left edge in its manager's own colour** plus a
      1px border on the other three sides. I had one border instead of both, which cost 2px of panel
      height and compounded into an 8px shortfall.
- [x] **§02's expander panel grid fixed** (operator, 2026-07-31). Height now **exact** (2025.8 =
      2025.8); pixels above 32/255 fell 316k → **68k** and bands 49 → 19. Three defects, all found
      by `tools/boxes2.js` (the boxes probe with expanders opened):
      1. **The panel's border.** It carries a 1px border on three sides AND a 3px left edge in its
         manager's colour. I had only the 3px edge — 2px of panel height lost, compounding into an
         8px shortfall down four rows.
      2. **`.ip-card-head--tight` was scoped to `.ip-grid2`.** §02's THIRD card ("Largest reporting
         managers") lives inside the expander, not the grid, so it kept §01's 12px margin and
         pushed the entire panel grid down 1px. Now a modifier on all three of §02's heads.
      3. **The manager table's header margin is 16px, not §01's filing table's 14px.** Another
         per-section pixel the prototype does not normalise; it put the ten-row table 2px high.
      After these the panel grid measures dx/dw/dh **all zero** against the prototype.
- [x] **§02 DONE — all four states at §01's bar** (2026-07-31). Zero bands everywhere; pixels above
      32/255 are **0 / 0 / 30 / 34** for §01 collapsed, §01 expanded, §02 collapsed, §02 expanded
      (the 30/34 are the mini charts' end-marker circles, whose centres the prototype carries at
      full precision and we round to 3dp — four spots, four pixels each). §02 expanded went
      **68k → 34**. Heights exact in all four.
      **Two of the four defects were in the MEASUREMENT, and had been inflating every §02 number:**
      1. The two captures rasterised at **different fractional origins** (ours `.8438`, the
         prototype's `.5`) — §01 pinned it, §02 never did. That alone was the two upper bands.
      2. **`captureBeyondViewport` paints sticky chrome into a tall section's clip.** §02 open is
         2026px against a 1200px viewport, so the topbar composited ~380px down — and it looked
         real because our topbar and the prototype's genuinely differ (`⌘K` vs `Ctrl K`, its
         `API REFERENCE ↗` chip). §01 collapsed is 1127px and never hit it.
      **Three real defects, every one invisible at a 32/255 threshold:** the manager table carried
      one ink + one size where the prototype has three of each (name `--ink-body`, counts `--ink`
      11.5px, Δ `--ink-soft` 11px — that was the band under each of the ten rows); the expander
      button had no `background` so it took the UA's grey in **both** states (10–25/255, under the
      threshold twice over); `.ip-chip` was `--ink-muted` for `--ink-soft` (15/255).
      Re-checked at **DPR 1** as well (where §01's badge defect only became a whole pixel): 2
      pixels above 32/255 in each expanded section, zero bands. e2e 44 shots, all three
      institutional shots `errors=0`, only the two pre-existing sectorapp 502s.
      **Preview is up on `http://localhost:8010/company/AAPL/institutional`**
      (`docker compose --profile e2e run --rm -d -p 8010:8000 --name p5a-preview e2e-app` — host
      8000 is taken by the running `api` container).
- [x] **§03 DONE — the biggest section, clean in both states** (2026-07-31). 3016.5px open, 600
      nodes, four hand-authored charts, eight sub-components. **0 pixels above 32/255 and 0 bands
      in both states**; `compare.py` matched **218 of 218 texts**. Heights exact (1832.5 / 3016.5).
      **But the first diff read 200,685 pixels / 111 bands with every DOM box, line box, wrapper
      and SVG identical to three decimals.** `tools/align.js` showed the top aligning at `dy 0`
      with a perfect zero and everything below the Lorenz at `dy −2` with a perfect zero — the
      same pixels, one CSS px apart.
      ⚠️ **THE MEASUREMENT BUG, and it affected §01/§02 too: matching the VIEWPORT fraction is not
      enough.** Chrome snaps each paint op to the device-pixel grid, and that grid is anchored to
      the **document**, not the viewport — two pages at the same viewport offset but different
      document offsets round some glyph runs up and some down, and below the divergence everything
      is a pixel out. Invisible to every DOM measurement, because the DOM is right. `shot2.js`
      now takes **`SNAP=1`**, which makes the section's document-space top integral on both sides:
      **200,685 → 6,003 pixels, 111 bands → 4.** §01/§02 re-measured with it — unchanged or
      slightly better, but a section straddling a rounding boundary could have been declared clean
      when it was not. **Always pass `SNAP=1`.**
      The 4 surviving bands were **fabricated literals**: I read eight rows of the domicile card's
      markup and invented the ninth and tenth (*Ireland / Other · undisclosed* for the prototype's
      *Norway · sovereign fund / Rest of world*), plus one wrong overlap row. `compare.py` had
      already named all three — which is why it runs BEFORE the pixel diff.
- [x] **The three affordances are LIVE** (operator, 2026-07-31): `⤡ Expand`, `ƒ DERIVED`, `Treemap`.
      Ported from the RUNNING prototype — behaviour is not in the markup, so each was driven and
      read back first. Expand opens a lightbox with its OWN title/note and the chart **re-authored
      at the dialog's measured width** (660→1316 viewBox, never scaled); ƒ DERIVED reveals a
      "how this is computed" panel and flips to ƒ HIDE; Treemap swaps chart + caption + pressed
      state, and Expand then opens the treemap under its own title. Chart builders are now
      width-parameterised. **`tools/drive.js`: 28 driven assertions, 0 failures**; all six section
      states re-diffed with **no regression** (still zero bands, still 0/0/30/34/0/0 above 32/255);
      e2e 44 shots, institutional `errors=0`.
      ⚠️ **Three defects this caught, two of them mine:** the lightbox head was never closed (body
      rendered inside it); I hid Expand in treemap view on a bad read from `click.js` (its
      added/removed detection reuses element ids — the prototype KEEPS the chip); and
      `button.ip-chip` took the UA's grey the moment the span became a button — **~15/255, under
      the 32 threshold, visible only in the `>8` count**. Any span that becomes a button needs
      `background: transparent`.
      🔶 **Three deviations for the operator to rule on** (all listed in the log):
      1. The prototype puts the derivation panel in ONE shared slot at a fixed position (y343,
         between the first card and "Since the last 13F") whatever badge opened it — so the tile
         badge at y938 opens a panel 600px above itself. We render it under the block it explains.
      2. §01's card-head badge opens nothing in the prototype (label-only, verified byte-identical
         over two clicks). Ported as label-only rather than inventing a panel.
      3. The prototype RE-SQUARIFIES the treemap at the lightbox's aspect; we scale the card's
         layout (areas exact, arrangement not). Its markup does not expose the squarify variant.
      Still inert and named: `Set intersections`, `Trend`, the clickable "Effective holders" stat.
- [x] **§04 DONE — the first section built under D-behaviour, and the cleanest yet** (2026-07-31).
      **1961px exact on the first build**, `compare.py` **104/104 texts**, **0 pixels above 32/255
      and 0 bands** in BOTH states and at BOTH device pixel ratios. **6 controls, 0 inert.**
      Doing the inventory FIRST paid immediately: it proved §04 has no `ƒ DERIVED` badges and no
      view toggles, so the unresolved D1 deviation could not block it — under the old order that
      would have surfaced at the end. Ninth chart builder: `ipLaneChart` (one lane per 5%-threshold
      holder; x positions recovered from the captured SVG, two label-placement rules derived and
      both reproduce all four lanes exactly). §04's links go to the registrant's own filings by CIK
      (`cgi-bin/browse-edgar`), not §01–§03's full-text search — `ipLink` now takes a target.
      ⚠️ **Two defects, both the same class as §03's: I invented literals rather than reading them.**
      Ballot items 3 and 4 went in from memory ("Ratify auditor 91.8/8.2", "Elect directors
      (slate)") because the markup I'd read was truncated; the prototype's are "Election of
      directors (slate) · all elected · 91.7/8.3/0.0" and "Ratification of auditor · approved ·
      97.3/2.4/0.3". `compare.py` named all six strings before a single pixel was compared. Also
      paraphrased a caption and one apostrophe. **Extract literals mechanically; never fill a gap
      from memory.** And `var(--gaap)` appeared again (ours is `--gaap-color`) — third token-name
      mismatch, would have silently dropped a bar segment's colour.
      `drive.js` now **53 assertions, 0 failures**; §01–§03 re-diffed with no regression; e2e 44
      shots, institutional `errors=0`.
- [x] **§05 DONE** (2026-07-31). Height exact (1177), `compare.py` **99/99**, **0 above 32/255 and
      0 bands** in both states and at both DPRs, **5 controls, 0 inert**. Tenth builder:
      `ipCohortGrid` (triangular retention heatmap, 45 cells, each carrying both the printed value
      and the capture's own fill-opacity).
      **The inventory unblocked D1**: §05 has two `ƒ DERIVED` badges, so it inherits the unruled
      deviation — but driving them showed **§05's panels open at the bottom of their own card**,
      which is what the port already does. **§01's shared slot is the prototype's outlier, not its
      pattern.** That strengthens D1 rather than weakening it, and let §05 proceed without a ruling.
      ⚠️ **Two structural defects no text comparison can see**, both found by `hprec.js` on the
      grid's children: §05's stat value declares **no `line-height`** where §03's declares `1` (5px
      taller, moving everything below it — third distinct size AND third distinct line-height for
      the same component across three sections), and **the expander bar is a GRID ITEM** here
      (`grid-column: 1/-1`), so it takes the grid's 14px gap; as a sibling after the grid it lost
      that, and the revealed card then needed `--flush`. 30px in total. Plus a caption I never
      extracted (the funds card ends with TWO sentences in two spans) and `var(--gaap)` for the
      fourth time.
      `drive.js` **64 assertions, 0 failures**; §01–§04 re-diffed, no regression.
- [x] **§06 + §07 DONE — ALL SEVEN SECTIONS ARE BUILT** (2026-07-31). §06: height exact
      (1303.97), `compare.py` **99/99**, **0 above 32/255 / 0 bands**, **5 controls, 0 inert**.
      §07: height exact (540.08), **25/25 texts with ZERO property mismatches**, and **collapsed it
      is byte-identical — not one pixel differs**. §07 is the only section with **no controls**,
      confirmed against the prototype before building.
      Three more builders (`ipTimeline`, `ipBubbles`, `ipHistogram`) → **fifteen**. `ipAreaChart`
      gained an **`axisMin`**: §06's amendments chart has a bottom gridline of 2.9, not 0, and
      storing the series pre-offset would have handed phase 2 numbers that are not the quantity
      they claim to be. The histogram's recovered counts come out as clean integers, which is the
      evidence its axis was recovered rather than guessed.
      ⚠️ **One structural defect worth 689px**: §06's expander bar and the two cards it reveals are
      GRID ITEMS with `grid-column: 1 / -1`; ours nested them in a single item, so the bar landed
      in a 340px column (its note wrapped) and the cards stacked instead of sharing a row — 1992px
      against 1304. **`compare.py` had already matched 99/99 texts at that point**: the words were
      right and the layout was not, which is exactly the split those two tools exist to separate.
      `var(--gaap)` for the fifth time.
      `drive.js` **71 assertions, 0 failures**. e2e 44 shots, institutional `errors=0`.
- [x] **P1g DONE — the full-page diff** (2026-07-31). §01's top to §07's bottom in one capture
      (`shot2.js` gained `SEL2`), deliberately excluding the banner, rails and topbar — all of
      which differ by decision. **Collapsed: 694 × 7,231 in both, 0 above 32/255, 0 bands.
      Expanded: 694 × 11,856 in both, 4 above 32/255, 0 bands.** `align.js` reports a perfect zero
      at (0,0) on **all six section boundaries**, which is the direct evidence the spacing BETWEEN
      sections is right — the one thing per-section diffs cannot see.
      Run at 1×: a 2× capture of 11,856 CSS px is 23,712 device rows, past Chrome's 16,384 canvas
      limit, so the diff cannot be computed at all. Every section was already measured at 2×.
- [x] **🚦 OPERATOR GATE PASSED — 2026-07-31.** Walked interactively; verdict **"Confirmed — the
      design is faithful"**. §04–§07 and the whole-page rhythm came back "indistinguishable"; §01–§03
      raised **one defect: the left rail was not fixed like the prototype's** (fixed, below). All
      four listed deviations (D1 panel placement · D2 the label-only badge · D3 the scaled treemap ·
      D4 keyboard on the stat) **accepted as built**. Steps 1–15 of `4b-manual-verification.md` all
      pass, 7b included. Trail: `4b-manual-verification.md`.
      ⚠️ **The rail defect, and why nothing caught it.** `.shell-rail` WAS `position: sticky;
      top: 74px` — correct since V3-P2. But its mount host (`#viewRail` / `#railHost`) is a flex
      item of `.shell-body { align-items: flex-start }`, so it shrink-wrapped to the rail's own
      **549px**; a sticky element is bounded by its parent's box, so the rail came unstuck the
      moment you scrolled past that. The prototype's `<nav>` is a direct child of the ~7,300px flex
      row. Fixed shell-wide with `.shell-rail-host { align-self: stretch; }`. **Every diff in this
      port is a static capture of ONE scroll position — sticky behaviour only exists in the
      difference between two, and nothing in the tooling compared them.** `tools/rail.js` now does.
      Second time the hands-on gate caught what the automation could not.
      *(Compare surfaces, for phase 2's own verification: ours at
      `http://localhost:8010/company/AAPL/institutional`, the prototype at
      `http://localhost:9000/prototype.dc.html` → "Companies" → "Institutional". To restart them see
      "THE UNLOCK" above — the prototype needs `-p 9000:9000` to be reachable from a browser, not
      only from the capture container.)*
- [x] **Retro-fit sweep DONE** (2026-07-31) — D-behaviour applied across §01–§03. `Set intersections`
      (a whole UpSet plot + its 8-row combination table), `Trend` and the clickable "Effective
      holders" stat (an inline trend panel + "the measures behind it"), and all five `↗` links (real
      anchors to EDGAR, `target=_blank rel=noopener`) are live. **`tools/controls.js`: 30 controls,
      exactly 1 unwired** — §01's card-head badge, which opens nothing in the prototype either, and
      `drive.js` asserts it is the only one. **`tools/drive.js`: 49 assertions, 0 failures.**
      No rendering regression: all six states, heights identical, zero bands, >32/255 at
      0/0/30/34/0/0. Trail: **`4-qa.md`** + **`4b-manual-verification.md`** (operator ran batches
      A–C by hand, all passed).
      ⚠️ **The operator found the one defect no script caught**: the overlap card's `⤡ Expand`
      always opened the peer matrix, even with `Set intersections` showing. I had shipped that as a
      *listed gap* because my probe couldn't open the modal in the prototype — **the probe was
      wrong** (the overlap card is inside the expander, which I hadn't opened). Opening it, the
      prototype answered in one call: "Manager set intersections · exclusive combinations across
      AVGO, TXN, NVDA, AMD", viewBox `0 0 1316 480`. **Lesson: a gap you cannot characterise is a
      gap in the PROBE until proven otherwise — re-drive it before writing it down as by-design.**
      Diffing that view then found three more of my own: the UpSet had bands on all four rows (the
      prototype stripes alternate), bars at 0.55 not 0.5 opacity, and row labels in the 9px axis
      style instead of 10px/600 `--ink`. **I had asserted the UpSet's structure but never pixel-
      diffed it** — 437 → 64 pixels above threshold once fixed.
- [x] **Closed with the operator 2026-07-31**: step 7b re-checked after the fix ✅, steps 13–15 ✅,
      and **all four deviations accepted as built** (panel placement · §01's label-only badge · the
      scaled-not-re-squarified treemap · keyboard access on the stat). Recorded in
      `4b-manual-verification.md`.

### §02's defects — the same classes keep recurring, check for them first

1. **Chip/badge line box** — the prototype's are `<button>`s on the UA's `normal` line box; a
   `<span>` inherits the body's and comes out 2px taller. **Third time this has bitten.**
2. **Card-head bottom margin is 11px in §02, 12px in §01.** The prototype differs by a pixel
   between sections; do not normalise it.
3. **`var(--gaap)` does not exist here — ours is `--gaap-color`.** An invalid custom property makes
   `stroke` fall back to none and `fill` to black, so a chart line silently disappears. Second
   token name that differs, after `--rule` → `--border-tint-rule`. **Check every `var()` you copy.**
4. **Axis ticks are literals, not computed.** The prototype's maxima are fractional (~1814.2,
   ~837.8); quarters of a rounded max print 210M/629M for its 209M/628M.
5. **`opacity` is invisible in a computed-style dump** that only asks for `background-color`. The
   legend bar and its tick are at 0.55 — 7,400 differing pixels. **Add `opacity` to the probe.**

6. **A pixel diff at 32/255 cannot see a wrong colour token or a UA background.** `--ink-muted` for
   `--ink-soft` is 15/255; a `<button>`'s default grey against the card cream is 10–25/255. Three
   of §02's defects hid there. **Run `tools/compare.py` (property-by-property, matched by text)
   BEFORE the pixel diff** — it names them; the image cannot.
7. **Font stacks: the prototype uses FOUR, and which one an element gets is not guessable.** Bare
   `"IBM Plex Mono"` / `"Hanken Grotesk"` on most HTML, the `-fb` pair (with generic fallback) on
   every SVG `<text>` **and** on §02's panel component and the manager-name classes. It matters
   only where a glyph is missing from the loaded subset — `ƒ`, `↗`, `Δ` so far — but there the
   *fallback* sets the width and everything after it drifts. Port-local `--ip-mono`, `--ip-sans`,
   `--ip-mono-fb`, `--ip-sans-fb`; never `--font-mono`/`--font-sans`, which are both fallback
   stacks. ⚠️ **Phase 2 must revisit**: a real filer name can carry glyphs outside the latin
   subset, and a bare stack renders those in the UA default rather than a monospace.

⚠️ **And the one process failure:** I built §02's expander from the section's TEXT and produced a
flat list of eight rows. The prototype has a 3×4 grid of twelve sparkline panels followed by a
ten-row table. **Read the tree, never the text.**

### The tooling §04–§07 should be built with (all re-runnable, in `tools/`)

**The loop, in order:** read the section's TREE out of `literals-open.json`'s `html` (never its
text) → recover every chart series numerically from the captured SVG and **round-trip-check it** →
build → `compare.py` → `diff.js` → `crop.js`/`align.js` on whatever survives.

| script | what it does |
|---|---|
| `shot2.js` | one section, either app, collapsed or open, matched column, **`SNAP=1` always**, sticky chrome hidden, explicit clip |
| `compare.py` | every property mismatch, matched by text. **Runs BEFORE the pixel diff** — it finds wrong colour tokens, wrong font stacks and invented literals, none of which a 32/255 threshold can see |
| `diff.js` | canvas pixel diff: three thresholds, contiguous **row bands**, hot columns. Bands are the signal; scattered pixels are antialiasing |
| `align.js` | the (dx,dy) shift that best aligns a region. Answers *"layout difference, or the same pixels drawn a fraction off?"* — it found the paint-grid bug |
| `crop.js` | proto/ours/diff stacked for one y-range, zoomable — turns a band into something you can look at |
| `text.js` · `lines.js` · `chain.js` · `hprec.js` | per-run widths · per-line-box geometry · ancestor chain with margins/padding (the only probe that sees a WRAPPER) · full-precision 4dp heights |

`compare.py` reports three **known artifacts** on every section — button/cell nesting, inline-vs-
block caption boxes, and split text nodes. Don't chase them; they're listed in the log.
- [x] **P1e** §02 → §07, each screenshot-diffed against its capture before the next began
- [x] **P1f** all fifteen prototype chart builders ported (D-protocharts)
- [x] **P1g** full-page diff vs the prototype
- [x] **🚦 OPERATOR GATE** — passed 2026-07-31, see above
- [x] **P2 backend DONE** (2026-07-31). Mined `register.py` (488 lines, pure — no DB/network/clock),
      3 routes, 2 storage reads and 37 tests from `v3-p5a-attempt3-archive`; **no `static/` file
      came across**. Our branch had touched no backend file since master, so it grafted with no
      conflict. **609 pytest passed / 9 skipped**; `register.py` ruff-clean (the rest is
      pre-existing house style — master reports 134 of the same classes, mostly FastAPI's `B008`).
      Driven live: HHI/Gini/effective-holders, turnover, tenure, stable capital, filed-since — and
      **the honesty paths**: an empty quarter returns `status: "na"` with a reason and every derived
      number **null, not 0**; an unresolved issuer 404s with an explanation. Contract:
      `3-implementation.md`.
- [x] **P2 prototype-v4 markup sync** (2026-07-31). v4 (the d3 rewrite) diffed against v3 and
      against our shipped pages; **two markup changes taken**, the rest deliberately deferred —
      `instData` is byte-identical between the two, so d3 and plumbing don't interact. §01 gained
      the DEF 14A cross-reference; §06's Form 144 card was gutted **by the design**, which retired
      `ipBubbles`, its lightbox entry, both EDGAR constants, four literal blocks and the
      `.ip-notice-*`/`.ip-planlist` CSS. §01 now diffs **0 pixels / 0 bands at matched height**
      against v4; §06 expanded matches at 1301px. Full numbers: `5-design-port-log.md` run 11.
- [ ] **P2 frontend — THE WORK NOW.** Consume the endpoints on this branch, literal by literal,
      until none remain. ⚠️ **`3-implementation.md` has a CANNOT-SOURCE table** — §04 (voting/N-PX)
      and §06 (supply events, acceptance lag) are largely **not ingested at all**.
      Each needs a decision — plumb, honest empty state, or remove — **never a surviving literal**.
      💡 **"The design deleted it" is a valid third answer** — §06's Form 144 row was retired that
      way. Check the current prototype before building an empty state for a block that may be gone.
  - [x] **§01 QA + operator acceptance** (2026-08-01). ✅ **Confirmed** — `4-qa.md` +
        signed `4b-manual-verification.md` (phase 1's are preserved as `*-phase1.md`). **Three
        layout defects, one cause: every constant in the port was sized for the prototype's short
        sample strings.** D-1 the equation panel (248px/3 rows → 81px/1 row, operator-reported);
        D-2 the freshness strip (157→105px, swept); **D-3 the dumbbell gutter clipping real manager
        names — font-dependent (165.8 units with the webfont, 184.7 without), so it rendered clean
        in every headless capture and was cut on the operator's screen.** Fixed by measuring with
        `getComputedTextLength()` post-paint per RECONCILIATION §6. ⚠️ **§02–§06 have the same
        exposure** — sweep every hard-coded label gutter, and run layout checks **with the webfont
        blocked**. Run 13 in the log.
  - [x] **§01 Register snapshot** (2026-07-31). `IP01` down from 4,384 chars to two **filing-rule**
        blocks (`scope`, `speed`). Data layer `IP_DATA`/`ipLoad` — four endpoints settled not raced,
        so one failure doesn't blank the page; `IP_DONE` drives the banner, which now names only the
        sections still on literals and disappears on its own. A plumbed section **never falls back
        to a literal** (loading/error states instead). Four CANNOT-SOURCE figures render `N/A` with
        their reason, **never a number**; `zeros: []` verified on every capture. Real data caught
        three defects literals hid — the dumbbell's baked-in `domainMax`, the freshness strip
        wrapping under real `reason` sentences, and two captions that had become false. Details:
        `5-design-port-log.md` run 12.
  - [x] **§02 Register over time & holders** (2026-08-01). `IP02` deleted **entirely** (6,260
        chars — unlike §01 nothing survived, every value was a figure not a filing rule), plus the
        now-unused `ipStackedArea`. Register-per-quarter from `/institutional-register` asked once
        per ingested quarter (the API owns those numbers); panels from `-holdings-series`; table
        from the ranked `share_vector`; Δ from `-activity`. **⚠️ Manager mix cannot be sourced** —
        the prototype's own note says "classification assigned by ClearyFi" and we assign none;
        built as an honest empty state, **decision open**. Two labels renamed to what we can
        actually compute ("% out" → "% of register"; the classification sub-line → quarter count).
        Three defects: a continuous axis printing counts as "0 2 4 5 7"; a **pre-existing inert
        badge from phase 1** (`02-topten` had no derivation entry); and **a double-bound listener I
        introduced in run 12** — `ipBindAffordances` had no bind-once guard and ipPaint runs twice,
        so every TOGGLE ran twice and landed where it started. Run 14 in the log.
  - [x] **`typeOfReportingPerson` plumbed** (2026-08-01, operator-requested). The 13D/G cover-page
        box is the **only entity self-classification in any ownership form we ingest** — 13F has
        none at all. ⚠️ **Item 3 is NOT one field across the two forms**: on 13G it is the
        classification, on 13D it is "Source and Amount of Funds" (free prose, Track 2). The cover
        box is on both, per reporting person. Parser + schema + column + migration + a server-side
        name join (exact-after-normalization, `cusip.py` posture — the forms carry no CIK for
        reporting persons). `normalize_issuer_name` now drops a leading "THE" (an article carries
        no identity; also fixes the CUSIP resolver). Shows as a **Type column** on §02's table.
        **Coverage is the limit and it decides the design:** only 5%+ holders file 13D/G, so this
        is fine for a column and NOT enough for the manager-mix composition chart, which keeps its
        empty state. Run 15 in the log.
  - [ ] **§03–§06** — same pattern, section by section. §07 is reference copy and stays.
        ⚠️ **Run the clipping sweep (webfont blocked) and the toggle-state assertions BEFORE
        shipping each one** — both caught real defects in §02 that a "did something happen" check
        would have passed.
  - [x] ✅ **SETTLED — the status vocabulary.** Operator chose **chips only on N/A and
        approximate**; recorded as **D-chips** above and implemented on §01. §02–§06 follow it.
- [ ] **P2 QA + 4b** — a NEW `4-qa.md` / `4b-manual-verification.md` for phase 2. ⚠️ The ones on
      disk cover the phase-1 affordances change and the fidelity gate, NOT phase 2 — do not read a
      green report there as phase 2 being verified.

✅ **Phase 1 is fully committed.** `6c42d19` (§06 + §07 + P1g) on `ae0244f` (§02–§05 + the
affordances) on `735a14f` (§01 + both rails) on `54d1522` (the scaffold). Nothing pushed.
Previously:  `ae0244f` — "§02–§05 ported, and every control made live" (46 files, +5,461).
`735a14f` before it carried P1a–P1e-§01 and both rails. Nothing pushed.

## The measured remainder — read before starting §02

Ground truth for all seven sections is captured **with the expanders open**
(`literals-open.json`, `proto-i<N>-open.png`). Section heights, open:

| §01 | §02 | §03 | §04 | §05 | §06 | §07 | total |
|---|---|---|---|---|---|---|---|
| 1700 | 2026 | 3017 | 1961 | 1177 | 1304 | 540 | **11,725px** |

§01 is finished, expander included. §02–§07 are empty shells: ~10,000px of design and roughly
**eight more chart builders** to port — paired mini bar charts and a nine-quarter stacked area
(§02); a diverging flow chart, a ranked bar list, a cumulative-share curve and a treemap (§03);
§04–§06 not yet inventoried. Every one is a hand-authored SVG on a fixed `viewBox` in the
prototype, like §01's dumbbell — never Plot.

**Method, non-negotiable** *(superseded in detail by "The tooling §04–§07 should be built with"
above — this is the shape of it)*: read the tree → **inventory and drive the section's controls** →
recover the chart series numerically → build markup **and behaviour** → `compare.py` → pin the
column, its fractional origin AND its document-space origin (`SNAP=1`) → pixel diff → `drive.js`
→ re-diff the default states. §01 only reached pixel-identical because every element was measured;
four of its five defects were invisible by eye, and its controls still had to be rebuilt later
because they were ported as pictures. Building six sections faster than that is precisely what
produced three rejected attempts.

### What the second run added, beyond §01

- **`shell.js`'s `rail()` takes an optional `sections` list** — a view that declares none renders
  exactly what it did before, so no other page changed. Labels are the prototype's SHORT forms.
- **Right rail** on the ported view: `.ip-rr-*`, its own namespace, so P4's signed-off rail is
  untouched. Column went 960px → **732px** (the prototype's is 694px; the 38px is our 132px view
  rail against its 178px, which is V3-P2's settled width and not the port's to change).
- **Expanders are real.** Bar toggles the block after it and relabels itself `− Hide`. §01's body
  is built: six-filing table, exclusion caveat, five-row "how fast each form arrives".
- **Scroll-spy: two bugs found by measuring.** An `IntersectionObserver` band was reliably off by
  one (`scroll-margin-top` parks the target inside it while the previous section is still there);
  the rect test that replaced it then missed by **exactly one pixel** (sections land at top=121,
  the line was 120). Clicking a rail link now marks its own target and holds the scroll handler
  off 900ms. ⚠️ Driving `scrollIntoView` at the LAST sections still marks the previous one — the
  page cannot scroll them under the line. Re-check once §02–§07 have real height.
- **§01 re-diffed after all of it: still zero bands, still 1 pixel above 32/255.**

---

## What §01 cost, and what it caught — read this before §02

Full record: **`docs/delivery/v3-p5a-institutional/5-design-port-log.md`**. The four defects the
numeric diff found and the eye did not:

1. **`style.css`'s `h2` rule leaked in** (`line-height: 1.12; letter-spacing: -0.03em`) — the
   section title came out 9.6px narrower and 3.7px shorter, and pushed *every element below it* up
   by 3.7px. This is precisely what "leftovers from previous design" means, and it is invisible
   without measuring. **Assume more of these; measure every section.**
2. **Badge line box** — the prototype's badge is a `<button>` (UA `line-height: normal` → 11px); a
   `<span>` inherits the body's. Survived rounding at 1× and became a whole extra pixel at 2×.
   **Check every section at both device pixel ratios** (`tools/frac.js`).
3. **`text-wrap: pretty`** — the prototype sets it on exactly three things in §01 and nowhere else.
   It changes where last lines break.
4. **Font fallback** — the prototype declares `"IBM Plex Mono"` with NO generic fallback on the
   badge and the `↗` link; `ƒ`→U+0191 and `↗`→U+2197 are absent from that font, so the fallback
   decides the box width.

**The method, in order:** capture → build → `boxes.js` (numeric, catches layout) → pin our column
AND its fractional origin → pixel diff (catches rasterisation). Pinning the origin matters: Chrome
snaps line boxes to device pixels, so a half-pixel difference in where the section starts rounds one
line of a paragraph differently from its neighbours and fills the diff with noise that is not a
layout difference.

### Deliberate, listed differences in §01 (not oversights)

- ~~**Every affordance is inert** — the two `ƒ DERIVED` badges, `Base 13F ↗`, and the
  `+ ALSO IN THIS SECTION` bar are `<span>`s that render identically and do nothing... wired in
  phase 2.~~ ❌ **OVERTURNED 2026-07-31 by D-behaviour.** This was the wrong call and it cost a
  rebuild: phase 1 ports the behaviour too. The expander, both badges and the chips are now live;
  `Base 13F ↗` and the remaining links are on the retro-fit list above.
- **The dumbbell's `prior`/`current` were recovered**, not invented: read back from the captured
  SVG's x positions via `x = 210 + v/123.43 × 372`. They reproduce the geometry to <0.1px *and*
  every one rounds to the delta the prototype prints — that agreement is the proof the scale was
  recovered rather than guessed.
- **Colour is carried per row**, not derived: the prototype paints "Active manager D" `#a88c5f` but
  "Active manager E" `#8b8579`, so its type→colour rule keys off something its labels don't expose.
  Only three colours appear across §01–§04. **§02/§03 should settle it.**
- **Narrow widths**: below ~600px the freshness strip stacks and its 1px vertical rules strand
  between cells, reading as stray marks. The prototype's own CSS, ported as written. Needs a
  decision if we care.

### e2e

44 shots. `institutional`, `institutional-legacy`, `institutional-nolocation` all `errors=0`.
**One real regression found and fixed:** the P1a re-route silently broke the holder-geography
regression guard (`institutional-nolocation` clicks `#inst-subtabs`, which now lives at the legacy
slug) — it had been failing since `54d1522`. Repointed, plus a shot added for the port.
Two failures remain and are **pre-existing, confirmed by stashing this run's changes and
re-running**: `sectorapp-company` (errors=8) and `sectorapp-company-refocus` (errors=14), both 502s
on `/sectors?view=company&symbol=900001`, a synthetic fixture CIK, on pages this change never
touches. No `pytest` run — no Python changed.

---

## 🗄 Attempt 3 is archived, not lost — mine it, don't rebuild it

Branch **`v3-p5a-attempt3-archive`** (commit `1429955`, local, never pushed). Restore any single file:

```bash
git checkout v3-p5a-attempt3-archive -- <path>
git branch -D v3-p5a-attempt3-archive     # to discard it entirely
```

**Worth pulling from it rather than re-deriving** (each was verified working):

| What | Why it may be worth having |
|---|---|
| `src/secfin/normalize/register.py` + 4 endpoints + `period_meta` + 37 tests | The whole **phase-2** backend, already built and green: `share_vector`, `concentration` (HHI / effective-N / Gini / "half the register"), `turnover`, `tenure`, `stable_capital_share`, each carrying `status` + `reason` + `formula` + `population` + `cannot`. Zero DuckDB, zero batch jobs, zero new ingest. |
| **fix 1** — `ClearyFi.chartWidth()` + `.page { width: 100% }` | A **real, product-wide layout bug**, unrelated to this view: charts were authored at the mount width, then silently downscaled by their own card (Plot's `max-width:100%` scales text too — measured 854→816, 419→381); collapsed `:empty` mounts measured 0 and fell back to a default; and `.page` was sized by its CONTENT, not the viewport (64→952→1070px on /manager as content landed — the likely cause of V3-P4's "content column squeezed to 171px"). |
| **fix 2** — `coHoldingNetwork` label placement | Candidate-offset placement + drop, per `STYLE_GUIDE` §12. |
| `scripts/seed_fixture.py` 13F `filed` dates | Fixture filed *on* quarter-end is impossible (a 13F is due ~45 days after); lagged to 31–44 days. |
| The delivery trail | `1-brief.md` (32 ACs) · `2-architecture.md` · `0-element-inventory.md` (as-built, every row with a verdict) · `4-qa.md` · `4b-manual-verification.md` · `5-design-port-plan.md` |
| `prototype-ground-truth/*.png` | The captures; or just regenerate them with the commands above. |

⚠️ Attempts 1 and 2 are separately preserved on branch **`v3-p5-company-institutional`** (`0ce1146`).
**Do not build on or delete either archive branch.**

---

## Inherited lessons — these cost real rounds. Don't re-learn them.

1. **Open the prototype per ELEMENT, not per phase.** Diff the element list of the prototype section
   against what you built, one line at a time. Now that it renders, diff the *screenshots*.
2. **Ten of V3-P4's defects were visible ONLY in a screenshot** — phantom grid cells, a 73-label axis
   smear, a content column squeezed to 171px, a chart ignoring its container. The e2e exit code was
   green for every one. **Eyeball every shot.**
3. **Verify a failing assertion before reporting it.** Six of P4's "failures" and four of attempt 3's
   were the script's fault: `innerText` of a **collapsed** container (a `<details>`, or anything
   `hidden`) is empty **by design** — use `textContent` or open the affordance first. Also:
   `fullPage` screenshots misplace `position: sticky`/`fixed` elements, which looks like an overlap
   bug and isn't.
4. **A chart built inside a hidden container measures 0** and silently authors at its fallback width.
   Mount on first reveal.
5. **`selectTab()` early-returns when the view is already active** — any "jump to view X carrying
   state" hand-off must handle the already-there case. P4 shipped exactly that bug.
6. **Ask, don't guess, on ambiguous design feedback.** P4's four clarifying questions each prevented
   a wrong cycle; the two items guessed at both came back.

### Two honesty tensions phase 2 must resolve (seen in the prototype's own §01)

The prototype draws figures we either cannot source or have deliberately refused to compute. Phase 1
ports them **as drawn** — the operator is verifying design. **Phase 2 must re-apply the honesty
calls**, and each one changes the layout, so each needs an operator decision rather than a silent
revert:

- **"Confirmed in last 30 days · 32%"** — we do not track filing confirmations.
- **The adjusted register** (`767M + 9.7M = 776M`) — summing a 13D/G *total* + a Form 4 *transaction*
  + a 13F *holding* invents a share count nobody filed. Attempt 3 omitted it deliberately and the
  operator's Batch B passed on exactly that reasoning.

---

## Parallel track (NOT the active task) — V3-P3, cheap metadata unlock

`ROADMAP_APP_V3` §6: **backend-only, no UI, depends on nothing** — can run alongside. Store **8-K item
codes + acceptance timestamps** from the `/submissions/` JSON we already fetch. Turns the shell's
"What's moving" feed from a placeholder into a real feed, unblocks **P8**, and makes V3-P4's
right-rail Filing-timeline placeholder real without moving it. `sec/insider.py:_recent_filings()`
already walks those parallel arrays filtered to Forms 3/4/5 — generalizing that filter is most of the
work. ⚠️ **Verify `items` and `acceptanceDateTime` are actually present** in a real payload fetched
with our own compliant User-Agent before designing; the roadmap asserts it.

## Previous task

### ✅ V3-P4 DONE (2026-07-28) — merged to master as `94c3c70`
`/company/{symbol}` re-cut into **Overview** (`hub`) and **Financial history** (`history`).
Trail: `docs/delivery/v3-p4-company-recut/`. Discoveries P5 inherits as fact:
**companyfacts carries NUMERIC facts only** (`dei:AuditorName`, NAICS, HQ, employee count are text →
structurally absent from our store); **`company_profiles` has name + SIC for 8,917 CIKs**;
`/metrics` returns a per-metric `trend` array that is **intra-year quarters, not year-over-year**.

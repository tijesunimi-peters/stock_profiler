# 1 — Product brief: V3-P1, chart foundry (rescoped)

**Task:** `v3-p1-chart-foundry` · **Stage 1 (Product Manager)** · 2026-07-26
**Source:** `docs/ROADMAP_APP_V3.md` §5/§6 · `docs/design/sector-app-prototype-v3/RECONCILIATION.md` §5

---

## Scope gate fired — and the operator rescoped this phase

The roadmap specified five builders for wave 1. **A pre-scope inventory of the existing
`window.ClearyFi` surface (~30 chart builders) found that two already exist and two more have no
data source until a later phase.** Evidence:

| Roadmap target | Actual state in production |
|---|---|
| Gap-breaking series line | **Already exists and is already honest.** `sectorDupontTrend` breaks the line on null with an explicit in-code comment (*"Line breaks wherever `value` is null (a coverage-gap year) — never interpolated"*) plus a `hasGap` caveat; `sectorLifecycleTrend` and `valueLineChart` do the same. Implemented in **Plot** |
| Stacked columns | **Substantially exists** — `commonSizeChart` (100%-of-revenue, null rendered as documented gap not 0%), `capitalStructureTrend`, `compositionBars`, `holdingsSeriesChart` |
| **Distribution strip** | **Genuinely missing.** `sectorapp.js:1521` currently positions peer dots as CSS `<span>`s with **index jitter**; `boxWhiskerChart` covers sector spreads with a different mark for a different view |
| Histogram | **Absent** (0 hits repo-wide) — but its prototype uses (filing cadence, acceptance lag, filing hour) are Manager views whose data comes from **V3-P3, not built** |
| Event strip | **Absent** (0 `scaleTime`/lane hits) — same dependency: **V3-P8 / V3-P3 data** |

Rebuilding the first two in d3 would **contradict D5's own selection rule** (Plot where the chart is
a plain mark on a scale; d3 only where label-collision logic is needed) and would duplicate honest,
shipping code. Building the last two now would mean guessing at data shapes that V3-P3 defines.

**Operator decision (2026-07-26): rescope to what is provable.** Ship the distribution strip and a
builder inventory; defer histogram and event strip to the phases that consume them.

---

## Problem / user

Two problems, one phase.

**1. The Company view's peer distribution is a hand-rolled hack.** `sectorapp.js:1521` places each
peer as an absolutely-positioned `<span>` at `left: <pct>%` with a **jitter derived from list
index**, not from the data. Index jitter is arbitrary: the vertical position carries no meaning, and
overlapping peers at similar values are separated by an accident of sort order rather than by
density. It is also the one distribution rendering that cannot reuse the chart chrome, caption, or
label rules every other chart obeys.

**2. Every future phase re-derives the same question.** V3-P4 through V3-P8 each face "does this
prototype builder already exist?" — the question that just reshaped this phase. Answering it once,
in a durable document, is worth more than any single builder.

**User:** the engineers building V3-P4…P8, and the reader of the Company view who currently sees a
distribution whose vertical axis means nothing.

## Scope

1. **`ClearyFi.distributionStrip()`** — one builder with options, replacing the prototype's
   `dotPlot` / `peerDots` / `universeDots` trio (RECONCILIATION §5c consolidation). IQR band, median,
   optional focal marker, one mark per peer. Density-based placement (`d3-force` beeswarm) rather
   than index jitter, per RECONCILIATION §5b.
2. **Migrate the sector app's Company view to it** — remove the `.pa-dot` index-jitter path. A
   builder that ships beside the thing it replaces is the duplication this phase exists to stop.
3. **`/components` entry** exercising the honest edge states, not just the happy path.
4. **`docs/BUILDER_INVENTORY.md`** — every prototype builder (~40) mapped to one of: *exists in
   production* (naming it), *stays CSS/flex* (the 13 from §5a), *new — build in phase N*, or
   *deferred*. This is the phase's most reusable output.

### Out of scope

- **Histogram and event strip** — deferred to the phase that consumes them (V3-P6/P8), where they
  can be built against real data rather than fixtures.
- **Rebuilding the series line or stacked columns.** They exist and are honest. The inventory
  records them; no code changes.
- **The 13 CSS/flex builders** (§5a) — porting them to d3 would be a regression.
- **Any V3-P2 shell work.** In particular, the sector app still won't load `app.css`; this phase
  follows the existing precedent (below), it does not fix it.
- **Migrating `boxWhiskerChart`.** Box-whisker is a different mark serving the sector-spreads view.
  The inventory records the distinction; the two coexist deliberately.

## Acceptance criteria

**The builder**

- **AC-1** `ClearyFi.distributionStrip(data, opts)` exists, **returns a DOM node**, and wraps itself
  in `chartCard()` (STYLE_GUIDE §6, D5).
- **AC-2** Width comes from `ClearyFi.measuredWidth(container, fallback)` — **no hardcoded pixel
  width** anywhere in the builder.
- **AC-3** Renders an IQR band, a median mark, and — when `opts.focal` is given — a visually
  distinct focal marker. **The focal marker is distinguishable without relying on color alone**
  (§7 accessibility rule): shape or size must carry it too.
- **AC-4** Peer placement is **density-derived** (beeswarm), not index-derived. Two peers with the
  same value must be positioned by collision resolution, not by their position in the input array.
- **AC-5** Obeys STYLE_GUIDE §12: labels measured with `getComputedTextLength()`, edge-anchored
  rather than width-estimated, minimum effective text ≈9px, authored at container width.
- **AC-6** **One fill.** Peers share a single mark treatment; emphasis (not a lightness ramp or a
  second hue) distinguishes the focal peer. Magnitude is never encoded in color (§9.2, §6).

**Honesty — the load-bearing set**

- **AC-7** A peer with a **null / N/A / N/M value is omitted from the strip, never plotted at 0**
  and never silently dropped from the count: the caption states how many peers were excluded and
  why (§9.1, §9.3 — rankings exclude N/A and N/M).
- **AC-8** **Empty and thin data render an honest empty state**, never a broken or misleading
  partial chart: zero peers → `states.empty`-style copy; a single peer → no fabricated IQR band
  (an IQR from one point is meaningless — say so rather than drawing a zero-width band).
- **AC-9** The caption names the distribution as **derived** and states the peer basis (how many
  peers, which set), consistent with the standing-caveat/dedupe rule (§6).

**The migration**

- **AC-10** The sector app's Company view renders peer distributions via `distributionStrip()`, and
  the `.pa-dot` **index-jitter code path is removed** — not left dormant beside it.
- **AC-11** The Company view's existing behaviour is preserved: clicking a peer still re-focuses
  that company (`data-cik` interaction), and the focal company still reads as focal.
- **AC-12** The sector app still does **not** load `app.css`; the builder's chrome is styled by the
  existing local re-declaration precedent in `sectorapp.css` (see Risks).

**The inventory**

- **AC-13** `docs/BUILDER_INVENTORY.md` covers **every** builder named in RECONCILIATION §5a/§5b/§5c,
  each with exactly one status: *exists* (named production builder), *stays CSS/flex*, *new — phase
  N*, or *deferred*.
- **AC-14** Each *exists* row names the production builder and notes any behavioural difference —
  in particular, which existing builders already satisfy the gap-breaking requirement.
- **AC-15** The inventory records the **two deferred wave-1 builders** (histogram, event strip) with
  the reason (data source lands in V3-P3) so a later phase doesn't re-litigate the deferral.

**Verification**

- **AC-16** `/components` renders the builder in **at least four states**: populated with focal,
  populated without focal, single-peer, and empty.
- **AC-17** e2e headless check passes with **zero console errors**, and the screenshots are
  eyeballed for label overlap, clipping, and horizontal-scroll bleed at desktop and mobile widths.
- **AC-18** No regression in the sector app's Company view: it still renders, still re-focuses, and
  the e2e run is no worse than the baseline (the known pre-existing synthetic-CIK 502 aside).

## Risks / open decisions

1. **The sector app cannot see `app.css`** — the builder lives in `app.js` (which the sector app
   *does* load) but its chrome CSS lives in `app.css` (which it does not). **Precedent exists and
   should be followed, not fixed here:** `sectorapp.js:1184` already consumes the shared
   `boxWhiskerChart`, and `sectorapp.css:189` re-declares `.plot-chart-*` locally with a comment
   explaining exactly why. This phase adds one more instance of a duplication **V3-P2 will resolve**
   — acceptable and explicitly temporary. Flagged so it isn't mistaken for an oversight.
2. **`.plot-chart` is declared in four stylesheets** (`app.css`, `company.css`, `sectorapp.css`,
   `sectors.css`). V3-P2's brief says "resolve the two stylesheets' overlap" — it is **four**.
   Recorded here for P2; **not** in scope now.
3. **Beeswarm cost.** `d3-force` is iterative. With a large peer set the simulation must be run to a
   fixed tick count synchronously, not animated — an animating chart on a data page would be
   decoration (§10). If the peer count makes this slow, falling back to deterministic
   collision-offset placement is acceptable **provided it is data-derived, not index-derived**
   (AC-4 is about meaning, not about the algorithm).
4. **AC-7 is where honesty usually erodes.** The tempting implementation silently filters null peers
   and renders a clean strip. That is a fabricated distribution — the reader cannot tell 40 peers
   from 40-of-58. The count must survive into the caption.
5. **This phase is smaller than the roadmap implied.** That is the point, and it is recorded: three
   of the five originally-specified builders were either already built or not yet buildable. The
   inventory is what prevents that discovery from being made again in P4.

## Handoff → Principal Architect

Design the builder's option surface (what `opts` carries: focal, IQR on/off, unit/formatter,
caption, empty copy), decide beeswarm vs deterministic offset against AC-4's *meaning* requirement,
and specify the `sectorapp.css` chrome re-declaration per Risk 1. Name the exact call sites in
`sectorapp.js` to migrate and confirm the `.pa-dot` removal is complete rather than partial.

Frontend-only — no API, no backend stage, no new dependency (vendored d3 v7.9.0 already exports
`forceSimulation`, `quantile`, `scaleLinear`). **The 4b operator gate is REQUIRED**: this changes an
interactive, rendered surface, so QA's automated pass does not substitute for the operator driving
the Company view by hand.

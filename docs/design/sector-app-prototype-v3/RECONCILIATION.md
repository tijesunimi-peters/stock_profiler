# Reconciliation — prototype `Sector Analytics.dc.html` → ClearyFi frontend

Read **after** `uploads/HANDOFF.md` (the production frontend brief) and
`docs/STYLE_GUIDE.md`. This file exists because the prototype has grown past what
the production app implements, and in three places it **collides** with surfaces
that already ship. Nothing below is a styling note — these are the decisions and
translations that must happen before a line of production code is written.

Prototype source of truth: **`Sector Analytics.dc.html`** (single file, opens in a
browser). It is a design artifact, not a codebase: React-flavored, one class, all
figures deterministic-synthetic. **Do not port its architecture.** Port its
layouts, its vocabulary, and its honesty behaviour.

---

## 1. Verdict

| Area | State |
| --- | --- |
| Visual language | ✅ Matches production. No new hues, no new families, same card/shadow/radius. |
| Honesty conventions (§7 of HANDOFF) | ✅ Matches, and extends — see §4 below. |
| Status vocabulary (§6 of HANDOFF) | ❌ **Absent from the prototype.** Must be mapped before build. |
| Basis tags (`TTM` / `AS-OF`) | ⚠️ Expressed in captions, not per value. |
| Surface/route ownership | ❌ **Three collisions.** Product decision required. |
| Charts | ⚠️ ~40 hand-rolled builders. Translation table in §5. |

**The design is ready. The handoff needs §2 and §3 decided by a human first.**

---

## 2. Surface collisions — decide before building

The prototype grew Company, Manager and Compare surfaces *inside* the sector app.
Production already routes three of them as standalone pages. Someone has to pick.

| Prototype surface | Production equivalent | Collision |
| --- | --- | --- |
| Company Hub (Overview / Financial history / Institutional / Peer-relative / Compare companies) | `/company/{symbol}` — tabs Fundamentals, Statements, Insider, Institutional, 13D/G | **Direct.** Same content, different IA. Prototype splits Financial history and Peer-relative out as siblings; production nests everything under one tabbed hub. |
| Managers (Profile / Register footprint / Voting record / 5% filings / Filing activity / Filing behaviour) | `/manager/{cik}` — institutional-manager profile | **Direct.** Production has one page; prototype has six views. |
| Compare companies (cross-sector, company-vs-company) | `/compare` — side-by-side company comparison | **Direct**, and note the prototype's sector-app `Compare` view is *sector*-vs-sector — two different comparisons with one word. |
| Sector / Qualitative / Filings | `/sectors` views of the same name | None — same intent. Prototype's Qualitative and Filings stay honest placeholders. |

**Three ways to resolve, pick one and write it down:**

1. **Absorb** — `/sectors` becomes the shell for all of it; `/company/{symbol}`,
   `/manager/{cik}`, `/compare` redirect into it with the selection pre-set. One
   shell, one state model. Biggest change, cleanest result.
2. **Backport** — leave routing as-is; lift the prototype's views into the
   existing pages as new tabs. Least disruptive, but the prototype's persistent
   sector/period/company state has no home.
3. **Split by altitude** — `/sectors` keeps Sector/Compare/Qualitative/Filings;
   Company Hub content goes to `/company/{symbol}`, Managers to `/manager/{cik}`,
   Compare-companies to `/compare`. Matches production IA; requires the selection
   state to survive cross-route navigation (it currently doesn't).

**Recommendation: (3).** It respects the routes that already exist, and the
prototype's left-rail section pattern maps onto each destination page unchanged.
The one prerequisite is carrying selection across routes — see §7.

Also rename: prototype "Compare" (sector) and "Compare companies" (company) both
land near `/compare`. Suggest `/compare/sectors` and `/compare/companies`.

---

## 3. Status vocabulary — the real gap

Production §6 requires **every metric and derived value** to carry a chip:
OK `●` / APPROX `≈` / N/A `∅` / N/M `~`, distinguished by glyph + label + border
style (solid = structural, dashed = judgment), never color alone.

**The prototype has no chips.** It expresses the same distinctions in prose:

| Prototype phrasing | Where it appears | Production status |
| --- | --- | --- |
| "not tagged" | `pairBars` / `miniPairs` missing side, Compare companies | **N/A** — the filer has no such line item |
| "not shared" | Compare companies §What can be compared | **N/A** — measure absent from one filer by business nature |
| "no filing on record" | Managers → Filing activity, staleness ledger | **N/A** — form does not apply |
| "Section 16 does not apply…" | Filing activity, ledger `cant` copy | **N/A** with reason (good provenance copy — keep it) |
| "no disclosure in this period" | Institutional coverage gaps | **N/M** |
| Gap in a `seriesChart` line | Financial history, any 8Q trend | **N/A** — period not disclosed; line correctly breaks rather than interpolating |
| "provisional" on composite scores | Sector scorecard | **APPROX** |
| Derived `ƒ` chip | every derived figure | not a status — this is §7 provenance |

**Action:** every one of those becomes a `statusChip()` in production, with the
prototype's prose moving into `provenance()` as the "why {flag}" line. The prose
is better than production's current copy — carry it over verbatim, don't
paraphrase. The prototype's rule that *an absent measure is omitted from a
comparison rather than shown as zero* already satisfies §6; it just needs the
token rendered next to it.

**Basis tags.** The prototype labels basis in captions ("as filed", "as
restated", "positions as of 2026-03-31"). Production wants `TTM` / `AS-OF` per
value. The Financial-history view's as-filed/as-restated toggle is a *third*
basis axis production doesn't model yet — flag it as a spec question rather than
silently collapsing it.

---

## 4. What the prototype adds to the honesty conventions

Worth adopting into `docs/STYLE_GUIDE.md` §9 — these came out of the design work
and are not in the production doc:

1. **Age of the newest fact is shown as prominently as the fact.** Managers →
   Filing activity leads with a "newest fact" banner and four clocks (since last
   filing, position-data age, next filing due, insider filings). Generalizes §7.7.
2. **Staleness ledger pattern** — per form type: as-of date, age bar, *what it
   tells you*, and *what it cannot*. The "cannot" column is the load-bearing half.
3. **Structural absence vs missing data are different statements.** "No reported
   stake reaches 10%, so Section 16 does not apply and no Form 4 is due" ≠ "no
   data". Production's N/A chip conflates them; the reason string must survive.
4. **One fact, one source.** Every figure on a view derives from the same object
   the other views render — e.g. Filing-activity dates come from campaign event
   dates and a single 13F acceptance instant, never a second random draw. Most of
   the prototype's bug fixes were violations of this. **Enforce it in review.**
5. **Deadline context on any dated filing metric** — the 13F window strip shows
   day 0 → day 45 statutory, with the filing placed in it. A lag figure without
   its deadline is not interpretable.
6. **Comparison validity is stated before the comparison.** Compare companies
   opens with "N of 5 filing-basis items line up · N of 9 measures are tagged by
   both filers" and puts the detail in sections 06/07.

---

## 5. Chart translation — **d3 is the target**

Production vendors `d3.min.js` and `plot.umd.min.js`. **Build these in d3**
(`vendor/d3.min.js`, UMD global, no build step, ES5-flavored call sites). Use
Plot only where a chart is a plain mark-on-scale and Plot genuinely shortens it;
anything with custom label placement or a non-standard layout below should be d3
directly, because the collision logic (§6) cannot be expressed in Plot.

**Rules that carry over unchanged:** wrap in `chartCard()`; take width from
`measuredWidth(container, fallback)`, never a hardcoded px; ranked bars take one
fill with emphasis, not a palette; magnitude stays single-hue sequential, never
diverging, never green/red; captions dedupe.

### 5a. No d3 needed — CSS/flex, keep as DOM

`pctBar` · `contribBar` · `coverageBar` · `insiderBar` · `stackedBar` ·
`stackedBar2` · `cmpBars` · `cmpMetricBars` · `pairBars` · `ladderRows` ·
`track` · `presenceMatrix` · `filerReveal`

These are proportional divs with `gap` layout. Porting them to d3 would be a
regression — they reflow, wrap, and inherit tokens for free. `presenceMatrix` in
particular is a CSS grid of 14px cells and should stay one.

### 5b. d3 translation table

| Prototype builder | Chart | d3 modules | Notes |
| --- | --- | --- | --- |
| `seriesChart` | multi-series line, gaps break the line | `d3-scale`, `d3-shape` | `line().defined(d => d != null)` — **the gap behaviour is a §7 requirement, not a style** |
| `trendChart` | single line | `d3-scale`, `d3-shape` | legacy string builder in prod; unify with `seriesChart` |
| `sparkline`, `microSpark` | inline sparkline | `d3-shape` | no axes, no scales module needed |
| `smallMultiples` | sparkline grid, one panel per manager | `d3-shape` + CSS grid | panels scale independently — say so in the caption |
| `histogramChart` | histogram + median rule | `d3-array` (`bin`), `d3-scale` (`scaleBand`) | median label must print the passed median, not the bin label |
| `divergeChart` | adds above / reductions below axis | `scaleLinear` (symmetric), `scaleBand` | |
| `paretoChart` | ranked bars + cumulative curve + prior-quarter ghost | `scaleBand`, two `scaleLinear`, `d3-shape` | ghost line is `stroke-dasharray`, same hue |
| `stackedAreaChart` | 100% stacked area, register composition | `d3-shape` (`stack`, `area`) | |
| `stackedCols` | two 100%-of-revenue columns | `d3-shape` (`stack`), `scaleBand` | |
| `lorenzChart` | Lorenz curve | `scaleLinear`, `d3-shape` | |
| `treemap` | squarified treemap | **`d3-hierarchy`** (`treemap().tile(treemapSquarify)`) | replaces a hand-rolled squarify — use the library |
| `cohortHeatmap` | entry cohort × quarters held | `scaleBand` ×2, `scaleSequential` | **single-hue sequential only** |
| `matrixChart` | peer adjacency matrix | `scaleBand` ×2, `scaleSequential` | default view for peer overlap |
| `upsetChart` | UpSet set intersections | `scaleBand`, custom marks | no library; d3 scales + manual dot matrix |
| `dotCalendar` | Form 144 notices, date × size | `scaleTime`, `scaleLinear`, **`scaleSqrt`** | size encodes shares — must be `scaleSqrt`, area not radius |
| `scatterPlot`, `scatterAB` | scatter, parity line on `scatterAB` | `scaleLinear` ×2 | label placement is custom — see §6 |
| `logDots` | paired dots, shared log axis | **`scaleLog`** | for figures spanning orders of magnitude; prints exact ratio per row |
| `windowStrip` | statutory 13F window, day 0 → day 45 | `scaleLinear` (days) | deadline rule + filing markers |
| `eventStrip` | dated filings, one lane per holder | `scaleTime`, `scaleBand` (lanes) | tick step adapts to span; see §6 |
| `stakeStepChart` | cumulative stake step-line | `scaleTime`, `d3-shape` `curveStepAfter` | 5% threshold rule |
| `multiStepChart` | several stake histories on one axis | as above | series legend inside the plot, not at line ends |
| `ganttChart` | forward-time windows and expiries | `scaleTime`, `scaleBand` | |
| `dumbbellChart` | prior → current, one row per manager | `scaleLinear`, `scaleBand` | hollow = prior, filled = current |
| `miniPairs` | small-multiple paired dots, mixed units | `scaleLinear` per panel | one axis per panel — units differ, say so |
| `dotPlot`, `peerDots`, `universeDots` | distribution strip, IQR band + median + focal marker | `scaleLinear`, `d3-array` (`quantile`) | consider `d3-force` beeswarm instead of the current index-jitter |
| `radarChart` | composite radar | `scaleLinear`, `d3-shape` `lineRadial` | |
| `cmpSpread` | overlaid IQR strips | `scaleLinear`, `d3-array` | |

### 5c. Consolidation opportunities

Several prototype builders are the same chart at different sizes or with one
extra mark. In production these should be **one builder with options**, not
copies:

- `dotPlot` + `peerDots` + `universeDots` → one distribution strip (`markers: []`).
- `scatterPlot` + `scatterAB` → one scatter (`parityLine: bool`).
- `sparkline` + `microSpark` → one sparkline (`size`).
- `stakeStepChart` + `multiStepChart` → one step chart (`series: []`).
- `histogramChart` covers cadence, acceptance lag and filing hour already — keep it single.

---

## 6. Label placement — do not lose this in the port

Roughly a third of the prototype's iterations were label collisions. The rules
below are empirical and must survive translation; d3 does not solve any of them.

1. **Edge anchoring, not width arithmetic.** A centred label that would cross the
   canvas edge switches `text-anchor` to `start`/`end` and pins to the edge.
   Per-character width estimates were tried and repeatedly clipped.
   **In production, use `getComputedTextLength()`** — real DOM measurement is
   available and strictly better than the constants below.
2. **Measured line boxes** (viewBox units, from the prototype's own render):
   IBM Plex Mono 9–9.5px occupies **14.2**; Hanken 11.5px occupies **17.4**.
   Stacked label rows step by `ROW = 16` / `ROW_NAME = 19`. Line height comes
   from computed `line-height`, **not** font size — a font-size-derived step is
   always short.
3. **Candidate-offset placement** for scatter labels: try right/left ×
   baseline/above/below, take the first that clears every label already placed,
   drop the label if none fits and leave the value on the `<title>` tooltip.
4. **Origin tick belongs to the x axis only** — emitting both x and y at index 0
   stacks two labels in the corner.
5. **Series names go in a legend** when lines converge (every 13D/G line ends just
   above 5%, so end-of-line labels always collide).
6. **Author charts at their container width.** Every chart takes the measured
   panel width; authoring at a default and letting the SVG scale down shrinks
   text below the legible floor. Expand overlays **re-author at overlay width**,
   they do not scale the inline copy up.
7. **Minimum effective text size ~9px** after any scaling. Verify by
   `fontSize × (renderedWidth / viewBoxWidth)`.

---

## 7. Runtime notes from the prototype

Prototype-environment quirks. Some are artifacts of the DC runtime and will not
apply in production — listed so nobody re-derives them:

- `setState` callbacks and `componentDidUpdate` did not fire; state-dependent
  scroll had to poll for the mounted node. **Production is vanilla JS — non-issue.**
- `window.scrollTo({behavior:'smooth'})` was a no-op; `scrollingElement.scrollTop`
  worked. Worth a smoke test in production.
- Charts had to be re-measured on view change; the container width differs per
  view. Production should use a `ResizeObserver` on the chart container.
- **Selection state** (sector / sub-industry / period / focal company / manager)
  persists across every view in the prototype. Under resolution (3) in §2 this
  must survive cross-route navigation — query string or `sessionStorage`. Note
  the existing open item: *URL does not reflect the active view*; solving both
  together is cheaper.

---

## 8. Data contract — what each surface needs

Design-side only: which filing each figure claims to come from. Verify against
the real extraction layer before trusting any of it.

| Surface | Forms |
| --- | --- |
| Company Hub → Overview / Financial history | 10-K, 10-Q XBRL facts; 8-K 2.02; footnotes (revenue disaggregation, RPO, inventory, debt maturity, tax reconciliation, deferred revenue, stock comp, goodwill, leases) |
| Company Hub → Institutional | 13F-HR, SC 13D/G, N-PX, N-PORT, Forms 3/4/5, Form 144, DEF 14A, 8-K 5.07 |
| Company Hub → Peer-relative ("Beyond the financials") | EDGAR acceptance metadata, 10-K Item 1A/1C/3, EX-21, auditor report (CAMs), DEF 14A fee table + Item 405, 8-K 4.01/5.02/5.07, 12b-25, XBRL extension elements |
| Company Hub → Compare companies | as above, both filers; ASC 606 disaggregation, geographic footnote, customer concentration, human-capital count |
| Managers → all six views | 13F-HR (+/A), SC 13D/G (+/A), N-PX, N-PORT, Forms 3/4/5, Form 144, EDGAR acceptance timestamps |

**Every figure in the prototype is deterministic-synthetic** — generated by seeded
`sd()` / `ri()` helpers off the ticker or manager id. They are shaped to be
plausible, not accurate. Replace the generators wholesale; do not port a single
number, and do not treat a prototype figure as a test fixture.

---

## 9. Suggested build order

1. **Decide §2.** Nothing else is safe to start.
2. **Map §3** — status chips onto the prototype's prose absences; agree the
   as-filed/as-restated basis question.
3. **Chart builders** — §5b, largest bloc of work. Start with the five that
   recur most: distribution strip, series line with gaps, histogram, stacked
   columns, event strip. Add each to `/components` as it lands.
4. **Company Hub**, matching the existing hub's tab pattern.
5. **Managers**, six views behind the existing `/manager/{cik}`.
6. **Compare companies**, then rename the two compare surfaces.
7. **Filing activity last** — it depends on acceptance-timestamp plumbing that
   may not exist yet, and it is the view most likely to need real data to be
   worth shipping.

Add a headless shot for each new view; the §9 checklist in `uploads/HANDOFF.md`
applies unchanged, plus: **status chip present on every derived value**, and
**no chart authored below its container width**.

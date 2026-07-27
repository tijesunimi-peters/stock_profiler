# Chart builder inventory — v3 prototype → production

**Answer this file's question once, not in every phase.** Every chart builder in the v3 prototype
(`docs/design/sector-app-prototype-v3/prototype.dc.html`, ~40 builders) mapped to one of four
statuses, so V3-P4…P8 stop re-deriving "does this already exist?"

Statuses: **EXISTS** (a production `ClearyFi.*` builder already does this job) · **CSS/FLEX**
(stays proportional DOM — porting it to d3 would be a regression) · **NEW** (build it, in the named
phase) · **DEFERRED** (needed, but blocked on data that doesn't exist yet).

> **Source:** RECONCILIATION.md §5a/§5b/§5c · established V3-P1, 2026-07-26

---

## 1. Stays CSS/flex — do NOT port to d3 (RECONCILIATION §5a)

These are proportional divs with `gap` layout. They reflow, wrap, and inherit tokens for free;
rebuilding them as SVG would lose all three.

| Prototype builder | Status | Production note |
|---|---|---|
| `pctBar` · `contribBar` · `coverageBar` · `insiderBar` | **CSS/FLEX** | `compositionBars` / inline bars already cover this shape |
| `stackedBar` · `stackedBar2` | **CSS/FLEX** | the sector geo-mix card already renders a stacked bar this way |
| `cmpBars` · `cmpMetricBars` · `pairBars` | **CSS/FLEX** | Compare view paired bars |
| `ladderRows` · `track` | **CSS/FLEX** | |
| `presenceMatrix` | **CSS/FLEX** | a CSS grid of 14px cells; keep it one |
| `filerReveal` | **CSS/FLEX** | click-to-reveal ticker list |

## 2. Already exists in production

**Check here before building anything.** Several wave-1 targets turned out to be already shipping.

| Prototype builder | Production builder | Notes |
|---|---|---|
| `seriesChart` (multi-series line, **gaps break the line**) | `sectorDupontTrend`, `sectorLifecycleTrend`, `valueLineChart` | **Already honest.** `sectorDupontTrend` carries the explicit comment *"Line breaks wherever `value` is null (a coverage-gap year) — never interpolated"* plus a `hasGap` caveat. Built in **Plot**, which is correct under D5 (plain mark on a scale). **Do not rebuild in d3.** |
| `trendChart` | `trendChart` (legacy string builder) | **Frozen** per STYLE_GUIDE §6 — not migrated, closed decision |
| `sparkline`, `microSpark` | `sparkline` (legacy string builder) | **Frozen.** RECONCILIATION §5c suggests merging the two; a *new* d3 sparkline would be a new builder, and the frozen one keeps serving existing call sites. Not a contradiction — recorded so it isn't re-litigated |
| `stackedCols` (100%-of-revenue columns) | `commonSizeChart` | Renders null as a **documented gap, not 0%** — already the honest behaviour |
| `stackedAreaChart` | `capitalStructureTrend`, `holdingsSeriesChart` | stacked composition over time |
| `dumbbellChart` | `dumbbellChart` | same name, same job |
| `divergeChart` | `divergingBars` | adds above / reductions below the axis |
| `cohortHeatmap`, `matrixChart` | `convictionHeatmap`, `balanceMatrix` | **single-hue sequential only** — never diverging, never green/red |
| `treemap` | institutional holder treemap | |
| `cmpSpread` (overlaid IQR strips) | sector-app Compare IQR strip | |
| `radarChart` | sector-app Compare composite radar | |
| `windowStrip`-adjacent quarter presence | `ingestionCoverageStrip` | *quarter presence*, not a dated event strip — different job, see §4 |

## 3. Built in V3-P1

| Prototype builders | Production builder | Notes |
|---|---|---|
| `dotPlot` + `peerDots` + `universeDots` | **`distributionStrip()`** | The §5c consolidation: **one** builder with options, replacing three prototype copies. Supersedes the sector app's hand-rolled `.pa-dot` path, which positioned peers with **index-derived jitter** (vertical position carried no meaning). Placement is now **density-derived dodge**, stacking upward from a baseline so local density reads as height. d3 (`scaleLinear`, `quantile`); deterministic, so the layout is stable across re-renders |

## 4. Deferred — needed, but blocked on data

Both were in the roadmap's wave 1. Both were cut in V3-P1 for the same reason: **their prototype
uses are Manager views fed by V3-P3 metadata (8-K item codes + acceptance timestamps) that has not
been ingested.** Building them now would mean guessing at a data shape V3-P3 defines.

| Prototype builder | Blocked on | Build in |
|---|---|---|
| `histogramChart` (+ its cadence / acceptance-lag / filing-hour uses) | V3-P3 acceptance timestamps | V3-P6 / V3-P8 |
| `eventStrip` (dated filings, one lane per holder) | V3-P3 acceptance timestamps | V3-P8 |
| `dotCalendar`, `windowStrip`, `stakeStepChart`, `multiStepChart`, `ganttChart`, `smallMultiples`, `lorenzChart`, `paretoChart`, `upsetChart`, `scatterPlot`/`scatterAB`, `logDots`, `miniPairs` | their consuming Manager/Company views | V3-P5 … V3-P8 |

When one of these is built, move its row to §3 with the phase that did it.

---

## Known gap recorded here so it isn't lost

**Peer counts don't say what was excluded (AC-7b, V3-P1).** `SectorCompanyValue.value` is typed
`float` — *"never None, N/A rows are excluded"* — and the exclusion happens **server-side**
(`sqlite_sector_company_repository.py:22`). The payload carries **no excluded count**, so a reader
of the Company view cannot tell *"40 peers"* from *"40 of 58, 18 excluded as N/A."*

`distributionStrip()` handles this correctly **for any caller that passes nulls** — it excludes
them, never plots them at 0, and states the count in its caption. But the sector-app payload
contains no nulls by construction, so the strip legitimately reports 0 excluded.

**Closing it needs a backend change** — `excluded_count` (and a reason) on `SectorCompanyValueList`.
Out of scope for V3-P1 (frontend-only). Natural home: **V3-P4/P5**, when the Company views are
re-cut and the same payload is already being touched.

## Rules when you add to this file

- One status per row. If a prototype builder maps to a production builder that only *partly* does
  the job, say what differs rather than marking it EXISTS.
- **Never invent a second builder for a job §2 already covers.** That is what this file is for.
- A builder with no consuming view and no real data is not "ready to build" — it is DEFERRED.

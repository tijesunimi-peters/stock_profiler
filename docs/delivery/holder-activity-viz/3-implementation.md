# Implementation (backend): derived holder-activity trend

**Role:** Senior Backend Engineer → handoff to Senior Frontend Engineer (same branch)
**Task slug:** `holder-activity-viz`
**Branch:** `holder-activity-viz` (off `master`)
**Date:** 2026-07-20

---

## What changed

### `src/secfin/normalize/flows.py`
- New `@dataclass(frozen=True) ActivitySummary` (counts per action + `inflow_shares`,
  `outflow_shares`, `net_shares`).
- New pure `summarize_activity(deltas) -> ActivitySummary`. Consumes `HoldingDelta` rows —
  **does not re-classify** (`action` taken as given). `new`+`added` feed `inflow_shares`
  (Σ shares_change, ≥0); `reduced`+`exited` feed `outflow_shares` (Σ |shares_change|, ≥0);
  `net_shares = inflow − outflow`. Empty → all-zero. Shares only, never value.

### `src/secfin/api/routes.py`
- New `_ACTIVITY_SERIES_CAVEATS` (= `_ISSUER_CENTRIC_CAVEATS` + 4 lines: derived-not-trades,
  omitted-quarter honesty, counts/shares-not-value, inflow/outflow-not-fund-flows). 8 caveats total.
- New endpoint **`GET /companies/{symbol}/institutional-activity-series?quarters=6`**
  (`quarters`: ge=1, le=12). Reuses the sibling issuer reads only — `issuer_periods` +
  `holders_of` (live indexed point reads, no DuckDB) + `diff_holders` + `summarize_activity`.

## JSON contract (for the frontend)

```json
{
  "cik": 320193,
  "cusips": ["037833100"],
  "transitions": [
    {"from_period":"2025-12-31","to_period":"2026-03-31",
     "counts":{"new":4,"added":2,"reduced":1,"exited":0},
     "inflow_shares":740000000.0,"outflow_shares":20000000.0,"net_shares":720000000.0}
  ],
  "caveats": [ ...8 strings... ]
}
```

- `transitions` is **oldest → newest** (chart-axis order). Each element is one
  quarter-over-quarter diff of `to_period` vs. its **calendar** `prior_quarter_end`.
- **A to-quarter is included ONLY when its calendar prior is itself ingested.** A quarter
  whose prior wasn't ingested is **omitted** (no element) — never a false all-`new` spike.
- **Empty `transitions: []`** is a valid result (issuer has < 2 ingested quarters, or no
  adjacent ingested pair) — the honest empty state, HTTP 200, caveats still present.
- Frontend usage: **Viz 1 (stacked bar)** = all `transitions` (x=`to_period`, stacked
  `counts`); **Viz 2 (flow, latest quarter)** = `transitions[transitions.length - 1]`
  (`inflow_shares` / `outflow_shares` / `net_shares`, in **shares**).
- Auth: same gate as siblings — browser requests pass via `Sec-Fetch-Site: same-origin`;
  API clients need a key.

## How I verified

- **Docker pytest** — new `tests/test_activity_series.py` (8 tests) green; **full suite 398
  passed, 6 skipped**, no regressions. Covers: `summarize_activity` counts/flow signs +
  net=inflow−outflow=Σchange + empty + new-only; endpoint oldest→newest ordering; **AC-2
  parity** (to-quarter counts == `/institutional-activity?period=<q>` grouped by action); the
  **gap-quarter omission** (uningested prior → omitted, no all-new bar); **single-quarter →
  `[]`**; `quarters` bound.
- **Live HTTP** against the e2e-app (seeded fixtures), with the browser header:
  - `GET /v1/companies/AAPL/institutional-activity-series` → 3 transitions oldest→newest,
    newest counts `{new:4, added:2, reduced:1, exited:0}` — **exactly matching**
    `/institutional-activity?period=2026-03-31` grouped (`{new:4, added:2, reduced:1}`).
  - inflow/outflow/net in shares; 8 caveats present; `?quarters=2` → 2 newest transitions.
- **ruff**: `flows.py` + the test clean; `routes.py` only the pre-existing project-wide `B008`
  (FastAPI `Depends`-in-defaults idiom used by every route — not introduced here).

## Notes for the frontend (and QA)

- The endpoint is **period-independent** (spans recent quarters like
  `institutional-holdings-series`) — mount it in its own section, not inside the
  period-reactive `activitySection`.
- **Colors (STYLE_GUIDE §9.2/§10):** the 4 action buckets are categorical *identities* — a
  categorical scheme with a **fixed stack order** is fine; **no green/red good-bad verdict**.
  This corrects the brief's "accumulation/distribution hues" phrasing (see 2-architecture.md).
- Stacked bar = **counts**; flow view = **shares**. Never sum/stack `value`.
- Honesty edges to render: empty `transitions` → honest "not enough comparable quarters" note
  (not a blank/all-zero chart); an omitted quarter is simply absent (absent bar ≠ zero).

**Next:** `next_stage: frontend` — `senior-frontend-engineer` implements `activityMixChart` +
`activityFlowChart` in `app.js` and the trend section + `mountActivityTrend` in `company.js`,
on this branch.

---

# Implementation (frontend): the two views

**Role:** Senior Frontend Engineer → handoff to QA Tester (same branch)
**Date:** 2026-07-20

## What changed

### `src/secfin/api/static/app.js`
- **`activityMixChart(transitions, opts)`** (Viz 1) — stacked `Plot.barY` of per-quarter action
  **counts**. Built like `holdingsSeriesChart` (chartCard, `quarterTick`, `plotTokens`, 1px
  surface-colored segment stroke, tip). Fixed color domain/order `["New","Added","Reduced",
  "Exited"]` via `pickCategoricalScheme()` — **categorical identity, no green/red verdict**
  (§9.2/§10); accumulation buckets (New, Added) sit below distribution (Reduced, Exited) so the
  split reads by stack position. A zero-count action has no segment (honest gap). Returns `null`
  when no transition has a non-zero count.
- **`activityFlowChart(transition, opts)`** (Viz 2) — Plot-native opposing `Plot.barX` on a
  zero-centred axis: "Shares acquired" right (+inflow), "Shares divested" left (−outflow), single
  `--accent` fill (direction, not color, carries in/out), `ruleX([0])`, on-bar `signedSharesTick`
  labels, and a **net** summary line (`▲/▼ net shares (acquired X − divested Y)`). **Shares, never
  value.** Returns `null` when nothing flowed. Short y-labels (attribution in the caption) to
  avoid the left-clip failure mode; `marginLeft/Right` sized so both bar-end labels fit.
- Registered both in the `window.ClearyFi` export block.

### `src/secfin/api/static/company.js`
- **`activityTrendSection()`** — a **period-independent** section (`#activity-mix-mount` +
  `#activity-flow-mount`), placed in `institutionalView()` immediately before the period-reactive
  `activitySection` so it renders regardless of the selected period.
- **`mountActivityTrend()`** — self-fetching (mirrors `mountHoldingsSeries`): GET
  `/institutional-activity-series`, mounts the mix chart (all transitions) and the flow chart
  (`transitions[last]`). Honest empty notes when there's no comparable prior quarter (mix) / no
  net flow (flow); skips silently on fetch failure (enhancement, never breaks the tab).
- Wired `mountActivityTrend()` into `renderInstitutionalData()`. The existing single-quarter
  `activitySection` (tiles / diverging bars / dumbbell / table) is untouched.

## How I verified

- **Docker e2e headless render check** — `docker compose --profile e2e up
  --abort-on-container-exit --exit-code-from e2e` → **HEADLESS CHECK: PASS**, all pages
  `errors=0`, including `/company/AAPL?tab=institutional` (4 seeded quarters → 3 transitions) and
  `/company/JPM?tab=institutional`. No console/page/request errors.
- **Eyeballed screenshots** (`data/e2e-shots/institutional.png`, cropped):
  - Mix chart: 2025 Q3/Q4 show Added(2)+Reduced(1); 2026 Q1 shows New(4)+Added(2)+Reduced(1) —
    matches the endpoint; 4-category fixed stack order; honest "COUNTS, not value / omitted not
    zero" caption.
  - Flow chart: "Shares acquired +740.0M" vs "Shares divested −20.0M", "Net ▲ +720.0M shares",
    DERIVED caption. Labels no longer clip (fixed a left-clip on the initial render).
  - Existing single-quarter activity section still renders below (AC-10).
- No Python touched in this stage (pytest already green from the backend stage).

## For QA to probe
- **Empty states:** a ticker with only one ingested 13F quarter → both mounts show the honest
  "not enough comparable quarters" / no-flow notes, never a blank or all-zero chart (AC-8).
- **Omitted quarter:** a ticker with a gap quarter → that quarter simply has no bar (AC-7); the
  caption states omitted-not-zero.
- **N/A vs 0:** zero-count actions have no segment; a missing quarter has no bar — neither is drawn
  as a real zero.
- **Both themes:** charts read tokens via `cssVar` (same pattern as the shipped charts) so dark
  should be fine — worth a dark-mode eyeball. The categorical scheme is randomized per page load
  (identity colors), consistent with `holdingsSeriesChart`.
- **Copy/honesty:** both captions say DERIVED + "never reported trades" + the 13F caveats; the
  endpoint's `caveats` also ride in the JSON.

**Next:** `next_stage: qa`.

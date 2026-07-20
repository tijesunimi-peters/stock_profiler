# Architecture: derived holder-activity visualizations

**Role:** Principal Architect → handoff to Senior Engineer(s)
**Task slug:** `holder-activity-viz`
**Date:** 2026-07-20
**Inputs:** `1-brief.md` (12 acceptance criteria; operator decisions: Plot-native flow,
latest-quarter scope)

---

## Scope re-check (Track 1, guardrails)

In scope and buildable within the architecture. Both views derive from **already-ingested
13F holder snapshots** via the existing `normalize/flows.diff_holders` — no new data source,
no HTML/free-text/LLM (Track 1), no price/market data. No new base dependency (Plot + d3 are
already vendored; operator chose Plot-native, so **no d3-sankey vendoring**). No DuckDB on the
request path (guardrail 6): the reads are the same live indexed point lookups
(`holders_of` / `issuer_periods`) the sibling issuer endpoints already use. DB stays behind
the `HoldingsSnapshotRepository` interface; no raw SQL in the API (guardrail 5). No scope drift.

**One correction to the brief's wording:** the brief said the stacked bar should use
"accumulation hues / distribution hues." That would violate STYLE_GUIDE §9.2/§10 (color is
never a good/bad verdict; no green/red diverging). The action buckets are **categorical
identities**, so they take the sanctioned categorical-scheme path (§6, operator decision
2026-07-18) with a **fixed stack order** that puts accumulation and distribution buckets
adjacent — the reader sees the accumulation-vs-distribution split by **position in the stack**,
never by a verdict color. This is captured in the frontend section below and supersedes the
brief's phrasing.

---

## Design overview

A **full-stack** change, backend first:

```
serve (api/routes.py)  ── new endpoint ──►  GET /companies/{symbol}/institutional-activity-series
        │                                    reuses normalize/flows.diff_holders per adjacent
        │                                    ingested quarter-pair + new summarize_activity()
        ▼
normalize/flows.py  ── new pure helper ──►  summarize_activity(deltas) -> ActivitySummary
        │                                    (counts per action + inflow/outflow/net shares)
        ▼
static/app.js  ── two new Plot builders ─►  ClearyFi.activityMixChart(...)   (stacked bar, 6q)
        │                                    ClearyFi.activityFlowChart(...)  (flow, latest q)
        ▼
static/company.js  ── one new section ───►  period-independent "activity trend" section +
                                             self-fetching mount (like mountHoldingsSeries)
```

The existing single-quarter `activitySection` (tiles / diverging bars / dumbbell / table) is
**untouched** (AC-10).

---

## The honesty hazard this design must handle (drives AC-2 / AC-7 / AC-8)

The existing `GET /institutional-activity?period=P` diffs `P` against its **calendar**
`prior_quarter_end(P)` (routes.py:1173). If that calendar-prior quarter was **not ingested**,
`holders_of` returns `[]`, and `diff_holders` classifies **every** current holder as `new`
(the `prior=[]` convention) — a phantom "everyone just entered" spike. For a single-quarter
view that's a known, caveated edge; for a **6-quarter trend** it would paint recurring false
all-`new` bars.

**Rule for the new endpoint:** a to-quarter `P` gets a bar **only if `prior_quarter_end(P)` is
itself in the issuer's ingested periods.** A quarter whose calendar prior wasn't ingested is
**omitted** (no bar) — never rendered as a real zero and never as a false all-`new` spike
(AC-7). This makes every emitted bar a genuine quarter-over-quarter diff between two ingested
quarters, so **AC-2 holds exactly**: the counts for to-quarter `P` equal
`GET /institutional-activity?period=P` grouped by `action`.

---

## Stage 1 — Backend (`senior-backend-engineer`) — land first

### 1a. `normalize/flows.py` — new pure helper (pytest-covered)

Add a small frozen dataclass + a pure function. **No re-implementation of classification** —
it consumes the `HoldingDelta` rows `diff_holders` already produces (AC-2, AC-3).

```python
@dataclass(frozen=True)
class ActivitySummary:
    new: int
    added: int
    reduced: int
    exited: int
    inflow_shares: float     # Σ shares_change over new+added (>= 0)
    outflow_shares: float    # Σ |shares_change| over reduced+exited (>= 0)
    net_shares: float        # inflow_shares - outflow_shares (== Σ all shares_change)

def summarize_activity(deltas: Iterable[HoldingDelta]) -> ActivitySummary: ...
```

- Counts: number of delta rows per `action` in exactly `{new, added, reduced, exited}`
  (`unchanged` is never included — `diff_holders` already excludes it unless
  `include_unchanged`; the endpoint calls it **without** that flag, so it can't appear). AC-3.
- `inflow_shares` = sum of `shares_change` for `new`+`added` (both are `> 0` by `_classify`).
- `outflow_shares` = sum of `-shares_change` for `reduced`+`exited` (both are `< 0`), i.e. a
  positive magnitude.
- `net_shares` = `inflow_shares - outflow_shares`. AC-4. **Shares only — never value** (AC-5).
- Empty `deltas` → all-zero summary (feeds the honest empty state, AC-8).

### 1b. `api/routes.py` — new endpoint + caveats

`GET /companies/{symbol}/institutional-activity-series?quarters=6`
(`quarters: int = Query(6, ge=1, le=12)` = max number of transition bars.)

Logic (all live indexed reads, no DuckDB):
1. Resolve `cik` → `cusips` (`_cik_from_symbol`, `_cusips_for_issuer`) — same as siblings.
2. `ingested = holdings_repo.issuer_periods(cusips)` (newest-first) → `ingested_set = set(...)`.
3. Walk `ingested` newest-first; for each `p`, compute `pp = prior_quarter_end(p)`; **iff
   `pp in ingested_set`**, derive a transition:
   `deltas = diff_holders(holders_of(cusips, p), holders_of(cusips, pp), to_period=p,
   from_period=pp)` then `summary = summarize_activity(deltas)`. Collect up to `quarters`
   transitions, then **reverse to oldest→newest** for the chart axis (AC-1).
4. Return:

```json
{
  "cik": 320193,
  "cusips": ["037833100"],
  "transitions": [
    {"from_period":"2024-09-30","to_period":"2024-12-31",
     "counts":{"new":12,"added":40,"reduced":33,"exited":5},
     "inflow_shares":6100000.0,"outflow_shares":1900000.0,"net_shares":4200000.0}
  ],
  "caveats": _ACTIVITY_SERIES_CAVEATS
}
```

`transitions` is **oldest→newest**. An **empty** `transitions` list is a valid result (issuer
has < 2 ingested quarters, or no adjacent ingested pair) — the honest empty state (AC-8), not
an error.

Add `_ACTIVITY_SERIES_CAVEATS = _ISSUER_CENTRIC_CAVEATS + [...]` with these extra lines:
- "Per-quarter counts are DERIVED by diffing each quarter against the PRIOR calendar quarter's
  13F holders — not reported trades."
- "A quarter whose prior calendar quarter was not ingested is OMITTED (no bar), never shown as
  zero activity or as an all-new spike."
- "Bars are COUNTS of (manager, position) pairs and flows are SHARES — never dollar value,
  which changed unit (thousands → whole dollars, ~2023)."
- "Inflow/outflow are aggregate DERIVED share changes across all reporting filers — not fund
  cash flows and not dollar amounts."

Endpoint keeps `SECClient`/repository usage identical to the sibling issuer endpoints; no new
store method needed (`issuer_periods`, `holders_of` already exist).

### 1c. Backend tests (`tests/`) — AC-2, AC-3, AC-4, AC-5, AC-8, AC-12

- `summarize_activity`: counts per action; inflow/outflow/net signs and equality
  `net == inflow - outflow == Σ shares_change`; empty → all zero; a `new`-only set →
  `outflow_shares == 0`; an `exited`-only set → `inflow_shares == 0`.
- Endpoint (FastAPI `TestClient`, seeded `HoldingsSnapshotRepository`):
  - 3 consecutive ingested quarters → 2 transitions, oldest→newest, counts match a direct
    `diff_holders` grouping (**AC-2 parity check**).
  - A gap quarter (prior not ingested) → that to-quarter is **omitted** (AC-7), no false
    all-`new` bar.
  - Single ingested quarter → `transitions == []` (AC-8).
  - `caveats` present and non-empty on every response (AC-6).

---

## Stage 2 — Frontend (`senior-frontend-engineer`) — same branch, after backend

### 2a. `static/app.js` — two new `ClearyFi` Plot builders

**`activityMixChart(transitions, opts)` — Viz 1 (stacked bar, ≤6 quarters).**
Template: `holdingsSeriesChart` (stacked `Plot.barY`, `chartCard`, `quarterTick`,
`plotTokens`, 1px surface-colored segment stroke, tip). Differences:
- Rows: for each transition, one row per non-zero action count:
  `{period: quarterTick(to_period), action: "New"|"Added"|"Reduced"|"Exited", count}`.
- **Fixed color domain/order** `["New","Added","Reduced","Exited"]` handed to
  `pickCategoricalScheme()` with `order` = that domain — **identity colors, not a verdict**
  (§10). The fixed order keeps the two accumulation buckets and the two distribution buckets
  contiguous in the stack so the split reads by position, not hue.
- `x` = `to_period` (via `quarterTick`), `y` = count (`tickFormat` integer), legend on.
- Returns `null` when `transitions` is empty or every count is 0 → caller shows the empty
  state (AC-8). Caption: DERIVED, counts-not-value, omitted-quarter note (AC-6).

**`activityFlowChart(transition, opts)` — Viz 2 (Plot-native flow, latest quarter).**
`transition` = the newest element of `transitions`. Plot-native opposing bars on a
zero-centred x-axis (mirrors the operator's chosen preview):
- Two data rows: `{label:"Shares acquired (New + Added)", x: +inflow_shares}` and
  `{label:"Shares divested (Reduced + Exited)", x: -outflow_shares}`.
- `Plot.barX` (single `--accent` fill; **direction** carries in/out — no second/verdict hue),
  symmetric `x` domain `[-M*1.15, +M*1.15]` where `M = max(inflow, outflow)`, `Plot.ruleX([0])`,
  on-bar `Plot.text` labels with `signedSharesTick`, and a prominent **net** annotation
  (`net_shares`, e.g. "Net ▲ +4.2M shares" / "▼"), in shares (AC-4/AC-5).
- Returns `null` when `inflow == 0 && outflow == 0` (nothing flowed) → honest empty state.
  Caption: DERIVED, latest-quarter `from→to`, shares-not-fund-flows (AC-6, AC-9).

Both use `measuredWidth`, `chartCard`, theme tokens → theme-aware + CSP-safe (AC-11).

### 2b. `static/company.js` — one new period-independent section + mount

- New `activityTrendSection()` returning a header + `#activity-mix-mount` +
  `#activity-flow-mount`. **Period-independent** (spans recent quarters like
  `holdingsSeriesSection`), placed in `institutionalView()` **immediately before**
  `activitySection(activity)` so all derived-activity content is contiguous, but it renders
  regardless of the selected period's single-quarter result (it is NOT inside the
  period-reactive `activitySection` early-return).
- New `mountActivityTrend()` — self-fetching (mirrors `mountHoldingsSeries`): GET
  `/institutional-activity-series`, then:
  - `activityMixChart(res.transitions, ...)` → `#activity-mix-mount`, else honest empty note
    ("Not enough comparable quarters … read as coverage, not zero activity", AC-8).
  - `activityFlowChart(res.transitions[res.transitions.length-1], ...)` → `#activity-flow-mount`
    when a newest transition exists, else the same-style empty note.
  - On fetch failure: skip silently (enhancement chart, never breaks the tab) — same as the
    other mounts.
- Call `mountActivityTrend()` in `renderInstitutionalData()`'s mount sequence (line ~514,
  alongside `mountHoldingsSeries()` etc.). Existing mounts unchanged (AC-10).

### 2c. Frontend verification — AC-11

Docker e2e headless render check on a company Institutional tab that has ≥3 ingested quarters:
both new charts mount, no console errors, light + dark both sane; eyeball screenshots.
Confirm a real ticker basket during build (the accumulation chart already relies on
multi-quarter depth, so a suitable ticker exists) and note the omitted-quarter behavior on a
ticker with a gap if one is available.

---

## Acceptance criteria → concrete checks

| AC | Check | Owner |
|----|-------|-------|
| AC-1 | Endpoint returns ≤6 transitions oldest→newest; fewer when fewer ingested pairs; chart X-axis matches | backend + frontend |
| AC-2 | Endpoint test: to-quarter `P` counts == `diff_holders` grouping == `/institutional-activity?period=P` by action | backend |
| AC-3 | Buckets exactly new/added/reduced/exited; `unchanged` never counted (endpoint omits the flag) | backend |
| AC-4 | `summarize_activity` test: inflow=Σ(new+added Δ), outflow=Σ|reduced+exited Δ|, net=inflow−outflow=Σ all Δ, in shares | backend |
| AC-5 | grep/review: no `value` summed/stacked in the endpoint or either builder; counts/shares only | backend + frontend |
| AC-6 | `_ACTIVITY_SERIES_CAVEATS` present on every response; both chart captions say DERIVED + caveats | backend + frontend |
| AC-7 | Endpoint test: gap quarter (prior not ingested) omitted, no all-`new` spike; frontend absent bar ≠ zero | backend |
| AC-8 | 1-quarter issuer → `transitions:[]`; both charts render honest empty note, not blank/all-zero | backend + frontend |
| AC-9 | Copy distinguishes "derived from quarter-end snapshots" from trades; no "trade" wording | frontend |
| AC-10 | Existing activity section (tiles/diverging/dumbbell/table) renders unchanged | frontend |
| AC-11 | Docker e2e: both charts mount, no console errors, theme-aware, CSP-safe (vendored only) | frontend |
| AC-12 | New endpoint pytest-covered incl. multi-quarter + gap + empty; DB behind repo, no raw SQL, no DuckDB | backend |

---

## Files to touch

**Backend (first):**
- `src/secfin/normalize/flows.py` — `ActivitySummary` dataclass + `summarize_activity()`.
- `src/secfin/api/routes.py` — `_ACTIVITY_SERIES_CAVEATS` + `get_institutional_activity_series`
  endpoint.
- `tests/` — new test module for the helper + the endpoint (parity, gap, empty, caveats).

**Frontend (same branch, after):**
- `src/secfin/api/static/app.js` — `activityMixChart` + `activityFlowChart` builders.
- `src/secfin/api/static/company.js` — `activityTrendSection()` + `mountActivityTrend()` + wire
  into `renderInstitutionalData()` and `institutionalView()`.

**No changes to:** `normalize/mapping.py`/`schema.py` (no new canonical concept — derived
aggregates, not facts, so guardrail 3 doesn't apply), storage interfaces, DuckDB/analytical,
ingest, DATA_MODEL.md canonical schema. (A one-line mention of the new endpoint may be added to
docs if the engineer is updating the endpoint list, but no data-model change is required.)

---

## Handoff → Senior Engineer(s)

Full-stack, **backend first**. Branch off `master`.
1. `senior-backend-engineer`: `flows.summarize_activity` + `ActivitySummary`, the
   `/institutional-activity-series` endpoint + `_ACTIVITY_SERIES_CAVEATS`, and pytest (parity
   with `diff_holders`/single-quarter endpoint, the gap-quarter omission, the empty case).
   Land the JSON contract above. Self-verify via Docker pytest, then set `next_stage: frontend`.
2. `senior-frontend-engineer` (same branch): `activityMixChart` + `activityFlowChart` in
   `app.js`, the period-independent trend section + self-fetching mount in `company.js`.
   **Colors: single accent + categorical identity only, never a green/red verdict.** Counts for
   the bar, shares for the flow, never value. Verify via Docker e2e headless render + eyeball
   light/dark screenshots, then set `next_stage: qa`.

Non-negotiables carried forward: reuse `flows.diff_holders`/`summarize_activity` (don't
re-derive classification client-side); every emitted bar is a real ingested-pair diff (omit
non-derivable quarters); both views DERIVED-labeled with the standard 13F caveats; existing
single-quarter activity section untouched; CSP-safe/theme-aware; DB behind the repo interface,
no DuckDB on the request path.

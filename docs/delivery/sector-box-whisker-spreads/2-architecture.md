# 2 — Architecture: Box-and-Whisker Liquidity/Solvency Spreads on the Sector Page

**Task slug:** `sector-box-whisker-spreads`
**Stage:** Principal Architect (2 of 4) → Senior Engineer (backend → frontend, same branch)
**Reads:** `1-brief.md`; `CLAUDE.md` guardrails 5/6/7; the D1 handoffs in
`docs/delivery/sector-overview-dupont/`.

## Scope re-check — PASS (no drift)

Track 1, no free text, no LLM, no market data, **no new base dependency**. The DuckDB
aggregation already exists (`analytical/peer_distribution.py`) and stays offline (guardrails
6/7). **No new metric, no new canonical concept, no new table** → **guardrail 3 (mapping.py +
DATA_MODEL.md) does not apply here** (the four ratios and `metric_distributions` already ship).
DB stays behind the repository interface — **the two new reads become new interface methods, so
the API still contains no raw SQL** (guardrail 5). Single-process/serving path untouched
(guardrail: no per-request DuckDB — the endpoints read the operational SQLite table cache-aside).

The only genuinely new surface is **two cache-aside read endpoints + two front-end charts** over
data that is already modeled. This is deliberately the smallest full-stack slice that delivers the
operator's "both framings."

---

## Data flow (all four stages)

```
 (offline, existing)              store (existing table, +2 read methods)         serve                    static
 analytical/peer_distribution.py  metric_distributions                           GET /v1/sectors/spreads   sectors.js
   DuckDB ATTACH over SQLite  ->  (peer_group,year,period,metric,               (cross-sector)            + app.js
   min/p25/median/p75/max        peer_count,min,p25,median,p75,max)             GET /v1/sectors/{g}/spreads  boxWhisker
   per (SIC-2, period, metric)    read via MetricDistributionRepository          (per-sector)              builder
```

Nothing new is *written*. The batch is **run** to populate the empty table (roadmap's step 1);
the serving layer gains two read paths; the UI gains two charts.

---

## Backend (senior-backend-engineer) — do this first, land the JSON contract

### B1. Metric set constant (`api/routes.py`)
Add, near `_SECTOR_CAVEATS`:
```python
# The liquidity/solvency ratios plotted as sector spreads (Sector Analytics D3). All four already
# exist in metrics.py / METRIC_KEYS and are materialized into metric_distributions by the batch.
_LIQUIDITY_SOLVENCY_METRICS = ("current_ratio", "quick_ratio", "debt_to_equity", "interest_coverage")
```
Decision-1 answer: ship all four. `interest_coverage` may be sparse/skewed at sector level — that
is handled honestly by the empty-state path (below), not by fabricating boxes. Do **not** silently
drop it; if after the batch a metric has *no* qualifying groups, the cross-sector chart shows its
empty state and the per-sector panel omits that metric's box with an explicit "not enough peers."

### B2. Repository — two new read methods (guardrail 5: no raw SQL in the API)
Extend **both** `storage/metric_distribution_repository.py` (abstract) and
`storage/sqlite_metric_distribution_repository.py` (impl). The existing `get()` is a point lookup;
add two list reads (mirror the shape of `SectorDupontRepository.list_for_period`):

```python
# abstract + sqlite
def list_for_metric(self, metric: str, fiscal_year: int, fiscal_period: str
                    ) -> list[MetricDistributionRow]:
    """Every qualifying SIC group's distribution for ONE metric+period (cross-sector read).
    Only groups the batch materialized (>= min size) are returned; none are zero-filled."""

def list_for_group(self, peer_group: str, fiscal_year: int, fiscal_period: str
                  ) -> list[MetricDistributionRow]:
    """Every metric's distribution for ONE SIC group+period (per-sector read). The route
    filters to the liquidity/solvency set; absent metrics are simply not returned (never 0)."""
```
SQLite impl: parameterized `SELECT ... WHERE metric=? AND fiscal_year=? AND fiscal_period=?`
(resp. `WHERE peer_group=? AND ...`), returning `MetricDistributionRow(*row)`. Reuse the existing
column list. `list_for_metric` should `ORDER BY median DESC` at the SQL level is **not** required —
the frontend orders (keep ordering a presentation choice; SQL may return any order).

Add a `latest_fy_year(self, metric: str) -> int | None` helper **only if** you want the endpoint
usable standalone without an explicit `?year=`; simplest honest version:
`SELECT MAX(fiscal_year) FROM metric_distributions WHERE metric=? AND fiscal_period='FY'`.
(The page always passes the grid's resolved year — see F-notes — so this is just the standalone
default. Document it as "latest materialized FY," not "well-covered.")

### B3. Schema models (`normalize/schema.py`)
Add next to `PeerDistribution` (reuse its five-number field shape; label by group vs metric):

```python
class SectorSpread(BaseModel):
    """One SIC group's five-number summary for one metric (a single box). Precomputed by
    analytical/peer_distribution.py; never a live DuckDB read."""
    group: str
    group_label: str
    peer_count: int   # companies in the group with a comparable (non-N/A) value
    min: float; p25: float; median: float; p75: float; max: float

class SectorSpreadList(BaseModel):
    """Cross-sector: every qualifying sector's box for ONE metric+period.
    Empty `spreads` is valid/honest (no group met min size, or unmaterialized)."""
    metric: str; label: str; unit: str
    fiscal_year: int; fiscal_period: FiscalPeriod
    peer_basis: str
    caveats: list[str] = Field(default_factory=list)
    spreads: list[SectorSpread] = Field(default_factory=list)

class MetricSpread(BaseModel):
    """One metric's five-number summary for one sector (a single box in the per-sector panel)."""
    metric: str; label: str; unit: str
    peer_count: int
    min: float; p25: float; median: float; p75: float; max: float

class SectorSpreadProfile(BaseModel):
    """Per-sector: the liquidity/solvency box set for ONE group+period.
    Empty `metrics` is valid/honest (group below min size, or unmaterialized)."""
    group: str; group_label: str
    fiscal_year: int; fiscal_period: FiscalPeriod
    peer_basis: str
    caveats: list[str] = Field(default_factory=list)
    metrics: list[MetricSpread] = Field(default_factory=list)
```

### B4. Endpoints (`api/routes.py`) — cache-aside reads, `_PEER_CAVEATS`, NO live aggregation
Two endpoints. **CRITICAL ROUTING ORDER:** `/sectors/spreads` MUST be declared **before** the
existing `/sectors/{group}` route, or FastAPI matches it as `group="spreads"`. Declare the
cross-sector route immediately above `get_sector_series`, and the per-sector route can go after
(its `/sectors/{group}/spreads` path can't be swallowed by `/sectors/{group}`). Add a test that
asserts `/v1/sectors/spreads?metric=current_ratio` does **not** 404 (regression on the ordering).

```python
@public_router.get("/sectors/spreads", response_model=SectorSpreadList, tags=["Sectors"],
    summary="Cross-sector spread of one liquidity/solvency metric (box per SIC group)")
async def get_sector_spreads(
    metric: str = Query(..., description="One of: " + ", ".join(_LIQUIDITY_SOLVENCY_METRICS)),
    year: int | None = Query(None, description="Fiscal year; defaults to latest materialized FY"),
    period: FiscalPeriod = Query("FY"),
    dist_repo: MetricDistributionRepository = Depends(get_metric_distribution_repo),
) -> SectorSpreadList:
    if metric not in _LIQUIDITY_SOLVENCY_METRICS:
        raise HTTPException(404, f"Unknown spread metric '{metric}'. Valid: "
                                 f"{', '.join(_LIQUIDITY_SOLVENCY_METRICS)}.")
    resolved = year if year is not None else dist_repo.latest_fy_year(metric)
    rows = dist_repo.list_for_metric(metric, resolved, period) if resolved is not None else []
    spreads = [SectorSpread(group=r.peer_group, group_label=sic2_label(r.peer_group),
                            peer_count=r.peer_count, min=r.min, p25=r.p25, median=r.median,
                            p75=r.p75, max=r.max) for r in rows]
    return SectorSpreadList(metric=metric, label=METRIC_LABELS.get(metric, metric),
        unit=METRIC_UNITS.get(metric, ""), fiscal_year=resolved or 0, fiscal_period=period,
        peer_basis=f"SIC {settings.secfin_peer_sic_digits}-digit",
        caveats=_PEER_CAVEATS, spreads=spreads)

@public_router.get("/sectors/{group}/spreads", response_model=SectorSpreadProfile, tags=["Sectors"],
    summary="One sector's liquidity/solvency spread (box per metric)")
async def get_sector_spread_profile(
    group: str,
    year: int | None = Query(None), period: FiscalPeriod = Query("FY"),
    dist_repo: MetricDistributionRepository = Depends(get_metric_distribution_repo),
) -> SectorSpreadProfile:
    resolved = year  # per-sector: the UI passes the sector's latest FY point; fall back below
    # simplest: require the UI to pass year (it always knows it from the series); if omitted,
    # None -> empty (honest), OR reuse a per-group latest. Pick: default via list_for_group over
    # dist_repo.latest_fy_year(first LS metric) is acceptable. Keep it explicit + documented.
    rows = (dist_repo.list_for_group(group, resolved, period) if resolved is not None else [])
    by_metric = {r.metric: r for r in rows}
    metrics = [MetricSpread(metric=m, label=METRIC_LABELS.get(m, m), unit=METRIC_UNITS.get(m, ""),
                            peer_count=by_metric[m].peer_count, min=by_metric[m].min,
                            p25=by_metric[m].p25, median=by_metric[m].median,
                            p75=by_metric[m].p75, max=by_metric[m].max)
               for m in _LIQUIDITY_SOLVENCY_METRICS if m in by_metric]
    return SectorSpreadProfile(group=group, group_label=sic2_label(group),
        fiscal_year=resolved or 0, fiscal_period=period,
        peer_basis=f"SIC {settings.secfin_peer_sic_digits}-digit",
        caveats=_PEER_CAVEATS, metrics=metrics)
```
`sic2_label`, `METRIC_LABELS`, `METRIC_UNITS`, `settings`, `_PEER_CAVEATS`, `get_metric_distribution_repo`
are all already imported/defined in `routes.py`. **Reuse `_PEER_CAVEATS` verbatim** (the brief
names it) — it already carries "percentile/POSITION is not a verdict," "N/A excluded, never a low
value," "SIC coarse," and "below min group size." That satisfies AC-6's honesty vocabulary. If a
box-specific line reads better ("a box shows the spread of reported values — width is dispersion,
not quality"), append it to a small `_SPREAD_CAVEATS = _PEER_CAVEATS + [...]` rather than editing
`_PEER_CAVEATS` (leave the company endpoints' copy untouched).

### B5. Batch run (roadmap step 1 — data, not code)
`python -m secfin.analytical.peer_distribution` on the hydrated Docker volume (`analytical` extra).
No code change to the batch expected. This populates `metric_distributions` (AC-1). It is a
**deploy/data step**, gated with the DevOps stage — but the engineer must run it on the hydrated
volume during self-verify to confirm the endpoints return real boxes (AC-1/AC-3 evidence).

### B6. pytest (backend gate)
- Repo: `list_for_metric` / `list_for_group` return seeded rows; empty list when none; point `get`
  still works.
- Route: `/v1/sectors/spreads?metric=current_ratio&year=&period=FY` → all seeded groups; invalid
  metric → 404; a valid-but-non-LS metric (e.g. `roe`) → 404; **`/v1/sectors/spreads` resolves to
  the spreads route, not `group="spreads"`** (ordering regression). `/v1/sectors/{g}/spreads` →
  LS metrics for the group; a group with no rows → empty `metrics` (200, honest); a metric N/A for
  the group is absent (never a 0 box). `caveats` non-empty and equals the peer-caveats vocabulary.

---

## Frontend (senior-frontend-engineer) — after the endpoints are green, same branch

### F1. One shared Plot builder (`static/app.js`) — export on `window.ClearyFi`
Add `boxWhiskerChart(boxes, opts)` following the existing builder conventions (own Plot spec,
`plotTokens()`/`cssVar` theming, `chartCard(title)`, `measuredWidth` from the caller, honesty
caption). `boxes = [{label, peer_count, min, p25, median, p75, max}]`; horizontal boxes (label on
y). Marks: `Plot.ruleX` min→max (whisker), `Plot.barX` p25→p75 (box), `Plot.tickX`/`ruleX` at
median, optional `Plot.dot` for min/max caps. Single neutral accent — **no diverging/good-bad
color** (STYLE_GUIDE §9.2; a wide box or high value is NOT "worse"). Show `peer_count` per row
(tip or right-margin text). Returns a `chartCard` root; returns an empty-state card when `boxes`
is empty (never an empty axis). Used by **both** views.

- **Cross-sector:** one call with all sector boxes (shared metric/unit → shared x-axis, valid).
  Order rows by median (descending) for readability — captioned as "ordered by median (descriptive,
  not a ranking of quality)."
- **Per-sector:** metrics have incompatible scales (current_ratio ~1–3 vs interest_coverage tens–
  hundreds vs debt_to_equity 0–5), so **do NOT share one axis**. Call `boxWhiskerChart` once per
  metric with a single box (its own x domain) and the metric label+unit as the title, stacked — a
  small-multiple. A metric absent from the payload renders nothing for that metric (the panel just
  omits it; if *all* are absent, show one empty state).

**Extreme values / long tails (decision-3):** default the x-domain to the data's true `[min,max]`
with `nice` (fully honest — nothing hidden). If, on real data, one sector's `max` (typically
`interest_coverage` or `debt_to_equity`) flattens every other box to invisibility, switch that
chart to a **clipped view with an explicit caption** ("N sectors' whiskers extend beyond the
axis") and draw an out-of-range arrow — **clip only the drawn extent, never the reported
five-number values**, and always keep the caption. Never misrepresent min/max.

### F2. `static/sectors.js` — wire both views into the existing page
- **Cross-sector section** (new, near the grid): a metric selector (`.segmented` control, reuse the
  `.range-toggle` styling) over the four LS metrics, default `current_ratio`. On load and on
  change: `P.api("/sectors/spreads?metric=" + m + "&year=" + state.data.fiscal_year)` (pass the
  grid's resolved year so the page is internally consistent), cache per metric in
  `state.spreads[m]`, paint via `P.boxWhiskerChart`. Honor `?metric=` from the URL (deep-link +
  e2e). Empty payload → `P.states.empty` ("No sector met the minimum size for this metric/period").
  Render the returned `caveats` in a "How to read these spreads" `<details>` disclosure (AC-6).
- **Per-sector panel** (in `paintDetail`, after the trend): fetch
  `/sectors/{group}/spreads?year=<latest series point's fiscal_year>&period=FY`, cache in
  `state.groupSpreads[group]`, paint the small-multiple. A metric with no box → omitted with a
  one-line "not enough comparable peers"; all missing → one empty state. Never a 0-height box.
- **N/A never 0** (AC-7): reuse the existing `fmtCell`/`—` discipline; any missing number is `—`
  or an omitted/empty box, never `0`.

### F3. `static/sectors.css`
Styles for the spreads section header + metric selector (reuse `.segmented`), the small-multiple
stack, and the disclosure. Theme-aware via existing CSS vars. No new fonts/assets.

### F4. `static/sectors.html`
D1 already vendored d3 + Observable Plot here (per the D1 notes). **Verify** both `<script>` tags
are present (the box builder needs `window.Plot`); if missing, add the same vendored tags the
DuPont trend uses. Add mount points only if the layout needs them (the JS can inject sections into
`#view`/masthead area — match D1's approach). CSP-safe: vendored assets only.

### F5. e2e — `scripts/seed_fixture.py` + `scripts/headless_check.js`
- `seed_fixture.py`: add `_seed_metric_distributions(db_path)` writing `MetricDistributionRow`s
  **directly** via `SQLiteMetricDistributionRepository` (same rationale as `_seed_sector_dupont`:
  offline/base-install profile has no `analytical` extra). Seed the demo SIC groups already used
  by `_SECTOR_DEMO` (35, 60, 28, 73, 52) × the four LS metrics × FY2025, plausible spreads
  (e.g. banks `60` low current ratio, retail `52` tight). **Deliberately omit one (group,metric)**
  — e.g. `interest_coverage` for one group — so the empty/omitted-box honesty path renders in e2e.
  Call it from `main()` after `_seed_sector_dupont`.
- `headless_check.js`: the existing `sectors` and `sectors-expanded` entries already load the page;
  `sectors-expanded` (`?group=60`) now also exercises the per-sector spreads. Add one entry that
  targets the cross-sector chart, e.g. `["sectors-spreads", "/sectors?metric=debt_to_equity"]`, and
  assert `errors=0`. Eyeball the screenshots: cross-sector boxes + metric selector, and a per-sector
  box panel in the expanded detail.

---

## Docs
- `docs/ROADMAP_SECTOR_ANALYTICS.md`: mark **#3** as shipped (endpoints + viz), note it reused the
  existing `peer_distribution.py` + `metric_distributions` scaffold and the D1 sector page.
- **No** `DATA_MODEL.md` / `mapping.py` change (no new metric/concept) — state this in the handoff
  so QA doesn't flag guardrail 3.

---

## Acceptance criteria → concrete checks

| AC | Check |
|----|-------|
| AC-1 | On hydrated volume, `python -m secfin.analytical.peer_distribution` → `repo.count()>0`; the 4 LS metrics present across multiple SIC-2 groups (self-verify query). |
| AC-2 | DuckDB import stays lazy in `peer_distribution.py`; new endpoints call only `dist_repo.*` (repo interface) — grep the routes for `duckdb`/raw SQL (none). |
| AC-3 | `GET /v1/sectors/spreads?metric=current_ratio` → qualifying groups only (seeded groups present, no zero-fill); invalid metric & non-LS metric → 404. pytest. |
| AC-4 | `/sectors` renders cross-sector box chart + working 4-metric selector; theme-aware; Plot vendored. e2e screenshot eyeballed. |
| AC-5 | Expanding a sector shows a box per LS metric (or explicit empty per missing metric — never a 0 box). e2e screenshot + the deliberately-omitted seed (group,metric). |
| AC-6 | Both views render `caveats` (== peer-caveats vocab: POSITION-not-verdict, N/A-excluded-never-0, SIC coarse, min-size). Assert `caveats` non-empty in pytest; disclosure visible in e2e. |
| AC-7 | grep sectors.js for `0`-fallbacks (none); missing value → `—`/empty state/omitted box. Code-review + e2e (omitted seed). |
| AC-8 | No alpha/timing/price copy; ordering captioned "descriptive, not a ranking of quality." Code-review of copy. |
| AC-9 | `peer_count` present in `SectorSpread`/`MetricSpread` and shown per box. pytest field + e2e. |
| AC-10 | No raw SQL in `api/` (reads via `MetricDistributionRepository`); DuckDB batch-only. grep + code-review. |
| AC-11 | `pytest` green (repo + route tests incl. ordering regression + honesty); Docker e2e `errors=0` on sectors / sectors-expanded / sectors-spreads on real (hydrated) + seeded data. |

## Open decisions resolved
1. **Metric set** = all four LS ratios; sparsity handled by the empty-state path, not by dropping.
2. **Endpoint shape** = two dedicated cache-aside endpoints (`/sectors/spreads`,
   `/sectors/{group}/spreads`) over `metric_distributions` via new repo methods — NOT extending
   `/sectors/{group}` (that returns a multi-year series; spreads are one-period). Mind the route
   **declaration order** (static before param).
3. **Extreme values** = true `[min,max]` domain by default (fully honest); optional captioned
   view-clipping with out-of-range arrows only if unreadable — never clip the reported values.
4. **Ordering** = by median, captioned as descriptive ordering, not a quality ranking.

## Handoff → Senior Engineer
**Backend first** (branch off `master`: `sector-box-whisker-spreads`): B1–B4 + B6 pytest, run B5
batch on the hydrated volume to self-verify real boxes; land the JSON contract. **Then frontend**
on the same branch: F1–F5, verify with the Docker e2e headless render check and eyeball the
screenshots. No new page, no new metric, no new table, no `DATA_MODEL`/`mapping` change; DuckDB
stays batch-only (6/7); DB behind the repo interface (5); N/A never 0; no alpha claim.

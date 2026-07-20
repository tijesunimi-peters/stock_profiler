# Implementation: co-holding network (Phase 2b) — backend

**Role:** Senior Backend Engineer → handoff to Senior Frontend Engineer (same branch)
**Task slug:** `institutional-tab-viz` (Phase 2b)
**Branch:** `institutional-conviction-heatmap`
**Date:** 2026-07-19
**Implements:** `2d-architecture-phase2b-coholding-network.md` (backend half).

---

## What changed (backend)

- `src/secfin/normalize/coholding.py` (**new, pure**): `CoHoldingEdge` + `co_holding_edges(
  cusip_sets, exclude, min_overlap, max_edges=200)` — pairwise Jaccard over each manager's
  OTHER-holdings CUSIP set (the `exclude` = viewed issuer's CUSIPs removed first), `source<target`,
  sorted desc, capped. Network-free (mirrors `flows.py`).
- `storage/holdings_repository.py` + `sqlite_holdings_repository.py`: new **bounded** read
  `manager_cusip_sets(manager_ciks, report_period) -> {cik: set[cusip]}` — one indexed query over
  `(manager_cik, report_period)`, the same bounded-read precedent as `book_values` (NOT a DuckDB
  cross-manager scan). Empty input → `{}`.
- `api/routes.py`: `_COHOLDING_CAVEATS` (structural overlap, **not** coordinated trading, no style;
  this-issuer excluded; coverage-dependent) + `GET /companies/{symbol}/institutional-co-holding`.
  Pure composition: `holders_of` (dedup per manager, top-`top` by shares) → `manager_cusip_sets`
  (bounded) → `co_holding_edges`. No DuckDB, no unbounded scan.
- `scripts/seed_fixture.py`: `_seed_coholding` — 4 AAPL holders (Fairwind/Greystone/Meridian/
  Hallmark) with varied overlapping synthetic other-books, so the demo is a real differentiated
  graph (see live output below), not a triangle.
- `docs/DATA_MODEL.md`: new "co-holding network (Phase 2b)" subsection.

## The JSON contract the frontend must consume

`GET /v1/companies/{symbol}/institutional-co-holding?period=YYYY-MM-DD&top=25&min_overlap=0.1`
(`top` ≥ 2, ≤ 50; `min_overlap` 0.0–1.0.)

```json
{
  "cik": 320193, "cusips": ["037833100"], "period": "2026-03-31",
  "caveats": ["… _ISSUER_CENTRIC_CAVEATS + co-holding caveats …"],
  "min_overlap": 0.1,
  "nodes": [                                  // top-`top` holders, largest stake first
    {"manager_cik": 102909, "manager_name": "VANGUARD GROUP INC",
     "shares": 1310000000, "other_holdings_count": 1}
  ],
  "edges": [                                  // pairs with jaccard >= min_overlap, desc
    {"source": 200, "target": 201, "jaccard": 0.6, "shared_count": 3}
  ]
}
```

- **`nodes[].shares`** → node size (area ∝ shares). `other_holdings_count` = the size of its
  other-names set (tooltip; drives *why* it has edges). Isolated nodes (no edge) stay in `nodes`.
- **`edges[].source/target`** are `manager_cik`s (match to nodes by `manager_cik`); `jaccard`
  (0–1) → edge width; `shared_count` → tooltip ("N shared other holdings").
- **Thin/empty:** `< 2` nodes, or `edges: []` → the frontend renders an honest thin/empty state
  (AC-4), **never** a fake network.

## Live evidence (seeded fixture, `AAPL 2026-03-31`)

A rich, differentiated demo network — **7 nodes, 6 edges**:
```
nodes: Vanguard 1.31B (other 1) · State Street 640M (1) · Berkshire 280M (11) ·
       Fairwind 220M (4) · Greystone 180M (4) · Meridian 140M (4) · Hallmark 90M (2)
edges: State Street ↔ Vanguard  J=1.00 (1 shared)      [the {Ally}-only pair]
       Fairwind ↔ Greystone     J=0.60 (3)   Greystone ↔ Meridian J=0.60 (3)
       Fairwind ↔ Meridian      J=0.33 (2)
       Fairwind ↔ Hallmark      J=0.20 (1)   Meridian ↔ Hallmark  J=0.20 (1)
BERKSHIRE = isolated node (shares nothing above 0.1 threshold) — honest.
```
Two clusters + an isolate; AAPL correctly excluded from every overlap (Vanguard's `other=1` is just
{Ally}, not {AAPL, Ally}).

## Verification (backend gate)

- `docker compose --profile test run --rm test` → **390 passed, 6 skipped**. New: `test_coholding.py`
  (7 pure tests: Jaccard, exclude issuer, threshold, isolated node, disjoint, symmetry+source<target,
  cap); `manager_cusip_sets` repo tests; 5 co-holding route tests (nodes/edges, issuer excluded,
  min_overlap, top-cap + multi-class node, thin).
- ruff clean (E,F,I) on the new source; new test E501s fixed. B008 `Depends()` findings are the
  codebase-wide pre-existing pattern.

## Handoff → Senior Frontend Engineer (same branch)

Build `coHoldingNetwork(data, opts)` in `app.js` (vendored `d3-force`) + `coHoldingSection()` /
`mountCoHolding(period)` in `company.js`, consuming the contract above. **Critical (AC-7):** run the
force simulation to a **deterministic settle** (seed initial positions, run to completion
synchronously) so the e2e screenshot is stable. Node = circle area ∝ shares; edge width ∝ jaccard;
tooltips with `shared_count`/jaccard; **honest thin/empty state** (`<2` nodes or no edges);
caption/labels carry the co-holding honesty framing (**overlap in other holdings, NOT coordinated
trading, no style labels**). Verify with e2e + eyeball the AAPL institutional screenshot (the
7-node/6-edge graph above). Backend green; no Python changes on your side. **Note:** the AAPL
institutional demo now has 7 holders (was 3) — the treemap/composition/geography screenshots on that
page change accordingly (more filers, more states); confirm they still render cleanly.

---

# Implementation (frontend) — Senior Frontend Engineer

**Same branch** (`institutional-conviction-heatmap`). Built the network UI consuming the contract above.

## What changed (frontend)

- `src/secfin/api/static/app.js` `coHoldingNetwork(data, opts)` (new, exported): a **vendored
  `d3-force`** graph. Nodes = `data.nodes` (circle **area ∝ shares**, single accent hue); edges =
  `data.edges` (line **width ∝ jaccard**, neutral stroke). Hover `<title>` on nodes ("{mgr} — X sh
  of this company · Y other holdings") and edges ("{A} ↔ {B} — N shared other holdings (Jaccard
  Z%)"). Larger nodes labelled.
  - **Deterministic layout (AC-7):** initial positions seeded on a circle by index (so nodes are
    never coincident → no random jiggle), then the simulation is `.stop()`ed and run **300 ticks
    synchronously**, then clamped into the viewport — the render is stable for the e2e screenshot.
  - **Honest states (AC-4):** `< 2` nodes → `states.empty("Too few holders to graph …")`; nodes but
    **no linking overlap** → `states.empty("No shared other-holdings to connect …")` (never a fake
    network). Isolated nodes render honestly unconnected.
  - Caption + note carry the honesty framing: overlap in **OTHER** reported holdings, **NOT
    coordinated/timed trading, no style labels**, this-issuer excluded, coverage-dependent. Colors
    via `cssVar` (both themes).
- `src/secfin/api/static/company.js`: `coHoldingSection()` ("Which holders run similar portfolios")
  + self-fetching `mountCoHolding(period)` (skip-on-failure), wired into `institutionalView()` and
  the render path after `mountConviction`.

## Verification (frontend gate)

- `docker compose build api` + `docker compose --profile e2e up --abort-on-container-exit
  --exit-code-from e2e` → **HEADLESS CHECK: PASS**, `errors=0` on all 13 pages.
- Eyeballed `data/e2e-shots/institutional.png` (AAPL): the network renders as a legible
  force-directed graph — the Fairwind/Greystone/Meridian/Hallmark **cluster** (thin-to-medium
  edges) and the **Vanguard↔State Street** pair (two large nodes, one edge), with **Berkshire an
  isolated node** — matching the backend's 7-node/6-edge output. No banned framing (grep clean).
  The rest of the 7-holder AAPL page (now 7 holders vs 3) renders cleanly: richer 7-state
  choropleth, 7-filer treemap, composition, series, tables.
- `pytest` remained green (390); no Python touched here.

## Handoff → QA Tester

Branch `institutional-conviction-heatmap` (full-stack, atop the uncommitted treemap + skill-split).
QA should probe: the network is legible and **deterministic** (re-run e2e → same layout); the
**honesty labels** (overlap in OTHER holdings, NOT coordinated trading, no herding/style — grep the
frontend); **this-issuer excluded** from overlap; **isolated node** rendered honestly (Berkshire);
**thin/empty states** (a 1-holder or no-overlap issuer → the empty note, not a fake graph); both
themes; and that the enlarged 7-holder AAPL demo didn't break the treemap/composition/geography.
`pytest` (390) + e2e both green.

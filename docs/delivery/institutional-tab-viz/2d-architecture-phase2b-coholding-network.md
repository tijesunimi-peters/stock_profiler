# Architecture: institutional-tab viz — Phase 2b (co-holding network)

**Role:** Principal Architect → handoff to Senior Backend + Senior Frontend Engineer
**Task slug:** `institutional-tab-viz` (Phase 2b)
**Date:** 2026-07-19
**Designs against:** `1d-brief-phase2b-coholding-network.md`.

---

## Scope re-check (Track 1, buildable, bounded-live)

Pure composition over 13F holdings we already have — **no new canonical concept, no mapping.py, no
DuckDB, no companyfacts.** Nodes = the company's top-K holders; edges = **Jaccard overlap of their
*other*-holdings CUSIP sets** (this issuer's CUSIPs excluded), drawn when Jaccard ≥ a threshold.

**Placement decision — bounded-live, NOT batch (revises `1-brief.md` AC-4b).** For **one** issuer:
`holders_of` (bounded) → cap to top-K by stake → fetch those K managers' CUSIP sets (one bounded
indexed query) → K² pairwise Jaccard in pure Python. With **K ≤ 50**, that's a bounded read + a few
hundred set-intersections (sub-100ms even for mega-fund books) — the **same precedent as the
Phase-2a treemap's bounded per-holder aggregate**, NOT the whole-quarter cross-manager inversion
DuckDB is reserved for (guardrail 6). So it stays on the live request path, behind the repository
interface. Hard requirement (AC-5): the K cap enforces the bound — no *unbounded* cross-manager scan.

**Guardrail check:** G3/G4 no new concept → no `mapping.py`; G5 new SQL lives in the SQLite repo,
pure Jaccard in `normalize/`, route composes (no raw SQL in API); G6/G7 no DuckDB, bounded read;
CIK `int`; shares raw unit; the whole view is *derived* → caveats carry it; single-process intact.

**Branch:** continue on **`institutional-conviction-heatmap`** (the Phase-2a treemap is uncommitted
there; master lacks it). The branch will then carry three logical changes (skill split, treemap,
network) — recommend the operator commit them as **separate commits** when ready. Do not branch
fresh off master (it would lose the treemap base this builds beside).

---

## Data flow (all stages)

```
serve: GET /companies/{symbol}/institutional-co-holding?period=&top=&min_overlap=
  -> resolve cik + this issuer's cusips
  -> holders_of(cusips, period) -> dedup per manager (sum shares) -> top-K by shares   [nodes]
  -> holdings_repo.manager_cusip_sets([node ciks], period)  -> {cik: set(cusip)}        [NEW bounded read]
  -> normalize.coholding.co_holding_edges(sets, exclude=issuer_cusips, min_overlap)     [pure Jaccard]
  -> {nodes, edges, min_overlap, caveats}
store:  SQLiteHoldingsSnapshotRepository.manager_cusip_sets(...)   # the only new SQL
normalize: coholding.py  co_holding_edges(...) -> list[CoHoldingEdge]   # pure, unit-tested
static: coHoldingNetwork() in app.js (d3-force) + coHoldingSection()/mountCoHolding() in company.js
seed: richer demo fixture (several AAPL holders with varied overlapping other-books)
```

No `sec/` or `ingest/` changes.

---

## Backend — files to touch (owner: `senior-backend-engineer`)

### 1. `storage/holdings_repository.py` + `sqlite_holdings_repository.py`

Add one bounded read:

```python
@abstractmethod
def manager_cusip_sets(self, manager_ciks: list[int], report_period: str) -> dict[int, set[str]]:
    """The set of CUSIPs each of `manager_ciks` reported holding in `report_period` -- for the
    BOUNDED set of managers a co-holding view is about (the top-K holders), NOT every manager.
    One indexed read over (manager_cik, report_period); a bounded per-manager read, same character
    as `book_values` -- not the whole-quarter cross-manager inversion (guardrail 6). Empty input
    -> {}. Managers with no holdings that quarter are absent."""
```

SQLite impl:
```python
def manager_cusip_sets(self, manager_ciks, report_period):
    if not manager_ciks: return {}
    ph = ",".join("?" for _ in manager_ciks)
    cur = self._conn.execute(
        f"SELECT manager_cik, cusip FROM holdings "
        f"WHERE report_period = ? AND manager_cik IN ({ph})", (report_period, *manager_ciks))
    out: dict[int, set[str]] = {}
    for cik, cusip in cur.fetchall():
        out.setdefault(cik, set()).add(cusip)
    return out
```
Uses `idx_holdings_manager_period`. Includes **all** position types by CUSIP (overlap is "reported
holdings," any type — documented in the caveat; no SH filter here).

### 2. `normalize/coholding.py` (NEW — the pure, testable logic)

```python
class CoHoldingEdge(NamedTuple):
    source: int; target: int; jaccard: float; shared_count: int

def co_holding_edges(cusip_sets: dict[int, set[str]], exclude: set[str],
                     min_overlap: float, max_edges: int = 200) -> list[CoHoldingEdge]:
    """Pairwise Jaccard overlap of each manager's OTHER-holdings CUSIP set (this issuer's `exclude`
    cusips removed), for pairs clearing `min_overlap`. Symmetric; source<target by cik. Bounded by
    the caller's K managers -> K^2/2 pairs. Returns the top `max_edges` by jaccard (payload bound).
    A manager whose set minus `exclude` is empty (holds only this issuer) yields no edges -> an
    isolated node (honest: shares nothing else)."""
```
Pure, network-free (mirrors `flows.py` / `cusip.py`). No canonical model, no mapping change.

### 3. `api/routes.py` — new endpoint + caveats

- `_COHOLDING_CAVEATS = _ISSUER_CENTRIC_CAVEATS + [...]`:
  - "An edge is the **overlap in the two filers' OTHER reported holdings** (shared securities by
    CUSIP, Jaccard) as of this quarter-end snapshot — a **derived structural overlap, NOT
    coordinated or timed trading**, and never an investment-style label."
  - "Overlap is over reported positions of any type by CUSIP; this company's own position is
    excluded so edges reflect the *other* names, not the shared fact of holding this company."
  - "**Coverage-dependent:** only the ingested filers are nodes, and overlap only reflects the
    holdings ingested for this quarter — a thin graph is coverage, not a confirmed absence of
    overlap." (+ standing `_ISSUER_CENTRIC_CAVEATS`.)
- `GET /companies/{symbol}/institutional-co-holding`:
  - Params: `period` (required), `top: int = Query(25, ge=2, le=50)`, `min_overlap: float =
    Query(0.1, ge=0.0, le=1.0)`.
  - Body: resolve cik + `cusips`; `holders_of` → dedup per manager (sum shares across classes),
    order by shares DESC, take top-K → `nodes` (`{manager_cik, manager_name, shares,
    other_holdings_count}`); `sets = manager_cusip_sets([node ciks], period)`, strip `cusips` from
    each; `other_holdings_count = len(stripped set)`; `edges = co_holding_edges(sets, set(cusips),
    min_overlap)` → `[{source, target, jaccard, shared_count}]`.
  - Response: `{cik, cusips, period, caveats: _COHOLDING_CAVEATS, min_overlap, nodes, edges}`.
  - Isolated nodes (no edge) stay in `nodes` — honest (they hold this company but share no other
    names). Empty/thin is the frontend's honest-state call (AC-4).
- OpenAPI example mirroring the treemap endpoint.

### 4. `scripts/seed_fixture.py` — richer demo network

Add ~3–4 more managers holding the demo issuer (AAPL) with **varied, partially-overlapping
other-books** (a handful of CUSIPs each; some shared across managers, some unique) so the demo graph
is ~6–7 nodes with **differentiated** edges (some strong Jaccard, some weak, some below threshold →
an isolated node). Keep the existing BRK/Vanguard/State Street holders. Reuse the `90000…`
synthetic-CUSIP convention (unresolved by design — fine, overlap is by CUSIP, not CIK).

### 5. `docs/DATA_MODEL.md` — new "co-holding network" subsection

Derived-surface note: Jaccard over other-holdings CUSIP sets, this issuer excluded; bounded top-K
live read (`manager_cusip_sets`, not DuckDB); the honesty framing (structural overlap, not
coordinated trading, no style); coverage-dependent. No `mapping.py` change (guardrail 3 N/A).

### Backend tests — `tests/`
- `test_coholding.py` (pure): Jaccard math; `exclude` removes the issuer's cusips; below-threshold
  pairs dropped; empty/one-element sets → no edges; isolated node (empty after exclude) → no edges;
  symmetry + source<target; `max_edges` cap.
- `test_holdings_repository.py`: `manager_cusip_sets` — correct per-manager sets, bounded to input,
  empty input → {}, period-scoped.
- `test_institutional_viz_routes.py`: nodes = top-K by shares (multi-class summed to one node);
  edges honor `min_overlap`; issuer cusips excluded from overlap; `_COHOLDING_CAVEATS` present;
  thin cases (1 holder → 1 node, 0 edges; no overlap → 0 edges).

---

## Frontend — files to touch (owner: `senior-frontend-engineer`)

### `api/static/app.js` — `coHoldingNetwork(data, opts)`

- Guard `window.d3 && window.d3.forceSimulation`. Read `nodes`, `edges`.
- **Honest states (AC-4):** `nodes.length < 2` → `states.empty("Too few holders to graph …")`;
  `!edges.length` → render an honest note ("No shared *other* holdings among these holders this
  quarter — coverage, not a confirmed absence") rather than a disconnected dot cloud posing as a
  network. Otherwise draw the graph.
- Build SVG; `d3.forceSimulation(nodes)` with `forceLink(edges).id(d=>d.manager_cik)`,
  `forceManyBody`, `forceCenter`, `forceCollide`. **Deterministic layout (AC-7):** seed each node's
  initial `x,y` on a circle by index, then **run the simulation to completion synchronously**
  (`sim.stop()`, fixed `for` of `sim.tick()` until `alpha` decays) and render at settled positions —
  so the e2e screenshot is stable (no async jiggle).
- Node = circle, **area ∝ shares** (`r = k·sqrt(shares)`), single accent hue (no verdict); label the
  larger nodes, hover `<title>` on all: "{manager} — {fmt.shares(shares)} sh of {company} · {n}
  other holdings". Edge = line, **width ∝ jaccard**, neutral stroke; hover `<title>`: "{A} ↔ {B} —
  {shared_count} shared other holdings ({fmt.pct(jaccard)})".
- Colors via `cssVar` (both themes). A small legend: node size = stake here; edge = shared other
  holdings.
- Caption: the honesty framing verbatim — overlap in **other** reported holdings as of the snapshot,
  **derived, not coordinated/timed trading, no herding/style**, coverage-dependent. Reuse
  `_COHOLDING_CAVEATS` language.
- Export on `window.ClearyFi`.

### `api/static/company.js`
- `coHoldingSection()` → titled shell ("Which holders run similar portfolios") + `#coholding-mount`;
  add to `institutionalView()` after the treemap section.
- `mountCoHolding(period)` → self-fetching (`/institutional-co-holding?period=`), skip-on-failure,
  `P.coHoldingNetwork(res, {width: P.measuredWidth(...)})`. Wire into the render path next to
  `mountConviction(period)`.

### Frontend verify
`docker compose build api` + e2e headless (`--exit-code-from e2e`) → PASS, 0 console errors; eyeball
`data/e2e-shots/institutional.png`: a real ~6–7-node network with differentiated edges, legible in
the rendered theme, legend + caption present, no herding language. Keep `pytest` green.

---

## Acceptance criteria → concrete checks

| Criterion | Check |
|---|---|
| **AC-1** nodes = top-K holders; size = stake (shares) | route test (top-K, multi-class summed); node `r ∝ sqrt(shares)` |
| **AC-2** edges = overlap in OTHER holdings, derived not trading; NO herding/style | caption + `_COHOLDING_CAVEATS`; grep the frontend for banned terms (diff review) |
| **AC-3** overlap on CUSIP, this issuer excluded | `test_coholding` (exclude); route test (issuer cusips not counted) |
| **AC-4** thin/empty → honest state, never a fake network | route tests (1 holder, no overlap); `states.empty` / no-edges note; e2e |
| **AC-5** bounded, no unbounded cross-manager scan | `manager_cusip_sets` bounded to K + `top` cap; code review; no DuckDB |
| **AC-6** standing 13F + coverage caveats | `_COHOLDING_CAVEATS ⊇ _ISSUER_CENTRIC_CAVEATS` |
| **AC-7** self-contained d3-force, deterministic, both themes | vendored `d3-force`; synchronous settle; `cssVar`; e2e screenshot stable |
| **AC-8** existing components intact; pytest + e2e green | diff review; CI |

---

## Handoff → Senior Engineers (same branch `institutional-conviction-heatmap`)

**Backend first** (`senior-backend-engineer`): `manager_cusip_sets` (repo interface + SQLite) →
`normalize/coholding.py` (pure `co_holding_edges` + `CoHoldingEdge`) → `routes.py` endpoint +
`_COHOLDING_CAVEATS` → richer `seed_fixture.py` → backend tests → `DATA_MODEL.md`. Ship the JSON
contract (nodes/edges shape) in `3d-implementation…`. Then **frontend**
(`senior-frontend-engineer`) on the same branch: `coHoldingNetwork` (deterministic d3-force),
`company.js` section+mount, e2e verify. Converges with `ROADMAP_13F_ANALYTICS.md` **C1** — this is
its issuer-centric rendering; don't fork a second overlap path. Keep every existing component intact
(AC-8). Don't commit/push or deploy unless asked.

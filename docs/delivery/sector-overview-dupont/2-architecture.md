# 2 — Architecture & Implementation Plan: Sector Overview + DuPont

**Task slug:** `sector-overview-dupont` · **Stage:** Principal Architect (2 of 4)
**Reads:** `1-brief.md`, `CLAUDE.md`, `docs/ROADMAP_SECTOR_ANALYTICS.md`, `docs/ARCHITECTURE.md §3b`
**Scope re-check:** **PASS.** Track 1 only. No new base dependency (DuckDB already the pinned
`analytical` extra). No SEC-compliance change (job is offline over the local DB — no SEC calls).
No new canonical *concept* (`total_assets`, `stockholders_equity`, `revenue`, `net_income` already
mapped) — so **no `mapping.py` change**. Cross-company aggregation stays in the analytical/DuckDB
batch, never the request path (guardrails 6/7). DB behind repositories, no raw SQL in the API
(guardrail 5).

Full-stack, **backend first then frontend on the same branch.**

---

## 1. The core correctness idea (why the design is shaped this way)

The DuPont identity holds **per company**, on **matched bases**, or not at all. Two identities:

- **Per-company** (drives the metric tab + validates our bases — AC-2):
  `net_margin × asset_turnover × equity_multiplier = roe`
  With the *existing* bases: `net_margin = TTM_NI/TTM_Rev`, `asset_turnover = TTM_Rev/avg_Assets`,
  `roe = TTM_NI/avg_Equity`. The product forces **`equity_multiplier = avg_Assets/avg_Equity`**
  (both **averaged** balances) — *not* period-end. This is the one basis that makes the identity
  close. **This is the pinning decision for Risk 1.**

- **Sector aggregate** (asset-weighted, identity-preserving — AC-4):
  `ΣNI/ΣRev × ΣRev/ΣAssets × ΣAssets/ΣEquity = ΣNI/ΣEquity`
  The product telescopes to `ΣNI/ΣEquity` **only if the same company set is in every sum**
  (AC-6, the shared-membership rule). So a company enters the aggregate **only if all four inputs
  (NI, Rev, avg_Assets, avg_Equity) are present** for that period — a company N/A on any leg is
  excluded entirely, never zero-filled.

You cannot recover the four dollar inputs from the per-company *ratios* (they're scale-free), so the
aggregate needs the **dollar components materialized per company** first, then summed per SIC group.
That's the two-table shape below — exactly the existing `metric_values` (per-company) →
`metric_ranks` (aggregate) pattern.

**Basis decision (Risk 2):** the aggregate sums the **same** quantities the per-company metrics use
— `avg_Assets`, `avg_Equity` (averaged), `TTM_NI`, `TTM_Rev`. So the sector aggregate is internally
consistent with per-company roe and the identity closes on the sums. Documented as such.

---

## 2. Data flow (four stages)

```
normalize            ingest (materialize)        analytical (aggregate)     serve
---------            --------------------        ----------------------     -----
metrics.py:                                                                 routes.py:
 + _equity_multiplier   ingest/dupont_backfill    analytical/sector_dupont   GET /v1/sectors
 + dupont_components()   (Python, no network)      (DuckDB ATTACH sqlite)     GET /v1/sectors/{group}
        |                       |                          |                      |
        |  per (cik,period)     v                          v                      v
        +--------------->  dupont_components  ---->   sector_dupont  <--- cache-aside point reads
                           table (staging)            table (aggregate)   (NO live aggregation)
                                                                          static/sectors.* (UI)
```

- **normalize** (`normalize/metrics.py`): add the `equity_multiplier` metric **and** a
  `dupont_components(facts, cik, year, period)` helper that returns the four dollar inputs on the
  matched bases (reusing `_index_concepts` / `_resolve_anchor` / `_Ctx.ttm` / `_Ctx.avg` — **zero
  logic duplication**), or `None` when any leg is missing (shared-membership at the source).
- **ingest** (`ingest/dupont_backfill.py`): mirror `metrics_backfill.py` — iterate CIKs × their
  `metric_periods`, call `dupont_components`, upsert the non-`None` rows into `dupont_components`.
  Pure, no network.
- **analytical** (`analytical/sector_dupont.py`): DuckDB `ATTACH '<db>' (TYPE sqlite)`, join
  `dupont_components × company_profiles` on CIK, `GROUP BY substr(sic,1,digits), fiscal_year,
  fiscal_period`, sum the four, `HAVING count(*) >= min_size`, compute the four ratios **from the
  sums**, write back through the ordinary SQLite repo (write path stays operational). Mirrors
  `peer_ranks.py` exactly. **This is the only cross-company aggregation and it is offline.**
- **serve** (`api/routes.py`, `schema.py`, `main.py`): two read-only endpoints, cache-aside point
  reads of `sector_dupont`. No DuckDB import anywhere on the serve path.
- **static** (`api/static/`): new app-shell page `sectors.html` + `sectors.js` + `sectors.css`, new
  sidebar entry in `script.js`, new `GET /sectors` route in `main.py`.

---

## 3. Backend work (owner: `senior-backend-engineer`) — do first

### 3a. `normalize/metrics.py` — new metric + component extractor
- **`_equity_multiplier(ctx)`**: `avg, exact = ctx.avg("total_assets")`; `eq_avg, eq_exact =
  ctx.avg("stockholders_equity")`. `na` if either is `None` ("assets or equity not reported") or
  `abs(eq_avg) < _NEAR_ZERO` ("equity is zero/near-zero"). Else value `avg/eq_avg`, unit `"ratio"`,
  basis `"TTM"` (the averaged-balance basis, same label the other `_ttm_over_avg` metrics carry);
  `approximate` with `_INEXACT_AVG_REASON` if **either** average fell back to period-end
  (`not (exact and eq_exact)`). Register `("equity_multiplier", _equity_multiplier)` in `_METRICS`
  (append — keeps existing order stable). This is the 27th metric.
- **`dupont_components(facts, cik, year, period) -> DupontComponents | None`**: build
  `index = _index_concepts(facts)`, `anchor = _resolve_anchor(index, year, period)`; return `None`
  if anchor is `None`. `ctx = _Ctx(index, facts, anchor)`. Pull `ni = ctx.ttm("net_income")`,
  `rev = ctx.ttm("revenue")`, `assets, a_exact = ctx.avg("total_assets")`,
  `eq, e_exact = ctx.avg("stockholders_equity")`. **Return `None` unless all four are non-`None`
  and `abs(eq) >= _NEAR_ZERO` and `abs(rev) >= _NEAR_ZERO` and `abs(assets) >= _NEAR_ZERO`**
  (shared-membership + no degenerate denominators). Else return a small `NamedTuple`
  `DupontComponents(net_income, revenue, avg_assets, avg_equity, period_end=anchor.end,
  approximate=not (a_exact and e_exact))`. Keep it beside the engine.

### 3b. `storage/` — two repositories (mirror `metric_rank_repository`)
- **`dupont_component_repository.py`** (abstract) + **`sqlite_dupont_component_repository.py`**:
  table `dupont_components(cik, fiscal_year, fiscal_period, period_end, net_income, revenue,
  avg_assets, avg_equity, approximate INTEGER, PK(cik, fiscal_year, fiscal_period))`. Row
  `DupontComponentRow`. Methods: `bulk_upsert`, `clear`, `count`, `close`. (No per-CIK read needed
  — DuckDB reads the table directly; keep the surface minimal.)
- **`sector_dupont_repository.py`** (abstract) + **`sqlite_sector_dupont_repository.py`**:
  table `sector_dupont(peer_group TEXT, fiscal_year INTEGER, fiscal_period TEXT, period_end TEXT,
  peer_count INTEGER, sum_net_income REAL, sum_revenue REAL, sum_avg_assets REAL,
  sum_avg_equity REAL, net_margin REAL, asset_turnover REAL, equity_multiplier REAL, roe REAL,
  PK(peer_group, fiscal_year, fiscal_period))`. Store the **sums** too (auditability — the UI can
  show "aggregated over N companies, ΣRevenue = …"). Row `SectorDupontRow`. Methods:
  `bulk_upsert`, `clear`, `count`, `close`, plus **serving reads**:
  - `list_for_period(fiscal_year, fiscal_period) -> list[SectorDupontRow]` (grid)
  - `get_series(peer_group) -> list[SectorDupontRow]` ordered by (fiscal_year, fiscal_period) (trend)
  - `latest_fy_year() -> int | None` (`MAX(fiscal_year) WHERE fiscal_period='FY'` — grid default).
  Add an index on `(fiscal_year, fiscal_period)` and on `(peer_group)`.

### 3c. `ingest/dupont_backfill.py` — per-company materialization (no network)
Mirror `metrics_backfill.py`: `SQLiteRawFactRepository` + `SQLiteDupontComponentRepository`;
`for cik in all_ciks(): for p in metric_periods(facts): c = dupont_components(...); if c: rows.append
(DupontComponentRow(...))`; `bulk_upsert`; `--limit N` flag; `__main__`. Log progress every 100.

### 3d. `analytical/sector_dupont.py` — DuckDB aggregation (mirror `peer_ranks.py`)
`compute_sector_dupont(db_path, sic_digits, min_size) -> list[SectorDupontRow]` runs:
```sql
WITH base AS (
  SELECT dc.net_income, dc.revenue, dc.avg_assets, dc.avg_equity,
         dc.fiscal_year, dc.fiscal_period, dc.period_end,
         substr(cp.sic, 1, ?) AS peer_group
  FROM sq.dupont_components dc
  JOIN sq.company_profiles cp ON cp.cik = dc.cik
  WHERE cp.sic IS NOT NULL AND length(cp.sic) >= ?
)
SELECT peer_group, fiscal_year, fiscal_period,
       max(period_end) AS period_end, count(*) AS peer_count,
       sum(net_income) AS s_ni, sum(revenue) AS s_rev,
       sum(avg_assets) AS s_assets, sum(avg_equity) AS s_eq
FROM base
GROUP BY peer_group, fiscal_year, fiscal_period
HAVING count(*) >= ?
```
Then in Python compute `net_margin=s_ni/s_rev`, `asset_turnover=s_rev/s_assets`,
`equity_multiplier=s_assets/s_eq`, `roe=s_ni/s_eq` (guard each denominator > `_NEAR_ZERO`; skip the
degenerate row rather than emit a bogus number — sums over ≥5 companies won't realistically be
zero, but guard anyway). `run_sector_dupont(...)`: `repo.clear()` then `bulk_upsert` (full recompute
like peer_ranks). `--sic-digits`/`--min-size` overrides defaulting to
`settings.secfin_peer_sic_digits` (2) / `secfin_peer_min_size` (5). Lazy `import duckdb`.

### 3e. `normalize/sic.py` — static SIC-2 label map (reference data, not ingested)
`SIC2_MAJOR_GROUP_NAMES: dict[str, str]` from the **official SIC major-group list** (public-domain
classification, like `geography.py`'s `US_STATE_CODES`). `sic2_label(code) -> str` returns the name
or the **bare code** when unknown (honest fallback). Used to set `group_label` at serve time.

### 3f. `api/` — two read-only endpoints
- **`schema.py`**: `SectorDupont` (group, group_label, fiscal_year, fiscal_period, period_end,
  peer_count, net_margin, asset_turnover, equity_multiplier, roe, sum_net_income, sum_revenue,
  sum_avg_assets, sum_avg_equity — floats, all present since sums exist), `SectorList`
  (fiscal_year, fiscal_period, aggregation: `"asset-weighted sector aggregate — not a median"`,
  caveats, sectors: list[SectorDupont]), `SectorSeries` (group, group_label, aggregation, caveats,
  points: list[SectorDupont]).
- **`routes.py`**:
  - `get_sector_dupont_repo(request)` provider (from `request.app.state`).
  - `_SECTOR_CAVEATS`: reuse the `_PEER_CAVEATS` phrasings **plus** two required ones:
    `"These are asset-weighted sector aggregates (ΣNI/ΣRev × ΣRev/ΣAssets × ΣAssets/ΣEquity),
    not medians or averages of company ratios — the DuPont identity holds on the aggregate."`
    and `"Companies are grouped by fiscal-period label; fiscal periods are not calendar-aligned
    across companies, and a company is included only when net income, revenue, assets and equity
    are all reported (N/A on any leg → excluded, never counted as zero)."`
  - `GET /v1/sectors` (`year: int | None = None`, `period: FiscalPeriod = "FY"`): resolve year via
    `latest_fy_year()` when `None`; `rows = repo.list_for_period(year, period)`; map to `SectorDupont`
    (attach `group_label` via `sic2_label`); return `SectorList`. Empty list is a valid honest
    result (no group met min size / not yet materialized) — say so in caveats, do not 500.
  - `GET /v1/sectors/{group}`: `rows = repo.get_series(group)`; 404 only if you prefer, else return
    an empty-points `SectorSeries` (prefer empty + caveats over 404 — consistent with peers). UI
    slices 1Y/5Y/All and picks the latest FY row for the tree.
- **`main.py`**: `app.state.sector_dupont_repo = SQLiteSectorDupontRepository(...)` in the lifespan
  (next to `metric_rank_repo`), and `.close()` in the finally block. Add the `GET /sectors`
  FileResponse route (next to `/compare`, `/screen`).

### 3g. Tests — `tests/test_sector_dupont.py` (+ metric test)
- `equity_multiplier`: value, N/A on missing/zero equity, `approximate` on period-end fallback.
- **Per-company identity (AC-2)**: build facts where all legs are `ok`; assert
  `net_margin.value * asset_turnover.value * equity_multiplier.value == pytest.approx(roe.value)`.
- `dupont_components`: returns `None` when any of NI/Rev/Assets/Equity absent; returns all four when
  present.
- **Aggregate + shared membership (AC-4/6)**: two-company synthetic group → assert
  `sector.roe == pytest.approx(sector.net_margin * sector.asset_turnover * sector.equity_multiplier)`
  and equals `Σni/Σeq`; a third company missing equity is **excluded** (peer_count unchanged, sums
  unchanged). **Min-size drop (AC-7)**: a group below `min_size` yields no row.
- Repo round-trips (`bulk_upsert`/`clear`/`list_for_period`/`get_series`/`latest_fy_year`).
- Endpoint tests via `TestClient`: `/v1/sectors` shape + caveats present + `aggregation` label;
  `/v1/sectors/{group}` series ordering; empty-result honesty (no 500).
  (The DuckDB job itself is exercised in a Docker/analytical context — keep unit tests on the pure
  Python aggregation math where possible; a small DuckDB integration test may be `@pytest.mark`ed
  like the existing analytical tests if any.)

### 3h. Docs (guardrail 3 — required)
- `docs/ROADMAP_METRICS.md`: add `equity_multiplier` (definition `avg_Assets/avg_Equity`, basis,
  the DuPont identity, N/A rules).
- `docs/DATA_MODEL.md`: add `equity_multiplier` to the metrics list **and** a short "Sector
  aggregates (DuPont)" note: asset-weighted, identity-preserving, **not a median**,
  shared-membership, batch-materialized, SIC caveats.
- `docs/ROADMAP_SECTOR_ANALYTICS.md`: mark Deliverable 1 status (in-progress → shipped on QA green).

---

## 4. Frontend work (owner: `senior-frontend-engineer`) — after backend lands

Read `senior-frontend-engineer` SKILL + `docs/STYLE_GUIDE.md`; the reference is the company hub
(`company.js`) and the existing `commonSizeChart` for Plot usage. App shell + Observable Plot are
already vendored (`static/vendor/plot.umd.min.js`, `d3.min.js`) — CSP-safe, no new assets.

- **`sectors.html`**: app-shell page (`<body class="app has-ctx?" data-shell="sectors">`, empty
  `#appSide`/`#appTopbar`/`#appScrim` mounts, `#masthead`, a content root). Link `style.css`,
  `app.css`, `company.css` (shared viz/table styles), `sectors.css`; scripts `suggest.js`,
  `script.js`, vendor plot/d3, `sectors.js` (order: suggest before script per its docstring).
- **`sectors.js`**:
  - Fetch `GET /v1/sectors` → render the **overview grid**: one row per sector (group_label, ROE,
    Net Margin, Asset Turnover, Equity Multiplier, # companies). **Sortable** by any numeric column
    (client-side; default sort by ROE desc). Header shows the period + the **"asset-weighted sector
    aggregate — not a median"** label prominently.
  - **Row expand** → fetch `GET /v1/sectors/{group}` and render:
    (a) **DuPont tree** — HTML/CSS boxes showing the identity
    `ROE = Net Margin × Asset Turnover × Equity Multiplier` with each leg's aggregate value (from
    the latest **FY** point). Show the identity literally (× and = operators). No chart lib needed;
    keeps it honest and legible.
    (b) **Trend chart** — Observable Plot line(s) of ROE (and optionally the three drivers) over the
    **quarterly** series, with a **segmented `1Y` / `5Y` / `All` toggle** (1Y = last 4 quarters,
    5Y = last 20, All = everything). A period that's absent is a **gap**, never a zero point.
  - **Caveats panel** rendering `caveats` + the `aggregation` label verbatim from the API.
  - **N/A handling**: any absent value → an explicit "—"/"N/A" cell or a gap in the line, **never
    `0`**. (Sums are always present for a materialized row, so N/A mostly appears as a *missing
    sector/period*, which must render as empty state, not zero.)
  - Theme-aware (respect existing CSS vars), no external fetches.
- **`sectors.css`**: grid + tree + trend styling, following `company.css` tokens.
- **`script.js`**: add a sidebar entry. Put a new top group `{ label: "Overview", items: [{ key:
  "sectors", label: "Sectors", href: "/sectors" }] }` **above** "Data" (this is the operator's
  "Home" menu), and let `data-shell="sectors"` mark it current.
- **`main.py`**: `GET /sectors` → `FileResponse(STATIC_DIR / "sectors.html")` (already listed in 3f).
- **`scripts/headless_check.js`**: add pages — `["sectors", "/sectors"]` and
  `["sectors-expanded", "/sectors?group=<a-real-2digit-group>&range=5y"]` (support a query param in
  `sectors.js` to auto-expand a group + preset range for the e2e shot). Assert 0 console errors and
  that the grid + tree + trend render.

---

## 5. Acceptance criteria → concrete checks

| AC | Check | Owner |
|----|-------|-------|
| AC-1 equity_multiplier metric, N/A≠0 on missing/zero equity | unit test 3g; mirrors `debt_to_equity` guard | backend |
| AC-2 per-company identity | `test_sector_dupont.py` identity assert on real-ish facts; confirm live on AAPL+WMT | backend/QA |
| AC-3 docs for equity_multiplier | `ROADMAP_METRICS.md` + `DATA_MODEL.md` diff | backend |
| AC-4 aggregate = product-of-drivers (asset-weighted) | aggregate identity assert 3g; `sector_roe==s_ni/s_eq` | backend |
| AC-5 "aggregate, not a median" label | present in `_SECTOR_CAVEATS` + `SectorList.aggregation` + grid header | backend+frontend |
| AC-6 shared-membership; N/A excluded | `dupont_components` returns None on any missing leg; exclusion test | backend |
| AC-7 min-size drop | `HAVING count(*)>=min_size`; below-threshold test yields no row | backend |
| AC-8 SIC caveats carried | `_SECTOR_CAVEATS` reuses `_PEER_CAVEATS` + 2 new; rendered in panel | backend+frontend |
| AC-9 no value renders as 0 | e2e + eyeball: missing → gap/"—"; grep sectors.js for zero-fill | frontend/QA |
| AC-10 no alpha/price/timing claim | copy review of sectors.html/js + caveats | frontend/QA |
| AC-11 1Y/5Y/All trend works | e2e drives the toggle; series is from the materialized table | frontend/QA |
| AC-12 aggregation batch-only; no raw SQL in API; DB behind repo | grep: no `duckdb`/raw SQL import in `api/`; endpoints use repos | backend/QA |
| AC-13 pytest + e2e green on hydrated volume | Docker `pytest` + `headless_check.js` | both/QA |

---

## 6. Order of operations & verification substrate

1. Backend: 3a → 3b → 3c → 3d → 3e → 3f → 3g → 3h; `pytest` green in Docker.
2. **Materialize on a hydrated volume** (real ~8.7K companies live in the 7.2G backup; `data/secfin.db`
   is a 100K stub). In Docker with the `analytical` extra:
   `python -m secfin.ingest.dupont_backfill` → `python -m secfin.analytical.sector_dupont`.
   Spot-check: pick 2–3 SIC-2 groups, assert `roe ≈ net_margin*asset_turnover*equity_multiplier`
   and `peer_count ≥ min_size`; confirm a known bank/utility group's leverage reads sensibly.
3. Frontend: build page + trend + sidebar; `docker compose build`; run `headless_check.js`; eyeball
   the grid, an expanded DuPont tree, and the trend at 1Y/5Y/All.
4. Hand to QA.

**Non-negotiables re-stated:** DuckDB import appears **only** in `analytical/sector_dupont.py`
(lazy) — never in `api/`; the endpoints are pure point reads of `sector_dupont`; DB access is behind
the two new repositories; no `mapping.py` change (no new concept); SEC client untouched (offline
job); `/` marketing page untouched.

## Handoff → Senior Engineer
**Backend first** (`senior-backend-engineer`, §3) to land the metric, batch jobs, table, endpoints,
tests, and docs — self-verify with `pytest` + a materialize-and-spot-check on the hydrated volume.
Then **frontend** (`senior-frontend-engineer`, §4) on the **same branch** to build the page, DuPont
tree, 1Y/5Y/All trend, and sidebar entry — self-verify with the Docker e2e headless render check and
eyeball the screenshots. Then QA.

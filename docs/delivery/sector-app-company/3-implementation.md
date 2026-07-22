# Implementation — Sector Analytics app: Company view (Phase 2)

Full-stack. **Backend done** (this doc); the frontend engineer appends below.
Branch: **`sector-app-company`** — **stacked on Phase 1** (`sector-app-shell`, `3e4bfc6`), since the
frontend Company view extends Phase 1's `sectorapp.js`. Uncommitted.

## Backend (Senior Backend Engineer) — DONE

New **read** endpoint for the Company view's peer dot-cloud: every company in a SIC group with a
comparable value for one metric. Plain cache-aside read over the operational store; no DuckDB, no
raw SQL in the API, DB behind a repo.

- **`storage/sector_company_repository.py`** (+ `sqlite_…`) — `SectorCompanyRepository` with
  `list_for_group_metric(sic_prefix, sic_digits, metric, year, period)` and `latest_fy(metric)`. The
  sqlite impl joins `metric_values mv JOIN company_profiles cp ON cp.cik=mv.cik LEFT JOIN
  metric_ranks mr …`, filters `mv.value IS NOT NULL AND mv.status IN ('ok','approximate')` and
  `substr(cp.sic,1,sic_digits)=sic_prefix`, `ORDER BY mv.value`. **N/A · N/M excluded.**
- **`normalize/schema.py`** — `SectorCompanyValue{cik,name,value,percentile}` +
  `SectorCompanyValueList{group,group_label,metric,label,unit,higher_is_better,fiscal_year,
  fiscal_period,peer_basis,caveats,companies}`.
- **`api/routes.py`** — `get_sector_company_values` + `get_sector_company_repo` dep +
  `_SECTOR_COMPANY_CAVEATS`. **`api/main.py`** — wired `app.state.sector_company_repo` + close.
- **`tests/test_sector_company_values.py`** — 5 tests. **Docs:** `DATA_MODEL.md`, `CLAUDE.md`.

### JSON contract (for the frontend)

```
GET /v1/sectors/{group}/{metric}/companies?year=<int|null>&period=FY
```
- `metric` must be one of `METRIC_KEYS` (else **404**). Suggested set for the dot-plots:
  `net_margin, revenue_growth_yoy, roe, roa, debt_to_equity, fcf_margin, inventory_turnover,
  current_ratio`.
- `year` defaults to the **latest FY with values** for the metric.
- Response `SectorCompanyValueList`:
  ```json
  { "group":"35","group_label":"…","metric":"net_margin","label":"Net margin","unit":"ratio",
    "higher_is_better":true,"fiscal_year":2025,"fiscal_period":"FY","peer_basis":"SIC 2-digit",
    "caveats":["…"],
    "companies":[ {"cik":1000,"name":"…","value":0.05,"percentile":42.0}, … ] }  // ordered by value
  ```
- **Honest empty:** `companies: []` (200) when the group is below `secfin_peer_min_size` **or** has
  no values. **Never** a 0-valued row (N/A · N/M excluded).
- The frontend can compute the **IQR band + median client-side** from `companies[].value` — no need
  for `/peers/{metric}/distribution`. Orient the percentile with `higher_is_better` (invert for
  lower-is-better) and show a **"lower is better"** text marker (no color).

### Verified (backend)
- `pytest` **511 passed, 6 skipped** (+5 new; no regression). `ruff` clean on new files.
- Contract (TestClient): populated list (7 companies, `higher_is_better` correct, ordered by value);
  below-min group → `companies: []`; unknown metric → 404.

### What the frontend engineer does next
- Wire the ⌘K search (`suggest.js`) + a `?symbol=` preset → resolve focal `cik` + its SIC group.
- Build the Company view in `sectorapp.js`: derived per-theme percentile rail + composite card
  (from `/companies/{symbol}/peers` + `normalize/themes.py`), the per-metric **dot-plots** (dot per
  company at its value from this endpoint, client-computed IQR band + median tick, focal filer as a
  `--accent` rotate-45 diamond, **click a dot → set `focalCik` + recompute**), **no favorability
  color**, honest empty states, `focalCik` persists across views.
- Seed the fixture (a SIC group ≥ min size with `company_profiles` + `metric_values` (+ some `na`) +
  `metric_ranks`, and one company resolvable by ticker) so the e2e renders a populated dot-cloud.
- e2e shots + rebuild `api` + eyeball.

---

## Frontend (Senior Frontend Engineer) — DONE

The Company view (altitude 2) in the `/sector-analytics` app, consuming the endpoint above. **No
favorability color** — dots/bars neutral, focal filer the single `--accent` diamond, "lower is
better" a text marker.

- **`static/sector-analytics.html`** — added `suggest.js`; the header search is now a real input.
- **`static/sectorapp.js`** — `state.focalCik/focalName/focalGroup/focalPeers/coValues`; `?symbol=`
  + `?view=company` presets; `selectFocal(symbol)` (resolve ticker/CIK → `/companies/{sym}/peers` →
  focal cik + SIC group + per-metric percentiles), `selectFocalCik` (dot-click re-focus, same group),
  `ensureCompanyData` (fetch `/v1/sectors/{group}/{metric}/companies` per metric, cached), and
  `renderCompanyView`:
  - honest empty ("Place a filer in its peers") when no focal; honest "no peer group" when the focal
    has none.
  - **Left rail** = derived per-theme percentile (avg of the focal's constituent-metric percentiles
    from `/peers`, inverting lower-is-better via a client `CO_DIR` map, over `CO_THEMES` mirroring
    `normalize/themes.py`), 5 themes + 2 "not scored"; a **composite card** = avg of the theme
    percentiles, **labeled "derived · … not a ranked position"** (no fabricated rank).
  - **Dot-plots** (8 metrics): client-computed IQR band (q1–q3 of `companies[].value`) + median
    tick, a **dot per peer** at its value (neutral, jittered, clickable), the **focal as a rotate-45
    `--accent` diamond**; header shows the focal value + percentile + "lower is better" marker (from
    the endpoint's `higher_is_better`); caption "each dot a filer · IQR · median · ◆ = <name> ·
    favorability-adjusted, N/A·N/M excluded". Click a dot → `selectFocalCik` → recompute rail + all
    diamonds.
  - `focalCik` persists across view switches.
- **`static/sectorapp.css`** — Company-view styles (rail, composite card, dot-plot track/IQR/median/
  dot/diamond), tokens only, `--positive/--caution/--negative` never referenced; mobile reflow.
- **`scripts/seed_fixture.py`** — `_seed_app_company_group`: 10 SIC-35 synthetic filers
  (`company_profiles` + `metric_values` for the 8 metrics + `metric_ranks`), **one company's two
  metrics left N/A** to prove exclusion; focal reachable via `?symbol=900001` (raw CIK).
- **`scripts/headless_check.js`** — `sectorapp-company-empty`, `sectorapp-company` (`?symbol=900001`),
  `sectorapp-company-refocus` (dot-click).

### Verified (frontend)
- `pytest` **511 passed, 6 skipped**; no favorability tokens used; endpoint over the fixture: 10
  companies for net_margin, **9 for fcf_margin** (the N/A company excluded), focal 900001 resolves.
- e2e **PASS** (errors=0). **Eyeballed:** empty state ("Place a filer in its peers"); populated
  (rail + composite P10 + 8 dot-plots with focal diamond + "lower is better" on Debt to Equity + "9
  filers" where N/A excluded); refocus (dot-click → focal "Machinery Co 5", rail/composite/diamonds
  recompute).

### For QA to probe
- Drive the **live search** (type + pick) resolves a real company; `?symbol=<cik>` preset; **dot-
  click** re-focus; `focalCik` **persists** across view switches; N/A exclusion (9 vs 10 filers);
  **no favorability color** (computed styles); "lower is better" marker on `debt_to_equity`; mobile
  390px reflow; Sector view + `/sectors` still fine.
- Minor: the empty-state breadcrumb shows a leading "›" (no group yet) — cosmetic.


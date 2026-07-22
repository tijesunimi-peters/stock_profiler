# Architecture — Sector Analytics app: Company view (Phase 2)

Stage 2 (Principal Architect). Designs against `1-brief.md`. **Full-stack** — `senior-backend-engineer`
(the endpoint) **first**, then `senior-frontend-engineer` (the Company view), same branch.

Scope re-check: **Track 1, in-architecture.** A new **read** endpoint over the materialized
`metric_values` ⨝ `company_profiles` (+ `metric_ranks`) — structured financials, no free text, no
new canonical concept, no new dependency. Cache-aside, DB behind a repo, no raw SQL in `routes.py`,
no DuckDB on the request path.

## Decisions resolved

### R1 — identity: cik + name (no ticker fabrication)
`company_profiles` **stores `name`** (cik, sic, sic_description, name). The endpoint returns
**`cik` + `name`** per company. Focal identity in the app state is **`focalCik`** (int); a dot-click
sets `focalCik`; the **⌘K search resolves ticker → cik** (the existing `_cik_from_symbol` / ticker
cache). No fabricated tickers.

### R2 — left rail: DERIVED per-theme percentiles (labeled), + a derived composite
No per-company theme scores exist. Derive, for the focal company, a **per-theme percentile =
average of its constituent metrics' favorability-adjusted percentiles** — using
`/v1/companies/{symbol}/peers` (per-metric percentiles from `metric_ranks`) + the theme→constituent
map in `normalize/themes.py`, inverting `percentile → 100 − percentile` for lower-is-better metrics
(`METRIC_DIRECTION`). Show the **5 backable themes** (avg over available constituents) + the **2
deferred** as "not scored" (consistent with the Sector view). The **composite rank card** shows a
**derived composite percentile** (avg of the theme percentiles), **labeled "derived · avg of
constituent percentiles"** — **not** a fabricated "rank N/M" (we can't rank the company against peers
on a composite without every peer's composite). Honest.

### R3 — metric set (dot-plots), from materialized metrics; band computed client-side
The new endpoint returns **every peer's raw value**, so the **IQR band + median are computed
client-side** from those values (`P.fmt`/a small quantile helper) — the dot-plot needs **only the
new endpoint** (dots + band from one source); `/peers/{metric}/distribution` is not required. This
frees the metric set from `_SPREAD_METRICS`. Set (materialized, broadly covered):
`net_margin, revenue_growth_yoy, roe, roa, debt_to_equity, fcf_margin, inventory_turnover,
current_ratio`. Each carries `higher_is_better` (from `METRIC_DIRECTION`, exposed to the client via a
small display-only map like the existing ones) for the percentile inversion + a **"lower is better"
text marker** (never a colored/flipped fill). No `effective_tax_rate`/`net_debt-EBITDA` (unmaterialized).

### R5 — endpoint shape: one metric per call
`GET /v1/sectors/{group}/{metric}/companies?year=&period=` — simple, cache-friendly (~8 calls per
Company view, each a point read). Mirrors the `/sectors/{group}/spreads` + `/peers/{metric}/
distribution` families.

## Backend

**`storage/sector_company_repository.py`** (new ABC) + **`sqlite_sector_company_repository.py`**:
```python
class CompanyMetricValueRow(NamedTuple):
    cik: int; name: str | None; value: float; percentile: float | None
class SectorCompanyRepository(ABC):
    def list_for_group_metric(self, sic_prefix, sic_digits, metric, year, period) -> list[CompanyMetricValueRow]: ...
    def count(self) -> int; def close(self) -> None
```
The sqlite impl (SQL in storage only):
```sql
SELECT mv.cik, cp.name, mv.value, mr.percentile
FROM metric_values mv
JOIN company_profiles cp ON cp.cik = mv.cik
LEFT JOIN metric_ranks mr ON mr.cik = mv.cik AND mr.metric = mv.metric
      AND mr.fiscal_year = mv.fiscal_year AND mr.fiscal_period = mv.fiscal_period
WHERE mv.metric = ? AND mv.fiscal_year = ? AND mv.fiscal_period = ?
      AND mv.value IS NOT NULL AND mv.status IN ('ok','approximate')   -- exclude N/A · N/M, never 0
      AND cp.sic IS NOT NULL AND length(cp.sic) >= ? AND substr(cp.sic,1,?) = ?
ORDER BY mv.value
```
No DuckDB; own connection (WAL); read-only on the serving path.

**`normalize/schema.py`** (new models):
```python
class SectorCompanyValue(BaseModel):
    cik: int; name: str | None; value: float; percentile: float | None
class SectorCompanyValueList(BaseModel):
    group: str; group_label: str; metric: str; label: str; unit: str
    higher_is_better: bool
    fiscal_year: int; fiscal_period: FiscalPeriod; peer_basis: str
    caveats: list[str] = []
    companies: list[SectorCompanyValue] = []
```

**`api/routes.py`** — `get_sector_company_values`:
- `metric not in METRIC_KEYS` → **404** (mirror `/peers/{metric}/distribution`).
- resolve year default (latest FY with data for the metric — reuse a repo `latest_fy` or the
  distribution repo's), read `list_for_group_metric`; **honest empty** (`companies: []`, 200) when
  the group is below `secfin_peer_min_size` **or** has no values — gate: `if len(rows) <
  settings.secfin_peer_min_size: rows = []` (matches the "below-min → absent, never zero-filled"
  convention). Caveats = the `_PEER_CAVEATS` vocabulary + a line that N/A·N/M are excluded, never 0,
  and percentile is a POSITION not a verdict. `higher_is_better` from `METRIC_DIRECTION` (fallback:
  omit the marker if the metric has no direction).
- `get_sector_company_repo` dep; wire `app.state.sector_company_repo` in `main.py` + close.

**Tests** `tests/test_sector_company_values.py`: per-company list (values ordered, name + percentile
attached), **N/A·N/M excluded** (a value=None row is absent, not 0), **below-min → empty**, unknown
metric → 404, endpoint reads via repo (no DuckDB/raw SQL). Docs: `DATA_MODEL.md` + CLAUDE.md layout.

## Frontend (`static/sectorapp.js` + `sectorapp.css`)

- **Search wiring:** add `suggest.js` (vendored, CSP-safe) to `sector-analytics.html`; attach it to
  the header search input; on pick → resolve to `{cik, symbol, sic group}` and set the app's focal +
  `view='company'`. Also accept **`?symbol=`** (and `?view=company`) to preset the focal (used by the
  e2e so the render check doesn't depend on driving the typeahead).
- **Company view** (`renderCompanyView`), no favorability color:
  - **Empty state** when no focal: "Search a ticker to place it inside its peers."
  - **Left rail:** the derived per-theme percentiles (bars, neutral fill, "P##"), 5 themes + 2 "not
    scored"; a **composite card** with the derived composite percentile (labeled derived).
  - **Main:** for each metric in the set, one **dot-plot row**: header (metric name + focal value +
    "lower is better" marker if inverted); a **track** with an **IQR band** (client-computed q1–q3
    from the endpoint's values) + **median tick**, a **dot per peer** at its value (neutral
    `--border-strong`, low opacity, slight deterministic vertical jitter), and the **focal filer as a
    rotate-45 `--accent` diamond** on top; **click any dot → set `focalCik`** → refetch the focal's
    `/peers` (rail/rank) + re-render every plot's diamond. Caption: "each dot a filer · band = IQR ·
    line = median · ◆ = <name> · percentiles favorability-adjusted, N/A·N/M excluded".
  - **Data:** fetch the 8 metric endpoints for the focal's group once (cache by group+metric);
    `/companies/{symbol|cik}/peers` for the rail percentiles. `focalCik` persists across view
    switches (already in the store as `focalTicker` → rename/use `focalCik`).
  - **Honest empties:** a metric whose group returns `[]` renders an honest "no peer distribution"
    row (never a zero plot); a focal company with no profile/SIC → an honest "no peer group" state.

## Files
**Backend:** `storage/sector_company_repository.py` (+ sqlite), `normalize/schema.py`,
`api/routes.py` (endpoint + dep + caveats), `api/main.py` (wire + close), `tests/
test_sector_company_values.py`; docs `DATA_MODEL.md`, `CLAUDE.md`.
**Frontend:** `static/sector-analytics.html` (add `suggest.js`), `static/sectorapp.js` (Company view
+ search + `?symbol=`), `static/sectorapp.css`, `scripts/seed_fixture.py` (R4), `scripts/
headless_check.js` (shots). Docs `REDESIGN_SECTOR_APP.md`.

**R4 fixture:** seed a SIC group with **≥ `secfin_peer_min_size` companies** — `company_profiles`
(cik, sic, name) + `metric_values` (the R3 metrics, varied values, some `na` to prove exclusion) +
`metric_ranks` (percentile) — and make **one company resolvable by ticker** (so search + `?symbol=`
work; add to the suggest/ticker path). e2e uses `?view=company&symbol=<that ticker>`.

e2e shots: `sectorapp-company-empty` (`/sector-analytics?view=company` — search prompt),
`sectorapp-company` (`?view=company&symbol=<seed>` — rail + populated dot-plots + focal diamond),
`sectorapp-company-refocus` (click a peer dot → focal moves). Mobile covered by the existing 390px
check.

## AC → concrete check

| AC | Check |
|----|-------|
| AC-1 | Unit + endpoint: `/v1/sectors/{group}/net_margin/companies` returns `{cik,name,value,percentile}` per company, N/A rows absent. |
| AC-2 | Below-min group / no-values → `companies: []`, 200. |
| AC-3 | Unknown metric → 404; `unit` present on the list. |
| AC-4 | `pytest` covers list/exclusion/empty/404; grep: no DuckDB, no raw SQL in `routes.py`, repo interface used. |
| AC-5 | e2e `sectorapp-company-empty`: honest "search a ticker" state, no fabricated data. |
| AC-6 | e2e `sectorapp-company` (`?symbol=`): rail + composite card + per-metric dot-plots render for the focal's group. |
| AC-7 | Each row: IQR band + median tick + a dot per peer + the focal diamond at the focal's value (position matches). |
| AC-8 | Drive: click a peer dot → `focalCik` changes; rail/rank/diamonds recompute (`sectorapp-company-refocus`). |
| AC-9 | Drive: Company → Sector → Company keeps the focal. |
| AC-10 | Grep + computed styles: no favorability color; dots/bars neutral, focal diamond `--accent`; "lower is better" is a text marker. |
| AC-11 | Percentiles favorability-adjusted (invert for lower-is-better); N/A·N/M excluded; a no-distribution metric → honest empty row, never 0. |
| AC-12 | Caption states "each dot a filer · IQR · median · ◆ = <name>" + the favorability-adjusted/exclusion note. |
| AC-13 | No CDN/Tailwind/React; mobile 390px reflow, no overflow. |
| AC-14 | `docker compose build api` → e2e PASS + shots eyeballed; `pytest` green. |

## Handoff
Branch off `master` (`sector-app-company`), continuing the app. **Backend first:** repo (+ sqlite) →
schema → endpoint + dep + caveats → main wiring → pytest → docs; self-verify `pytest` green + curl
the contract. **Then frontend** (`/frontend-design:frontend-design` first for the dot-plot look
within the paper-terminal system, no color): `suggest.js` + search wiring + `?symbol=`, the Company
view (rail + rank + dot-plots + click-refocus), the R4 fixture, e2e shots; rebuild `api` + e2e, eyeball.

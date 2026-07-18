# Architecture: institutional-tab visualization suite

**Role:** Principal Architect → handoff to Senior Engineer
**Task slug:** `institutional-tab-viz`
**Input:** `1-brief.md` (four viz, augment not replace, all four scoped).
**Date:** 2026-07-18

---

## 0. Scope confirmation (Track 1 ✔)

All four are re-shapes of **structured 13F data we already ingest or fetch** — no HTML
scraping, no free text, no LLM, no price/market data. Confirmed live 2026-07-18:

- Manager location is present in data we **already fetch**: the 13F cover page
  (`primary_doc.xml` → `filingManager/address/stateOrCountry`, already downloaded for the
  co-filer roster) and `submissions.json addresses.business.stateOrCountry`.
- Co-holding / conviction inputs (every manager's full book) exist but are **cross-manager
  aggregates** → analytical/batch layer (guardrails 6 & 7), never the live request path.

**Charting stack — no new dependency.** `static/vendor/d3.min.js` already contains
`d3-force` (`forceSimulation/forceManyBody/forceLink/forceCenter`) **and** `d3-geo`
(`geoAlbersUsa/geoPath`); `plot.umd.min.js` has `geo` + `cell` marks and `albers-usa`.
The **only** new static asset is a **vendored US-states GeoJSON/TopoJSON** (CSP-safe,
inlined/served locally — no external fetch).

**Phasing (recommended, matches brief):**

| Phase | Viz | Cost | Store/analytical |
|---|---|---|---|
| **1** | (1) Accumulation series, (2) Choropleth | low/med, **live-servable** | reuses `holdings` + one new column; **no DuckDB** |
| **2** | (3) Conviction heatmap, (4) Co-holding network | high, **batch** | new materialized tables via DuckDB batch jobs |

Ship Phase 1 first as a self-contained PR; Phase 2 as a follow-on. Each phase is
independently shippable and passes QA on its own criteria.

---

## 1. Data flow per viz (which stages change)

```
                 sec/      normalize/   storage/        analytical/   api routes   static/
(1) accumulation  —          —            —                —           NEW ep       NEW builder
(2) choropleth    parse +   schema +     +col +migration   —           NEW ep       NEW builder + geojson
(3) conviction    —          —           NEW repo          NEW job     NEW ep       NEW builder
(4) co-holding    —          —           NEW repo          NEW job     NEW ep       NEW builder (d3-force)
```

No new **canonical GAAP concept** → `normalize/mapping.py` is **untouched** (guardrail 3
applies to GAAP tags; manager location is filing metadata, not a us-gaap fact). Data-model
**docs** still get updated (§7).

---

## 2. Phase 1 — Viz 1: Accumulation series (stacked shares over quarters)

**Nothing to ingest/store** — the `holdings` table already holds every ingested quarter.

**Serve — NEW endpoint** `GET /companies/{symbol}/institutional-holdings-series`
(`api/routes.py`, next to `get_institutional_holders`):
- Query: `quarters: int = Query(8, ge=1, le=20)`.
- Resolve `cik` → `cusips` (reuse `_cusips_for_issuer`).
- `periods = holdings_repo.issuer_periods(cusips)[:quarters]` (already newest-first).
- For each period: `holders_of(cusips, period)` (existing indexed point read). Assemble
  per-`(manager_cik, cusip)` a points array `[{period, shares, value}]`.
- Return `{cik, cusips, periods, series:[{manager_cik, manager_name, cusip, issuer_name,
  points:[…]}], caveats: _ISSUER_CENTRIC_CAVEATS}`.
- **No new store method** — pure composition of `issuer_periods` + `holders_of`. Bounded by
  `quarters`, so it stays a handful of the same indexed point reads the tab already does.

**Static — NEW builder** `ClearyFi.holdingsSeriesChart(...)` in `app.js` (§6: only app.js
calls `Plot.plot`); mounted by `company.js`:
- X = quarter (ordinal, oldest→newest). Y = **shares** (AC-1a). Stack by top-K holders (by
  latest shares) + an "Other" band, reusing the top-1/2–5/6–N/Other banding philosophy.
- A holder **absent in a quarter** → **gap**, drawn/labelled "not reported / not ingested"
  (AC-1b), never a zero segment.
- Caption (AC-1c): "Reported quarter-end shares (~45-day-lagged snapshots); quarter-over-
  quarter change is a **derived** inference, not reported trades." Single-quarter/empty
  fallback (AC-1d).

`company.js`: add a `holdingsSeriesSection()` to `institutionalView()` (a new section — the
existing Top-N `holdersSection` stays untouched, AC-R1). Fetch the new endpoint alongside
the existing two in `renderInstitutionalData()`'s `Promise.all`.

---

## 3. Phase 1 — Viz 2: Choropleth (filer business address)

### 3a. sec/ — parse the filing manager's state
`sec/institutional.py` `parse_cover_page_xml` currently returns only the co-filer roster.
Add a **pure** helper `parse_filing_manager_location(xml_bytes) -> str | None` (or fold into
one cover-page parse) that reads `formData/coverPage/filingManager/address/stateOrCountry`
(namespaces already stripped by `_strip_namespaces`). Returns the **raw code as reported**
(e.g. `"NE"`, or a country code) — **no classification in `sec/`** (client stays free of
business logic; is-foreign classification happens in normalize/serve). `fetch_13f_snapshot_
for_filing` sets the new field on the returned `HoldingsSnapshot`.

### 3b. normalize/schema.py — carry it (raw)
Add to `HoldingsSnapshot`: `filing_manager_location: str | None = None` — the raw
`stateOrCountry` code, stored as-reported (unit/identity rule: never reinterpret at
ingest). "US state vs foreign vs unknown" is derived at the serve/UI edge against a US-state
code set (a small constant in `normalize/`, e.g. `US_STATE_CODES`, reused by the endpoint).

### 3c. storage — one new column + migration
`holdings_snapshots` gets `filing_manager_location TEXT`:
- Add to `_SCHEMA` (new DBs) **and** an idempotent migration for existing DBs: check
  `PRAGMA table_info(holdings_snapshots)`; `ALTER TABLE … ADD COLUMN filing_manager_location
  TEXT` only if absent (same guarded-migration approach used elsewhere in `storage/`).
- `_UPSERT_SNAPSHOT_SQL` writes it; `get_snapshot` reads it back onto the model.
- **`holders_of`** SELECT adds `hs.filing_manager_location` (the join to `holdings_snapshots`
  is already there) → add `location: str | None` to **`IssuerHolder`** (`schema.py`). This is
  what the geography endpoint consumes.
- **Backfill:** existing cached snapshots have `NULL` location until re-ingested. That's an
  honest **"Location unknown"** bucket (AC-2b), not a bug. A re-run of
  `ingest/institutional_backfill.py` (already fetches the cover page) repopulates it. Flag to
  DevOps/data as a coverage note; do **not** block on a full re-ingest.

### 3d. serve — NEW endpoint
`GET /companies/{symbol}/institutional-holder-geography?period=…`:
- `holders = holders_of(cusips, period)`; group by `location`:
  - US state code (in `US_STATE_CODES`) → `by_state[state] += {filer_count, value}`.
  - non-US code → `outside_us` tally.
  - `None`/empty → `unknown` tally.
- Return `{cik, period, by_state:[{state, filer_count, value}], outside_us:{filer_count,
  value}, unknown:{filer_count, value}, caveats}`. **Primary measure = filer_count**
  (unit-safe); `value` is same-quarter only (AC-2c) — the endpoint serves one period, so the
  thousands/whole-dollars changeover never spans within a response.
- Small Python aggregation over one issuer's holders — **not** a DuckDB cross-manager scan
  (same scale as `holders_of`; guardrail 6 respected).

### 3e. static — NEW builder + vendored geojson
- Vendor `static/vendor/us-states.geojson` (or `.json` TopoJSON + `d3-geo`); document source
  + license in `vendor/README.md` (public-domain US Census cartographic boundaries).
- `ClearyFi.holderGeographyChart(byState, opts)`: `Plot.geo(features, {fill: filerCount…,
  projection:"albers-usa"})`, single-hue sequential scale (position, not verdict). **Title =
  "Reported business address of 13F filers holding {company}"** (AC-2a) — never "clusters of
  capital". Render the **Outside-US** and **Unknown** tallies as adjacent stat chips (AC-2b),
  never dropped. Empty/thin → honest empty state.
- `company.js`: `holderGeographySection(period)` added to `institutionalView()`.

---

## 4. Phase 2 — Viz 3: Conviction heatmap

**Definition (honest):** cell = *this issuer's reported value as a % of that holder's own
total reported 13F book, in the same quarter*. Because it is a **ratio within one filing**,
the thousands-vs-whole-dollars unit **cancels** — safe across the changeover (document this).
Grid = holders (rows) × last K quarters (cols); cell intensity = weight; **no "speculative"
label, no good/bad colour** (one hue, like `positionBar`) (AC-3a).

**analytical/ — NEW batch job** `analytical/manager_book_totals.py` (DuckDB over SQLite,
`ATTACH … (TYPE sqlite)`, mirrors `peer_ranks.py`): compute per `(manager_cik,
report_period)` the `total_value = SUM(value)` and `position_count` across **all** that
manager's holdings. Materialize via a new repo. (This total is also reused by Viz 4.)

**storage/ — NEW repo** `ManagerBookTotalsRepository` (+ SQLite impl), mirroring
`metric_rank_repository.py`: `bulk_upsert`, `clear`, `get_for_managers(ciks, period)`,
`count`, `close`. Table `manager_book_totals(manager_cik, report_period, total_value,
position_count, PRIMARY KEY(manager_cik, report_period))`.

**serve — NEW endpoint** `GET /companies/{symbol}/institutional-conviction?quarters=K`:
- For each of the last K `issuer_periods`: `holders_of` → join `get_for_managers` →
  `weight = holder.value / total_value`. `total_value` missing/≤0 → **`N/A`** for that
  cell (AC-3b), never a fabricated weight. Reads only **precomputed** totals — no live
  cross-manager scan (AC-3c, guardrail 6).

**static — NEW builder** `ClearyFi.convictionHeatmap(...)` (`Plot.cell`), N/A cells rendered
distinctly (not 0). `company.js`: `convictionSection()`.

---

## 5. Phase 2 — Viz 4: Co-holding network

**Definition (honest):** nodes = holders of this issuer; edge = **overlap in their *other*
reported holdings** as of the quarter-end snapshot — **not** coordinated/timed trading, **no
style labels** (AC-4a). To bound the O(pairs) cost, compute the network among the **top-N
holders by reported value** per issuer (e.g. N=25) — an honest scoping ("network among the
largest reported holders"), stated in the caption.

**analytical/ — NEW batch job** `analytical/coholding.py` (DuckDB over SQLite): for each
`(issuer_cusip, report_period)`, take its top-N holders, self-join their full books to count
**shared CUSIPs** per holder pair and a Jaccard ratio, emit pairs above a threshold.
Materialize via a new repo. This is the expensive job — offline, batch, DuckDB does the
join; **never** on the request path (guardrails 6 & 7).

**storage/ — NEW repo** `CoholdingEdgeRepository` (+ SQLite impl): table
`coholding_edges(cusip, report_period, manager_a, manager_b, shared_count, jaccard, PRIMARY
KEY(cusip, report_period, manager_a, manager_b))`; `bulk_upsert/clear/get_for_issuer(cusips,
period)/count/close`.

**serve — NEW endpoint** `GET /companies/{symbol}/coholding-network?period=…`: nodes =
`holders_of` (top-N), edges = `get_for_issuer` (precomputed point read, AC-4b). Thin/empty
overlap → honest empty state (AC-4c).

**static — NEW builder** `ClearyFi.coholdingNetwork(...)`: layout via vendored
`d3.forceSimulation` (client-side presentation; edges are precomputed server-side), render
SVG. `company.js`: `coholdingSection()`.

---

## 6. Invariants & guardrails checklist (for QA to re-verify)

- **CIK as int** — `manager_cik` int end-to-end; location keyed by `manager_cik`. ✔
- **Raw units** — location stored as reported `stateOrCountry` code; shares/value raw;
  conviction is a same-quarter ratio (unit cancels). No rescaling. ✔
- **Provenance** — location derives from the snapshot's own accession (already carried). ✔
- **DB behind interface, no raw SQL in API** — all reads via repos; new repos added. ✔
- **`sec/` free of business logic** — parser extracts the raw code only; is-foreign
  classification lives in normalize/serve. ✔
- **DuckDB batch-only** — Phase 2 jobs are batch; serve reads materialized tables. Phase 1
  geography is a per-issuer Python aggregation at `holders_of` scale, **not** DuckDB. ✔
- **Single-writer backfill** — location is a field on `HoldingsSnapshot`, already routed
  through the one writer; parsers never open the DB (guardrail 8). ✔
- **Single-process / rate limiter** — no new workers; new endpoints construct `SECClient()`
  only for `_cik_from_symbol`, same as siblings. ✔

**No STOP conditions hit** — no Track 2, no base-install dependency (DuckDB stays the
`analytical` extra; d3-force/d3-geo already vendored), no SEC-compliance change.

---

## 7. Data-model / docs updates (required — guardrail 3 sibling)

- `docs/DATA_MODEL.md` Institutional section: add (a) `filing_manager_location` + its **honest
  meaning** — filer's reported business address, *not* capital origin, *not* issuer location;
  (b) the four derived views + caveats; (c) the conviction-ratio unit-cancellation note.
- `docs/ARCHITECTURE.md` §3b: add `manager_book_totals` and `coholding` to the analytical-job
  inventory (alongside `peer_ranks`).
- `CLAUDE.md` repo-layout block: add the new `analytical/` modules and `storage/` repos.
- Public-facing labels (titles/captions/tooltips): load `.claude/skills/marketing-guardrails`
  before finalizing — the honest-titling ACs (2a/3a/4a) are the point.

---

## 8. Ordered implementation plan

**Phase 1 (one branch/PR):**
1. `sec/institutional.py`: `parse_filing_manager_location` + set field in
   `fetch_13f_snapshot_for_filing`. Unit test with a real cover-page fixture (Berkshire).
2. `schema.py`: `HoldingsSnapshot.filing_manager_location`, `IssuerHolder.location`.
3. `sqlite_holdings_repository.py`: `_SCHEMA` column + guarded `ALTER TABLE` migration;
   upsert/get_snapshot/holders_of read+write it. Repo tests (incl. migration on an
   old-shape DB, and NULL→unknown).
4. `routes.py`: `institutional-holdings-series` + `institutional-holder-geography` endpoints
   (+ OpenAPI examples + caveats). Route tests.
5. `normalize/`: `US_STATE_CODES` constant + is-foreign classifier used by the geo endpoint.
6. `static/vendor/us-states.geojson` + `vendor/README.md` source/license line.
7. `app.js`: `holdingsSeriesChart` + `holderGeographyChart` builders.
8. `company.js`: two new sections wired into `institutionalView()`/`renderInstitutionalData`
   (Top-N section untouched, AC-R1).
9. Docs: DATA_MODEL + CLAUDE.md layout.

**Phase 2 (follow-on branch/PR):**
10. `storage/`: `ManagerBookTotalsRepository` + `CoholdingEdgeRepository` (+ SQLite impls,
    tests).
11. `analytical/manager_book_totals.py` + `analytical/coholding.py` (DuckDB batch jobs,
    `analytical` extra). Job tests behind the extra.
12. `routes.py`: `institutional-conviction` + `coholding-network` endpoints (read precomputed
    only). Route tests.
13. `app.js`: `convictionHeatmap` + `coholdingNetwork` builders.
14. `company.js`: two more sections.
15. Docs: ARCHITECTURE §3b + DATA_MODEL conviction/coholding + CLAUDE.md layout; add the two
    batch commands to "Common commands".

---

## 9. Test strategy

- **Unit (pure, no network):** `parse_filing_manager_location` (real fixture); geo
  aggregation (state/outside-US/unknown bucketing incl. NULL); conviction ratio incl.
  missing-total→N/A; co-holding pair/Jaccard math.
- **Repo:** migration idempotency (old DB gains column; re-run is a no-op); `holders_of`
  carries location; new batch repos' upsert/clear/get round-trip.
- **Route:** each endpoint's shape, `caveats` always present, empty-period → honest empty (not
  error), single-quarter series, N/A rendering.
- **e2e (Docker headless-Chromium):** company Institutional tab renders all sections in
  light+dark, no console errors, empty-state paths (AC-H4).
- `pytest` + `docker compose --profile e2e` green (AC-R2).

---

## 10. Open decisions (engineer/operator)

1. **Location backfill scope.** Existing cached snapshots need a re-ingest to populate
   location (choropleth otherwise mostly "Unknown"). Recommend Phase-1 ships with the
   Unknown bucket honest, and DevOps schedules an `institutional_backfill` re-run — **operator
   call on timing**, not a code blocker.
2. **Quarter coverage** for the series/network richness — engineer should report current
   ingested-quarter counts for the launch ticker basket; thin coverage is a data-ingest call.
3. **Co-holding top-N bound** (default 25 largest holders) — confirm N with the operator; it
   trades completeness for bounded batch cost.
4. **Conviction grid columns** — last K quarters (default 6). Confirm K.
5. **GeoJSON granularity** — US states + an Outside-US aggregate chip (no world map).
   Confirm we are **not** asked for a world choropleth (would need country polygons + a
   different projection).

---

## Handoff → Senior Engineer

Build **Phase 1 first** as a self-contained branch (Viz 1 + Viz 2), following §8 steps 1–9
and the invariants in §6. Every acceptance criterion in `1-brief.md` maps to a concrete
check in §9. Do **not** start Phase 2 in the same branch — it introduces the `analytical`
extra and two batch stores and should land as its own reviewable PR. Flag open decisions
§10.1–10.5 to the operator if they block you; otherwise take the stated defaults.

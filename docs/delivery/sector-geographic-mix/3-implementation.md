# P6b — Sector Geographic revenue mix — Backend implementation handoff

Stage 3 (Senior Backend Engineer) handoff. Branch: `sector-geographic-mix` (off `master` @ b0a12ba).
Backend is complete, tested, and self-verified against a live server. **Next: Senior Frontend
Engineer** wires `sectorapp.js`'s `geoPlaceholderHtml()` to the endpoint below, on this same branch.

## What changed (backend)

New source (DERA dimensional XBRL) → raw store → geography normalization → pure-Python rollup →
materialized store → read endpoint. Mirrors the P6a insider-flow shape throughout.

- **Ingest** `src/secfin/ingest/dimensional_backfill.py` (+ `downloader.download_dera_quarter` and
  `DERA_FSDS_URL_TEMPLATE`): bounded ingest of ASC 280 geographic revenue from DERA quarterly ZIPs
  → `dimensional_geo_facts`. Single writer; reuses the canonical `revenue` candidate tags; keeps
  only the geography axis on a revenue tag (annual, current-year), drops eliminations/corporate,
  keeps the consolidated total for reconciliation.
- **Normalize (the moat)** `src/secfin/normalize/segment_geography.py`:
  `classify_geography_member(member) -> "domestic"|"international"|"other"`. Documented rule tables;
  exact US matching; `other` shown not dropped; separate from `geography.classify_location`.
- **Rollup batch** `src/secfin/analytical/sector_geographic_mix.py` (**pure Python, no DuckDB**):
  per-company reconcile-or-exclude + revenue-weighted per-SIC-group dollar sums + coverage →
  `sector_geographic_mix`.
- **Stores** `storage/dimensional_geo_repository.py` (+ sqlite) and
  `storage/sector_geographic_mix_repository.py` (+ sqlite).
- **Serve** schema `GeographicMixBuckets` + `SectorGeographicMix` (`normalize/schema.py`); endpoint
  `GET /v1/sectors/{group}/geographic-mix` (`api/routes.py`, `_GEO_MIX_CAVEATS`); repo wired into
  `api/main.py` lifespan.
- **Config** `secfin_geo_mix_reconcile_tolerance = 0.01`.
- **Fixtures** `scripts/seed_fixture.py` `_seed_sector_geographic_mix` — groups **35 / 73 / 60**
  populated (US-heavy / internationally-exposed / domestic-dominant), group **28 left empty** →
  exercises the honest N/A card. Runs in the offline/e2e profile (no DERA download needed).
- **Docs** `docs/DATA_MODEL.md` (new "Dimensional geographic revenue (ASC 280)" section),
  `CLAUDE.md` (repo layout + two Common Commands).

## JSON contract for the frontend — `GET /v1/sectors/{group}/geographic-mix`

Path param `group` = the SIC prefix (e.g. `35`), same as the sibling `/sectors/{group}/*` endpoints.
Always **200** (a missing/uncovered group is an honest empty payload, not a 404 — mirror `insiderFlow`).

**Populated** (verified live, seed group 35):
```json
{
  "group": "35",
  "group_label": "Industrial & Commercial Machinery & Computer Equipment",
  "peer_basis": "SIC 2-digit",
  "fiscal_year": 2025,
  "unit": "USD",
  "has_data": true,
  "derived": true,
  "mix": {
    "domestic": 620000000.0, "international": 350000000.0, "other": 30000000.0,
    "domestic_share": 0.62, "international_share": 0.35, "other_share": 0.03
  },
  "company_count": 9,
  "companies_in_scope": 14,
  "excluded_unreconciled_count": 2,
  "revenue_covered_share": 0.71,
  "as_of": "2026-07-24",
  "caveats": ["Sector geographic mix is a DERIVED, revenue-weighted aggregate ...", "... (4 total)"]
}
```

**Empty / honest N/A** (verified live, group 28): `has_data: false`, `mix: null`,
`fiscal_year: null`, `as_of: null`, `revenue_covered_share: null`, `company_count: 0`, `derived:
true`, and the **caveats still present**.

**Field notes for rendering:**
- `mix.*_share` are fractions in [0,1] and **sum to ~1** (`other` is included — show it, don't hide
  the remainder). Multiply by 100 for a %. Guard against `mix === null` (N/A state).
- `revenue_covered_share` is a fraction → the "X% of sector revenue covered" coverage line. It is
  `null` when `has_data` is false.
- `company_count` = covered companies; `companies_in_scope` = companies we ingested a total for;
  `excluded_unreconciled_count` = companies dropped for not reconciling. Useful for a hover/subline.
- **N/A never 0%**: when `has_data` is false, render an explicit N/A state — never `0%` bars.
- **Value-neutral**: geography is not good/bad — **no green/red** verdict coloring (match
  `insiderCardHtml`). Label the figure **derived / revenue-weighted**; the 4 `caveats` should be
  reachable (e.g. a `title=` hover on the foot, like the insider card).

## How to see it locally (frontend e2e / eyeballing)

The offline/e2e profile seeds the demo rows, so the card renders without any DERA download:
```
docker compose --profile e2e up --abort-on-container-exit --exit-code-from e2e   # headless shots
# or hit the running e2e-app: GET /v1/sectors/35/geographic-mix (populated), /28 (N/A)
```
The frontend fetch should mirror the existing `state.insiderFlow` block in `sectorapp.js`
(lazy-fetch per selected group; on fetch failure cache `{has_data:false, _error:true}` so it renders
N/A, never 0%).

## Verification evidence

- `pytest` (Docker): **551 passed, 9 skipped** (skips are pre-existing DuckDB-gated insider tests);
  new `tests/test_sector_geographic_mix.py` = **30 tests** (classifier, repo, ingest-from-fixture-zip,
  rollup reconcile/coverage, endpoint contract + N/A). No network in any test.
- `ruff check` clean on all new/changed files (line-length 100; the `B008 Depends` notices in
  `routes.py` are the pre-existing FastAPI idiom used by every sibling endpoint — my endpoint matches).
- **Live server** (real uvicorn, seeded fixture DB): `GET /v1/sectors/35/geographic-mix` →
  `has_data:true`, mix shares 0.62/0.35/0.03 (sum 1.0), coverage 0.71, counts 9/14/2, derived + 4
  caveats; `GET /v1/sectors/28/geographic-mix` → honest N/A (`has_data:false`, `mix:null`).

## Notes for QA (stage 4) and the operator

- **D-6 (ops, not a build gate):** prod shows real figures only after the DERA ingest + rollup run
  (`dimensional_backfill --quarter … && sector_geographic_mix`); until then the card reads honest
  N/A. The e2e/offline profile is seeded, so QA and the 4b hands-on gate see populated + N/A cards
  without a network fetch.
- The labeled static "Segments · spike" (`/explorer`, `spike_dimensional.json`) is **untouched**.
- Restatement handling in the rollup uses **latest accession per company** as a proxy for latest
  filed (documented in `sector_geographic_mix.py`); acceptable for the bounded annual scope.

---

## Frontend implementation (Senior Frontend Engineer — same branch)

Wired the Sector-view **Geographic revenue mix** card to the endpoint above; the placeholder is gone.

**What changed (`src/secfin/api/static/`):**
- `sectorapp.js`: added `state.geoMix`; a lazy fetch of `/sectors/{group}/geographic-mix` in the
  same drill-ensure block as `insiderFlow` (fetch failure caches `{has_data:false,_error:true}` →
  renders N/A, never 0%); replaced `geoPlaceholderHtml()` with a real `geoCardHtml()` (+ helpers
  `geoSegHtml`, `geoLegendRow`); `geoInsiderRowHtml` now composes two real cards.
- `sectorapp.css`: `.pa-geo-bar` + segment/legend/foot styles. **Value-neutral by design** — a
  single accent family (domestic solid `var(--accent)`, international `color-mix(accent 38%, card)`)
  plus a **hatched `other/unclassified`** (a residual, shown not hidden), **never green/red**
  good-bad coloring (geography is a category, not a verdict — matches the sibling insider card).
- `scripts/seed_fixture.py`: `_seed_sector_geographic_mix` — groups 35/73/60 populated, 28 empty
  (so the e2e exercises both the real card and the honest N/A). `scripts/headless_check.js`: comments
  updated (geo is real now; group-28 shot exercises the geo N/A too).

**The card (wider 3fr column of `.pa-geo-row`):** head (`ASC 280 · FY{year} · {coverage}% of revenue
covered`) · a stacked bar · a 3-row legend (swatch + label + share% + USD amount) · a
`{covered} of {in-scope} companies disclosed · {n} excluded (unreconciled)` subline · a
`Derived rollup · revenue-weighted · ASC 280` foot with the full `caveats` in the `title=` hover.
N/A state: an honest inline "No ASC 280 geographic disclosure ingested … Shown as N/A, not zero."

**Verification:**
- `docker compose build api` then the e2e headless render check
  (`docker compose --profile e2e up --abort-on-container-exit --exit-code-from e2e`): the geo-card
  shots **`sectorapp`** (populated group 73/Business Services) and **`sectorapp-insider-na`** (group
  28, geo N/A) both rendered **errors=0** (CSP-strict — an asset/CSP/JS error fails the check).
- **Eyeballed both screenshots** (`data/e2e-shots/sectorapp.png`, `sectorapp-insider-na.png`):
  populated card shows the stacked bar + legend (41%/54%/5%, `$410M/$540M/$50M`), "63.0% of revenue
  covered", "7 of 12 companies disclosed · 1 excluded", derived foot — sitting cleanly beside the
  insider card; the N/A card reads the honest empty state, never 0%. Value-neutral (no green/red).
- `pytest` still **551 passed, 9 skipped** (seed_fixture change is import-clean; ran in the e2e).

**Known non-blocker (unchanged from P6a's QA):** the overall `HEADLESS CHECK` still exits FAIL, but
**only** on `sectorapp-company` (errors=8) and `sectorapp-company-refocus` (errors=14) — the
Company-view shots for **synthetic** cik 900001, whose `/v1/companies/900001/metrics/{m}/history`
cache-misses → SEC fetch → **502 in the no-network sandbox** (a graceful 404 with network). Identical
shots + error counts as recorded in `docs/delivery/sector-insider-flow/4-qa.md` §"Pre-existing,
unrelated e2e failure"; a frontend change + a store-read endpoint cannot make that backend endpoint
502. QA should re-run the e2e networked, or drive the seeded app directly (both geo states verified
above).

## Handoff → QA Tester

Branch `sector-geographic-mix` is full-stack complete and self-verified (pytest + live endpoint +
e2e render + eyeball). Probe areas: the domestic/international/**other-shown** split and shares
summing to 100%; **N/A vs 0%** (group 28); the coverage figures + excluded count; value-neutral
coloring (no green/red); both light/dark themes; the derived label + caveats hover; and that the
labeled static "Segments · spike" (`/explorer`) is untouched. The JSON contract + how-to-drive are
documented above.

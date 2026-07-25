# P6b — Sector Geographic revenue mix (ASC 280) — Architecture & implementation plan

Stage 2 (Principal Architect) handoff. Task slug: `sector-geographic-mix`.
Designs against `1-brief.md`'s ACs. Reads: `CLAUDE.md` (guardrails), `SPIKE_DIMENSIONAL.md` (source (a)
DERA proven + blockers), the P6a precedent (`sector_insider_flow` repo/batch/route/card — the pattern
to copy), `ARCHITECTURE.md` §3b (operational vs analytical store split).

## Scope re-check (Track-1, buildable) — PASS

- **Track 1.** ASC 280 geographic revenue is *structured XBRL* served in the DERA num.txt `segments`
  column — not Track-2 free text. No LLM, no narrative. ✅
- **No new base dependency.** DERA ingest uses `httpx` + stdlib `zipfile`/`csv` (already used by the
  spike script). The rollup batch is **pure-Python** (no DuckDB, no `analytical` extra) — see §4. ✅
- **SEC compliance intact.** The DERA download reuses `ingest/downloader.py`'s `download_resumable`
  (User-Agent guard already inside it) — no throttle change, and ingest is offline/batch. ✅
- **Spike gate resolved** in the brief; operator's two forks locked: binary domestic/international +
  `other`; bounded latest-annual ingest. Source (a) DERA. ✅

No scope drift to flag. The one thing to hold the line on: **geography-revenue-scoped slice only** —
do NOT build the general `dimensional_facts` store from the spike sketch, and do NOT ingest business
segments / products / non-revenue dimensions. Store just what this card needs (D-1 → narrower slice).

## Data flow (one picture)

```
  ingest (NEW)                normalize (NEW)          store (NEW x2)         serve
  -----------                 ---------------          --------------         -----
  DERA quarterly ZIPs   -->   segment_geography    -->  dimensional_geo   -->  (batch reads it)
  num.txt/sub.txt             .classify_member()        _facts (raw rows)
  (bounded, ~4-8 q)              |                          |
  single-writer parse           |  reconcile-or-exclude     |  pure-Python rollup batch
  keep geo-axis revenue         |  + revenue-weighted       v  (analytical/, offline)
  rows + consolidated row       |  sector rollup       sector_geographic_mix  --> GET /v1/sectors/
                                                        (materialized)             {group}/geographic-mix
                                                                                       |
                                                                             sectorapp.js geoCard
```

Two stores, mirroring P6a exactly: a **raw** dimensional store (like `insider_transactions`) that the
ingest writes and the batch reads, and a **materialized** per-sector store (like `sector_insider_flow`)
that the batch writes and the endpoint reads as point lookups. **No DuckDB anywhere; no raw SQL in the
API.**

---

## Stage-by-stage plan

### 1. Store — raw dimensional-geo facts  ·  `senior-backend-engineer`

New repository (interface + SQLite impl), mirroring `holdings_repository` / `insider_repository`:

- **`src/secfin/storage/dimensional_geo_repository.py`** (abstract `DimensionalGeoRepository`):
  - `DimensionalGeoRow` (NamedTuple): `cik:int, accession:str, tag:str, ddate:str, qtrs:str,`
    `member:str|None, value:float, unit:str, is_consolidated:bool, fiscal_year:int, form:str`.
    `member=None` + `is_consolidated=True` is the non-dimensional total row (for reconciliation).
  - `bulk_upsert(rows)`, `iter_rows()` (or `rows_for_annual(fiscal_year)` — the batch reads all geo
    rows for the target annual basis), `count()`, `clear_accession(accession)` idempotency, `close()`.
- **`src/secfin/storage/sqlite_dimensional_geo_repository.py`**: own WAL connection, same db file.
  Table `dimensional_geo_facts`, PK `(cik, accession, tag, ddate, qtrs, member)` (member `''` for the
  consolidated row so it's PK-safe), index on `(fiscal_year)`. Idempotent upsert (re-ingesting a
  quarter must not duplicate). **CIK stored as int; value in raw reported unit; provenance
  (accession, tag, member) preserved** (invariants).

**Checks:** insert/read round-trip; re-ingest of the same accession is idempotent; a consolidated
(`member=''`) row and its dimensional siblings coexist under the PK.

### 2. Ingest — bounded DERA dimensional backfill (single-writer)  ·  `senior-backend-engineer`

- **`src/secfin/ingest/downloader.py`**: add `DERA_FSDS_URL_TEMPLATE =
  "https://www.sec.gov/files/dera/data/financial-statement-data-sets/{quarter}.zip"` and
  `download_dera_quarter(data_dir, quarter) -> Path` (one call to the existing `download_resumable`,
  which already enforces the User-Agent). No new download machinery, no throttle change.
- **`src/secfin/ingest/dimensional_backfill.py`** (NEW): the productized, bounded version of
  `scripts/spike_dimensional_extract.py`'s proven logic (reuse its `parse_axes`, the
  `ConsolidationItems`/`OperatingSegments` filter, and the `qtrs=="4"` annual rule):
  1. Determine the target **quarters** and **fiscal year(s)** — from CLI args (`--quarter 2025q4
     --quarter 2026q1 …`) with a sensible default of the latest ~4–8 quarters (D-2). Download each
     via `download_dera_quarter`.
  2. For each ZIP: read `sub.txt`, keep `adsh` rows whose `form ∈ {10-K, 10-K/A}` (annual) → build
     `adsh → (cik, fiscal_year, form)`. Then **stream** `num.txt` once:
     - Keep a row iff `tag ∈` the **revenue candidate list** (`normalize/mapping.py`'s `"revenue"`
       entry — reuse it, do not hardcode; tag variance persists in dimensions, spike blocker #3) and
       `qtrs == "4"` (annual duration).
     - **Geography rows:** `segments` parses (via `parse_axes`) to exactly `{Geographical}` (plus a
       tolerated `ConsolidationItems`), and the `ConsolidationItems` qualifier is `None` or
       `OperatingSegments` (drop eliminations/corporate — AC-2). Emit a `DimensionalGeoRow` with the
       raw `member`, `is_consolidated=False`.
     - **Consolidated row:** `segments` empty (no dimensions) on the same revenue `tag`/`ddate`/`qtrs`
       → emit `is_consolidated=True, member=''` (the reconciliation denominator, AC-5).
  3. **Single-writer (guardrail 8):** the ZIP parse produces rows; **exactly one writer** owns the
     `DimensionalGeoRepository` connection and does the `bulk_upsert`. For the bounded scale (a
     streamed filter of a few `num.txt` files, ≈60–90s each per the spike) a single sequential
     process that parses-then-writes is sufficient — no multiprocessing pool needed. If a pool is
     ever added, route writes through one writer like `ingest/backfill.py`. Parsers never open the DB.
  - CLI: `python -m secfin.ingest.dimensional_backfill --quarter 2025q4 [--quarter …]`. Idempotent
    (re-run overwrites by accession). Add it to CLAUDE.md "Common commands".

**Checks:** a fixture `num.txt`/`sub.txt` slice (a handful of rows, committed under `tests/fixtures/`)
ingests to the expected geo rows + consolidated row; reconciling/elimination rows are dropped; a
non-revenue tag is ignored; re-run is idempotent. **Do NOT hit the network in tests** — parse a local
fixture ZIP/TSV (mirror how the spike script consumes a zip path).

### 3. Normalize — geography member classifier (the moat)  ·  `senior-backend-engineer`

- **`src/secfin/normalize/segment_geography.py`** (NEW — deliberately separate from
  `geography.py`'s `classify_location`, which buckets a **13F filer's HQ** state/country, a different
  domain from an **ASC 280 revenue member**; do not overload it):
  - `classify_geography_member(member: str) -> Literal["domestic","international","other"]`.
  - **Documented rules** (AC-4): a curated set — US/`UnitedStates`/`US`/`Domestic`/`UnitedStatesMember`
    families → `domestic`; a recognized non-US country/region token (a documented set: country codes
    + names + common regions like `NonUs`, `International`, `EMEA`, `Europe`, `A.Pacific`, `Americas`,
    `China`, …) → `international`; anything unrecognized, ambiguous, or non-geographic → `other`. The
    token normalization reuses the spike's `re.sub(r"(Segment|Member)$", "")` shortening. Keep the
    rule tables as module-level constants with a docstring stating the taxonomy (principled, not
    ad-hoc). **`other` is disclosed, never dropped.**
  - This is where the binary-vs-region decision lives: `international` is a single bucket (locked
    decision), NOT split into regions.

**Checks:** table-driven unit tests — a US member → `domestic`; a foreign-country member →
`international`; an unmappable/region-rollup member → `other`; case/`Member`-suffix variants normalize.

### 4. Analytical — per-sector revenue-weighted rollup batch (offline)  ·  `senior-backend-engineer`

- **`src/secfin/analytical/sector_geographic_mix.py`** (NEW) — **PURE-PYTHON**, no DuckDB (like
  `analytical/sector_theme_scores.py`; the bounded row count doesn't warrant DuckDB, and the
  classifier is Python anyway). Still offline/batch, **never the request path** (guardrail 6):
  1. Read all annual geo rows for the target `fiscal_year` from `DimensionalGeoRepository`; read the
     `cik → SIC` map from `CompanyProfileRepository`. Join **in Python** (no cross-repo raw SQL,
     guardrail 5).
  2. **Per company:** pick its latest-annual 10-K disclosure (dedupe by `(cik, fiscal_year)`, latest
     `accession`/`ddate` wins — restatements: latest filed wins, invariant). Bucket each dimensional
     member via `classify_geography_member`; sum into `domestic/international/other` dollars. Read its
     `is_consolidated` total.
     - **Reconcile-or-exclude (AC-5):** if `abs((dom+intl+other) - consolidated) / consolidated >
       tolerance` (D-4, recommend 1%, config-driven), the company is **excluded** and counted in
       `excluded_unreconciled_count` — it never enters the sector sums. A company with a consolidated
       row but no usable geo members is likewise not counted as covered.
  3. **Per SIC group (revenue-weighted rollup, AC-6):** sum each bucket's **dollars** across the
     reconciled companies in the group (dollar-summing, NOT average-of-ratios — D-5; larger companies
     naturally weigh more). `shares` = each bucket / (dom+intl+other), so **domestic + international +
     other = 100%** (the `other` remainder is shown, D-4).
  4. **Coverage (AC-7):** `companies_covered` = distinct reconciled companies in the group;
     `companies_in_scope` = distinct CIKs in that SIC group **that we ingested a consolidated revenue
     row for** (the honest denominator for a *bounded* ingest — "of what we ingested", not the whole
     universe we didn't); `revenue_covered_share` = Σ covered consolidated revenue / Σ in-scope
     consolidated revenue. All self-contained in the two stores — no join to raw_facts needed.
  5. **Write** `sector_geographic_mix` via its repository (`clear()` then `bulk_upsert()`, full
     recompute like P6a so a sector that lost coverage doesn't linger). A group with **zero** covered
     companies produces **no row** → endpoint renders honest N/A (AC-9).
  - CLI: `python -m secfin.analytical.sector_geographic_mix --fiscal-year 2025 [--sic-digits 2]`.
    Add to CLAUDE.md "Common commands".

- **`src/secfin/storage/sector_geographic_mix_repository.py`** + **`sqlite_…`** (NEW; mirror
  `sector_insider_flow_repository` — D-1 store shape):
  - `SectorGeographicMixRow`: `peer_group:str, fiscal_year:int, domestic:float, international:float,`
    `other:float, unit:str, company_count:int, companies_in_scope:int,`
    `excluded_unreconciled_count:int, revenue_covered_share:float, as_of:str`.
  - Table `sector_geographic_mix`, PK `(peer_group, fiscal_year)`; `get(peer_group,
    fiscal_year=None→latest)`, `latest_fiscal_year()`, `bulk_upsert`, `clear`, `count`, `close`.

**Checks:** a synthetic set of per-company geo rows across 2–3 companies in one SIC group rolls up to
the expected dollar sums + shares summing to 100%; an unreconciled company is excluded and counted; a
group with no coverage yields no row; coverage ratio computes as specified.

### 5. Serve — endpoint + schema  ·  `senior-backend-engineer`

- **`src/secfin/normalize/schema.py`**: add (next to `SectorInsiderFlow`):
  - `GeographicMixBuckets(BaseModel)`: `domestic/international/other: float|None` (amounts) +
    `domestic_share/international_share/other_share: float|None` (0–1), all `None` when `has_data=False`.
  - `SectorGeographicMix(BaseModel)`: `group, group_label, peer_basis, fiscal_year:int|None,`
    `unit:str="USD", has_data:bool=False, mix:GeographicMixBuckets|None=None,`
    `company_count:int=0, companies_in_scope:int=0, excluded_unreconciled_count:int=0,`
    `revenue_covered_share:float|None=None, as_of:str|None=None, caveats:list[str]=[]`. Docstring states
    the empty (`has_data=False`) case is an honest N/A, never a fabricated 0%/100% (AC-9, AC-14).
- **`src/secfin/api/routes.py`**: `GET /sectors/{group}/geographic-mix` on `public_router`, mirroring
  `get_sector_insider_flow` exactly — `Depends(get_sector_geographic_mix_repo)`, point lookup, build
  `peer_basis` from `settings.secfin_peer_sic_digits`, `sic2_label(group)`, `has_data=False` payload
  (with caveats) when `repo.get(group)` is None. A module-level `_GEO_MIX_CAVEATS` list carries the
  three brief caveats (coverage / normalization / reconciliation — AC-15). **No SEC fetch, no DuckDB,
  no raw SQL** (guardrails 5, 6).
- **`src/secfin/api/main.py`**: wire `app.state.sector_geographic_mix_repo =
  SQLiteSectorGeographicMixRepository(settings.secfin_db_path)` in lifespan startup + `.close()` in
  shutdown (mirror the insider-flow repo lines 45, 173, 191).
- **`src/secfin/config.py`**: add `secfin_geo_mix_reconcile_tolerance: float = 0.01` and (optional)
  a default DERA-quarters helper if not fully CLI-driven.

**Checks (pytest, `tests/test_sector_geographic_mix_route.py`):** 200 with a materialized row → full
contract incl. shares summing to ~1.0 and coverage fields; a group with no row → `has_data=False`,
`mix=None`, caveats present, **never 0%**; an unknown group behaves like the sibling endpoints (AC-10).

### 6. Frontend — wire the Geographic revenue mix card  ·  `senior-frontend-engineer`

Same branch, **after** the endpoint is green. In `src/secfin/api/static/sectorapp.js`:

- **State + fetch** (mirror `insiderFlow`, lines 36 + 203–208): add `geoMix: {}` to `state`; in the
  drill-ensure block, lazy-fetch `/sectors/{group}/geographic-mix` → `state.geoMix[g]`; a fetch
  failure caches `{ has_data:false, _error:true }` so we render N/A, never 0% (AC-12).
- **Replace `geoPlaceholderHtml()`** (lines 1004–1012) with a real `geoCardHtml()` consuming
  `state.geoMix[g]`, and update `geoInsiderRowHtml` (line 999 comment) — geo is now real too. The card
  (mirror `insiderCardHtml` styling — solid `.pa-card`, **value-neutral**: geography is not good/bad,
  so **no green/red** verdict color, AC-11):
  - Head: `Geographic revenue mix` · hint `ASC 280 · FY{year} · {coverage}% of sector revenue covered`.
  - Body when `has_data`: domestic / international / other rows showing each **share (%)** (a simple
    stacked bar or three labelled rows — frontend's call within STYLE_GUIDE; the preview mock in the
    brief is the target). The `other` remainder is **shown**, not hidden (AC-15).
  - Body when `!has_data`: honest inline N/A ("No ASC 280 geographic disclosure ingested for this
    sector yet — shown as N/A, not zero"). Loading + `_error` handled (no bare `undefined`/`NaN`).
  - Foot: `Derived rollup · revenue-weighted · ASC 280 · coverage varies` with the payload's full
    `caveats` in the `title=` hover (mirror `insiderCardHtml`'s foot, AC-14).
- Use the shared `P.fmt`/`P.esc` helpers; theme-aware + CSP-safe are inherited from the app shell.

**Checks:** Docker e2e headless render (add/extend the sector-view shot) shows the real card for a
populated sector and the N/A state for an empty one; no external assets; light/dark both legible.

### 7. Docs  ·  `senior-backend-engineer` (with the backend change)

- **`docs/DATA_MODEL.md`**: a new "Dimensional geographic revenue (ASC 280)" section — the DERA
  source, the geography-revenue-scoped store, the **domestic/international/other bucketing rules**
  (the moat, documented per AC-4), the reconcile-or-exclude rule, and the revenue-weighted rollup +
  coverage definition. (No `mapping.py` change: we *reuse* the existing `revenue` candidate list, we
  don't add a canonical concept — so guardrail 3's mapping+DATA_MODEL pairing reduces to the
  DATA_MODEL note here.)
- **`CLAUDE.md`**: repo-layout entries for the four new modules + two new repos; two new "Common
  commands" (`dimensional_backfill`, `sector_geographic_mix`).
- **`docs/ROADMAP_SECTOR_APP_V2.md`** / `ROADMAP_DATA_DEPTH.md`: mark P6b built (Phase 3 productized
  for geography via source (a), bounded).

---

## Acceptance criteria → concrete checks (for QA)

| AC | Check |
|----|-------|
| AC-1 dimensional store + provenance | `test_dimensional_geo_repository` round-trips a geo row with member/tag/accession/unit; CIK int |
| AC-2 reconciling filter | ingest fixture: an `OperatingSegments`/unqualified row kept, an eliminations/corporate row dropped; naive double-count avoided |
| AC-3 single-writer + bounded | code review: parsers don't open DB; ingest runs from a fixture without the whole-market backfill |
| AC-4 classifier documented | `test_segment_geography`: US→domestic, foreign→international, unmappable→other; rules in module, not inline literals |
| AC-5 reconcile-or-exclude | batch test: a company off by >1% is excluded + counted in `excluded_unreconciled_count` |
| AC-6 revenue-weighted SIC rollup | batch test: dollar sums across a group; grouped by `SIC {n}-digit` from `company_profiles`; no-SIC company excluded, no crash |
| AC-7 coverage recorded | batch test: `companies_covered`/`companies_in_scope`/`revenue_covered_share` computed; batch offline |
| AC-8 endpoint contract | route test: 200 payload has group/peer_basis/period/mix(amounts+shares)/coverage/counts/as_of; shares ~sum to 1 |
| AC-9 honest empty | route test: no row → `has_data:false`, `mix:null`, caveats, **never 0%** |
| AC-10 unknown group | route test: matches sibling `/sectors/{group}/*` semantics |
| AC-11 real card, value-neutral | e2e shot: dom/intl/other split + coverage + FY label; no green/red verdict color |
| AC-12 N/A never 0% | e2e shot: empty sector renders N/A; loading/error handled |
| AC-13 theme-aware/CSP/style | e2e light+dark; no external assets; matches `.pa-geo-row` sibling |
| AC-14 derived label | card foot + endpoint docstring say derived, revenue-weighted rollup |
| AC-15 caveats present | endpoint `caveats` (coverage/normalization/reconciliation); `other` shown not hidden |
| AC-16 aggregate only | card shows no per-company geo split |
| AC-17 regression | `pytest` green; static "Segments · spike" + sibling sector endpoints unchanged |
| AC-18 SEC compliance | DERA download sends User-Agent (reuses `download_resumable`); no throttle change; batch offline |

## Open decisions resolved here (from the brief's D-list)

- **D-1** → geography-revenue-**scoped** slice now (`dimensional_geo_facts`), NOT the general
  `dimensional_facts` store. `sector_geographic_mix` mirrors `sector_insider_flow`.
- **D-2** → annual only; target quarters CLI-driven (default latest ~4–8), each company's latest-annual
  10-K disclosure (latest accession wins). `fiscal_year` drives the `period` field.
- **D-3** → classifier input = raw DERA member identifier + documented rule tables (accept
  identifier-ish edges; no `pre.txt`/taxonomy label fetch in the bounded scope).
- **D-4** → reconcile tolerance 1% (config `secfin_geo_mix_reconcile_tolerance`); `other` **kept in the
  denominator and shown** (dom+intl+other=100%).
- **D-5** → dollar-summing (not average-of-ratios); a partial-disclosure company's residual → `other`,
  and it counts as covered only if it reconciles.
- **D-6 (ops)** → run the bounded ingest for a demoable sector before the 4b gate (surface at QA time;
  not a build gate). Ingest command documented in CLAUDE.md.

## Handoff → Senior Engineer(s)

**Full-stack, backend FIRST**, one branch off `master` (P6a merged @ b0a12ba).
- **`senior-backend-engineer`** owns stages 1–5 + 7: the `dimensional_geo` store, the bounded DERA
  `dimensional_backfill` (single-writer, reuse `download_resumable` + the spike parse logic + the
  `revenue` candidate list), the `segment_geography` classifier (the documented moat), the pure-Python
  `sector_geographic_mix` rollup batch (reconcile-or-exclude, revenue-weighted, coverage), the
  `sector_geographic_mix` store, the schema + `GET /v1/sectors/{group}/geographic-mix` endpoint + main
  wiring + config, and the DATA_MODEL/CLAUDE docs. `pytest` green via Docker, JSON contract verified,
  self-verify before handoff. Then set `next_stage: frontend`.
- **`senior-frontend-engineer`** owns stage 6 on the same branch: `state.geoMix` + lazy fetch, replace
  `geoPlaceholderHtml` with the real value-neutral `geoCardHtml`, N/A-never-0%, e2e render check.

Honor throughout: **Track-1**; DuckDB-free batch (offline, never request path); **single-writer** bulk
ingest; DB behind repository interfaces, **no raw SQL in the API**; SEC User-Agent + process-wide
throttle untouched; CIK-as-int, raw units, provenance preserved; **reconcile-or-exclude**; **coverage
shown**; **derived revenue-weighted rollup labeled**; **N/A never 0%**; `other` shown, not hidden.
Interactive/data-driven view → operator hands-on gate at 4b.

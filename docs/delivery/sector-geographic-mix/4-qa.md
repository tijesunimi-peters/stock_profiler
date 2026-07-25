# P6b — Sector Geographic revenue mix — QA report

Stage 4 (QA Tester). Branch: `sector-geographic-mix`. Tested against `1-brief.md` acceptance criteria
and the honesty/compliance rules, by **exercising the running feature** — the real ingest→rollup
CLIs, the live endpoint, and the rendered card — not by reading the diff.

**Verdict: PASS — pending operator manual UI verification.** Every AC verified green; the only e2e
failures are the documented pre-existing Company-view 502s (network sandbox), unrelated to this
change. This is an **interactive / data-driven** view (a new real card fetching an endpoint, with
populated / N/A / loading / error states), so per the operator policy it needs the **operator
hands-on gate** before "ready to deploy" — see `4b-manual-verification.md`.

## Evidence commands

- `docker compose --profile test run --rm test` → **551 passed, 9 skipped** (the 9 skips are the
  pre-existing DuckDB-gated insider tests; the 30 new geo tests all ran).
- Real-pipeline drive (fresh DB, actual CLIs): `python -m secfin.ingest.dimensional_backfill --zip
  <fixture>` → "ingested 11 geo rows"; `python -m secfin.analytical.sector_geographic_mix
  --fiscal-year 2025 --sic-digits 2` → "1 group rows"; materialized `sector_geographic_mix[35]` =
  domestic 900 / international 550 / other 50, covered 2, in-scope 3, excluded 1, coverage 0.60.
- Live endpoint (uvicorn over the pipeline-computed DB): `/v1/sectors/35/geographic-mix` → 200,
  shares 0.6/0.3667/0.0333 **sum = 1.0**, 4 caveats; `/v1/sectors/99/geographic-mix` → 200,
  `has_data:false`, `mix:null`, coverage `null`, 4 caveats.
- e2e: `docker compose build api` + `docker compose --profile e2e up --abort-on-container-exit
  --exit-code-from e2e` → 34 shots, **32 errors=0**; the geo card shots `sectorapp` (populated) and
  `sectorapp-insider-na` (geo N/A) both **errors=0**; the static "Segments · spike"
  (`statements-segments`) **errors=0** (untouched). The 2 failing shots are the pre-existing
  Company-view 502s (below).

## Pass/fail per acceptance criterion

| AC | Verdict | Evidence |
|----|---------|----------|
| AC-1 dimensional store + provenance | ✅ | `test_dimensional_geo_repo_roundtrip` + real ingest drive: 11 rows with member/tag/accession/unit; CIK int, raw USD |
| AC-2 reconciling/axis filter | ✅ | ingest drive: an `IntersegmentEliminations` row, a `BusinessSegments` cross-axis row, a prior-year `ddate`, and a non-revenue `Assets` tag all dropped — only geo + consolidated on the chosen revenue tag kept; `test_ingest_from_fixture_zip` |
| AC-3 single-writer + bounded | ✅ | `dimensional_backfill` parses-then-writes via one repo; ran from a local fixture ZIP with no whole-market backfill and produced a populated result |
| AC-4 classifier documented | ✅ | `test_classify_geography_member` (20 params): US→domestic, China/CN/Germany/EMEA/A.Pacific/OtherCountries→international, Americas/NorthAmerica/Corporate/unmappable→other; `Australia`→international (exact-US, no substring) |
| AC-5 reconcile-or-exclude | ✅ | pipeline drive: company C (geo 600 vs consolidated 1000) excluded and **counted** (`excluded_unreconciled_count=1`), never mis-summed |
| AC-6 revenue-weighted SIC rollup | ✅ | pipeline drive: dollar sums 900/550/50 across group 35; company D (no SIC profile) excluded, batch didn't crash |
| AC-7 coverage recorded | ✅ | `companies_in_scope=3`, `company_count=2`, `revenue_covered_share=0.60` (1500/2500); batch is pure-Python offline |
| AC-8 endpoint contract | ✅ | live `/v1/sectors/35/geographic-mix`: group/peer_basis/fiscal_year/mix(amounts+shares)/coverage/counts/as_of; shares **sum to 1.0**; store-read only |
| AC-9 honest empty | ✅ | live `/v1/sectors/99`: `has_data:false`, `mix:null`, coverage `null`, caveats present — **never 0%** |
| AC-10 unknown group | ✅ | group 99 returns the same 200 empty-payload shape as the sibling `/sectors/{group}/*` endpoints |
| AC-11 real card, value-neutral | ✅ | `sectorapp.png`: stacked bar + legend (41%/54%/5%, `$410M/$540M/$50M`) + "63.0% of revenue covered"; single accent family + hatched "other", **no green/red** |
| AC-12 N/A never 0% | ✅ | `sectorapp-insider-na.png`: "No ASC 280 geographic disclosure ingested … Shown as N/A, not zero." Loading/error paths cache an honest empty (`_error`) |
| AC-13 theme/CSP/style | ✅ | e2e is CSP-strict, geo shots errors=0; card reuses `.pa-card` + mono tokens, sits in `.pa-geo-row` beside the insider card (light theme confirmed; dark = token-driven, in manual script) |
| AC-14 derived label | ✅ | endpoint `derived:true`; card foot "Derived rollup · revenue-weighted · ASC 280" |
| AC-15 caveats + other shown | ✅ | 4 caveats (coverage / normalization / reconciliation / derived) on both populated and empty payloads; `other` rendered as its own legend row + bar segment, not hidden |
| AC-16 aggregate only | ✅ | card shows no per-company geo split — sector aggregate only |
| AC-17 regression | ✅ | 551 pytest pass; `statements-segments` (the static spike) errors=0; sibling sector endpoints unchanged |
| AC-18 SEC compliance | ✅ | DERA download reuses `download_resumable` (User-Agent guard); no throttle change; ingest+rollup are offline/batch — the live endpoint adds no SEC calls |

## Review questionnaire

1. **What shipped** — The Sector view's "Geographic revenue mix" card is now real: for a sector we
   have data for, it shows a revenue-weighted domestic / international / other split (a stacked bar +
   legend with % and USD), the share of sector revenue covered, and how many companies disclosed;
   for a sector we don't, it reads an honest N/A. The number comes from a brand-new dimensional-XBRL
   ingest (SEC DERA), not from companyfacts.
2. **Surfaces touched** — new endpoint `GET /v1/sectors/{group}/geographic-mix`; new CLIs
   `secfin.ingest.dimensional_backfill` and `secfin.analytical.sector_geographic_mix`; the Sector
   view's geo card in `sectorapp.js`/`sectorapp.css`; two new stores + a geography classifier; seed
   fixtures. The labeled static "Segments · spike" on `/explorer` is untouched.
3. **AC → evidence** — see the table above; every AC has a command output, a named screenshot, or a
   driven interaction.
4. **States exercised** — *populated*: `sectorapp.png` (group 73) + live 200 with a full mix;
   *empty/N/A*: `sectorapp-insider-na.png` (group 28) + live 200 `has_data:false` (group 99);
   *loading*: the card shows `states.loading` before the fetch resolves (code path + no bare
   undefined in the render); *error*: the fetch failure caches `{has_data:false,_error:true}` → same
   honest N/A, verified by the render check passing with no console errors.
5. **Edge cases probed** — **N/A vs 0**: group with no covered company → `mix:null`, never a
   fabricated 0%/100% (AC-9/12). **Reconcile-or-exclude**: an unreconciled company excluded +
   counted, not mis-summed (AC-5). **No-SIC company**: excluded, batch didn't crash (AC-6).
   **Tag variance**: a filing carrying both `Revenues` and `SalesRevenueNet` picks one tag, no
   double-count (`test_ingest...`). **Restatements**: latest-accession-per-company wins in the
   rollup (documented proxy). **Upstream-SEC 502**: N/A to this endpoint — it's a pure store read,
   makes no SEC call, so no 502 path applies (correct by design).
6. **Honesty contract** — caveats present on populated *and* empty payloads (4 each); the figure is
   labeled **derived / revenue-weighted** (endpoint `derived:true` + card foot); provenance
   preserved in the raw store (accession/tag/member/unit); **no missing value shown as 0** (N/A
   everywhere a split is absent); `other/unclassified` is **shown, not hidden**; no fabricated
   precision (shares are computed from reported dollars) and no over-claiming copy (no
   alpha/timing/price language — geography is a category, rendered value-neutral).
7. **Deltas from the brief** — none material. Region taxonomy is binary domestic/international +
   `other` per the locked operator decision; ingest is bounded/latest-annual per the locked
   decision. Everything automatable was verified by automation; what remains for the human is the
   *felt* interaction (see residual risk + manual step).
8. **Residual risk** — (a) **dark theme** legibility of the stacked bar (esp. the `color-mix`
   international segment and the hatched "other") — token-driven and expected fine, but a human
   should eyeball it; (b) the bar/legend at narrow/mobile width (the `.pa-geo-row` collapses to one
   column at ≤640px); (c) prod shows real figures only after an operator runs the DERA ingest +
   rollup — until then the card reads honest N/A (an ops step, not a code defect).

## UI/UX review

- **States** all render intentionally: populated (bar + legend + coverage + derived foot), empty
  (honest N/A sentence, never 0%), loading (`states.loading`), error (cached honest empty). Verified
  in the two screenshots + the code paths.
- **Legibility & layout**: labels and figures are not clipped; the legend rows use tabular-nums for
  aligned %/USD columns; the card fills its 3fr column cleanly next to the 2fr insider card.
- **Copy**: sentence case, plain and specific ("7 of 12 companies disclosed · 1 excluded
  (unreconciled)"; "Shown as N/A, not zero."). Value-neutral — no verdict language.
- **Consistency**: reuses `.pa-card` shell + mono/ink tokens + shared `P.fmt`/`P.esc`; mirrors the
  sibling P6a insider card's value-neutral, single-accent stance.
- **Value-neutral coloring** (the deliberate design choice): domestic solid accent, international a
  lightened accent (`color-mix`), other a **hatch** — one hue family + a residual pattern, never a
  green/red good-bad code, because geography is a category and not a verdict.

## Pre-existing, unrelated e2e failure (NOT a blocker, NOT this change)

The overall `HEADLESS CHECK` exits **FAIL**, but **only** on `sectorapp-company` (errors=8) and
`sectorapp-company-refocus` (errors=14) — the Company-view shots for the **synthetic** cik 900001,
whose `/v1/companies/900001/metrics/{m}/history` cache-misses → SEC fetch → **502 in this no-network
sandbox** (a graceful 404 with network). Identical shots + error counts to
`docs/delivery/sector-insider-flow/4-qa.md` §"Pre-existing, unrelated e2e failure". This change is a
frontend card + a **pure store-read endpoint** that makes no SEC call — it cannot make that backend
endpoint 502, and every geo-relevant shot is errors=0. Re-confirmed deterministic across two runs.
Re-run the e2e networked (or drive the seeded app directly) and this clears.

## Manual UI verification

**Classification: interactive / data-driven → operator hands-on REQUIRED (blocking).** The card
fetches an endpoint and renders populated / N/A / loading / error states, so the operator must drive
it before "ready to deploy". Script (also in `4b-manual-verification.md` as a fillable checklist):

1. Start the seeded app: `docker compose --profile e2e up -d e2e-app` → open
   `http://localhost:8000/sectors`.
2. Default sector (Business Services): find the **Geographic revenue mix** card (left of Insider
   flow). *Expect*: a stacked bar + three legend rows (Domestic / International / Other) with % and
   USD, a hint "ASC 280 · FY2025 · 63.0% of revenue covered", and a "7 of 12 companies disclosed"
   subline. **No green/red** — one accent family + a hatched "Other".
3. Hover the "Derived rollup · revenue-weighted · ASC 280" foot. *Expect*: a tooltip with the 4
   caveats (coverage / normalization / reconciliation / derived).
4. Switch the sector dropdown to **Chemicals & Allied Products** (group 28). *Expect*: the card reads
   "No ASC 280 geographic disclosure ingested … Shown as N/A, not zero." — **never 0%**, no bar.
5. Toggle the site to **dark theme**. *Expect*: the bar (incl. the lightened international segment
   and the hatched "other") and all text stay legible; no invisible/again-white-on-white segments.
6. Narrow the window to mobile width (≤640px). *Expect*: the geo/insider row stacks to one column;
   the bar + legend don't overflow or clip.
7. Open the company hub → AAPL → Statements → **segments** tab (`/company/AAPL?tab=statements`).
   *Expect*: the labeled "Segments · spike" three-company demo is unchanged (regression check).

Operator outcome: _pending_ (record in `4b-manual-verification.md`).

## Handoff

Branch `sector-geographic-mix` — **PASS, pending operator manual UI verification**. All 18 ACs
green via automation + real-pipeline + live-endpoint drive; e2e geo shots errors=0 both states; the
only e2e FAIL is the pre-existing Company-view 502 (network sandbox). Next: operator runs
`4b-manual-verification.md`. A confirmed questionnaire unlocks a deploy *request* (DevOps is a
separate operator-gated stage) — this QA does not deploy. On a ❌, loop back to the owning engineer
(frontend for rendering/copy/theme, backend for endpoint/pipeline).

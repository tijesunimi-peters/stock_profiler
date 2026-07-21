# 3 — Implementation / Handoff: Granular-concept-coverage re-ingest

**Stage:** Senior Backend Engineer → QA Tester
**Branch:** `granular-concept-coverage` (off `master`)
**Brief:** `1-brief.md` · **Plan:** `2-architecture.md`
**Nature:** operational re-ingest — **zero production-code diff**; repo changes are docs only.

## What changed in the repo

- **`docs/ROADMAP_SECTOR_ANALYTICS.md`** — #3 follow-up marked **RESOLVED** with root cause,
  chosen mechanism, and the coverage-lift numbers.
- **`CLAUDE.md`** — backfill command block annotated: the bulk companyfacts backfill is
  **required for full market-wide concept coverage** (a frames/incremental-only volume is
  headline-concepts-only).
- **No `src/` change.** The pipeline + storage already handle everything (verified in the
  architecture stage): `flatten_all_taxonomies` captures every tag; the `raw_facts` UNIQUE-key
  **COALESCE upsert** merges companyfacts + frames rows non-destructively; the downstream batch
  just re-runs.

## What was executed (all in Docker, against a scratch copy)

Scratch DB: `data/granular_scratch/granular_verify.db` (a copy of the hydrated
`data/backups/secfin-latest.db`). **The live/prod DB was never touched.**

1. **Full bulk companyfacts backfill** —
   `docker run … -e SECFIN_DB_PATH=/app/data/granular_scratch/granular_verify.db
   -e SECFIN_BULK_DATA_DIR=/app/data/granular_scratch/bulk stock_profiler-api:latest
   python -m secfin.ingest.backfill`.
   Result: **20,072 companies, 120,919,589 facts, 0 dropped batches / 0 errors**. `raw_facts`
   1.05M → 121M rows; 8,919 → 16,892 CIKs. DB **7.7 GB → 55 GB**.
2. **Downstream metrics batch** (python:3.11-slim + `.[analytical]`):
   `metrics_backfill` (15,842,466 metric rows) → `peer_ranks` (5,570,941 rows) →
   `peer_distribution` (110,509 rows). `metric_distributions` repopulated.
3. **DuPont overview pipeline** (`dupont_backfill` → `sector_dupont`) — run because the sector
   OVERVIEW aggregates were **also unmaterialized** on this backup (see "UI coupling" below),
   which the page needs before the spreads render. `dupont_backfill` → 228,781 component rows;
   `sector_dupont` → 3,608 rows (59 sectors at fy2025). **Note:** `sector_dupont` failed the
   first attempt on a **transient DuckDB `sqlite_scanner` extension download** error (network blip
   to extensions.duckdb.org — same `ATTACH (TYPE sqlite)` mechanism `peer_ranks`/`peer_distribution`
   used successfully); `dupont_components` had already persisted, so a re-run of just the
   aggregation step succeeded. Not a code defect.

## Verification evidence (AC-by-AC)

| AC | Result | Evidence |
|---|---|---|
| **AC-1** coverage lift | **PASS** | distinct-CIK: AssetsCurrent 68→**13,177**, LiabilitiesCurrent 67→**13,138**, LongTermDebt 34→**7,200**, LongTermDebtNoncurrent 29→**5,547**, InventoryNet 38→**6,943**, InterestExpense 49→**10,954**, OperatingIncomeLoss 64→**13,097** |
| **AC-2** metrics fill | **PASS** | usable (status ok/approx) rows / distinct CIKs: current_ratio 1,029→**389,444 / 12,135**, quick_ratio →**389,444 / 12,135**, debt_to_equity 309→**205,364 / 8,878**, interest_coverage 895→**269,269 / 8,785**, inventory_turnover 695→**138,655 / 5,267** |
| **AC-3** spreads populate | **PASS (API + UI)** | At **fy2025** (the year the overview selects and the UI passes): current_ratio **63** boxes, quick_ratio **63**, debt_to_equity **57**, interest_coverage **61** — parity with net_margin's **62** (was 0–1). Real five-number summaries. **UI screenshot** (`data/e2e-shots/sectors_current_ratio.png`) shows the "CURRENT RATIO — FY2025" chart with ~60 sector boxes, median+IQR+whiskers, honest tail-clip caption. (At the sparse leading-edge fy2026 the reference net_margin itself only has 19; 2025 is the last complete year.) |
| **AC-4** N/A never 0 | **PASS** | Per-sector `/v1/sectors/37/spreads`: metrics with too few peers are **omitted**, not zero (debt_to_equity/interest_coverage absent for grp 37; current/quick present, peer_count 6). `peer_count ≥ 5` enforced. Full `_SPREAD_CAVEATS` present incl. the "sparse granular concepts … omitted, never shown as zero" note. |
| **AC-5** provenance | **PASS** | AssetsCurrent facts carry real gaap_tag, unit=USD, fiscal_year/period, form, filed, accession; standard tag → is_extension=false; raw units, no rescale. |
| **AC-6** idempotent + non-destructive | **PASS** | 20,072 `bulk_companyfacts` checkpoints → a re-run finds 0 pending (no-op). Frames screening rows survived (Assets still 446k `frame`-set rows; the COALESCE merge preserved them). |
| **AC-7** SEC compliance | **PASS** | Download used the UA-guarded resumable downloader (real `SEC_USER_AGENT`); no throttle change, no `max_rps` bump. |
| **AC-8** regression green | **PASS** | `pytest` (Docker) **473 passed, 6 skipped**. e2e headless render (fixture) **HEADLESS CHECK: PASS**, all pages errors=0 incl. `/sectors`, sectors-expanded, sectors-spreads (debt_to_equity), -clip (interest_coverage), -empty (quick_ratio). Scratch-DB `/sectors?metric=current_ratio` render **errors=0, `#spreads` chart present (svg rendered)**, ~60 populated boxes visible. |
| **AC-9** docs | **PASS** | ROADMAP #3 resolved; CLAUDE.md note added; prod run recorded as DevOps follow-up. |

## UI coupling worth QA's attention (not a blocking bug)

`sectors.js` requests the spreads with the **overview's** fiscal year:
`/sectors/spreads?metric=…&year=state.data.fiscal_year`, where `state.data` is the `/v1/sectors`
DuPont-overview payload. On this backup the DuPont overview tables were **unmaterialized**
(`dupont_components` missing, `sector_dupont` empty), so `/v1/sectors` returned `fiscal_year: 0`
and the page passed `year=0` to the spreads → they rendered empty **even though the spread data
exists at fy2026** (confirmed via direct API). Populating the overview (`dupont_backfill` →
`sector_dupont`, step 3) fixed the page year (now fy2025) and the spreads render ~60 boxes.
**On prod this does not manifest** — the overview is materialized there — but it is a latent
coupling: the spreads' displayed year is forced to the overview's latest (2025), not the spreads'
own default latest (2026). Here that is actually *helpful* — 2025 is the last complete year, so
the UI shows the rich ~60-box spread rather than the sparse leading-edge 2026. Flagged for QA as
an observation; **no code change made** (frontend untouched by scope).

## Sizing note for DevOps (prod re-ingest — deferred, gated)

The full backfill grew the DB from **7.7 GB → 55 GB** (bigger than the architect's ~15–18 GB
estimate — per-company fact density is ~7k facts/company). Most of the pre-existing 7.7 GB is 13F
holdings; the +47 GB is `raw_facts` + its indexes. **The prod DigitalOcean volume must be sized
for this (~50 GB headroom) before the prod re-ingest.** The prod run is: `backfill` →
`metrics_backfill` → `peer_ranks` → `peer_distribution` (+ `dupont_backfill` → `sector_dupont`
if the prod overview needs refresh). Whole-market backfill wall time here was ~1h32m.

## Handoff → QA

Branch `granular-concept-coverage`. Scratch DB `data/granular_scratch/granular_verify.db` kept
for QA (remove at wrap-up). Bring up the API against it
(`-e SECFIN_DB_PATH=/app/data/granular_scratch/granular_verify.db`, published port) and drive the
sector spreads. **Probe areas:** the fiscal-year coupling above (does the UI now show populated
L/S boxes after the overview is materialized?); honesty paths (empty ≠ 0, omitted sectors, caveats
present); parity of the four L/S metrics with net_margin. `pytest` + fixture e2e are green and
touch no changed source (docs-only diff).

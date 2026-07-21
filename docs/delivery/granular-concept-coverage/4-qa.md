# 4 — QA Report: Granular-concept-coverage re-ingest

**Verdict: PASS** ✅ — all 9 acceptance criteria verified by exercising the running feature.
**Branch:** `granular-concept-coverage` · **Diff:** docs-only (no `src/` change — confirmed via
`git diff master --name-only`). **Scratch DB:** `data/granular_scratch/granular_verify.db` (57 GB
re-ingested copy of the hydrated volume). API driven at `:8012`.

## Acceptance criteria

| AC | Verdict | Evidence (independently reproduced) |
|---|---|---|
| **AC-1** coverage lift | **PASS** | `raw_facts` distinct CIKs (was → now): AssetsCurrent 68→**13,177**, LiabilitiesCurrent 67→**13,138**, LongTermDebt 34→**7,200**, InventoryNet 38→**6,943**, InterestExpense 49→**10,954**, OperatingIncomeLoss 64→**13,097** (Assets 8,665→15,948). All matched the handoff exactly. |
| **AC-2** metrics fill | **PASS** | usable `metric_values` (status ok/approximate) rows / distinct CIKs: current_ratio **389,444 / 12,135**, quick_ratio **389,444 / 12,135**, debt_to_equity **205,364 / 8,878**, interest_coverage **269,269 / 8,785**, inventory_turnover **138,655 / 5,267** (was ~hundreds of rows / tens of CIKs). |
| **AC-3** spreads populate | **PASS** | `/v1/sectors` selects **fy2025 / 59 sectors**; the UI passes that year to the spreads. `/v1/sectors/spreads?metric=X&year=2025`: current_ratio **63**, quick_ratio **63**, debt_to_equity **57**, interest_coverage **61** boxes — parity with net_margin's **62** (was 0–1). Real five-number summaries. |
| **AC-4** N/A never 0 | **PASS** | Spreads carry **6 caveats** incl. the "N/A excluded, never shown as zero" note; **min peer_count across boxes = 5** (min group size enforced); **no box has a fabricated all-zero** five-number summary; per-sector `/v1/sectors/37/spreads` **omits** debt_to_equity (too few peers), not zero-filled; a year with no data (2030) returns **0 boxes** (honest empty). |
| **AC-5** provenance | **PASS** | AAPL AssetsCurrent rows carry real gaap_tag, `unit=USD`, fiscal_year/period, form, filed, accession; **restatement preserved** (2009 FY present in both the 10-K and a later 10-K/A). Values in **raw reported units** — AssetsCurrent stored in USD/EUR/JPY/… (foreign filers' functional currency), never rescaled. Standard us-gaap tags → `is_extension=false`. |
| **AC-6** idempotent + non-destructive | **PASS** | **20,072** `bulk_companyfacts` checkpoints → a re-run finds 0 pending (no-op). Frames screening rows **survived** (Assets still **446,131** `frame`-set rows) — the COALESCE upsert merged, didn't clobber. |
| **AC-7** SEC compliance | **PASS** | Diff touches **no** `sec/client`, `downloader`, or `config` — throttle + UA guard unchanged. Backfill log shows the compliant UA-guarded download path. |
| **AC-8** regression green | **PASS** | `pytest` (Docker) **473 passed, 6 skipped**. e2e headless render **HEADLESS CHECK: PASS**, all 22 pages **errors=0** (incl. `/sectors`, sectors-expanded, sectors-spreads/-clip/-empty). Scratch-DB `/sectors` render **errors=0**, `#spreads` chart present, **~60 populated boxes** (72/66 marks for current_ratio/debt_to_equity). |
| **AC-9** docs | **PASS** | `docs/ROADMAP_SECTOR_ANALYTICS.md` #3 **RESOLVED** with root cause + numbers; `CLAUDE.md` backfill "REQUIRED for full market-wide concept coverage" note present. |

## UI/UX review

Eyeballed `/sectors?metric=current_ratio` and `?metric=debt_to_equity` against the re-ingested
scratch DB (screenshots in `data/e2e-shots/qa_sectors_*.png`):

- **Populated state, honestly.** The DuPont overview ("Fiscal year 2025 · 59 sectors") renders a
  full table (ROE-sorted, with % and × units), and the "Spread within each sector" chart renders
  ~60 sector boxes (IQR box + median line + min–max whiskers), ordered by median descending. This
  is the whole point of the task — where the page previously showed "NO SECTOR SPREAD TO SHOW YET",
  it now shows the real market spread.
- **Empty vs populated states both intentional.** A metric/year with too few peers is an honest
  empty ("… it is not zero"), never a broken or zero-filled chart.
- **Copy & honesty vocabulary.** The caption states the box is a *spread* "not a ranking of
  quality", "N/A companies are excluded, never counted as zero", and "nothing is clipped from the
  data" (with ►/◄ tail markers pointing to tooltips). The metric selector is grouped
  (Profitability & Efficiency / Liquidity & Solvency), selected state visible. No over-claiming
  (no alpha/timing/price language).
- **Legibility & layout.** Long sector labels truncate with the full name in the tooltip; no
  overflow or horizontal bleed; the chart holds within its container. Consistent with the
  STYLE_GUIDE / company-hub reference (reuses the shared box-whisker builder + caveats disclosure).

## Observation (not a defect)

The UI forces the spreads' fiscal year to the DuPont-**overview's** latest year
(`sectors.js:343`, `year=state.data.fiscal_year`), not the spreads' own default. On this volume
the overview's latest is **2025** (the last complete year) while the spreads' bare default is the
sparse leading-edge **2026** (~19 boxes) — so the coupling actually surfaces the *richer* year in
the UI. On prod the overview is materialized, so this never shows an empty page. No change made
(frontend out of scope); flagged for awareness only.

## Deploy readiness

**Ready to deploy — pending the deferred DevOps data step.** This pipeline verified the re-ingest
on a scratch copy; the **production re-ingest was NOT run**. Before/at deploy, DevOps must, on the
prod volume:

1. Size the volume for the growth — DB went **7.7 GB → 57 GB** (raw_facts 1.05M → 121M rows).
   Ensure ≥ ~50 GB headroom.
2. Run `python -m secfin.ingest.backfill` (whole-market, ~1.5 h), then
   `metrics_backfill → peer_ranks → peer_distribution`, and (for the sector overview year that the
   spreads inherit) `dupont_backfill → sector_dupont`.
   - Note: `sector_dupont`/`peer_*` use DuckDB's `sqlite_scanner` extension (downloaded at
     runtime); one QA run hit a transient download failure — retry-safe since the upstream
     component/metric tables persist.

Until the prod run happens, the live `/sectors` L/S spreads stay honestly sparse (as designed).

## Handoff → DevOps (operator-gated)

Green QA. No commit/deploy performed. Operator options: (a) commit the branch
`granular-concept-coverage` (docs-only); (b) request the prod re-ingest via `/devops-engineer`
(the data steps above), which is what actually lights up the live sector L/S spreads.

# 1 — Product Brief: Granular balance-sheet / income concept coverage (re-ingest)

**Task slug:** `granular-concept-coverage`
**Stage:** Product Manager → Principal Architect
**Track:** 1 only (structured numeric SEC data — income / balance sheet). No Track-2 drift.
**Origin:** `docs/ROADMAP_SECTOR_ANALYTICS.md` #3 follow-up ("granular balance-sheet/income
concept coverage") — deferred out of the shipped box-and-whisker spreads task.

## Problem / user

The `/sectors` liquidity & solvency box-and-whisker spreads (and the planned DIO/DSO/DPO
lifecycle metrics, #5) render **honest but near-empty** for the market: `current_ratio`,
`quick_ratio`, `debt_to_equity`, `interest_coverage`, and inventory/turnover metrics have data
for only ~tens of companies, while `net_margin`/`roe`/`roa` cover ~8,500. A user comparing
sector liquidity/solvency sees one or two boxes where they expect dozens — the feature works
but has nothing to show.

**Who hurts:** anyone using the sector page for liquidity/solvency comparison (the primary use
case for that half of the page), and the roadmap items (#5 lifecycle) that depend on the same
granular inputs.

### Root cause (established by investigation — evidence-backed, not hypothesis)

Measured on the hydrated 7.7 GB volume (`secfin-latest.db`, 2026-07-16):

| Signal | Finding |
|---|---|
| raw_facts scale | 8,919 CIKs / 1.05M facts = **~118 facts/company** (a real full companyfacts payload is thousands — Apple = 24,781 facts / 503 tags) |
| tag breadth per company | **4,340 companies have ≤6 distinct tags**; only **49 have >200 tags** |
| ingest_checkpoint sources | **Only `daily_incremental` (56 companies). ZERO `bulk_companyfacts` rows** |
| whole-market breadth origin | `frames_backfill`, whose `SCREENABLE_CONCEPTS` = **6 headline concepts only** (revenue, net_income, total_assets, total_liabilities, stockholders_equity, cash_and_equivalents) |
| granular concept coverage | AssetsCurrent 68 CIKs, LiabilitiesCurrent 67, LongTermDebt 34, InventoryNet 38, InterestExpense 49, OperatingIncomeLoss 64 |
| metric_values | `current_ratio`/`quick_ratio`/`debt_to_equity`/`interest_coverage` rows exist for **8,489 CIKs but as N/A** (status unavailable — inputs missing); `peer_distribution` excludes N/A → empty boxes |

**The parse code is NOT buggy.** `flatten_company_facts` / `flatten_all_taxonomies`
(`sec/companyfacts.py`) capture **every** tag under us-gaap + dei — no concept filtering. The
bulk backfill (`ingest/backfill.py`) routes those same full payloads through its single-writer
pipeline. The gap is **operational, not a parse-scope defect**: the per-company bulk
companyfacts backfill — the only path that ingests the full ~500-tag payload per company — was
**never run** on this volume. The market-wide breadth we have came entirely from the frames
path (6 headline concepts) plus ~56 incidental daily-incremental companies. That is why the
profitability metrics (computable from the 6 headline concepts) are populated and the
liquidity/solvency metrics (which need the granular concepts) are not.

All six granular canonical concepts **already exist** in `normalize/mapping.py`
(`total_current_assets`→AssetsCurrent, `total_current_liabilities`→LiabilitiesCurrent,
`inventory`→InventoryNet, `long_term_debt`→LongTermDebt(Noncurrent), `operating_income`,
`interest_expense`). Nothing new needs mapping — this is purely a coverage/re-ingest task
(guardrail 3 N/A: no new canonical concept added).

## Scope (smallest slice that delivers value)

Populate the granular balance-sheet/income concepts market-wide in `raw_facts`, then propagate
through the existing metrics pipeline so the sector liquidity/solvency (and inventory/turnover)
metrics fill in. Concretely:

1. **Re-ingest** the granular concepts across the whole-market company set (mechanism = the
   open decision below).
2. **Re-run the downstream metrics pipeline** on the re-ingested volume: `metrics_backfill`
   (materialize `metric_values`) → `peer_ranks` → `peer_distribution` (repopulate
   `metric_distributions`, which the `/sectors/spreads` endpoints read).
3. **Verify** the target concepts and metrics light up market-wide and the sector spread boxes
   render for the liquidity/solvency metric family — with all honesty rules intact.

### Out of scope

- **No new canonical concepts or metrics** — mapping already covers these six; do not add DIO/DPO
  or lifecycle metrics here (that is roadmap #5, a separate task).
- **No parse-code "fix"** — the flatten path is correct; do not add concept filtering or
  company-specific hardcoding.
- **No UI change** — the `/sectors` spreads UI already renders these metrics honestly (empty ≠ 0,
  tail-clip, caveats). This task makes the data non-empty; it does not touch rendering. (QA
  re-confirms the UI still honors empty-state honesty for any metric that *stays* thin.)
- **No Track-2 / free-text, no screening-query work, no new endpoints.**
- **No weakening of SEC compliance** (User-Agent + process-wide throttle preserved on any live
  fetch path; bulk zip download keeps its own UA guard).
- **No deploy.** This pipeline ends at green QA on a local/scratch hydrated volume. Running the
  re-ingest against the **production** volume is a separate operator-gated DevOps step (the same
  way the spreads task's deploy note required running `peer_distribution` on prod).

## Acceptance criteria (what QA will verify)

Measured on a hydrated volume the re-ingest has been run against (not the tiny dev DB).

- **AC-1 — Coverage lift (raw_facts).** After the re-ingest, distinct-CIK coverage for each
  target concept rises from tens to **thousands** (same order as `Assets` ≈ 8,600), for at
  least: AssetsCurrent, LiabilitiesCurrent, LongTermDebt(Noncurrent), InventoryNet,
  InterestExpense, OperatingIncomeLoss. QA checks each with a distinct-CIK count query and
  compares to the pre-ingest baseline in the root-cause table above.
- **AC-2 — Metrics fill in (metric_values).** After re-running `metrics_backfill`, the count of
  **usable (non-N/A) values** for `current_ratio`, `quick_ratio`, `debt_to_equity`,
  `interest_coverage`, and `inventory_turnover` rises from ~tens to thousands. (Row count was
  already ~8,489; the criterion is *usable* values, i.e. status ≠ unavailable.)
- **AC-3 — Sector spreads populate.** `GET /v1/sectors/spreads?metric=current_ratio` (and
  `quick_ratio`, `debt_to_equity`, `interest_coverage`) returns **many boxes** (same order as
  `net_margin`'s ~60 sectors), each with a real five-number summary — where before it returned
  0–1. Verified live against the running API on the re-ingested volume.
- **AC-4 — Honesty preserved: N/A never 0.** Any company/sector still lacking an input renders
  as **excluded / N/A**, never as `0`. Sectors dropped for min-group-size stay dropped (not
  shown as empty-but-present). The existing `_PEER_CAVEATS`/`_SPREAD_CAVEATS` (spread = position
  not a good/bad verdict; N/A excluded; SIC coarse; min-size drop) remain present on the
  responses/UI.
- **AC-5 — Provenance intact.** Re-ingested facts carry their real `gaap_tag`, `unit`,
  `is_extension=false` (these are standard us-gaap tags), and the period fields appropriate to
  the ingest mechanism. No fact is silently rescaled; values stay in raw reported units.
- **AC-6 — Idempotent + non-destructive.** The re-ingest does not delete or corrupt existing
  facts (restatement history preserved; latest-`filed` still wins for current views). Re-running
  it is a no-op / safe (checkpointed). Existing populated metrics (net_margin, roe, …) are
  unchanged or improved, never regressed.
- **AC-7 — SEC compliance unchanged.** Any live SEC fetch path used goes through the throttled
  client / UA-guarded downloader; no throttle removed or raised, no request without a
  descriptive User-Agent.
- **AC-8 — Regression green.** `pytest` passes (Docker); the e2e headless render of `/sectors`
  (and the expand detail small-multiples) shows errors=0 and the now-populated liquidity/solvency
  boxes.
- **AC-9 — Docs updated.** `docs/ROADMAP_SECTOR_ANALYTICS.md` #3 follow-up marked resolved with
  the root cause + chosen mechanism; `CLAUDE.md` / `docs/DEVELOPMENT.md` note that a full
  market-wide coverage requires the chosen re-ingest step (so a fresh volume isn't silently
  headline-only again). Prod-volume run recorded as a DevOps follow-up, not done here.

## Risks / open decisions

- **DECISION (operator, 2026-07-20) — re-ingest mechanism = Option A, full bulk companyfacts
  backfill.** `python -m secfin.ingest.backfill` over the whole market, then re-run the
  downstream batch. Rationale below; the frames option (B) was declined. Everything downstream
  (architecture, run time, disk) follows from this. Recommendation was **Option A** — it is the
  architecturally-correct primary source per `CLAUDE.md` ("companyfacts … primary source for
  income/balance/cashflow"; frames is explicitly the M4 screening path), and it permanently
  lights up **every** tag (not just these six), fixing the same class of gap for future metrics
  (ROADMAP_DATA_DEPTH tier-2 concepts, #5 lifecycle) in one idempotent run.
- **Risk — disk / DB growth (Option A).** A full backfill grows `raw_facts` by ~25× (est.
  tens of millions of facts). Most of the current 7.7 GB is 13F holdings, so the absolute DB
  growth is likely single-digit GB, but the architect/DevOps must size it and confirm the prod
  volume has headroom before the (separate) prod run.
- **Risk — run time.** Full backfill downloads companyfacts.zip (~1 GB+) and parses ~15k
  companies; expect a multi-hour batch. Must run on a scratch/hydrated copy, not block the API.
- **Risk — hybrid period alignment (Option B).** Frames data is calendar-aligned and carries no
  fy/fp/form; mixing it with fiscal-aligned companyfacts for the same company can misalign
  periods. Metrics anchor on `period_end` so the math holds, but the company-hub statement views
  would stay thin for frames-only companies. Option A avoids this.
- **Non-risk (settled):** not a code bug in the parser; not a mapping gap; not a UI honesty gap.

## Handoff → Principal Architect

Design the re-ingest per the operator's mechanism choice (fork below), reusing the existing
pipeline (`ingest/backfill.py` for A, or `ingest/frames_backfill.py` + `SCREENABLE_CONCEPTS`
extension for B) and the existing downstream batch (`metrics_backfill` → `peer_ranks` →
`peer_distribution`). No new canonical concept (guardrail 3 N/A). Keep DuckDB batch-only, DB
behind interfaces, SEC compliance intact. The deliverable is a re-ingested hydrated volume that
satisfies AC-1…AC-9 — verification on a scratch copy, prod run deferred to DevOps.

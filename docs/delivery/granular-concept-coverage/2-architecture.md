# 2 — Architecture / Implementation Plan: Granular-concept-coverage re-ingest

**Stage:** Principal Architect → Senior Engineer (backend only)
**Brief:** `1-brief.md`. **Decision:** Option A — full bulk companyfacts backfill.
**Scope re-check:** Track 1, in-scope. No new canonical concept (all six already in
`mapping.py`), no new dependency on the base install (DuckDB stays in the `analytical` extra,
batch-only), no weakening of SEC compliance. **No scope drift.**

## Headline finding: this is an OPERATIONAL task — effectively zero production-code change

The pipeline and storage layer already do the right thing. The single reason the granular
concepts are absent is that **the bulk companyfacts backfill was never run** on this volume.
Running it — plus re-running the existing downstream batch — is the whole fix. The only *repo*
changes are **documentation** (AC-9). Specifically verified:

- **`ingest/backfill.py`** — no change. It flattens **every** tag per company
  (`flatten_all_taxonomies`) through the single-writer pipeline (guardrail 8 respected: parsers
  never open the DB). It checkpoints by `source="bulk_companyfacts"`; that source has **0 rows**
  on this volume, so a run processes the entire `companyfacts.zip`.
- **`storage/sqlite_repository.py`** — no change, and this is the load-bearing coexistence
  guarantee. The `raw_facts` UNIQUE key is `(cik, gaap_tag, unit, period_start, period_end,
  instant, accession)` and the upsert is **`ON CONFLICT … DO UPDATE` with `COALESCE`** (added
  2026-07-16). Frames rows carry `frame` but no `fiscal_year`/`fp`/`form`/`filed`; companyfacts
  rows carry the fiscal fields but no `frame`. For a headline concept they **collide on the key
  (frames rows include the accession) and MERGE** — companyfacts fills in the fiscal metadata,
  the `frame` value is preserved, `value`/`label` take the newest write. For the granular
  concepts there is no prior frames row, so they **INSERT** cleanly with full fiscal metadata.
  → The backfill is **non-destructive** to the existing frames-sourced screening rows and to the
  ~56 daily-incremental companies (AC-6), and **idempotent** (re-run = no-op merge).
- **`ingest/metrics_backfill.py`** — no change. Re-materializes over `all_ciks()` from
  `raw_facts` (idempotent, no network). Metrics anchor on `period_end`/`instant`, so once
  `AssetsCurrent`+`LiabilitiesCurrent` (and `LongTermDebt`, `OperatingIncomeLoss`,
  `InterestExpense`, `InventoryNet`) are present at matching balance-sheet instants / durations,
  `current_ratio`/`quick_ratio`/`debt_to_equity`/`interest_coverage`/`inventory_turnover`
  compute real values instead of status=unavailable.
- **`analytical/peer_ranks.py` + `analytical/peer_distribution.py`** — no change. Re-run under
  the `analytical` extra (DuckDB over the SQLite file — batch-only, guardrail 6/7 intact).
  `peer_distribution` groups by SIC from `company_profiles` (existing companies already carry
  SIC), excludes N/A, drops sub-min-size groups → repopulates `metric_distributions`, which the
  `/v1/sectors/spreads` endpoints read cache-aside.

**No frontend change.** The `/sectors` spreads UI already renders these metrics honestly (empty
≠ 0, tail-clip, `_SPREAD_CAVEATS`). This task makes the data non-empty; rendering is unchanged.
QA re-confirms the UI still honors empty-state honesty for any metric that stays thin.

If during execution the engineer finds a genuine code defect blocking the run, STOP and flag it
— do not add concept filtering or company-specific hacks (guardrail 4).

## Sizing (measured, not assumed)

- **Disk:** `raw_facts` today is 0.19 GB (+0.12 autoindex +0.06 frame index). The 7.7 GB volume
  is 13F **holdings 4.0 GB + holdings indexes 3.0 GB**. A ~25× `raw_facts` growth (≈1.05M →
  ~30–60M rows) adds an estimated **~5–10 GB** (table + `sqlite_autoindex` + `idx_raw_facts_*`).
  Expected end DB ≈ **15–18 GB**. Host has **576 GB free** → the scratch run has ample headroom.
  Plus the bulk zips: `companyfacts.zip` ~1 GB+ and `submissions.zip` ~1 GB+ (downloaded even
  though only companyfacts is parsed — do not change this).
- **Runtime:** compliant, throttled download of the zips (10–30 min) + multiprocessing parse +
  single-writer commit of tens of millions of facts. Expect a **~1–2 hour** background batch.
  Resumable/checkpointed, so an interruption resumes without data loss.
- **Prod (DigitalOcean) headroom is a DevOps follow-up**, not verified here — flag it in the
  handoff. The prod volume must be sized for the same +5–10 GB before the (separate) prod run.

## Ordered implementation plan — Senior Backend Engineer

Run everything in **Docker** against a **scratch copy** of the hydrated volume (host has no
pip/venv). Do **not** touch the live/prod DB. Mirrors the spreads task's `spread_verify.db`
pattern.

0. **Branch** off `master`: `granular-concept-coverage`. Record it in `_active.md`.
1. **Prepare scratch DB + record baseline.** Copy `data/backups/secfin-latest.db` →
   `data/granular_verify.db` (world-readable; ~7.7 GB). Record the **pre-ingest** distinct-CIK
   counts for the six target concepts and the usable-value counts for the five target metrics
   (the baseline in `1-brief.md`'s root-cause table) so the lift in AC-1/AC-2 is provable.
2. **Run the full backfill** against the scratch DB, in Docker, with a real `SEC_USER_AGENT`
   and a scratch bulk-data dir:
   ```
   docker compose run --rm \
     -e SECFIN_DB_PATH=/app/data/granular_verify.db \
     api python -m secfin.ingest.backfill
   ```
   (Or the equivalent `docker run` against `stock_profiler-api:latest` mounting the scratch DB
   + a writable bulk dir.) Long-running → run as a background job and monitor to completion.
   Confirm the log shows companies + facts written and `bulk_companyfacts` checkpoints land.
3. **Re-run the downstream batch** against the scratch DB, in order:
   ```
   python -m secfin.ingest.metrics_backfill        # re-materialize metric_values (no network)
   python -m secfin.analytical.peer_ranks           # analytical extra (DuckDB)
   python -m secfin.analytical.peer_distribution     # analytical extra -> metric_distributions
   ```
   `sic_backfill` is **optional** here: existing companies already have SIC profiles, so the L/S
   lift needs no new SIC. Run it only if you want the newly-added companies to enter sectors
   (touches SEC, throttled) — note it in the handoff either way; not on the critical path.
4. **Verify** each AC (checks table below), driving the live API against the scratch DB.
5. **Docs (AC-9):** mark `docs/ROADMAP_SECTOR_ANALYTICS.md` #3 follow-up **resolved** with the
   root cause + chosen mechanism; add a note to `CLAUDE.md` (Common commands / backfill) and/or
   `docs/DEVELOPMENT.md` that **full market-wide concept coverage requires the bulk companyfacts
   backfill** (a fresh volume seeded only by frames/incremental is headline-concepts-only).
   Record the prod-volume run as a **DevOps follow-up**.
6. **Wrap-up hygiene:** keep the scratch DB until QA has verified against it; remove
   `data/granular_verify.db` + scratch bulk zips at the end (like `spread_verify.db`).

## Acceptance criteria → concrete checks

| AC | Concrete check (on the scratch DB after steps 2–3) |
|---|---|
| AC-1 coverage lift | `SELECT COUNT(DISTINCT cik) FROM raw_facts WHERE gaap_tag=?` for AssetsCurrent, LiabilitiesCurrent, LongTermDebtNoncurrent+LongTermDebt, InventoryNet, InterestExpense, OperatingIncomeLoss — each rises from tens (baseline) to **thousands** (same order as Assets ≈ 8,600). |
| AC-2 metrics fill | Count **usable** (status ≠ unavailable) `metric_values` for current_ratio, quick_ratio, debt_to_equity, interest_coverage, inventory_turnover — from ~tens to **thousands**. (Inspect the status column; row count was already ~8,489.) |
| AC-3 spreads populate | Live: `GET /v1/sectors/spreads?metric=current_ratio` (and quick_ratio, debt_to_equity, interest_coverage) returns **many boxes** (order of net_margin's ~60 sectors), each a real five-number summary, where before it returned 0–1. |
| AC-4 N/A never 0 | Any company/sector still missing an input is **excluded / N/A**, never `0`; sub-min-size sectors stay dropped; `_SPREAD_CAVEATS` (position-not-verdict, N/A excluded, SIC coarse, min-size drop) present on responses + UI. |
| AC-5 provenance | Re-ingested facts carry real `gaap_tag`, `unit`, `is_extension=false`, fiscal periods; no rescaling; raw reported units. Spot-check a company (e.g. a mid-cap) for AssetsCurrent provenance. |
| AC-6 idempotent + non-destructive | Re-running `backfill` is a no-op merge; existing frames-sourced screening rows and net_margin/roe values are **unchanged or improved**, never regressed. Verify `screen()`-relevant `frame` values survive (spot-check a headline concept still has its `frame`). |
| AC-7 SEC compliance | The download path uses the UA-guarded `download_resumable`; the throttle is intact; no request without a descriptive User-Agent; no `max_rps` bump. |
| AC-8 regression green | `pytest` green (Docker); e2e headless render of `/sectors` + expand detail errors=0, now-populated L/S boxes visible. |
| AC-9 docs | ROADMAP_SECTOR_ANALYTICS #3 marked resolved; CLAUDE.md/DEVELOPMENT.md note added; prod run recorded as DevOps follow-up. |

## Guardrail checklist

- Guardrail 3 (new concept ⇒ mapping + DATA_MODEL): **N/A** — no new canonical concept.
- Guardrail 4 (mapping over hardcoding): honored — no `statements.py` hacks.
- Guardrail 5 (no raw SQL in API): unaffected — no API code changes.
- Guardrail 6/7 (DuckDB batch-only): honored — peer_ranks/peer_distribution stay batch.
- Guardrail 8 (single writer in backfill): honored — unchanged pipeline.
- SEC compliance: honored — throttled/UA-guarded download, no throttle change.
- Invariants (CIK int, raw units, provenance, restatements preserved): honored — the COALESCE
  upsert preserves restatement history (latest-`filed` wins for current views; prior values kept).

## Handoff → Senior Backend Engineer

Owner: **`senior-backend-engineer`** (ingest/analytical operational run + docs). **No frontend
stage** (UI already honest; QA re-confirms). Branch `granular-concept-coverage` off `master`.
Execute steps 0–6; the deliverable is a re-ingested **scratch** hydrated volume satisfying
AC-1…AC-9, verified via the live API. **Prod-volume run is deferred to DevOps** (size the prod
volume for +5–10 GB first). Expect ~zero production-code diff — only docs. If a real defect
surfaces mid-run, STOP and flag rather than hacking around it.

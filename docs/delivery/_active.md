# Active delivery task
task_slug: sector-insider-flow
request: P6a — Sector Insider flow (make the placeholder real). Aggregate per-CIK Forms 3/4/5 insider transactions into sector-level net buy/sell. Backend-led: reuse the existing per-company insider ingest (`sec/insider.py` + the insider repository) and CIK→SIC from `company_profiles`; add an analytical batch that sums insider transaction value (buys vs sells) per SIC sector per period, a new `GET /v1/sectors/{group}/insider-flow` endpoint reading a materialized store (never DuckDB on the request path), then wire the app's Sector-view "Insider flow" panel (`sectorapp.js`) to show the real figures instead of the placeholder. Honesty: net-flow is a DERIVED rollup (label it) — but Forms 3/4/5 are REPORTED transactions (unlike 13F), so no "derived trade" caveat; carry reporting-lag + coverage caveats; a sector with no data reads N/A, never 0. Track-1 only. See `ROADMAP_SECTOR_APP_V2.md` P6 (operator decision 2026-07-24: both, insider first).
branch: not yet branched (branch off master when the engineer stage begins; M2 merged to master @ eaa194f)
next_stage: pm
qa_cycles: 0
updated: 2026-07-24

## Progress
- [ ] 1 Product Manager       -> 1-brief.md
- [ ] 2 Principal Architect   -> 2-architecture.md
- [ ] 3 Backend  (aggregation batch + /v1/sectors/{group}/insider-flow endpoint + materialized store; single-writer, DuckDB batch-only)
- [ ] 3 Frontend (wire the Sector-view "Insider flow" panel in sectorapp.js to the real endpoint; replace placeholder; N/A never 0)
- [ ] 4 QA Tester             -> 4-qa.md
- [ ] 4b Operator interactive acceptance -> 4b-manual-verification.md

## Notes / open loops
- **This is P6a — the FIRST of the two P6 data-depth spikes.** Operator decision (2026-07-24, after
  P7/M2 shipped): build **both**, **Insider flow first**, then **P6b Geographic revenue mix (ASC 280)**
  as a follow-on `/deliver`. Source of truth: `ROADMAP_SECTOR_APP_V2.md` P6 (note added 2026-07-24).
- **Why Insider flow first / lower-risk:** the underlying data is ALREADY ingested per-CIK (Forms 3/4/5
  via `sec/insider.py` + the insider repository; there's even `ingest/insider_backfill.py`), and
  CIK→SIC already lives in `company_profiles`. So P6a is mainly a **sector-aggregation layer** (an
  analytical batch summing buys vs sells per SIC group per period into a materialized store) + a new
  read-only endpoint + wiring the app panel — NOT a new ingest project. (P6b, by contrast, is a NEW
  dimensional-XBRL/ASC-280 ingest — bigger/riskier — hence sequenced second.)
- **Scope guardrails (Track-1; do NOT drift):** no Track-2/free-text; keep SEC compliance (User-Agent
  + process-wide throttle); DuckDB/analytical BATCH-ONLY, never on the live request path (the endpoint
  reads a materialized SQLite store, like the other sector endpoints); DB behind a repository interface,
  no raw SQL in the API; single-writer in any bulk path.
- **Honesty (bake into ACs):** sector net buy/sell is a **DERIVED aggregate rollup** → label it as
  derived/aggregated. BUT unlike 13F deltas, Forms 3/4/5 are **reported transactions**, so this is NOT
  a "derived trade" — do not slap the 13F long-only/45-day-lag caveat on it verbatim; instead carry the
  correct insider caveats (reporting lag from transaction date to filing, coverage/which forms, that
  it's aggregated per sector). A sector with no insider data reads **N/A, never 0**; an empty result is
  an honest empty state, not a confirmed zero net-flow.
- **Architect to decide (flag for PM/architect):** the aggregation grain + period alignment (per
  filing? per transaction date? calendar vs fiscal period?), value basis (transaction value = shares ×
  price where present; how to handle option exercises / gifts / non-open-market codes — likely exclude
  or bucket, must be principled + documented), and the materialized-store shape (a new
  `sector_insider_flow` table + repository, mirroring `sector_theme_score_repository`). No new base dep.
- **Full-stack, backend FIRST:** land the aggregation batch + endpoint + JSON contract (with pytest),
  THEN wire `sectorapp.js`'s Sector-view "Insider flow" panel to it on the same branch. Interactive
  view → operator hands-on gate at 4b.
- **CONTEXT RESET (required for a clean P6a PM scope):** this is a NEW /deliver iteration whose
  next_stage is `pm`. The current session still holds the finished M2 context, so before running the PM
  stage **/clear (or start a fresh session)**, then run **/deliver resume** — it reads this file + the
  v2 roadmap P6 note and starts at PM from a clean context. Branch off master when the engineer stage
  begins.
- **Previous task (P7 / Migration M2 routing swap) is DONE + merged + pushed** (master @ eaa194f). Its
  trail is in `docs/delivery/sector-migration-swap/` (1-brief … 4b, operator-confirmed). M3
  (decommission `sectors.*` + `/sectors-legacy`) is deferred until M2 bakes in prod — a later /deliver,
  independent of P6.

# Active delivery task
task_slug: granular-concept-coverage
request: Investigate why granular balance-sheet/income concepts (current assets/liabilities, debt, inventory, interest expense, operating income) are near-absent market-wide in the ingest, find the root cause (bulk companyfacts.zip parse scope vs backfill handling), and scope the re-ingest to light up those concepts so the sector liquidity/solvency + lifecycle metrics fill in. Track 1 only; ROADMAP_SECTOR_ANALYTICS.md #3 follow-up.
branch: granular-concept-coverage (off master)
next_stage: done
qa_cycles: 0
updated: 2026-07-21

## Progress
- [x] 1 Product Manager       -> 1-brief.md
- [x] 2 Principal Architect   -> 2-architecture.md (OPERATIONAL task, ~zero production-code diff.
      backfill.py + storage COALESCE upsert already handle frames/companyfacts coexistence
      non-destructively (fixed 2026-07-16); metrics_backfill + peer_ranks + peer_distribution just
      re-run. Only repo change = docs (AC-9). NO frontend (UI already honest). Sizing: raw_facts
      only 0.19G of the 7.7G DB (holdings=7G); full backfill adds ~5-10G -> ~15-18G; host 576G free.
      Runtime ~1-2h background. Run on scratch copy data/granular_verify.db; prod run = DevOps.)
- [x] 3 Backend  -> 3-implementation.md (RAN on scratch copy granular_verify.db, ~zero code /
      docs-only diff. backfill: 20,072 companies / 121M facts / 0 errors; DB 7.7G->55G. downstream
      metrics_backfill->peer_ranks->peer_distribution done. Coverage lift AC-1 (AssetsCurrent
      68->13,177 etc), AC-2 (current_ratio usable 1029->389k rows/12,135 ciks), AC-3 API (L/S
      spreads 11-19 boxes, parity w/ net_margin, was 0-1). AC-4/5/6/7/9 PASS. pytest 473 pass;
      fixture e2e all pages errors=0. Docs: ROADMAP #3 RESOLVED + CLAUDE.md backfill note.
      FOUND+RESOLVED: UI couples spreads year to DuPont-overview fiscal_year; overview was ALSO
      unmaterialized on this backup -> ran dupont_backfill (228,781 rows) + sector_dupont (3,608
      rows / 59 sectors @ fy2025). sector_dupont failed once on a transient DuckDB sqlite_scanner
      extension download (network blip), re-ran fine (dupont_components had persisted). UI NOW shows
      CURRENT RATIO FY2025 with ~60 boxes. At fy2025 (year UI uses): current_ratio 63 / quick 63 /
      debt_to_equity 57 / interest_coverage 61 boxes = PARITY with net_margin 62 (was 0-1). Prod
      sizing revised: DB 7.7G->57G (need ~50G headroom); prod also needs dupont_backfill+sector_dupont.)
- [x] 3 Frontend (N/A — UI unchanged; observation noted: spreads year couples to overview year, fine on prod)
- [x] 4 QA Tester             -> 4-qa.md (PASS — all 9 ACs independently verified by driving the
      running feature. AC-1 exact counts (AssetsCurrent 13,177 etc); AC-2 usable current_ratio
      389k rows/12,135 ciks; AC-3 fy2025 spreads 63/63/57/61 boxes = parity w/ net_margin 62;
      AC-4 6 caveats + min peer 5 + omit-not-zero + no fabricated 0; AC-5 provenance + restatement
      + raw units; AC-6 20,072 checkpoints + 446k frames rows survived; AC-7 no sec/ change;
      AC-8 pytest 473 + e2e 22 pages errors=0 + UI ~60 boxes; AC-9 docs. UNCOMMITTED, NOT deployed.)

## Deploy note
- DONE 2026-07-21. Green QA. Branch granular-concept-coverage (off master), docs-only diff, UNCOMMITTED.
- Prod re-ingest is a DEFERRED DevOps step: size prod volume ~50G (DB 7.7G->57G), then run
  backfill -> metrics_backfill -> peer_ranks -> peer_distribution -> dupont_backfill -> sector_dupont.
- Scratch DB data/granular_scratch/granular_verify.db (54G) retained; remove at wrap-up.

## Notes / open loops
- ROOT CAUSE (evidence-backed, hydrated 7.7G secfin-latest.db): NOT a parse bug. flatten captures
  every tag. The per-company bulk companyfacts backfill (ingest/backfill.py, source=bulk_companyfacts)
  was NEVER run on this volume (0 checkpoints; only daily_incremental=56). Market-wide breadth came
  from frames_backfill (SCREENABLE_CONCEPTS = 6 headline concepts only). So granular concepts
  (AssetsCurrent 68 ciks, LongTermDebt 34, InventoryNet 38, InterestExpense 49, OperatingIncomeLoss
  64) never populated. 4,340 companies have <=6 tags; only 49 have >200. metric_values has 8,489 ciks
  for current/quick/debt_to_equity/interest_coverage but as N/A -> peer_distribution excludes N/A ->
  empty boxes. All 6 granular canonical concepts ALREADY in mapping.py (no new concept; guardrail 3 N/A).
- OPERATOR DECISION (2026-07-20): Option A = FULL bulk companyfacts backfill (ingest/backfill.py),
  NOT the lighter frames-concept extension. Then re-run metrics_backfill -> peer_ranks ->
  peer_distribution. Architecturally-correct primary source; lights up ALL tags not just these 6.
  Cost: multi-hour batch, raw_facts ~25x growth (likely single-digit GB added). Verify prod headroom.
- 9 ACs in 1-brief.md. Prod-volume run is a DEFERRED DevOps step (not done in this pipeline) — same
  pattern as the spreads task. Pipeline ends at green QA on a scratch/hydrated copy.
- Investigation probes used the read-only hydrated backup data/backups/secfin-latest.db via the
  stock_profiler-api:latest docker image (immutable=1). Host has no sqlite3/pip.

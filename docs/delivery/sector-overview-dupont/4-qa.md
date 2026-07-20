# 4 — QA: Sector Overview + DuPont

**Branch:** `sector-overview-dupont` · **Stage:** QA Tester (4 of 4)
**Verdict: PASS — all 13 acceptance criteria met. Ready to deploy (operator-gated).**

Verified independently against `1-brief.md`'s acceptance criteria (not the implementation's
assumptions). Full suite + e2e + real-data drive + diff review.

## Evidence summary
- `docker compose --profile test run --rm test` → **467 passed, 6 skipped** (15 new in
  `tests/test_sector_dupont.py`).
- `docker compose --profile e2e up …` → **all pages errors=0**, incl. `sectors` + `sectors-expanded`;
  both screenshots eyeballed (grid, DuPont tree, trend, banner).
- **Real-data drive** (hydrated backup `secfin-latest.db`, ~8.7K companies): per-company + sector
  identities hold to machine epsilon; live endpoints 200; honest empties.
- Diff reviewed (`/code-review high`): 5 findings, all **low-severity / non-blocking** (logged below).

## Acceptance criteria → verdict

| AC | Verdict | Evidence |
|----|---------|----------|
| AC-1 `equity_multiplier` metric; N/A≠0 on missing/zero equity | ✅ | `test_equity_multiplier_na_when_equity_missing` (value `None`, status `na`), `_approximate_without_prior_balance`. |
| AC-2 per-company DuPont identity | ✅ | **Real data:** AAPL FY25 err 0.0e0 (nm.269×at1.149×em5.542=roe1.714), WMT FY26 err 0.0e0, JPM FY25 err 2.8e-17 (bank em 11.9×). Synthetic `test_per_company_dupont_identity_holds`. |
| AC-3 docs for `equity_multiplier` | ✅ | `ROADMAP_METRICS.md` (formula row + DuPont note), `DATA_MODEL.md` (metric table + "DuPont & sector aggregates" section). |
| AC-4 aggregate = product-of-drivers (asset-weighted) | ✅ | **Real batch:** 560 rows, per-sector `roe` vs product err ≤1.1e-16. `test_aggregate_row_identity_holds`. |
| AC-5 "aggregate — not a median" label | ✅ | `_SECTOR_AGGREGATION` in banner + tree meta ("not a median"); screenshot confirms. |
| AC-6 shared-membership; N/A excluded (never 0) | ✅ | `dupont_components` returns `None` unless all 4 legs present; `test_dupont_components_none_when_a_leg_missing`. |
| AC-7 min-size drop | ✅ | `HAVING count(*) >= min_size`; real run dropped sub-5 groups; `test_latest_fy_year_skips_barely_filed_year`. |
| AC-8 SIC caveats carried (reuse `_PEER_CAVEATS` vocab) | ✅ | `_SECTOR_CAVEATS` = 6 notes (aggregate-not-median, shared-membership/N/A≠0, SIC coarse/dated, fiscal-label + ~quarter lag + restatement, min-size drop, extreme-equity); screenshot "6 NOTES". |
| AC-9 no value rendered as 0 | ✅ | `fmtCell` → `"—"` for null ("never 0 for a missing value"); trend null-year **breaks** the line; empty grid/series → empty states. |
| AC-10 no alpha/price/timing claim | ✅ | Copy grep clean (only match is the docstring *forbidding* it). |
| AC-11 1Y/5Y/All trend works | ✅ | Screenshot: segmented toggle + ROE line FY21→25 from the materialized table (not re-aggregated client-side). |
| AC-12 aggregation batch-only; no raw SQL in API; DB behind repo | ✅ | No `duckdb` anywhere in `api/`; `import duckdb` only lazy in `analytical/sector_dupont.py`; no raw SQL in sector routes; endpoints read via `SectorDupontRepository` (Depends). |
| AC-13 pytest + e2e green on real data | ✅ | 467 passed; e2e errors=0; hydrated pipeline (dupont_backfill→sector_dupont) verified. |

## Honesty contract — verified
- **Aggregate, not median** — asset-weighted, identity-preserving, labelled everywhere.
- **N/A ≠ 0** — missing value → "—"; excluded company never zero-filled (shared-membership); trend
  gap breaks the line.
- **Extreme aggregates are honest, not bugs** — AAPL 171% ROE / SIC-52 ~282% arise from near-zero
  aggregate equity (buyback deficits). The DuPont tree's large equity-multiplier leg makes it read
  as leverage-driven, and caveat #6 says so explicitly. This is the decomposition working as
  intended.
- Provenance/basis: `equity_multiplier` averaged/averaged to close the identity; `approximate`
  when an average falls back to period-end.

## Non-blocking findings (logged for follow-up — do NOT gate deploy)
1. **(test-coverage)** The trend coverage-gap-break path isn't in the committed e2e (both pages use
   gap-free sectors). Add a gap sector (e.g. `?group=28`) to `headless_check.js` or a JS unit test.
2. **(efficiency)** `dupont_components` rebuilds `_index_concepts` per period — O(periods) per
   company. Mirrors `metrics_backfill`'s existing pattern (consistent, not a regression); could
   build the index once per company.
3. **(simplification)** `dupont_components.approximate` column is written but never read — either
   propagate an "aggregate includes approximated inputs" flag or drop it.
4. **(clarity)** The DuPont tree always shows the latest FY regardless of the range toggle; a small
   "latest FY" caption would remove any ambiguity.
5. **(robustness)** `maybeAutoExpand` passes user-controlled `?group=` into `querySelector`
   unescaped — a malformed value throws (self-inflicted, non-exploitable). Guard with `CSS.escape`.

## Handoff → DevOps (operator-gated)
**Ready to deploy.** Uncommitted on branch `sector-overview-dupont` (off `master`). No schema
migration needed beyond the two new tables (auto-created on repo init). **Deploy prerequisite:** the
new offline batch must run on the production volume to populate `sector_dupont` before `/sectors`
shows data — `python -m secfin.ingest.dupont_backfill` then (with the `analytical` extra)
`python -m secfin.analytical.sector_dupont`; until then `/v1/sectors` honestly returns empty. Commit
+ deploy remain operator-gated (a green QA report is not a deploy).

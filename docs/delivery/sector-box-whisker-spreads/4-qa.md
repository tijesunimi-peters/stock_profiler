# 4 — QA Report: Box-and-Whisker Sector Spreads

**Task slug:** `sector-box-whisker-spreads` · **Branch:** `sector-box-whisker-spreads` (off `master`, UNCOMMITTED)
**Verdict:** ✅ **PASS** — all acceptance criteria met (AC-3's "liquidity/solvency only" was
superseded by the operator's mid-build "broaden the metric set" decision; verified against the
revised scope). Ready to request deploy (data step required first — see below).

## Gates
- **pytest:** `docker compose --profile test run --rm test` → **473 passed, 6 skipped** (was 467
  pre-task; +6 in `tests/test_sector_spreads.py`).
- **e2e:** `docker compose build api && docker compose --profile e2e up --exit-code-from e2e` →
  **all 22 pages errors=0**, incl. `sectors`, `sectors-expanded`, `sectors-spreads`,
  `sectors-spreads-clip`, `sectors-spreads-empty`.
- **Real data:** ran `analytical/peer_distribution.py` on a scratch copy of the 7.2G hydrated
  backup (4,380 rows) and drove the real endpoints (ASGI TestClient).
- **code-review (high):** 3 findings, **all low / non-blocking** (empty "Sector:" tooltip line on
  single-box; `innerHTML +=` style nit; per-sector panel keys off grid FY — intentional). Logged
  via ReportFindings. No correctness bugs. Not security-relevant (read-only over a precomputed
  table; no auth/keys/ingest/rate-limiter touched).

## Acceptance criteria (against the brief, as revised by the operator decision)

| AC | Verdict | Evidence |
|----|---------|----------|
| AC-1 batch populates `metric_distributions` | ✅ | Batch on hydrated copy → 4,380 rows; `net_margin` 63 groups, `roe` 60, `asset_turnover` 61 (FY2025). |
| AC-2 batch offline-only, endpoints cache-aside | ✅ | `import duckdb` stays lazy in `peer_distribution.py:66`; spread endpoints call only `dist_repo.list_for_metric/list_for_group/latest_fy_year` (grep: no SQL/duckdb in routes). |
| AC-3 cross-sector returns qualifying groups; metric validation | ✅ (revised) | `/v1/sectors/spreads?metric=net_margin` → 63 boxes, qualifying only (no zero-fill); `roe` now 200 (offered set broadened per operator); `gross_margin`/bogus → 404. pytest `test_cross_sector_spreads_*`. |
| AC-4 cross-sector chart + metric selector, theme/CSP-safe | ✅ | `sectors.png`/`sectors-spreads.png`: grouped selector (Profitability / Liquidity & solvency), box per sector, vendored Plot; single light theme, token-driven. |
| AC-5 per-sector box per metric, empty per missing metric never 0 | ✅ | `sectors-expanded.png`: group 60 small-multiple (net margin/ROE/current ratio/debt-to-equity); seed group 28 omits L/S → those boxes absent, not zero. |
| AC-6 caveats reused (`_PEER_CAVEATS`: POSITION-not-verdict, N/A-excluded-never-0, SIC coarse, min-size) | ✅ | `_SPREAD_CAVEATS = _PEER_CAVEATS + [box-is-a-spread, coverage-limited]`; "How to read these spreads (6 notes)" disclosure rendered in every spread view. |
| AC-7 no missing value as 0; explicit empty state | ✅ | `sectors-spreads-empty.png` (`quick_ratio`): "NO SECTOR SPREAD TO SHOW YET … it is not zero." Per-sector omit path + `fmtCell`/`—` discipline. |
| AC-8 no alpha/timing/price; ordering descriptive | ✅ | Chart caption: "ordered by median — descriptive, not a ranking of quality"; lede: "not a better or worse sector." No price/alpha copy anywhere. |
| AC-9 `peer_count` per box shown | ✅ | `SectorSpread`/`MetricSpread` carry `peer_count`; shown in tooltip (cross-sector) and the mono "N companies · min · median · max" readout (per-sector). |
| AC-10 no raw SQL in API; DuckDB batch-only; DB behind repo | ✅ | New reads are `MetricDistributionRepository` methods; API grep clean; guardrails 5/6/7 held. |
| AC-11 pytest green + e2e green on real+seeded data | ✅ | 473 passed; e2e all errors=0; real-data endpoint drive confirmed. |

## Honesty contract — verified
- **Empty ≠ 0**: `sectors-spreads-empty` shows an explicit empty state stating "it is not zero."
- **Extreme tails honest** (`sectors-spreads-clip`, `interest_coverage`): whiskers clip to a
  readable view with `▸` markers + caption "3 sectors reach beyond the axis … nothing is clipped
  from the data" — the true min/max stay in the row/tooltip.
- **Spread = position, not verdict**: single neutral accent, no good/bad color; ordering captioned
  as descriptive.
- **Provenance/label**: every metric carries its label + unit; the coverage-limited caveat is
  explicit about the L/S sparsity.

## Notable finding (surfaced during QA, operator-resolved)
On the hydrated volume the four liquidity/solvency metrics are near-empty market-wide
(`current_ratio` 1 sector, `debt_to_equity` 0) because the ingest has headline concepts broadly
but the granular balance-sheet/income concepts (AssetsCurrent 68 ciks, LongTermDebt 34, etc.) only
for tens. The operator chose to **broaden the spread set** to the broadly-covered profitability
metrics (populated ~60 sectors) plus the L/S metrics (honest empties that fill in later). The
implementation honors this and the empty-state UX makes the sparsity truthful, not broken. A
**separate follow-up task** for granular-concept coverage is recorded in
`docs/ROADMAP_SECTOR_ANALYTICS.md`.

## Handoff → operator / DevOps
- **Ready to deploy** (operator-gated). The branch is UNCOMMITTED.
- **Deploy MUST run the batch on the prod volume** to populate `metric_distributions`, or the
  spreads honestly show empty: `python -m secfin.analytical.peer_distribution` (analytical extra).
  This is the same batch D1 didn't run; it is idempotent (full recompute).
- **Cleanup**: remove the 7.2G scratch `data/spread_verify.db` before wrap-up
  (`docker compose run --rm test rm /app/data/spread_verify.db`).
- 3 low-severity polish items in the code-review findings are optional follow-ups, not blockers.

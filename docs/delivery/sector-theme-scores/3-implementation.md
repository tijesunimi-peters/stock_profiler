# Implementation — Composite sector theme scores (Phase 0)

Stage 3 (Senior Backend Engineer) handoff → QA. Backend-only; no frontend stage.
Branch: **`sector-theme-scores`** (off `master`). Uncommitted.

## What changed and why

Implements `2-architecture.md` end to end. A 0–100 composite health score per `(SIC group, period)`
for the five backable themes, materialized offline and served cache-aside.

**New files**
- `src/secfin/normalize/themes.py` — `THEMES` (theme → constituents, scorecard order),
  `DEFERRED_THEMES` (accounting_quality, structure_activity), `THEME_LABELS`,
  `MIN_SECTORS_FOR_ZSCORE=3`, `min_constituents()`. Import-time guard raises if a constituent lacks
  a direction.
- `src/secfin/analytical/sector_theme_scores.py` — the **pure-Python** batch (D5: no DuckDB; input
  `metric_distributions` is already aggregated). Pure core `compute_scores()` split from I/O
  (`load_medians`, `run_sector_theme_scores`). CLI: `python -m secfin.analytical.sector_theme_scores`.
- `src/secfin/storage/sector_theme_score_repository.py` (+ `sqlite_…`) — parent `sector_theme_scores`
  + child `sector_theme_components` tables, `bulk_upsert`/`clear`/`list_for_period`/
  `components_for_period`/`latest_fy_year` (coverage-aware)/`count`/`close`.
- `tests/test_sector_theme_scores.py` — 14 tests mapping the AC→check table.

**Edited**
- `normalize/metrics.py` — `METRIC_DIRECTION` map + `higher_is_better()` (KeyError on unknown).
  Dollar-level metrics (`fcf`, `net_debt`) deliberately absent (scale-free rule).
- `storage/metric_distribution_repository.py` (+ sqlite) — `list_for_metric_all_periods()`.
- `normalize/schema.py` — `ThemeConstituent`, `SectorThemeScore`, `SectorThemeScores`,
  `SectorThemeScoreList`.
- `api/routes.py` — `get_sector_theme_score_repo` dep, `_THEME_SCORE_CAVEATS` +
  `_THEME_SCORE_NORMALIZATION`, `GET /v1/sectors/theme-scores` (declared **before** `/sectors/{group}`
  so the literal path isn't swallowed), deferred markers injected at the serve layer.
- `api/main.py` — wire + close `sector_theme_score_repo`.
- Docs: `DATA_MODEL.md` (new section), `ROADMAP_SECTOR_ANALYTICS.md`, `REDESIGN_SECTOR_OVERVIEW.md`,
  `CLAUDE.md` (layout + commands).

## Endpoint contract (for QA and the future UI phase)

`GET /v1/sectors/theme-scores?year=<int|null>&period=FY` → `SectorThemeScoreList`:
`{ fiscal_year, fiscal_period, peer_basis, normalization, caveats[], sectors[] }`. Each sector:
`{ group, group_label, themes[] }`; each theme either `scored:true` with
`{score, percentile, rank, rank_of, delta_vs_prior_fy, constituents[]}` or `scored:false` with
`{reason}`. `constituents[]`: `{metric, label, higher_is_better, median, oriented_z}`. Default year
= latest well-covered FY. Empty `sectors` is a valid 200.

## How I verified

- **`pytest` (Docker):** full suite **506 passed, 6 skipped** (+17 vs the prior 489, no regressions).
  New file: 14/14 pass.
- **`ruff`** (E/F/I/UP/B, line-length 100): my new/edited lines clean. Pre-existing untouched noise
  only — `routes.py` B008 (the codebase-wide FastAPI `Depends()`-in-defaults idiom; my endpoint
  follows it) and one pre-existing `schema.py:215` E501 (identical on `master`).
- **Real data (AC-14)** on the re-ingested scratch volume
  `data/granular_scratch/granular_verify.db` (110,509 `metric_distributions` rows). Ran the batch →
  **21,053 score rows + 75,771 component rows** (21 metrics). Read-back @ latest FY (**2025**;
  barely-filed 2026 correctly skipped):
  - theme coverage: profitability 62, growth 63, financial_health 63, cash_investment 61,
    operating_efficiency 51 sectors. (Financial health is well-populated here **because this scratch
    DB had the granular re-ingest**; on the current PROD volume it will be sparse until the deferred
    re-ingest — same status as the other sector batches.)
  - deferred themes materialized: **0** (serve-layer only).
  - ranks dense `1..rank_of` with **0** violations.
  - **hand spot-check:** profitability rank-1 sector `60` — stored score **76**, recomputed
    `round(50+15·mean(oriented_z)) = 76`, `composite_z` match to 1e-6.
  - `constituent_count == #component rows` for every score (0 mismatches).
- **End-to-end endpoint** (TestClient over the scratch DB): `200`, FY 2025, 63 sectors,
  normalization + 9 caveats. Sector `60` (Depository Institutions) shows 4 scored themes + the 2
  deferred markers — and **correctly omits operating_efficiency** (banks have no inventory/COGS →
  below min constituents → omitted, not zeroed): AC-6 on real data.

## What QA should probe

- **AC-6 honesty on real data:** confirm an omitted theme (e.g. banks' operating_efficiency) is
  *absent*, not `scored:false` and not `0`; and that `scored:false` is used *only* for the two
  deferred themes.
- **AC-11:** no DuckDB anywhere on the request path (there is none in this feature); route reads via
  the repo; no raw SQL added to `routes.py`.
- **Route ordering:** `/v1/sectors/theme-scores` resolves to the theme-scores route (has
  `normalization`), not `/sectors/{group}`.
- **AC-4:** `delta_vs_prior_fy` is `null` (not `0`) for a sector/theme with no prior FY.
- Caveats include the normalization line + the "position, not a verdict" + "not yet scored" lines.

## Notes / deferred

- **Prod batch run is a deferred DevOps step** (like `peer_distribution`/`sector_dupont`/
  `sector_lifecycle`): the live site returns an honest-empty `/v1/sectors/theme-scores` until
  `python -m secfin.analytical.sector_theme_scores` runs on a volume that has `metric_distributions`
  populated (needs the bulk companyfacts backfill + `peer_distribution` first).
- The scratch DB now carries the two new tables (non-destructive; it only added them).
- No UI — the scorecard/peer-strip/decomposition rendering is Phases 1–3 of the redesign.

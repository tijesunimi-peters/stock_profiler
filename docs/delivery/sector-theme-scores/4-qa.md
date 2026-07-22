# QA — Composite sector theme scores (Phase 0)

Stage 4 (QA Tester). Verdict: **PASS**. Backend-only (no UI this phase). Verified by exercising the
running feature independently — full suite, the batch, and the live endpoint over the hydrated
scratch volume `data/granular_scratch/granular_verify.db` (110,509 `metric_distributions` rows) —
not by reading the diff.

Branch: `sector-theme-scores`. `pytest` **506 passed, 6 skipped** (+17 new, no regressions).
`ruff` clean on the feature source files.

## Per-AC verdict

| AC | Verdict | Evidence |
|----|---------|----------|
| AC-1 score = 50+15·z of oriented constituent means, reproducible by hand | **PASS** | Unit tests + real-data spot-check: banks (SIC 60) profitability served **76**, recomputed from the served decomposition `round(50+15·mean(oriented_z)) = 76`. |
| AC-2 orientation (lower-is-better flips sign) | **PASS** | Unit test `test_oriented_z_..._inverted`; real `debt_to_equity` (flag=lower-better): lowest-median sector z=**+1.654**, highest-median z=**−3.219** (lower d/e → more favorable). |
| AC-3 rank dense, 1 = most favorable, rank_of correct | **PASS** | SQL over materialized rows: **0** groups violate dense `1..rank_of`; banks profitability = rank **1/62**. |
| AC-4 delta null (not 0) when no prior FY | **PASS** | Earliest FY **2007**: all rows delta **NULL**. 420 rows carry a legit `0.0` "unchanged" delta — correctly distinct from NULL-for-missing. |
| AC-5 decomposition (constituents + oriented z) | **PASS** | Endpoint returns `constituents[]` with `metric,label,higher_is_better,median,oriented_z`; `normalization` present. |
| AC-6 N/A excluded, theme omitted — never 0/scored:false | **PASS** | Banks **omit `operating_efficiency` entirely** (no inventory/COGS) — absent from both scored and scored:false lists. `constituent_count == #component rows` for every score (0 mismatches). |
| AC-7 deferred themes = scored:false + reason | **PASS** | `scored:false` set across ALL sectors is **exactly** `{accounting_quality, structure_activity}`; each has a `reason`, `score/rank = null`. Not materialized in the table (0 rows). |
| AC-8 below-min sectors absent | **PASS** | **0** scored sectors lack a `metric_distributions` row. |
| AC-9 caveats + honest empty 200 | **PASS** | 9 caveats incl. normalization; empty DB → `sectors: []`, status **200**. |
| AC-10 no verdict beyond favorability | **PASS** | Caveats state a score is a **"position"**, **"not a … verdict"**, and the scale-free-only rule; `normalization` states the method. See observation O-1. |
| AC-11 DuckDB never on the request path; no raw SQL in routes; DB behind repo | **PASS** | `grep`: no `duckdb` in `api/`, none in the batch (pure-Python D5); no `SELECT/INSERT/.execute` in `routes.py`; endpoint reads via `SectorThemeScoreRepository`. |
| AC-12 direction map single-source, loud fail | **PASS** | Unit test: every themed constituent has a direction; `higher_is_better("unknown")` raises `KeyError`; `fcf`/`net_debt` absent (scale-free rule). Import-time guard in `themes.py`. |
| AC-13 pytest green | **PASS** | 506 passed, 6 skipped. |
| AC-14 real-data materialize + spot-check | **PASS** | Batch **idempotent re-run** → 21,053 scores + 75,771 components; latest FY **2025** (2026 barely-filed, skipped); 5 themes populate (prof 62 / growth 63 / fin-health 63 / cash 61 / op-eff 51). |
| AC-15 docs updated | **PASS** | `DATA_MODEL.md` (new section), `ROADMAP_SECTOR_ANALYTICS.md`, `REDESIGN_SECTOR_OVERVIEW.md`, `CLAUDE.md` (layout + commands) all modified. |

## UI/UX review

N/A — backend-only phase (no `static/` changes; no e2e render check applicable). The scorecard,
peer strip, and decomposition UI are Phases 1–3 of `REDESIGN_SECTOR_OVERVIEW.md` and will get a full
UI/UX review then.

## Observations (non-blocking)

- **O-1 (for the Phase 2 UI brief):** a sector whose constituent median is a **negative-equity
  artifact** (e.g. SIC 78 `debt_to_equity` median −0.057) gets a *favorable* oriented z, because the
  z-score treats a lower raw median as better. This is mechanically correct and honest — the
  decomposition surfaces the raw median and the caveats frame scores as positions, not verdicts —
  but the UI should make such distortions legible (the DuPont aggregate already carries a
  negative-equity caveat). Not a data-layer defect; noted for the scorecard's copy/affordances.
- The `financial_health` theme is well-populated here (63 sectors) **only because this scratch DB had
  the granular concept re-ingest**. On the current prod volume it will be sparse (honest-empty) until
  the deferred bulk re-ingest — same status as `peer_distribution`/`sector_dupont`/`sector_lifecycle`.

## Handoff

**Verdict: PASS — no defects.** A green report unlocks a deploy *request*, not the deploy itself.

**Ready to deploy (code), with one operator-gated data step:**
- The code (endpoint + batch + tables) is deployable on the `sector-theme-scores` branch.
- **Prod is honest-empty until DevOps runs `python -m secfin.analytical.sector_theme_scores`** on a
  volume that already has `metric_distributions` populated (needs the bulk companyfacts backfill →
  `peer_distribution` first). This is the same deferred-DevOps posture as the sibling sector batches.
- Uncommitted, not deployed. Next: operator may commit the branch and/or request a deploy
  (`/devops-engineer`).

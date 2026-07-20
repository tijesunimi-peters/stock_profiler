# Implementation: institutional-holder treemap (Phase 2a) — backend

**Role:** Senior Backend Engineer → handoff to Senior Frontend Engineer (same branch)
**Task slug:** `institutional-tab-viz` (Phase 2a)
**Branch:** `institutional-conviction-heatmap`
**Date:** 2026-07-19
**Implements:** `2c-architecture-phase2a-institutional-treemap.md` (backend half).

---

## What changed (backend)

Converted `GET /companies/{symbol}/institutional-conviction` from "% of shares outstanding" to
"share of the ingested institutional (13F) shares pool" — a **net simplification** (the whole
shares-outstanding path is gone).

- `src/secfin/api/routes.py`:
  - **Deleted** `_shares_outstanding_asof` and removed the `repo: RawFactRepository` dependency +
    the `_facts_for_cik` call — **no companyfacts read** anymore. (`candidate_tags`, `RawFact`,
    `_facts_for_cik`, `RawFactRepository` stay imported; still used by other endpoints.)
  - Numerator unchanged: per filer, Σ **SH-equity** shares (skip `put_call`; skip `PRN`); a filer
    with only options/PRN never enters the pool; `has_null` flags a blank share count.
  - Denominator = `pool_total = Σ SH shares over ALL valued filers` (full `holders_of`, not top-N).
  - Rewrote `_CONVICTION_CAVEATS` to the pooled-shares framing (ingested 13F shares, **not** shares
    outstanding / not % of company / not all institutional; coverage-dependent; SH-only; discretion
    not ownership).
- `docs/DATA_MODEL.md`: rewrote the treemap subsection to match.
- `tests/test_institutional_viz_routes.py`: rewrote the conviction block for pooled shares (dropped
  the shares-outstanding seeding + `RawFact`/`SQLiteRawFactRepository` imports).

## The JSON contract the frontend must consume

`GET /v1/companies/{symbol}/institutional-conviction?period=YYYY-MM-DD&top=20`

```json
{
  "cik": 320193, "cusips": ["037833100"], "period": "2026-03-31",
  "caveats": ["… _ISSUER_CENTRIC_CAVEATS + pooled-shares caveats …"],
  "pool_total_shares": 2230000000,        // denominator; null when the pool is empty
  "ingested_filer_count": 3,              // # valued filers in the pool (for the caption)
  "holders": [                            // top-N valued filers, largest share first, all status "ok"
    {"manager_cik": 102909, "manager_name": "VANGUARD GROUP INC", "issuer_name": "APPLE INC",
     "shares": 1310000000, "weight": 0.587, "status": "ok", "reason": null}
  ],
  "other_ingested": {"filer_count": 5, "shares": 120000000, "weight": 0.054} | null,  // filers beyond top-N
  "na_filers": [{"manager_cik": 1, "manager_name": "…", "reason": "reported no share count …"}]
}
```

- **`holders[].weight`** is a fraction in `[0,1]` — a filer's slice of the **whole pool**. Shown
  weights **+ `other_ingested.weight` sum to ~1.0** (they don't sum to 1.0 alone when `top` caps).
- **`other_ingested`** → the "**Other ingested filers**" tile (a minority sibling — never label it
  "not held"). `null` when all filers are shown.
- **`na_filers`** → list below the treemap ("No computable share (reported no share count): …").
  Never a square, never 0.
- **Empty:** `pool_total_shares: null`, `holders: []`, `other_ingested: null` → honest empty state.
- The response **no longer** has `shares_outstanding` / `shares_outstanding_as_of` — the current
  (round-3) `app.js` treemap reads those and renders a "not reported by these filers" remainder;
  **that must be replaced** with the pool-based rendering above.

## Verification (backend gate)

- `docker compose --profile test run --rm test` → **376 passed, 6 skipped**. New conviction tests:
  share = shares/pool (weights sum to 1.0), option+PRN excluded from filer & pool, options-only
  filer excluded, multi-class SH summed, **top-cap → `other_ingested`** (weight over the whole
  pool), **N/A filer excluded from the pool** (`na_filers`), empty quarter → `pool_total_shares:
  null`. Contract asserted end-to-end via TestClient (real ASGI app + seeded repos).
- ruff clean (F,I) on `routes.py` + the test file; no unused imports; no E501 in the changed range.

## Handoff → Senior Frontend Engineer (same branch)

Convert `app.js` `convictionHeatmap` + `company.js` from the shares-outstanding treemap to this
contract: leaves = `holders` (+ an "Other ingested filers" tile from `other_ingested`); drop the
`shares_outstanding`/`as_of` note (use `pool_total_shares` + `ingested_filer_count`); N/A footnote
from `na_filers`; caption/title to the pooled-shares framing (see `_CONVICTION_CAVEATS` and
`docs/DATA_MODEL.md`). Verify with the e2e headless check + eyeball AAPL (dense ~59/29/13, no giant
remainder) and JPM (~60/40). Backend is green; no Python changes needed on your side.

---

# Implementation (frontend) — Senior Frontend Engineer

**Same branch** (`institutional-conviction-heatmap`). Converted the treemap UI to the pooled-shares
contract above.

## What changed (frontend)

- `src/secfin/api/static/app.js` `convictionHeatmap`:
  - Reads the new contract: `holders` (all `ok`, sized by `weight` = share of pool),
    `other_ingested` `{filer_count, shares, weight}`, `na_filers`, `pool_total_shares`,
    `ingested_filer_count`. Dropped `shares_outstanding`/`shares_outstanding_as_of`.
  - Leaves = the filers **+** an **"Other ingested filers (N)"** tile from `other_ingested` (neutral
    fill, dashed border, labelled — a minority sibling, **not** a "not held" remainder). The
    shares-outstanding "not reported by these filers" remainder is gone.
  - Note line reframed: "Sized by each filer's share of the {pool} shares held by the {N} ingested
    13F filers this quarter — a share of the reported institutional holdings, **NOT of the
    company**." N/A footnote from `na_filers`. Caption reframed to the pooled/coverage/discretion
    framing (no shares-outstanding, no "% of the company").
  - Empty-state branches: "no usable share counts" (na_filers but no valued) vs "no holders
    ingested". d3 treemap render, single accent hue + size, tokens via `cssVar` (theme-aware) —
    unchanged.
- `src/secfin/api/static/company.js`: section title → "Which 13F filers hold the most of this
  company"; `mountConviction` comment + empty copy reframed. Self-fetching/skip-on-failure unchanged.

## Verification (frontend gate)

- `docker compose build api` + `docker compose --profile e2e up --abort-on-container-exit
  --exit-code-from e2e` → **HEADLESS CHECK: PASS**, `errors=0` on all 13 pages.
- Eyeballed `data/e2e-shots/` (21:23):
  - **AAPL** — a **dense** treemap, no giant remainder: Vanguard **58.7%** / State Street **28.7%**
    / Berkshire **12.6%** fill the box and sum to 100%. Note: "…2.23B shares held by the 3 ingested
    13F filers…, NOT of the company." Caption carries the pooled/discretion/coverage caveats.
  - **JPM** — NORTHLESS **60.0%** + EVERPEAK **40.0%** (pool 3.8M); geography empty-state guard
    intact; no console errors.
  - All prior components (composition strip, Top-N, tiles, accumulation series, choropleth) intact.
- Backend `pytest` remained green (376) from the backend stage; no Python touched here.

## Handoff → QA Tester

Branch `institutional-conviction-heatmap` (full-stack, on top of the restored round-3 base). QA
should probe: the treemap is dense (weights + any "Other ingested filers" tile sum to ~100%, no
dominating remainder); the honesty labels (share of *ingested* 13F shares — NOT shares outstanding
/ NOT % of company / NOT all institutional; coverage-dependent; discretion not ownership;
options/PRN excluded); N/A filers listed, never a 0 or a square; the "Other ingested filers" tile
only appears when `top` caps filers and is never labelled "not held"; both light/dark themes; empty
quarter → honest empty state. `pytest` + e2e both green.

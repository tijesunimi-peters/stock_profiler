# Architecture: institutional-tab viz — Phase 2a (institutional-holder treemap)

**Role:** Principal Architect → handoff to Senior Engineer
**Task slug:** `institutional-tab-viz` (Phase 2a)
**Date:** 2026-07-19
**Designs against:** `1c-brief-phase2a-institutional-treemap.md`.
**Base:** the round-3 treemap has been **restored to the working tree** (`git stash apply
stash@{0}`). This design is the **delta** from that code — the re-scope is a net *simplification*.

---

## Scope re-check (Track 1, buildable, simpler than the undone version)

Pure composition over 13F holdings we already have — **no shares-outstanding join, no companyfacts
fetch, no new canonical concept, no DuckDB, no cross-manager scan.** The measure is now:

```
weight(filer) = filer's SH-equity shares of the issuer
                / Σ SH-equity shares across ALL ingested filers of the issuer (this quarter)
```

The denominator is the **pool of ingested institutional shares**, computed over the *full*
`holders_of` result (not the shown top-N). Because the shares sum to ~100% across the pool, the
treemap tiles the holder base itself — dense, no dominating remainder. This is the exact fix for the
round-4 kill reason (`4b-qa-phase2a.md`): the shares-outstanding remainder is gone.

**Guardrail check:** G3/G4 no new concept → no `mapping.py` change; G5 all reads via `holders_of`,
pure Python composition in the route, no raw SQL; G6/G7 no DuckDB / no shares-outstanding fetch /
no cross-manager scan; CIK `int`, shares in raw unit, derived `weight` carries `status`+`reason`.

---

## Delta from the restored round-3 code

### store — `holders_of` (already done, keep)
`holders_of` already carries `put_call` / `shares_or_principal` (restored from the stash;
`IssuerHolder` + the SELECT). **No further store change** — no new repo method (the pool is a
composition, like round-2's "denominator over all holders").

### serve — `src/secfin/api/routes.py` (the main change: strip the shares-outstanding path)

1. **Delete** the `_shares_outstanding_asof` helper and its use.
2. **Remove** the `repo: RawFactRepository = Depends(get_repo)` parameter and the `_facts_for_cik`
   call from `get_institutional_conviction` (no companyfacts read anymore).
3. **Numerator (keep):** per manager, Σ `shares` over SH-equity rows — skip `put_call is not None`
   and `shares_or_principal == "PRN"`; track `has_null` (equity row with no share count). A manager
   with no SH-equity row never enters `per_manager` (options-only → excluded).
4. **Denominator (new):** `pool_total = Σ m["shares"] for all m in per_manager if not m["has_null"]
   and m["shares"] > 0` — over the **full** pool, not the top-N.
5. **Split output into three groups:**
   - `valued = [m for m in per_manager if not m["has_null"] and m["shares"] > 0]`, sorted by shares
     DESC. `weight = m["shares"] / pool_total` (when `pool_total > 0`).
   - `holders` = the top-`top` of `valued` (each `{manager_cik, manager_name, issuer_name, shares,
     weight, status:"ok", reason:null}`).
   - `other_ingested` = the valued filers **beyond** top-`top`, aggregated:
     `{filer_count, shares, weight}` — or `null` when none. **This is the "other ingested filers"
     tile — a minority sibling, never the old "not held" remainder.**
   - `na_filers` = filers with an equity position but no usable share count
     `{manager_cik, manager_name, reason}` — excluded from the pool, never zero-filled.
6. **Response shape:**
   ```json
   {
     "cik": ..., "cusips": [...], "period": "...", "caveats": _CONVICTION_CAVEATS,
     "pool_total_shares": <int|null>,          // denominator; null when pool empty
     "ingested_filer_count": <int>,            // # valued filers in the pool (for the caption)
     "holders": [ {manager_cik, manager_name, issuer_name, shares, weight, status, reason} ... ],
     "other_ingested": {"filer_count": N, "shares": S, "weight": W} | null,
     "na_filers": [ {manager_cik, manager_name, reason} ... ]
   }
   ```
   `weight`/`shares` are `null` on nothing here (holders are all `ok`; N/A live in `na_filers`).
   When `pool_total` is 0/empty → `holders: []`, `other_ingested: null`, `pool_total_shares: null`.
7. **Rewrite `_CONVICTION_CAVEATS`** (extends `_ISSUER_CENTRIC_CAVEATS`):
   - "Percentage is this filer's reported 13F shares as a share of the TOTAL 13F shares across all
     INGESTED filers of this company — NOT the company's shares outstanding, NOT all institutional
     owners, only the 13F filers ingested this quarter."
   - "Coverage-dependent: as more filers are ingested each filer's share shrinks; an empty or thin
     result is not a confirmed zero." (plus the standing `_ISSUER_CENTRIC_CAVEATS`.)
   - "Common-equity (SH) shares only — option (put/call) and principal (PRN) rows are excluded from
     both a filer's shares and the pool."
   - "13F shares are those a manager has investment DISCRETION over (often client funds), not the
     firm's own beneficial ownership."
8. **Docstring + OpenAPI example + `summary`** updated to the pooled-shares measure. Keep the route
   path `/companies/{symbol}/institutional-conviction` and the `top` param (default 20, 1..50).

### normalize — none. No new concept, no `mapping.py`, no `statements.py`.

### static — `src/secfin/api/static/app.js` `convictionHeatmap`

- **Leaves** = `holders` (each sized by `weight`) **+** one `Other ingested filers (N)` leaf sized
  by `other_ingested.weight` when present. **Remove the shares-outstanding "not reported by these
  filers" remainder** — the "other" tile is now a labelled minority sibling (neutral fill, no
  "not held" wording).
- Filer squares: single accent hue, area = weight, labelled name + `fmt.pct(weight)` when big
  enough; hover title always. Keep the d3 treemap layout (restored).
- **Replace the note line** ("Box = the whole company (… shares outstanding, as of …)") with:
  "Sized by each filer's share of the {fmt.shares(pool_total_shares)} shares held by the
  {ingested_filer_count} ingested 13F filers this quarter." (No shares-outstanding, no as-of.)
- **N/A footnote** from `na_filers` (unchanged pattern): "No computable share (reported no share
  count): …". Never a square, never 0.
- **Empty state** when `!holders.length`: "No ingested 13F share counts to size" (distinguish "no
  holders at all" from "holders exist but no usable share count"). No shares-outstanding branch.
- **Caption** rewritten to the pooled framing (AC-2/3/4/5): share of the *ingested* 13F shares —
  not shares outstanding, not all institutional owners; SH-only; discretion-not-ownership;
  coverage-dependent. Reuse the existing composition-strip phrasing as the anchor.
- **Card title:** "Which 13F filers hold the most of this company (by ingested shares)".

### static — `src/secfin/api/static/company.js`
- `convictionSection()` title → e.g. "Which 13F filers hold the most of this company".
- `mountConviction` empty-state copy → pooled framing. (Fetch/skip-on-failure pattern unchanged.)

### fixtures & checks
- `scripts/seed_fixture.py`: **no shares-outstanding seed needed** (remove any the stash added — the
  round-3 restore did not add companyfacts seeds; the real fixtures stay). The demo filers already
  give dense treemaps: **AAPL** Vanguard/State Street/Berkshire pool → ~59% / ~29% / ~13% (shares
  basis); **JPM** NORTHLESS/EVERPEAK → ~60% / ~40%. No "other" tile (all filers shown), no N/A.
- Optional (nice-to-have, not required): add one JPM filer with a null share count to exercise the
  `na_filers` footnote in the e2e shot, and/or enough AAPL filers to trigger the "other ingested
  filers" tile. Route tests cover both regardless.
- `scripts/headless_check.js`: comment already generic; no change required.

### docs — `docs/DATA_MODEL.md`
Rewrite the "ownership treemap" subsection (restored from the stash) to the **pooled-shares**
measure: denominator = Σ SH shares of ingested filers (not shares outstanding); SH-only; coverage
caveat; the "other ingested filers" tile; N/A excluded from the pool. **Remove** the
`_shares_outstanding_asof` / companyfacts description.

---

## Test strategy — `tests/test_institutional_viz_routes.py` (rewrite the conviction block)

Drop the shares-outstanding seeding (`_seed_shares_outstanding` / `_seed_dummy_fact` / the `RawFact`
import) — no companyfacts needed now.

- **share = filer shares / pool**, and the shown weights (+ `other_ingested.weight`) **sum to ~1.0**.
- **options (put/call) + PRN excluded** from a filer's shares AND the pool.
- **options-only filer excluded** entirely.
- **multi-class** SH shares summed into one filer row.
- **top-N cap → `other_ingested`**: seed >N filers, assert `holders` capped, `other_ingested`
  carries the rest, and `pool_total_shares` = the whole pool (a shown filer's weight is its slice of
  the *whole* pool, not the visible subset).
- **N/A**: a filer with an equity position but null shares → in `na_filers`, excluded from
  `pool_total_shares`, never a 0.
- **empty quarter** → `holders: []`, `pool_total_shares: null`.
- `_CONVICTION_CAVEATS` present; standing `_ISSUER_CENTRIC_CAVEATS ⊆` it.

**e2e:** `docker compose --profile e2e up … --exit-code-from e2e` green; eyeball the AAPL treemap
(dense, ~59/29/13 squares, no giant remainder) and JPM (~60/40), both themes, caption present.

---

## Acceptance criteria → concrete checks

| Criterion | Check |
|---|---|
| **AC-1** weight = shares ÷ pool; squares (+other) sum to 100% | route tests (sum≈1.0, top-N+other); treemap areas |
| **AC-2** labelled "share of ingested 13F shares", not shares outstanding / not % of company | caption + `_CONVICTION_CAVEATS[0]`; diff review |
| **AC-3** coverage-dependent + empty≠zero | caveat text; empty-quarter test |
| **AC-4** SH-only, options/PRN excluded | route tests (option/PRN/options-only) |
| **AC-5** discretion, not beneficial ownership | caption + caveat |
| **AC-6** null share count → N/A in `na_filers`, never 0 | route test; UI footnote |
| **AC-7** single-quarter, quarter shown, both themes, thin/empty state | response `period`; e2e screenshots |
| **AC-8** existing components intact; pytest + e2e green | diff review; CI |

---

## Handoff → Senior Engineer

The round-3 treemap is in your working tree (stash applied). Implement the delta in this order:
**routes.py** (strip shares-outstanding: remove `_shares_outstanding_asof`, the `RawFactRepository`
dep and `_facts_for_cik`; pool by shares; add `other_ingested`/`na_filers`/`pool_total_shares`;
rewrite caveats + docstring + example) → **app.js** (leaves = holders + "other ingested filers"
tile; drop the shares-outstanding note; rewrite caption/empty-state/title) → **company.js**
(titles/copy) → **tests** (rewrite for pooled shares; drop the companyfacts seeding) → **DATA_MODEL**
(rewrite the subsection). Self-verify with the e2e headless check + eyeball the screenshots before
QA. Keep all existing components intact (AC-8). Do not commit/push or deploy unless asked.

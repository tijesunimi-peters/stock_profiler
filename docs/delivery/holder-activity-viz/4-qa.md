# QA report: derived holder-activity visualizations

**Role:** QA Tester → handoff to operator / DevOps
**Task slug:** `holder-activity-viz`
**Branch:** `holder-activity-viz`
**Date:** 2026-07-20
**Verdict:** ✅ **PASS — ready to deploy** (deploy remains operator-gated)

---

## Test runs

| Check | Command | Result |
|-------|---------|--------|
| Full unit/route suite | `docker compose --profile test run --rm test` | **398 passed, 6 skipped** |
| New tests | `pytest tests/test_activity_series.py` | **8 passed** |
| e2e headless render | `docker compose --profile e2e up --abort-on-container-exit --exit-code-from e2e` | **HEADLESS CHECK: PASS**, all pages `errors=0` |
| Live HTTP probe | e2e-app + `Sec-Fetch-Site: same-origin` | see per-AC evidence below |
| Diff review | `code-review` (8 angles, medium) | 2 non-blocking cleanup findings, 0 correctness/honesty defects |

---

## Acceptance criteria

| AC | Verdict | Evidence |
|----|---------|----------|
| **AC-1** ≤6 quarters oldest→newest, fewer when fewer exist | ✅ | AAPL live order `['2025-09-30','2025-12-31','2026-03-31']`; `?quarters=1` → 1 (newest); JPM has 1 transition (fewer than 6) and renders it; pytest `respects_quarters_bound`. |
| **AC-2** counts = `diff_holders` = `/institutional-activity?period=P` by action | ✅ | Live: **parity True for all 3 AAPL transitions**; pytest `counts_match_single_quarter_endpoint`. |
| **AC-3** buckets exactly new/added/reduced/exited; `unchanged` not counted | ✅ | Endpoint calls `diff_holders` without `include_unchanged`; `summarize_activity` only buckets the 4 actions; pytest. |
| **AC-4** inflow=Σ(new+added), outflow=Σ\|reduced+exited\|, net=inflow−outflow, in shares | ✅ | Live: `net == inflow-outflow` True for all transitions (e.g. 2026-03-31 in 740M / out 20M / net 720M); pytest sign + equality tests. |
| **AC-5** no value summed/stacked across quarters | ✅ | Endpoint & both builders use counts (bar) / shares (flow) only; no `value` referenced; code review confirmed. |
| **AC-6** DERIVED-labeled + standard 13F caveats on every response & both captions | ✅ | Live: **8 caveats** incl. derived-not-trades, omitted-not-zero, counts/shares-not-value, not-fund-flows; chart captions say "DERIVED … never reported trades". |
| **AC-7** gap quarter omitted, no false all-new spike; absent bar ≠ zero | ✅ | pytest `omits_quarter_with_uningested_prior` → `transitions == []` (no all-new bar); caption states omitted-not-zero. |
| **AC-8** no derivable activity → honest empty state, not blank/all-zero | ✅ | pytest single-quarter → `transitions:[]`; frontend shows "Not enough comparable quarters" note (mix) / quiet flow mount; no-CUSIP issuers 404 via the shared `_cusips_for_issuer` contract (same as all sibling endpoints — pre-existing, not introduced). |
| **AC-9** copy distinguishes derived-from-snapshots vs trades; no "trade" wording | ✅ | Both captions: "diffing … 13F holder snapshots — never reported trades"; screenshots verified. |
| **AC-10** existing single-quarter activity section unchanged | ✅ | Screenshots (AAPL + JPM): tiles / diverging bars / dumbbell / detail table render intact below the new section; `renderInstitutionalData` only *adds* `mountActivityTrend()`. |
| **AC-11** CSP-safe, self-contained, no console errors, theme-token-driven | ✅ (see note) | e2e `errors=0`; charts use only vendored Plot/d3 + same-origin fetch; read `:root` tokens via `cssVar` like every shipped chart. **Dark mode: N/A** — the app has no dark theme (no `prefers-color-scheme`/`data-theme` anywhere; STYLE_GUIDE is single-theme). Charts are forward-compatible via token usage. |
| **AC-12** new endpoint pytest-covered incl. multi-quarter+gap+empty; DB behind repo, no raw SQL, no DuckDB | ✅ | 8 new tests; full suite green; endpoint uses `issuer_periods`/`holders_of`/`diff_holders`/`summarize_activity` only — no raw SQL, no DuckDB. |

---

## Screenshots eyeballed (`data/e2e-shots/`)

- `institutional.png` (AAPL, 3 transitions): **mix stacked bar** — 2025 Q3/Q4 = Added(2)+Reduced(1),
  2026 Q1 = New(4)+Added(2)+Reduced(1); 4-category fixed stack order, categorical identity colors
  (no green/red verdict), legend + integer y-axis + honest caption. **Flow chart** — "Shares
  acquired +740.0M" / "Shares divested −20.0M" / "Net ▲ +720.0M shares", labels not clipped,
  single accent + direction, DERIVED caption. Existing single-quarter section intact below.
- `institutional-nolocation.png` (JPM, minimal 1-transition case): single "2026 Q1" mix bar
  (Added=2) and flow ("acquired +350.0K / divested 0 / Net ▲ +350.0K") render cleanly — no
  breakage on thin data.

## Findings (non-blocking cleanup — do NOT block deploy)

1. **[efficiency, low]** `routes.py` — `holders_of` is fetched twice for each interior quarter
   (a period is both a `to_period` and the next transition's prior). ~5 redundant *cheap indexed*
   reads at `quarters=6`; a per-request `holders_of` cache would halve it. Sibling endpoints do the
   same; safe to leave or polish later.
2. **[simplification, very-low]** `company.js` — the flow-mount "No net share flow this quarter"
   branch is effectively unreachable (an emitted transition always has inflow>0 or outflow>0).
   Harmless defensive code.

Neither is a correctness or honesty defect; both are optional follow-ups.

---

## Handoff

✅ **PASS — ready to deploy.** All 12 acceptance criteria verified with evidence; full suite green
(398 passed); e2e clean; honesty contract satisfied (derived-labeled, 8 caveats, counts/shares not
value, empty ≠ zero, omitted ≠ all-new, no "reported trades"). Two minor non-blocking cleanup
findings noted for optional future polish.

**Operator's next options:** commit the `holder-activity-viz` branch, then request a deploy
(`/devops-engineer`, operator-gated) — `/deliver` stops here and does not commit, push, or deploy.

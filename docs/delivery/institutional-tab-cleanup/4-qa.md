# QA report: institutional-tab UI cleanup

**Role:** QA Tester → handoff to operator / DevOps
**Task slug:** `institutional-tab-cleanup`
**Branch:** `holder-activity-viz`
**Date:** 2026-07-20
**Verdict:** ✅ **PASS — ready to deploy** (deploy remains operator-gated)

---

## Test runs

| Check | Command | Result |
|-------|---------|--------|
| Full suite (regression guard; no Python changed) | `docker compose --profile test run --rm test` | **398 passed, 6 skipped** |
| e2e headless render | `docker compose --profile e2e up --abort-on-container-exit --exit-code-from e2e` | **PASS**, all pages `errors=0` (incl. company institutional, JPM institutional, manager) |
| Live DOM assertions | puppeteer, `textContent` (case-insensitive) on both pages | see per-AC evidence |
| Diff review | company.js only, −106/+9 (pure removal); app.js/manager.js untouched (git) | 0 defects |

---

## Acceptance criteria

| AC | Verdict | Evidence |
|----|---------|----------|
| **AC-1** four sections gone from company Institutional tab | ✅ | DOM: "Share of total reported value", "…by value (own scale)", "Prior → current holder allocation" absent. "Derived holder activity" occurs **exactly once** and it is the *retained* mix chart "Derived holder activity **mix** over recent quarters" — the standalone diverging-bars section is gone (`standalone divergingBars removed: true`). grep: no removed title remains in company.js. |
| **AC-2** retained sections still render | ✅ | DOM: all present — "Holders as of…", "Reported shares held over recent quarters", "Where the 13F filers…", "Which 13F filers hold the most…", "…run similar portfolios", "…building or trimming…" (mix), "Derived share flow", "Derived activity vs. prior quarter" (tiles + detail table). Screenshot: stat tiles + holders table + caveats intact, no empty gaps (tab height 6781→5401px). |
| **AC-3** manager page unaffected | ✅ | DOM: manager page has "share of total reported value", "…by value (own scale)", "derived activity", "prior → current allocation" (all true — the manager charts use the shared builders' default titles). `git diff`: `app.js`/`manager.js` **unchanged**. |
| **AC-4** no leftover mounts/refs; no console errors | ✅ | grep: no `#holders-chart-mount`/`#activity-chart-mount`/`#activity-dumbbell-mount` or removed-symbol refs remain (one dangling doc-comment repointed). e2e + DOM runs: **0 console/page errors** on company institutional + manager. |
| **AC-5** honesty preserved | ✅ | Standing precision caveat still renders once at top; retained charts keep their captions; caveats block intact. No caveat/number was sole-rendered by a removed chart (tiles/tables/standing caveat cover the retained data). |

---

## Note on the verification (transparency)

A first DOM pass used `innerText`, which reflects CSS `text-transform: uppercase` on the chart
titles — producing case-mismatched false results. Re-run with `textContent` (raw DOM text) +
case-insensitive matching. That surfaced **3 apparent failures, all confirmed to be
substring/title-matching artifacts, not defects**:
1. "Derived holder activity" *present* on the institutional tab → it is the **retained** mix
   chart "Derived holder activity **mix** over recent quarters"; verified the string occurs
   exactly once and the standalone diverging-bars section is gone.
2–3. Manager page "missing" "Derived holder activity" / "Prior → current holder allocation" →
   the manager charts use the shared builders' **default** titles ("Derived activity", "Prior →
   current allocation"), never the company-tab-specific strings; verified present with the correct
   titles, and `app.js` is provably unchanged.

## Diff review

`company.js` only (−106/+9): removed 3 mount calls, 2 mount `<div>`s, 1 chart `<div>` from the
holders composition block, and the 3 now-unused `mount*` functions; repointed one doc comment.
`signedShares` retained (used by the retained detail table); `fromPeriod`/`holders`/`activity`
still consumed by retained mounts. No broken references, no dead code, no shared-builder change.

---

## Handoff

✅ **PASS — ready to deploy.** All 5 ACs verified with live DOM + screenshot evidence; full suite
green; manager page provably unaffected; no console errors; honesty surface intact.

**Operator's next options:** commit the change on the `holder-activity-viz` branch, then request a
deploy (`/devops-engineer`, operator-gated). `/deliver` stops here and does not commit, push, or
deploy.

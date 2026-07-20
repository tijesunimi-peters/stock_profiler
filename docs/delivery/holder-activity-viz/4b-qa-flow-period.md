# QA report (amendment): period-reactive flow view

**Role:** QA Tester → handoff to operator / DevOps
**Task slug:** `holder-activity-viz` (amendment `-flow-period`)
**Branch:** `holder-activity-viz`
**Date:** 2026-07-20
**Verdict:** ✅ **PASS — ready to deploy** (deploy remains operator-gated)

---

## Test runs

| Check | Command | Result |
|-------|---------|--------|
| Full suite (no-Python-change regression guard) | `docker compose --profile test run --rm test` | **398 passed, 6 skipped** |
| e2e headless render | `docker compose --profile e2e up --abort-on-container-exit --exit-code-from e2e` | **PASS**, institutional `errors=0` |
| Period-selector drive (independent) | puppeteer against e2e-app, reading live DOM across quarter selections | see per-AC evidence |
| Diff review | inline (≈10-line frontend diff; correctness/removed-behavior/cross-file/cleanup angles) | 0 defects; removes prior unreachable branch |

---

## Acceptance criteria

| AC | Verdict | Evidence (live DOM) |
|----|---------|---------------------|
| **AC-1** selected derivable quarter → flow shows THAT quarter; caption `from→to` matches | ✅ | Select `2025-09-30` → title **"Derived share flow — 2025 Q3"**, caption **"diffing 2025 Q2 → 2025 Q3"**. (Engineer stage also confirmed `2025-12-31` → "2025 Q4", net ▲ +55.0M matching the endpoint.) |
| **AC-2** changing the selector updates the flow | ✅ | Flow title/caption/net change on each selection (default 2026 Q1 → 2025 Q3 → empty), driven by `renderInstitutionalData` re-mount. |
| **AC-3 (honesty)** selected quarter with no transition → honest empty state for THAT quarter, never another quarter's numbers, never a fabricated zero | ✅ | Select `2025-06-30` (earliest; prior `2025-03-31` not ingested) → `flowEmpty: true`, no chart, copy "No derived share flow for Jun 30, 2025 / No comparable prior quarter is available…". No fallback, no zero. |
| **AC-4** values stay DERIVED + shares + 13F caveats; no "trade" wording | ✅ | Captions: "DERIVED by diffing … 13F holder snapshots — never reported trades"; net/bars in shares (e.g. ▲ +55.0M acquired 65.0M − divested 10.0M). Unchanged from shipped builder. |
| **AC-5** mix stacked bar unchanged (period-independent) | ✅ | Live: **`mix unchanged across selection: true`** — mix content identical across default / 2025-09-30 / 2025-06-30. Implemented as `transitions.slice(-6)`, ignores `period`. |
| **AC-6** no regression; e2e no console errors; existing sections intact | ✅ | e2e HEADLESS PASS; period-drive **ERRORS: 0**; holders/single-quarter-activity sections still render (e2e). |

---

## Notes

- **Data-window coverage** (architect's resolved risk): the mount fetches `quarters=12` (endpoint
  max), covering all realistic selectable quarters; a selection beyond the window falls to AC-3's
  honest empty state (truthful — "no comparable prior quarter available"), never a wrong-quarter
  number. No backend change was required (JSON contract unchanged).
- This amendment also **resolves prior QA finding #2** (the unreachable "No net share flow this
  quarter" branch is gone — the flow is now chosen by selected period, with a single honest
  empty path).
- Prior QA finding #1 (efficiency: `holders_of` double-read per interior quarter) is unchanged and
  still a low-severity optional polish — not touched by this amendment.

---

## Handoff

✅ **PASS — ready to deploy.** All 6 amendment ACs verified with live evidence; full suite green;
honesty contract satisfied (period-accurate flow, honest per-quarter empty state, DERIVED + shares
+ caveats, no wrong-quarter fallback). Frontend-only; no backend or contract change.

**Operator's next options:** commit the `holder-activity-viz` branch (now includes both the
original feature and this amendment), then request a deploy (`/devops-engineer`, operator-gated).
`/deliver` stops here and does not commit, push, or deploy.

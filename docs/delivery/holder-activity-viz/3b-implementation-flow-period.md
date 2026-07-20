# Implementation (frontend, amendment): period-reactive flow view

**Role:** Senior Frontend Engineer → handoff to QA Tester (same branch)
**Task slug:** `holder-activity-viz` (amendment `-flow-period`)
**Branch:** `holder-activity-viz` (continues; uncommitted)
**Date:** 2026-07-20

## What changed (frontend-only — no backend, no new data)

### `src/secfin/api/static/company.js`
- `renderInstitutionalData()` call site: `mountActivityTrend()` → **`mountActivityTrend(period)`**
  (`period` = `state.instValue`, already in scope).
- **`mountActivityTrend(period)`** rewritten:
  - Fetches `institutional-activity-series?**quarters=12**` (endpoint max) so a selected quarter
    older than the 6 shown in the mix is still covered for the flow.
  - **Mix (unchanged behavior):** `activityMixChart(transitions.slice(-6), …)` — the 6 newest,
    period-independent.
  - **Flow (now period-reactive):** picks the transition whose `to_period === period` and renders
    it; if there's **no** matching transition, shows an **honest empty state for the selected
    quarter** ("No derived share flow for <quarter> — no comparable prior quarter available…"),
    never another quarter's numbers, never a fabricated zero. This also removes the
    previously-unreachable "No net share flow this quarter" branch (QA finding #2 from `4-qa.md`).

### `src/secfin/api/static/app.js`
- **`activityFlowChart`** title now reflects the transition's own quarter:
  `"Derived share flow — " + quarterTick(transition.to_period)` (was a hardcoded "most recent
  quarter"). The caption already renders `from → to` dynamically, so it matches the selection.
  Updated the builder's doc comment (no longer "latest quarter"; the caller picks which
  transition).

## How I verified

- **Docker e2e headless check** — `docker compose --profile e2e up …` → **HEADLESS CHECK: PASS**,
  institutional tab `errors=0` (no regression; newest-quarter render unchanged).
- **Drove the period selector** (puppeteer against the e2e-app, AAPL — ingested
  `2025-06-30/09-30/12-31, 2026-03-31`), reading the live DOM:
  - Default (2026-03-31): title **"Derived share flow — 2026 Q1"**, caption "2025 Q4 → 2026 Q1",
    net ▲ +720.0M (acquired 740.0M − divested 20.0M).
  - Select **2025-12-31** → flow updates: title **"Derived share flow — 2025 Q4"**, caption
    "2025 Q3 → 2025 Q4", net ▲ +55.0M (acquired 65.0M − divested 10.0M) — matches the endpoint's
    `to_period==2025-12-31` entry (AC-1, AC-2).
  - Select **2025-06-30** (earliest; its prior 2025-03-31 is not ingested) → **honest empty
    state**: "No derived share flow for Jun 30, 2025 / No comparable prior quarter is available…"
    — no wrong-quarter fallback, no zero (AC-3).
  - **0 console/page errors** across all three (AC-6).
- Mix chart is period-independent by construction (`transitions.slice(-6)`, ignores `period`) and
  still renders (AC-5). No Python touched (pytest unaffected).

## For QA to probe
- Re-drive the selector: a derivable mid-history quarter (flow + caption match that quarter), and
  the earliest/no-prior quarter (honest empty state, not a fallback or zero).
- Confirm the **mix stacked bar does not change** when the selected quarter changes (AC-5).
- Confirm captions still say DERIVED + "never reported trades" + shares (AC-4); no "trade" wording.

**Next:** `next_stage: qa`.

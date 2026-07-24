# 4b — Operator Manual Verification: Sector Analytics v2 routing swap (P7 / M2)

**Purpose:** your interactive acceptance of the routing swap — `/sectors` now serves the v2 Sector
Analytics app, `/sector-analytics` 301-redirects in, and the old page lives at `/sectors-legacy`.
**Branch:** `sector-migration-swap` · **QA verdict:** ✅ PASS — pending this manual verification
**Change type:** interactive/behavioral → **hands-on required (blocking)**.

**How to open it:** start the app locally, then use the URLs below.
- If not already running: `docker compose build api && docker compose up api` → app on
  **http://localhost:8000**. (Note: locally `/sectors` is populated only if the analytical batch has
  been run; if the scorecard/compare read honest-empty, that's the seed state, not a swap bug.)
- Or drive it against the e2e fixture (already seeded) if you have that instance up.

**The load-bearing rule for this change:** the query string must survive the `/sector-analytics` →
`/sectors` 301 **intact**, every "Sectors" nav link must land on the app (no dead link / no old
page), and the old page must stay reachable at `/sectors-legacy` for rollback — while **no missing
value is ever shown as `0`** (unchanged app honesty).

## Checklist

| # | Step | Expected result | AC | Result (✅/❌) | Notes |
|---|------|-----------------|----|---------------|-------|
| 1 | Open `http://localhost:8000/sectors` | The **v2 app** loads (control bar · "Health scorecard" · decomposition · Distribution) — **not** the old "Sector performance overview". | AC-1 | ✅ | |
| 2 | Look at the left sidebar on `/sectors` | "**Sectors**" entry (renamed from "Sector analytics" at the operator's request, 2026-07-24) is **highlighted active** (accent color). | AC-4 | ✅ | Rename applied + re-verified this round |
| 3 | Click "Sectors" in the app sidebar | Stays on `/sectors`, entry stays active — no jump to the old page, no dead link. | AC-4 | ✅ | |
| 4 | Open `http://localhost:8000/sector-analytics?group=73&view=company&symbol=320193` | Browser URL becomes **`/sectors?group=73&view=company&symbol=320193`** (301) and the **Company** view opens focused on that symbol. | AC-2, AC-5 | ✅ | Redirected, params kept |
| 5 | Open `http://localhost:8000/sectors?view=compare&a=73&b=28` | **Compare** view; sector B's unscored themes read **"not scored"** and missing metric medians read **"N/A" / "no distribution"** — **never `0`**. | AC-5, AC-6 | ✅ | N/A, never 0 |
| 6 | Open `http://localhost:8000/sectors-legacy` | The **old** page renders and is usable (sector selector, DuPont tree, CCC lifecycle) — rollback path works. | AC-3 | ✅ | |
| 7 | From `http://localhost:8000/company/AAPL`, click "Sectors" in the shell nav | Lands on the **app** at `/sectors`. | AC-4 | ✅ | |
| 8 | (Honesty scan) Anywhere a theme/metric has no data | Reads N/A / "not scored" / "not yet scored" / "no distribution" — no `0`, no fabricated number; composite labeled "DERIVED"; scores framed as a position, not a verdict. | AC-6 | ✅ | |

_Company-view selector scoping (observed step 1) → confirmed by-design/pre-existing, logged as a
follow-up in `docs/delivery/sector-app-followups.md`; does not affect this verdict._

## Interactive walk-through — operator responses (2026-07-24)

Operator drove the flow live; responses captured interactively:
- **Steps 1-2 (app at /sectors + sidebar active):** ✅ Yes. Note: observed the Company view's company
  selector is not scoped to the sector — **confirmed by-design** (global "place a filer in its own
  SIC peers" search, decoupled from the sector dropdown; `sectorapp.js:1091–1127`, `:470`), a
  pre-existing Company-view behavior **not touched by M2** and out of scope. Logged as a possible
  follow-up if sector-scoping is wanted.
- **Step 4 (301 redirect, params kept):** ✅ Yes — redirected, params kept.
- **Steps 5+8 (N/A never 0):** ✅ Yes — N/A, never 0.
- **Steps 6-7 (legacy page + shell nav):** ✅ Yes. **Change requested:** rename the left sidebar menu
  item "Sector analytics" → "**Sectors**". **Applied** on-branch (`sectorapp.js:282`) + re-verified
  (e2e `errors=0`, sidebar reads "Sectors" and is active). ← awaiting final confirmation of the rename.

## Sign-off — COMPLETED

- **Overall verdict:** ☑ **Confirmed** ☐ Accepted at QA-tester level ☐ Defect found
- **Operator:** tijesunimi-peters  **Date:** 2026-07-24
- **Discrepancy / notes (if any):** All 8 checks ✅. Requested sidebar rename "Sector analytics" →
  "Sectors" — applied + re-verified. Company-view selector-scoping observation confirmed by-design /
  pre-existing → logged as a follow-up (`sector-app-followups.md`), does not block. **Accepted.**

_A ❌ on any row is a defect → loop back to the owning engineer (backend = routing/redirect;
frontend = nav link/active-state/e2e). A confirmed sign-off unlocks a deploy **request** (operator-
gated `/devops-engineer`; sequence the analytical batch before prod cutover) — not a deploy._

# P6b — Sector Geographic revenue mix — Operator manual verification

**Purpose:** your interactive acceptance of the new Sector-view "Geographic revenue mix" card —
the "I drove it and I accept it" step that turns QA's *pass* into an operator-*accepted* change.
QA's own evidence (`4-qa.md`) does not count as acceptance; this does.

- **Branch:** `sector-geographic-mix`
- **QA verdict:** PASS — pending this manual UI verification
- **Classification:** interactive / data-driven → **blocking** (verdict stays "pending" until you sign off)
- **Start the app:** `docker compose --profile e2e up -d e2e-app` (seeds a throwaway DB, no network)
- **URL:** `http://localhost:8000/sectors`

**The load-bearing rule for this change:** a sector with no ASC 280 geographic disclosure reads
**N/A, never 0%**; the shown split is labeled a **derived, revenue-weighted rollup**; and the
domestic/international coloring is **value-neutral** (no green/red good-bad code). `other/unclassified`
is **shown, not hidden**.

## Checklist

| # | Step | Expected result | AC | Result (✅/❌) | Notes |
|---|------|-----------------|----|--------------|-------|
| 1 | Open `/sectors` (default: Business Services). Find the **Geographic revenue mix** card (left of Insider flow). | A stacked bar + three legend rows (Domestic (US) / International / Other) each with a % and a USD amount. | AC-11 | ✅ | |
| 2 | Read the card hint + subline. | Hint "ASC 280 · FY2025 · 63.0% of revenue covered"; subline "7 of 12 companies disclosed · 1 excluded (unreconciled)". | AC-7, AC-11 | ✅ | |
| 3 | Check the coloring of the three segments. | One accent family — domestic solid, international lighter — and **Other** rendered as a **hatch/pattern**. **No green/red** good-bad coloring. | AC-11 | ✅ | |
| 4 | Confirm the "Other / unclassified" row is present (not dropped). | Other appears as its own bar segment + legend row with its own % and USD. | AC-15 | ✅ | Confirmed via the legend in checks 1/3. |
| 5 | Hover the "Derived rollup · revenue-weighted · ASC 280" foot. | A tooltip shows 4 caveats (coverage / normalization / reconciliation / derived). | AC-14, AC-15 | ✅ | |
| 6 | Switch the sector dropdown to **Chemicals & Allied Products** (group 28). | Card reads "No ASC 280 geographic disclosure ingested … Shown as N/A, not zero." — **no bar, never 0%**. | AC-9, AC-12 | ✅ | The load-bearing rule — held. |
| 7 | Toggle the site to **dark theme**. | Bar (incl. the lightened international segment + the hatched Other) and all text stay legible; nothing invisible/washed out. | AC-13 | N/A | App has **no dark-theme toggle** (single-theme, pre-existing). Card CSS is token-driven, so it would adapt if dark mode is ever added. Not a defect. |
| 8 | Narrow the window to mobile width (≤640px). | The geo/insider row stacks to one column; the bar + legend don't overflow, clip, or bleed horizontally. | AC-13 | ✅ | |
| 9 | Open `/company/AAPL?tab=statements` → **segments** tab. | The labeled "Segments · spike" three-company demo is unchanged (regression — this change didn't touch it). | AC-17 | ✅ | |
| 10 | Honesty scan across the above. | Nowhere is a missing split shown as 0%; the figure is always labeled derived; no over-claiming (no alpha/timing/price/"beats the market") copy. | AC-12, AC-14 | ✅ | |

## Sign-off

- **Verdict:** ☑ **Confirmed (accepted)** · ☐ Accepted at QA-tester level · ☐ Defect found
- **Operator:** operator (interactive walk-through with QA)
- **Date:** 2026-07-25
- **Discrepancy / notes (if any):** None. All driven checks passed (1–6, 8–10 ✅); check 7 (dark
  theme) is N/A because the Sector app has no dark-mode toggle — not a defect. Change accepted
  hands-on.

> A ❌ on any row is a defect → back to the owning engineer (frontend for rendering/copy/theme/layout,
> backend for the endpoint/pipeline), then re-QA. A confirmed sign-off unlocks a deploy *request*
> (DevOps is a separate operator-gated stage — this does not deploy).

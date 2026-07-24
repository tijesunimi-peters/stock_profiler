# 4b · Operator manual-verification questionnaire — P5 Filings view

**Purpose:** your interactive acceptance of the Filings drill-in view (v2 P5). This turns QA's *pass*
into an operator-*accepted* change. Fill the **Result** and **Notes** columns as you go, then sign off.

- **Branch:** `sector-v2-filings` (off `master` @ e43be08) — frontend-only.
- **QA verdict:** PASS — pending this manual verification. (Placeholder-only iteration → you **may**
  accept at the QA-tester level instead of a full hands-on run; your call.)
- **URL to open:** `http://localhost:8000/sector-analytics`
  (start it with `docker compose up api`, or use your running instance.)

**The load-bearing rule for this change:** it's an **honest Track-2 placeholder** — the layout and
controls are real, but **nothing is fabricated**. No filer, ticker, accession number, filed date,
filing count, coverage %, direction value, section, or cited passage — real or synthetic — may appear.
The range label must read **"— of —"**, never "1–6 of 14".

## Checklist

| # | Step | Expected result | AC | Result (✅/❌) | Notes |
|---|------|-----------------|----|--------------|-------|
| 1 | Open `/sector-analytics` | Sector view loads; view rail shows **4** buttons: Sector / Company / Compare / Qualitative | AC-13 | ✅ | As expected. |
| 2 | Click **Qualitative** in the rail | Track-2 placeholder view with risk-theme rows | — | ✅ | As expected. |
| 3 | Click a row's **"Filings →"** | Navigates to the **Filings view**; breadcrumb = `<sector> › Risk theme › <that theme>` (matches the row you clicked) | AC-1, AC-3 | ✅ | As expected — breadcrumb reflects the clicked theme. |
| 4 | Read the view top-to-bottom | Track-2 banner; COVERAGE empty bar + "—"; DIRECTION "planned"; FILINGS "— · to be defined"; representative-language placeholder — **no** number/ticker/accession/date/%/excerpt anywhere | AC-4, AC-8, AC-11 | ✅ | As expected — all placeholders, nothing fabricated. |
| 5 | Check the list + pager | Header labels only (Filer/Form/Filed/Section/Cited passage); empty "Filings will list here … none shown" body; range label **"— of —"**; Prev/Next disabled | AC-9, AC-10 | ✅ | As expected — "— of —" range, empty body. |
| 6 | Click **10-K → 10-Q → 8-K → All** (try keyboard Enter/Space too) | Exactly one tab highlighted at a time; list stays the same empty state; no error | AC-6 | ✅ | As expected — single-select + keyboard work. |
| 7 | Click **← Back** | Returns to the **Qualitative** view (not Sector), sector/theme intact; no page reload, no jump to EDGAR | AC-5 | ✅ | As expected — returns to Qualitative, in-app. |
| 8 | Expand a theme (click the row body) → click **"Open filings in ClearyFi →"** in the language panel | Opens the Filings view for that theme | AC-2 | ✅ | As expected — second entry point works. |
| 9 | Look at the view rail again | Still only the **four** buttons — no "Filings" rail item | AC-13 | ✅ | As expected — drill-in only. |
| 10 | **Honesty scan** — scan the whole Filings view once more | Every data slot is a placeholder ("—", "to be defined", "none shown", "planned"); nothing reads as a real or invented figure; no `0` standing in for a missing value | AC-8, AC-12 | ✅ | As expected — nothing fabricated, no 0-for-N/A. |

## Sign-off

- **Overall verdict:** **Confirmed** — operator drove it by hand; all 10 rows ✅.
- **Operator:** tijesunimi-peters
- **Date:** 2026-07-24
- **Discrepancy / notes (if any):** None. Interactive walkthrough (3 batches) run via `/deliver`
  against a live seeded instance at `http://localhost:8000/sector-analytics`; every row confirmed.

**Status: COMPLETED — accepted by the operator.**

> A ✅/Confirmed or Accepted verdict marks this task **done** and unlocks a deploy *request*
> (operator-gated — not the deploy itself). A ❌ is a defect → loops back to
> `senior-frontend-engineer` (bump `qa_cycles`, re-QA).

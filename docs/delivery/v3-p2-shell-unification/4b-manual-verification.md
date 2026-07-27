# 4b — Operator manual verification: V3-P2, shell unification

**Purpose:** your hands-on acceptance of the unified product shell — the change that replaces both
of the product's navigations with one, on **every** data page.

| | |
|---|---|
| **Branch** | `v3-p2-shell-unification` |
| **QA verdict** | ✅ PASS (round 2) · `4-qa.md` |
| **Operator verdict** | ✅ **CONFIRMED — 2026-07-27** |
| **Classification** | **Interactive / logic change → this gate is BLOCKING** |
| **Start the app** | `docker compose build api && docker compose up api` |
| **Open** | **http://localhost:8000/company/AAPL** |

### The load-bearing rule for this change

**Re-homed pages keep their content.** The shell, the nav and the URL behaviour changed on every
page; the *data* on those pages must not have. If a number, a tab, or a caveat that used to be there
is now missing or different, that is a defect — say so. (One known and accepted exception: the
company hub's content column is ~14% narrower because the Views rail now sits beside it, so some
chart labels truncate at different points. Values are unchanged.)

Secondary rule, as always: **a missing value never renders as `0`.**

---

## Checklist

Fill in **Result** (✅/❌) and **Notes** for each row.

| # | Step | Expected result | AC | Result | Notes |
|---|---|---|---|---|---|
| 1 | Open `/company/AAPL` | Left sidebar: **Subjects** (Companies highlighted), People/Auditors/Funds/Events greyed with a `planned` badge; **Actions · Companies** = Compare/Screen/Coverage; **Reference**. URL becomes `/company/AAPL/fundamentals` | AC-3, 6, 19 | ✅ | |
| 2 | Try to click **People** | Nothing happens — no navigation, no pointer cursor. Hovering shows a tooltip describing what People will hold | AC-9 | ✅ | |
| 3 | Compare the page against `master` (from memory or a second tab) | Same five views, same labels/order, same numbers. Only the chrome around them moved | **AC-15** | ✅ | |
| 4 | Click the Views rail: Statements → Insider → Institutional → 13D/G | Each view shows what its tab showed before; the URL tracks each view | AC-15, 19 | ✅ | |
| 5 | Press **Back** three times, then **Forward** | Views walk backwards in order and the rail highlight follows; Forward returns | AC-19 | ✅ | |
| 6 | Reload while on `/company/AAPL/insider` | Lands on Insider, not Fundamentals | AC-19 | ✅ | |
| 7 | Open an "old bookmark": `/company/AAPL?tab=institutional` | Institutional view (old links must not break) | AC-20 | ✅ | |
| 8 | On Institutional, compare the entity bar's **PERIOD** with the **QUARTER (13F)** selector | They state the **same** quarter (this was defect D2) | AC-16 | ✅ | |
| 9 | Open `/company/AAPL/nonsense` | Falls back to Fundamentals — no error page | AC-21 | ✅ | |
| 10 | Narrow the window below ~1024px | Sidebar collapses behind a hamburger; the Views rail becomes a horizontal strip | AC-4 | ✅ | |
| 11 | Open the drawer, close it via the dimmed scrim, then **immediately** re-tap the hamburger | Reopens. It must **not** jump to the home page (this was a latent bug inherited from the old shell) | AC-4 | ✅ | |
| 12 | Press `/` then `⌘K` / `Ctrl-K` on any page | The topbar search takes focus both times | AC-5 | ✅ | |
| 13 | Open `/sectors` | Sectors highlighted; **Screen and Coverage show `planned`** (there is no sector screener); Compare is live | AC-10 | ✅ | |
| 14 | On `/sectors`, type a ticker into the topbar search and submit | Sets the focal company and **stays on `/sectors`** — by design it does not navigate away | AC-5 | ✅ | |
| 15 | `/sectors` → **Company** view. Read the sector in the control bar, then open the focal-company dropdown | The dropdown lists filers from **that same sector** — the header and the list must agree (this was defect D1) | **AC-22** | ✅ | |
| 16 | Still in Company view, pick a **different** sector from the control bar | The focal re-resolves into the newly picked sector. If that sector has no company-level metrics, an honest empty state — never another sector's filers | AC-22 | ✅ | |
| 17 | Open `/manager/1067983` | Managers highlighted; **all three** actions `planned`; entity bar shows the manager's name (not the CIK), CIK, quarter, and the ~45-day-lag note | AC-10, 16 | ✅ | |
| 18 | Visit `/sectors-legacy` | 404 — the old sector page is gone | AC-23 | ✅ | |
| 19 | Scan `/compare` | Missing values read `N/A` with a reason, or `N/M` — **never `0`**. Status chips and "show your work" still present | AC-26 | ✅ | |
| 20 | Overall look on `/company` and `/sectors` | Nothing clipped, overlapping, or illegible; the narrower content column still reads cleanly | UI/UX | ✅ | |

### One judgement call we'd like your eye on

**Row 3 / the title row.** `/company/AAPL` now leads with **"Company hub"** as the `<h1>`, with the
ticker in the right-hand meta and large in the entity bar — this follows the v3 prototype, which D1
made authoritative. The trade-off is a weaker `<h1>` on our most-indexed page. Easy to reverse to
`AAPL` if you'd rather. Your call: ☑ **keep prototype** ☐ revert to ticker — *operator, 2026-07-27: keep "Company hub".*

---

## Sign-off

**Verdict** (tick one):

- ☑ **Confirmed** — drove it by hand, works as described
- ☐ **Accepted at the QA-tester level** — not driven by hand, accepting QA's evidence
- ☐ **Defect found** — details below

**Operator:** tijesunimi-peters  **Date:** 2026-07-27

**Discrepancies / notes:**

```
None. All 20 checks passed on a hands-on run, walked through interactively in five batches
(rows 1-4, 5-8, 9-12, 13-16, 17-20) against http://localhost:8000 on the real data volume.

Both defects QA caught in round 1 were re-checked by hand and confirmed fixed:
  row 8  (D2) entity bar PERIOD agrees with the page's QUARTER (13F) selector
  row 15 (D1) focal-company dropdown lists filers from the sector named in the control bar

Judgement call settled: /company keeps the prototype's "Company hub" h1 (D1 fidelity over the
SEO trade-off). The 14%-narrower content column was reviewed at row 20 and accepted.
```

**Status: COMPLETED — operator interactive acceptance recorded 2026-07-27.**

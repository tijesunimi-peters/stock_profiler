# 4b — Operator manual verification · **P0b** (the remaining seven views)

⚠️ **Two questionnaires on disk for this task.** `4b-manual-verification.md` = **P0a**, signed
2026-08-02. **This one = P0b.**

**Purpose:** your hands-on acceptance of the last seven views moving onto the seam, plus a chart
bug fixed on the way through.

| | |
|---|---|
| **Commits** | `cf01f6c` company · `39e8837` sectors · `8bd8fab` manager + chart fix |
| **QA verdict** | ✅ **PASS** — 73 driven assertions, 0 failures, no product defects |
| **Operator verdict** | ✅ **CONFIRMED 2026-08-02** — walked interactively, all 12 rows first-pass |
| **Start the app** | `cd clearyfi_frontend && npm run dev` |
| **URL** | **http://localhost:5174/company/NVDA/history** |
| **Time** | ~6 minutes |

> ⚠️ **If the styling looks wrong, restart the dev server before reporting it.** That is what
> happened last time: vite was serving a stale `app.css` truncated mid-file. `rm -rf
> clearyfi_frontend/.vite && npm run dev`.

## The load-bearing rule for this change

**Nothing a reader sees may have changed — on any of the nine views.**

P0a proved that for two views with an empty DOM diff. Here 15 of 25 cells are byte-identical and
the other 10 differ **only** by hidden elements that were never visible: a chart tooltip host that
was being duplicated. QA verified that by stripping those elements and re-diffing — nothing else
moved. Rows 1–6 are you checking that by eye.

## Checklist

| # | Step | Expected result | AC | Result ✅/❌ | Notes |
|---|---|---|---|---|---|
| 1 | Open **Financial history** | Renders as before — metric picker, the multi-series chart, range and basis tabs | AC-2 | ✅ | **"Both fine"** (with row 2) |
| 2 | Pick a second and third metric | Each adds a line. **Every metric is now its own read** — a slower page here would be the tell | AC-2/8 | ✅ | Each metric adds its line; no perceptible slowdown from fanning out |
| 3 | **Insider activity** | Renders as before — tiles, code mix, the latency histogram, the ledger | AC-2 | ✅ | **"Both fine, pills match"** (with row 4) |
| 4 | **Peer-relative** | Renders as before. Its peer-set pill must match the one on **Overview** — both now come from one read | AC-2 | ✅ | **Peer-set pill AGREES with Overview** — the shared read doing its job |
| 5 | **Sectors → Sector, Qualitative, Filings** | All three as before. On Qualitative, open a "show filers" count — the chips still appear | AC-2/8 | ✅ | **"All three fine"** — the filer reveal still works through the seam-passed function |
| 6 | **Managers → a manager → all six views** | Profile, Footprint, Voting, 5%, Activity, Behaviour all as before | AC-2 | ✅ | **"All six as before"** — incl. the moved period axes |
| 7 | **Hover a chart** on Insider or Footprint | A readout box appears. This is the one to actually try — the fix deleted duplicate tooltip hosts and a wrong deletion would silently kill hover | AC-8 | ✅ | **"Readouts appear normally"** — the judgement row |
| 8 | `/manager/102909/profile` (a CIK not in the roster) | An honest **404** with recovery links to real managers — not a blank page | AC-4 | ✅ | Honest 404 with recovery links |
| 9 | Append **`?slow`** to any of the nine views | A loading state appears first. **None of these seven had one before** | AC-3 | ✅ | "Both behave" (with row 10) |
| 10 | Append **`?fail`** instead | An error block, page frame intact | AC-4 | ✅ | Error block, frame intact |
| 11 | Check the **banner** is still on every page — company, sectors, managers | Present, and still says every figure is synthetic (it is — nothing here plumbs real data) | AC-6 | ✅ | "Banner everywhere, no bare zeros" (with row 12) |
| 12 | Scan for a **`0`** where a number is missing | `N/A` or `—`, never `0` | AC-5 | ✅ | `N/A` / `—`, never `0` |

## The judgement call

**Row 7 was the one QA could not settle** — a script hovering container centres cannot tell "needs a
precise target" from "broken", so it could not confirm the leak fix had spared the *wired* tooltip
host rather than an orphan.

→ ✅ **OPERATOR: "Readouts appear normally."** The 88 removed elements were duplicates. **The chart
leak fix is sound**, and a fix that silently killed every tooltip — which is exactly what deleting
the wrong element would have looked like — did not happen.

## Known and deliberate — not defects

- **AC-2 is not an empty diff here**, unlike P0a. The manager commit fixes a real chart leak, so it
  changes DOM on purpose. Verified: **189 hidden readouts before, 101 after, for 168 charts** — 56
  stacked duplicates gone, and nothing else in any cell changed.
- **Insider and four manager views have no controls at all.** They are read-only ledgers. My first
  QA pass called that a failure; it was the check that was wrong.
- **Mobile is still broken** (446px overflow) — pre-existing, measured identical at every commit.
- **No dark theme is checked** because the app defines none.
- **The app still calls no endpoint.** This finishes the plumbing *shape*; Phase A does the
  plumbing, and is blocked on the whole-market backfill and the SPA auth decision.
- **`surfaces.ts` / `metrics.ts` and the 27 `state.tsx` shims are still in the tree.** Every view is
  off them, but P0b-4 does the deleting.

## Sign-off

- [x] ✅ **Confirmed** — *walked interactively, 2026-08-02*
- [ ] ❌ **Defect found**

**Operator:** tijesunimi-peters  **Date:** 2026-08-02
**Walked interactively** in three batches; every answer transcribed verbatim above.

**Discrepancies / notes:**

```
All 12 rows first-pass. Two rows carried more weight than the rest and both
landed.

Row 4 -- Peer-relative's peer-set pill AGREES with Overview's. Those two
surfaces now share one `companyIdentity` read, and the whole reason for
sharing it was that two independent reads can report a different rank for the
same filer. Confirmed by eye rather than inferred from the code.

Row 7 -- hover still works. This is what QA could not settle: the leak fix
deleted 88 hidden tooltip hosts, and deleting the wired one instead of an
orphan would have looked identical in a DOM diff while silently killing every
readout. It did not.

Nothing about the app LOOKS different, which is the point. Nine views moved
off their own data builders and onto the seam; the endpoint swap is now a
change to one file rather than a rewrite of each view.
```

*A ❌ on any row is a defect → back to `senior-frontend-engineer`, then re-QA. There is no
"accepted at the QA-tester level" option (operator policy, 2026-07-31).*

# 4b — Operator manual verification · `react-plumbing-p0`

**Purpose:** your hands-on acceptance of the seam refactor and the synthetic-data disclosure.

| | |
|---|---|
| **Commits** | `061dd99` (refactor) + `d03c633` (banner) — **already in `master`** |
| **QA verdict** | ✅ **PASS** — one defect found, measured to be **pre-existing** (mobile layout) |
| **Operator verdict** | ✅ **CONFIRMED 2026-08-02** — walked interactively, all 12 rows |
| **Start the app** | `cd clearyfi_frontend && npm run dev` |
| **URL** | **http://localhost:5174/company/NVDA/overview** |
| **Time** | ~5 minutes |

> ⚠️ **`master` has moved on since QA.** The Manager port (`e5044bc`…`cd33485`) landed on top of
> these commits, so `npm run dev` on `master` shows that work too. QA tested `d03c633` in
> isolation. To see exactly that: `git worktree add --detach /tmp/p0 d03c633`.

## The load-bearing rule for this change

**Nothing a reader sees on these two pages may have changed — except the new banner.**

That is the whole claim. The views now fetch their data instead of computing it inline, so that
Phase A can swap in real endpoints by editing one file. If the refactor moved so much as a label,
it did more than it was supposed to. QA reproduced an **empty DOM diff** from an independently
rebuilt baseline; rows 1–4 are you checking that with your eyes.

## Checklist

| # | Step | Expected result | AC | Result ✅/❌ | Notes |
|---|---|---|---|---|---|
| 1 | Open the URL | The Company hub renders exactly as you remember it — statements, snapshot tiles, all eight sections, filing-timeline rail | AC-2 | | ✅ | **Both views unchanged** (answered with row 4) |
| 2 | **The banner at the very top** | A strip: **SYNTHETIC** · "No figure on this page comes from an SEC filing. Values are generated from the ticker and are stable, plausible, and wrong." · then **10 surfaces** listed | AC-6 | | ✅ | Present and correct — **after a dev-server restart**, see the note below |
| 3 | **Does the banner's copy land?** | Judgement row: does *"stable, plausible, and wrong"* make you trust the numbers less than a generic "demo data" would? | AC-6 | | ✅ | **"Yes — it lands"** · the judgement row |
| 4 | Switch to **Institutional** | Renders as before — register snapshot, holders, flows, all seven sections | AC-2 | | ✅ | **Both unchanged** — incl. the view that lost its `surface` prop |
| 5 | Click the statement tabs (Income / Balance / Cash flow), then a **row label** | Tabs swap the table; a clickable row opens a trend drawer with a chart | AC-8 | | ✅ | Behaved |
| 6 | In that drawer, click **20 quarters**, then **As restated** | Both re-draw the chart. "As restated" is a different *version* of the fact, not a different window | AC-8 | | ✅ | Behaved |
| 7 | Click **+ compare** on two rows, then remove one, then **Clear** | Tray appears bottom-stuck with two chips → one → gone | AC-8 | | ✅ | Behaved |
| 8 | Click a **ƒ derived** chip | Opens the arithmetic: formula, inputs, and when our number and the filer's legitimately differ | AC-8 | | ✅ | Behaved |
| 9 | Right rail: click a **form filter** (e.g. `8-K`) | The timeline filters; the count above it updates | AC-8 | | ✅ | "Filters, count updates" |
| 10 | Append **`?slow`** to the URL and reload | You SEE a loading state for ~1s before content — the views had none before this change | AC-3 | | ✅ | "Both behave" |
| 11 | Append **`?fail`** instead and reload | An error block appears, the page frame survives — no blank screen, no crash | AC-4 | | ✅ | "Both behave" |
| 12 | Scan both views for a **`0`** where a number is missing | Missing values read `N/A` or `—`, never `0` | AC-5 | | ✅ | **"N/A, never 0"** |

## The judgement call

**Row 3 was the one QA could not settle** — whether the wording actually *stops* someone treating a
plausible-looking figure as real, or reads as boilerplate.

→ ✅ **OPERATOR: "Yes — it lands."** The copy stays as written. Naming the failure mode
(*"stable, plausible, and wrong"* — the numbers that LOOK right are the dangerous ones) does work
that a generic "demo data" notice does not.

## Known and deliberate — not defects

- **Mobile is broken (446px overflow).** Measured identical at all three commits — the app shell
  has no mobile layout and never has. **Not caused by this change**, and the banner's own wrapping
  works. Recorded as D-QA-1 for the roadmap.
- **No dark theme is checked** because the app defines none — one warm-paper palette, by design.
- **The app still calls no endpoint.** It is 100% synthetic, which is exactly what the banner says.
  This change makes the swap possible; it does not perform it.
- **`InsiderView`, `HistoryView` and the three sector views still bypass the seam** — deliberately
  out of scope (P0b), and the parallel Manager port is not this task's either.

## One defect found during the walk — and it was the dev server, not the code

The operator reported the banner as **"plain text, not banner colors or styling"**. Diagnosed live
rather than guessed at:

```
disk app.css      129,222 bytes,  6 synth-banner rules
master's app.css  129,222 bytes,  6 rules      <- identical
the dev server    121,899 bytes,  0 rules      <- 7,323 bytes stale
```

The served CSS **stopped exactly where the banner block begins** — its last rule was `.px-jur-med`,
the rule immediately preceding it in the file. Vite's watcher had missed the change, most likely
because `app.css` was restored with `cp` after committing and an atomic replace can slip past a
running watcher. Production builds were always correct.

**Fix: restart the dev server** (`rm -rf clearyfi_frontend/.vite && npm run dev`). Operator
confirmed: *"It's good now."* **No code change was needed and none was made.**

## Sign-off

- [x] ✅ **Confirmed** — *walked interactively, 2026-08-02*
- [ ] ❌ **Defect found**

**Operator:** tijesunimi-peters  **Date:** 2026-08-02
**Walked interactively** in three batches; every answer transcribed verbatim above.

**Discrepancies / notes:**

```
All 12 rows pass. Rows 1 and 4 confirm the load-bearing claim by eye: nothing a
reader sees changed on either view, which is what the independently regenerated
empty DOM diff predicted.

The judgement row LANDED -- "stable, plausible, and wrong" does more work than a
generic demo-data notice. Copy stays.

One issue surfaced mid-walk and was NOT a code defect: a stale vite dev server was
serving app.css truncated at exactly the point the banner block begins. Restarting
resolved it. Worth remembering -- a rendering bug that reproduces only in dev, and
only for whoever's server was running at the wrong moment, is indistinguishable
from a real CSS defect until you compare what the server serves against what is on
disk.

The operator's question "we are working on plumbing real data though, right?" was
answered rather than deferred: Phase 0 deliberately calls no endpoint, and Phase A
is blocked on (a) the whole-market backfill and (b) the SPA auth/rate-limit ruling.
```

*A ❌ on any row is a defect → back to `senior-frontend-engineer`, then re-QA. There is no
"accepted at the QA-tester level" option (operator policy, 2026-07-31).*

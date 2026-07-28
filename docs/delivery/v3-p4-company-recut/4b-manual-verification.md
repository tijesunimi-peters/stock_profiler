# 4b — Operator manual verification: V3-P4, Company re-cut

**Purpose:** your hands-on acceptance of the company hub re-cut — Fundamentals + Statements are now
**Overview** + **Financial history**.
**Branch:** `v3-p4-company-recut` · **QA verdict:** PASS
**Classification:** interactive / logic change → blocking gate.
**STATUS: ✅ COMPLETED — operator CONFIRMED 2026-07-28** after 4 hands-on rounds (see the sign-off
block at the end).

## Round 1 — completed 2026-07-27 · verdict: **DEFECTS FOUND** (13, all now fixed)

Batches 2 and 4 passed as written. Batches 1 and 3 found 13 prototype-fidelity defects:

> *"There are leftover from previous designs, the `sector_name > ticker` is missing, the
> `income | balance | cash flow` is not the same as prototype, the consolidated subsidiaries section
> in the prototype is missing, the statement table rows are missing charts, use just number to
> indicate the percentile of the metric, the metric graph x-axis is clipped, the collapsed metric
> trend should be shaded like in the prototype, move the "On this page" to the pattern used in the
> prototype"* · *"There is a left over pills from previous design, the graph x-axis labels are
> clipped, remove the period dropdown"*

Four ambiguous items were put back to you rather than guessed at; your answers: remove the period
dropdown + status legend + statement pills and **match the masthead to the prototype**; **match the
prototype** for the history period control; **match the prototype's fuller layout** for EX-21;
**drop the percentile bar, keep the text**.

All 13 are fixed and re-verified (19/19 targeted assertions, `pytest` 572 green, e2e unchanged at
42 shots / 0 threw / 2 pre-existing). Full detail in `4-qa.md` § "QA cycle 1".

**→ Round 2 below is a re-check of the fixed items plus a regression sweep.**

---

## Round 2 checklist — the fixed items

| # | Step | Expected result | Result (✅/❌) | Notes |
|---|---|---|---|---|
| R1 | Load `/company/AAPL/hub` — look at the top of the page | Masthead: title, mono subtitle beneath, right-hand `AAPL · Electronic Computers · CIK 320193`, one thin rule. Entity bar shows **Last filed 10-K · 2025-10-31** (not `—`) | | |
| R2 | Look just under the entity bar | Breadcrumb reads **Electronic Computers › Apple Inc. `AAPL`** over a heavy rule | | |
| R3 | Scan the page for old chrome | **No** period dropdown, **no** status-legend strip, **no** statement-type pill row | | |
| R4 | Look at the left rail below the views | A **Sections** list, numbered `01`–`06`, with the current section marked on its left edge | | |
| R5 | Condensed statements tabs | Three separate rounded buttons (Income / Balance / Cash flow), not one joined pill | | |
| R6 | Click a condensed statement **row** (e.g. Revenue) | The row opens its own small trend chart beneath it, drawn from the same four figures on that row | | |
| R7 | Look at the Consolidated subsidiaries card | Eyebrow reads `EX-21 · — entities · — organized outside the U.S.`, plus the closing note. Dashes, **never invented counts** | | |
| R8 | Look at any tile with a peer figure | Percentile as a **number** (`98th pctile · 169 peers`) — **no bar graphic** | | |
| R9 | Look at the sparklines on the tiles | **Shaded** under the line (soft accent fill), matching the prototype | | |
| R10 | Open a tile drawer, then go to Financial history | X-axis date labels are **fully visible** in both charts — nothing cut off at the bottom | | |
| R11 | On Financial history, look at the statement card | Statement tabs **and** the period selector sit inside the card's own header — nothing in a page-level bar | | |
| R12 | Regression: `/company/AAPL/statements`, then `?tab=fundamentals` | Land on Financial history, then Overview | | |
| R13 | Regression: `/company/JPM/hub` | Many N/A / N/M tiles — **none reads `0`** | | |
| R14 | Overall | The page now reads as the prototype intended | | |

## Round 2 — completed 2026-07-27 · verdict: **DEFECTS FOUND** (3 more, all now fixed)

R1–R4 confirmed fixed. Further findings:

> *"I don't see the 'What the company does' under identity & structure, 'cover page · EX-21 · 10-K
> Item 1' should be on the same line as the 'Identity & Structure' just like the prototype"* ·
> *"I don't see the chart drawer like in the prototype for the chart, for the metrics match the
> prototype for the YoY, +chart, and the clickable metric value"*

**⚠️ One of these hit a scope gate.** "What the company does" is **10-K Item 1 — narrative free
text, i.e. Track 2**. Guardrail 1 says flag it, don't build it: making it real needs an LLM
summarization path with a recurring per-token cost, which is your call, not something this phase
can assume. It therefore ships with the prototype's **shape** and an honest "Not available" state —
no summary, no segment pills, nothing invented. If you want it filled in for real, that is a
separate decision (and a new roadmap entry).

The other two are done: the source note is now inline with the section title, and the tile/drawer
were rebuilt to the prototype's anatomy.

**One honesty deviation you should know about:** the prototype labels the tile's movement figure
**"YoY"**. Ours cannot honestly say that — `/metrics` returns the *intra-year* quarters of the
selected period, so first→last is change across the fiscal year, not year-over-year. The form
matches the prototype (`↑ +0.8%`); the label says what was actually measured (`· 4 quarters`).
Tell me if you'd rather have a true YoY — it costs one extra request per tile.

**Also fixed:** the drawer's *Quarters* range was rendering 73 overlapping x-axis labels. Now 9.

---

## Round 3 checklist — final re-check

| # | Step | Expected result | Result (✅/❌) | Notes |
|---|---|---|---|---|
| F1 | `/company/AAPL/hub` — §01 heading | `01  Identity & structure  cover page · EX-21 · 10-K Item 1` all on **one line** | | |
| F2 | §01 left card | "What the company does · 10-K Item 1" card present, reading **Not available** with a Read-on-EDGAR link — no invented summary, no segment pills | | |
| F3 | Any snapshot tile | Value carries a **dashed underline** and clicking the *value* opens the drawer; a separate **+ CHART** action sits below | | |
| F4 | Tile foot | Reads e.g. `● TTM ↑ +0.8% · 4 quarters` — arrow + signed %, and it does **not** claim "YoY" | | |
| F5 | Open drawer | Header = **title · latest · change** on the left, **Fiscal years / Quarters** on the right; then chart, then notes, then "+ How this is computed" | | |
| F6 | In the drawer click **Quarters** | Chart redraws over the full quarterly history with ~9 readable date labels — **no overlapping smear**, nothing cut off | | |
| F7 | Click **+ CHART** on a tile | Lands on Financial history with that metric selected | | |
| F8 | `/company/JPM/hub` | Drained tiles read N/A / N/M, have **no** dashed underline and **no** + CHART (nothing to chart), and **none reads 0** | | |
| F9 | Overall | Reads as the prototype intended | | |

## Round 3 — completed 2026-07-27 · verdict: **DEFECT FOUND** (the comparison tray)

You confirmed the Item 1 placeholder and the honest movement label. One finding:

> *"The +chart is directing to the financial history page instead of opening a bottom drawer like
> in the prototype"*

**Note this reverses a scoping decision in the brief**, which explicitly left the comparison tray
out. It is now built, per the prototype: `+ chart` drops the metric into a drawer pinned to the
bottom of the viewport (chips, Clear/Hide, overlaid chart, *Open in Financial history →*), the
tile reads back **✓ in chart**, and the tray persists across Overview ↔ Financial history.

One deviation: the prototype makes the tray `sticky`, which only reveals it at the very bottom of a
long page. Ours is fixed to the viewport bottom so it is usable while you read.

---

## Round 4 checklist — final re-check

| # | Step | Expected result | Result (✅/❌) | Notes |
|---|---|---|---|---|
| T1 | `/company/AAPL/hub` → click **+ CHART** on any tile | A **Comparison chart drawer opens pinned at the bottom** — the page does **not** navigate away | | |
| T2 | Look at that tile | Its action now reads **✓ IN CHART** | | |
| T3 | Add two more metrics | Three overlaid series, one chip each, readable axis | | |
| T4 | Try a **fourth** | Refused, and the drawer says three is the maximum | | |
| T5 | Click a chip's **×**, then **HIDE**, then **CLEAR** | Removes one · collapses to a slim bar · empties and dismisses the drawer | | |
| T6 | With metrics in the tray, switch to **Financial history** | The tray is still there with the same metrics | | |
| T7 | Click **Open in Financial history →** | The explorer takes over that exact selection (works from either view) | | |
| T8 | Regression: `/company/JPM/hub` | Drained tiles have no + CHART and none reads `0` | | |
| T9 | Overall | Reads as the prototype intended | | |

## Round 4 — completed 2026-07-28 · verdict: **one finding** (the right column)

T1–T8 confirmed the comparison tray. One finding:

> *"All good but there is no right column like in the prototype"*

We were at the 3-cycle cap, so this was escalated as a scoping call rather than looped: the
prototype's right rail is a **Filing timeline**, which is Track-1 and close (the parsing exists)
but whose data belongs to **V3-P3**. You chose **build it now as a placeholder** — done.

The rail carries the prototype's structure and the real filter vocabulary rendered
planned-and-inert, with **no fabricated filing, date or count**, plus a real EDGAR link. It becomes
real when V3-P3 lands, without moving.

**Note on width:** a 262px right column needs room — the prototype's own frame is 1440px with the
content capped at 960 beside it. **At ≥1360px you get the true right column**; below that the rail
renders beneath the content instead of squeezing the statement table. (A bug where it squeezed the
column to 171px at 1280 was caught and fixed in this same pass.)

---

## Round 5 checklist — final re-check

| # | Step | Expected result | Result (✅/❌) | Notes |
|---|---|---|---|---|
| G1 | Widen the window to **≥1360px**, load `/company/AAPL/hub` | A **right column** appears: "Filing timeline · every form as filed", filter chips, and an honest "Not available yet" state | | |
| G2 | Look closely at that rail | **No invented filings, dates or counts.** Filter chips are drained and do nothing (they arrive with the filing-index ingest). "All filings on EDGAR ↗" works | | |
| G3 | Narrow to ~1280px | The rail moves **below** the content — still visible — and the content column stays full width (not squeezed) | | |
| G4 | Go to **Financial history** | The rail is there too | | |
| G5 | Go to **Insider / Institutional / 13D-G** | No rail — those are V3-P5's views | | |
| G6 | Overall | The page now reads as the prototype intended, end to end | | |

---

## Round 1 checklist (for reference — superseded)

**Open:** <http://localhost:8000/company/AAPL>
(the `api` container should be up; if not: `docker compose up -d api`)

### The load-bearing rule for this change

**No missing value may ever render as `0`.** A line a filer didn't report must read `N/A`, and a
metric that can't be computed must stay drained and labelled. The second rule: **there must be no
As-filed / As-restated toggle** — we can't compute an as-filed series yet, so offering the choice
would fake precision. The basis is stated instead.

---

## Checklist

| # | Step | Expected result | AC | Result (✅/❌) | Notes |
|---|---|---|---|---|---|
| 1 | Open `/company/AAPL` | Overview renders; URL becomes `/company/AAPL/hub`; rail reads Overview · Financial history · Insider · Institutional · 13D/G | 1, 2 | | |
| 2 | Read §01 Identity & structure | Registrant, CIK, SIC, fiscal year-end all filled in — **no blank or `—` field** | 6 | | |
| 3 | Read Consolidated subsidiaries | Column heads present, **zero data rows**, copy explains EX-21 is an untagged exhibit. No invented entity/jurisdiction/% | 7 | | |
| 4 | Condensed statements → click **Balance**, then **Cash flow** | Each re-renders with four FY columns; any `N/A` cell is grey text, **never `0`** | 8, 23 | | |
| 5 | Click any tile in Financial snapshot | Expands to the full row; shows formula, basis, restatement, as-of + a chart. Click again → collapses | 11, 24 | | |
| 6 | Find a drained tile (e.g. Interest Coverage) | Reads `N/A` (or `N/M`) with its status glyph — **not `0`, not blank** | 10, 23 | | |
| 7 | In an open drawer, click **Open in Financial history →** | Lands on Financial history with that metric already selected | 13 | | |
| 8 | In the picker, select two more metrics | All three overlay; legend shows three with their latest values | 15, 16 | | |
| 9 | Try to select a **fourth** metric | Refused — legend stays at three **and** the footer flags the maximum (not silently ignored) | 15 | | |
| 10 | Click a legend **×** | That series disappears; the others stay | 16 | | |
| 11 | Click **8 quarters**, then **5 fiscal years** | Chart redraws each time; axis labels legible, nothing clipped | 17, 21 | | |
| 12 | Read the chart footer | States the basis is **as-restated**. **Confirm no As-filed/As-restated toggle exists anywhere** | 22 | | |
| 13 | Scroll to the statement table → **Show your work** | Source tags appear with US-GAAP / EXT badges | 20 | | |
| 14 | Click **View raw JSON**, then click a value in the table | Valid JSON shows; clicking a value reveals the exact reported figure | 20 | | |
| 15 | Switch statement tabs (Income / Balance / Cash Flow / Segments) | Each renders its full table; Segments shows the spike extract | 20 | | |
| 16 | Visit `/company/AAPL/statements` (the OLD url) | Lands on **Financial history** — not Overview | 3 | | |
| 17 | Visit `/company/AAPL?tab=fundamentals` | Lands on **Overview** | 3 | | |
| 18 | Browser **Back** twice, then **Forward** | Views follow your history correctly | 4 | | |
| 19 | Visit `/company/JPM/hub` | Many tiles read N/A or N/M (it's a bank) — confirm **none reads `0`** | 23 | | |
| 20 | Visit `/company/ZZZZNOPE` | Honest not-found with recovery links — no crash, no blank page | — | | |
| 21 | Tab through the snapshot with the keyboard | Focus outlines visible on tiles; Enter opens a drawer | a11y | | |
| 22 | Overall impression | The merged snapshot reads better than the old 28-card grid; the expanded tile feels intentional, not jarring | UX | | |

---

## Sign-off

**Verdict:**

- [x] **Confirmed** — I drove it by hand and accept the change
- [ ] ~~Accepted at QA-tester level~~
- [ ] ~~Defect found~~

**Operator:** operator · **Date:** 2026-07-28

**Round-by-round record:**

| Round | Outcome |
|---|---|
| 1 | Defects found — 13 prototype-fidelity items (leftover chrome, missing breadcrumb, EX-21 layout, percentile bar, clipped axis, unshaded sparkline, "On this page" placement, statement-row charts, condensed tabs) |
| 2 | Defects found — 3 more (Item 1 card, inline section source, tile/drawer anatomy) + the 73-tick axis smear |
| 3 | Defect found — `+ chart` navigated instead of opening the comparison tray (a scope reversal the operator approved) |
| 4 | Finding — no right column; escalated at the cycle cap, operator chose "build it now as a placeholder" |
| 5 | **All good — accepted.** |

**Discrepancies / notes:**

```
(anything that differed from the expected result, or anything that felt wrong even if it
technically passed — a "differs" may be by design, so note it and we'll resolve it)
```

---

*A confirmed sign-off unlocks a deploy **request**. It is not itself a deployment — DevOps stays a
separate, operator-gated stage.*

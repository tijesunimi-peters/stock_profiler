# 4b — Operator manual verification · V3-P5a **phase 2**, §01 on real data

**Purpose:** your hands-on acceptance of §01 *Register snapshot* now carrying this company's real
filings data — and of the fix to the equation-panel layout you reported.

| | |
|---|---|
| **Branch** | `v3-p5a-institutional` (working tree, not committed) |
| **QA verdict** | PASS — pending this step (`4-qa.md`) |
| **URL** | **http://localhost:8010/company/AAPL/institutional** |
| **If it isn't up** | `docker compose --profile e2e run --rm -d -p 8010:8000 --name p5a-preview e2e-app` |

> **Phase 1's questionnaire is preserved** as `4b-manual-verification-phase1.md` — that one accepted
> the *design*. This one accepts the *data*.

### The load-bearing rule for this change

**No missing value may render as `0`, and no unsourceable figure may render as a plausible number.**
Where we cannot honestly compute something it must say `N/A` **and say why**. Everything else on
this page is layout; this is the part that would be a lie if it were wrong.

### What I fixed, from your two reports

**Round 1 — the equation panel.** It was **248px across three rows**; each term sized to its own
content, so `+` and `=` stopped sitting between terms and the arithmetic became a stacked list. Now
**81px, one row, three equal terms**, with the long explanation on one line beneath the panel. I
swept and found the **same defect one cell over** (the strip's "Confirmed in last 30 days" note,
157px → 105px).

**Round 2 — the clipped chart, which you caught and my captures did not.** The dumbbell's label
gutter is a hard-coded 210 units sized for the prototype's "Hedge fund H"; labels are right-anchored
so they run *left*, and the SVG is `overflow: hidden`, so a long manager name is **silently cut**.
The catch: whether it cuts depends on **which font actually loaded** — `NORTHLESS CAPITAL PARTNERS`
measures **165.8 units with the webfont and 184.7 without (+11%)**, which is why it looked fine in
every headless capture and not on your screen. It now **measures the real text after render**
(`getComputedTextLength()`) and grows the gutter to fit, trimming with an ellipsis only past a
330-unit cap and keeping the full name on hover. Verified at the worst case — a 63-character name
*with the webfont blocked*: gutter 210→329, nothing clipped.

**All three had one cause:** the prototype's constants were sized for the prototype's short sample
strings. Real filings text is longer, and in SVG it is font-dependent.

---

## Checklist

| # | Step | Expected result | AC | Result (✅/❌) | Notes |
|---|---|---|---|---|---|
| 1 | Open the URL; read §01's top card | "Register as of **1Q26**", a filed date, a days-since count | AC-1 | ✅ | |
| 2 | **Read the tint panel in *Since the last 13F*** | **One row, reading across: `Base register 2.9B` `+` `Filed since N/A` `=` `Adjusted register N/A`** — not stacked | D-1 | ✅ | |
| 3 | Read the line just under that panel | One sentence explaining why the last two terms are N/A | AC-3 | ✅ | |
| 4 | Read the strip's 4th cell ("Confirmed in last 30 days") | `N/A` · "not tracked" — short, not a 6-line paragraph; full reason sits in the prose below | D-2 | ✅ | |
| 5 | **Scan every number in §01** | **No `0`, `0.0%`, `—` or blank in any value slot.** Every unknown reads `N/A` with a reason | AC-2 | ✅ | |
| 6 | Read the caption under the dumbbell chart | Opens **"DERIVED by diffing two quarter-end 13F snapshots — these are not reported trades"** | AC-4 | ✅ | |
| 7 | Check the dumbbell rows | Real manager names (Vanguard, State Street, Berkshire) with signed deltas — not "Index manager A" | AC-1 | ✅ | |
| 7a | **Look at the left edge of that chart** — the one you reported | **No manager name is cut off.** Each reads in full, right-aligned, clear of the chart's left edge | D-3 | ✅ | |
| 7b | Hover a manager name | A tooltip shows the full name (matters only if a name was long enough to be trimmed with "…") | D-3 | ✅ | |
| 8 | Click **+ ALSO IN THIS SECTION** | Opens; four real Form 4 filings (Cook, Maestri, Adams, O'Brien) with dates | AC-9 | ✅ | |
| 9 | Read the banner at the top of the page | Names **§02–§06** as still-placeholder and says §01 carries real data | AC-6 | ✅ | |
| 10 | Click **Insider activity — ledger, codes, Form 144 →** (bottom of §01) | Lands on the Insider view, real Form 4 ledger. **Back** returns here | AC-9 | ✅ | |
| 11 | Tab to that same link and press **Enter** | Same result — it is keyboard-reachable, not a click-only div | a11y | ✅ | |
| 12 | Open `/company/JPM/institutional` | A **different** register (2 managers, 3.8M) — not AAPL's numbers | AC-1 | ✅ | |
| 13 | Open `/company/ZZZZ/institutional` | An honest 404 ("We don't carry \"ZZZZ\"") — not an empty register | AC-7 | ✅ | |
| 14 | Narrow the window to ~760px | No horizontal scrolling; nothing overflows its card | UI | ✅ | |
| 15 | Step back and read §01 as a whole | Still reads as the ported design — same strip, panel, chart, tiles, expander | AC-8 | ✅ | |

---

## Operator's answers, verbatim (interactive walk-through, 2026-08-01)

Collected in two batches via `AskUserQuestion`.

**Round 1** — *"Reads across correctly"* (the equation panel) · *"No zeros, every unknown says
N/A"* · *"Real filings but the **Since the last 13F** chart is clipped on the left"* ← **defect,
logged as D-3** · *"Both read correctly"* (dumbbell caption + banner).

**Round 2, after the D-3 fix** — *"All names read in full"* · *"All hold"* (steps 8–15) ·
status vocabulary: **"Chips only on N/A and approximate"**.

---

## One question that is yours, not mine

**The status vocabulary.** `RECONCILIATION.md` §3 says every derived value in production should
carry a `statusChip()` (OK `●` / APPROX `≈` / N/A `∅` / N/M `~`). **The prototype has no chips** — it
says the same things in prose, and phase 2 has followed the prototype so far, because adding chips
would change the rendering you accepted at the fidelity gate.

Which do §02–§06 follow?

- **(a) Keep the prototype's prose** — as built now. Pixel-faithful; diverges from the production
  style guide.
- **(b) Add status chips** — matches `STYLE_GUIDE` §6 and the rest of the product; changes the
  design you accepted.
- **(c) Chips only where a value is N/A or approximate** — a middle path; leaves `ok` values
  untouched.

Cheaper to settle now than after five more sections are built the other way.

### ✅ ANSWERED — **(c) chips only on N/A and approximate** (operator, 2026-08-01)

Recorded as **D-chips** in `_active.md`. Implemented on §01 in the same cycle rather than left as
debt, using the shared `ClearyFi.statusChip` (not a local lookalike), so §01 speaks the same
vocabulary as the company hub and the sector views.

**The invariant, asserted not eyeballed:** a slot carries a chip **if and only if** its value is
`N/A`. Driven across all eleven value slots in §01 — 5 chips on the 5 `N/A` slots, 0 on the 6 clean
values, **`violations: []`**. §02–§06 follow this rule as they are plumbed.

---

## Sign-off

**Verdict** (tick one — there is no QA-tester-level acceptance for a rendered change):

- [x] **Confirmed** — I drove it and I accept it
- [ ] **Defect found** — details below

**Operator:** tijesunimi-peters
**Date:** 2026-08-01

**Discrepancies / notes:**

Two defects were found by the operator during this walk-through and **both were fixed inside it**,
with the questionnaire re-run afterwards rather than signed over them:

1. **D-1, the equation panel** — reported before the walk-through, fixed, confirmed in round 1
   ("Reads across correctly").
2. **D-3, the dumbbell chart clipped on the left** — reported in round 1, fixed, confirmed in
   round 2 ("All names read in full"). **This one is the argument for the gate**: it is
   font-dependent, so it rendered clean in every headless capture and only appeared on the
   operator's screen. No automated check in this repo would have caught it.

A third (**D-2**) was found by sweeping for D-1's cause and fixed before the walk-through.

The status-vocabulary question was answered as part of the same session — **(c)**, above.

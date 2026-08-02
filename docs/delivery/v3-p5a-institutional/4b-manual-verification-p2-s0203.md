# 4b — Operator manual verification · V3-P5a phase 2, **§02 and §03 on real filings data**

**Purpose:** your hands-on acceptance that §02 and §03 now tell the truth about a real company's
filings. QA's own evidence never counts as acceptance — this does.

| | |
|---|---|
| **Branch** | `v3-p5a-institutional` @ `d82aee3` + the QA period fix |
| **QA verdict** | **PASS** — two defects found and fixed during QA (`4-qa.md`, D-QA-1/2) |
| **Operator verdict** | ✅ **CONFIRMED 2026-08-01** — walked interactively, all 14 rows first-pass |
| **Start the app** | `docker compose --profile e2e run --rm -d -p 8010:8000 --name p5a-preview e2e-app` |
| **URL** | **http://localhost:8010/company/AAPL/institutional** |
| **Time** | ~6 minutes |

> ⚠️ Three earlier QA pairs are on disk and **none of them covers this**. `*-phase1.md` is the
> fidelity gate (design only, no data); `*-p2-s01.md` is §01's plumbing, which you signed on
> 2026-08-01. This is §02 and §03.

## The load-bearing rule for this change

**A number on this page is either something a filer actually filed, or it is `N/A` with a reason.
Nothing in between.** Two corollaries that are easy to get backwards, and both appear below:

- A **measured zero is a zero** — "0 managers exited" is a real finding and prints as `0`.
- An **unknowable value is N/A**, even when the arithmetic would produce a number. The "8+
  quarters" cohort *cannot* be non-zero when we hold four quarters, so it must not print `0%`.

## Checklist

| # | Step | Expected result | AC | Result ✅/❌ | Notes |
|---|---|---|---|---|---|
| 1 | Load the URL | Banner names only **§04–§06**. §02 and §03 show real figures, no prototype names like "Index manager A" | AC-1 | ✅ | As expected |
| 2 | §03 → "Position changes over time" | Bars per quarter, a table that matches them, four count tiles. "Exited" may read `0 · 0 of shares` — that is a **real** zero | AC-3 | ✅ | As expected — the `0 · 0 of shares` on Exited read as a real count |
| 3 | "Who holds what" → click **Treemap**, then **Cumulative share** | Chart **and** caption both change; returns exactly where it started | AC-5 | ✅ | As expected — chart AND caption both change, returns exactly |
| 4 | Click **⤡ Expand** in each of those two views | The dialog opens **the view you were looking at**, under its own title | AC-5 | ✅ | As expected — the dialog opens the view being looked at, each time |
| 5 | Click the **Effective holders** number | A trend panel opens with three measures (HHI, Gini, half the register) | AC-5 | ✅ | As expected — trend panel with three measures |
| 6 | Open **+ Also in this section** | Four cards appear. **Peer-matrix labels are readable, not clipped or overlapping.** Hover one — the full name appears | AC-10 | ✅ | As expected — matrix labels readable, not clipped or overlapping; hover gives the full name |
| 7 | "Overlap with sector peers" → **Set intersections** → **⤡ Expand** | The UpSet plot, under "Manager set intersections" | AC-5, AC-7 | ✅ | As expected — UpSet opens under its own title |
| 8 | **"Where every share sits" — read this one carefully** | Three bars, each with **its own as-of date**, a *denominator* line, and **no total and no residual row**. Do you miss the removed "Residual over time · TREND" control? | AC-6 | ✅ | **Reads as non-additive** — the three bars read as independent measurements, not parts of a whole |
| 9 | "Stable-capital share" | **"8+ quarters" reads `N/A` with a chip — not `0%`** — and the caption says why | AC-3 | ✅ | As expected — 8+ quarters reads N/A with a chip, caption explains |
| 10 | Open **http://localhost:8010/company/JPM/institutional** | Domicile and overlap render honest **empty states with reasons**. Nothing shows `0` | AC-2 | ✅ | As expected — JPM's domicile and overlap give reasons, no zeros |
| 11 | Paste `http://localhost:8010/v1/companies/AAPL/institutional-holder-domicile?period=not-a-date` | A **400** naming the bad value — *not* a page saying "no filings for this quarter" | AC-12 | ✅ | As expected — 400 naming the bad value |
| 12 | Narrow the window to phone width | No horizontal scrollbar; nothing runs off the right edge | AC-11 | ✅ | As expected — no horizontal bleed at phone width |
| 13 | Keyboard: Tab to the **Effective holders** stat and press Enter | It opens, with a visible focus ring | AC-5 | ✅ | As expected — focus ring visible, Enter opens the panel |
| 14 | Honesty scan — read §03's captions | Every derived figure says what it does **not** tell you. Nothing over-claims (no alpha/timing/price language) | AC-9 | ✅ | As expected — limits stated, nothing over-claims |

## The two judgement calls QA cannot make for you

These are not pass/fail rows — they need your eye:

- **Step 8, the attribution card.** The three bars *overlap* and deliberately do not sum: a 5%+
  institutional holder files both a 13F and a 13D/G, and a 10% owner is also an insider. The card
  says so twice. **Does it read that way, or does the visual grammar of three aligned bars invite
  the opposite reading?** This is the change most likely to mislead about a real company.
  → ✅ **OPERATOR: "Reads as non-additive"** — the three bars read as independent measurements
  against shares outstanding, not as parts of a whole. **This was QA's top residual risk, cleared.**

- **Step 6/7, the peer group.** Peers are the SIC group ranked by the size of their own *ingested*
  register — coverage-dependent by construction, and stated in the caption. **Do the peers read as
  a sensible comparison set, and are the trimmed labels still identifiable?**
  → ✅ **OPERATOR: "Sensible, labels identifiable."**

## Known and deliberate — not defects

- **The "Residual over time · TREND" control is gone**, with its panel. It belonged to the
  unreported-residual row *you* ruled out on 2026-08-01; a trend of a number we no longer stand
  behind would be worse than the row was. The foot now carries the denominator instead. **Flagged
  because it changes a rendering you already accepted at the fidelity gate.**
  ✅ **OPERATOR: "Accepted as built"** (2026-08-01).
- **Deviation D3 is now closed** — the treemap re-squarifies at the dialog's aspect instead of
  scaling the card's layout, which is what the prototype did. It became possible once the layout
  was a computation rather than a recovered literal.
- **The app has one light theme**, by design (`shell.css:141`). Dark-mode emulation changing
  nothing is correct.
- **Page load is ~3–5 s on the whole-market volume** (13 concurrent requests serialising on one
  event loop). Not introduced by this change and not fixable without an architectural decision —
  raised in `4-qa.md` §8.

## Sign-off

- [x] ✅ **Confirmed** — *"Confirmed — I drove it and I accept it"*
- [ ] **Defect found**

**Operator:** tijesunimi-peters  **Date:** 2026-08-01
**Walked interactively** in four batches; every answer transcribed verbatim above.

**Discrepancies / notes:**

```
None. All 14 rows returned "As expected" on the first pass — no row needed a second look
and no defect was found at the gate.

Both judgement calls came back clean:
  * the attribution card READS as non-additive (QA's top residual risk, cleared);
  * the peer group reads as a sensible comparison set with identifiable labels.

The one deviation raised for a ruling — the removed "Residual over time · TREND" control —
is ACCEPTED AS BUILT.
```

## ✅ Gate closed

**§02 and §03 are operator-accepted.** This unlocks a deployment *request*; it is not a
deployment (that stays operator-gated, `/devops-engineer`).

*A ❌ on any row is a defect → back to the owning engineer, then re-QA. There is no
"accepted at the QA-tester level" option (D-manual-gate, 2026-07-31).*

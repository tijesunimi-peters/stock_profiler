# 4b — Operator manual verification · the ported affordances (V3-P5a phase 1)

**Purpose:** your hands-on acceptance that the design port's controls now behave like the
prototype's. QA's own evidence does not accept a change — this does.

| | |
|---|---|
| **Branch** | `v3-p5a-institutional` (uncommitted, on top of `735a14f`) |
| **QA verdict** | PASS — pending this verification (`4-qa.md`; 49 driven assertions, 0 failures) |
| **URL** | **http://localhost:8010/company/AAPL/institutional** |
| **If it isn't up** | `docker compose --profile e2e run --rm -d -p 8010:8000 --name p5a-preview e2e-app` (host 8000 is the running `api` container). To compare against the prototype: `docker run -d --rm --name proto-srv -p 9000:9000 -v "$PWD/docs/design/sector-app-prototype-v3:/srv:ro" -w /srv python:3.11-slim python -m http.server 9000` → http://localhost:9000/prototype.dc.html |
| **Class** | **Blocking, unconditionally** (operator policy 2026-07-31 — every rendered change needs the hands-on run). The verdict stays "pending" until you sign off. |

### The load-bearing rule for this change

**A control that renders perfectly and does nothing is not ported.** Every button here should do
what the prototype's does — and where it deliberately doesn't, `4-qa.md` says so and you should
agree with the reasoning. Nothing on this page is real data; the NOT-REAL-DATA banner must still be
there and must not be dismissible.

---

## Checklist

| # | Step | Expected result | AC | Result (✅/❌) | Notes |
|---|---|---|---|---|---|
| 1 | §03 "Position changes over time" → `⤡ Expand` | Dimmed overlay; large chart; title "Position changes over time"; `CLOSE` top-right | AC-2 | ✅ | operator, 2026-07-31 (batch A) |
| 2 | Look closely at the enlarged chart | Crisp — **text the same size as on the page**, not magnified with the chart | AC-3 | ✅ | operator, 2026-07-31 (batch A) |
| 3 | Press `Escape`; re-open, click outside the panel; re-open, click `CLOSE` | Closes all three ways; the page is where you left it | AC-4 | ✅ | operator, 2026-07-31 (batch A) |
| 4 | §03 "Who holds what" → `Treemap` | Bars replaced by the treemap, the caption below changes, `Treemap` becomes the filled button | AC-6 | ✅ | operator, 2026-07-31 (batch B) |
| 5 | Still in treemap view → `⤡ Expand` | The lightbox shows the **treemap**, titled "Who holds what" (not the bar chart) | AC-6 | ✅ | operator, 2026-07-31 (batch B) |
| 6 | Close, then `Cumulative share` | Bars and the original caption come back | AC-6 | ✅ | operator, 2026-07-31 (batch B) |
| 7 | §03 "Overlap with sector peers" → `Set intersections` | Matrix replaced by bars over a dot grid + a "Combination held / Managers / Share" table; `Peer matrix` switches back | AC-7 | ✅ | operator, 2026-07-31 (batch B) |
| 7b | **Still in Set intersections → `⤡ Expand`** | The lightbox shows the **set-intersections plot**, titled "Manager set intersections" — *not* the peer matrix. Switch back to `Peer matrix` and Expand again: now it shows the matrix | AC-7 | ✅ | operator, 2026-07-31 — "Both follow the view". The defect they found is fixed and hand-confirmed |
| 8 | §03 "Where every share sits" → `Trend` | Tinted panel inside the card: "Unreported residual 32.8% → 0.6% over nine quarters" + a small chart. Click again to close | AC-8 | ✅ | operator, 2026-07-31 (batch C) |
| 9 | §03 "How concentrated the register is" → click the `17` / "Effective holders" block | Same kind of panel + "The measures behind it" (HHI 589, Gini 0.84, Half the register 7) | AC-8 | ✅ | operator, 2026-07-31 (batch C) |
| 10 | **Tab** to that same stat and press **Enter** | It toggles from the keyboard, with a visible focus ring | AC-8 | ✅ | operator, 2026-07-31 (batch C) |
| 11 | §01 → `ƒ DERIVED` in the "Institutional share" tile | A panel opens **below the tile row, full width**: "How this is computed…". Badge reads `ƒ HIDE`. Click again to close | AC-5 | ✅ | operator, 2026-07-31 (batch C) |
| 12 | §02 → `ƒ DERIVED` on "Manager mix" **and** on the top-ten block | Each opens its own panel with its own formula and caveat | AC-5 | ✅ | operator, 2026-07-31 (batch C) |
| 13 | Any `↗` link (`Base 13F ↗`, `13F filings ↗`, `13F table ↗`) | Opens EDGAR full-text search in a **new tab** | AC-9 | ✅ | operator, 2026-07-31 (steps 13–15 batch) |
| 14 | Scroll the whole page with everything closed again | Looks exactly as it did before this change — nothing moved, nothing new is visible at rest | AC-10 | ✅ | operator, 2026-07-31 (steps 13–15 batch) |
| 15 | **Honesty scan** | The `⚠ STATIC DESIGN PORT — NOT REAL DATA` banner is at the top and cannot be dismissed; nothing you opened claims to be filed data for AAPL | — | ✅ | operator, 2026-07-31 (steps 13–15 batch) |

## The four deviations — please rule on these

Each is a place where I did **not** copy the prototype. `4-qa.md` §7 has the measurements.

**Ruled by the operator, 2026-07-31 — all four accepted as built.**

| # | Deviation | Why | Ruling | Notes |
|---|---|---|---|---|
| D1 | **Derivation panels open under the block they explain.** The prototype puts *all* of them in one shared slot at a fixed position — measured at y343, between the first card and "Since the last 13F" — so its tile badge at y938 opens a panel 600px above itself | Porting that would be porting a bug | | |
| D2 | **§01's card-head `ƒ DERIVED` only flips its label.** That is exactly what the prototype does (two clicks return the DOM byte-identical) | Ported as-is rather than inventing a panel — but it does read as broken | ✅ **Leave it faithful** | operator, 2026-07-31 |
| D3 | **The treemap in the lightbox is the card's layout scaled up.** The prototype re-squarifies at the modal's aspect, so its cells are arranged differently there | Its markup doesn't expose the squarify variant; areas are exact, arrangement isn't | ✅ **Accept the scaled version** | operator, 2026-07-31 |
| D4 | **The clickable stat is keyboard-operable** (`role="button"`, Tab + Enter, focus ring). The prototype gives it a pointer cursor only | A control that can't be reached by keyboard isn't a control | ✅ **Keep the keyboard access** | operator, 2026-07-31 |

## Also worth your eye

- **Dark theme**: the port has never been reviewed in dark, for any section. Out of scope for this
  change, but it is an open phase-1 gap.

---

## Sign-off

- [x] **Confirmed** — I drove it and I accept it *(operator, 2026-07-31)*
- [ ] **Defect found** — details below

*(The "accepted at the QA-tester level" option was removed by operator policy on 2026-07-31: the
hands-on run is mandatory for every change with a rendered surface. QA's automated evidence is
evidence, never acceptance.)*

**Operator:** tijesunimi-peters  **Date:** 2026-07-31

**Discrepancies / notes:**

```
Steps 1-15 all pass, including 7b (the overlap ⤡ Expand defect I found earlier — now fixed and
re-confirmed by hand). All four deviations accepted as built.

One defect found during the PHASE-1 FIDELITY GATE walkthrough on the same day, recorded below.
```

---

## 🚦 Phase-1 fidelity gate — operator walkthrough, 2026-07-31

The gate three previous attempts died on. Walked interactively against the prototype
(`localhost:9000` → Companies → Institutional) with the port at `localhost:8010`.

| # | Check | Result | Notes |
|---|---|---|---|
| G1 | §01–§03 side by side, expanders open — does anything read as OUR old design? | ⚠️ | **"The left rail is not fixed like in the prototype."** Everything else indistinguishable |
| G2 | §04–§07 side by side, expanders open — same question | ✅ | "Indistinguishable" |
| G3 | The whole page: rhythm between sections, jump list, right rail, view header | ✅ | "Reads as the prototype" |
| **Verdict** | **Confirmed — the design is faithful** | ✅ | Gate PASSES. Phase 2 unlocked |

### G1's defect — the rail was not sticking, and every measurement had missed it

`.shell-rail` **was** `position: sticky; top: 74px` — the rule was right and had been right since
V3-P2. But its **mount host** (`#viewRail` / `#railHost`) is a flex item of
`.shell-body { align-items: flex-start }`, so it shrink-wrapped to the rail's own height (**549px**).
A sticky element is bounded by its parent's box, so the rail unstuck itself the moment you scrolled
past 549px and rode away with the page. The prototype's `<nav>` is a direct child of the ~7,300px
flex row, which is why its rail stays put.

Fix: `.shell-rail-host { align-self: stretch; }`, with the class added to both mount points
(`company.html`, `sectorapp.js`) — shell-wide, so every page gets it.

Verified: after scrolling 2,500px our rail sits at **y = 74**, the same as the prototype's
(measured 74 in both). It now sticks on `/company/*/hub`, `/history` and `/sectors` as well.
§01 and §04 re-diffed — unchanged, zero bands. e2e 44 shots, `manager` / `compare` / `trajectories`
/ every institutional view `errors=0`.

**Why nothing caught it:** every diff in this port is a *static* capture of one scroll position.
Sticky behaviour only exists in the difference between two scroll positions, and nothing in the
tooling compared those. `tools/rail.js` now does — probe before and after a scroll, on both sides.
This is the second time the hands-on gate has caught what the automation could not, and the
strongest argument yet for D-manual-gate.

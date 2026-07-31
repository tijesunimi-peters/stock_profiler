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
| 7b | **Still in Set intersections → `⤡ Expand`** | The lightbox shows the **set-intersections plot**, titled "Manager set intersections" — *not* the peer matrix. Switch back to `Peer matrix` and Expand again: now it shows the matrix | AC-7 |  | **RE-CHECK** — this was the defect you found; fixed 2026-07-31, not yet hand-verified |
| 8 | §03 "Where every share sits" → `Trend` | Tinted panel inside the card: "Unreported residual 32.8% → 0.6% over nine quarters" + a small chart. Click again to close | AC-8 | ✅ | operator, 2026-07-31 (batch C) |
| 9 | §03 "How concentrated the register is" → click the `17` / "Effective holders" block | Same kind of panel + "The measures behind it" (HHI 589, Gini 0.84, Half the register 7) | AC-8 | ✅ | operator, 2026-07-31 (batch C) |
| 10 | **Tab** to that same stat and press **Enter** | It toggles from the keyboard, with a visible focus ring | AC-8 | ✅ | operator, 2026-07-31 (batch C) |
| 11 | §01 → `ƒ DERIVED` in the "Institutional share" tile | A panel opens **below the tile row, full width**: "How this is computed…". Badge reads `ƒ HIDE`. Click again to close | AC-5 | ✅ | operator, 2026-07-31 (batch C) |
| 12 | §02 → `ƒ DERIVED` on "Manager mix" **and** on the top-ten block | Each opens its own panel with its own formula and caveat | AC-5 | ✅ | operator, 2026-07-31 (batch C) |
| 13 | Any `↗` link (`Base 13F ↗`, `13F filings ↗`, `13F table ↗`) | Opens EDGAR full-text search in a **new tab** | AC-9 |  |  |
| 14 | Scroll the whole page with everything closed again | Looks exactly as it did before this change — nothing moved, nothing new is visible at rest | AC-10 |  |  |
| 15 | **Honesty scan** | The `⚠ STATIC DESIGN PORT — NOT REAL DATA` banner is at the top and cannot be dismissed; nothing you opened claims to be filed data for AAPL | — |  |  |

## The four deviations — please rule on these

Each is a place where I did **not** copy the prototype. `4-qa.md` §7 has the measurements.

| # | Deviation | Why | Accept / change it back | Notes |
|---|---|---|---|---|
| D1 | **Derivation panels open under the block they explain.** The prototype puts *all* of them in one shared slot at a fixed position — measured at y343, between the first card and "Since the last 13F" — so its tile badge at y938 opens a panel 600px above itself | Porting that would be porting a bug | | |
| D2 | **§01's card-head `ƒ DERIVED` only flips its label.** That is exactly what the prototype does (two clicks return the DOM byte-identical) | Ported as-is rather than inventing a panel — but it does read as broken | | |
| D3 | **The treemap in the lightbox is the card's layout scaled up.** The prototype re-squarifies at the modal's aspect, so its cells are arranged differently there | Its markup doesn't expose the squarify variant; areas are exact, arrangement isn't | | |
| D4 | **The clickable stat is keyboard-operable** (`role="button"`, Tab + Enter, focus ring). The prototype gives it a pointer cursor only | A control that can't be reached by keyboard isn't a control | | |

## Also worth your eye

- **Dark theme**: the port has never been reviewed in dark, for any section. Out of scope for this
  change, but it is an open phase-1 gap.

---

## Sign-off

- [ ] **Confirmed** — I drove it and I accept it
- [ ] **Defect found** — details below

*(The "accepted at the QA-tester level" option was removed by operator policy on 2026-07-31: the
hands-on run is mandatory for every change with a rendered surface. QA's automated evidence is
evidence, never acceptance.)*

**Operator:** ______________________  **Date:** ______________

**Discrepancies / notes:**

```

```

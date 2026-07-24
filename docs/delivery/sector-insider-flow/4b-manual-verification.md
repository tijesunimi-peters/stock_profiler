# P6a — Sector Insider flow — Operator manual verification

**Purpose:** your hands-on acceptance of the real Insider-flow card on the Sector view (replaces the
placeholder). QA's report (`4-qa.md`) is a green **PASS — pending this step**; this file records
*your* acceptance.

- **Branch:** `sector-insider-flow`
- **QA verdict:** PASS — pending manual UI verification (interactive change → hands-on required)
- **URL to open:** `http://localhost:8000/sectors`
  - Start it: `docker compose --profile e2e up -d e2e-app` (seeds a demo DB, no network needed),
    then open the URL. Tear down after with `docker compose --profile e2e down`.
  - (Or `docker compose up api` against a real volume — but on a stock volume most sectors will
    honestly read **N/A** until the insider cache is re-warmed with the new parser; that's expected.)

**The load-bearing rule for this change:** a sector with **no** insider data must read **N/A ("No
insider data … not zero")** — **never `$0`** — and the sector net figure must stay **value-neutral**
(no green/red) and carry the **derived-rollup + reporting-lag + open-market-P/S-only** caveats, with
**no** 13F long-only/45-day language.

## Checklist

| # | Step | Expected result | AC | Result (✅/❌) | Notes |
|---|------|-----------------|----|---------------|-------|
| 1 | Open `/sectors` (default sector) | "Insider flow" card (right of "Geographic revenue mix") shows a signed net (e.g. "−$8.3M"), a direction word (NET SELLING/BUYING/FLAT), "Buys … · Sells …", "N transactions · M filers", hint "Forms 3/4/5 · last 90 days" | AC-9 | ✅ (w/ change) | Card correct; operator requested a quicker-read cue → **arrow + accent tint** added (see below). |
| 2 | Look at the net figure's color | Was uncolored ink; per operator request now a **single neutral accent** (terracotta) for BOTH directions — **not** green/red; direction carried by arrow (↑/↓/→) + word | AC-11 | ✅ | Not a favorability color code; one accent for buy & sell. |
| 3 | Read the card foot, then hover it | Foot: "Derived rollup · reporting lag · open-market P/S only"; hover shows the full 4-caveat list; **none** mention 13F / long-only / 45-day / snapshot | AC-12/13 | ✅ | |
| 4 | Switch the sector dropdown to **Chemicals & Allied Products** (group 28) | Card swaps to "No insider data for this sector yet … Shown as N/A, not zero." — **no `$0`, no NaN** | AC-10 | ✅ | Honest N/A confirmed. |
| 5 | Switch to a data-bearing sector and back a couple of times | Card recomputes cleanly each time — no stale figure, no wrong-sector flash | interaction | ✅ | (covered via sector switching in 1/4/6) |
| 6 | Find a sector where net is $0 with data present (demo: group 60 "Depository Institutions") | Reads "$0 · NET FLAT" — distinct from the N/A empty state (data present, not missing) | AC-3/honesty | ✅ | Distinct from N/A confirmed. |
| 7 | Dark theme | (App is **light-only** by design — the "paper terminal" aesthetic; no dark mechanism exists.) Card legible on the cream surface | AC-11 | ✅ | N/A dark mode; accent legible in light. |
| 8 | Narrow the browser to mobile width | The geo/insider row stacks to one column; card doesn't overflow/clip; net figure readable | layout | ✅ | Stacks cleanly. |

**Change applied during this gate (qa cycle 1):** per the operator's check-1 request, the net figure
gained a **direction arrow (↑ net buying / ↓ net selling / → flat) + a single neutral accent tint**
(the app's terracotta `--accent-ink`, the SAME for both directions — deliberately not a green/red
good-bad code, so no STYLE_GUIDE favorability-color deviation is created). Verified in fresh
screenshots: `verify-insider-buy.png` ("↑ +$12.4M · NET BUYING", accent) and `verify-sell73.png`
("↓ −$8.3M · NET SELLING", same accent); N/A (`verify-na28.png`) unaffected.

## Sign-off

- **Verdict:** ☑ Confirmed (interactive walk-through, 2026-07-24) — all 8 checks ✅; the check-1
  quicker-read request was implemented as an arrow + neutral-accent tint and re-verified.
- **Operator:** tijesunimi-peters (interactive, transcribed)
- **Date:** 2026-07-24
- **Discrepancy / notes:** Only "differ" was the deliberate uncolored figure → operator wanted a
  faster read; resolved with the neutral arrow + single-accent treatment (not green/red), preserving
  the no-favorability-color honesty rule. No defects.

A ❌ on any row is a defect → back to the owning engineer (frontend for rendering/copy/UX, backend
for the data/contract). A completed/Confirmed sign-off here unlocks a deploy *request* (DevOps stays
operator-gated).

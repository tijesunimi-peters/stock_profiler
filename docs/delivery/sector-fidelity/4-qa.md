# QA — Sector view prototype-fidelity pass

Stage 4 (QA Tester). Branch: **`sector-fidelity`** (off `master`; uncommitted).
Verdict: **PASS — pending manual UI verification** (operator-gated).

Tested against AC-1…AC-11 in `1-brief.md`, the design in `2-architecture.md`, and the engineer
handoff in `3-implementation.md`.

## How verified

- **pytest (Docker):** **511 passed, 6 skipped** — no regression (frontend-only; no `.py` change).
- **e2e headless render check** (`docker compose build api` → `--profile e2e`): **PASS, errors=0**;
  the `sectorapp-decomp` shot (now a tile click) captured the fidelity items.
- **Scripted driving pass** — puppeteer over the live e2e-app: **16/16 checks PASS** (computed styles,
  tile-click-both, placeholder columns, colored delta chip, mobile).
- **Screenshots eyeballed:** `sectorapp-decomp.png` (desktop, expanded tile) + `qa-fidelity-mobile.png`.

## Per-acceptance-criterion verdict

- **AC-1 — sub-industry placeholder.** **PASS.** Control bar shows a "Sub-industry — to be defined"
  pill; no fabricated SIC-4 names (grep + computed).
- **AC-2 — coverage placeholder.** **PASS.** Meta row shows "coverage — to be defined"; **no "%"**.
- **AC-3 — decomposition columns.** **PASS.** Computed `.pa-decomp-row` = `200px 60px 476px 52px`
  (= `200px 60px 1fr 52px`).
- **AC-4 — biggest-shifts layout + flag.** **PASS.** `.pa-shift-row` is `flex`; a `|z|≥1.5` shift
  shows a "notable" flag chip; row stays neutral (no favorability color).
- **AC-5 — `3fr 2fr` drill row + placeholder feed.** **PASS.** `.pa-drill-row` computes `508px 338px`
  (≈ 3:2); the right cell is the labeled "What's moving · placeholder" feed card — **no fabricated
  feed items**.
- **AC-6 — tile click shows both.** **PASS.** Clicking a tile opens the decomposition **and** the peer
  strip + drill-down together.
- **AC-7 — delta chip color, score neutral.** **PASS.** `.pa-tile-delta.pos` = `rgb(94,125,79)` (muted
  moss), `.neg` = `rgb(168,67,46)` (muted brick) — **not** a stoplight; the arrow sits inside the chip;
  the score number stays `rgb(28,26,22)` (`--ink`); a null delta ("→ no prior FY") is **uncolored**.
- **AC-8 — provisional banner tint.** **PASS.** Banner background = `rgb(245,226,218)` (`--ext-bg`) —
  resolves (was transparent before the local `--ext` tokens).
- **AC-9 — honesty.** **PASS.** No fabricated coverage %/sub-industry name/feed item anywhere
  (grep + DOM scan); every placeholder is clearly labeled; the provisional caveat ("a position … not a
  good/bad or buy verdict") is present; null delta stays "→ no prior FY", never 0.
- **AC-10 — platform.** **PASS.** No CDN/React/Tailwind added; favorability tokens used **only** on the
  delta chip; 390px overflow **= 0** (drill row + shift row stack); `pytest` green.
- **AC-11 — no regression.** **PASS.** Compare + Qualitative views and the old `/sectors` page still
  render.

## Review questionnaire

1. **What shipped.** The `/sector-analytics` **Sector view** now matches the prototype's altitude-1
   layout: control-bar **sub-industry + coverage placeholders**, exact **decomposition** column widths,
   the prototype's **biggest-shifts** flex row (with a "notable" flag), the **`3fr 2fr` drill row** with
   an honest **placeholder feed** on the right, a **tile click that opens both** decomposition + peers/
   dispersion, and **favorability color on the score-delta chip only** (arrow inside, score neutral).
2. **Surfaces touched.** **Frontend-only** — `sectorapp.js` + `sectorapp.css` (+ one `headless_check.js`
   interaction). No backend/endpoint/schema; reuses existing sector endpoints.
3. **AC → evidence.** All 11 ACs above, each tied to a computed style / DOM assertion (16/16 driving) or
   the eyeballed `sectorapp-decomp.png` / `qa-fidelity-mobile.png`.
4. **States exercised.** Populated Sector view; expanded tile (decomp + peer strip + drill-down +
   placeholder feed); the honest empty-scorecard path is unchanged (renders before the drill row).
5. **Edge cases probed.** N/A-never-0: null delta "→ no prior FY" uncolored, not 0; placeholders never
   fabricate a value; a metric with no distribution stays omitted (not zeroed) in the drill-down.
6. **Honesty contract.** Placeholders unmistakably empty; color confined to the delta chip and paired
   with the arrow (never color alone); score stays a neutral position, not a verdict; no fabricated
   coverage/sub-industry/feed.
7. **Deltas from the brief.** The operator resolved a directive conflict (prototype is color-free vs.
   "add color") → color the **scorecard delta chip only**; biggest-shifts stays neutral (prototype-
   faithful). Everything else matches the prototype.
8. **Residual risk.** The *felt* interaction (tile click, the delta-chip color reading, the placeholder
   columns reading as clearly empty) needs a human — see the manual step.

## Manual UI verification (required — pending operator)

Automated checks confirm structure/computed styles; a human must confirm the **felt** result. Run
against a seeded instance of this branch (I can publish it on `:8001`). Steps:

1. Open `/sector-analytics`. → control bar shows a **"Sub-industry — to be defined"** pill and
   **"coverage — to be defined"** in the meta row — both unmistakably *placeholders*, not data.
2. Read the scorecard. → delta chips are **colored** (↑ green / ↓ brick), the arrow is inside the chip,
   and the **score numbers stay neutral**; "→ no prior FY" has **no** color.
3. Click a **tile** (not the score). → the **decomposition opens AND** the peer strip + drill-down
   appear together.
4. Look at the bottom row. → drill-down on the **left ~3/5**, a **"What's moving · placeholder"** card
   on the **right ~2/5** that clearly reads as an empty Track-2 placeholder (no fake feed items).
5. Biggest shifts → a **"notable"** flag chip on large moves; the row is **not** color-coded.
6. Resize to **390px** → everything stacks, **no horizontal scroll**.

**Operator outcome:** ☑ **run by the operator, 2026-07-22 (branch published on `:8001`) — all 6 steps
confirmed, no change requests.** Placeholders read as clearly empty (1); delta chips colored with
neutral score numbers + uncolored null (2); tile click opens decomposition + peer strip/drill-down
together (3); `3fr 2fr` drill row with a clear placeholder feed (4); "notable" flag chip + neutral
shift row (5); clean 390px reflow (6).

## Handoff

**Verdict: PASS — ready to deploy** (operator-gated). All 11 acceptance criteria met; `pytest` green;
e2e green + eyeballed; **manual UI verification complete (operator, 2026-07-22 — 6/6 steps, no change
requests).** The honesty rail holds (placeholders never fabricate; color only on the delta chip, paired
with the arrow, score neutral). Frontend-only; Company/Compare/Qualitative + `/sectors` untouched. No
defects require a loop back.

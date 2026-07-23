# QA — Compare view prototype-fidelity pass

Stage 4 (QA Tester). Branch: **`compare-fidelity`** (off `master`; uncommitted).
Verdict: **PASS — pending manual UI verification** (operator-gated).

Tested against AC-1…AC-7 in `1-brief.md` + the architecture in `2-architecture.md`.

## How verified

- **pytest (Docker):** **511 passed, 6 skipped** — no regression (frontend-only).
- **e2e headless render check:** **PASS, errors=0**; `sectorapp-compare*` shots capture the new layout.
- **Scripted driving pass:** **13/13 checks PASS** (header, composite `170/1fr/84` grid, metric-card
  grid + bg-tint, dropdown recompute, no color/no winner, mobile).
- **Screenshots eyeballed:** `sectorapp-compare.png` + `qa-cmpfid-mobile.png`.

## Per-acceptance-criterion verdict

- **AC-1 — header.** **PASS.** `.pa-cmp-head2` shows A accent swatch + "Business Services" · "vs" · B
  blue swatch + "Depository Institutions" · **"59 vs 44 filers"** (real `peer_count`). The "01 Sector
  compare" section head is gone.
- **AC-2 — dropdowns kept.** **PASS.** `#cmpSelA/#cmpSelB` present; changing B (→ 28) recomputes the
  header + composite + cards ("… vs Chemicals & Allied Products · 59 vs 26 filers").
- **AC-3 — composite card.** **PASS.** Rows use computed **`170px 538px 84px`** (= `170px 1fr 84px`)
  inside `.pa-cmp-scorecard`; **8** rows (composite + 5 themes + 2 deferred); bars in the middle cell.
- **AC-4 — metric cards.** **PASS.** `.pa-cmp-cards` is a responsive auto-fit grid (2×424px at
  1280px); `.pa-cmp-card` bg = `rgb(239,233,222)` (`--bg-tint`); "lower is better" marker + **3** N/A
  cells intact.
- **AC-5 — honesty.** **PASS.** A bar `rgb(192,112,58)` (accent), B `rgb(61,106,138)` (blue) — no
  green/red, no winner text; bars true-length; gap labels ink-weight (`|gap|≥10` full ink).
- **AC-6 — platform.** **PASS.** 390px overflow **= 0** (header wraps, rows stack name/bars/gap, cards
  single-column); `pytest` green.
- **AC-7 — no regression.** **PASS.** Sector view + old `/sectors` render; pin-to-compare + `?a=&b=`
  presets still work.

## Review questionnaire

1. **What shipped.** The Compare view now matches the prototype's altitude-3 layout: an **A/B header**
   (swatch + name · "vs" · swatch + name · counts), a **"Composite scores · shared 0–100 scale" card**
   with `name · paired bars · gap` rows (`170/1fr/84`), and **metric-median cards** on `--bg-tint`.
   The dropdown selectors are kept (operator choice).
2. **Surfaces touched.** **Frontend-only** — `sectorapp.js` (`cmpHead`, `cmpThemesHtml`, `cmpScoreRow`,
   `cmpNotScoredRow`, `sectorPeerCount`) + `sectorapp.css` (`.pa-cmp-head2`, `.pa-cmp-scorecard`,
   `.pa-cmp-row` grid, cards). No backend; **no new data** (Compare is all real → no placeholders).
3. **AC → evidence.** All 7 ACs above (13/13 driving assertions) + the eyeballed shots.
4. **States exercised.** Populated (73 vs 60); B-change recompute (→ 28, more N/A); not-scored rows;
   the B-unset prompt + no-scores empty remain as fallbacks.
5. **Edge cases probed.** N/A cells for a sector missing a metric; not-scored rows (banks' op-efficiency
   + 2 deferred) never a 0 bar; counts "—" if a side is unknown (never fabricated).
6. **Honesty contract.** No favorability color (A/B categorical identity only), no winner (true-length
   bars, gap = ink weight), "lower is better" a text marker, N/A never 0, composite labeled derived.
7. **Deltas from the brief.** None — pure layout refactor; every honesty property preserved.
8. **Residual risk.** The *felt* result — the new header/composite-card reading cleanly, the dropdown
   recompute, mobile stacking — needs a human; see the manual step.

## Manual UI verification (required — pending operator)

Run against a seeded instance of this branch (I can publish it on `:8001`):
1. Open `/sector-analytics?view=compare&a=73&b=60`. → header reads **"[▪] Business Services  vs  [▪]
   Depository Institutions … 59 vs 44 filers"**; below it, the two **dropdowns**.
2. The composite section is **one card** ("Composite scores · shared 0–100 scale") with rows of
   **theme name · A/B bars · gap** on one line each; A terracotta, B blue; **no winner**.
3. Change the **B dropdown** to another sector → the header + composite + cards **recompute**.
4. Metric-median cards read cleanly on the tint background; "lower is better" on Debt to Equity; N/A
   where a sector lacks a median.
5. 390px → header wraps, rows stack, cards single-column, **no horizontal scroll**.

**Operator outcome (2026-07-22): ☑ accepted at the QA-tester level.** For this layout-only iteration
the operator accepted the QA-tester's **scripted driving pass** (which exercised the same steps —
header render, dropdown recompute, computed A/B colors, mobile reflow) **as** the manual UI
verification; no separate hands-on click-through was required. No discrepancy.

## Handoff

**Verdict: PASS — ready to deploy** (operator-gated). All 7 acceptance criteria met; `pytest` green;
e2e green + eyeballed; **manual UI verification accepted at the QA-tester level (operator,
2026-07-22)**; every honesty property preserved (no color, no winner, true-length, N/A never 0).
Frontend-only; Sector/Company/Qualitative + `/sectors` untouched. No defects.

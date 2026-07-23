# QA — Company view prototype-fidelity pass

Stage 4 (QA Tester). Branch: **`company-fidelity`** (off `master`; uncommitted).
Verdict: **PASS — ready to deploy** (operator-gated). Manual UI verification complete 2026-07-22 (one defect found + fixed in-cycle).

Tested against AC-1…AC-9 in `1-brief.md`, the design in `2-architecture.md`, and the engineer
handoff in `3-implementation.md`.

## How verified

- **pytest (Docker):** **511 passed, 6 skipped** — no regression (frontend-only).
- **e2e headless render check:** **PASS, errors=0** (after a fix — see below); `sectorapp-company-default`
  now renders the populated default focal.
- **Scripted driving pass:** **14/14 checks PASS** (default focal, dropdown re-focus, header pills,
  composite decompose + trend placeholder, ticker-when-known, no color, mobile).
- **Screenshots eyeballed:** `sectorapp-company-default.png` + `qa-cofid-mobile.png`.

### One defect found + fixed during QA

The first e2e run failed `sectorapp-company-default` — the default focal picked the **largest sector
(73)**, which has theme scores but **no materialized per-company metrics** in the fixture → empty →
no dots. Fixed by making `resolveDefaultFocal` **fall through to the next-largest sector that actually
has company-level values** (more robust in production too). Re-ran: PASS. This is a sensible refinement
of "first company in the largest sector" → "…largest sector **with company data**".

## Per-acceptance-criterion verdict

- **AC-1 — default focal.** **PASS.** `?view=company` (no symbol) opens on **Machinery Co 1** (first
  alphabetically in the first data-bearing sector) with the rail + **8** dot-plots; the honest empty
  state remains the no-resolve fallback (code path).
- **AC-2 — breadcrumb dropdown.** **PASS.** The name is a `<select>` of the group's **10** SIC peers;
  changing it re-focuses (Machinery Co 1 → Co 10, rail + dot-plots recompute).
- **AC-3 — header pills.** **PASS.** Context pill "10 peers · SIC 35" + basis "FY2025" from real data;
  the **ticker pill appears only on a ticker search** ("AAPL"), and is **absent** on a default/cik/
  dot-click focal — never fabricated.
- **AC-4 — Peer-distribution framing.** **PASS.** "Peer distribution" heading + "Click any peer dot
  to make it the focal filer" affordance present.
- **AC-5 — composite.** **PASS.** Keeps the **real derived** "P##" + "derived · … not a ranked
  position"; a **"trend — to be defined"** placeholder (no fabricated delta); clicking it decomposes
  into the per-theme percentiles ("= mean of Profitability P100 · Growth P…").
- **AC-6 — no color.** **PASS.** Dots `rgb(216,209,196)` (neutral), focal diamond `rgb(192,112,58)`
  (accent) — no green/red; no `--positive/--caution/--negative` in the Company view.
- **AC-7 — honesty.** **PASS.** No fabricated ticker/rank/trend/count; placeholders labeled; the
  composite stays a position not a verdict; N/A·N/M still excluded (dot-cloud counts 9 vs 10), never 0.
- **AC-8 — platform.** **PASS.** No CDN added; 390px overflow **= 0** (header pills + rail stack);
  `pytest` green.
- **AC-9 — no regression.** **PASS.** Sector view + old `/sectors` render; `?symbol=` preset, header
  search (ticker), and dot-click re-focus (which **clears** the ticker pill) all work.

## Review questionnaire

1. **What shipped.** The Company view now **opens populated** on a default filer (first-alpha in the
   largest data-bearing sector), matches the prototype's header (**name dropdown** of SIC peers,
   **ticker pill when known**, **context pill**, **filing basis**), adds a **"Peer distribution"**
   heading + dot-click **affordance**, and keeps the **real derived composite** with a **placeholder
   trend** + **click-to-decompose**.
2. **Surfaces touched.** **Frontend-only** — `sectorapp.js` + `sectorapp.css` (+ `headless_check.js`).
   Reuses `/sectors`, `/companies/{symbol}/peers`, `/sectors/{group}/{metric}/companies`. No backend.
3. **AC → evidence.** All 9 ACs above, each a driving assertion (14/14) or the eyeballed
   `sectorapp-company-default.png` / `qa-cofid-mobile.png`.
4. **States exercised.** Populated default; ticker search; dropdown re-focus; dot-click re-focus;
   composite decompose open/close; the honest empty/no-peer-group states remain as fallbacks.
5. **Edge cases probed.** Default lands on a **data-bearing** sector (skips scored-but-empty 73/60);
   ticker pill present/absent by focal source; N/A·N/M excluded (9 vs 10), never 0; the trend has **no**
   digit (placeholder).
6. **Honesty contract.** No fabricated ticker (omitted when unknown), no fabricated rank (real derived
   percentile, "not a ranked position"), no fabricated trend (placeholder); Company view color-free.
7. **Deltas from the brief.** "First in the largest sector" refined to "…largest sector **with company
   data**" (the fix above) — otherwise a scored-but-unmaterialized sector defaults to empty.
8. **Residual risk.** The *felt* interactions — the breadcrumb dropdown, the composite decompose click,
   the ticker pill appearing/clearing, the default populating on load — need a human; see the manual step.

## UI/UX review

- **States.** The default-populated open is a real improvement over the empty state; the empty/error
  states remain honest fallbacks. Placeholders (trend) read as clearly empty.
- **Layout & copy.** Header reads `sector › [Name ▾] · N peers · SIC · FY` cleanly; the composite is
  explicitly derived-not-a-rank; the dropdown/decompose are discoverable (dashed underline). Reflows to
  one column on mobile with no clipping.
- **Honesty.** Direction stays neutral + text markers; no ticker/rank/trend invented; the composite is
  a labeled derived position, not a verdict.

## Manual UI verification (required — pending operator)

Run against a seeded instance of this branch (I can publish it on `:8001`):
1. Open `/sector-analytics?view=company` (no symbol). → opens **populated** on a default filer (rail +
   dot-plots), not an empty state.
2. Header: **name is a dropdown** (▾) → pick another peer → the view re-focuses. A **context pill**
   ("N peers · SIC …") + **FY** basis show; **no ticker pill** on the default.
3. Search a **ticker** (e.g. AAPL) in the header → a **ticker pill** appears; click a peer dot → the
   pill **disappears** (a cik focal has no known ticker).
4. Composite card → **"derived · not a ranked position"** + a **"trend — to be defined"** placeholder;
   click the P## → it **decomposes** into the per-theme percentiles.
5. "Peer distribution" heading + "Click any peer dot…" line present; dots neutral, focal an accent
   diamond (no green/red).
6. 390px → header pills + rail stack, **no horizontal scroll**.

**Operator outcome (2026-07-22, `:8001`):** steps **1, 2, 4 confirmed**. **Step 3 found a defect** →
fixed in-cycle (QA→frontend, cycle 1):

- **Defect:** searching a ticker whose company has **no peer group with data** (e.g. JPM/WMT in the
  fixture — only SIC-35 is materialized) dropped the user into the honest "no SIC peer group" state
  with **no obvious way back** (recovery only via searching a *valid* ticker), and the header showed
  "CIK 19617" instead of "JPM". The default-focal change made this dead-end more jarring.
- **Fix:** `focalLabel()` now prefers name → ticker → CIK (shows "JPM"); the **no-peer-group and
  error states get a "← Back to a default filer" button** (`clearFocalToDefault` → re-resolves the
  default) so the user is never stuck. Copy adds "Search another company, or go back to a default
  filer." Re-verified: search JPM → shows "JPM" + the Back button → click → recovers to a populated
  default (Machinery Co 1).
- **Re-check ☑ (operator, 2026-07-22):** step 3 recovery **confirmed** — the "no peer group" state
  shows the Back button and clicking it returns to a populated default; a valid ticker (AAPL) still
  resolves to a working Company view. **All 4 manual steps now confirmed, no open issues.**

## Handoff

**Verdict: PASS — ready to deploy.** Manual UI verification complete (operator, 2026-07-22 — 4/4 steps; step 3 found a dead-end recovery gap, fixed in-cycle and re-confirmed). All 9 acceptance criteria met on automated
evidence; `pytest` green; e2e green + eyeballed; the honesty rail holds (no fabricated ticker/rank/
trend; composite a labeled derived position; color-free). Frontend-only; Sector/Compare/Qualitative +
`/sectors` untouched. Once the operator runs the manual script, the verdict advances to "ready to
deploy". No automated defects require a loop back (the one found was fixed in-cycle).

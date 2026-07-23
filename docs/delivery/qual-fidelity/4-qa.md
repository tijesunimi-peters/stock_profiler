# QA — Qualitative view prototype-fidelity pass (placeholder layout)

Stage 4 (QA Tester). Branch: **`qual-fidelity`** (off `master`; uncommitted).
Verdict: **PASS** (a **static, layout-only** change — the honesty landmine is thoroughly asserted by
the scripted driving; accept at the QA-tester level, with an operator eyeball recommended given the
sensitivity).

Tested against AC-1…AC-7 in `1-brief.md` + the architecture in `2-architecture.md`.

## Change classification (manual-gate policy)

**Static / layout-only — no interaction or logic** (no fetch, no state, no handlers; the view is inert
placeholders). Per the manual-gate policy this may be **accepted at the QA-tester level**. The one
sensitivity is the **honesty landmine** ("nothing reads as data"), which the scripted driving asserts
directly (no data digit / `●` / `%` / direction / filled bar / synthetic filer). An operator eyeball
of `sectorapp-qual.png` is recommended but not blocking.

## How verified

- **pytest (Docker):** **511 passed, 6 skipped** — no regression (frontend-only).
- **e2e headless render check:** **PASS, errors=0**; `sectorapp-qual` renders the new layout.
- **Scripted driving pass:** **9/9 checks PASS** (layout, empty bars, honesty landmine, mobile).
- **Screenshots eyeballed:** `sectorapp-qual.png` + `qa-qualfid-mobile.png`.

## Per-acceptance-criterion verdict

- **AC-1 — layout.** **PASS.** Under the prominent "Track 2 · not yet derived from filings" banner:
  the "Risk-factor themes" card (**7** real theme-name rows), the **3** right-column cards (Emerging /
  Going-concern / Material litigation), and the **5-column** Per-filer-signals matrix headers all render.
- **AC-2 — every cell a placeholder.** **PASS.** Coverage bars are **empty** (no fill child); values
  are "—"; **7** "planned" chips; **4** "to be defined / no filers shown" placeholder bodies. No
  fabricated filers/rows.
- **AC-3 — honesty landmine.** **PASS.** After stripping "Track 2"/"13F", the layout body has **no
  data digit**; **no** `●`/glyph, **no** `%`, **no** direction state (rising/fading/stable), **no**
  filled bar, **no** synthetic filer. Only the 7 real theme labels + column headers + placeholders.
- **AC-4 — honesty copy.** **PASS.** The "why" (structured-only / free-text) + "**Nothing here is
  fabricated**" + the foot "Nothing on this view is derived from filings or estimated" are all present;
  the banner is first.
- **AC-5 — no color.** **PASS.** No `--positive/--caution/--negative`; the "planned" chip computes to
  `rgb(139,133,121)` (muted mono) — not green/red; the placeholder styling reads empty.
- **AC-6 — platform.** **PASS.** 390px overflow **= 0** (cols → 1, matrix header wraps); `pytest` green.
- **AC-7 — no regression.** **PASS.** Compare + Sector views and old `/sectors` render; the Qualitative
  rail routes here.

## Review questionnaire

1. **What shipped.** The Qualitative view is rebuilt from a one-line stub to the **prototype's full
   layout** — Risk-factor themes (7 rows), Emerging/Going-concern/Litigation cards, a Per-filer-signals
   matrix — with **every data cell an unmistakable placeholder** (empty bars, "—", "planned", "to be
   defined / no filers shown"), under the prominent Track-2 banner.
2. **Surfaces touched.** **Frontend-only** — `sectorapp.js` (`renderQualView` rebuild, `QUAL_THEMES`/
   `QUAL_SIDE`/`QUAL_MATRIX_COLS`) + `sectorapp.css` (`.pa-qual-cols/rt/rtrow/rtbar/side/phbody/matrix`).
   No backend, no data.
3. **AC → evidence.** All 7 ACs (9/9 driving) + the eyeballed shots.
4. **States exercised.** The single intended state — the placeholder layout — renders on the rail click.
5. **Edge cases probed.** The honesty landmine itself: exhaustively scanned for any data (digit/●/%/
   direction/fill/filer) — none.
6. **Honesty contract.** The defining property: **nothing is data.** Track-2 status prominent; no
   fabricated figure/filer/flag/direction/coverage; no favorability color; the 7 theme names are labels.
7. **Deltas from the brief.** None — layout replicated, cells all placeholder. (Judgment call per R2:
   the lists/matrix render a placeholder *body*, not N empty rows — cleaner + can't imply imminent data.)
8. **Residual risk.** Minimal — a static placeholder view. The only thing worth a human's eye is the
   honesty call (it can't be mistaken for a real disclosure surface) — asserted by the driving; operator
   eyeball recommended.

## Handoff

**Verdict: PASS — ready to deploy** (operator-gated). All 7 ACs met; `pytest` green; e2e green +
eyeballed; the honesty landmine is closed (nothing reads as data). Static/layout-only → accepted at the
QA-tester level per policy; an operator eyeball of `sectorapp-qual.png` is recommended given the
sensitivity but not blocking. Frontend-only; Sector/Company/Compare + `/sectors` untouched. **This
completes the prototype-fidelity series across all four views.**

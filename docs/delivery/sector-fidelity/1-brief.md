# Brief — Sector view prototype-fidelity pass

Stage 1 (Product Manager) handoff. Task slug: `sector-fidelity`.
Governing directive: `docs/delivery/sector-app-followups.md` §"Governing directive" (operator,
2026-07-22). Reference: `docs/design/sector-app-prototype/prototype.dc.html` **altitude-1 block
(lines ~134–240)**. **Frontend-only.** First of the prototype-fidelity iterations; **Sector view
only** (Company/Compare/Qualitative come later).

## Problem / user

The operator wants the `/sector-analytics` app to match the prototype's layout **exactly**. Phase 1
faithfully rebuilt the shell + scorecard but **deliberately omitted** the prototype's synthetic
elements (filing feed, sub-industry pills, coverage %) and shipped **color-free**. The operator has
decided (a) those omissions should become **honest, clearly-labeled empty placeholders** they fill
later — matching the prototype's columns rather than collapsing them — and (b) favorability **color**
returns (reversing the earlier locked no-color decision). The **user** is the operator reviewing the
app against the prototype: success = the Sector view is column-for-column the prototype, every
would-be-synthetic element is an unmistakable placeholder (never fake data), and direction reads with
color **and** the arrow glyphs.

## Scope gate (Track 1 / honesty)

**PASS.** No data is ingested or fabricated. Placeholders are **honest empty states**; the color is a
**display** treatment of the already-derived score deltas. Frontend-only, no backend/schema. The
**non-negotiable rail**: a placeholder must be **unmistakably empty** ("… — to be defined"), never
dressed as or mistakable for real data — no fabricated coverage %, sub-industry names, feed items,
counts, or values.

## Scope (Sector view only)

1. **Control bar — placeholders.** Add, matching the prototype's control-bar layout:
   - **Sub-industry pills** as a **placeholder** (labeled/disabled "sub-industry — to be defined"),
     **no fabricated SIC-4 names**.
   - A **coverage-%** **placeholder** in the meta row ("coverage — to be defined"), **never** a
     made-up "94% filed".
2. **Decomposition row — exact widths.** `grid-template-columns: 200px 60px 1fr 52px` (prototype)
   replacing ours (`minmax(140,220) 48px 1fr 64px`).
3. **Biggest-shifts row — match the prototype's flex layout:** glyph `14px` · name `flex:1` · **flag
   chip** · delta `80px` · basis `150px` (add the flag-chip column ours lacks).
4. **Drill-down + feed row — `grid-template-columns: 3fr 2fr`.** Left 3fr = the existing drill-down;
   right **2fr = a placeholder card** where the prototype's "What's moving" filing-event feed was:
   "What's moving — placeholder · Track-2 filing feed, to be defined". **No fabricated feed items.**
5. **Tile click shows both (F5).** Clicking a scorecard **tile** now surfaces **both** the
   decomposition (what drove the score) **and** the peer strip + drill-down together (today:
   score-number → decomposition, tile-body → peer strip/drill-down).
6. **Favorability color (F4, Sector portion).** Apply the documented `--positive/--caution/--negative`
   trio (already in `style.css`) to the score **deltas** + the **biggest-shifts** rows to signal
   up/down direction — **always paired with the arrow glyph (↑/↓/→) + position (never color alone)**;
   the **score/value stays neutral `--ink`** (a position, not a verdict); muted earthy trio, **not** a
   green/red stoplight.
7. **Provisional banner color.** The page doesn't load `app.css`, so `var(--ext)` is undefined and the
   banner renders colorless; define the `--ext*` tokens locally (or equivalent) so it shows the
   prototype's rust tint.

## Out of scope (this iteration)

- **Company / Compare / Qualitative** views (later fidelity iterations).
- Any **backend / endpoint / schema** change; any **real** sub-industry / coverage / feed data (those
  are placeholders now; real data is a separate, later decision).
- **Fabricating** any value — the whole point is honest placeholders.

## Acceptance criteria (what QA will verify)

- AC-1 **Sub-industry** appears in the control bar as an **unmistakable placeholder** ("… to be
  defined"/disabled) — **no fabricated SIC-4 names**; the layout matches the prototype's pill row.
- AC-2 A **coverage-%** **placeholder** shows in the meta row ("coverage — to be defined") — **never**
  a made-up percentage.
- AC-3 **Decomposition** row columns are exactly `200px 60px 1fr 52px`.
- AC-4 **Biggest-shifts** row matches the prototype: glyph 14px · name flex:1 · **flag chip** · delta
  80px · basis 150px.
- AC-5 The **drill-down + feed** row is a **`3fr 2fr`** grid; the right 2fr is a **clearly-labeled
  placeholder** card (Track-2 feed, to be defined) with **no fabricated feed items**.
- AC-6 **Clicking a scorecard tile** surfaces **both** the decomposition **and** the peer strip +
  drill-down together.
- AC-7 **Favorability color** appears on the score **deltas** + **biggest-shifts** direction, **always
  with the arrow glyph** (color never alone); the **score number stays neutral `--ink`**; it's the
  muted earthy trio, not a saturated green/red stoplight. `N/A`/null delta stays "→ no prior FY"
  (**never 0**, never colored as a value).
- AC-8 The **provisional banner** renders with the prototype's rust tint (the `--ext` tokens resolve).
- AC-9 **Honesty:** no fabricated coverage/sub-industry/feed values or counts anywhere; every
  placeholder is unmistakably a placeholder; the scores still read as a **position, not a verdict**;
  N/A never 0.
- AC-10 **Platform:** CSP-safe (no CDN/React/Tailwind added); **mobile 390px** reflow with no
  horizontal overflow (the new placeholder columns stack); `pytest` green (no backend change);
  Docker e2e headless check passes with the fidelity items eyeballed.
- AC-11 **No regression:** the Company/Compare/Qualitative views and `/sectors` still render.

## Risks / open decisions (for the architect)

- **R1 — placeholder styling.** Define a single, reusable "placeholder" visual (dashed/muted, "… — to
  be defined") so all four placeholders (sub-industry, coverage, feed column, and any others) read
  consistently as *empty*, never as data. Confirm it can't be mistaken for a real value at a glance.
- **R2 — favorability color mechanics.** The trio lives in `style.css` (`--positive/--caution/
  --negative` + washes). Decide exactly where color attaches (the delta chip background/text + the
  shift-row delta) so it **accompanies** the arrow and the **score number stays neutral**. Map the
  score delta / shift z-sign to positive/negative, and the null/flat case to no-color (not caution as
  "bad").
- **R3 — tile-click interaction (F5).** Today the tile body sets `expandedTheme` (peer strip +
  drill-down) and the score number opens the decomposition. Decide how a single tile click shows
  **both** (e.g. tile click sets both `expandedTheme` and `decompTheme` for that theme) without
  double-firing when the score number is clicked.
- **R4 — `--ext` tokens.** Define them locally in `sectorapp.css` (self-contained, like Compare's
  `--pa-b`) rather than loading `app.css`.
- **R5 — fixture/e2e.** The existing fixture already renders the Sector view (groups 73/60/…); the
  placeholders need no data. Confirm the e2e shots capture the new elements (add/adjust
  `headless_check.js` interactions if needed).

## Handoff → Principal Architect

Frontend-only. Resolve R1–R5, name the exact `sectorapp.js`/`sectorapp.css` changes, map every AC to
a concrete check, and confirm no backend touch. Owner: `senior-frontend-engineer`, on a branch off
`master`.

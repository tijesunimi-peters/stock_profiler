# QA — Sector Analytics app: Qualitative view (Phase 4, final)

Stage 4 (QA Tester). Branch: **`sector-app-qualitative`** (stacked on Phase 3 `sector-app-compare`
`fc7f7f1`; uncommitted). Verdict: **PASS — ready to deploy** (operator-gated). **Completes the
four-view app.**

Tested against AC-1…AC-8 in `1-brief.md`, the design in `2-architecture.md`, and the engineer
handoff in `3-implementation.md`. The central concern is the **honesty landmine** — a Track-2
placeholder must present **nothing** as real or derived. Evidence is from the running feature.

## How verified

- **pytest (fresh, Docker):** **511 passed, 6 skipped** — no regression (frontend-only; `git diff`
  confirms **zero `.py` changes**).
- **e2e headless render check** (`docker compose build api` → `--profile e2e`): **PASS, errors=0**;
  the `sectorapp-qual` shot renders the frame.
- **Behavioral driving pass** — a puppeteer script over the live `e2e-app`: **11/11 checks PASS**
  (banner, no-date copy, planned cards, **no fabricated figure/count/●/%**, no data-plot elements,
  persistence, mobile).
- **Screenshots eyeballed:** `sectorapp-qual` (desktop) + `qa-qual-mobile` (390px).

## Per-acceptance-criterion verdict

- **AC-1 — view frame + prominent "Track 2 · not yet derived from filings" banner.** **PASS.** The
  rail renders a section head ("Qualitative disclosures") + the banner flag "TRACK 2 · NOT YET
  DERIVED FROM FILINGS" — a frame, not the old one-line stub.
- **AC-2 — states why (structured-only / free-text later); no promised date.** **PASS.** Copy:
  "ClearyFi ingests **structured** SEC data only … Qualitative disclosures … are **free-text
  narrative**; extracting them is a deliberate later decision …". No year/`soon`/`coming Q` in the
  copy (driving assertion `!/\b20\d\d\b/`).
- **AC-3 — planned categories as labels + one-liners with a "planned" marker; no fabricated data.**
  **PASS.** 5 cards, 5 "planned" markers (risk-theme landscape, emerging risks, going-concern watch,
  litigation & regulatory, per-filer signal matrix). After stripping the only legit digit-bearing
  **names** ("Track 2", "13F"), the frame body contains **no digit** — no count, no figure. No
  `●`/direction glyph, no `%`, and **zero** data-plot elements (`.pa-cmp-bar`/`.pa-dot`/`.pa-diamond`/
  `.pa-dp`/`.pa-tile-score`/`.pa-rail-fill`) in the view.
- **AC-4 — nothing presented as real/derived.** **PASS.** No synthetic company/issuer, no coverage
  %, no metric; the closing line "Nothing on this view is derived from filings or estimated." is
  present. **Honesty landmine closed.**
- **AC-5 — no favorability color; tokens only.** **PASS.** No `--positive/--caution/--negative`
  referenced; the banner flag computes to `rgb(138,90,47)` (accent-ink) — neutral/accent, not
  green/red; the block avoids the undefined `--ext` (uses resolving tokens).
- **AC-6 — selection persists across view switches.** **PASS.** Set a Company focal (`?symbol=900001`
  → Machinery Co 1) → Qualitative → back to Company keeps the focal (Machinery Co 1).
- **AC-7 — CSP-safe + mobile 390px reflow.** **PASS.** No CDN/React/Tailwind added (no HTML change);
  390px reflows the planned-card grid to one column with measured horizontal overflow **= 0**.
- **AC-8 — build → e2e passes (eyeballed) + pytest green.** **PASS.** `docker compose build api` →
  e2e PASS errors=0; `sectorapp-qual` eyeballed; pytest 511/6.

## UI/UX review

- **States.** There is only one honest state and it renders intentionally: a "coming" placeholder,
  never a half-built data view. The dashed, muted card treatment reads unmistakably as "not yet",
  distinct from the app's real (solid) cards.
- **Legibility & layout.** The banner + "why" paragraph are readable at a comfortable measure; the
  five planned cards form a tidy grid that collapses cleanly to one column on mobile with no
  clipping or horizontal bleed.
- **Copy.** Honest and specific, from the user's side of the screen: it names what the product does
  (structured data), why the qualitative side isn't here (free text, a deliberate later decision),
  and commits to provenance when it ships ("every signal will trace to a filing") — without promising
  a date or over-claiming.
- **Consistency & a11y.** Reuses the app's section-head + mono-label vocabulary and the view rail;
  the rail entry stays reachable and shows its active state.
- **Honesty contract.** The defining property: **nothing is data.** No number, flag, chart, or
  synthetic entity — the placeholder cannot be mistaken for a real disclosure surface. This is the
  correct realization of CLAUDE.md guardrail 1 / REDESIGN honesty flag 1.

### Minor / cosmetic (non-blocking)

- Pre-existing (unchanged): elsewhere in `sectorapp.css`, the Phase-1 `.pa-provisional`/
  `.pa-chip.approx` reference the undefined `--ext` and degrade to no color. The new Qualitative
  block deliberately avoids `--ext` and is unaffected.

## Handoff

**Verdict: PASS.** All 8 acceptance criteria met; full suite green; e2e green + eyeballed; the
honesty contract holds — the Qualitative view presents **nothing** as real or derived, promises no
date, and carries no favorability color. Frontend-only — no backend/endpoint/schema change, no new
remote dependency; the Sector/Company/Compare views and `/sectors` are untouched. **The four-view
Sector Analytics app is complete.**

**Ready to deploy** — deployment stays operator-gated. Operator's next options: commit the
`sector-app-qualitative` branch; the app (Phases 1–4) is then ready to merge to `master` and request
a deploy. No defects require a loop back to engineering.

# Implementation — Sector Analytics app: Qualitative view (Phase 4, final)

**Frontend-only** (per `2-architecture.md` R1). Branch: **`sector-app-qualitative`**, stacked on
Phase 3 (`sector-app-compare` `fc7f7f1`). Uncommitted. **Completes the four-view app.**

## Frontend (Senior Frontend Engineer) — DONE

Replaced the inert Qualitative `renderStub` branch with **`renderQualView`** — an honest "Coming —
Track 2" placeholder. **Static**: no fetch, no state, no data, no fabricated figures. Realizes the
locked honesty decision (REDESIGN honesty flag 1 / CLAUDE.md guardrail 1).

- **`static/sectorapp.js`** — `renderViewport`'s Qualitative branch now calls `renderQualView(vp)`
  (the old `renderStub` helper, used only here, is removed). `renderQualView` renders:
  - a section head ("01 · Qualitative disclosures") + subhead;
  - a **prominent "Track 2 · not yet derived from filings" banner** with the "why" copy (structured
    SEC data only / Track 1; qualitative = **free-text narrative**, a deliberate later decision;
    **"Nothing here is fabricated"**) — anchored in CLAUDE.md guardrail 1 + `docs/ROADMAP.md`, **no
    promised date**;
  - a **grid of 5 "planned" category cards** (`QUAL_PLANNED`: risk-theme landscape, emerging risks,
    going-concern watch, litigation & regulatory, per-filer signal matrix) — **name + one-liner + a
    "planned" marker only**. **No figures, counts, ● flags, direction chips, matrices, or bars.**
  - a closing line: "Nothing on this view is derived from filings or estimated."
- **`static/sectorapp.css`** — `.pa-qual-*` styles, **tokens that resolve** (the page doesn't load
  `app.css`, so the block avoids `--ext`; uses `--accent-ink`/`--ink`/`--ink-body`/`--ink-soft`/
  `--mono-muted`/`--border-strong`/`--bg-tint`/`--bg-badge`). Dashed muted "not yet" aesthetic, mobile
  reflow (grid → 1 column at 900px). **No `--positive/--caution/--negative`.**
- **`scripts/headless_check.js`** — the `sectorapp-stub` shot renamed to **`sectorapp-qual`** (it now
  captures the real frame); the interaction clicks the Qualitative rail and waits for `.pa-qual-banner`.
- **`docs/REDESIGN_SECTOR_APP.md`** — Phase 4 flipped to BUILT; **the four-view app is now complete**.

### Verified (frontend)

- **`pytest` 511 passed, 6 skipped** — no regression (frontend-only; no Python change).
- **e2e headless check PASS, errors=0**; `sectorapp-qual` renders the frame.
- **Eyeballed** (`sectorapp-qual`): banner "TRACK 2 · NOT YET DERIVED FROM FILINGS"; the honest
  "why" paragraph; "WHAT TRACK 2 WOULD COVER" + 5 **PLANNED** cards (labels + one-liners, **no
  data**); closing "Nothing on this view is derived from filings or estimated." No favorability
  color; the accent-ink chip confirms tokens resolve.

### For QA to probe

- The frame is a **view frame** (not the one-line stub) with the **prominent Track-2 banner**; the
  copy **promises no date**; the planned categories are **labels only** — **no digit reads as a
  metric/count** (only "Track 2"/"13F" appear, as names, in the copy); **no ●/chip/matrix/bar**.
- **Nothing presented as real** (no synthetic company/coverage %); **no favorability color** (computed
  styles); **selection persists** (set a Company focal → Qualitative → back keeps it); **mobile 390px**
  no overflow (grid stacks); the other three views + `/sectors` still render.

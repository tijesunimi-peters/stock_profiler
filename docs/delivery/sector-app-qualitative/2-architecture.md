# Architecture — Sector Analytics app: Qualitative view (Phase 4, final)

Stage 2 (Principal Architect) handoff. Task slug: `sector-app-qualitative`.
Designs against `1-brief.md` (AC-1…AC-8). **Verdict: FRONTEND-ONLY** — no backend, endpoint, schema,
or `normalize/`/`storage/` change. Branch off `master`, **stacked on Phase 3** (`sector-app-compare`
`fc7f7f1`); replaces the inert Qualitative `renderStub` branch in `sectorapp.js`.

Owner: **`senior-frontend-engineer`** (only `api/static/` + `scripts/`). No backend stage.

## Scope re-check (the honesty landmine)

Track 1, no drift — **this task exists to hold the Track-2 line**. It renders a **static honest
placeholder**: no fetch, no data, no fabricated figures. If any step would display real
risk-factor/going-concern/litigation content or a synthetic stand-in for it, that is the out-of-scope
Track-2 line — **STOP and flag**. There is nothing to ingest and nothing to normalize here.

## R1 — frontend-only?  RESOLVED → yes

The current Qualitative branch (`renderViewport` → `renderStub(...)`) already fetches nothing; it is a
pure static render. The new frame is likewise static (hard-coded category labels/copy). **No
`routes.py`/`schema.py`/`storage/` touch. No `pytest` additions** — the suite is a pure regression
check (frontend-only).

## R2 — how far to build the "preview"  RESOLVED → labels + one-liners only

A simple **grid of "planned" category cards**: each = a category **name** + a **one-line description**
+ a muted **"planned"** marker. **Explicitly not** the prototype's matrix / ●-presence-flags /
direction chips / coverage bars — none of those render. Err toward *plainer*: the safe failure mode is
"too plain", never "too data-like". The five categories (from prototype §5, **labels only**):

1. **Risk-theme landscape** — how a sector's risk-factor themes shift year over year.
2. **Emerging risks** — themes appearing or intensifying this filing cycle.
3. **Going-concern watch** — filers using substantial-doubt language.
4. **Litigation & regulatory** — material legal/regulatory disclosures.
5. **Per-filer signal matrix** — a per-company roll-up of the above.

## R3 — copy source  RESOLVED

Anchor the "why" in **CLAUDE.md guardrail 1** + **`docs/ROADMAP.md`** (Track 2 = "MD&A / risk factors
/ footnotes (free-text narrative)" and "LLM summarization … recurring per-token cost", both
**deliberately deferred**). Plain language, **no promised date**, no invented milestone. Suggested:

> **Track 2 · not yet derived from filings.** ClearyFi ingests **structured** SEC data only — the
> numbers in financial statements, ownership forms, and 13F tables. Qualitative disclosures (risk
> factors, going-concern language, litigation) are **free-text narrative**; extracting them is a
> deliberate later decision, not a gap we paper over with estimates. **Nothing here is fabricated** —
> when it ships, every signal will trace to a filing, like the rest of the app.

## Design note — use tokens that resolve

The page loads **only** `style.css` + `sectorapp.css` (not `app.css`), so **`--ext*` is undefined**
(the Phase-1 `.pa-provisional`/`.pa-chip.approx` banners degrade to no color — a known, pre-existing
cosmetic gap). The new Qualitative frame **must not depend on `--ext`**: style the "Track 2" banner
with tokens that resolve — `--ink`/`--ink-soft`/`--mono-muted`/`--border-strong`/`--bg-tint`/`--bg-badge`
and, if a single accent is wanted for the marker, `--accent` (identity/emphasis, not favorability).
Reuse the deferred-tile "not scored" muted aesthetic (`.pa-tile-def`/`.pa-tile-notscored`) for visual
consistency. **No `--positive/--caution/--negative`.**

## Frontend design (senior-frontend-engineer) — `api/static/`

Invoke **`/frontend-design:frontend-design`** first for the placeholder frame within the
paper-terminal system.

### `static/sectorapp.js`
- **Replace** the Qualitative branch in `renderViewport` (currently
  `return renderStub(vp, "Qualitative disclosures", "…")`) with **`renderQualView(vp)`**:
  - a section head (matching `secHead()`/the app's numbered-section style, e.g. num + "Qualitative
    disclosures");
  - a **prominent "Track 2 · not yet derived from filings" banner** (the R3 copy);
  - a **grid of "planned" category cards** (R2 list) — name + one-liner + a muted **"planned"**
    marker, **no figures**;
  - a closing honest line ("Nothing on this view is derived from filings or estimated.").
  - **No fetch, no new state.** (`renderStub` may stay for any other use, or be removed if now unused.)
- The **Qualitative rail entry stays** (`railHtml` already lists it); selection state already persists
  via the single store — no change needed for AC-6.

### `static/sectorapp.css`
`.pa-qual-*` styles, **tokens only** (per the design note — no `--ext`, no favorability trio): the
banner, the "why" copy, the planned-category grid/cards + "planned" marker, and **mobile reflow**
(grid → 1 column at ≤900/560px, no `overflow-x`).

### `scripts/headless_check.js`
The existing **`sectorapp-stub`** shot already navigates to `/sector-analytics` and clicks
`.pa-rail-btn[data-view="qual"]` — **keep it** (it now captures the real frame). Optionally rename to
`sectorapp-qual` for clarity; if renamed, update the interaction guard that keys on the name. Keeping
the name avoids churn — engineer's choice.

### `docs/REDESIGN_SECTOR_APP.md`
Flip Phase 4 status to **BUILT** and note the app is now **complete** (all four views shipped).

## Acceptance criteria → concrete checks

| AC | Check |
|----|-------|
| AC-1 | Clicking the Qualitative rail renders a **view frame** (section head + banner + cards), not the one-line stub; a prominent "Track 2 · not yet derived from filings" banner is present. |
| AC-2 | The frame states structured-only/Track-1 + free-text-later; **no date** promised (grep the copy for no "20NN"/"soon"/"Q_ 20"). |
| AC-3 | The five planned categories render as **labels + one-liners** with a "planned" marker; **grep the view text for digits** → none that read as a metric/count; no `●`/chip/matrix/bar elements. |
| AC-4 | Nothing presented as real/derived — no synthetic company/issuer, no coverage %, no number. |
| AC-5 | Computed styles: no green/red; grep `sectorapp.js/css` → no `--positive/--caution/--negative`; banner uses resolving tokens. |
| AC-6 | Set a focal (Company view) → switch to Qualitative → back to Company: focal retained (driven). |
| AC-7 | 390px: no horizontal overflow (driven); no CDN/React/Tailwind added. |
| AC-8 | `docker compose build api` → e2e PASS errors=0, `sectorapp-stub`/`-qual` shot eyeballed; `pytest` green (regression). |

## Handoff → Senior Frontend Engineer

Frontend-only, branch off `master` stacked on `sector-app-compare` `fc7f7f1`. Replace the Qualitative
`renderStub` branch with `renderQualView` (honest banner + planned-category cards, **no fabricated
data**, tokens that resolve, no favorability), add `sectorapp.css` styles, keep/adjust the
`sectorapp-stub` e2e shot, flip the REDESIGN doc (app complete). Verify: `pytest` green (regression),
`docker compose build api` → e2e, **eyeball** the Qualitative frame + mobile, and confirm the other
three views + `/sectors` still render. This closes out the four-view app.

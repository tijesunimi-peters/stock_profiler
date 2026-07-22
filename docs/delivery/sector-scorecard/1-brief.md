# Brief — Composite scorecard hero (Phase 2 of the sector-overview redesign)

Stage 1 (Product Manager) handoff. Task slug: `sector-scorecard`.
Parent plan: `docs/REDESIGN_SECTOR_OVERVIEW.md` (Phase 2).
Design authority: `docs/layout_guides/01-sector-overview.md` §3, `00-global-conventions.md` §5/§9a.
Consumes: `GET /v1/sectors/theme-scores` (Phase 0; `SectorThemeScoreList` in `normalize/schema.py`).

## Problem / user

The single-sector `/sectors` page (Phase 1) shows a sector's raw analytics (DuPont, trend, spreads,
lifecycle) but no **judgment** — the reader has to interpret the numbers themselves. The redesign's
hero (guide `01 §3`) is a **seven-theme composite health scorecard** that answers "how is this
sector doing?" in about five seconds with 0–100 scores, cross-sector rank, and direction. Phase 0
built the data + endpoint; Phase 2 renders it. The **user** is the sector analyst; success = they
land on the sector and, above the raw analytics, see the five backable theme scores with their
cross-sector rank/percentile and period-over-period direction, can open any score to see exactly
which metrics drove it, and are never misled about what the score is (a position, not a verdict).

**Mostly frontend** — the endpoint exists. One backend-adjacent addition: seed the e2e fixture so
the render check exercises a populated scorecard and the empty state.

## Scope gate (Track 1)

**PASS.** UI over an already-shipped Track-1 endpoint + fixture seeding (`scripts/`). No free text,
no LLM, no new data, no market/price data.

## Scope

1. **Scorecard grid** (`static/sectors.*`), the page **hero** directly under the sector bar and
   **above** the DuPont body (which moves below):
   - **Five scored tiles** — theme name; **0–100 score** (large); a **trend-delta chip**
     (`delta_vs_prior_fy`, favorability-colored + up/down/flat glyph); a **percentile line**
     ("82nd pctile · vs all sectors" from `percentile`); a **rank badge** ("3rd of 11" from
     `rank`/`rank_of`).
   - **Two "not yet scored" tiles** — the deferred themes (`scored:false`), muted, no number, the
     `reason` as caption.
   - A theme the sector didn't qualify for is simply **absent** (Phase 0 omits it), not a
     "not yet scored" tile — only the two deferred themes are ever that.
2. **Score → inline decomposition** (`00 §9a`, `.disclosure`/`details` pattern, not a modal):
   constituents each with `label`, `median`, and favorability-oriented `oriented_z` contribution;
   the **equal-weight** note; the payload's **`normalization`** string. Toggles open/closed.
3. **Favorability color trio** — a **new** `positive`/`caution`/`negative` token set (the project
   has none), hues harmonized with the warm ClearyFi palette (muted sage / amber / brick, **not**
   primary green/red), documented in `STYLE_GUIDE`. Used only for favorability.
4. **Data/state** — fetch `/sectors/theme-scores` **once**; render the **selected sector's**
   `themes[]`; re-render the scorecard from the same payload on sector switch (no refetch). Honest
   loading/empty/error, per-panel.
5. **Fixture** — seed a few `sector_theme_scores` + `sector_theme_components` rows in
   `scripts/seed_fixture.py` mirroring Phase 0 shapes: a sector with all five themes scored + the
   two deferred; signed **and** null `delta_vs_prior_fy` (for color/glyph coverage); a plausible
   decomposition; **and** an empty case (a sector the payload has no scores for) so the honest-empty
   path renders.

## Out of scope (this phase — flag, don't build)

- **Tile-body → theme drill-down expansion** and the **peer strip** — Phase 3. In Phase 2 only the
  **score** is interactive (opens decomposition); a tile-body click is inert.
- **Biggest-shifts band, "what's moving" feed** — Phase 3 / Track 2.
- **Sub-industry / period picker / filing-coverage** — deferred (as in Phase 1).
- Any change to the `/sectors/theme-scores` endpoint or the Phase 0 batch/scoring.

## Acceptance criteria (what QA will verify — by driving the page)

**Rendering**
- AC-1 The scorecard renders as the **hero** (under the sector bar, **above** the DuPont tree) for
  the selected sector, with the five scored tiles + the two deferred tiles from that sector's
  `themes[]`.
- AC-2 Each scored tile shows theme name, the **0–100 score**, a trend-delta chip, a percentile line
  labeled **"vs all sectors"**, and a rank badge "`rank` of `rank_of`".
- AC-3 The trend-delta chip is **favorability-colored** (positive/caution/negative) with an
  up/down/flat glyph derived from `delta_vs_prior_fy`. A **null** delta (no prior FY) renders an
  explicit no-prior affordance ("no prior FY" / "—"), **never a 0 and never a colored chip**.
- AC-4 The two deferred themes render as **muted "not yet scored"** tiles with the `reason` caption —
  no number, no favorability color, **never a fabricated score/0**.
- AC-5 Clicking a tile's **score** opens an **inline** decomposition showing each constituent
  (`label`, `median`, oriented contribution), the equal-weight note, and the `normalization` string;
  clicking again closes it. (Not a modal.)
- AC-6 DuPont tree + ROE trend + per-sector spreads + lifecycle still render, now **below** the
  scorecard — **no regression** vs Phase 1.

**Data / state**
- AC-7 Switching sector (combobox / recent pill / `?group=`) re-renders the scorecard for the
  newly-selected sector from the already-fetched payload, in sync with the sector bar + body.
- AC-8 A sector with **no** theme-scores entry (and the all-empty payload when the batch hasn't run,
  e.g. prod today) shows an **honest empty state** for the scorecard ("sector health scores aren't
  available yet") — never fabricated tiles, never zeros — while the rest of the page still renders.
- AC-9 A theme the sector didn't qualify for is **absent** from the scorecard; only the two deferred
  themes appear as "not yet scored".

**Honesty / positioning (the brand)**
- AC-10 The scorecard **surfaces the endpoint's `caveats` + `normalization`** and carries copy that
  frames the score as a **position vs other sectors, not a good/bad or buy/sell verdict** — despite
  the favorability coloring. No alpha/timing/price/"buy"/"beats the market" language.
- AC-11 Favorability color is used **only** for favorability, via the new documented token trio
  (harmonized, not primary green/red); no other element gains good/bad coloring.

**Platform**
- AC-12 Token-driven (app is light-only; no hard-coded theme-locked colors beyond the sanctioned
  favorability tokens), CSP-safe, layout holds at mobile width (tiles reflow, decomposition wraps),
  no clipped labels.
- AC-13 Fixture seeds `sector_theme_scores` + `sector_theme_components` so the e2e exercises a
  **populated** scorecard, the **deferred** tiles, an open **decomposition**, and the **empty**
  scorecard state.
- AC-14 Docker e2e headless render check passes (screenshots eyeballed) + `pytest` green.

## Risks / open decisions (for the architect / design stage)

- **R1 — score-affordance coloring strength (honesty-critical).** The locked decision colors the
  **score affordance** too, not just the delta chip. A full green/red score tile reads as "buy this
  sector," which the caveats disclaim. Architect/design: use a **restrained** treatment (e.g. a
  small favorability accent bar or a banded label, not a saturated full-tile fill) and set the
  score→band thresholds. Keep it legible without reading as investment merit. Confirm the treatment
  in the design pass.
- **R2 — delta "flat" threshold.** What |`delta_vs_prior_fy`| counts as flat/caution vs
  positive/negative (e.g. < 2 points = flat). Architect picks; label consistently.
- **R3 — favorability hues.** Exact values for positive/caution/negative — the design stage picks
  muted, palette-harmonized tones (guide `00 §1`: the operator sanctioned adding these tokens; pick
  tastefully, document in `STYLE_GUIDE`). Must stay legible against the tile surface.
- **R4 — fixture realism.** Seeded scores should mirror Phase 0 shapes (e.g. a sector that omits a
  theme; signed + null deltas; plausible percentile/rank/decomposition) so the render check is
  representative, not a toy.
- **R5 — payload size.** `/sectors/theme-scores` returns **all** sectors; fetched once and filtered
  client-side to `state.group`. Fine at ~63 sectors; note it (don't refetch per sector).

## Handoff → Principal Architect

Mostly frontend (`senior-frontend-engineer`, owns `static/`), with a small **fixture-seeding**
addition in `scripts/seed_fixture.py` (assign ownership — frontend can own the seed rows, or a brief
backend touch). Design the scorecard component + tile grammar, the inline decomposition, the
favorability token trio + coloring rules (R1–R3), the once-fetch/pick-by-sector state, and the
honest empty state. Map every AC to a concrete check (e2e screenshot / driven interaction / pytest).

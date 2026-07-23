# Sector Analytics app — deferred fixes / enhancements

A backlog of changes raised **during** the sector-app build (Phases 1–4) but deliberately **deferred
to be picked up after all planned phases ship**. Each is a real product decision, not a defect
against the phase it came from — the phase met its own brief; these change or extend that brief.

Pick these up as their own `/deliver` iterations (new briefs/branches) once Phases 1–4 are merged.
Status legend: **OPEN** (not started) · **IN PROGRESS** · **DONE**.

---

## F1 — Company view: default to a focal company on load (replace the empty state) — OPEN

- **Source:** Phase 2 (`sector-app-company`) **manual UI verification** — operator, 2026-07-22.
- **Request:** Opening the Company view (`/sector-analytics?view=company` with no `?symbol=`) should
  render a company **already focused** — the **first company alphabetically** — instead of the honest
  "Place a filer in its peers" empty state.
- **Supersedes:** Phase 2 brief **AC-5** (which deliberately specified an honest empty state until a
  filer is picked). This is an intentional reversal by the operator — record it as such so the change
  isn't later "corrected" back to the empty state.
- **Open questions (for the PM/architect when picked up):**
  - **"First alphabetically" across which set?** The Company view is built around a focal **plus its
    SIC peer group** — there is no group until a company is picked. Decide: (a) first company by name
    across the whole universe → its SIC group becomes the peer set; or (b) first company within a
    sensible default sector (e.g. the largest). Needs a call.
  - **Fallback:** keep the search and an honest empty/error state for the case where the universe is
    empty or the default can't resolve — don't hard-fail the default.
- **Honesty note:** a default focal is a *real* company (fine) — but it must **not** be presented as
  "recommended", "top", or ranked; it's only a default entry point. No fabricated data.
- **Likely shape:** frontend-mostly in `sectorapp.js` (resolve a default focal in `init`/on
  Company-view entry); a small read to enumerate/first-sort companies may be needed depending on the
  set chosen above.

## F2 — Company view: selectable breadcrumb dropdown (switch focal among SIC peers) — OPEN

- **Source:** Phase 2 (`sector-app-company`) **manual UI verification** — operator, 2026-07-22.
- **Request:** The **company name in the breadcrumb** (`SIC group › Company Name`) becomes a
  **selectable dropdown** that switches the focal among its **SIC peers** — the same companies shown
  as the dots. Complements the existing dot-click re-focus and header search.
- **Scope:** **frontend-only** — reuse the peer list the dot-cloud endpoint already returns
  (`/v1/sectors/{group}/{metric}/companies`); no new data or endpoint. Wire the selection to the
  existing `selectFocalCik(cik, name)` so the rail/composite/diamonds recompute identically to a
  dot-click.
- **Honesty note:** the dropdown lists the real peer filers only; ordering is display-only (e.g.
  alphabetical or by value), not a ranking/verdict.

## F3 — Company view: align closer with the prototype (header context + peer-distribution framing + composite decomposition) — OPEN

- **Source:** prototype review vs. implementation — operator, 2026-07-22
  (`docs/design/sector-app-prototype/` §5/§7/§8 + the Company block of `prototype.dc.html`).
- **Scope:** frontend-mostly; sub-item **(5)** is gated on real data (see its honesty note).
- **Sub-items:**
  1. **Header context pill** — show the peer-set context on the right of the Company header, e.g.
     "N peers · SIC {group}". Data already on hand (`focalGroup` + the `companies` count the dot-cloud
     endpoint returns). Display-only, not a ranking.
  2. **Filing basis in the header** — show the period/basis (e.g. "FY2025") in the Company header;
     `focalYear()` already provides it. (Today it's only in the global control bar.)
  3. **"Peer distribution" section heading** — add the bold section title above the dot-plots
     (prototype also groups the plots inside one shadowed card — optional to adopt that grouping).
  4. **"Click any peer dot to make it the focal filer" affordance** — add the explicit instruction
     line so the dot-click re-focus is discoverable (today only the caption hints at it).
  5. **Composite trend / "vs last FY" move** (prototype item 7). **HONESTY GATE — do not ship an
     invented delta.** There is **no materialized per-company historical composite/theme score**
     today, so a ▲/▼ "vs last FY" would be **fabricated**. Only build this after the backend
     materializes real per-company historical percentiles; until then it stays **omitted**. Flag and
     stop if any implementation would synthesize the move.
  6. **Composite click-to-decompose** (prototype item 8) — make the **derived** composite card
     expandable to show its derivation: the per-theme percentiles that feed the average (the rail
     already computes them). Honest — it decomposes the **derived** composite (kept labeled
     "derived · not a ranked position"); it does **not** introduce a fabricated rank.
- **Deliberately EXCLUDED — do not add:** a hard **"Composite rank"** number (the prototype's
  `rankLabel`). No per-company composite rank is materialized; presenting one would fabricate
  precision. Keep the derived-percentile treatment labeled "not a ranked position". (This is
  prototype item 6 from the 2026-07-22 review — intentionally not in F3.)
- **Related:** a **ticker pill** next to the name (prototype item 5) is tracked under **F2** (making
  the breadcrumb name interactive); it additionally needs the **ticker carried on the focal
  identity** — we key the focal on CIK and store `name`, not ticker, so the pill is only available on
  a ticker search, not on dot-click re-focus.

## F4 — Reintroduce favorability color across the sector app (REVERSES a locked decision) — OPEN

- **Source:** Phase 1 (`sector-app-shell`) **manual UI verification** — operator, 2026-07-22 (steps 2
  & 7: "add colors" for deltas + biggest shifts).
- **Decision:** the operator **reversed** the locked "no favorability color" premise of the redesign
  (REDESIGN_SECTOR_APP.md locked decisions + honesty-flag 3, both now annotated as reversed; the
  STYLE_GUIDE §1 favorability exception is extended to the app). Favorability color is coming **back**.
- **Request:** apply the documented `--positive`/`--caution`/`--negative` trio to signal up/down
  **direction** on the score **deltas + biggest shifts** in the Sector view, and — consistently —
  wherever direction is shown across the app's views (Company, Compare).
- **Honesty rails (carry these into the implementation):**
  - Color **accompanies** the arrow glyph (↑/↓/→) + track position — **never color alone** (a11y +
    STYLE_GUIDE §7). The arrow stays; color is additive.
  - The **score/value stays neutral `--ink`** (a saturated fill is not the score) — the score is a
    **POSITION vs other sectors, not a good/bad or buy/sell verdict**; keep that caveat visible.
  - Use the **muted earthy trio** (moss / amber / brick), **not** a primary green/red stoplight.
- **Scope:** frontend across `sectorapp.js`/`sectorapp.css` (re-add the `--positive/--caution/--negative`
  tokens — note they live in `style.css`, so no new tokens needed) + finish the **doc rewrite**
  (REDESIGN honesty-flag 3, the STYLE_GUIDE note, and the per-phase "no favorability color" lines)
  once the code lands, so code and docs match.

## F5 — Sector view: clicking a tile surfaces BOTH the decomposition and the peer strip/drill-down — OPEN

- **Source:** Phase 1 manual UI verification — operator, 2026-07-22 (step 2: "selecting the scorecard
  should display what drove the score also"; chosen resolution: **tile click shows both**).
- **Today:** clicking the small dashed **score number** opens the decomposition ("what drove the
  score"); clicking the **tile body** re-points the peer strip + drill-down. Two targets, two results.
- **Request:** a **tile click** should surface **both** — the decomposition *and* the peer strip +
  drill-down — together, so "what drove the score" is discoverable without hunting the small number.
- **Scope:** frontend-only (`sectorapp.js` interaction wiring + `sectorapp.css` layout for showing
  both panels); keep the score number as a secondary affordance if useful.

## F6 — Sub-industry in the sector control bar (needs backend data) — OPEN

- **Source:** Phase 1 manual UI verification — operator, 2026-07-22 (step 1: "I don't see the
  sub-industry in the control bar").
- **Context:** sub-industry pills were **deliberately omitted** (Phase 1 AC-4) because there is **no
  SIC-4 sub-industry grouping in the backend** — omitting beats fabricating.
- **Request:** show sub-industry (SIC-4) in the control bar.
- **Honesty gate — needs data first:** this is **not** frontend-only. It requires materializing a
  real SIC-4 sub-industry axis (grouping + peer sets + likely scores/spreads at that granularity)
  before any pill can be shown. **Do not fabricate** sub-industry labels/counts. Route the data work
  through the PM/architect when picked up.

## F7 — Sector view: match the prototype's column layout more closely — OPEN

- **Source:** prototype Sector-view design comparison vs. Phase 1 — operator, 2026-07-22
  (`docs/design/sector-app-prototype/prototype.dc.html` altitude-1 block vs. `sectorapp.js`/`.css`).
- **Context:** the shell + scorecard are already a pixel-accurate rebuild (sidebar 210px, rail 132px,
  main 1440px, scorecard `repeat(auto-fit,minmax(158px,1fr))`, tiles). These two lower rows diverge.
- **Sub-items (frontend-only, cosmetic/fidelity):**
  1. **Drill-down bottom row → the prototype's `grid-template-columns: 3fr 2fr` proportion.** The
     prototype puts the drill-down in the left **3fr** with a **2fr** column on the right; ours
     collapses to a **single full-width** drill-down because the prototype's right-hand column was a
     **filing-event feed** we deliberately dropped. Constrain the drill-down to the ~3/5 width and
     leave the 2fr space empty **or** repurpose it with **real Track-1 content only**.
     **HONESTY GATE:** do **not** re-introduce the filing-event feed / any fabricated "What's moving"
     data (Track-2, no backend — Phase 1 AC-4 / REDESIGN honesty flag 2). If nothing honest fills the
     2fr column, leaving the drill-down full-width is an acceptable alternative — operator's call at
     pick-up.
  2. **Match the decomposition + biggest-shifts column widths to the prototype.** Decomposition row:
     prototype `200px · 60px · 1fr · 52px` vs ours `minmax(140px,220px) · 48px · 1fr · 64px`.
     Biggest-shifts row: prototype flexbox `glyph 14px · name flex:1 · flag-chip · delta 80px ·
     basis 150px` vs ours grid `16px · minmax(120,1.6fr) · 90px · minmax(120,1.4fr)` (no dedicated
     flag column). Align the exact widths (and add the shift "flag" column) if pixel-fidelity is
     wanted — note ours is currently more responsive, so weigh fidelity vs. the `minmax()` behaviour.
- **Also noted (tiny, may fold in):** the provisional banner uses `var(--ext)`, undefined on this page
  (app doesn't load `app.css`), so it renders without the prototype's rust tint — same class of
  pre-existing token gap flagged for F3/Compare.

---

*Add further deferred items below as they arise, with their source (phase + how found) and date.*

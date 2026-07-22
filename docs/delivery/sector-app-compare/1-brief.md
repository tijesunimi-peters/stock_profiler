# Brief — Sector Analytics app: Compare view (Phase 3)

Stage 1 (Product Manager) handoff. Task slug: `sector-app-compare`.
Parent plan: `docs/REDESIGN_SECTOR_APP.md` (Compare row). Reference:
`docs/design/sector-app-prototype/HANDOFF.md` §5 (Compare), §7 (Compare view interactions).
**Likely frontend-only** (reuses shipped endpoints — architect confirms). Continues the app; Phase 1
(Sector view) is `sector-app-shell` `3e4bfc6`, Phase 2 (Company view) is `sector-app-company`
`329388d`. This phase **stacks on Phase 2** (the Compare view extends `sectorapp.js`).

## Problem / user

The app answers "how is one sector doing?" (Sector, altitude 1) and "where does one filer sit in its
peers?" (Company, altitude 2). Phase 3 adds altitude 3 — **"how do two sectors compare?"** The
**user** is the analyst weighing two industries who wants their composite theme health and headline
metric medians **side by side**, on real Track-1 data, with **no verdict** imposed. Success: they
pick sector A and sector B (or "pin" the current sector), and read paired composite/per-theme bars +
paired metric-median cards where each bar is true-length, A and B are only told apart by a
categorical color, and **nothing declares a winner**.

This is **sector-vs-sector** (the prototype's real intent). It is **not** the existing
company-vs-company `/compare` page — that page is unrelated and stays as is.

## Scope gate (Track 1)

**PASS.** A pure **read + re-shape** of already-materialized Track-1 sector aggregates
(`sector_theme_scores`, DuPont medians, spread medians) into a side-by-side layout. No free text, no
new data model, no market data, no new canonical concept. The app already loads
`/v1/sectors/theme-scores` (all sectors) and per-group `/sectors/{group}` + `/sectors/{group}/spreads`
— so this is expected to add **no backend endpoint** (architect confirms; a new endpoint is a
last resort, not the default).

## Scope

1. **Compare view in `sectorapp.js`** (altitude 3), reading the state store's `compareA` /
   `compareB` (both already carried in the store; sector indices/groups):
   - **Two sector selectors** — A and B — that independently set `compareA` / `compareB` and
     recompute the whole view. **A = `--accent` (terracotta), B = `--gaap` (blue)** — a **fixed
     categorical identity only**, never favorability. Reuse the existing sector-combobox/dropdown
     pattern from the control bar.
   - **Paired composite + per-theme bars** — from `/v1/sectors/theme-scores` (already loaded as
     `state.themeScores`, all sectors): one row per theme with two true-length bars (A over B, or
     paired), a **signed gap label** (with the leading sector's name/abbrev), and the composite
     score row. Only the **5 backable themes** show scores; the **2 not-yet-scored themes**
     (Accounting quality, Structure & activity) render an honest "not scored" row for **both**
     sectors (never a fabricated 0). Carry the scoring's **provisional framing**.
   - **Paired metric-median cards** — headline sector metrics from `/sectors/{group}` (DuPont
     medians) and/or `/sectors/{group}/spreads` (spread medians) for both A and B: each card shows
     the metric name, A's and B's median (raw reported value at the bar end), bar length **normalized
     per metric** (`value / max(a,b)`), and a **"lower is better" text marker** on inverted metrics
     (never a color flip). A metric a sector has no median for renders an honest **N/A**, never 0.
2. **"Pin to compare" flow** — the control-bar "pin to compare" button (stubbed in Phase 1) sets
   `view='compare'` and `compareA = current sector` (and shows a pinned/checked state when the
   current sector equals `compareA` or `compareB`), so an analyst can jump from Sector view into a
   comparison anchored on what they were looking at.
3. **Persistence** — `compareA` / `compareB` (and the sector/company focal) **persist across view
   switches**, consistent with the app's single-store model.

## Out of scope (this phase)

- **Qualitative view** (Phase 4).
- The existing **company-vs-company `/compare`** page — untouched.
- Any **new materialized aggregate**, canonical concept, or backend endpoint **unless the architect
  finds the existing endpoints genuinely insufficient** (then it's a minimal read, flagged).
- **Favorability color**, any **winner/verdict**, or **fabricated coverage %**.
- More than two sectors at once (A vs B only).

## Acceptance criteria (what QA will verify)

**Compare view**
- AC-1 Selecting **sector A and sector B** renders the Compare view: paired composite + per-theme
  bars and paired metric-median cards, all recomputing when either selector changes.
- AC-2 **A and B are told apart by categorical color only** — A `--accent`, B `--gaap` — used
  consistently across every bar/label/legend; the color encodes **identity, not good/bad**.
- AC-3 **No winner is ever declared.** Bars are **true-length**; gap labels state the signed
  difference with the leading sector's name, but no "A wins" / ✓ / ranking language. (Per the
  prototype, |gap| ≥ 10 may render in fuller ink for emphasis — still not a verdict.)
- AC-4 The **composite + 5 backable theme** rows show scores for both sectors; the **2 not-yet-scored
  themes render an honest "not scored"** row (for both), **never a 0 bar**. The scoring carries its
  **provisional** framing.
- AC-5 **Metric-median cards**: each shows A's and B's **raw median value** at the bar end, bar
  length **normalized per metric**, and a **"lower is better" text marker** on inverted metrics
  (`debt_to_equity`, `net_debt/EBITDA`-type, cash-cycle, etc. per `METRIC_DIRECTION`) — **no color
  flip, no favorability color**.

**Pin-to-compare + persistence**
- AC-6 The control-bar **"pin to compare"** sets `view='compare'` with `compareA` = the current
  sector and shows a pinned state; picking B completes the pair.
- AC-7 `compareA` / `compareB` **persist across view switches** (Compare → Sector → Compare keeps the
  same pair).

**Honesty (the brand)**
- AC-8 All numbers are **real Track-1 sector aggregates** with their provenance/status vocabulary; a
  sector or theme with **no score/median shows an honest N/A or "not scored"**, never 0 or a
  fabricated value; **no fabricated coverage %** or winner.
- AC-9 **Empty / degenerate states are honest**: same sector picked for A and B (identical bars —
  either allowed with a note or the selector prevents it), a sector with **no theme scores at all**
  (e.g. below the scoring threshold) renders the honest "not scored" state rather than a broken
  chart, and B unset shows a prompt to pick a second sector.

**Platform**
- AC-10 **No favorability color** anywhere; **CSP-safe** (no CDN/React/Tailwind — vanilla JS/CSS,
  tokens only); **mobile 390px reflow** (paired bars + cards stack) with no horizontal overflow;
  theme tokens only (light-only app).
- AC-11 `docker compose build api` → **e2e headless check passes** with eyeballed screenshots
  (compare two sectors: paired bars + metric cards; the pin-to-compare flow; the honest
  no-scores/no-B state; mobile) + **`pytest` green** (no regression; new tests only if the architect
  adds backend).

## Risks / open decisions (for the architect)

- **R1 — endpoint reuse vs. a new one.** Confirm `/v1/sectors/theme-scores` (all sectors, already
  `state.themeScores`) + `/sectors/{group}` + `/sectors/{group}/spreads` fully supply both A's and
  B's composite/theme scores **and** the metric medians. **Strongly prefer no new endpoint**; if a
  gap exists (e.g. a metric median not in either payload), pick the smallest fix and flag it. This
  decides whether Phase 3 is frontend-only or full-stack.
- **R2 — metric set for the median cards.** Choose the headline metrics for the paired cards from
  what `/sectors/{group}` + `/spreads` already return (DuPont components + the liquidity/solvency
  spreads), carrying each metric's `higher_is_better` (from `METRIC_DIRECTION`) for the "lower is
  better" marker. Don't invent metrics with no backing median.
- **R3 — same-sector / unset-B behavior.** Decide whether the B selector may equal A (show identical
  bars with a note) or is prevented, and what the view shows before B is chosen (a prompt). Keep it
  honest — no placeholder numbers.
- **R4 — gap-label emphasis rule.** Confirm the |gap| ≥ 10 "fuller ink" emphasis stays **non-verdict**
  (emphasis of magnitude, not a winner mark) and uses ink weight, not favorability color.
- **R5 — fixture.** The e2e needs **≥ 2 sectors with theme scores + metric medians** so the paired
  view renders, and at least one sector exercising the "not scored"/N/A honest state. Confirm the
  existing `seed_fixture.py` already seeds enough sectors (Phase 1 rendered the Sector-view
  scorecard for multiple groups) or extend it minimally.

## Handoff → Principal Architect

Frontend-first (likely frontend-only): resolve R1 (endpoint sufficiency — the frontend-only vs
full-stack fork), R2–R5. If R1 confirms reuse, this is a `senior-frontend-engineer` task on a branch
stacked on Phase 2 (`sector-app-company` `329388d`): the Compare view in `sectorapp.js` + `sectorapp.css`,
the pin-to-compare wiring, fixture check, and e2e. Map every AC to a concrete check.

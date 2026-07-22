# QA — Peer strip · biggest-shifts · theme drill-down (Phase 3)

Stage 4 (QA Tester). Verdict: **PASS**. Frontend-only UI change. Verified by **exercising the
running feature** — full suite, the Docker e2e headless render check, a scripted puppeteer
**interaction drive** (19 assertions, all pass), and eyeballing every screenshot. Branch:
`sector-drilldown` (stacked on P2→P1→P0, expected).

`pytest` **506 passed, 6 skipped** (no regression; fixture seeds 15 theme scores + 43 components,
32 distribution rows). e2e **HEADLESS CHECK: PASS**, `errors=0`. Interaction drive
**QA-DRILLDOWN: ALL PASS**. Favorability tokens confirmed used **only** in `sectors.css`.

## Per-AC verdict

| AC | Verdict | Evidence |
|----|---------|----------|
| AC-1 peer strip: bars for the focused theme, selected in accent, caption | **PASS** | Drive: 4 bars, 1 selected, caption "Profitability & returns · 4 sectors · FY2025 · Business Services highlighted". |
| AC-2 peer strip not clickable-to-navigate | **PASS** | Drive: clicking a bar leaves the selected sector unchanged (Business Services). |
| AC-3 non-scoring sectors omitted (no zero bars) | **PASS** | Drive: min bar height = 55% (no zero bars); bar count == #sectors scoring the theme. |
| AC-4 shifts band 3–5 rows | **PASS** | Drive: 4 rows — ROE ▲+12.5%, Net margin ▲+6.2%, Days sales (DSO) ▲+51d, Cash conversion cycle ▲+52d. |
| AC-5 favorability color direction-correct | **PASS** | Drive: DSO/CCC rows = `shift-neg` (red, unfavorable — a rise in a lower-is-better metric); ROE/net-margin = `shift-pos` (green). Glyph = raw direction, color = favorability. `equity_multiplier` neutral (didn't rank here). |
| AC-6 too-little-history omitted; honest empty | **PASS** | The shifts logic needs ≥3 changes + `|z|≥0.5`; on smooth data it renders the honest-empty band (seen pre-fixture-shock). Fixture shock demonstrates the populated path. |
| AC-7 tile-body expand → drill-down + peer-strip re-point | **PASS** | Drive: clicking the Financial health tile **body** sets focus=financial_health and the peer strip caption re-points to "Financial health". Screenshot `sectors-drilldown-fh`. |
| AC-8 populated / partial / honest-empty drill-downs | **PASS** | Drive: FH "Showing 4 of 4" + 4 boxes; Profitability "Showing 3 of 4 … omitted, not zero" + 3 boxes (roic omitted); Cash & investment 0 boxes + "no peer distribution … not zero. See the composite decomposition." |
| AC-9 score opens decomposition, doesn't change focus | **PASS** | Drive: clicking the **score** → 1 decomposition open, focusTheme unchanged (stopPropagation); tile-body expands without opening the decomposition. |
| AC-10 kept per-sector spreads panel present | **PASS** | Drive: "Metric spread across …" panel still in `#view`. |
| AC-11 focus persists across sector switch; falls back | **PASS** | Drive: focus FH, switch 73→60 → still financial_health (banks score it); focus Operating efficiency, switch to banks (omit it) → falls back to a theme banks score (profitability), never the absent one. |
| AC-12 default focus = first scored tile | **PASS** | Drive: fresh load → focus = profitability (first scored tile). |
| AC-13 basis surfaced, no verdict/alpha | **PASS** | Drive: peer strip "N sectors", shifts "±Nσ vs its own history", scorecard "not a … verdict" disclaimer present; no affirmative "strong buy / beats the market / price target" phrasing. |
| AC-14 page order | **PASS** | Drive: `#scorecard` → `#peerstrip` → `#shifts` → `#drilldown` → `#aggregation` → `#view` (top coords strictly increasing). |
| AC-15 mobile reflow, no clipped labels | **PASS** | Drive at 390px: `scrollWidth−clientWidth=0`; `qa-drilldown-mobile.png` shows scorecard 2-col, peer strip, shift rows stacked, drill-down boxes full-width. |
| AC-16 pytest green + fixture | **PASS** | 506 passed; fixture yields a populated FH drill-down + honest-empty C&I + a populated shifts band. |

## UI/UX review

- **The three surfaces read as one system** with the scorecard: the peer strip is a quiet
  score-height bar row (context, not a chart), the shifts band a compact metric/delta/basis list,
  the drill-down reuses the box-whisker family. The DuPont tree stays the page signature.
- **States** — every surface has an honest empty: peer strip (<2 sectors), shifts (no standardized
  move), drill-down (0 backed constituents → "no peer distribution … not zero. See the composite
  decomposition"). Nothing renders a zero as data.
- **The shift glyph/color split reads well:** ▲/▼ = which way the metric moved, color = whether
  that's good/bad — so "DSO ▲+51d" in red is unambiguous (rose, unfavorable). Clearer than tying the
  glyph to favorability.
- **Affordances** — the tile double-affordance is legible: the focused tile carries an accent ring,
  the tile body has a hover lift + `cursor:pointer` + `role=button` (keyboard), and the score button
  is a distinct target. A user can tell "click the tile to explore, click the number to decompose".
- **Copy/honesty** — "position vs the other sectors, not a good/bad or buy verdict" framing holds;
  drill-down coverage is stated honestly ("Showing N of M … omitted, not zero").

## Observations (non-blocking)

- **O-1:** the drill-down is honestly sparse for several themes (Operating efficiency 1/6, Cash &
  investment 0/2) because `/sectors/{group}/spreads` covers a fixed metric set. This is the
  documented R1 limitation, surfaced honestly to the user; broadening it is a separate data task.
- **O-2 (carried from Phase 2):** score-click still re-renders the whole scorecard (focus resets) —
  same minor a11y polish opportunity.

## Handoff

**Verdict: PASS — no defects.** This completes the **sector-overview altitude** (Phases 0–3 of
`docs/REDESIGN_SECTOR_OVERVIEW.md`).

**Ready to deploy (frontend):** static-asset change; deploy = rebuild the `api` image + ship.
**Branch is stacked P0→P1→P2→P3** (all unmerged) — merge in order (or together). On prod the
scorecard/peer-strip are honest-empty until the deferred DevOps batch
(`python -m secfin.analytical.sector_theme_scores`) runs. Uncommitted, not deployed. Next: operator
may commit the branch and/or request a deploy (`/devops-engineer`).

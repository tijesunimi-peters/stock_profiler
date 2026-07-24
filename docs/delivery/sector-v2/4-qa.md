# QA — v2 P0 (shell) + P1 (Sector view re-arch)

Stage 4 (QA Tester). Task slug: `sector-v2`. Branch: `sector-v2` (off `master`). Frontend-only.

**Verdict: PASS at the QA-tester level — PENDING operator hands-on manual UI verification.** Per the
qa-tester manual gate, this is an **interactive** change (Distribution scope toggle, tile re-point,
Sector-view-only right rail), so the operator hands-on step is REQUIRED before commit/deploy. Scripted
driving + screenshot eyeball are complete and green.

## Evidence

- **`pytest`**: `511 passed, 6 skipped` in Docker (`docker compose --profile test run --rm test`). No
  backend change; regression-clean.
- **e2e headless render check**: `docker compose build api` → `docker compose --profile e2e up
  --abort-on-container-exit --exit-code-from e2e` → **HEADLESS CHECK: PASS** (exit 0), every page
  `errors=0`. Shots in `data/e2e-shots/`.

## Per-AC verdict (against `2-architecture.md` AC table)

| AC | Verdict | Evidence |
|----|---------|----------|
| AC-1 (960 cap + right rail present, hidden <1240) | ✅ | `sectorapp.png` @1280: right rail shows Sector snapshot (Filers 59 · Period FY2025 · Coverage *to be defined* · Focused theme) + "What's moving" [Track 2] placeholder + How to read this + Methodology link. Viewport capped; `@media(max-width:1240px){.pa-rrail{display:none}}`. |
| AC-2 (01 scorecard F4 color + peer strip + geo/insider placeholders) | ✅ | `sectorapp.png`: tiles with moss ↑+5/↑+1 and brick ↓-3/↓-6 (arrow-paired); "Where this sector sits" strip; Geographic revenue mix + Insider flow dashed placeholders — "To be defined; no figures shown", no digit reads as data. |
| AC-3 (02 decomp full-width, open by default; tile re-points) | ✅ | `sectorapp.png`: "Profitability & returns · 68 composite" decomposition open on load, full width. `sectorapp-decomp.png`: tile click re-points focus (single panel, no error). |
| AC-4 (03 scope toggle; All metrics re-renders) | ✅ | `sectorapp.png` "This theme" = 3 of 4 constituents; `sectorapp-dist-all.png` after clicking [All metrics] → "All-metric spreads · sector-wide", 9 metrics, toggle active = accent. |
| AC-5 (no fabricated geo/insider/feed; N/A never 0; F4 arrow-paired) | ✅ | Placeholders carry only "to be defined / no figures shown"; distribution cover keeps "omitted, not zero"; delta color only on the chip, always with the arrow, value neutral. |
| AC-6 (390px reflow; pytest green; e2e PASS + eyeballed) | ✅ / ⚠︎ | pytest green; e2e PASS + eyeballed. 390px reflow verified by CSS (`.pa-rrail` hidden; `.pa-drill-row,.pa-geo-row` stack ≤900; toggle wraps) — **operator to confirm on a real 390px device in the manual step.** |
| AC-7 (Company/Compare/Qual + `/sectors` render; `?group=`; tile focuses decomp+distribution+peer-strip) | ✅ | e2e rendered `sectorapp-company*`, `sectorapp-compare*`, `sectorapp-qual`, and `sectors*` all `errors=0`; tile-click focuses decomp + peer strip + distribution together. |

## UI/UX review

Clean match to the v2 prototype's Sector altitude: the three numbered scopes read as a hierarchy
(scorecard → what drives it → distribution), the right rail is genuinely supplementary and steps out of
the way below 1240px, and the honest placeholders (geo, insider, feed, coverage) are unmistakably
placeholders — dashed/muted, "to be defined", never a fabricated figure. The single deliberate deviation
(F4 delta color) is scoped, arrow-paired, and value-neutral, consistent with the recorded decision. No
overflow, no clipped labels, no console errors.

## Operator manual UI verification (2026-07-24)

Operator ran all five hands-on checks against the seeded :8001 instance. Results:
- Check 1 (shell + right rail show wide / hide <1240, no overflow) — **PASS**.
- Check 2 (F4 delta color + arrow-paired, honest geo/insider placeholders) — **PASS**.
- Check 3 (decomp open by default + tile re-point) — **PASS**.
- Check 4/5 (Distribution toggle + cross-view + 390px) — **PASS**, with one nit: the Distribution
  metric-tile **fonts didn't match** the app.

**Defect + fix (frontend, this round):** `boxWhiskerChart` emits `.plot-chart-title`/`.plot-chart-caption`,
styled only in `app.css` — which this page deliberately does not load — so the metric names fell back to
the browser-default serif. Fixed by styling those classes locally (scoped to `.pa-drill-boxes`) to the
v2 prototype's distribution treatment: metric name in Hanken Grotesk 13.5/600 `--ink-body`, caption in
mono. Verified: served live on :8001 + regenerated `sectorapp-dist-all.png`/`sectorapp.png` (HEADLESS
CHECK PASS) — metric names now render in the paper-terminal sans face. (This latent mismatch also
affected the v1 drill-down; now corrected.)

**Defect 2 — missing hairline dividers (frontend, pre-existing, found this round):** operator noticed
Biggest shifts + Sector snapshot had no separator lines. Root cause: `sectorapp.css` references
`var(--rule)` **11×** for row/section borders, but `--rule` is **never defined** on this page (not in
style.css, sectorapp.css, or the HTML — the prototype defines it in `:root`; the app copied the
references, not the definition). An undefined `var()` makes each `border-top:1px solid var(--rule)`
invalid → no line renders. **Latent since Phase 1** — affected ALL app-wide dividers (sidebar foot,
title rule, control-bar meta, scorecard rank divider, decomp rows, shift rows, compare/qual rows, snapshot
rows), not just the two the operator spotted. **Fix:** define `--rule` on `.pa-app`, aliased to
style.css's identical `--border-tint-rule` (#e5dfd3, the prototype's value). Served live on :8001 +
regenerated shots (HEADLESS CHECK PASS).

**Refinement 3 — Distribution tile demarcation (frontend, this round):** operator asked the Distribution
metrics be better demarcated per the prototype. The prototype separates each metric tile with
`padding:12px 0; border-top:1px solid var(--rule)`; my `boxWhiskerChart` tiles had only a small margin
and no divider, so they ran together. **Fix:** `.pa-drill-boxes .plot-chart` now carries the per-tile
`padding:12px 0` + `--rule` border-top. Verified live + regenerated shots (HEADLESS CHECK PASS): each
metric (Net Margin … Interest Coverage) now sits in its own demarcated tile.

**Refinement 4 — inter-section spacing (frontend, this round):** operator flagged the gap between 02
(What drives it) and 03 (Distribution). Prototype gives each later scope header `margin:30px 0 4px`
(30px top); mine had only `margin-bottom:4px` on all three, so 02/03 sat too close to the section above.
**Fix:** `.pa-viewport > .pa-sec-head { margin-top:30px }` with `:first-child` reset to 0 (01 stays
flush). Verified live + regenerated shots (HEADLESS CHECK PASS).

## Handoff

All five operator checks PASS; four frontend refinements found during manual verification (Distribution
fonts; missing `--rule` hairlines app-wide; Distribution tile demarcation; 02/03 inter-section spacing)
are fixed and re-verified. **Awaiting operator confirmation**, then the `sector-v2` branch is ready to
commit. The v2 sequence continues at P2 (Company view).

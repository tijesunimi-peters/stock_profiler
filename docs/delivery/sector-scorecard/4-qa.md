# QA — Composite scorecard hero (Phase 2)

Stage 4 (QA Tester). Verdict: **PASS**. Frontend-only UI change. Verified by **exercising the
running feature** — full suite, the Docker e2e headless render check, a scripted puppeteer
**interaction drive** (18 assertions, all pass), and eyeballing every scorecard screenshot. Branch:
`sector-scorecard` (stacked on Phase 1 → Phase 0, expected).

`pytest` **506 passed, 6 skipped** (no regression; fixture seeds 9 scores + 29 components). e2e
**HEADLESS CHECK: PASS**, `errors=0`. Interaction drive **QA-SCORECARD: ALL PASS**. Favorability
tokens confirmed used **only** in `sectors.css` (no leak).

## Per-AC verdict

| AC | Verdict | Evidence |
|----|---------|----------|
| AC-1 scorecard is the hero above the DuPont body | **PASS** | Drive: `#scorecard .scorecard-grid` renders above `#view .dupont`; group 73 = **7 tiles (5 scored + 2 deferred)**. Screenshot `sectors`. |
| AC-2 tile: score, delta chip, "vs all sectors" percentile, "rank of rank_of" | **PASS** | Drive: "P82 · vs all sectors" + "2 of 11"; screenshots show all fields. |
| AC-3 favorability delta chip + glyph; null → "no prior FY", never 0 | **PASS** | Drive: positive `sc-delta-pos` "▲+5", negative `sc-delta-neg`, null `sc-delta-none` "no prior FY" (asserted no "0"). |
| AC-4 deferred themes = muted "not yet scored" + reason, no fabricated score | **PASS** | 2 `.sc-deferred` tiles (Accounting quality, Structure & activity) with reason; no number/color. |
| AC-5 score click → inline decomposition, one at a time, toggles | **PASS** | Drive: click → 1 decomp (4 constituent rows + "Equal-weight mean…" note + normalization); open another → still 1 (Growth); re-click → 0. Screenshot `sectors-decomp`. |
| AC-6 DuPont tree/trend/spreads/lifecycle still render below | **PASS** | Drive: `#view .dupont` + trend/lifecycle present; screenshots confirm no regression. |
| AC-7 switch sector re-renders scorecard from cache, no refetch | **PASS** | Drive: request count of `/sectors/theme-scores` = 3 before an in-page sector switch and **3 after**; scorecard re-rendered for Depository Institutions (4 scored) from the cached payload. |
| AC-8 honest empty when sector has no scores AND when payload empty | **PASS** | `sectors-scorecard-empty` (group 52): "Sector health scores aren't available yet … sparse coverage, not zero", DuPont still below. Intercepted `sectors:[]` on group 73 → same honest empty, no tiles, DuPont renders. |
| AC-9 group 60 omits operating_efficiency (absent, not scored:false) | **PASS** | Drive: banks themes = Profitability/Growth/Financial health/Cash & investment + the 2 deferred; **Operating efficiency absent**; 4 scored + 2 deferred. |
| AC-10 caveats + normalization surfaced, position-not-verdict, no alpha | **PASS** | "How these scores are built" disclosure carries normalization + caveats; lede frames score as "position vs the other sectors … not a good/bad or buy verdict"; no affirmative buy/alpha claim. |
| AC-11 favorability color only on chips + band accent; score neutral | **PASS** | Drive: score color = `rgb(28,26,22)` (= `--ink`, neutral); favorability tokens only in `sectors.css` (grep). |
| AC-12 mobile reflow, no clipped labels | **PASS** | Drive at 390px: `scrollWidth−clientWidth=0` with the decomposition open; `qa-scorecard-mobile.png` shows the grid reflowed to 2 columns + decomp rows wrapping, DuPont below. |
| AC-13 fixture seeds populated + deferred + decomp + empty | **PASS** | `_seed_sector_theme_scores`: group 73 (5 themes, +/−/flat/null deltas, decomp), group 60 (omits op-eff), 28/52 unseeded (empty case). |
| AC-14 pytest green | **PASS** | 506 passed, 6 skipped. |

The `&amp;` double-escape in the empty state (engineer-fixed) is **confirmed clean** — the empty
shot now reads "Building Materials & Garden Supplies".

## UI/UX review

- **States** — populated / loading skeleton / scoped error / honest-empty all render intentionally;
  the empty scorecard degrades without touching the DuPont body below (per-panel). Deferred themes
  are honest "not yet scored", never fabricated.
- **The favorability color decision** reads well: the trio is muted and earthy (moss/amber/brick),
  harmonized with the warm palette — it signals direction without a primary-color stoplight, and the
  restraint (neutral score number + thin band accent, loud color only on the *change* chip) keeps the
  score from reading as "buy this sector". The disclaimer copy + caveats hold the position-not-verdict
  line. Good resolution of the honesty tension.
- **Cohesion** — the scorecard tiles reuse the DuPont-card family (border, radius, mono value), so the
  new hero and the DuPont signature below read as one system.
- **Copy** — sentence case, active voice; "Open a score to see what drove it" is a clear affordance;
  the decomposition explains the z-score honestly ("its position vs other sectors … excluded, never
  counted as zero").
- **a11y** — score is a real `<button>` with `aria-expanded` + focus-visible; the decomposition is
  keyboard-reachable.

## Observations (non-blocking)

- **O-1 (minor a11y):** each score click re-renders the whole `#scorecard`, so the clicked button is
  recreated and **keyboard focus resets** after toggling a decomposition. Works fine with a mouse;
  a future polish could re-focus the toggled button or update in place. Not a defect.
- **O-2 (minor):** the "no prior FY" delta chip can wrap to two lines on a narrow tile — legible,
  acceptable; noted so it's a conscious call.

## Handoff

**Verdict: PASS — no defects.** A green report unlocks a deploy *request*, not the deploy.

**Ready to deploy (frontend):** static-asset change; deploy = rebuild the `api` image + ship.
**Branch is stacked on Phase 1 → Phase 0** (all unmerged) — merge P0 → P1 → P2 in order (or
together). On prod the scorecard is **honest-empty** until the deferred DevOps batch
(`python -m secfin.analytical.sector_theme_scores`) runs. Uncommitted, not deployed. Next: operator
may commit the branch and/or request a deploy (`/devops-engineer`).

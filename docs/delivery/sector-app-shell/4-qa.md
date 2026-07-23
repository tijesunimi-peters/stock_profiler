# QA — Sector Analytics app: shell + Sector view (Phase 1)

Stage 4 (QA Tester). Verdict: **PASS**. Frontend-only. Verified by **exercising the running
feature** — full suite, static honesty/CSP checks, the Docker e2e headless render check, a scripted
puppeteer **interaction drive** (15 assertions, all pass), and eyeballing every screenshot incl.
mobile. Branch: `sector-app-shell` (off `master`).

> Retrofit note (2026-07-22): the review questionnaire + manual UI verification sections were added
> after the QA-Tester skill gained those requirements. The operator ran the manual click-through on
> 2026-07-22 against the seeded `:8001` instance — the built behaviour is confirmed (incl. the honest
> empty-scorecard state); steps 2 & 7 surfaced **change requests** (add favorability color; tile-click
> shows the decomposition; sub-industry pill), deferred to `docs/delivery/sector-app-followups.md`
> **F4/F5/F6** — not Phase 1 defects.

`pytest` **506 passed, 6 skipped** (the `main.py` route). e2e **HEADLESS CHECK: PASS**, `errors=0`.
Interaction drive **QA-APP: ALL PASS**. No favorability tokens used; no CDN/Tailwind/React;
`sectors.*` unchanged.

## Per-AC verdict

| AC | Verdict | Evidence |
|----|---------|----------|
| AC-1 shell (sidebar/header/control bar/view rail, Sector active) | **PASS** | Drive: `.pa-side` + `.pa-topbar` + `.pa-ctrl` + active rail = "Sector". Screenshot `sectorapp`. |
| AC-2 sector dropdown re-derives the Sector view | **PASS** | Drive: pick another option → title-right sector changes ("Business Services" → "Building Materials & Garden Supplies"), whole view re-renders. |
| AC-3 state persists across view switch; stubs no fabricated data | **PASS** | Drive: Company stub then back to Sector → selected sector preserved; Qualitative stub says "Track 2 … nothing here is fabricated". Company/Compare stubs carry no data. |
| AC-4 meta = filers + FY + legend; no coverage %/sub-industry | **PASS** | Drive: "59 filers · FY2025 · full peer set" + 4-chip legend (OK/≈/∅/~); no "% filed", no sub-industry pills. |
| AC-5 scorecard 5 scored + 2 not-yet-scored | **PASS** | Drive: 5 `.pa-tile[data-theme]` + 2 `.pa-tile-def` (Accounting quality, Structure & activity). |
| AC-6 arrow-glyph deltas ↑↓→ | **PASS** | Drive: deltas = `↑+5 \| ↓-3 \| →no prior FY \| ↑+1 \| ↓-6`. |
| AC-7 score click → decomposition, tile unchanged (stopPropagation) | **PASS** | Drive: score click → `.pa-decomp` open, expanded tile unchanged; panel shows "Equal-weight" + normalization + "never counted as zero". Screenshot `sectorapp-decomp`. |
| AC-8 tile-body click → expandedTheme (peer strip + drill-down) w/o decomposition | **PASS** | Drive: clicking another tile sets `.expanded` to it, peer strip re-points, no `.pa-decomp`. |
| AC-9 biggest-shifts arrow glyph, no color | **PASS** | Drive: shift rows all arrow glyphs (`↑↑↑↑`), neutral delta color. |
| AC-10 no favorability color anywhere | **PASS** | Static: `--positive/--caution/--negative` never used in `sectorapp.css/.js` (only a comment). Computed: delta color `rgb(107,100,89)` = `--ink-soft` (neutral); no green/red. |
| AC-11 N/A never 0 | **PASS** | Drive: null delta renders "→ no prior FY" (no "0"). |
| AC-12 provisional banner + position-not-verdict | **PASS** | "≈ Scores provisional … a position vs other sectors, not a good/bad or buy verdict, and is openable"; no buy/sell/alpha. |
| AC-13 CSP-safe + mobile reflow | **PASS** | `sector-analytics.html`: no CDN/Tailwind/React. Mobile 390px: `scrollWidth−clientWidth=0` on both the populated (`qa-app-mobile-populated`) and honest-empty (`qa-app-mobile`) states; sidebar hidden, rail wraps, scorecard 2-col, shifts/drill-down stack — eyeballed. |
| AC-14 `/sectors` still serves the OLD page | **PASS** | Runtime: `GET /sectors` returns markup with `#sectorbar` (old page); `GET /sector-analytics` returns `#app` + `sectorapp.js`. `sectors.*` diff vs master = empty. |
| AC-15 pytest green | **PASS** | 506 passed, 6 skipped. |

## Review questionnaire

1. **What shipped.** A "paper-terminal" sector page at **`/sector-analytics`**: opens on a sector's
   composite-health **scorecard** (7 tiles = 5 scored + 2 "not yet scored"), each with a 0–100 score,
   an **↑/↓/→ delta** vs last FY, a "vs all sectors" percentile + rank. Click a score → its
   **decomposition**; click a tile → its **peer strip** + dispersion **drill-down**. A **biggest-shifts**
   list flags the largest standardized moves. Sidebar + sticky header + sector control bar + a
   Sector/Company/Compare/Qualitative **view rail** frame it. The old `/sectors` page is untouched.
2. **Surfaces touched.** **Frontend-only.** New route `/sector-analytics` (one-line `FileResponse` in
   `api/main.py`); new self-contained `static/sector-analytics.html` + `sectorapp.js` + `sectorapp.css`
   (reuse `style.css` tokens + `app.js` helpers; do **not** load `app.css`/`sectors.*`). Consumes the
   existing `/v1/sectors`, `/sectors/theme-scores`, `/sectors/{group}`, `/spreads`, `/lifecycle`
   endpoints. No schema/normalize/storage change.
3. **AC → evidence.** All **15 ACs PASS** (per-AC table above), each tied to a driven assertion or
   screenshot: `sectorapp.png`, `sectorapp-decomp.png`, the 15-assertion interaction drive, the
   `/sectors`-vs-`/sector-analytics` markup check (AC-14), neutral computed delta color (AC-10).
   Re-confirmed on `:8001`: group 73 = 5 scored + 2 deferred; `profitability` score 68, P82, rank 2/11,
   delta +5, 4 constituents.
4. **States exercised.** Populated scorecard (73: 5+2; 60: 4+2); loading until `theme-scores` resolves;
   decomposition open/close; tile-expand → peer strip + drill-down; populated drill-down
   (financial_health) vs honest empty drill-down; **honest empty scorecard** for an unscored sector
   (group 52) — code path, later confirmed live in the manual step.
5. **Edge cases probed.** N/A-never-0: null delta → "→ no prior FY"; deferred themes → "not yet scored";
   omitted drill-down constituents omitted (not zeroed) with an honest empty state. Unknown `?group=`
   → falls back to the largest sector. 13F/restatement/multi-class/429/upstream-502 — **N/A** (reads
   materialized sector aggregates; no per-filing/13F/upstream-SEC on the request path).
6. **Honesty contract.** No favorability color (grep clean; neutral computed delta color; direction via
   ↑/↓/→ + position + single terracotta accent); deferred themes as honest "not yet scored"; provisional
   banner + "a position, not a good/bad or buy verdict"; **no** fabricated coverage %/sub-industry/feed;
   no buy/sell/alpha copy. *(NB: the operator has since reversed the no-color stance — see F4.)*
7. **Deltas from the brief.** None material — all 15 ACs met. Automation gaps: (a) the **new app's**
   honest empty-scorecard state was never given its own e2e screenshot (only the old `/sectors` had one)
   — **closed** by the manual step below; (b) felt shell interactions (dropdown open, sticky header on
   scroll) only partially driven — covered in the manual step.
8. **Residual risk.** A human should confirm the empty-scorecard renders cleanly (not a broken/partial
   scorecard), the dropdown/scroll/decomposition/drill-down feel, and mobile reflow — all **run in the
   manual step below**. Biggest worry (an unscored sector showing a broken partial scorecard) — **not
   observed**; the honest empty state renders.

## UI/UX review

- **Faithful to the prototype.** The paper-terminal shell (210px sidebar, sticky blurred header,
  soft-shadow control-bar card, 132px view rail), the 7-tile scorecard with dashed-underline scores,
  the decomposition grid, the peer strip, and the drill-down all match the reference — rebuilt in
  vanilla JS/CSS on our tokens.
- **Honesty is intact and, if anything, stronger than the prototype's synthetic comp:** no
  favorability color (arrows + track position only), deferred themes as honest "not yet scored"
  tiles, the null delta as "→ no prior FY" (never 0), omitted coverage %/sub-industry/feed rather
  than fabricated numbers, and a Qualitative stub that explicitly says "Track 2 · nothing fabricated".
- **States** — populated, honest-empty (a sector with no theme scores), loading, and the inert
  stubs all render intentionally; the drill-down honestly states "3 of 4 constituents … omitted, not
  zero".
- **Affordances** — the score is a dashed-underline button (openable signal) with `stopPropagation`;
  the tile body is a `role=button` expand region; the rail marks the active view; the dropdown closes
  on outside-click.
- **Copy** — sentence case, active voice, provisional framing; no over-claiming.

## Observations (non-blocking)

- **O-1:** The pin-to-compare button is intentionally parked (sets `compareA`, no navigation) since
  Compare is Phase 3 — expected per the brief (R4).
- **O-2:** Full re-render on each interaction (state cached; box-whisker nodes remounted). Fine at
  this scale.

## Manual UI verification (operator-run, 2026-07-22)

Run against the seeded `:8001` instance (`docker compose run -d --rm --name secfin-verify -e
SECFIN_ANON_RATE_LIMIT_PER_SEC=1000 --publish 8001:8000 e2e-app`). Eight hands-on steps:

1. **Shell** (`/sector-analytics`) — sidebar + sticky header + control bar (dropdown + meta + legend)
   + view rail (Sector active). → **Confirmed.** *(operator note: no sub-industry pill → CR-A / F6.)*
2. **Scorecard** — 7 tiles (5 scored + 2 "not yet scored"), no favorability color. → **Confirmed as
   built.** *(operator change requests: add up/down delta **color** → CR-B / F4; make "what drove the
   score" reachable from the tile → CR-C / F5.)*
3. **Sector dropdown** re-derives the whole view. → **Confirmed.**
4. **Score click → decomposition** opens/closes; tile not expanded. → **Confirmed.**
5. **Tile-body click → peer strip + drill-down** (populated + honest empty). → **Confirmed.**
6. **Empty scorecard** (`?group=52`, unscored) → honest "scores aren’t available yet", not
   broken/partial. → **Confirmed** (closes the questionnaire's automation gap #7a).
7. **Biggest-shifts** — arrow glyphs + basis, no color. → **Confirmed as built.** *(operator: add
   color → CR-B / F4.)*
8. **Mobile 390px** — clean reflow, no horizontal scroll. → **Confirmed.**

**Outcome:** the built behaviour is confirmed on every step; no defect against the Phase 1 brief.
Three **change requests** surfaced (not defects — the operator wants different behaviour than the
agreed brief), logged for follow-up iterations after Phases 1–4:
- **F4** — reintroduce favorability **color** on deltas + biggest shifts (and across views).
  **Reverses** the locked "no favorability color" decision; recorded in REDESIGN_SECTOR_APP.md +
  STYLE_GUIDE §1. Color must **accompany** the arrow/position (never color alone); score stays neutral.
- **F5** — a **tile click** surfaces **both** the decomposition and the peer strip/drill-down.
- **F6** — **sub-industry** (SIC-4) in the control bar — needs real backend data first (do not fabricate).

## Handoff

**Verdict: PASS — no defects.** (Manual UI verification complete 2026-07-22; the three items above are
deferred enhancements/reversals, not blockers.) This is Phase 1 of the new 4-view Sector Analytics app (the "sector
page from scratch"), at **`/sector-analytics`**, with `/sectors` untouched.

**Ready to deploy (frontend):** static assets + one static route; deploy = rebuild the `api` image +
ship. **Operator decision pending (R1):** whether to eventually swap `/sectors` → the app once
Phases 2–4 (Company · Compare · Qualitative) land, or keep both. On prod the scorecard/peer-strip are
honest-empty until the deferred DevOps batch (`python -m secfin.analytical.sector_theme_scores`)
runs. Uncommitted, not deployed. Next: operator may commit the branch, continue to Phase 2, and/or
request a deploy.

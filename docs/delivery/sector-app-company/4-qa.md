# QA — Sector Analytics app: Company view (Phase 2)

Stage 4 (QA Tester). Branch: **`sector-app-company`** (stacked on Phase 1 `sector-app-shell`,
`3e4bfc6`; uncommitted). Verdict: **PASS — ready to deploy** (operator-gated).

Tested against the AC-1…AC-14 in `1-brief.md`, the architecture in `2-architecture.md`, and the
engineer handoff in `3-implementation.md`. Evidence below is from the running feature — the full
`pytest` suite, the Docker e2e headless render check, a scripted behavioral driving pass over the
live app, and eyeballed screenshots — not from reading the diff.

## How verified

- **pytest (fresh, in Docker):** new endpoint tests `tests/test_sector_company_values.py` **5
  passed**; full suite **511 passed, 6 skipped** (no regression).
- **e2e headless render check** (`docker compose build api` → `--profile e2e`): **PASS, errors=0**,
  including the three Company shots (`sectorapp-company-empty`, `sectorapp-company`,
  `sectorapp-company-refocus`).
- **Behavioral driving pass** — a puppeteer script over the live `e2e-app` (paced to avoid the
  unauthenticated IP rate-limit): **19/19 checks PASS**. It drives the real endpoint (same-origin
  fetch), the empty/populated states, computed styles, the dot-click re-focus, view-switch
  persistence, `/sectors` untouched, and mobile overflow.
- **Screenshots eyeballed:** empty state, populated dot-cloud (`?symbol=900001`, Machinery Co 1),
  dot-click re-focus (→ Machinery Co 5), and mobile 390px (`?symbol=900005`).

## Per-acceptance-criterion verdict

### Backend endpoint

- **AC-1 — per-company `{cik, value, percentile, name}` list; N/A·N/M absent (never 0).** **PASS.**
  `GET /v1/sectors/35/net_margin/companies` → 200 with **10** companies, each carrying
  `cik`/`name`/`value`/`percentile`; ordered by value. `higher_is_better:true` present.
- **AC-2 — honest empty below-min / no-values.** **PASS.** Covered by `pytest`
  (below-`secfin_peer_min_size` group → `companies: []`, 200). (The live raw-curl 429 seen earlier
  was an IP rate-limit artifact of rapid double-calls, not the endpoint — re-driven same-origin and
  paced, the endpoint returns 200/404 correctly.)
- **AC-3 — unknown metric → 404; raw units + unit available.** **PASS.**
  `/v1/sectors/35/bogus/companies` → **404**; response carries `unit` (e.g. `ratio`), values in raw
  reported units.
- **AC-4 — cache-aside read via repo; no DuckDB, no raw SQL in `routes.py`; pytest.** **PASS.**
  Grep of `routes.py` finds **no** `SELECT`/`FROM metric_`/`JOIN`/DuckDB on the request path (the
  only "DuckDB" mentions are docstrings asserting its *absence*); the join lives in
  `sqlite_sector_company_repository.py` behind the `SectorCompanyRepository` interface. 5 pytest
  cases cover the list, N/A exclusion, below-min empty, 404, and the lower-is-better flag.

### Frontend Company view

- **AC-5 — honest empty state when no focal.** **PASS.** `/sector-analytics?view=company` renders
  "**Place a filer in its peers**" + direction ("Search a ticker or CIK … each dot a filer, the
  focal company a ◆"); **zero** dot-plots, no fabricated rows.
- **AC-6 — search/`?symbol=` resolves + renders rail + dot-plots.** **PASS.** `?symbol=900001`
  resolves to **Machinery Co 1** (breadcrumb shows the SIC name + filer), the left percentile rail
  (5 backable themes + 2 "not scored" + composite card), and **8** dot-plots. The header search is a
  live `ClearyFiSuggest` input (vendored `suggest.js`).
- **AC-7 — IQR band + median tick + dot per peer + focal diamond at its value.** **PASS.** All 8
  plots carry an IQR band, a median tick, and a focal diamond (`iqr=8 med=8 diamond=8`); the focal
  diamond sits at the focal's value (e.g. Net Margin focal 4.0% = the min, diamond at far left).
- **AC-8 — dot-click re-focuses (rail/rank/diamonds recompute, breadcrumb changes).** **PASS.**
  Clicking a peer dot changes the breadcrumb (Machinery Co 1 → **Machinery Co 5**) and recomputes
  the rail, composite, and every diamond (composite P10 → P46).
- **AC-9 — focal persists across view switches.** **PASS.** Company → Sector (scorecard renders) →
  Company keeps the same focal (Machinery Co 5 → Machinery Co 5).

### Honesty (the brand)

- **AC-10 — no favorability color; focal diamond the single accent; "lower is better" a text
  marker.** **PASS.** No `--positive/--caution/--negative` referenced in `sectorapp.js/css` (only a
  comment). Computed styles: dots `rgb(216,209,196)` (neutral border), rail fill + focal diamond
  `rgb(192,112,58)` (the single terracotta accent) — no green/red. "**LOWER IS BETTER**" renders as
  a text chip on Debt to Equity.
- **AC-11 — favorability-adjusted percentiles, N/A excluded, N/A never 0, honest empty row.**
  **PASS.** Debt-to-Equity focal shows an **inverted** percentile (0.70× → **P56**, low d/e reads
  favorably); `fcf_margin` returns **9** filers vs `net_margin`'s **10** — the seeded N/A company is
  excluded, not zero-filled; composite card labeled "derived · avg of the theme percentiles above
  (not a ranked position)".
- **AC-12 — real filers + caption.** **PASS.** Caption reads "each dot a filer · band = IQR · line =
  median · ◆ = Machinery Co 1 · percentiles favorability-adjusted, N/A · N/M excluded". Dots are the
  seeded real `company_profiles` rows.

### Platform

- **AC-13 — CSP-safe (no new CDN) + mobile 390px reflow, no overflow.** **PASS (with a pre-existing
  note).** Phase 2 added only the **locally-vendored** `suggest.js` — no new remote dependency.
  Mobile 390px reflows the rail above the dot-plots (single column); measured horizontal
  overflow **= 0**. *Pre-existing, out of this branch's scope:* every page in the app (all 16,
  including `sector-analytics.html` at the Phase 1 commit) loads Hanken Grotesk / IBM Plex Mono from
  `fonts.googleapis.com`. This is the app's established font strategy, not introduced or changed
  here (the render check passes errors=0); flagged only so it isn't mistaken for new.
- **AC-14 — build → e2e passes (eyeballed) + pytest green.** **PASS.** Rebuilt `api`; e2e PASS
  errors=0; screenshots eyeballed (below); pytest 511 passed / 6 skipped.

## UI/UX review

- **States.** Empty, populated, and re-focus all render intentionally. The empty state is a genuine
  invitation ("Place a filer in its peers") with instructions, not a blank or a zeroed plot. A
  metric whose group has fewer values (fcf_margin, inventory_turnover) honestly reports "9 filers",
  never a phantom 10th at 0.
- **Legibility & layout.** Dot-plots read cleanly at desktop and reflow to one column at 390px with
  no clipping or horizontal bleed; the left rail's "P##" values and theme labels are legible; the
  "LOWER IS BETTER" chip and per-metric focal value/percentile sit in the header without crowding.
- **Copy.** Active, honest, consistent with the app: the composite is explicitly "**derived … not a
  ranked position**", the caption spells out the glyph vocabulary and the favorability/exclusion
  rule. No good/bad language, no over-claiming.
- **Affordances.** Dots are clickable to re-focus; the focal is unmistakably the single accent
  diamond; the view rail keeps the focal across switches, matching the app's "selection persists"
  model.
- **Honesty contract.** Direction is conveyed by position + the text marker + favorability-adjusted
  percentiles, never color. Derived numbers are labeled derived. N/A is excluded, never 0.

### Minor / cosmetic (non-blocking)

- The empty-state breadcrumb shows a leading "**› the focal filer**" placeholder (no group yet) —
  slightly awkward but harmless; the engineer already flagged it. Optional polish for a later pass.
- The fixture uses near-identical value spreads across several metrics (e.g. Net Margin and Revenue
  Growth both "min 4.0% · median 13.0% · max 24.0%") — a seed-data artifact only, not product
  behavior.

## Handoff

**Verdict: PASS.** All 14 acceptance criteria met; full suite green; e2e green + eyeballed; the
honesty contract holds (no favorability color, N/A excluded never 0, derived numbers labeled,
percentiles favorability-adjusted). No new remote dependency; no DuckDB / raw SQL on the request
path; `/sectors` and the Sector view are untouched.

**Ready to deploy** — deployment stays operator-gated. Operator's next options: commit the
`sector-app-company` branch, then proceed to Phase 3 (Compare view) / Phase 4 (Qualitative stub).
No defects require a loop back to engineering.

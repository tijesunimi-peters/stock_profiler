# QA — Sector Analytics app: Company view (Phase 2)

Stage 4 (QA Tester). Branch: **`sector-app-company`** (stacked on Phase 1 `sector-app-shell`,
`3e4bfc6`; uncommitted). Verdict: **PASS** (automated + manual UI verification complete;
operator-gated deploy). One deferred change request from manual review — see below.

> Retrofit note: the review questionnaire + manual UI verification sections were added on
> 2026-07-22 after the QA-Tester skill gained those requirements. All automated evidence below is
> unchanged. The operator ran the manual click-through on 2026-07-22: the built behaviour is
> confirmed; Step 1 surfaced a **change request** (default focal + breadcrumb dropdown), deferred to
> `docs/delivery/sector-app-followups.md` (F1/F2) — not a Phase 2 defect.

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

## Review questionnaire

1. **What shipped.** An analyst searches a ticker (or CIK) in the header and lands on that company
   placed **inside its SIC-peer distribution**: a dot per filer at its value across 8 metrics with
   the focal company drawn as a terracotta diamond, plus a derived per-theme percentile rail and a
   composite card. Clicking any peer dot re-focuses on that filer.
2. **Surfaces touched.** *Backend:* new `GET /v1/sectors/{group}/{metric}/companies`
   (`SectorCompanyRepository` + `sqlite_sector_company_repository.py`, `SectorCompanyValue(List)`
   schema, `main.py` wiring). *Frontend:* the Company view in `sectorapp.js`
   (`selectFocal`/`selectFocalCik`/`ensureCompanyData`/`renderCompanyView`/`wireCompanyView`, the
   `suggest.js` header search) + `sectorapp.css` (`.pa-co-*`/`.pa-dp-*`/`.pa-dot`/`.pa-diamond`).
   *Fixture/e2e:* a seeded SIC-35 group in `seed_fixture.py` + 3 `headless_check.js` shots.
3. **AC → evidence.** AC-1/3 → endpoint 200/404 bodies (driven same-origin, `n=10`, unit present);
   AC-2/4 → the 5 `pytest` cases; AC-5 → `sectorapp-company-empty.png`; AC-6/7/12 →
   `sectorapp-company.png` (rail + 8 dot-plots + IQR/median/diamond + caption); AC-8 →
   `sectorapp-company-refocus.png` + the driving line "Machinery Co 1 → Machinery Co 5"; AC-9/10/11 →
   the driving script's computed-style JSON + persistence + inverted-D/E-percentile lines; AC-13 →
   the 390px overflow=0 line + `qa-company-mobile.png`.
4. **States exercised.** *Empty* — `?view=company` with no symbol → "Place a filer in its peers" (no
   dot-plots). *Populated* — `?symbol=900001`. *Loading* — each dot-plot shows a loading state until
   its per-metric fetch resolves (observed during the populated render). *Not fully triggered:* the
   **error** state (`companyErr`, "Couldn't resolve that company") and the honest **"no SIC peer
   group"** state — the fixture focal always resolves and always has a group; these carry to the
   manual step + residual risk.
5. **Edge cases probed.** **N/A vs 0** — `fcf_margin` returns **9** filers vs `net_margin`'s **10**;
   the seeded N/A company is *absent*, never a 0-valued dot. Below-min group → `companies: []`
   (`pytest`). Unknown metric → **404**. **429** — a rapid unauthenticated curl loop tripped the
   process-wide IP rate-limit (an artifact of the driving, not the endpoint); re-driven same-origin
   and paced, it returns 200/404 correctly. Restatements / multi-class / PRN / option 13F — **N/A**
   to this feature (it reads materialized `metric_values`, not 13F holdings).
6. **Honesty contract.** No favorability color (computed styles: dots `rgb(216,209,196)`, diamond/
   rail `rgb(192,112,58)` — no green/red); N/A excluded, never 0; composite labeled "derived · … not
   a ranked position"; percentiles favorability-adjusted (D/E focal 0.70× → **P56**, inverted);
   caption states the derivation + exclusion; dots are the real seeded `company_profiles` rows.
7. **Deltas from the brief.** None material — all 14 ACs met as specified. **Not fully verifiable by
   automation:** (a) the **live typed ⌘K search → suggest-dropdown → keyboard pick** path (the
   driving used a `?symbol=` preset + form submit, not real keystroke-by-keystroke selection); (b)
   the **error** and **no-peer-group** empty states (not reachable with the current fixture); (c) dot
   **hover tooltips** and search-input **focus-visible**. These are the manual-step targets.
8. **Residual risk.** The real typed-search path is the least-exercised: a live search that fails to
   resolve, or a suggest dropdown that renders/keys badly, wouldn't be caught by the preset-driven
   run. Second: dot **tooltips** could overlap/clip at dense values. What would worry me most is a
   broken/blank state on a failed search (vs the intended honest error).

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

## Manual UI verification (required — operator-gated)

Automated e2e + eyeballed screenshots cover render and static layout; the **felt** interaction —
live typed search, keyboard/focus, hover tooltips, and the states the fixture can't reach — needs a
human. Run this hands-on against a live app (`docker compose up api`, or the running deployment);
each step lists the expected result. **~4 minutes.**

1. **Empty state.** Open `/sector-analytics?view=company`. → "Place a filer in its peers" with the
   search hint; **no** dot-plots, no zeroed rows.
2. **Live typed search + keyboard pick.** Click the header search, **type** a few characters of a
   real ticker/company (e.g. `AAPL`), wait for the suggest dropdown, and pick with the **keyboard**
   (↓ then Enter). → resolves to that company's Company view: rail + composite + 8 dot-plots, focal
   diamond visible. (This is the path the preset-driven run skipped.)
3. **Dot hover.** Hover a peer dot. → a tooltip shows the filer name + value; confirm no
   clipping/overlap at dense clusters.
4. **Dot-click re-focus.** Click a peer dot. → the breadcrumb name changes to that filer and the
   rail, composite, and every diamond recompute.
5. **Persistence.** Switch to Sector, then back to Company. → the same focal is retained.
6. **Honesty, by eye.** Confirm a lower-count metric shows the honest "N filers" (no 10th dot at 0);
   the **"lower is better"** text marker on Debt to Equity; **no green/red** anywhere.
7. **Mobile.** Emulate/resize to 390px wide. → the rail stacks above the dot-plots; **no horizontal
   scroll**.
8. **Error path (fixture couldn't reach it).** Search a nonsense ticker (e.g. `ZZZZZZ`). → an honest
   "Couldn't resolve that company" state, **not** a broken/blank page.

**Operator outcome:** ☑ **run by the operator, 2026-07-22.**

- **Steps 2–8 — confirmed.** Live typed search + keyboard pick resolves correctly (step 2); dot
  hover tooltip clean (3); dot-click re-focus recomputes fully (4); focal persists across views (5);
  honest counts + "lower is better" marker + no green/red (6); clean 390px reflow, no overflow (7);
  nonsense ticker → honest "Couldn't resolve that company", not a broken page (8).
- **Step 1 — NOT a defect; it is a change request.** The built behaviour (honest empty state,
  matching AC-5) works. The operator instead wants the Company view to **default to a focused company
  on load** (first alphabetically) and the **breadcrumb name to be a selectable dropdown** (switch
  focal among SIC peers). This changes AC-5 and adds a control — logged as **F1 + F2 in
  `docs/delivery/sector-app-followups.md`**, deferred to a follow-up iteration after Phases 1–4 (the
  operator's explicit routing). No loop-back to engineering for Phase 2 itself.

## Handoff

**Verdict: PASS — ready to deploy.** All 14 acceptance criteria met; full suite green; e2e green +
eyeballed; the honesty contract holds (no favorability color, N/A excluded never 0, derived numbers
labeled, percentiles favorability-adjusted). No new remote dependency; no DuckDB / raw SQL on the
request path; `/sectors` and the Sector view are untouched. **Manual UI verification complete**
(operator, 2026-07-22): steps 2–8 confirmed the felt behaviour; the live typed-search, hover, and
error-state paths all hold.

**One deferred change request** (not blocking, not a defect): the operator wants the Company view to
default to a focused company + a selectable breadcrumb dropdown — logged as **F1/F2** in
`docs/delivery/sector-app-followups.md` for a follow-up iteration after Phases 1–4. Deployment stays
operator-gated. No loop back to engineering required for Phase 2.

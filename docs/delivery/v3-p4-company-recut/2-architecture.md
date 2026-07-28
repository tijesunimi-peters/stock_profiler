# 2 — Architecture: V3-P4, Company re-cut (Overview + Financial history)

**Task:** `v3-p4-company-recut` · **Stage 2 (Principal Architect)** · 2026-07-27
**Input:** `1-brief.md` · **Depends on:** V3-P2 (on `master`), V3-P1 (`docs/BUILDER_INVENTORY.md`)

---

## Scope re-check

**Track 1 confirmed. No scope drift, no new dependency, no SEC-compliance change.** Every surface
reads XBRL companyfacts and the metric layer we already compute. The two new endpoints below are
read-only shaping over existing repositories and existing `normalize/` code — no new canonical
concept, so **guardrail 3 does not fire** (`normalize/mapping.py` and `docs/DATA_MODEL.md` are
untouched). No DuckDB, no analytical path, no ingest change.

One brief item is **cut on evidence** (§1.1 below); everything else stands.

---

## 1. The four open decisions — settled with evidence

### 1.1 Registrant profile field set → **thin endpoint; most prototype fields do not exist**

Probed the live volume (1,153,678 facts) rather than assuming:

```
ALL dei-ish tags in the DB:  EntityCommonStockSharesOutstanding (2856), EntityPublicFloat (934),
                             EntityListingParValuePerShare (74), EntityNumberOfEmployees (7), …
company_profiles:            cik, sic, sic_description, name  — 8,917 rows
AAPL:                        (320193, '3571', 'Electronic Computers', 'Apple Inc.')
```

**The root cause, and it is structural: the SEC's companyfacts API carries numeric facts only.**
`dei:AuditorName`, `dei:EntityFilerCategory`, `dei:EntityIncorporationStateCountryCode`, NAICS and
headquarters are **text** facts and are therefore absent from our store by construction — not
missing through an ingest gap we could close in this phase. `EntityNumberOfEmployees` exists **7
times across the entire database**; it is effectively absent.

So of the prototype's ten identity fields, **five are unobtainable in P4** (NAICS, state of
incorporation, headquarters, auditor, employees) and are **omitted, per AC-6** — the same call V3-P2
made for the entity bar's "Peer set" cell. `filer status` likewise.

What **is** obtainable:

| Field | Source | Needs backend? |
|---|---|---|
| Company name | `company_profiles.name` | **yes** — no endpoint serves it |
| SIC + industry description | `company_profiles.sic` / `.sic_description` | **yes** — same |
| CIK | already resolved on the page | no |
| Fiscal year-end | latest FY `period_end` from `/metric-periods` | no |
| First period on record | oldest entry from `/periods` | no |
| Latest filing (form · filed · accession) | already on every `/statements/*` response | no |

**Decision: add one thin read-only endpoint.** `CompanyProfileRepository` already exists, is already
wired as a FastAPI dependency (`get_company_profile_repo`) and is already used at `routes.py:1195`
— the endpoint is a model plus a repo read. Shipping the *Identity* section of the reference page
without the company's **name or industry** would be a poor trade against ~30 lines of backend.

> **This makes P4 full-stack, backend-first.** `_active.md`'s working assumption ("frontend-only
> unless D4 ships") is hereby **superseded** — recorded explicitly, as V3-P2 did.

### 1.2 Four-period condensed statements → **one new endpoint, not four calls**

`/statements/{statement}` is single-period; the `viz-series` endpoints return purpose-built viz
shapes, not a generic condensed statement. Four client calls would mean **four full-history facts
reads server-side** for one card, and twelve across the three tabs.

**Decision: `GET /companies/{symbol}/statements/{statement}/condensed`.** One facts read, N
`build_statement()` calls, one response — exactly the pattern `get_capital_structure_series`
(`routes.py:607`) already establishes. Reuses existing normalization wholesale.

### 1.3 Snapshot tile + drawer → **new `ClearyFi` builder; `metricCard` stays**

`metricCard` is referenced only by `company.js` and `components.html`. The new tile is a **sibling
builder in `app.js`**, not a rewrite of `metricCard` — `components.html` still showcases the card
and P5/P7 may want it. Do not delete it in this branch.

### 1.4 Sparkline fetch for ~28 tiles → **zero additional requests**

`/companies/{symbol}/metrics?year&period` **already returns a `trend` array per metric** — verified
live: 30 metrics, each with `[{period, period_end, value, status}]` intra-year quarterly points.

**Decision: the at-rest sparkline comes free from the call the page already makes.** No batching, no
lazy loading, no new endpoint. Two honesty constraints:

- The array is **intra-year quarters of the selected period** (≤4 points), **not** the prototype's
  "trailing 8 quarters". **Label it for what it is; never claim 8 quarters.** Where the array is
  empty or has one point, render **no sparkline** — never a flat line, never a zero baseline.
- The **drawer** lazy-loads the full series from `/metrics/{metric}/history` on open — the exact
  pattern `wireTrendPanels()`/`loadTrend()` (`company.js:1224–1253`) already uses. One request, on
  demand, unchanged in spirit.

### 1.5 Bonus found while probing: four computed metrics are invisible today

`/metrics` returns **30** metrics; `CATEGORIES` (`company.js:13`) lists **26**. `equity_multiplier`,
`dio`, `dpo` and `ccc` are computed, served, and never rendered. The re-cut is the natural moment:
add `equity_multiplier` to *Financial health* and `dio`/`dpo`/`ccc` to *Efficiency*, with formulas
in `FORMULAS`. AC-15 ("every metric grouped by category") requires it anyway.

---

## 2. Stage-by-stage design

```
  ingest        normalize                     store              serve                static
  ------        ---------                     -----              -----                ------
  UNCHANGED     viz.py: condensed_statement() CompanyProfileRepo routes.py: +2 GET    the re-cut
                (new shaping helper)          (existing, reused) schema: +2 models
```

### 2.1 Backend — `senior-backend-engineer` (goes first)

**B1 · `GET /v1/companies/{symbol}/profile`** — `api/routes.py`, model in `normalize/schema.py`.

```jsonc
{
  "cik": 320193,
  "name": "Apple Inc.",              // null when not in company_profiles
  "sic": "3571",                     // null when unassigned
  "sic_description": "Electronic Computers",
  "source": "SEC EDGAR filer index (SIC assignment)"
}
```

- Public router. Resolves symbol→CIK the standard way (`_cik_from_symbol`), then a **single
  `CompanyProfileRepository.get(cik)`**. No facts read, no SEC fetch on the hot path.
- **A company absent from `company_profiles` is a 200 with null fields**, not a 404 — an unknown
  *ticker* is the 404 (same convention as `/peers`). The frontend omits null fields (AC-6).
- No raw SQL in the API (guardrail 5) — the repository is the only DB access.

**B2 · `GET /v1/companies/{symbol}/statements/{statement}/condensed`**

Query: `period` (`FiscalPeriod`, default `FY`), `limit` (default **4**, `ge=1`, `le=8`).

```jsonc
{
  "cik": 320193, "statement": "income", "period_type": "FY",
  "columns": [ {"fiscal_year":2022,"fiscal_period":"FY","period_end":"2022-09-24",
                "form":"10-K","filed":"...","accession":"..."}, … ],   // oldest -> newest
  "rows":    [ {"canonical_concept":"revenue","label":"Revenue","unit":"USD",
                "values":[394328000000, null, …]} ]                    // aligned to columns
}
```

- **`null` means the period did not report that line. It is never `0`, never omitted, never carried
  forward from an adjacent period.** This is the single most important contract in B2.
- Implementation mirrors `get_capital_structure_series` (`routes.py:607`): one `_facts_for_cik`,
  select the most recent `limit` periods of that type from `available_periods`, `build_statement`
  per period, then a **new pure shaping function in `normalize/viz.py`** that unions the line
  concepts across periods preserving each statement's own row order, and aligns values by column.
- Row order: union in first-appearance order walking columns newest→oldest, so the newest filing's
  presentation wins. Rows absent from every column are impossible by construction.
- Each fact keeps `unit`; a concept whose unit differs across periods (a genuine anomaly) keeps the
  newest period's unit and the row carries `unit_mixed: true` so the UI can flag rather than hide it.
- Empty result is a **valid 200 with empty `columns`/`rows`** (honest "nothing to condense"); an
  unknown ticker is a 404. Consistent with the existing viz-series endpoints.

**Backend tests** (`tests/`, run in Docker):
- `/profile`: known ticker → name+SIC; ticker present but absent from `company_profiles` → 200 with
  nulls; unknown ticker → 404.
- `/condensed`: column count honors `limit` and is oldest→newest; a concept missing from one period
  yields `null` **not** `0` at that index; `values` length always equals `columns` length; row order
  is deterministic; `limit` bounds enforced; unknown statement → 404; empty → 200.

**Backend does NOT touch:** `sec/`, `ingest/`, `storage/` (repos reused as-is), `normalize/mapping.py`,
`normalize/metrics.py`. **No `as-originally-reported` compute path is built** — D4 is settled at
"state the basis" (AC-22).

### 2.2 Frontend — `senior-frontend-engineer` (same branch, after backend)

**F1 · `static/shell.js` — the view list and legacy aliasing.**

```js
VIEWS.companies = [["hub","Overview"], ["history","Financial history"],
                   ["insider","Insider"], ["institutional","Institutional"], ["beneficial","13D/G"]];
```

⚠️ **`resolveView()` maps an unknown slug to the subject's default.** Left alone,
`/company/AAPL/statements` silently renders **Overview** — a wrong page, not an error. Add an
explicit alias map consulted **before** the unknown-slug fallback:

```js
var VIEW_ALIASES = { companies: { fundamentals: "hub", statements: "history" } };
```

This covers the path form *and* `?tab=` in one place, because `route()` funnels both through
`resolveView()`. A genuinely unknown slug (`/company/AAPL/nonsense`) still falls back to `hub`.

**F2 · `static/company.js` — dispatch, controls, deep links.**
- `VIEW_SLUGS` and `render()`'s dispatch → `hub` / `history`; `renderInsider`, `renderInstitutional`,
  `renderBeneficial` **untouched** (AC-5).
- `syncUrl()` writes `/company/{sym}/hub|history`. `applyTabFromUrl()` normalizes legacy forms with
  `{replace:true}` — no extra history entry (AC-2).
- `?stmt=` selects the statement **inside** Financial history (unchanged role, new host view).
- **`?trend=<metric>` → opens that metric's snapshot drawer on Overview.** Chosen because it is the
  minimal-churn successor to today's behaviour (it opened a metric card's trend panel on
  Fundamentals) and it keeps the existing `trend` e2e shot meaningful.
- The period picker keeps its per-view axes: Overview uses the metric axis (`/metric-periods`),
  Financial history uses the statement axis for its tables. The entity bar's Period cell must
  report the view actually rendered (V3-P2's QA caught exactly this contradiction — do not regress).

**F3 · Overview renderer.**
- **§01 Identity & structure** — numbered heading + source eyebrow naming only sources we use.
  Registrant profile card from `/profile` + `/periods` + `/metric-periods` + the statement response;
  **null/unresolved fields are not rendered** (AC-6). Then the **EX-21 placeholder**: column heads,
  card chrome, `Read EX-21 ↗` link to EDGAR, **zero data rows**, copy stating EX-21 is a filed
  exhibit rather than tagged XBRL and therefore outside structured coverage (AC-7).
- **§02 Financial detail** — Condensed statements card (F5b) then the merged Financial snapshot (F5a).

**F4 · Financial history renderer.**
- Explorer: grouped metric picker (the six `CATEGORIES`, now 30 metrics), overlay ≤3 with the
  prototype's refusal message at 4, legend with latest value + remove, range tabs
  **8 quarters · 20 quarters · 5 fiscal years**, Expand, and the footer facts — *"N of M periods
  disclosed"*, mixed-units warning, overlay hint.
  - Data: `/metrics/{metric}/history?frequency=quarterly|annual`. `8q`/`20q` slice the quarterly
    series' tail; `5y` uses `frequency=annual`. Each response carries `unit`, `basis`,
    `restatement_basis`, and per-point `status`/`reason` — everything the honesty rules need.
  - **`basis`/`restatement_basis` are rendered as stated text. No basis tabs (AC-22).**
- The full statement surface moves here **intact**: tables, source-tag audit column, raw-JSON
  toggle, segments spike, and the income/balance/cash-flow viz charts. **Move the existing
  functions; do not re-implement them.** AC-20 is the highest-consequence check in the phase.

**F5 · `static/app.js` — two new builders (+ `app.css`).**

- **F5a `metricTile()` + tile grid + drawer.** Tile: label · value · sparkline (from the `/metrics`
  `trend` array; omitted when <2 points) · YoY · compare action. **Must carry the status glyph and
  basis label, and the drawer must expose formula + basis + `reason`** — §6/§7/§8 are not relaxed by
  a redesign (AC-10, AC-11). Peer position preserved (AC-12). Compare action navigates to
  `/company/{sym}/history` with the metric preselected (AC-13).
- **F5b `metricSeriesChart(series[], opts)`** — the generic multi-series, **gap-breaking** line the
  explorer needs. `BUILDER_INVENTORY` records that the behaviour exists three times
  (`sectorDupontTrend`, `sectorLifecycleTrend`, `valueLineChart`) but **no generic builder does**;
  this is roadmap §5's "step chart (`series: []`)" consolidation. **Build it in Plot, not d3** —
  D5's own selection rule (a plain mark on a scale) and `BUILDER_INVENTORY`'s explicit *"Do not
  rebuild in d3"*. Model it on `sectorLifecycleTrend` (`app.js:3781`), which already does the
  contiguous-window/visible-break logic and takes a `range` option.
  - **The line breaks at every null and is never interpolated** (AC-18) — a `STYLE_GUIDE` §7
    requirement, not a style choice.
  - Wrap in `chartCard()`; width from `measuredWidth()`, never a default — the content column is
    ~854px at 1280px because the Views rail sits beside it (§12.6, AC-21).
  - Condensed balance sheet uses the **existing `ClearyFi.balanceMatrix`** (`app.js:3234`), which
    already handles `available:false` with a reason — do not rebuild it. See §4 note.

**F6 · `static/components.html`** — add the tile (populated · N/A · N/M · no-sparkline states) and
`metricSeriesChart` (single · overlaid · gap-bearing · empty). `STYLE_GUIDE` §11 makes `/components`
the kitchen sink, and V3-P1's AC-16 set the precedent of ≥4 states per new builder.

**F7 · `scripts/headless_check.js`** — the regression net that catches a missed alias:
- **Update the two assertions that will now be wrong:** `company-path-view`
  (`/company/AAPL/statements`) must assert the active view is **`history`**, and
  `company-path-unknown` (`/company/AAPL/nonsense`) must assert **`hub`** (currently `statements` /
  `fundamentals`, `headless_check.js:209–212`).
- Retarget the existing `?tab=statements&stmt=*` shots and confirm each still renders.
- **New shots (AC-29):** `company-hub`, `company-history`, plus a driven shot that overlays two
  metrics in the explorer and one that opens a snapshot drawer.

---

## 3. Order of work

1. **Capture the e2e baseline on `master` before writing any code** (AC-28) — otherwise the AC is
   asserted, not measured. Grep for **both** `errors=` and `FAILED`; the compose exit code is
   unreliable when piped.
2. Branch `v3-p4-company-recut` off `master`.
3. **Backend:** B1, B2 + tests → `pytest` green in Docker → JSON contract handed to the frontend.
4. **Frontend:** F1 → F2 (routing green, every legacy URL landing) → F5 builders → F3 Overview →
   F4 Financial history → F6 components → F7 e2e.
5. Self-verify: `pytest`, headless check vs. the recorded baseline, and **eyeball the screenshots**.

Routing (F1/F2) lands before any content renderer: if aliasing is wrong, every later shot is
testing the wrong page.

---

## 4. Flag for the operator (they invited follow-ups)

**"For the balance sheet use the balance matrix" needs one clarification, and the engineer should
ask rather than guess.** `balanceMatrix` is inherently **single-period** (Assets = Liabilities +
Equity for one date), while the condensed card is specified as **four period columns**. The design
assumed here: on the Balance tab, render `balanceMatrix` for the selected period **above** the
four-period condensed table, so both the operator's instruction and the four-column requirement are
satisfied and nothing is lost. **Confirm before building §02's balance tab.**

---

## 5. Acceptance criteria → concrete checks

| AC | Check | Owner |
|---|---|---|
| 1 | Rail renders 5 labels in order; `grep -ri "Fundamentals\|Statements" static/` finds no view label | FE |
| 2 | `curl`/drive `/company/AAPL` → Overview; address normalizes to `/hub`; history length unchanged | FE |
| 3 | e2e drives **every** row of the brief's URL table per-URL; `/statements` → `history` | FE |
| 4 | Driven: select each view, then Back/Forward; assert active view + rendered content each step | FE |
| 5 | Insider/Institutional/13D-G shots diffed against the `master` baseline at identical viewport | QA |
| 6 | Every rendered profile field has a non-empty value; assert no `—`/`null`/`undefined`/`0` in the card | FE |
| 7 | EX-21 block: assert **0** `tr`/row nodes and no digit-bearing cell; copy names EX-21 as an exhibit | FE/QA |
| 8 | Tab switch re-renders without navigation; balance tab uses `balanceMatrix`; a null cell is N/A not `0` | FE |
| 9 | Exactly one snapshot surface; `glance-tile` and the old `.card-grid` metric grid are gone | FE |
| 10 | Every tile has a status glyph + basis; force an N/A metric and assert drained, not `0` | FE/QA |
| 11 | Click a tile → drawer with chart + formula + basis + `reason`; close restores | QA (driven) |
| 12 | Peer bar present where `/peers` returns data, with the "position not verdict" note | FE |
| 13 | Compare action lands on `/company/{sym}/history` with that metric selected | QA (driven) |
| 14 | Section rail lists the category groups; scroll-spy highlights the top-most | QA (driven) |
| 15 | 30 metrics grouped in 6 categories; select 4 → refusal message, not a silent drop | QA (driven) |
| 16 | Legend entry per series with latest value; remove control removes that series only | QA (driven) |
| 17 | Each range tab re-renders; `5y` uses `frequency=annual` (assert the request) | FE |
| 18 | Pick a metric with a known null period → assert a **broken** path (no segment spanning the gap) and the "N of M periods disclosed" counts | QA |
| 19 | Overlay `fcf` (USD) + `net_margin` (ratio) → mixed-units warning; two ratios → none | QA (driven) |
| 20 | **Side-by-side vs `master`:** tables, audit column, raw-JSON toggle, segments spike, all viz charts — each exercised, not read | QA (driven) |
| 21 | Assert `measuredWidth()` at 1280px; no clipped/overlapping label in any shot | FE/QA |
| 22 | `grep -ri "as filed\|as-originally-reported\|basis.*toggle" static/` → no control; basis stated in prose | QA |
| 23 | Sweep both views for a rendered `0` where the source value is null | QA |
| 24 | Every derived figure reaches formula/basis/why without leaving the page | QA |
| 25 | `financials_floor` + `not_advice` present on both views | FE |
| 26 | `grep` product code + fixtures for prototype figures; no `sd()`/`ri()`-derived number | QA |
| 27 | `docker compose --profile test run --rm test` | both |
| 28 | Headless check vs the recorded `master` baseline; grep `errors=` **and** `FAILED` | both |
| 29 | New shots exist and render | FE |
| 30 | Zero console errors on both views for a real ticker at the default viewport | QA |

---

## Handoff → Senior Engineers

**Full-stack, backend-first, one branch (`v3-p4-company-recut`).**

**`senior-backend-engineer` — first.** `api/routes.py` (+2 public GETs), `normalize/schema.py`
(+2 models), `normalize/viz.py` (+1 pure shaping function), `tests/`. Reuses
`CompanyProfileRepository`, `_facts_for_cik`, `build_statement`, `available_periods`. Contract in
§2.1 — **`null` is never `0`** is the load-bearing rule. Nothing in `sec/`, `ingest/`, `storage/`,
`mapping.py` or `metrics.py` changes; no `as-originally-reported` path is built.

**`senior-frontend-engineer` — second, same branch.** `static/shell.js`, `static/company.js`,
`static/app.js` + `app.css`, `static/components.html`, `scripts/headless_check.js`. Routing before
renderers. **Read `prototype.dc.html` before writing CSS** (`hub` :799–1577, `history` :1578–1679,
condensed statements :888–962, snapshot tiles + drawer :964–1010, EX-21 :862–879) — both of V3-P1's
fix cycles were design-fidelity guesses; V3-P2 had none because it opened the prototype first.
**Check `docs/BUILDER_INVENTORY.md` before writing any chart.** Ask the operator the §4 balance-sheet
question before building §02's balance tab.

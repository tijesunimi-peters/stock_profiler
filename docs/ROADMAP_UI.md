# Roadmap — UI / front-end pages

The web pages that surface this project's data. This doc sequences **which pages to build,
in what order, and against which API**; `docs/STYLE_GUIDE.md` governs **how they look and the
honesty rules they must obey**. Read the style guide first — a page that drops its status
vocabulary (§7), provenance pattern (§8), or honesty conventions (§9) is wrong even if it
looks right.

Scope is Track 1 (structured numeric data) only, same as the rest of the project. Every page
is a thin client over the `/v1` REST API — no page computes financials itself; it renders what
the API already returns, including the status/basis/reason each value carries.

## How to use this doc

- **Backend readiness** is tagged per page: **ready** (endpoint shipped), **partial** (some
  data exists, some pending), **blocked** (needs an unbuilt endpoint — links to the backend
  roadmap item).
- Each page lists the exact `/v1` endpoints it consumes, so a page is never started before its
  data is.
- Build order follows two rules: **shared furniture before pages** (Phase 0), then
  **backend-ready + already-designed before net-new** (highest leverage first).
- "Reference implementations" per `STYLE_GUIDE.md` §11: `explorer.html` is built and served;
  *Company Fundamentals* (the `/company/{symbol}` hub) and *Company Comparison* (`/compare`)
  are now both built and served.

## Current state (built & served)

- **Landing** — `/` (`static/index.html`)
- **Data Explorer** — `/explorer` (`static/explorer.html`): raw-XBRL-tag → clean-field audit,
  statement lookup, loading/404/empty states. The most complete reference for the design system.
- **API docs** — `/docs` (auto Swagger). Not a portal; a public docs site is M3 (see backend
  `docs/ROADMAP.md`).

Everything below is **not built yet** unless noted.

## Guiding principles

1. **The company hub is the spine.** Most pages are "one company, one lens" — build the hub
   shell once and hang the lenses (statements, metrics, insiders, ownership) off it.
2. **Reuse components, don't reinvent** (`STYLE_GUIDE.md` §6): status chip, metric card,
   metric matrix, ticker chip, sparkline, position bar, provenance expander.
3. **Never imply precision we don't have.** N/A and N/M render as tokens, not 0/blank/guess;
   APPROX shows the value with the flag; derived numbers always expose "show your work."
4. **Descriptive, never prescriptive.** No good/bad coloring, no "winner" in a comparison, no
   overall company ranking.
5. **Surface coverage limits.** Empty ≠ "nothing filed" — carry the coverage-floor notes
   (XBRL ~2009→2012; 13D/G structured-XML ~mid-2025; 13F long-only / ~45-day lag).

---

## Phase 0 — Shared shell & components (prerequisite) — **DONE**

Build once, reuse on every page. Shipped as `static/app.css` + `static/app.js`
(`window.Profin` builders) and a kitchen-sink reference at **`/components`**
(`static/components.html`) — the reference the other pages build against, and a manual test
surface.

**Design-system decision (revised):** data pages are **children of `/explorer`** and use the
shipped warm palette — paper `#F6F3EE`, terracotta `--accent`, rounded corners, soft shadows —
loading `style.css` (tokens + shared nav) then `app.css` (data components). *(This reverses an
earlier call to build a separate ink-blue "ledger" system; `STYLE_GUIDE.md` was rewritten to the
Explorer canon to match.)* The status vocabulary still reads distinctly because it's keyed on
glyph + label + border, not color alone — APPROX uses the redder `--ext-*` flag family.

- [x] **Page shell** — `Profin.masthead()` (eyebrow + h1 + as-of caption + double rule) and
      `Profin.footer()`; tokens, type scale, dotted-paper background, hard shadows in `app.css`.
- [x] **Global search / ticker resolver** — `Profin.mountSearch()` resolves ticker-or-CIK live
      via `/companies/{symbol}/periods`; Phase 1 passes an `onResolved` that navigates to the hub.
- [x] **Status legend + chip** (§7) — `Profin.statusChip()` / `statusLegend()`, OK/APPROX/N/A/N/M
      by glyph + label + border (never color alone).
- [x] **Provenance "show your work"** (§8) — `Profin.provenance()` + built into `metricCard()`
      (formula, basis, restatement basis, as-of, why-flagged); closed by default.
- [x] **Disclosure block** (§9) — `Profin.disclosure()` with reusable coverage copy pulled to
      match `DATA_MODEL.md` (XBRL floor, 13D/G floor, 13F caveats, not-investment-advice).
- [x] **Shared states** — `Profin.states.loading/empty/notFound/error` (cold-path note, distinct
      empty-vs-404).
- [x] **Metric card** — `Profin.metricCard(mv)` renders a `MetricValue` end to end (Phase 1 ready).

## Phase 1 — Company core (backend ready; highest leverage) — **DONE**

The payoff of the normalized data, all backed by shipped endpoints. Delivered as
`static/company.{html,css,js}` (the hub, served at `/company/{symbol}`, hosting the
Fundamentals + Statements tabs) and `static/coverage.html` (served at `/coverage`), built from
the Phase 0 `Profin` components. The global search now navigates to the hub.

- [x] **Company hub / profile** — tabbed shell at `/company/{symbol}`: ticker-chip header,
      search, FY period selector (from `/periods`), Fundamentals + Statements tabs. Resolves the
      symbol once via `/periods`. (Insiders/Ownership tabs are Phase 2 — the shell is ready for
      them.)
- [x] **Company Fundamentals** — metric cards grouped by category (display-only category +
      formula maps in `company.js`), status legend, provenance, disclosure. Consumes
      **`/companies/{symbol}/metrics?year=&period=`**; each card renders via `Profin.metricCard`
      with status/basis/reason/as-of — no invented precision. **FY cards carry an intra-year
      quarterly sparkline** (`MetricValue.trend` = the metric at each quarter of the fiscal year;
      flows are TTM-by-quarter so the last point = the annual value; na/nm quarters break the line,
      never interpolated). This is Phase 1b Tier-1 (the series) delivered within a single FY.
- [x] **Statements viewer** — income / balance / cash flow segmented toggle sharing the year
      selector; consumes `/companies/{symbol}/statements/{type}` + `/periods`; table shows
      `source_tag` + a US-GAAP/EXT badge, with empty-vs-404 states.
- [x] **Data coverage / quality** — `/coverage`: CUSIP resolution rate (or "nothing attempted
      yet") + counts from `/cusip-resolution-stats`, plus the coverage floors as first-class
      copy (matched to `DATA_MODEL.md`).

**Quarterly (done):** Fundamentals now offers annual **and quarterly** periods, driven by a new
`GET /companies/{symbol}/metric-periods` (the engine's own resolvable `{year, period, period_end}`
axis, period_end-anchored — the authoritative selector source, unlike `/periods`' `(fy, fp)`
labels). The metric engine resolves quarters in an in-progress fiscal year too, so the latest
quarter is reachable before its 10-K lands. The quarterly view is framed honestly: flows are TTM
(labeled), EPS shows N/M (not summable across quarters), and early-history quarters carry more
N/A/APPROX (average balance needs the year-ago quarter). The Statements tab stays FY-only (its
`(fy, fp)`-keyed backend is a separate axis).

## Phase 2 — Ownership & flows (backend ready except 13D/G)

- [x] **Insider trades** — an **Insider tab** on the company hub (`/company/{symbol}?tab=insider`,
      tabs are now deep-linkable). Consumes `GET /v1/companies/{symbol}/insider-trades?limit=25`;
      renders a transactions table (filed, owner, relationship, acquired/disposed, shares, price,
      shares-after) with an as-reported (not-derived) note and the "Acquired/Disposed is the
      reported code, not a buy/sell judgment" honesty line. `scripts/seed_fixture.py` seeds demo
      insider rows so the tab renders offline in the e2e profile. Verified headless (zero console
      errors). *(Fixed a latent bug along the way: `[hidden]` was being overridden by our flex
      `display` rules, so tab-switching didn't hide the statement/period controls — now
      `[hidden]{display:none!important}` in app.css.)*
- [x] **Institutional ownership — issuer view** — an **Institutional tab** on the company hub
      (`/company/{symbol}?tab=institutional`): "who holds this stock" + DERIVED buy/sell. The
      quarter selector is driven by the new **`GET /v1/companies/{symbol}/institutional-periods`**
      axis endpoint (mirrors `metric-periods`; lazy-loaded on first tab open, own axis alongside
      Fundamentals/Statements). Renders a Holders table (manager → `/manager/{cik}`, shares,
      value) and a DERIVED activity table (action, shares before/after, signed change) from
      `.../institutional-holders` + `.../institutional-activity` (both `period=`). The
      always-present `caveats` (derived-not-reported, long-only, ~45-day lag, empty-list
      ambiguity) render in a collapsible block. Verified headless (zero console errors).
- [x] **Manager (13F filer) profile** — a sibling page `/manager/{cik}`
      (`static/manager.{html,js}`): one manager's holdings snapshot + derived activity +
      co-filer roster, with a quarter selector driven by the new
      **`GET /v1/managers/{manager_cik}/periods`** axis. Consumes `.../holdings` and
      `.../activity`; resolved issuer CIKs link back to `/company/{cik}`. Masthead resolves the
      manager name from the holdings response. `scripts/seed_fixture.py` seeds 3 managers ×
      2 quarters of AAPL/Ally holdings so both this page and the Institutional tab render offline
      in the e2e profile. Verified headless (zero console errors).
- [x] **Beneficial ownership (13D/13G)** — a **13D/G tab** on the hub, gated (`limit`-based, no
      period). Consumes `GET /v1/companies/{symbol}/beneficial-ownership?limit=25`; renders a table
      (filed, owner, 13D/13G form, % of class, shares, event date) + the structured-XML ~mid-2025
      coverage floor. The `beneficial-ownership` endpoint landed in the M3/M4 merge (was blocked).

**M3 auth landed (pulled), then gating scoped to non-browser callers.** The merge split routes
into `public_router` vs a gated `router` (`X-API-Key`). Per product decision, **web pages are
ungated for now — only requests NOT served by a browser require a key.** Implemented as a
first-party bypass in `api/auth.py`: `require_api_key` and `limit_anonymous_traffic` skip requests
that look same-origin (`Sec-Fetch-Site`/`Origin`/`Referer`), so the hub's gated tabs (13D/G, and
future institutional/manager) render keyless from the browser, while curl/SDK callers still get
401. **Caveat (documented):** header-based, so spoofable — a UX gate, not a hard boundary; revisit
before the API is truly monetized. `/usage` is exempt from the bypass (an account endpoint has no
identity without a key). The bypass also resolves the 2/sec anon-limit 429 for browser page loads.
**Regression fixed:** `cusip-resolution-stats` → `public_router` so `/coverage` works keyless.
The `Profin` key helpers (`getKey/setKey/mountNeedsKey`) remain as a dormant fallback (unused
while pages are ungated).

- [x] **Beneficial ownership (13D/13G)** — shipped (see above).
- [x] **Institutional ownership — issuer view** — shipped: the Institutional tab, backed by the
      new `institutional-periods` axis endpoint; renders keyless via the same-origin bypass.
- [x] **Manager (13F filer) profile** *(`/manager/{cik}`)* — shipped, backed by the new
      `managers/{cik}/periods` axis endpoint.

**Phase 2 is complete.** All Ownership & flows pages (Insider, Institutional issuer view, Manager
profile, 13D/G) are shipped and headless-verified.

## Phase 3 — Comparison & trends

- [x] **Company Comparison** — a **`/compare`** page (`static/compare.{html,js,css}`,
      deep-linkable via `?symbols=AAPL,MSFT,JPM&year=2024`): a 2–3 company metric matrix over
      `GET /companies/{symbol}/metrics` (FY-year axis from `/metric-periods`). Rows are the same
      category/formula groups as the Fundamentals tab; each **column header surfaces that
      company's own `period_end` + `as_of`**, and an **alignment banner** fires when fiscal
      calendars differ (R10 / §9.4). Each cell carries its status chip + inline reason for
      APPROX/N/A/N/M; per-row formula + basis; full provenance lives on each company's linked
      `/company/{symbol}` page. **Descriptive only — no good/bad color, no winner** (§9.2). An
      "add a company" search + per-column remove keep the set editable (query-driven). Reachable
      via a new **Compare** nav link across the site. Verified headless (zero console errors).
- [x] **Metric trend / history** — shipped in two parts:
      - *Company hub* — each Fundamentals metric card has an expandable **Trend** panel
        (`Profin.trendChart`, `app.js`) that lazily loads
        **`GET /v1/companies/{symbol}/metrics/{metric}/history?frequency=annual`** and renders a
        self-scaling multi-year line (gap-breaking, never interpolated; min/max + year axis
        labels; as-restated caption — R9) plus the Tier-2 **signals** (expansion, cagr,
        acceleration, streak, distance-from-peak) as annotations. Deep-linkable via
        `?trend=<metric>`.
      - *`/compare` trajectories* — a **Trajectories** view toggle (`Profin.trajectoryChart`,
        `app.js`) overlays the 2–3 selected companies' annual series for a chosen metric on **one
        shared calendar axis** (x = each point's `period_end`, so different fiscal-year-ends align
        — R10); series are told apart by **dash pattern + a legend** (one accent only, no second
        hue — §10); gaps break each line honestly; a metric picker switches metrics. Deep-linkable
        via `?view=trajectories&metric=<key>`. **Descriptive only — no winner** (§9.2).
      Both verified headless (zero console errors).

**Phase 3 is complete.** Company Comparison (matrix) and Metric trend/history (company-hub trend
+ `/compare` trajectories) are all shipped and headless-verified. **Phase 4** is underway:
Screening (`/screen`) and Peer rankings are shipped; remaining is the public docs portal (M3).

## Phase 4 — Discovery & scale

- [x] **Screening / cross-company query builder** — a **`/screen`** page
      (`static/screen.{html,js,css}`) over the shipped M4 backend (the earlier "blocked" tag was
      stale). Two modes via a toggle: **Filter** (`GET /v1/screen` — a min/max query builder,
      AND across concepts, USD shorthand like `100B` accepted) and **Rank**
      (`GET /v1/concepts/{concept}` — one concept, sort + Top-N). Shared period (year + FY/Q).
      Results table links each company to `/company/{cik}`; the always-present frames `caveats`
      render in a disclosure, with a caption noting values are **calendar-quarter frame values**
      (a non-calendar fiscal year is matched to the nearest calendar period, so they can differ
      from `/statements`). **Descriptive only — no good/bad coloring** (§9.2). Deep-linkable
      (`?view=rank&concept=…` / `?year=&revenue_min=…`); reachable via a new **Screen** nav link.
      Verified headless (zero console errors).
- [x] **Peer comparison & rankings** — shipped with Metrics Phase 2 (see `ROADMAP_METRICS.md`):
      each company-hub Fundamentals metric card shows a **peer position bar** (`Profin.positionBar`)
      with "Nth pctile · k peers · SIC {group}" from **`GET /companies/{symbol}/peers`**, fetched
      alongside `/metrics` (best-effort — a peers miss never breaks the grid). Ranks exclude
      N/A/N/M rows; percentile is position, not a verdict (one accent, no good/bad color — §9.2).
      *Remaining follow-on:* the **`GET .../peers/{metric}/distribution`** endpoint (five-number
      summary) is served but not yet consumed by any data page — a peer-distribution strip on the
      hub is the natural next increment.
- [ ] **Public docs / developer portal** *(M3)* — distinct from Swagger: examples, auth/quota
      story, onboarding. Tracked in `docs/ROADMAP.md` M3.

## Phase 5 — Manager portfolio visualizations (planned, not started)

The `/manager/{cik}` profile is tables-only today: holdings, derived activity, and the
co-filer roster render as rows with no visual summary of what the portfolio *looks like*
(composition, concentration, what changed). This phase adds charts to that page. Everything
below consumes **already-shipped endpoints** (`/managers/{cik}/periods`, `.../holdings`,
`.../activity`) — backend is **ready** for every item; what varies is **data readiness**,
noted per item: as of 2026-07-11 the bulk 13F ingest has one broadly-populated quarter
(2026-06-30, 579 managers) and only single-manager coverage of earlier quarters, so
single-snapshot charts are fully servable now while multi-quarter charts are honest but
thin until more quarters are backfilled.

**Rendering mechanism (DECIDED 2026-07-12, reversing the earlier hand-rolled-SVG call):**
Phase 5 charts use **Observable Plot**, per product direction. Constraints that make this
compatible with the design system:
- **Vendored, not CDN-loaded, on data pages:** `/static/vendor/d3.min.js` (v7.9.0) then
  `/static/vendor/plot.umd.min.js` (v0.6.17 — the UMD build requires the global `d3`,
  load order matters), exposing `window.Plot`. Data pages stay self-hosted; only the
  standalone infographic template keeps its CDN ESM import.
- **Wrapped in `Profin` builders:** pages never call `Plot.plot()` directly — each chart
  is a `Profin.*` builder in `app.js` that owns its Plot spec, style-guide styling (one
  terracotta accent, tint ramps, IBM Plex Mono numerals), and honesty captions, so 5.6
  reuse and the §6 inventory stay meaningful. Plot builders return a DOM node (Plot
  renders SVG elements), unlike the older string builders — callers append, not innerHTML.
- The existing hand-rolled builders (`sparkline`/`trendChart`/`trajectoryChart`/
  `positionBar`) stay as they are; they are not being migrated.
`STYLE_GUIDE.md` §6/§10 updated to match (vendored-Plot mechanism + the graphics line).

**Palette constraint to resolve up front (§10):** composition charts conventionally lean
on a categorical hue per slice; the style guide allows **one accent, no good/bad color,
series told apart by dash/position/label**. So prefer chart forms that don't need
per-category hue at all — ranked horizontal bars, single-hue tint ramps ordered by value,
position/annotation — over donuts/treemaps that beg for a rainbow. Where a tint ramp is
used, lightness encodes nothing but rank-order legibility (never a judgment).

**Honesty rules specific to 13F charts (all inherit the standing caveats):**
- Every chart carries the existing always-present caveats block (derived-not-reported,
  long-only, ~45-day lag) — a chart is not exempt because it's a picture.
- `value` is the *reported* market value; its unit convention changed mid-history
  (thousands → whole dollars, ~2023 — see `DATA_MODEL.md`). Any chart spanning that
  boundary (portfolio value over time) must normalize explicitly or refuse to cross it —
  never plot the raw discontinuity as if the portfolio 1000×'d.
- A "share" of portfolio value is a share of *reported 13F long positions only* — say so
  in the caption; it is not the manager's AUM or whole book.
- Rows aren't all common stock: `put_call` (options) and `shares_or_principal` (`SH` vs
  `PRN`) matter. Composition by `value` may aggregate across them, but never sum *shares*
  across SH/PRN or option/equity rows; option positions get labeled, not silently pooled.
- Multi-class issuers appear as distinct CUSIPs — keep them distinct (same rule as
  `diff_holders`), or label an explicit issuer-level rollup as a rollup.

### Phase 5 tasks

- [x] **5.1 Composition — top-N value bar list** — shipped: `Profin.compositionBars(holdings,
      opts)` (vendored Plot, DOM-node builder), mounted above the holdings table on
      `/manager/{cik}`. Top-10 by `value` share + "Other (n positions)"; single accent +
      rank-order tint ramp; same-name issuers disambiguated by CUSIP; `(PUT)`/`(CALL)`
      suffixes on option rows; "reported long positions only" caption; returns `null` (honest
      empty note) when no positive total. Verified headless (zero console errors).
- [x] **5.2 Concentration stat tiles** — shipped: `Profin.statTiles(holdings, opts)` alongside
      5.1 — positions reported, top-1/5/10 share of reported value, reported total.
      Descriptive only; renders N/A tiles (never `0%`) when total reported value is absent;
      no Herfindahl by design. Verified headless.
- [x] **5.3 Derived activity — diverging change bars** — shipped: `Profin.divergingBars(
      activity, opts)`, mounted above the activity table. Signed share-change bars per CUSIP
      (reduced/exited left, new/added right), top ±10 by magnitude + overflow note; solid
      fill = opened/closed outright, lighter tint = resized (one hue, no green/red). DERIVED
      framing carried in title + caption (never-reported-trades, presence/absence inference,
      shares-not-value, no SH/PRN summing). Note: `HoldingDelta` carries no `put_call` /
      `shares_or_principal`, so option labeling is a standing caption caveat, not per-bar.
      Verified headless.
- [x] **5.4 Portfolio value over time** — shipped: `Profin.valueLineChart(points, opts)` in
      its own mount above the quarter selector (fetched once via `/periods` +
      per-quarter `/holdings`, capped at the 8 most recent eligible quarters; a failed
      quarter is a gap, never a page error). Implements the DECIDED clip rule below
      (`report_period >= 2024-01-01` only, exclusion count surfaced in the caption); gaps
      break the line; one eligible quarter renders an honest single value, never a fake
      line. e2e fixture extended to 4 consecutive quarters. Verified headless.
      *(Original spec follows; the unit-convention decision is recorded inline.)*
      A small multi-quarter line (reuse `trendChart`'s conventions: gaps
      break the line, min/max labels) of total reported value per quarter, on the manager
      masthead or above the quarter selector. **Unit-convention decision (DECIDED
      2026-07-12): clip, don't normalize.** The series only plots quarters with
      `report_period >= 2024-01-01` — safely inside the whole-dollar era (the
      thousands→dollars switch happened "around 2023" per `DATA_MODEL.md`'s unit caveat,
      with no per-filer boundary detection available). Excluded earlier quarters are
      surfaced in the caption as a count ("N earlier quarters excluded: pre-2024 13F
      values use a different unit convention"), never silently dropped, and never plotted
      across the boundary — normalizing was rejected because the boundary is fuzzy and
      per-filer, and a wrong guess lies by three orders of magnitude.
- [ ] **5.5 Allocation over time — top-holdings share series** *(data: partial; defer
      until ≥4 quarters are broadly ingested)*. Per-quarter percent-of-portfolio lines for
      the current top ~5 holdings (dash pattern + legend, one accent — the
      `trajectoryChart` recipe), NOT a stacked area (stacking implies whole-book
      completeness and needs per-band hue). Calendar axis; a holding absent from a quarter
      breaks its line.
- [ ] **5.6 Reuse on the issuer side** *(scope check, not new design)*. Once 5.1/5.3 exist
      as `Profin` builders, evaluate reusing them on the company hub's Institutional tab
      (top holders by value; derived holder activity) — same endpoints' issuer-centric
      twins, same caveats. Do this as reuse of the shipped builders, not a parallel build.

**Build order:** 5.1 + 5.2 together (one snapshot, ready today), then 5.3, then 5.4
(after the unit-convention decision), 5.5 last (needs quarters that don't exist yet).
5.6 whenever 5.1/5.3 are stable.

**Status (2026-07-12):** 5.1–5.4 shipped in one parallel pass (three worktree tracks merged;
full headless suite + pytest green). 5.5 stays deferred on its data gate (≥4 broadly-ingested
quarters — real coverage is still one broad quarter). 5.6 in progress.

---

## Per-page summary

| Page | Phase | Backend | Key endpoints |
|---|---|---|---|
| Landing | built | ready | ticker→CIK |
| Data Explorer | built | ready | `/statements`, `/periods` |
| Company hub | 1 | ready | (routing) |
| Company Fundamentals | 1 | built | `/metrics`, `/metrics/{m}/history`, `/peers` |
| Statements viewer | 1 | ready | `/statements`, `/periods` |
| Data coverage/quality | 1 | ready | `/cusip-resolution-stats` |
| Insider trades | 2 | built | `/insider-trades` |
| Institutional ownership (issuer) | 2 | built | `/institutional-periods`, `/institutional-holders`, `/institutional-activity` |
| Manager (13F) profile | 2 | built | `/managers/{cik}/periods`, `/holdings`, `/activity` |
| Beneficial ownership (13D/G) | 2 | built | `/beneficial-ownership` |
| Company Comparison | 3 | built | `/metrics` ×N, `/metric-periods` |
| Metric trend/history | 3 | built | `/metrics/{metric}/history` |
| Screening | 4 | built | `/screen`, `/concepts/{concept}` |
| Peer rankings | 4 | built | `/peers` (distribution endpoint served, not yet consumed) |
| Public docs portal | 4 | n/a | *(M3)* |
| Manager portfolio viz | 5 | built (5.1–5.4; 5.5 deferred on data) | `/managers/{cik}/periods`, `/holdings`, `/activity` |

## Guardrails / do-nots (mirror `STYLE_GUIDE.md` §10)

- No new colors/gradients, blurred/soft shadows, or big rounded corners.
- No green/red good-bad coding of metrics; no picking a comparison "winner"; no overall ranking.
- Never render a missing/inapplicable value as `0`, `—`, blank, or a guess — use the status token.
- Never drop the status chip, basis tag, or provenance affordance on a derived number.
- No emoji/decorative icons; sparklines and position bars are the only generated graphics.
- Only the two type families (Hanken Grotesk + IBM Plex Mono); no Inter/Roboto/Arial.
- Every link resolves to a real route — no placeholders.
- Don't build a page ahead of its endpoint (see the "blocked" tags) — flag and defer instead.

## Verify, don't assume

- Confirm each endpoint's real response shape against the running API before wiring a page
  (the metric/ownership responses carry status/basis/caveat fields the mockups must render).
- The two "designed" pages are mockups — re-check them against the shipped `/metrics` and
  `/statements` responses; adjust the design to the data, not the reverse.
- Coverage floors and 13F caveats are data facts, not copy — pull the wording from
  `docs/DATA_MODEL.md` so the page and the data agree.

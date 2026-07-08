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
- [ ] **Metric trend / history** *(ready — backend shipped)* — deeper per-metric trend than the
      card sparkline (streaks, CAGR, distance-from-peak). The Metrics **Phase 1b** backend is now
      built: **`GET /v1/companies/{symbol}/metrics/{metric}/history?frequency=quarterly|annual`**
      returns the full series (gap-honest, one as-restated basis, R9/R10) plus the Tier-2
      `signals` (expansion, cagr, acceleration, streak, distance-from-peak). Build the UI against
      it: an expandable per-metric trend chart on the company hub with the signals as small
      annotations; the "compare trajectories" mode then folds into the comparison page (align on
      the calendar `period_end` each point carries — R10).

**Next Phase 3 step:** build the **Metric trend/history UI** against the now-shipped
`/metrics/{metric}/history` endpoint (fuller trend chart + Tier-2 signal annotations on the
company hub; trajectory overlay on `/compare`).

## Phase 4 — Discovery & scale (blocked on backend)

- [ ] **Screening / cross-company query builder** *(blocked — M4)* — filter companies by
      concept/metric/period. Needs the frames-API screening backend + analytical query path.
- [ ] **Peer comparison & rankings** *(blocked — Metrics Phase 2)* — percentile/z-score within
      SIC peer groups. Ranks exclude N/A/N/M; components shown transparently (no black-box score).
- [ ] **Public docs / developer portal** *(M3)* — distinct from Swagger: examples, auth/quota
      story, onboarding. Tracked in `docs/ROADMAP.md` M3.

---

## Per-page summary

| Page | Phase | Backend | Key endpoints |
|---|---|---|---|
| Landing | built | ready | ticker→CIK |
| Data Explorer | built | ready | `/statements`, `/periods` |
| Company hub | 1 | ready | (routing) |
| Company Fundamentals | 1 | ready | `/metrics` |
| Statements viewer | 1 | ready | `/statements`, `/periods` |
| Data coverage/quality | 1 | ready | `/cusip-resolution-stats` |
| Insider trades | 2 | built | `/insider-trades` |
| Institutional ownership (issuer) | 2 | built | `/institutional-periods`, `/institutional-holders`, `/institutional-activity` |
| Manager (13F) profile | 2 | built | `/managers/{cik}/periods`, `/holdings`, `/activity` |
| Beneficial ownership (13D/G) | 2 | built | `/beneficial-ownership` |
| Company Comparison | 3 | built | `/metrics` ×N, `/metric-periods` |
| Metric trend/history | 3 | ready | `/metrics/{metric}/history` |
| Screening | 4 | blocked | *(M4)* |
| Peer rankings | 4 | blocked | *(Metrics Phase 2)* |
| Public docs portal | 4 | n/a | *(M3)* |

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

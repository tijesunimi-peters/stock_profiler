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
  *Company Fundamentals* and *Company Comparison* exist as design components (mockups) but are
  not yet in the app.

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

Build once, reuse on every page. Shipped as `static/app.css` (the STYLE_GUIDE-canon data-page
system: ink-blue accent, `#EDE4D0` paper, hard offset shadows, terracotta reserved for caveats)
and `static/app.js` (`window.Profin` builders), kept **separate** from the marketing `style.css`.
A kitchen-sink reference lives at **`/components`** (`static/components.html`) — the reference
implementation Phase 1 builds against, and a manual test surface. Decision: data pages follow
the written STYLE_GUIDE canon, not the shipped terracotta landing palette (confirmed with the
user); the landing/explorer are left as-is and retrofitted later.

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

## Phase 1 — Company core (backend ready; highest leverage)

The payoff of the normalized data, all backed by shipped endpoints.

- [ ] **Company hub / profile** *(ready)* — tabbed shell for one symbol: Fundamentals ·
      Statements · Insiders · Ownership. Resolves the symbol once; each tab is a Phase 1/2 page.
- [ ] **Company Fundamentals** *(ready — designed)* — the metric cards page. Consumes
      **`GET /v1/companies/{symbol}/metrics?year=&period=`**. Each card = name + status chip +
      big value + basis tag + provenance; sparkline placeholder until Phase 1b history lands.
      **Highest-leverage first build**: backend just shipped (`normalize/metrics.py`,
      `MetricValue`), and it's already a reference design. `MetricValue.status`/`basis`/`reason`/
      `as_of` map 1:1 onto §7/§8 — no invented precision.
- [ ] **Statements viewer** *(ready)* — income / balance / cash flow with a period selector,
      cleaner than the raw Explorer. Consumes `GET /v1/companies/{symbol}/statements/{type}`
      and `GET /v1/companies/{symbol}/periods`. Show `source_tag` + `is_extension` (EXT badge).
- [ ] **Data coverage / quality** *(ready)* — CUSIP resolution rate + the coverage-floor
      disclosures as a first-class page, not a footnote. Consumes
      `GET /v1/cusip-resolution-stats`.

## Phase 2 — Ownership & flows (backend ready except 13D/G)

- [ ] **Insider trades** *(ready)* — Forms 3/4/5 timeline; surface joint-filer / cluster rows.
      Consumes `GET /v1/companies/{symbol}/insider-trades?limit=`.
- [ ] **Institutional ownership — issuer view** *(ready)* — "who holds this stock" + DERIVED
      buy/sell. Consumes `GET /v1/companies/{symbol}/institutional-holders` and
      `.../institutional-activity`. Must render the always-present caveats (derived-not-reported,
      long-only, ~45-day lag, empty-list ambiguity) — non-negotiable per CLAUDE.md.
- [ ] **Manager (13F filer) profile** *(ready)* — one manager's holdings + derived activity +
      co-filer roster. Consumes `GET /v1/managers/{manager_cik}/holdings` and `.../activity`.
- [ ] **Beneficial ownership (13D/13G)** *(blocked)* — 5%+ ownership, activist vs passive.
      Parsing is done (`fetch_beneficial_ownership`) but **has no endpoint** — build the page
      when the `GET /v1/companies/{symbol}/beneficial-ownership` route lands (open M2 item in
      `docs/ROADMAP.md`). Carry the structured-XML ~mid-2025 coverage floor.

## Phase 3 — Comparison & trends

- [ ] **Company Comparison** *(ready — designed)* — 2–3 company metric matrix, per-cell status,
      fiscal-calendar alignment surfaced. Consumes `/metrics` per company. Honors R10-style
      calendar alignment and the "descriptive, no winner" rule.
- [ ] **Metric trend / history** *(blocked)* — deeper per-metric trend than the card sparkline
      (streaks, CAGR, distance-from-peak). Blocked on Metrics **Phase 1b**
      (`GET /v1/companies/{symbol}/metrics/{metric}/history`, `docs/ROADMAP_METRICS.md`).
      "Compare trajectories" mode folds into Company Comparison once history exists.

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
| Insider trades | 2 | ready | `/insider-trades` |
| Institutional ownership (issuer) | 2 | ready | `/institutional-holders`, `/institutional-activity` |
| Manager (13F) profile | 2 | ready | `/managers/{cik}/holdings`, `/activity` |
| Beneficial ownership (13D/G) | 2 | blocked | *(endpoint pending — M2)* |
| Company Comparison | 3 | ready | `/metrics` ×N |
| Metric trend/history | 3 | blocked | *(Metrics Phase 1b)* |
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

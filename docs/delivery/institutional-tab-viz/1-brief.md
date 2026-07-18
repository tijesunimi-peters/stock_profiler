# Brief: institutional-tab visualization suite (company institutional tab)

**Role:** Product Manager → handoff to Principal Architect
**Task slug:** `institutional-tab-viz`
**Date:** 2026-07-18
**Status:** scoped; operator decisions captured below.

---

## Problem / user

**User:** a developer or analyst on a company page's **Institutional** tab, trying to
understand *institutional ownership* of one company from its 13F filers.

**Pain today:** the tab's headline chart is a single **"Top N by value"** ranked-bar +
composition strip. It answers "who holds the most, right now" and nothing else. It is a
**single-quarter snapshot** with **no time dimension**, **no geography**, **no
cross-holder structure**, and **no per-holder conviction** context. Three questions a
serious user actually asks go unanswered:

1. *Are the big institutions building or trimming this position over time?*
2. *Where are the filers holding this company based?*
3. *For which holders is this a high-conviction position vs a small bet, and which
   holders travel together (hold the same other names)?*

**How we'll know it's solved:** the tab offers four additional, honestly-labeled views
that each answer one of those questions from Track-1 structured SEC data, with every
documented 13F limitation surfaced (not hidden), and the existing Top-N chart retained.

---

## Scope

Four new visualizations on the **company** institutional tab (`api/static/`, the
issuer-centric holder view served by `GET /companies/{symbol}/institutional-holders`).
All four **augment** the existing Top-N-by-value chart — it stays (operator decision
2026-07-18); the new views are added as sections and/or a view toggle.

All four are sourced **only** from structured SEC data we already ingest or can ingest
from EDGAR (confirmed live 2026-07-18 — see "Data availability" below). **No HTML
scraping, no free-text, no LLM, no price/market data** (Track-1 guardrail).

Because the four differ sharply in cost and architectural placement, the architect
should treat them as **two phases** (recommendation, not a mandate):

### Phase 1 — live-servable, low/medium cost

**1. Quarter-over-quarter accumulation (stacked bar / stacked area)**
- X = quarters (`report_period`), oldest → newest. Y = **shares** of *this* issuer held.
- Series = top-K holders by latest shares + an "Other" band (reuse the existing
  top-1 / 2–5 / 6–N / Other banding philosophy in `app.js` `compositionBars`).
- Answers "are institutions accumulating or reducing over time."
- **Must plot shares, not value**, across quarters — the 13F `value` unit flipped from
  thousands-of-dollars to whole-dollars ~2023 (`sec/institutional.py` UNIT CAVEAT);
  a value series would be silently discontinuous. Shares are unit-stable.

**2. Filer-headquarters choropleth (US-state map + foreign bucket)**
- Unit = US **state** for domestic filers, a distinct **"Outside US"** tally for foreign
  filers (never dropped), and a **"Location unknown"** tally for unresolved addresses.
- Primary measure = **filer count** by state (unit-safe). Reported value MAY be a
  secondary measure but only **within a single quarter** (unit caveat).
- Source: `submissions.json` `addresses.business.stateOrCountry` (already fetched in
  `fetch_13f_snapshot`) or the 13F cover page `filingManager/address/stateOrCountry`
  (already fetched for the co-filer roster) — see Data availability.

### Phase 2 — cross-manager / cross-holder; analytical (batch) layer

**3. Per-holder conviction heatmap**
- Rows = holders of this issuer (top-K). Color = **this issuer's share of that holder's
  own total reported 13F book** (their portfolio weight in this name), i.e. "for whom is
  this a top position vs a rounding error." Optionally a rank-within-book column.
- Needs each holder's **total 13F book value** → a cross-manager aggregate, not a
  single-issuer point read.

**4. Co-holding network graph**
- Nodes = managers holding this company. Edges = **overlap in their *other* reported
  holdings** (e.g. shared-position count / Jaccard above a threshold).
- Needs every holder's full holdings → cross-manager; belongs in the **analytical/batch
  layer** (DuckDB inversion), served from a precomputed store, **never a live
  cross-manager scan** (guardrails 6 & 7).

### Out of scope (do not build)

- ❌ Any **"regional clusters of capital"** framing of the choropleth. The data is the
  **filer's registered business address**, not where the capital originates, not where
  the portfolio company operates. Title/label must say so.
- ❌ Any **investment-style classification** (momentum / value / growth) on the network —
  **EDGAR carries no style data.** No "herding," "pile-trading," or "momentum vs value
  funds" language anywhere.
- ❌ Presenting **derived** accumulation/reduction as **reported trades** (13F is a
  snapshot; deltas are derived by diffing — `normalize/flows.py`).
- ❌ Any "speculative" / "conviction score as verdict" framing on the heatmap — position
  size ≠ speculation; a weight is a position, not a judgment (consistent with the
  existing "no diversification score / no Herfindahl verdict" rule in `app.js` §5.2).
- ❌ Real-time/price data, HTML scraping, free-text, LLM summarization (Track-1).
- ❌ Removing or weakening the existing Top-N chart (operator chose augment).

---

## Acceptance criteria (what QA will check)

### Shared honesty criteria (ALL four)

- **AC-H1** Every view carries the standing 13F caveats already defined in
  `routes.py` (`_13F_CAVEATS` / `_ISSUER_CENTRIC_CAVEATS`): long positions in §13(f)
  securities only (no shorts/cash/non-US); ~45-day post-quarter lag → stale not current;
  and **"an empty/absent result does not confirm zero ownership — the quarter may not be
  ingested yet."**
- **AC-H2** **Empty / missing / non-positive states render `N/A` or an explicit
  "not reported / not yet ingested" label — never `0`, never a blank that reads as zero**
  (existing rule, `app.js` statTiles §7).
- **AC-H3** No view uses the forbidden framings in Out-of-scope (regional capital,
  momentum/value/herding, reported-trades, speculative/verdict).
- **AC-H4** Views render legibly in **both light and dark themes** and degrade to a clear
  empty-state message when there's no/thin data (single quarter, one holder, etc.),
  rather than a broken or misleading partial chart.

### 1. Accumulation stacked bar

- **AC-1a** Series values are **shares**, not dollar value; the axis/caption says so.
- **AC-1b** A holder **absent in a given quarter** is shown as a gap labelled
  "not reported / not ingested," **not** as a zero-height segment implying a full exit.
- **AC-1c** Caption states the quarter-over-quarter change is **derived from snapshot
  diffs**, not reported transactions, and carries the ~45-day lag.
- **AC-1d** With only one ingested quarter available, the view shows an honest
  single-quarter/empty state, not a misleading one-bar "trend."

### 2. Choropleth

- **AC-2a** Title/subtitle reads as **"reported business address of 13F filers holding
  {company}"** (or equivalent) — **not** "clusters of capital."
- **AC-2b** Foreign filers appear in a distinct **"Outside US"** tally and unresolved
  addresses in a **"Location unknown"** tally; **neither is silently dropped**.
- **AC-2c** Default measure is **filer count**; any value-based measure is confined to a
  **single quarter** and labelled with the reporting quarter.
- **AC-2d** US-state map boundaries are **vendored as static GeoJSON/TopoJSON** — no
  external network fetch (CSP / SEC-compliance: self-contained assets only).

### 3. Conviction heatmap

- **AC-3a** Cell magnitude = **this issuer's % of the holder's total reported 13F book**
  (portfolio weight), with the definition stated; **no "speculative" label**, no
  good/bad color semantics (position, not verdict — one-hue intensity, like `positionBar`).
- **AC-3b** A holder whose **total book is unavailable / not ingested** renders `N/A` for
  that row, not a fabricated weight.
- **AC-3c** Computed in the **analytical/batch layer**, served from a precomputed store —
  QA confirms no live cross-manager scan on the request path (guardrail 6).

### 4. Co-holding network

- **AC-4a** Edges are labelled/explained as **overlap in other reported holdings** as of a
  quarter-end snapshot — explicitly **not** coordinated or timed trading, and with **no**
  style labels.
- **AC-4b** Computed in the **analytical/batch layer**, served precomputed — no live
  cross-manager scan (guardrails 6 & 7).
- **AC-4c** Thin/empty overlap (few holders, no shared names) yields an honest empty state,
  not a misleading dense graph.

### Regression

- **AC-R1** The existing **Top-N-by-value chart, composition strip, and concentration
  tiles remain** on the company institutional tab and on the manager tab (shared
  component untouched or safely extended).
- **AC-R2** `pytest` green; Docker e2e headless render check green.

---

## Data availability (verified live 2026-07-18, compliant User-Agent)

- **Manager location — CONFIRMED present.** `submissions.json` →
  `addresses.business.{street1,city,stateOrCountry,zipCode,isForeignLocation}` (Berkshire:
  `stateOrCountry: "NE"`). The 13F cover page `primary_doc.xml` `filingManager/address`
  carries the same `stateOrCountry`. **Both documents are already fetched today** — the
  address just isn't parsed/stored. Granularity: US state (domestic), country (foreign,
  `isForeignLocation` flag).
- **Co-holding & conviction inputs** exist (every manager's full 13F holdings) but are
  **cross-manager** — the analytical/batch inversion the architecture reserves for DuckDB,
  not the live issuer-point-read path.
- **Multi-quarter issuer holder history:** the current
  `/companies/{symbol}/institutional-holders` endpoint is **single-period**
  (`holders_of(cusips, period)`). The accumulation bar and the network need **several
  ingested quarters**; coverage depends on how many quarters have been backfilled.

---

## Risks / open decisions (architect + operator)

1. **Coverage dependency (biggest risk to perceived quality).** Phase-1 accumulation and
   Phase-2 network are only as rich as the number of **quarters ingested** for the
   relevant managers. With sparse ingest they'll look thin. Architect: quantify current
   quarter coverage; operator may need to prioritize 13F backfill breadth/depth. This is a
   **data-coverage** call, not a rendering one.
2. **New store: manager location.** Choropleth needs `manager_cik → {state, country,
   is_foreign}` persisted (new small repository or a column on the holdings/manager store),
   populated from the cover page or submissions addresses. Architect to place it behind an
   interface (guardrail 5) and decide backfill vs on-read.
3. **Phase-2 cost & placement.** Conviction heatmap + co-holding network both require a
   cross-manager precompute in the analytical layer (guardrails 6 & 7). Recommend shipping
   **Phase 1 first** (accumulation + choropleth: cheaper, live-servable) and treating
   Phase 2 as a follow-on with its own architect pass. Operator to confirm phasing vs
   all-at-once.
4. **Choropleth measure.** Filer count (unit-safe) is the recommended default; confirm
   whether a single-quarter value-weighted measure is also wanted.
5. **Charting/geo capability.** Confirm the current chart stack (Observable Plot in
   `app.js`) covers a choropleth + a force-directed network, or whether a vendored
   addition is needed — must stay self-contained (no external CDN/fetch; CSP).
6. **Public-facing copy** on any of these views (titles, captions, tooltips) is
   marketing-adjacent — load `.claude/skills/marketing-guardrails` before finalizing
   labels, since the honest-titling requirements (AC-2a, AC-3a, AC-4a) are the whole point.

---

## Handoff → Principal Architect

Design against the acceptance criteria above. Key asks:

- Propose the **Phase 1 / Phase 2 split** (or justify doing all four at once), respecting
  guardrails 6 & 7 (DuckDB/analytical is batch-only, never on the live request path).
- Specify the **manager-location store** (interface + population path) for the choropleth.
- Specify how **multi-quarter issuer holder history** is served (new/extended endpoint) for
  the accumulation bar, and quantify current quarter coverage.
- Specify the **cross-manager precompute** feeding the conviction heatmap and co-holding
  network, and where it's stored/served from.
- Confirm the **charting stack** can render choropleth + network self-contained (CSP), or
  name the vendored addition.
- Keep the existing Top-N shared component intact (AC-R1).

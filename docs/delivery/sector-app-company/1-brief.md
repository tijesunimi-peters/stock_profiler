# Brief — Sector Analytics app: Company view (Phase 2)

Stage 1 (Product Manager) handoff. Task slug: `sector-app-company`.
Parent plan: `docs/REDESIGN_SECTOR_APP.md`. Reference: `docs/design/sector-app-prototype/` §5/§7.
**Full-stack** (new read endpoint first, then the frontend in the `/sector-analytics` app).
Continues the app; Phase 1 (Sector view) is committed on `sector-app-shell` (`3e4bfc6`).

## Problem / user

The app (Phase 1) answers "how is this sector doing?" Phase 2 adds altitude 2 — **"where does one
filer sit inside its peer distribution?"** The **user** is the analyst who has a company in mind;
success = they search a ticker, land on that filer placed inside its SIC-peer distribution for each
of several metrics (a **dot cloud** — each peer a dot, the focal filer a diamond), can read its
percentile rail + composite rank, and can **click any peer dot to re-focus** on that filer — all on
real Track-1 data, no good/bad coloring.

## Scope gate (Track 1)

**PASS.** The new endpoint is a plain **read** over the materialized `metric_values` +
`company_profiles` (structured financial metrics) — no free text, no new data model, no market data.
Cache-aside, DB behind a repo, no raw SQL in the API, no DuckDB on the request path.

## Scope

1. **Backend — new read endpoint** (the dot-cloud data gap): return **each company's value** for a
   **sector + metric + period**, so the frontend can plot a dot per filer. Suggested
   `GET /v1/sectors/{group}/{metric}/companies?year=&period=` (architect finalizes shape — one
   metric per call is fine). Per company: `cik`, `value` (raw reported unit), `percentile` (from
   `metric_ranks`), and a **display label** (name/ticker — see R1). **N/A · N/M companies excluded**
   (never 0). Honest empty when the group is below the min peer-group size or has no values.
   - Cache-aside read via a **repository interface** (a new method joining `metric_values` ⨝
     `company_profiles` on SIC prefix, SQL in storage only). No DuckDB, no raw SQL in `routes.py`.
2. **Frontend — Company view** in `sectorapp.js` (per prototype altitude 2), **search-driven**:
   - Wire the header **⌘K search** (currently a stub) to resolve a ticker → company → its SIC peer
     group (reuse the existing suggest / ticker-resolution). Until a company is picked, the Company
     view shows an **honest empty state** ("Search a ticker to place it inside its peers").
   - **Left percentile rail** — the focal company's percentile per theme (or per metric — R2) from
     `/v1/companies/{symbol}/peers`, favorability-adjusted; a **composite rank card**.
   - **Main: per-metric dot-plot distributions** — for each metric in the chosen set (R3): an **IQR
     band** + **median tick** (from `/peers/{metric}/distribution` or the new endpoint), a **dot per
     peer filer** at its value (neutral), and the **focal filer as a terracotta rotate-45 diamond**.
     **Click any peer dot → set `focalTicker`** and recompute the rail, rank, and every diamond.
   - `focalTicker` **persists across view switches** (the state store already carries it).
3. **Fixture** — seed **per-company `metric_values` + SIC** for at least one group so the dot-cloud +
   a searchable focal company render in the e2e (architect/engineer size it).

## Out of scope (this phase)

- **Compare view** (Phase 3), **Qualitative** (Phase 4).
- Company **fundamentals/statements** (those live on the existing `/company/{symbol}` hub — the app's
  Company view is the peer-distribution altitude only).
- Any new **materialized metric** or **canonical concept** — reuse the shipped metric set.
- Favorability **color** — direction is text marker + position only.

## Acceptance criteria (what QA will verify)

**Backend endpoint**
- AC-1 `GET /v1/sectors/{group}/{metric}/companies` returns a list of `{cik, value, percentile,
  <label>}` for the group's companies with a value for that metric/period; **N/A · N/M companies are
  absent** (never a 0-valued row).
- AC-2 A group **below the min peer-group size**, or a metric with **no values**, returns an
  **honest empty** list (200, empty), consistent with `/peers` conventions — never fabricated rows.
- AC-3 An **unknown metric** → 404 (like `/peers/{metric}/distribution`); values are in **raw
  reported units** with the metric's unit available.
- AC-4 The endpoint is a **cache-aside read** via a repository (no DuckDB, **no raw SQL in
  `routes.py`**, DB behind the interface). `pytest` covers the per-company list, N/A exclusion,
  empty/below-min, and unknown-metric paths.

**Frontend Company view**
- AC-5 With **no company picked**, the Company view is an honest empty state prompting a search.
- AC-6 **Searching a ticker** resolves the company and renders its Company view: the left rail
  (percentiles + composite rank) + the per-metric dot-plots for its SIC peer group.
- AC-7 Each dot-plot shows an **IQR band + median tick**, a **dot per peer** at its value, and the
  **focal filer as a diamond**; the focal marker's position matches its value.
- AC-8 **Clicking a peer dot** re-focuses (`focalTicker` updates); the rail, rank card, and all
  diamonds recompute for the new filer.
- AC-9 `focalTicker` **persists** across view switches (go Company → Sector → Company: same focal).

**Honesty (the brand)**
- AC-10 **No favorability color** anywhere — dots/bars are neutral, the focal diamond is the single
  accent; "lower is better" metrics carry a **text marker**, not a flipped/colored fill.
- AC-11 Percentiles are **favorability-adjusted** (inverted for lower-is-better) and **exclude
  N/A · N/M** filers; **N/A is never rendered as 0**; a metric with no distribution shows an honest
  empty row, not a broken/zero plot.
- AC-12 Dots are **real filers** (Track 1); the caption states "each dot a filer · band = IQR · line
  = median · ◆ = <focal>" and the favorability-adjusted / exclusion note.

**Platform**
- AC-13 CSP-safe (still no CDN/Tailwind/React); mobile 390px reflow (rail + dot-plots) with no
  overflow; theme tokens only.
- AC-14 `docker compose build api` → e2e headless check passes (screenshots eyeballed: empty state,
  populated dot-plots with focal diamond, a dot-click re-focus, mobile) + `pytest` green.

## Risks / open decisions (for the architect)

- **R1 — per-cik display label.** The dot-cloud needs a label per filer (for the tooltip + to set
  `focalTicker` on click). `company_profiles` is `cik→SIC` (check whether it carries a name);
  ticker resolution is `ticker→cik` (forward). Architect: return `cik` + best-available label
  (name if stored; else a cik-derived label), and decide whether the focal identity is a ticker or a
  cik in the state. **Don't fabricate tickers.**
- **R2 — per-theme percentile rail.** There are **no per-company theme scores** (theme scores are
  per-sector). Options: (a) derive a per-company theme percentile = **average of its constituent
  metrics' favorability-adjusted percentiles** (from `/peers` + `normalize/themes.py`), labeled as
  derived; or (b) show the **per-metric** percentiles instead. Architect chooses; label honestly.
- **R3 — metric set.** Pick the dot-plot metrics from the **materialized** metrics that have both
  `metric_values` and a distribution (e.g. net_margin, revenue_growth_yoy, roe, roa, debt_to_equity,
  fcf_margin, inventory_turnover, current_ratio) — **not** the prototype's exact list (no
  `effective_tax_rate` / `net_debt/EBITDA` metric exists). Carry each metric's `higher_is_better`
  (from `METRIC_DIRECTION`) for the percentile inversion + the "lower is better" marker.
- **R4 — fixture.** Seed per-company `metric_values` for a group + a resolvable focal ticker + SIC so
  the e2e can render a populated dot-cloud and exercise the search + dot-click.
- **R5 — endpoint shape.** One metric per call (simple, cache-friendly, ~6–8 calls per view) vs a
  batch endpoint. Architect decides; one-per-call is the default recommendation.

## Handoff → Principal Architect

Full-stack: `senior-backend-engineer` for the endpoint + repo method + tests (JSON contract), then
`senior-frontend-engineer` for the Company view in `sectorapp.js` + the fixture + e2e, on the same
branch. Resolve R1–R5. Map every AC to a concrete check.

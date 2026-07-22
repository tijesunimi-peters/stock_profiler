# Brief — Composite sector theme scores (Phase 0 of the sector-overview redesign)

Stage 1 (Product Manager) handoff. Task slug: `sector-theme-scores`.
Parent plan: `docs/REDESIGN_SECTOR_OVERVIEW.md` (Phase 0, the gating deliverable).
Design authority: `docs/layout_guides/00-global-conventions.md` §5, §9, §9a.

## Problem / user

The sector-overview redesign's hero is a seven-theme 0–100 **composite health scorecard**
(`layout_guides/01`). It cannot be built until a scoring model exists, and the guide forbids
inventing one silently (`00 §9`). The **user** is the redesigned `/sectors` page (and, later,
the company drill-down's percentile rail) — they need a materialized, cache-aside source of
per-sector theme scores + ranks + decomposition to render against. No such data or endpoint
exists today.

This is **Phase 0 = data + API only.** No UI. The scorecard tiles, peer strip, and
decomposition panel are Phase 2/3 and consume what this phase produces.

## Scope gate (Track 1)

**PASS — Track 1.** Pure structured-financial aggregation over already-materialized metrics
(`metric_distributions`), computed offline in a DuckDB-over-SQLite batch and served cache-aside.
No free text, no LLM, no market/price data, no new base dependency. The two themes that *would*
need Track-2 / filing-event data (Accounting quality, Structure & activity) are **explicitly
deferred**, not built — consistent with CLAUDE.md guardrail 1.

## Scope (smallest valuable slice)

1. **A per-metric direction map** (`higherIsBetter`, per `00 §5`) — **new; none exists in the
   codebase today** (verified). Required to orient every z-score. Stored with the metric
   definition so all downstream pages inherit it (guide §5). See open decision D1 for the
   proposed map.
2. **A `sector_theme_scores` materialized table** keyed by `(peer_group, fiscal_year,
   fiscal_period, theme)`, holding: composite score (0–100), the theme's cross-sector rank +
   rank-of-N, prior-FY trend delta, and enough per-constituent detail to render the `00 §9a`
   decomposition (each constituent's oriented z-score contribution).
3. **A DuckDB-over-SQLite batch** (`analytical/sector_theme_scores.py`) mirroring
   `analytical/peer_ranks.py` / `peer_distribution.py`: reads sector medians from
   `metric_distributions`, orients by the direction map, z-scores each metric's medians **across
   qualifying sectors**, equal-weight-averages a theme's oriented constituent z-scores, maps to
   0–100, ranks sectors, computes the prior-FY delta. **Never on the live request path**
   (guardrails 6/7).
4. **A cache-aside `GET /v1/sectors/theme-scores` endpoint** reading the materialized table
   (no DuckDB, no aggregation on the route). Returns, per sector present for the period, the five
   live theme scores with rank + delta + decomposition, plus the two deferred themes marked
   `scored: false` (never a fabricated 0). Honest empty when nothing is materialized.
5. **Caveats** — reuse `_PEER_CAVEATS` / `_SECTOR_CAVEATS` vocabulary verbatim, plus a line
   naming the normalization (equal-weight constituents, z-score of per-sector medians) and a line
   that the two deferred themes are not yet scored.

### The five live themes and their constituents (from the parent plan's mapping)

| Theme | Constituents (materialized metric keys) |
|---|---|
| Profitability & returns | gross_margin, operating_margin, net_margin, roa, roe, roic |
| Growth | revenue_growth_yoy, earnings_growth_yoy, ocf_growth_yoy, growth_acceleration |
| Financial health | debt_to_equity, net_debt, interest_coverage, current_ratio, quick_ratio |
| Cash & investment | fcf_margin, ocf_growth_yoy *(fcf is a $ level — see D3)* |
| Operating efficiency | inventory_turnover, dso, dio, dpo, ccc, asset_turnover |

## Out of scope (this phase)

- **Any UI** — scorecard tiles, peer strip, decomposition panel, page shell (Phases 1–3).
- **Accounting quality & Structure & activity themes** — deferred; emitted only as
  `scored: false` markers so the UI can render "not yet scored" tiles.
- **Sub-industry (SIC-4) scores** — SIC-2 only this phase (matches `metric_distributions`).
- **Filing-coverage % / same-store trend basis** (`00 §6`) — not tracked yet; deferred.
- **Weight tuning UI / custom weights** — equal weight only, hard-coded as the labeled default.
- **New raw SEC concepts / new company metrics** — reuse the 30 materialized metrics as-is.

## Acceptance criteria (what QA will verify)

**Correctness of the model**
- AC-1 For each `(sector, period, theme)` with enough data, `score` is in **[0, 100]** and is the
  equal-weight average of the theme's **oriented** constituent z-scores mapped to 0–100 by the
  method chosen in D2 — reproducible by hand from `metric_distributions` medians on a spot check.
- AC-2 **Orientation is correct:** for a lower-is-better constituent (e.g. debt_to_equity, ccc),
  a sector with a *lower* median contributes a *higher* (more favorable) oriented z-score than a
  sector with a higher median. Verified on a real spot check for at least one inverted metric.
- AC-3 **Rank badge:** each live theme carries the sector's rank and the count of ranked sectors
  (`rank`, `rank_of`), ordered by favorability (most-favorable = rank 1). Ranks are dense and
  consistent with the scores.
- AC-4 **Trend delta:** `delta_vs_prior_fy` = this period's composite minus the same sector+theme
  composite for the prior FY, or **null** when no prior-FY composite exists (never 0-as-missing);
  the basis is labeled.
- AC-5 **Decomposition (`00 §9a`):** every live theme score exposes its constituents with, per
  constituent, the metric key/label, the sector median value, and its **oriented z-score
  contribution** this period — sufficient for the UI to show "which input moved the composite".
  The one-line normalization method is present.

**Honesty (the brand — non-negotiable)**
- AC-6 **N/A is never 0.** A constituent with no distribution for the sector+period is excluded
  from the average (and its decomposition entry marks it excluded), never counted as 0. A theme
  with fewer than the D4 minimum of available constituents is emitted as `scored: false`, not a
  low score.
- AC-7 **The two deferred themes** (Accounting quality, Structure & activity) appear in the
  payload with `scored: false` and a reason, never a fabricated score.
- AC-8 **Below-min-size sectors are absent, never zero-filled** (they aren't in
  `metric_distributions` to begin with — `secfin_peer_min_size = 5`).
- AC-9 Response carries the `_PEER_CAVEATS`/`_SECTOR_CAVEATS` vocabulary plus the normalization
  label and the deferred-themes note. Empty `sectors`/`themes` is a valid honest result.
- AC-10 **No good/bad claim beyond favorability.** Scores are descriptive positions; the payload
  states the normalization and does not assert a sector is "good"/"a buy"/etc. (see risk R2).

**Architecture / compliance**
- AC-11 **DuckDB never on the live path.** The endpoint reads the materialized SQLite table via a
  repository; the DuckDB batch is a separate offline module. No raw SQL in the API layer
  (guardrail 5); DB behind an interface.
- AC-12 The direction map lives with the metric definitions (single source of truth), and every
  metric used in a theme has an entry; a metric with no direction fails loudly rather than
  defaulting silently.
- AC-13 `pytest` green (new unit tests for orientation, z-score, 0–100 mapping, N/A exclusion,
  rank, prior-FY delta null-path, and the endpoint contract). Docker e2e unaffected (no UI).
- AC-14 **Real-data verify** on a hydrated Docker volume: the batch materializes rows for the
  latest well-covered FY across the sectors present in `metric_distributions`; Profitability /
  Growth / Operating efficiency populate broadly, **Financial health is legitimately sparse**
  (granular-ratio coverage — honest, not a bug), and a hand spot-check of one sector's one theme
  reproduces the stored score.
- AC-15 Docs updated: `DATA_MODEL.md` (the new table + direction map + normalization),
  `ROADMAP_SECTOR_ANALYTICS.md` / `REDESIGN_SECTOR_OVERVIEW.md` status, CLAUDE.md repo-layout
  lines for the new module/table if warranted.

## Risks / open decisions (for the architect; D1 also wants an operator nod)

- **D1 — the direction map (`higherIsBetter`) — honesty-critical, confirm the defaults.**
  None exists today. Proposed defaults:
  - *Higher is better:* all margins, roa, roe, roic, revenue/earnings/ocf growth,
    growth_acceleration, interest_coverage, current_ratio, quick_ratio, asset_turnover,
    inventory_turnover, fcf, fcf_margin.
  - *Lower is better:* debt_to_equity, net_debt, ccc, dso, dpo, accruals.
  These are conventional; the architect may proceed on them, but flag any the operator should
  sanity-check (e.g. growth_acceleration and net_debt are the only non-obvious ones).
- **D2 — z-score → 0–100 mapping method.** The plan says "map to 0–100" without fixing the
  transform. Architect to choose and **label it** (candidates: percentile-of-z across the
  sector set = bounded/interpretable/robust to outliers; or a linear clamp of z at ±3σ).
  Recommend percentile-of-z for interpretability. Whatever is chosen, the endpoint states it.
- **D3 — Cash & investment is thin (only fcf_margin + ocf_growth_yoy as ratios).** `fcf` is a
  dollar level, not comparable cross-sector as a raw z of medians without scaling. Options:
  score the theme on the 2 available ratios (honest, thin), or defer Cash & investment too until
  a capex/R&D-intensity or FCF-conversion *ratio* metric exists. Architect to decide;
  recommend scoring on the 2 ratios with the thin-constituent caveat rather than deferring a
  third theme.
- **D4 — minimum constituents to score a theme, and minimum sectors to z-score a metric.**
  Propose: a theme needs ≥ half its constituents available (and ≥2) to be `scored`, else
  `scored: false`; a metric needs ≥ D-min sectors present in `metric_distributions` to z-score
  (else that constituent is excluded). Architect to set the exact thresholds.
- **R1 — coverage.** Real data lives in the backup; build/verify needs a **hydrated Docker
  volume** (no local pip/venv — Docker per `docs/DEVELOPMENT.md`). The batch and table are a
  **deferred DevOps step** on the prod volume, like the other sector-analytics batches.
- **R2 — positioning tension (downstream, Phase 2).** Today's sector page deliberately uses
  **no good/bad coloring, no "winner"** (`sectors.js` header). The guide's favorability coloring
  (§5) will introduce that in the UI phase. Out of scope here, but the endpoint should expose
  *direction/orientation* (not color) so Phase 2 can honor both the guide and the honesty posture
  deliberately. Flagged for the Phase 2 brief, not this one.

## Handoff → Principal Architect

Design the table schema, the direction-map location (with the metric definitions), the DuckDB
batch (clone the `sector_dupont` / `peer_distribution` scaffold), the repository interface + SQLite
impl, and the cache-aside endpoint + response schema. Resolve D2/D3/D4 (and confirm D1's defaults);
map every AC to a concrete check. Full-stack? **No — backend-only this phase.**

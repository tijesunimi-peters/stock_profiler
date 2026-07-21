# 1 — Product Brief: Box-and-Whisker Liquidity/Solvency Spreads on the Sector Page

**Task slug:** `sector-box-whisker-spreads`
**Source:** `docs/ROADMAP_SECTOR_ANALYTICS.md` → *Deliverable #3* (box-and-whisker
liquidity/solvency spreads; listed there as **~80% built**)
**Stage:** Product Manager (1 of 4) → Principal Architect
**Scope gate:** **PASS** — squarely Track 1 (structured balance-sheet / income facts already
materialized as metrics; per-SIC distribution aggregation). No free text, no LLM, no market-price
data, no new base dependency. The five-number-summary batch (`analytical/peer_distribution.py`),
the `metric_distributions` table + repository, and the company-anchored distribution endpoint
(`/companies/{symbol}/peers/{metric}/distribution`) **already exist** — this deliverable reuses
them and adds a *sector-first* surface (per guardrails 6/7: DuckDB aggregation stays offline;
the API serves cache-aside from the materialized table).

---

## Problem / user

Deliverable 1 shipped a **sector-first overview** (`/sectors`) with an asset-weighted DuPont
grid, per-sector DuPont tree, and a 1Y/5Y/All trend. It answers "how do industries compare on
*profitability*." It says **nothing about liquidity or solvency** — and it can't, because DuPont
is a single-aggregate number per sector, which hides the *dispersion* within an industry.

Meanwhile the machinery for dispersion already exists but is unused at the sector level:
`analytical/peer_distribution.py` computes a five-number summary (min / p25 / median / p75 / max)
per `(SIC group, period, metric)` into `metric_distributions` — **but that table is empty (batch
never run) and the only consumer is the company-anchored endpoint.** There is no way to ask "how
tightly clustered is Machinery's current ratio, and how does that spread compare to Banks or
Utilities?"

**Who it serves:** analysts/developers evaluating the API who want to see, at a glance, how
liquidity and solvency are *distributed* across industries (not one company vs its peers), and to
drill into a single sector's dispersion. It also showcases that our data supports honest
distribution statistics, not just point aggregates.

**How we'd know it's solved:** the `/sectors` page gains (a) a **cross-sector box/whisker view** —
one liquidity/solvency metric at a time, one box per qualifying SIC-2 sector on a shared axis —
and (b) a **per-sector box/strip panel** in each expanded sector's detail, showing that sector's
five-number spread for each liquidity/solvency metric; the `metric_distributions` table is
populated by the existing batch; and every view carries the honesty caveats (spread/percentile is
POSITION not a verdict; N/A excluded never 0; SIC coarse/dated; min-size drop; ~quarter lag).

---

## Operator decision (locked this stage)

- **Ship BOTH framings** (operator: "Both"):
  1. **Cross-sector comparison** — a metric selector (the liquidity/solvency set); one box per
     qualifying SIC-2 sector on a shared axis, for a chosen period. Answers "compare the spread of
     *this* metric across all industries."
  2. **Per-sector drill-down** — inside each sector's existing expandable detail (next to the
     DuPont tree + trend), a box/strip panel showing that one sector's five-number summary for
     **each** liquidity/solvency metric.
  This is a wider slice than "add one viz," accepted deliberately.

---

## Scope (smallest slice that delivers the operator's "both")

### Data (no new metric, no new table)
- **Populate `metric_distributions`** by running the **existing** `analytical/peer_distribution.py`
  batch on the hydrated volume (`analytical` extra). No schema/repo change expected — the batch,
  table, and `MetricDistributionRow` already exist. (This is the roadmap's "run the batch" step.)
- **Liquidity/solvency metric set** = the four already-materialized ratios:
  `current_ratio`, `quick_ratio` (liquidity), `debt_to_equity`, `interest_coverage` (solvency).
  Architect to confirm this exact set is what's plotted (all four exist in `metrics.py` /
  `METRIC_KEYS`); if any is too sparse at the sector level to be honest, note and drop it rather
  than show empty boxes.

### API (read the materialized table cache-aside; NO live aggregation — guardrails 6/7)
- **Cross-sector endpoint** — for one metric + period, return every qualifying SIC-2 group's
  five-number summary (`peer_group`, `group_label`, `peer_count`, min/p25/median/p75/max),
  reading `metric_distributions`. Carries the caveats. (Feeds framing #1.)
- **Per-sector endpoint** — for one SIC group, return its five-number summary for **each**
  liquidity/solvency metric (+ `peer_count` per metric), reading `metric_distributions`. Carries
  the caveats. (Feeds framing #2.) *(Architect may instead extend the existing per-sector
  `/sectors/{group}` response — their call; the brief only requires the data reaches the UI
  cache-aside from the table.)*
- Both restrict the metric argument to the liquidity/solvency set (reuse the `METRIC_KEYS`
  validation + 404 pattern already in `get_peer_distribution`).

### UI (extend the existing `/sectors` page — do NOT create a new page)
- **Cross-sector box/whisker chart** with a **metric selector** (the four metrics) and honest
  period handling consistent with the existing grid (latest well-covered FY default). One box per
  qualifying sector on a shared axis; boxes sortable/orderable in a sensible, honest way (e.g. by
  median) — ordering is descriptive, not a ranking verdict.
- **Per-sector box/strip panel** in the existing expandable sector detail, one box/strip per
  liquidity/solvency metric for that sector.
- Reuse the vendored **Observable Plot** (already in `static/vendor/`), the shared app-shell
  components, theme-awareness, and CSP-safety. **No value ever rendered as `0` when N/A**; a
  sector/metric with no distribution (below min size, or unmaterialized) shows an explicit empty
  state, not a zero-height box.

### Honesty copy (reuse existing vocabulary)
- Reuse **`_PEER_CAVEATS`** (the roadmap names it explicitly) for the distribution views — it
  already states "percentile/position is not a verdict," "N/A excluded never counted as low,"
  "SIC coarse/dated," "min group size." Extend only if the box/whisker framing needs a distinct
  line (e.g. "a box shows the spread of reported values; a wide box means dispersed peers, not
  'bad'"). The DuPont grid keeps `_SECTOR_CAVEATS` as-is.

---

## Acceptance criteria (what QA will verify)

**Batch / data**
- **AC-1** Running `python -m secfin.analytical.peer_distribution` on the hydrated volume
  populates `metric_distributions` with a non-trivial row count covering the four
  liquidity/solvency metrics across multiple SIC-2 groups and ≥1 period. (`repo.count()` > 0;
  spot-checked for the four metrics.)
- **AC-2** The batch remains **offline/analytical only** — the DuckDB import stays lazy inside
  `peer_distribution.py`; no live request handler runs the aggregation; the new endpoints read
  `metric_distributions` through the repository interface, cache-aside (guardrails 5/6/7).

**Cross-sector view**
- **AC-3** For a chosen liquidity/solvency metric + period, the API returns every **qualifying**
  SIC-2 group's five-number summary from `metric_distributions`; groups below min size are absent
  (not zero-filled). Only the four liquidity/solvency metrics are accepted (others → 404, matching
  the existing distribution endpoint's validation).
- **AC-4** The `/sectors` page renders a cross-sector box/whisker chart with a working metric
  selector across the four metrics; each box shows min/p25/median/p75/max for one sector; the
  chart is theme-aware and CSP-safe (vendored Plot only).

**Per-sector view**
- **AC-5** Expanding a sector shows a box/strip panel with that sector's five-number summary for
  each of the four liquidity/solvency metrics (or an explicit "not enough peers" empty state for a
  metric with no distribution — never a zero box).

**Honesty (non-negotiable — the roadmap's flagged rules)**
- **AC-6** Every distribution view carries the caveats, **reusing `_PEER_CAVEATS`**: SIC
  coarse/dated; groups below min size dropped; **N/A excluded, never counted as 0**; ~quarter
  reporting lag; and that **the spread/box shows POSITION/dispersion, NOT a good/bad verdict**
  (a wide box or a high value is not "worse").
- **AC-7** **No missing value renders as `0`** anywhere — a sector or metric with no distribution
  shows an explicit N/A/empty state with a reason, never a zero-height box, zero cell, or a box
  collapsed to the axis.
- **AC-8** **No alpha, timing, market-price, or "beats the market" claim** appears; ordering the
  boxes (e.g. by median) is presented as descriptive ordering, not a ranking of "good" sectors.
- **AC-9** `peer_count` (companies with a comparable, non-N/A value) is shown per box/sector so a
  small-but-qualifying group is transparent.

**Architecture / compliance**
- **AC-10** No raw SQL in the API layer; the new endpoints read via the
  `MetricDistributionRepository` interface (guardrail 5). DuckDB stays batch-only (guardrail 6/7).
- **AC-11** `pytest` green (new tests cover: the cross-sector endpoint incl. metric validation +
  qualifying-groups-only + empty-group honesty; the per-sector endpoint; N/A-exclusion carried
  through). Docker e2e headless render check green with the `/sectors` page rendering both the
  cross-sector chart and a per-sector box panel on real data (hydrated volume).

---

## Out of scope (do not build — deferred / flag)

- **The other deferred sector models** (roadmap #2 OCF-vs-NI scatter, #4 100% common-size DNA,
  #5 DIO/DSO/DPO lifecycle). Do **not** add `dio`/`dpo` metrics.
- **A new page or new sidebar entry** — this extends the existing `/sectors` page in place.
- **New metrics or a new distribution table** — the four ratios and `metric_distributions` already
  exist; if a metric is too sparse to be honest at sector level, drop it, don't invent data.
- **Re-plumbing the DuPont grid/tree/trend** from Deliverable 1 — leave it working as-is; only add
  the distribution views alongside it.
- **Any market-price / valuation / timing / alpha content**, and any Track-2 free-text or LLM
  summarization — if the design drifts there, STOP and flag.

---

## Risks / open decisions (for the Principal Architect)

1. **Metric set honesty** — confirm all four (`current_ratio`, `quick_ratio`, `debt_to_equity`,
   `interest_coverage`) have enough qualifying SIC-2 groups in `metric_distributions` after the
   batch to plot honestly. `interest_coverage` in particular may be sparse/skewed (many firms have
   little interest expense); if so, keep it but ensure empty groups show the honest empty state,
   or drop it from the selector with a note — do not fabricate.
2. **Endpoint shape** — cross-sector "all groups for one metric" is a genuinely new read shape not
   covered by the company-anchored endpoint; design it (path + params) consistent with `/sectors`
   naming. For per-sector, decide whether to add a dedicated endpoint or extend `/sectors/{group}`.
   Either is fine if it stays cache-aside off `metric_distributions` behind the repo interface.
3. **Extreme-value axis handling** — ratios like `debt_to_equity` and `interest_coverage` have
   long tails / negatives (negative equity, near-zero interest). The box must show the real
   min/max honestly; decide axis scaling (e.g. clip the *view* with a visible "outliers beyond
   axis" note, never clip the *data*) so one outlier doesn't flatten every box — but never
   misrepresent the reported five-number summary.
4. **Ordering** — sorting boxes by median is useful UX but must read as descriptive ordering, not a
   good/bad ranking (AC-8). Pin the copy.
5. **Verification substrate** — build/verify **requires a hydrated Docker volume** (real ~8.7K
   companies live in the 7.2G backup `data/backups/secfin-latest.db`; `data/secfin.db` is a stub).
   Host has no local pip/venv — all build/test via Docker; the batch needs the `analytical` extra.
   The e2e fixture may need a seeded `metric_distributions` (mirror how Deliverable 1 seeded
   `sector_dupont` via `_seed_sector_dupont`) so the offline e2e renders both charts.

---

## Handoff → Principal Architect

Design against the acceptance criteria above. Key shape: **run the existing distribution batch to
populate `metric_distributions` → two new cache-aside read endpoints over that table (cross-sector
= all groups for one metric; per-sector = all liquidity/solvency metrics for one group), both
behind `MetricDistributionRepository`, both carrying `_PEER_CAVEATS` → extend the existing
`/sectors` page with a metric-selectable cross-sector box/whisker chart and a per-sector box/strip
panel in the expand detail (vendored Observable Plot, theme-aware, CSP-safe, N/A never 0).**
Resolve decisions 1–4; keep the aggregation strictly off the live request path (guardrails 6/7)
and the DB behind the repository (guardrail 5). Full-stack: **backend first** (endpoints + pytest),
then **frontend** (both charts + e2e) on the same branch. **No new page, no new metric, no new
table** — reuse what Deliverable 1 and the peer-distribution scaffold already built.

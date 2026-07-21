# 1 — Product Brief: Sector Asset-Lifecycle Trends (DIO / DSO / DPO / CCC)

**Task slug:** `sector-lifecycle-trends`
**Source:** `docs/ROADMAP_SECTOR_ANALYTICS.md` — Deliverable #5 (the last of the five sector models)
**Stage:** 1 (Product Manager) → hand off to Principal Architect
**Date:** 2026-07-21
**Track:** 1 only (structured statement-derived metrics; no free text, no LLM, no price data)

---

## Problem / user

The `/sectors` dashboard already tells a sector's **profitability** story (DuPont, Deliverable 1)
and its **dispersion** story (box-whisker spreads, Deliverable 3). It says nothing about a sector's
**working-capital structure** — how long cash is tied up in inventory and receivables versus how
long it's financed by suppliers. That structure is a defining, industry-shaped fact (a grocer, a
software firm, and an aircraft maker have wildly different lifecycles), and it is fully derivable
from statements we already ingest.

**User:** a developer/analyst on the sector page who wants an at-a-glance, descriptive read of a
sector's cash-conversion structure and how it has drifted across fiscal years — without having to
pull per-company statements and compute the ratios themselves.

**How we'd know it's solved:** the sector page's expand-detail area shows a multi-line FY time
series of DIO, DSO, DPO and the derived CCC for a chosen sector, sourced from a precomputed
sector-aggregate table, carrying the standard honesty caveats — and the numbers light up at parity
with DSO across ~60 sectors on the re-ingested verification copy.

---

## What the data can honestly say (and what it can't)

- **Can:** report the sector-aggregate days-metrics as a **descriptive structural** figure derived
  from filed balance-sheet + income-statement dollars.
- **Cannot:** frame this as a timing signal, an edge, or alpha. The roadmap is explicit (honesty
  flag #2): the DIO/DSO/DPO number *is* management's own filed figure carrying the standard
  ~quarter reporting lag — there is no "weeks before management addresses it" information advantage.
  **The alpha claim is CUT.** No "beats the market" / "alpha" / "timing" / "cash trapped" / "paper
  profit" language anywhere in copy or docs.

---

## Scope (smallest slice that delivers value)

### Backend — metrics (`normalize/metrics.py`, `normalize/mapping.py` unchanged)
1. **New canonical metric `dio`** (Days Inventory Outstanding) = `inventory / cost_of_revenue × 365`.
   Mirror `_dso` exactly: `period_end`-anchored, TTM flow / average-balance, `days` unit, TTM basis,
   `status + reason` contract. Use `ctx.avg("inventory")` and `ctx.ttm("cost_of_revenue")`; flag
   `approximate` with **`_INEXACT_AVG_REASON`** when the average falls back to a period-end balance.
   `na` when inventory or COGS is not reported; `na` when COGS is zero/near-zero.
2. **New canonical metric `dpo`** (Days Payable Outstanding) = `accounts_payable / cost_of_revenue ×
   365`. Same contract, using `ctx.avg("accounts_payable")` and `ctx.ttm("cost_of_revenue")`.
3. **Derived CCC** (Cash Conversion Cycle) = `DIO + DSO − DPO`. **N/A if ANY leg is N/A — a missing
   leg is NEVER treated as 0.** (Where CCC is surfaced — see the aggregate below — this rule holds.)
4. **No new raw concept.** `inventory`, `accounts_payable`, `cost_of_revenue`, `accounts_receivable`,
   `revenue` are already in `normalize/mapping.py`. Guardrail 3 (update mapping + DATA_MODEL) applies
   only to the **metric registry docs**, not the tag map — so: register `dio`/`dpo` in `_METRICS`,
   and document `dio`/`dpo`/`ccc` in `docs/DATA_MODEL.md` (and `docs/ROADMAP_METRICS.md` if it lists
   the metric catalogue).

### Backend — sector aggregate (reuse the Deliverable-1 scaffold, batch/offline only)
5. A **per-`(SIC group, period)` materialized sector aggregate** for the lifecycle metrics,
   following the **`dupont_backfill.py` → `analytical/sector_dupont.py` → `sector_dupont` repo →
   cache-aside route** pattern (DuckDB-over-SQLite `ATTACH`, **never the live request path** —
   guardrails 6/7). The honest sector aggregate is a **ratio of summed dollars** (not a median of
   ratios), mirroring DuPont:
   - `dio = Σinventory / Σcost_of_revenue × 365`
   - `dpo = Σaccounts_payable / Σcost_of_revenue × 365`
   - `dso = Σaccounts_receivable / Σrevenue × 365`
   - `ccc = dio + dso − dpo`
   A company enters a `(group, period)` sum **only if it contributed every leg it appears in**, so
   the sums share a consistent company set and CCC's identity cannot break on mismatched membership
   (same discipline as `dupont_components`). A group is shown only if it meets
   `settings.secfin_peer_min_size`.
6. **New API** (or extension of the existing `/v1/sectors/...` surface): a per-sector **FY series**
   of the four lifecycle lines, read **cache-aside from the materialized table** (no live
   aggregation). Also a cross-sector "latest FY" read if the architect finds it cheap and useful —
   but the FY series per sector is the required deliverable.

### Frontend (`static/`, sector page)
7. A **multi-line FY time series** (DIO / DSO / DPO / CCC) rendered in the **existing sector page
   expand-detail area**, consuming the new endpoint. Theme-aware, CSP-safe, vendored assets only.
   Honesty affordances carried (see AC). Reuses the existing sector-page scaffolding — no new page.

### Out of scope (do not build)
- Any per-company lifecycle view or company-page changes.
- Any market-price / valuation overlay, or a timing/backtest/signal framing.
- New raw concepts or mapping-table changes.
- The other deferred sector models (#2 OCF-vs-NI scatter, #4 common-size DNA).
- Prod-volume re-ingest / deploy — a **deferred DevOps step** (see Data note). This pipeline ends
  at green QA on a scratch hydrated copy.

---

## Acceptance criteria (what QA will verify)

**Metrics**
- **AC-1** `dio` and `dpo` are registered canonical metrics, returned by the metrics path for a
  company that reports the inputs, with `unit="days"`, `basis="TTM"`, and the same `status`
  vocabulary as `dso` (`ok`/`approximate`/`na`).
- **AC-2** When the balance leg falls back to a period-end value (no prior-period balance), `dio`
  and `dpo` are flagged **`approximate`** with reason `_INEXACT_AVG_REASON` — identical to `dso`.
- **AC-3** `dio`/`dpo` return **`na`** (with a reason) when their inputs are missing or COGS is
  zero/near-zero — never a fabricated 0.
- **AC-4** CCC is **N/A when any of DIO/DSO/DPO is N/A** — verified with a case where exactly one
  leg is missing; the result is N/A, not a value computed treating the missing leg as 0.

**Sector aggregate + API**
- **AC-5** A precomputed `(SIC group, period)` lifecycle aggregate exists, produced **only** by the
  offline DuckDB batch (never computed on the request path — verified: the route reads the
  materialized table, no DuckDB import on the live path).
- **AC-6** The per-sector endpoint returns an FY series of `{period, dio, dpo, dso, ccc,
  peer_count, ...}`, aggregates are **ratios of sums** (not median-of-ratios), and CCC in the
  payload equals `dio + dso − dpo` for each point where all legs are present (and is null/omitted,
  not 0, where a leg is absent).
- **AC-7** Groups below `secfin_peer_min_size` are **absent**, not shown as zero. A metric/period
  with no data is **omitted, never rendered as 0**.
- **AC-8** `pytest` is green (new unit tests cover `dio`/`dpo` ok/approximate/na, CCC N/A
  propagation, and the aggregate contract).

**Honesty / UI**
- **AC-9** The lifecycle view carries the standard sector caveats (SIC coarse/dated; below-min
  groups dropped; **aggregate, not a median**; **N/A excluded, never 0**; ~quarter reporting lag;
  restatements = latest `filed` wins), reusing the `_PEER_CAVEATS` / sector-aggregate vocabulary.
- **AC-10** **No alpha/timing/edge language** anywhere (copy, tooltips, docstrings, docs). The
  framing is explicitly **descriptive working-capital structure**.
- **AC-11** The **`approximate` flag is visible** in the UI wherever a line uses period-end balances
  (the same provenance affordance the rest of the sector/company UI uses).
- **AC-12** Frontend e2e: the Docker headless render check passes with the sector page + lifecycle
  detail rendering with **errors=0**; a missing/absent line is not drawn as a 0 baseline.
- **AC-13** Docs updated: `docs/DATA_MODEL.md` documents `dio`/`dpo`/`ccc` (formula, unit, the
  `approximate` flag, the CCC N/A-propagation rule); `docs/ROADMAP_SECTOR_ANALYTICS.md` marks
  Deliverable #5 done.

**Verification data**
- **AC-14** On a **scratch hydrated + re-ingested copy** (`data/backups/secfin-latest.db` →
  granular backfill), `dio`/`dpo`/`ccc` light up at **parity with `dso` across ~60 sectors**. (The
  live site stays sparse until the deferred prod re-ingest runs — that's expected and noted, not a
  failure of this task.)

---

## Risks / open decisions (for the Architect)

1. **Company-set membership for CCC.** DSO's denominator is revenue; DIO/DPO's is COGS. To keep the
   four lines and CCC coherent per `(group, period)`, decide whether a company must contribute **all
   five legs** (inventory, AP, AR, revenue, COGS) to enter the aggregate, or whether each ratio uses
   its own maximal company set and CCC is computed only where all three legs' company sets are
   present. **PM lean:** require all-legs membership per point (mirrors `dupont_components`
   discipline; keeps CCC an exact `Σ`-identity and the four lines mutually comparable). Architect to
   confirm and document the choice.
2. **New table vs. extend an existing one.** Whether to add a `sector_lifecycle` table + repo +
   backfill (parallel to `sector_dupont`), or fold lifecycle columns into an existing sector
   aggregate. Architect's call; the batch-only / cache-aside boundary is non-negotiable either way.
3. **Endpoint shape.** New `/v1/sectors/{group}/lifecycle` series route vs. extending the existing
   per-sector detail payload. Architect's call.

None of these is an operator-level fork (no pricing, no public claim, no scope trade-off) — they are
design decisions. **No `AskUserQuestion` needed at PM stage.**

---

## Scope gate

**PASS.** Track 1, structured statement metrics only. No free text, no LLM, no cross-company
screening ahead of milestone, no price/real-time data, no new base dependency, no weakened SEC
compliance, no new raw concept. The alpha claim is cut per the roadmap's honesty posture.

## Handoff → Principal Architect
Design the `dio`/`dpo` metrics + CCC derivation, the per-`(SIC group, period)` lifecycle aggregate
(reusing the `sector_dupont` batch/repo/cache-aside scaffold, DuckDB-over-SQLite, off the request
path), the FY-series endpoint, and the sector-page expand-detail multi-line chart. Turn each AC into
a concrete check and assign each file to a sub-specialty (backend first, then frontend). Resolve the
three open design decisions above and record them. Data verification is on the scratch re-ingested
copy; prod re-ingest stays a deferred DevOps step.

# 3 — Implementation · V3-P5a **phase 2**, the backend half

**Branch:** `v3-p5a-institutional` (continues from phase 1; the frontend continues on the same branch)
**Stage:** Senior Backend Engineer → Senior Frontend Engineer
**Status:** backend green and driven. **No `static/` file was touched.**

---

## What changed, and why it was mined rather than written

Attempt 3 built this backend, and the operator's revert was about the **design**, not the data — the
archive branch `v3-p5a-attempt3-archive` (`1429955`) carried it fully built and green. `_active.md`
says to mine it. I restored exactly the server-side files and left every `static/` file behind:

| file | |
|---|---|
| `src/secfin/normalize/register.py` | **new**, 488 lines — the moat for this view |
| `src/secfin/api/routes.py` | +3 routes, `_register_period_meta`, `_vector_payload` |
| `src/secfin/normalize/schema.py` | +12 |
| `src/secfin/storage/{insider,beneficial_ownership}_repository.py` + their SQLite impls | small read additions behind the existing interfaces |
| `src/secfin/storage/sqlite_holdings_repository.py` | +4 |
| `tests/test_register.py` · `tests/test_register_routes.py` | **new**, 37 tests |

Our branch had not touched a single backend file since `master`, so this grafted with no conflict.
One fix on top: a 105-char line in `register.py` (the repo's ruff limit is 100).

`register.py` is **pure** — no DB, no network, no clock. It takes already-read `IssuerHolder` rows
and returns models, so the moat is unit-testable without a fixture database, the same way
`flows.py` is.

---

## The JSON contract — what the frontend consumes

All three are `GET /v1/companies/{symbol}/…`, API-key gated, cache-aside over the operational store.
No DuckDB on the request path.

### 1. `institutional-register?period=YYYY-MM-DD` — one quarter's shape

```
cik · cusips · period
period_meta { as_of, filed_earliest, filed_latest, deadline, deadline_days,
              days_after_period_end, within_deadline, ingested_filer_count,
              amendment_count, age_days }
concentration { status, reason, formula, cannot, population,
                holder_count, hhi, effective_holders, gini,
                top1_share, top5_share, top10_share, managers_for_half }
share_vector[] { manager_cik, manager_name, shares, weight, cumulative }
share_vector_total_rows · excluded_holder_count · total_reported_shares · caveats[]
```

Feeds **§01**'s freshness strip and tiles, **§02**'s holders table, **§03**'s ranked-share chart,
cumulative curve, HHI / effective-holders / Lorenz card.

### 2. `institutional-register-shape?period=…` — across quarters

```
turnover       { status, reason, …, to_period, from_period, entrants, exits,
                 retained, prior_holder_count, turnover_pct }
tenure         { status, reason, …, quarters_observed, newest_period,
                 median_quarters_held, cohorts[], quarters_by_manager{} }
stable_capital { status, reason, …, weights[[q,w]], stable_share, quarters_observed }
```

Feeds **§03**'s stable-capital card and **§05** entirely (turnover, median holding period, the
tenure cohorts, the retention grid).

### 3. `institutional-filed-since?period=…` — what landed after the register closed

```
filings[] { form, filer, reported, percent_of_class, shares, shares_are, … }
filing_count · register_filed_latest · does_not_restate · does_not_restate_reason
dates_are · caveats[]
```

Feeds **§01**'s "Since the last 13F" card.

**Every derived block carries `status` · `reason` · `formula` · `cannot` · `population`.** `cannot`
is the half that stops a register statistic being read as a fact about the company — surface it,
don't drop it.

---

## ⚠️ What the backend CANNOT source — the port's literals with no data behind them

This is the important part of the handoff. Phase 1 rendered the prototype's sample values verbatim
under a NOT-REAL-DATA banner. Several of those have **no source in our data**, and phase 2 is not
done until each is either plumbed or honestly removed. **None of them may keep a literal.**

| the port renders | reality |
|---|---|
| §01 "Confirmed in last 30 days · 32%" | **We do not track filing confirmations.** No source. |
| §01 the adjusted register `767M + 9.7M = 776M` | Summing a 13D/G *total* + a Form 4 *transaction* + a 13F *holding* invents a share count nobody filed. Attempt 3 omitted it deliberately and the operator's Batch B passed on that reasoning. |
| §03 domicile (10 rows) | Needs `filing_manager_location`, which `ingest/location_backfill.py` populates — a **data job**, not an endpoint. Unrun volumes have it empty. |
| §03 peer matrix / set intersections | Needs a cross-issuer manager overlap. **No endpoint exists.** |
| §03 "Where every share sits" (insider / 13D / residual) | Needs shares-outstanding attribution across three filing families. Partly sourceable; the residual is a remainder, not a measurement. |
| §04 voting (Item 5.07, N-PX) | **Not ingested at all.** Out of Track-1 scope today. |
| §04 the 5%-filing lane chart | 13D/G *is* ingested; the per-filing amendment chain needs checking against what the repository actually stores. |
| §06 supply events, Form 144, 10b5-1, acceptance-lag histogram | **None ingested.** Form 144 and acceptance timestamps are V3-P3 (`items` + `acceptanceDateTime`). |
| §07 Reference glossary | Static copy — legitimately stays as written. |

**The rule from D-literals:** phase 2 is not done until no literal remains. Where there is no source,
the honest outcome is an **N/A / empty state with a reason**, or removing the block — never a
plausible-looking number. Several of these are big enough to be their own decision; raise them
rather than inventing.

---

## Verification

- **`pytest`: 609 passed, 9 skipped** in Docker (`docker compose --profile test run --rm test`),
  including the 37 restored register tests.
- **`ruff`**: `register.py` clean on `E501,F,I,UP`. The remaining findings across `routes.py`/`tests`
  are **pre-existing house style** — master already reports 134 of the same classes, overwhelmingly
  `B008` (FastAPI's `Query()`/`Depends()` in defaults, the idiom this file uses throughout).
- **Driven live**, not just tested, against the seeded fixture on `:8010`:
  - `institutional-register?period=2026-03-31` → HHI 2827.3, effective holders 3.54, Gini 0.476,
    `managers_for_half` 2, 7 ingested filers, full `formula`/`cannot`/`population` present.
  - `institutional-register-shape` → turnover 133.3% (4 entrants / 0 exits over a 3-holder prior
    quarter), tenure capped at the 4 ingested quarters **and it says so in `reason`**, stable share
    0.390 flagged as a floor.
  - `institutional-filed-since` → 4 filings, `does_not_restate: true` with its reason, and
    `dates_are` naming the V3-P3 gap (filing dates, not acceptance timestamps).
  - **Honesty paths.** A quarter with no ingested filers returns `status: "na"` with the reason
    *"…a concentration measure would describe our coverage rather than the register"*, and **every
    derived number `null`** — `hhi`, `effective_holders`, `managers_for_half` all null, not `0`.
    An unresolved issuer (WMT) returns **404 with an explanation**, not an empty register.

---

## Handoff → Senior Frontend Engineer

Continue on **this branch**. The three endpoints above are live and shaped as documented. Two things
to hold onto:

1. **Surface `status`/`reason`, don't just read the number.** Every derived block can come back
   `na`, and the reason is written to be shown. A `null` must render as the N/A vocabulary, never
   as `0` and never as a blank styled like a value.
2. **The gap table is the real work.** Wiring the three endpoints covers §01–§03 and §05. §04 and
   §06 are largely unsourced, and each needs a decision — plumb, empty-state, or remove — not a
   surviving literal.

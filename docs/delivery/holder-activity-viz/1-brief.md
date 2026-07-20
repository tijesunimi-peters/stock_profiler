# Brief: derived holder-activity visualizations (company Institutional tab)

**Role:** Product Manager → handoff to Principal Architect
**Task slug:** `holder-activity-viz`
**Date:** 2026-07-20
**Status:** scoped; operator decisions captured below.

---

## Problem / user

**User:** a developer or analyst on a company page's **Institutional** tab, looking at the
existing *Derived activity vs. prior quarter* section (`activitySection` in `company.js`,
sourced from `GET /companies/{symbol}/institutional-activity`).

**Pain today:** that section only ever shows **one** quarter-over-quarter diff — the most
recent quarter vs. its prior. It answers "who added/reduced/entered/exited last quarter"
but gives **no sense of the trend** ("is the count of accumulators rising or falling over
the past year and a half?") and **no aggregate read of net flow** ("did more shares enter
than leave last quarter?"). A reader has to eyeball a long per-position table to infer
either.

**How we'll know it's solved:** the tab gains two additional, honestly-labeled views that
sit alongside the existing activity section:
1. a **6-quarter trend** of how many holders fell into each action bucket
   (new / added / reduced / exited) each quarter; and
2. a compact **inflows-vs-outflows** read of the most recent quarter's net share flow.
Both are visibly DERIVED (13F diff), carry every documented 13F caveat, and never present
a computed delta as a reported trade.

---

## Scope

Two new visualizations on the **company** Institutional tab, added to (not replacing) the
existing single-quarter activity section. Both are built with **Observable Plot** (already
vendored at `api/static/vendor/plot.umd.min.js`) plus the existing `ClearyFi` Plot-helper
namespace in `app.js`. Both source **only** from structured 13F data we already ingest,
derived through the existing `normalize/flows.py` diff logic — no HTML scraping, no
free-text, no LLM, no price/market data (Track-1 guardrail).

### Viz 1 — Activity-mix stacked bar (6 quarters)

- **X** = the last **6 ingested quarters** (`report_period`), oldest → newest.
- **Y** = **count of (manager, position) pairs** classified into each action bucket that
  quarter, stacked: **new / added / reduced / exited**. (`unchanged` excluded — it is not
  "activity"; may optionally appear as a muted context band, architect's call, but is not
  required.)
- Each quarter's counts come from diffing that quarter's issuer holders against the prior
  quarter's, via `flows.diff_holders` — i.e. 5 or 6 diffs, one per adjacent pair, NOT one
  cumulative diff.
- **Measure is COUNTS, not value** — counts are unit-safe across the 2023 value-unit flip
  (thousands → whole dollars). Do not stack dollar value across quarters.
- Consistent action-color vocabulary with the existing activity section
  (`ACTION_LABEL`/diverging chart: new/added = accumulation hues, reduced/exited =
  distribution hues).

### Viz 2 — Inflows-vs-outflows flow view (latest quarter) — **Plot-native**

- **Operator decision (2026-07-20): Plot-native flow view, NOT a d3-sankey ribbon.** Build
  with Plot marks (paired `barX`/arrow marks) + existing d3 — **no new vendored dependency.**
- **Operator decision (2026-07-20): latest quarter only** — the single most-recent
  quarter-over-quarter transition (same `from_period → to_period` as the existing activity
  section), not a 6-quarter aggregate.
- **Inflow** = total shares entering = sum of positive `shares_change` across `new` + `added`
  positions. **Outflow** = total shares leaving = sum of the magnitude of negative
  `shares_change` across `reduced` + `exited` positions. **Net** = inflow − outflow = the
  net change in reported institutional share count this quarter.
- **Measure is SHARES, not value** — shares are unit-stable; value is not (do not sum value).
- Read as: one inflow bar, one opposing outflow bar, and an explicit net figure/marker.

---

## Out of scope

- **No new data ingested.** Both views derive from holders already reachable via
  `holdings_repo.holders_of` / `issuer_periods` (the same reads `institutional-activity`
  and `institutional-holdings-series` already use).
- **No d3-sankey / no new vendored asset** (operator chose Plot-native).
- **No dollar-value flows or value-stacked bars** (unit-flip hazard).
- **No manager-centric version** of these views in this task (this is the issuer/company
  tab only; a `/managers/...` equivalent is a possible later follow-up, not now).
- **No 6-quarter aggregate flow**, no cross-company comparison, no forecasting/trend-line
  fitting — just the two views as specified.
- Not Track 2: no narrative, no summarization.

---

## Acceptance criteria (what QA verifies)

**Data / correctness**
- **AC-1** The activity-mix stacked bar shows up to the **6 most recent ingested quarters**,
  oldest → newest. If fewer than 6 quarters exist for the issuer, it shows exactly the
  quarters that exist (never pads a missing quarter with a zero/blank bar presented as real).
- **AC-2** Each quarter's stacked segments are **counts of (manager, cusip) position pairs**
  per action bucket, derived by diffing that quarter vs. its immediately-prior quarter with
  the **same `flows.diff_holders` logic** the single-quarter section uses. A spot-check of
  one quarter's segment counts matches the counts you'd get from
  `GET /institutional-activity?period=<that quarter>` grouped by `action`.
- **AC-3** The buckets are exactly **new / added / reduced / exited** (accumulation vs.
  distribution). `unchanged` is not counted as activity.
- **AC-4** The flow view's **inflow** = Σ positive `shares_change` over new+added, **outflow**
  = Σ |negative `shares_change`| over reduced+exited, **net = inflow − outflow**, all in
  **shares**, for the latest `from_period → to_period` pair — and the net equals the change
  in total reported institutional shares implied by the same diff.
- **AC-5** No dollar **value** is summed or stacked across quarters in either view (shares /
  counts only).

**Honesty (brand-critical)**
- **AC-6** Both views are explicitly labeled **DERIVED** (e.g. title/subtitle "Derived …")
  and carry the standard 13F caveats already used on this tab (`_ISSUER_CENTRIC_CAVEATS`:
  derived-not-reported, long-only, ~45-day lag, empty ≠ zero ownership). No new endpoint may
  return derived counts/flows without these caveats.
- **AC-7** A missing/empty quarter is rendered honestly — an absent bar means "not
  reported/ingested that quarter," never a real zero; a holder with no prior-quarter data is
  treated as `new` (the existing `prior=None` convention), not silently dropped.
- **AC-8** If the issuer has **no** derived activity (e.g. only one ingested quarter, so no
  diff is possible), both views degrade to an honest empty state — a short explanatory line,
  **not** a blank or an all-zero chart implying "no activity happened."
- **AC-9** Nothing labels these as reported trades; the copy distinguishes "derived from
  quarter-end holdings snapshots" from transactions.

**Non-regression / build**
- **AC-10** The existing single-quarter activity section (tiles, diverging bars, dumbbell,
  detail table) still renders and is unchanged in behavior.
- **AC-11** Self-contained / CSP-safe (vendored Plot + d3 only, no external fetch), theme-aware
  (light + dark), and the Docker e2e headless render check passes with both new views mounting
  without console errors.
- **AC-12** If a new backend endpoint is added, it has `pytest` coverage (including the
  multi-quarter diff and the empty/one-quarter degenerate case) and keeps DB access behind the
  existing repository interface (no raw SQL in the API layer, no DuckDB on the request path).

---

## Risks / open decisions

- **Resolved (operator, 2026-07-20):** Viz 2 rendering = **Plot-native** (no d3-sankey);
  Viz 2 scope = **latest quarter only**. Both captured above.
- **Backend vs. client-side derivation (architect's call).** The 6-quarter counts and the
  latest-quarter flow can be derived (a) server-side in a new endpoint that reuses
  `flows.diff_holders` across adjacent quarters (keeps the derivation testable in one place,
  pytest-covered — favored for honesty/testability), or (b) client-side from the existing
  `institutional-holdings-series` payload. Architect decides; if (a), AC-12 applies. Either
  way the derivation must reuse `flows.diff_holders` semantics, not re-implement classification.
- **Data depth per ticker.** Some issuers may have < 6 ingested quarters; AC-1/AC-8 cover the
  honest degrade. Architect should confirm on a real ticker basket during design (the
  accumulation chart already relies on multi-quarter depth, so ≥ a few quarters is common).
- **Performance.** Up to 6 adjacent-quarter diffs per page load — each `holders_of` is a live
  indexed point read (same as the existing series endpoint). Should be cheap; architect to
  confirm it stays off the DuckDB path (guardrail 6).

---

## Handoff → Principal Architect

Design against the 12 acceptance criteria above. Key constraints: reuse `flows.diff_holders`
(don't re-implement action classification); **counts** for the stacked bar and **shares** for
the flow view (never value across quarters); Plot-native flow (no new vendored asset); both
views DERIVED-labeled with the standard 13F caveats; existing activity section untouched.
Decide backend-endpoint vs. client-side derivation and route the work to the right engineer
sub-specialty (likely full-stack if a new endpoint lands, else frontend-only).

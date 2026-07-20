# 3 — Implementation: Cash-flow visualizations

**Task slug:** `cashflow-viz`
**Branch:** `cashflow-viz` (stacked on `balance-sheet-viz`)
**Reads:** `1-brief.md`, `2-architecture.md`

---

## §3a — Backend (senior-backend-engineer) — DONE

### What shipped

- **`src/secfin/normalize/schema.py`** — 5 new models appended after `CashFlowSeries`'s
  predecessor `CapitalStructureSeries` (existing viz models untouched): `CashFlowBridgeStep`,
  `CashFlowBridge`, `CashFlowViz`, `CashFlowSeriesPeriod`, `CashFlowSeries`. Field lists per
  architecture B1.
- **`src/secfin/normalize/viz.py`** — cash-flow section appended after `capital_structure_series`,
  reusing `_lines_by_concept` / `_has_value` / `_value` / `_RESIDUAL_EPSILON`:
  - constants `_CASHFLOW_SECTIONS`, `_CASHFLOW_RESIDUAL_LABEL = "Other / unreconciled"`,
    `_CHANGE_TAG_TO_BASIS` (the two `change_in_cash` candidate tags → `cash_and_restricted_cash`
    / `cash_and_equivalents`), `_BASIS_REL_TOLERANCE`, `CASHFLOW_VIZ_CAVEATS`.
  - `cashflow_viz(cf_stmt, end_balance=None, begin_balance=None) -> CashFlowViz` — the Cash Bridge
    (pure). `_build_cashflow_bridge` does the honesty math.
  - `cashflow_series(cf_statements, income_statements) -> CashFlowSeries` — FCF + earnings-quality
    (pure). `_cashflow_series_period` does the per-period join + degrade rules.
- **`src/secfin/api/routes.py`** — imports for the 4 new symbols; `_prior_period_balance` helper;
  two public endpoints:
  - `GET /v1/companies/{symbol}/statements/cashflow/viz?year=&period=` → `CashFlowViz`
  - `GET /v1/companies/{symbol}/statements/cashflow/viz-series?period=FY&limit=6` → `CashFlowSeries`
  Both use `_facts_for_cik` (full history — the bridge needs the prior-period balance for
  Beginning Cash). Public router, no API key, mirroring the balance viz endpoints.
- **`tests/test_cashflow_viz.py`** — 21 tests (synthetic + real-fixture).

### JSON contract (for the frontend — §3b)

**`GET .../statements/cashflow/viz`** → `CashFlowViz`:
```
{ cik, fiscal_year, fiscal_period, period_start, period_end, form, filed, accession,
  bridge: {
    available: bool, unavailable_reason: str|null,
    steps: [ { kind: "anchor"|"flow"|"residual", canonical_concept: str|null, label,
               value(>=0 magnitude), direction: "base"|"up"|"down", running_total,
               unit, source_tag: str|null, is_extension: bool|null } ],
    absolute: bool,                # true => beginning/ending are real levels on the matched basis
    beginning_cash: num|null, ending_cash: num|null, reported_change: num|null,
    cash_basis: "cash_and_restricted_cash"|"cash_and_equivalents"|null,
    basis_note: str|null },        # set only when reported period-end level disagrees w/ begin+change
  caveats: [str] }
```
Step order is the walk: Beginning anchor → section flows (CFO/CFI/CFF/FX, nulls skipped) →
optional single residual "Other / unreconciled" → Ending anchor. When `absolute=false` the first
anchor is labelled **"Beginning (relative)"** (running_total 0) and the last **"Net change
(relative)"**; `beginning_cash`/`ending_cash` are null. Render direction from `direction` /
`running_total`, **never re-derive a sign**; residual = accent-wash + dashed (computed-not-reported).

**`GET .../statements/cashflow/viz-series`** → `CashFlowSeries`:
```
{ cik, fiscal_period, periods: [                          # OLDEST -> NEWEST
    { fiscal_year, fiscal_period, period_end,
      operating_cash_flow: num|null, capital_expenditures: num|null,
      free_cash_flow: num|null,                           # null unless BOTH ocf & capex present
      net_income: num|null,                               # from the income statement (cross-join)
      cash_conversion: num|null,                          # ocf/ni, else null
      conversion_status: "ok"|"nm"|"na", conversion_reason: str|null, unit } ],
  caveats: [str] }
```
Frontend rules: **null draws no bar / no point (gap), never 0.** FCF may be negative (draw below
zero). Suppress the conversion point where `conversion_status !== "ok"` (show reason on hover).
`cash_conversion` can be **negative** with a positive NI (negative OCF — a real earnings-quality
signal, e.g. JPM −2.59) — render it truthfully, it is "ok", not "nm".

### Honesty invariants enforced (with the failing test that guards each)

- Bridge's sole balancer = one "Other / unreconciled" residual = `reported_change − Σsections`
  — `test_bridge_single_residual_is_the_only_balancer`, `..._identity_no_residual...`.
- Beginning/Ending read on the basis matching `change_in_cash.source_tag`; **never** the wrong
  basis — `test_bridge_basis_modern...`, `..._legacy...`, `..._does_not_read_wrong_basis`.
- Relative-walk fallback, no fabricated level — `test_bridge_relative_walk_when_levels_absent`.
- Reported-end-vs-(begin+change) disagreement surfaces `basis_note`, walk still lands on the
  identity — `test_bridge_basis_note_when_reported_end_disagrees`.
- Null section skipped, missing change/sections → unavailable — `test_bridge_null_section...`,
  `..._unavailable_without_change_in_cash`, `..._without_any_section`.
- FCF = OCF−CapEx only when both present; bank (no capex) → None, not OCF; negative FCF kept —
  `test_series_fcf_*`.
- Conversion `ok`/`nm`(NI≤0)/`na`(null input), value None unless ok — `test_series_conversion_*`.
- Cross-statement join on `(fiscal_year, fiscal_period)`, no forward-fill — `test_series_cross...`,
  `..._never_forward_fills...`.

### Mock-first gate (operator standing rule [[feedback-viz-mock-before-build]]) — PASS

Ran the real AAPL / WMT / JPM companyfacts fixtures + the live seeded endpoints. **The bridge
reconciles exactly (residual = 0) on all three — the four sections sum to the reported net change
by identity — so no residual dominates.** Real numbers recorded:

| Filer | FY | CFO | CFI | CFF | FX | reported ΔCash | residual | basis (change tag) |
|-------|----|-----|-----|-----|----|---------------|----------|--------------------|
| AAPL | 2025 | +111.482B | +15.195B | −120.686B | — | **+5.991B** | **0** (no step) | cash_and_restricted_cash (modern) |
| WMT | 2026 | +41.565B | −26.350B | −13.553B | +0.123B | **+1.785B** | **0** (no step) | cash_and_restricted_cash (modern) |
| JPM | 2025 | −147.782B | −265.565B | +269.533B | +17.835B | **−125.979B** | **0** (no step) | cash_and_restricted_cash (modern) |

FCF / earnings-quality (latest FY):
- **AAPL**: OCF 111.482B − CapEx 12.715B = **FCF 98.767B**; NI 112.010B → conversion **0.995 (ok)**.
- **WMT**: OCF 41.565B − CapEx 26.642B = **FCF 14.923B**; NI 21.893B → conversion **1.90 (ok)**.
- **JPM (bank)**: OCF −147.782B, **no capex tag → FCF N/A** (correctly None, not = OCF); NI 57.048B
  → conversion **−2.59 (ok, negative — a real signal)**.

**Known fixture limitation (for QA):** the trimmed unit fixtures contain only ONE FY period each,
so no prior-period balance exists → the bridge renders the honest **relative walk** (`absolute=false`)
on fixture/e2e data. The **absolute** Beginning→Ending path (basis-matched levels) is exercised by
the synthetic unit tests and will engage on the full production DB (multi-year). **QA should drive
the `/statements/cashflow/viz` endpoint against a company with ≥2 FY of data in the live Docker
volume to confirm `absolute=true` and the matched-basis Beginning/Ending render.**

**Off-by-one fixed during the mock:** a cash-flow `period_start` is the day *after* the prior
balance's `period_end` (AAPL: start `2024-09-29` vs prior end `2024-09-28`), so an exact
`period_end == period_start` match never hits. `_prior_period_balance` now matches the prior
balance instant by date with a small tolerance (primary) — correct for both annual and YTD-quarterly
bridges — falling back to the immediately-prior same-type period only if no dated instant is close.

### Verification

- `docker compose --profile test run --rm test` → **452 passed, 6 skipped** (431 baseline + 21 new).
- Live seeded app (`docker compose --profile e2e up e2e-app`): `GET .../cashflow/viz` and
  `.../viz-series` return 200 with the shapes above for AAPL + WMT; numbers match the table;
  caveats present; residual absent (identity holds).

### Handoff → Senior Frontend Engineer (same branch)

Consume the two endpoints per §3b of `2-architecture.md`. Three renderers in `app.js`
(`cashFlowBridge`, `fcfBreakdown`, `earningsQuality`), wire `"cashflow"` into the Table/Chart toggle
gating + dispatch in `company.js` (`renderCashflowCharts`/`paintCashflowCharts`, `vizCache` keyed by
statement + `|series`), minimal `company.css`, extend `scripts/headless_check.js`. Honesty in the
renderers: null → gap never 0; residual = accent-wash+dashed; conversion point suppressed unless
`status==="ok"` (but a negative "ok" ratio renders); surface `cash_basis`/`basis_note` and the
relative-walk labels in the bridge card note.

---

## §3b — Frontend (senior-frontend-engineer) — DONE

### What shipped

- **`src/secfin/api/static/app.js`** — three thin Plot renderers appended after `balanceMatrix`,
  exported in the `window.ClearyFi` (`P`) object:
  - `cashFlowBridge(bridge, opts)` — the near-twin of `incomeBridge`: floating-bar waterfall,
    solid ink anchors (Beginning/Ending), terracotta section flows, the single residual as
    accent-wash + dashed (computed-not-reported). Honors `available===false`. The card note states
    the cash basis when `absolute`, or explains the **relative walk** when not; surfaces
    `basis_note`; the residual note fires only when a residual step exists. Tooltip carries the
    full section label, signed change, running total, and the source `gaap_tag`. `CASHFLOW_SHORT_LABEL`
    + `CASHFLOW_ANCHOR_SHORT` compress the (rotated) axis ticks — full label stays in the tooltip.
  - `fcfBreakdown(series, opts)` — grouped columns OCF / CapEx / FCF per period (oldest→newest).
  - `earningsQuality(series, opts)` — paired NI / OCF columns + a cash-conversion **line** on a
    right-hand secondary (×) axis with a dashed **1× reference** line.
- **`src/secfin/api/static/company.js`** — `"cashflow"` added to BOTH toggle-gating spots (the
  early-return that decides whether the Chart view exists, and the `wireStmtViewToggle` call);
  a `cashflow` branch in `renderStmtCharts`; `renderCashflowCharts` (fetches `viz` cached
  `"cashflow|"+y+"|"+p` + `viz-series` cached `"cashflow|series"`) and `paintCashflowCharts`
  (bridge → FCF → earnings-quality → caveat), mirroring the balance pair. `vizCache` keys include
  the statement so income/balance/cashflow never collide.
- **`scripts/headless_check.js`** — two cash-flow chart-view pages (AAPL, WMT) + the chart-toggle
  trigger extended to `statements-cashflow-chart*`.
- **`company.css`** — **no change needed.** The N/A / `nm` / secondary-axis markers are Plot text
  marks and all colors come from `plotTokens()` (CSS-var-backed), so the charts are already
  theme-aware with no new rules; adding dead CSS would be noise.

### The one bug the e2e caught + fix

First e2e run: `pageerror: missing channel value: x` on both cash-flow chart pages. The grouped-bar
charts used Plot **faceting** (`fx`) with `x: null` on the overlay/label marks — faceted plots
require an `x` on every mark, and a conversion **line can't connect across facets** anyway.
Rewrote `fcfBreakdown` and `earningsQuality` to a **single band scale over composite `period|metric`
keys** (grouped bars without faceting): overlay marks share the one x scale, so the conversion line
genuinely connects across periods, the FCF-N/A and `nm`/`na` text markers position correctly, and
period labels sit over each group. Second e2e run: **PASS, 0 console errors.**

### Honesty invariants in the UI (what QA re-checks)

- Null → **gap, never 0**: FCF-null period shows an explicit "FCF N/A" marker (not a 0 bar); a null
  OCF/NI/CapEx draws no bar; a `nm`/`na` conversion draws no point (its status shows, reason on
  hover). Verified on the AAPL/WMT single-period screenshots + the bank (JPM) path via the contract.
- **No green/red** encoding: single terracotta accent + ink/greys; the bridge encodes direction by
  where a bar **floats**, not hue; FCF/earnings use ink/ink-soft/accent by metric (legend-labelled).
- Residual = accent-wash + dashed (computed-not-reported).
- Relative-walk labels ("Beginning" / "Net change") + the basis note surface in the bridge card.
- Caveats rendered under the cards (the `viz.caveats` array). Theme-aware (plotTokens/CSS vars).

### Verification

- **e2e headless render: PASS, 0 console errors** on `statements-cashflow-chart` (AAPL) and
  `statements-cashflow-chart-wmt` (WMT). Command:
  `docker compose --profile e2e up --abort-on-container-exit --exit-code-from e2e`.
- **Eyeballed both screenshots** (`data/e2e-shots/statements-cashflow-chart*.png`):
  - AAPL bridge: relative walk $0 → +$111.5B Operating → +$15.2B Investing → −$120.7B Financing →
    $6.0B net change; FCF: Operating $111.5B / CapEx (small) / FCF ~$99B; earnings quality: NI vs
    OCF (~equal) + 1.00× conversion on the dashed 1× line.
  - WMT bridge: all five sections incl. FX Effect +$123.0M → $1.8B net change; FCF: OCF $41.6B /
    CapEx $26.6B / FCF $14.9B; earnings quality: NI $21.9B vs OCF $41.6B + **1.90×** conversion.
  - Axis-label clipping on the rotated bridge anchors fixed (short ticks + marginBottom 72).
- **`pytest` re-run after the routes.py off-by-one fix: 452 passed, 6 skipped** (unchanged).

### Notes for QA

- **Fixture data shows the RELATIVE walk** (single FY period → no prior balance → `absolute=false`).
  To see the **absolute** Beginning→Ending bridge with the matched cash basis, drive
  `/company/<TICKER>?tab=statements&stmt=cashflow` for a company with ≥2 FY of data in the **live
  Docker volume** (not the trimmed e2e fixtures) — confirm the first anchor reads "Beginning Cash"
  (not "Beginning (relative)") and the basis note names the cash basis.
- Multi-period FCF/earnings charts only show one period on fixtures (one FY seeded); on real
  multi-year data they show the grouped-bar trend + the connecting conversion line.
- Probe both themes (light + dark) and check the earnings-quality secondary (×) axis + the dashed
  1× reference line read clearly in both.

### Handoff → QA Tester

Branch `cashflow-viz`. Verify against the 18 ACs in `1-brief.md`: run `pytest` + the e2e headless
check, drive the real cash-flow chart flow (ideally a ≥2-FY company on the live volume for the
absolute bridge), and confirm the honesty contract (identity reconcile / single residual /
N/A-never-0 / FCF-N/A-on-missing-capex / conversion nm-on-NI≤0 / matched cash basis).

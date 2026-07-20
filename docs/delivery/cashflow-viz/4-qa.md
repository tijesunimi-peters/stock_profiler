# 4 — QA: Cash-flow statement visualizations

**Task slug:** `cashflow-viz`
**Branch:** `cashflow-viz` (stacked on `balance-sheet-viz`)
**Verdict:** ✅ **PASS** — all 18 acceptance criteria met. Ready to deploy (operator-gated).
**Date:** 2026-07-20

## Gates

| Gate | Result | Evidence |
|------|--------|----------|
| `pytest` (Docker) | **452 passed, 6 skipped** | `docker compose --profile test run --rm test` — baseline 431 + 21 new in `tests/test_cashflow_viz.py` |
| e2e headless render | **PASS, 0 console errors** | `docker compose --profile e2e up --abort-on-container-exit --exit-code-from e2e` → `statements-cashflow-chart` (AAPL) & `-wmt` (WMT) errors=0 |
| Screenshots eyeballed | **clean** | `data/e2e-shots/statements-cashflow-chart{,-wmt}.png` — legible, labels not clipped, theme tokens |
| Real-endpoint drive | **contract holds** | curl'd `/statements/cashflow/viz` + `/viz-series` for AAPL/WMT/JPM against the seeded e2e-app |

## Acceptance criteria

**A. Placement & trigger**
- **AC-1 PASS** — Cash Flow tab shows the Table/Chart toggle (default Table); Chart renders 3 cards for AAPL & WMT, 0 errors (e2e + screenshots).
- **AC-2 PASS** — period selector drives the single-period bridge; series shows the period(s). (Fixtures have 1 FY each; multi-period is unit-covered.)
- **AC-3 PASS** — `vizCache` keys include the statement (`"cashflow|"+y+"|"+p`, `"cashflow|series"`); income/balance viz unchanged (their e2e pages still errors=0).

**B. Cash Bridge**
- **AC-4 PASS** — steps Beginning→CFO→CFI→CFF→FX→Ending; direction from `direction`/`running_total` (bar float), not hue. WMT flows verified: OPS +41.565B(up), INV −26.350B(down), FIN −13.553B(down), FX +0.123B(up).
- **AC-5 PASS** — bridge residual = single "Other / unreconciled" = reported_change − Σsections. **AAPL: reported_change 5991000000 = Σsections exactly → 0 residual steps. WMT: 1785000000 = Σsections → 0 residual steps.** Single-residual path unit-tested (`test_bridge_single_residual_is_the_only_balancer`).
- **AC-6 PASS** — `cash_basis` = `_CHANGE_TAG_TO_BASIS[change.source_tag]`; AAPL/WMT → `cash_and_restricted_cash` (modern tag), basis caveat present. Fixtures (1 FY) → honest relative walk (`absolute=false`, anchors "Beginning (relative)"/"Net change (relative)"). Absolute path + wrong-basis guard + `basis_note` unit-tested (`test_bridge_basis_modern/legacy/does_not_read_wrong_basis/basis_note`).
- **AC-7 PASS** — null section skipped (`test_bridge_null_section_is_skipped_not_zeroed`); missing change_in_cash / no sections → `available=false` (unit tests + honest unavailable card).

**C. FCF Breakdown**
- **AC-8 PASS** — FCF = OCF − CapEx. AAPL 98767000000 = 111482000000 − 12715000000; WMT 14923000000 = 41565000000 − 26642000000. Negative-FCF kept (`test_series_fcf_can_be_negative`).
- **AC-9 PASS** — **JPM (bank, no capex tag): CapEx=None → FCF=None, NOT FCF=OCF** (verified live: OCF −147782000000, FCF None). Unit: `test_series_fcf_none_when_capex_missing`.
- **AC-10 PASS** — null fields render as gaps/`FCF N/A`, never 0 (frontend omits null bars; screenshots).

**D. Earnings-Quality**
- **AC-11 PASS** — NI (income stmt) vs OCF (cashflow) joined on `(fiscal_year, fiscal_period)`; missing side → None, no forward-fill (`test_series_cross_statement_join_on_fiscal_key`, `test_series_never_forward_fills_missing_side`).
- **AC-12 PASS** — conversion = OCF/NI, `ok` only when NI>0; **JPM NI>0 but OCF<0 → conv −2.59 status ok** (a real signal, correctly not `nm`); `nm` on NI≤0 / `na` on null input, value None unless ok (`test_series_conversion_nm/na/ok`). AAPL 0.995 ok, WMT 1.90 ok.
- **AC-13 PASS** — secondary (×) axis on the right, dashed 1× reference, meaning in the card note; not color-only (screenshots).

**E. Cross-cutting honesty**
- **AC-14 PASS** — both endpoints carry `CASHFLOW_VIZ_CAVEATS` (6 caveats: source/lag, derived-not-measurement, cash-basis, bridge-residual, FCF definition, conversion-nm rule). Verified in JSON.
- **AC-15 PASS** — values are the `build_statement` normalized values (same cache-aside facts path); no re-derivation.
- **AC-16 PASS** — 0 console errors, income/balance viz + cashflow table/audit/raw-JSON unaffected (e2e pages all errors=0).

**F. Tests**
- **AC-17 PASS** — pytest green, 21 new tests covering bridge identity/residual, basis selection, relative-walk, basis_note, null section, FCF missing-capex/negative, conversion nm/na/ok, cross-statement join, and AAPL/WMT fixture reconciliation.
- **AC-18 PASS** — e2e headless render passes the cash-flow chart view.

## Scope / compliance gates

- **Track-1 only** ✅ — no `mapping.py`, `ingest/`, `sec/`, or `config.py` change (git diff confirms); no new canonical concept, no new ingest, no Track-2/free-text.
- **DuckDB not on request path** ✅ — new endpoints use `_facts_for_cik` + `build_statement` (SQLite cache-aside); no DuckDB reference in the new code.
- **SEC compliance** ✅ — endpoints construct a standard `SECClient()` (process-wide throttle, User-Agent); no `max_rps` override, no throttle change.
- **No green/red-only encoding** ✅ — single terracotta accent + ink/greys; bridge direction by bar float; residual = accent-wash + dashed (computed-not-reported). Grep found no hardcoded green/red.
- **DB behind interface, no raw SQL in API** ✅ — routing glue is pure over the facts list; `_prior_period_balance` does no SQL.

## Known limitation (verified honest, not a defect)

The trimmed unit/e2e fixtures hold **one FY period per company**, so the bridge renders the honest **relative walk** (`absolute=false`) and the series shows a single period. This is correct behavior on single-period data. The **absolute** Beginning→Ending bridge (matched cash basis) and the multi-period trend are covered by the synthetic unit tests; to see them live, drive a ≥2-FY company on a populated Docker volume. Not blocking.

## Non-blocking follow-ups (separate tasks, NOT this one)

- **Efficiency (low):** `routes.py:_prior_period_balance` builds a balance `Statement` for every available period to find the beginning one, with no early-exit on the ideal contiguous (gap≈1) match, and the same-type fallback may rebuild. Bounded (in-memory, single request, ~≤40 periods) but avoidable — could prefilter candidate periods by date or early-exit on gap==1.
- **Cleanup (trivial):** `viz.py:_cashflow_series_period` fetches `cfby.get("capital_expenditures")` three times; bind once.

## Housekeeping

Removed two stray 0-byte scratch files (`mock_check.py`, `probe.py`) that leaked into the repo root as Docker bind-mount points during the backend mock — not part of the change.

## Handoff → Operator / DevOps

**Ready to deploy** (operator-gated). All 18 ACs pass; honesty contract independently verified on real filings (AAPL/WMT identity reconciliation, JPM bank FCF=N/A). All work is **uncommitted** on branch `cashflow-viz` (stacked on `balance-sheet-viz`, which is itself unmerged to `master` — the operator decides the merge/commit order). Next options: commit the branch, or request a deploy via `/devops-engineer`. The two follow-ups above are minor and can be separate tasks.

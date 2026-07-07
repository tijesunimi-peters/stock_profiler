"""Tests for the fundamental-metrics engine (normalize/metrics.py) -- no network.

Two flavors, matching the rest of the suite:
  * fixture-based regression against the real (trimmed) AAPL/WMT/JPM companyfacts payloads,
    the same fixtures test_real_fixtures.py uses;
  * hand-built RawFact sets for the correctness rules (R1-R8) and TTM edge cases, where a
    synthetic input pins the exact behavior a fixture can't isolate.

Ground-truth numbers were read straight from the fixtures (see the values inline). The engine
anchors on period_end, so /metrics?year=2024 means the fiscal year ending in calendar 2024 --
deliberately more robust than statements.py's (fy, fp) keying (see the module docstring).
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest
from fastapi import HTTPException

from secfin.api import routes as routes_module
from secfin.normalize.metrics import (
    _index_concepts,
    _ttm_flow,
    available_metric_periods,
    compute_metrics,
)
from secfin.normalize.schema import RawFact
from secfin.sec.companyfacts import flatten_company_facts

FIXTURES_DIR = Path(__file__).parent / "fixtures"


def _load(name: str, cik: int) -> list[RawFact]:
    payload = json.loads((FIXTURES_DIR / name).read_text())
    return flatten_company_facts(payload, cik)


def _rf(
    tag: str,
    value: float,
    *,
    unit: str = "USD",
    start: str | None = None,
    end: str | None = None,
    instant: str | None = None,
    filed: str = "2025-01-01",
    taxonomy: str = "us-gaap",
) -> RawFact:
    return RawFact(
        cik=1,
        taxonomy=taxonomy,
        gaap_tag=tag,
        label=tag,
        unit=unit,
        value=value,
        period_start=start,
        period_end=end,
        instant=instant,
        filed=filed,
    )


def _by_metric(facts: list[RawFact], cik: int, year: int, period: str = "FY") -> dict:
    return {m.metric: m for m in compute_metrics(facts, cik, year, period).metrics}


# --------------------------------------------------------------------------------------
# Fixture-based regression (AAPL / WMT / JPM)
# --------------------------------------------------------------------------------------


def test_aapl_fy2024_core_metrics_match_fixture_ground_truth():
    # FY2024 ends 2024-09-28. From the fixture: revenue 391035, net_income 93736,
    # OCF 118254, capex 9447, equity(2024-09-28) 56950, shares(2024-09-28) 15116786 (×1e6).
    facts = _load("aapl_companyfacts.json", 320193)
    m = _by_metric(facts, 320193, 2024)

    # Every metric is anchored to the FY2024 period end, not a comparative year.
    assert m["net_margin"].period_end == "2024-09-28"
    assert m["net_margin"].value == pytest.approx(93736000000 / 391035000000)
    assert m["net_margin"].basis == "TTM"
    assert m["net_margin"].restatement_basis == "as-restated"
    # FCF = OCF − capex (capex is a positive outflow, subtracted as-is: R8).
    assert m["fcf"].value == pytest.approx(118254000000 - 9447000000)
    assert m["fcf"].unit == "USD"
    # Revenue YoY uses the correct prior fiscal year (FY2023 revenue 383285), NOT a
    # mislabeled comparative -- this is the period_end-anchoring payoff.
    assert m["revenue_growth_yoy"].value == pytest.approx(391035000000 / 383285000000 - 1)
    assert m["book_value_per_share"].value == pytest.approx(56950000000 / 15116786000)
    assert m["book_value_per_share"].unit == "USD/shares"


def test_aapl_period_end_anchoring_distinguishes_years():
    facts = _load("aapl_companyfacts.json", 320193)
    assert available_metric_periods(facts) == [(2025, "FY"), (2024, "FY"), (2023, "FY")]
    # Different fiscal years resolve to different revenue-based values (the fy/fp label bug
    # would collapse these -- period_end keying does not).
    assert _by_metric(facts, 320193, 2024)["net_margin"].value != pytest.approx(
        _by_metric(facts, 320193, 2023)["net_margin"].value
    )


def test_aapl_debt_split_flags_leverage_metrics_approximate():
    # Apple reports current-debt components without an aggregate DebtCurrent tag, so leverage
    # metrics are shown but flagged approximate (R5), never silently understated.
    m = _by_metric(_load("aapl_companyfacts.json", 320193), 320193, 2024)
    for key in ("roic", "debt_to_equity", "net_debt"):
        assert m[key].status == "approximate", key
        assert m[key].value is not None
        assert "split" in (m[key].reason or "")


def test_average_balance_is_approximate_without_a_prior_year_balance():
    facts = _load("aapl_companyfacts.json", 320193)
    # The fixture's earliest total-assets instant is 2024-09-28, so FY2024's average balance
    # falls back to the ending balance (approximate); FY2025 has both ends (ok). R3.
    assert _by_metric(facts, 320193, 2024)["roa"].status == "approximate"
    assert _by_metric(facts, 320193, 2025)["roa"].status == "ok"


def test_jpm_bank_metrics_are_structurally_na_not_zero():
    # A bank has no current/noncurrent split, no inventory, interest as a core cost -- these
    # are N/A (structurally meaningless), never 0 or a divide error (R7).
    facts = _load("jpm_companyfacts.json", 19617)
    year = available_metric_periods(facts)[0][0]
    m = _by_metric(facts, 19617, year)
    for key in ("current_ratio", "quick_ratio", "inventory_turnover", "interest_coverage"):
        assert m[key].status == "na", key
        assert m[key].value is None
    # ...but net margin and ROE still compute for a bank.
    assert m["net_margin"].status == "ok"
    assert m["roe"].status == "ok"


def test_wmt_retailer_gross_margin_uses_fallback_when_untagged():
    # Walmart doesn't tag a discrete GrossProfit line; gross margin falls back to
    # (revenue − cost_of_revenue) / revenue (R8) rather than going N/A.
    facts = _load("wmt_companyfacts.json", 104169)
    year = available_metric_periods(facts)[0][0]
    gm = _by_metric(facts, 104169, year)["gross_margin"]
    assert gm.status == "ok"
    assert 0.0 < gm.value < 0.5  # retailer-range gross margin


def test_metrics_carry_provenance_and_status_vocabulary():
    facts = _load("aapl_companyfacts.json", 320193)
    result = compute_metrics(facts, 320193, 2025, "FY")
    assert result.metrics  # a full set
    for mv in result.metrics:
        assert mv.status in {"ok", "approximate", "na", "nm"}
        assert mv.basis in {"TTM", "as-of"}
        assert mv.as_of is not None  # provenance: the filing this period is current as of
        # N/A and N/M never carry a fabricated value (STYLE_GUIDE §7).
        if mv.status in {"na", "nm"}:
            assert mv.value is None
            assert mv.reason


# --------------------------------------------------------------------------------------
# Correctness rules & TTM edge cases (synthetic)
# --------------------------------------------------------------------------------------


def test_ttm_from_a_reported_annual_duration_is_direct():
    facts = [_rf("Revenues", 1000, start="2023-01-01", end="2023-12-31")]
    idx = _index_concepts(facts)
    assert _ttm_flow(idx["revenue"], "2023-12-31") == 1000


def test_ttm_quarterly_sums_four_discrete_quarters_including_derived_q4():
    # YTD (cumulative-from-fiscal-year-start) durations, the real XBRL shape. Differencing
    # recovers discrete quarters; Q4 = full-year − 9-month-YTD.
    f = [
        # FY2023 YTD: Q1=100, Q2=250, Q3=420, FY=600  -> discretes 100,150,170,180
        _rf("Revenues", 100, start="2023-01-01", end="2023-03-31"),
        _rf("Revenues", 250, start="2023-01-01", end="2023-06-30"),
        _rf("Revenues", 420, start="2023-01-01", end="2023-09-30"),
        _rf("Revenues", 600, start="2023-01-01", end="2023-12-31"),
        # FY2024 YTD: Q1=130, Q2=300  -> discretes 130,170
        _rf("Revenues", 130, start="2024-01-01", end="2024-03-31"),
        _rf("Revenues", 300, start="2024-01-01", end="2024-06-30"),
    ]
    data = _index_concepts(f)["revenue"]
    assert data.discrete_quarters()["2023-12-31"] == 180  # derived Q4 = 600 − 420
    # TTM ending 2024-06-30 = Q2'24(170) + Q1'24(130) + Q4'23(180) + Q3'23(170) = 650
    assert _ttm_flow(data, "2024-06-30") == 650


def test_ttm_returns_none_when_a_quarter_is_missing():
    # Only three consecutive quarters -> can't assemble a full trailing year.
    f = [
        _rf("Revenues", 100, start="2024-01-01", end="2024-03-31"),
        _rf("Revenues", 250, start="2024-01-01", end="2024-06-30"),
        _rf("Revenues", 420, start="2024-01-01", end="2024-09-30"),
    ]
    assert _ttm_flow(_index_concepts(f)["revenue"], "2024-09-30") is None


def _annual_fy(facts_extra: list[RawFact]) -> list[RawFact]:
    """A minimal one-fiscal-year set (FY2024, end 2024-12-31) plus caller-supplied facts."""
    return [
        _rf("Revenues", 1000, start="2024-01-01", end="2024-12-31"),
        *facts_extra,
    ]


def test_roic_tax_clamp_falls_back_to_statutory_rate():
    # Effective tax rate 50% is outside the 0-35% band, so ROIC uses the statutory 21% (R8).
    facts = _annual_fy(
        [
            _rf("OperatingIncomeLoss", 200, start="2024-01-01", end="2024-12-31"),
            _rf(
                "IncomeLossFromContinuingOperationsBeforeIncomeTaxesExtraordinaryItemsNoncontrollingInterest",
                100,
                start="2024-01-01",
                end="2024-12-31",
            ),
            _rf("IncomeTaxExpenseBenefit", 50, start="2024-01-01", end="2024-12-31"),  # 50% eff
            _rf("StockholdersEquity", 1000, instant="2024-12-31"),
        ]
    )
    roic = _by_metric(facts, 1, 2024)["roic"]
    # NOPAT = 200 × (1 − 0.21) = 158; invested capital = equity 1000 (no debt/cash) → 0.158.
    assert roic.status == "ok"  # no debt-split here
    assert roic.value == pytest.approx(158 / 1000)


def test_gross_profit_fallback_when_untagged():
    facts = _annual_fy([_rf("CostOfRevenue", 600, start="2024-01-01", end="2024-12-31")])
    gm = _by_metric(facts, 1, 2024)["gross_margin"]
    assert gm.value == pytest.approx((1000 - 600) / 1000)


def test_capex_subtracted_as_positive_outflow():
    facts = _annual_fy(
        [
            _rf(
                "NetCashProvidedByUsedInOperatingActivities",
                500,
                start="2024-01-01",
                end="2024-12-31",
            ),
            _rf(
                "PaymentsToAcquirePropertyPlantAndEquipment",
                120,
                start="2024-01-01",
                end="2024-12-31",
            ),
        ]
    )
    assert _by_metric(facts, 1, 2024)["fcf"].value == pytest.approx(380)  # 500 − 120


def test_debt_split_marks_leverage_approximate():
    facts = _annual_fy(
        [
            _rf("StockholdersEquity", 1000, instant="2024-12-31"),
            _rf("LongTermDebtNoncurrent", 400, instant="2024-12-31"),
            # current debt only via components, no aggregate DebtCurrent -> R5 undercount
            _rf("LongTermDebtCurrent", 50, instant="2024-12-31"),
            _rf("ShortTermBorrowings", 30, instant="2024-12-31"),
        ]
    )
    dte = _by_metric(facts, 1, 2024)["debt_to_equity"]
    assert dte.status == "approximate"
    assert dte.value is not None


def test_growth_is_nm_off_a_negative_base():
    facts = [
        _rf("NetIncomeLoss", -50, start="2023-01-01", end="2023-12-31"),
        _rf("NetIncomeLoss", 100, start="2024-01-01", end="2024-12-31"),
        _rf("Revenues", 900, start="2023-01-01", end="2023-12-31"),
        _rf("Revenues", 1000, start="2024-01-01", end="2024-12-31"),
    ]
    eg = _by_metric(facts, 1, 2024)["earnings_growth_yoy"]
    assert eg.status == "nm"
    assert eg.value is None


def test_missing_input_is_na_not_zero():
    facts = _annual_fy([])  # revenue only; no current assets/liabilities
    cr = _by_metric(facts, 1, 2024)["current_ratio"]
    assert cr.status == "na"
    assert cr.value is None


def test_dei_share_count_enables_book_value_per_share():
    # R6: shares_outstanding's only source is the dei cover-page tag, which the ingest path
    # now pulls (see companyfacts.INGEST_TAXONOMIES). Equity 1000 / 100 shares = 10.0.
    facts = _annual_fy(
        [
            _rf("StockholdersEquity", 1000, instant="2024-12-31"),
            _rf(
                "EntityCommonStockSharesOutstanding",
                100,
                unit="shares",
                instant="2024-12-31",
                taxonomy="dei",
            ),
        ]
    )
    bvps = _by_metric(facts, 1, 2024)["book_value_per_share"]
    assert bvps.status == "ok"
    assert bvps.value == pytest.approx(10.0)


def test_eps_is_nm_for_a_quarter_not_summed():
    # EPS is per-period and not summable across quarters; a quarterly request is nm, not a
    # bogus sum. (Build two fiscal years of quarters so the quarter resolves.)
    f = []
    for yr, base in ((2023, 0), (2024, 100)):
        for i, end in enumerate(
            [f"{yr}-03-31", f"{yr}-06-30", f"{yr}-09-30", f"{yr}-12-31"], start=1
        ):
            f.append(_rf("Revenues", base + i * 100, start=f"{yr}-01-01", end=end))
        f.append(
            _rf(
                "EarningsPerShareBasic",
                1.5,
                unit="USD/shares",
                start=f"{yr}-01-01",
                end=f"{yr}-12-31",
            )
        )
    eps = _by_metric(f, 1, 2024, "Q2")["eps_basic"]
    assert eps.status == "nm"


# --------------------------------------------------------------------------------------
# Endpoint (route helper, no network / no DB)
# --------------------------------------------------------------------------------------


async def test_metrics_endpoint_returns_set_and_404s_on_unknown_period(monkeypatch):
    facts = _load("aapl_companyfacts.json", 320193)

    class _DummyClient:
        async def __aenter__(self):
            return self

        async def __aexit__(self, *exc):
            return False

    async def _fake_cik(client, ticker_cache, symbol):
        return 320193

    async def _fake_facts(repo, client, cik):
        return facts

    monkeypatch.setattr(routes_module, "SECClient", lambda: _DummyClient())
    monkeypatch.setattr(routes_module, "_cik_from_symbol", _fake_cik)
    monkeypatch.setattr(routes_module, "_facts_for_cik", _fake_facts)

    result = await routes_module.get_metrics(
        symbol="AAPL", year=2024, period="FY", repo=None, ticker_cache=None
    )
    assert result.cik == 320193
    assert result.metrics

    with pytest.raises(HTTPException) as exc_info:
        await routes_module.get_metrics(
            symbol="AAPL", year=1990, period="FY", repo=None, ticker_cache=None
        )
    assert exc_info.value.status_code == 404

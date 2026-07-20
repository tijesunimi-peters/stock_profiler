"""Tests for the cash-flow visualization derivations (normalize/viz).

The honesty invariants under test:
  * Cash Bridge: the walk steps Beginning -> CFO -> CFI -> CFF -> FX -> Ending; the ONLY
    balancer is one explicit "Other / unreconciled" residual = reported change_in_cash minus
    the summed sections (never a silent plug). Beginning/Ending Cash are read on the balance
    concept MATCHING the reported change_in_cash tag (modern ASU-2016-18 -> cash_and_restricted_cash,
    legacy -> cash_and_equivalents); when a level is absent the walk is relative (0-anchored),
    never a fabricated level. A period-end level that disagrees with beginning+change is a
    surfaced basis_note, never rescaled -- AC-4/5/6/7.
  * FCF series: FCF = OCF - CapEx only when BOTH present (banks with no capex -> None, not OCF);
    a negative FCF stays negative; a null input stays None, never 0 -- AC-8/9/10.
  * Earnings-Quality: cross-statement join on (fiscal_year, fiscal_period); cash conversion =
    OCF/NI only when NI > 0, else "nm"/"na" with value None -- AC-11/12.

The synthetic fixtures build Statements directly (the helpers' input contract). The tail
tests run the real AAPL/WMT companyfacts fixtures through the same helpers to confirm the FY
bridge reconciles (residual ~ 0) and does not get swamped by the residual -- the operator's
mock-first gate, checked in code.
"""

from __future__ import annotations

import json
from pathlib import Path

from secfin.normalize.schema import Statement, StatementLine
from secfin.normalize.statements import available_periods, build_statement
from secfin.normalize.viz import (
    _CASHFLOW_RESIDUAL_LABEL,
    cashflow_series,
    cashflow_viz,
)
from secfin.sec.companyfacts import flatten_company_facts

FIXTURES_DIR = Path(__file__).parent / "fixtures"

# The two change_in_cash candidate tags (normalize/mapping.py) that select the cash basis.
MODERN_CHANGE_TAG = (
    "CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalents"
    "PeriodIncreaseDecreaseIncludingExchangeRateEffect"
)
LEGACY_CHANGE_TAG = "CashAndCashEquivalentsPeriodIncreaseDecrease"


def _line(concept: str, value: float | None, *, tag: str = "", ext: bool = False) -> StatementLine:
    return StatementLine(
        canonical_concept=concept,
        label=concept.replace("_", " ").title(),
        value=value,
        unit="USD",
        source_tag=tag or concept,
        is_extension=ext,
    )


def _cf(lines: list[StatementLine], *, year: int = 2024, period_end: str = "2024-09-28") -> Statement:
    return Statement(
        cik=320193,
        statement="cashflow",
        fiscal_year=year,
        fiscal_period="FY",
        period_start="2023-09-30",
        period_end=period_end,
        form="10-K",
        filed=f"{year}-11-01",
        accession=f"0000320193-{year % 100:02d}-000123",
        lines=lines,
    )


def _bal(lines: list[StatementLine], *, statement: str = "balance", year: int = 2024) -> Statement:
    return Statement(
        cik=320193,
        statement=statement,  # type: ignore[arg-type]
        fiscal_year=year,
        fiscal_period="FY",
        period_end="2024-09-28",
        form="10-K",
        filed=f"{year}-11-01",
        accession=f"0000320193-{year % 100:02d}-000123",
        lines=lines,
    )


def _income(net_income: float | None, *, year: int = 2024, period_end: str = "2024-09-28") -> Statement:
    return Statement(
        cik=320193,
        statement="income",
        fiscal_year=year,
        fiscal_period="FY",
        period_end=period_end,
        form="10-K",
        filed=f"{year}-11-01",
        accession=f"0000320193-{year % 100:02d}-000123",
        lines=[_line("net_income", net_income)] if net_income is not None else [],
    )


# A clean cash-flow statement where the four sections sum to the reported change exactly:
#   CFO 110 + CFI (-10) + CFF (-108) + FX 1 = -7 == change_in_cash (modern basis)
def _clean_cf(change_tag: str = MODERN_CHANGE_TAG) -> Statement:
    return _cf(
        [
            _line("cash_from_operations", 110),
            _line("cash_from_investing", -10),
            _line("cash_from_financing", -108),
            _line("effect_of_exchange_rate_on_cash", 1),
            _line("change_in_cash", -7, tag=change_tag),
        ]
    )


# ----------------------------- Cash Bridge -----------------------------


def test_bridge_identity_no_residual_when_sections_sum_to_change():
    end = _bal([_line("cash_and_restricted_cash", 30)])
    begin = _bal([_line("cash_and_restricted_cash", 37)])  # 37 + (-7) = 30
    viz = cashflow_viz(_clean_cf(), end, begin)
    b = viz.bridge
    assert b.available is True
    assert b.absolute is True
    assert b.cash_basis == "cash_and_restricted_cash"
    # No residual step when the identity holds.
    assert not any(s.kind == "residual" for s in b.steps)
    # Anchors bookend the walk.
    assert b.steps[0].kind == "anchor" and b.steps[0].label == "Beginning Cash"
    assert b.steps[-1].kind == "anchor" and b.steps[-1].label == "Ending Cash"
    # The walk lands on beginning + reported change.
    assert b.steps[-1].running_total == 30
    assert b.basis_note is None


def test_bridge_single_residual_is_the_only_balancer():
    # Sections sum to -7 but the filer reports a -5 net change -> a +2 "Other / unreconciled".
    cf = _cf(
        [
            _line("cash_from_operations", 110),
            _line("cash_from_investing", -10),
            _line("cash_from_financing", -108),
            _line("effect_of_exchange_rate_on_cash", 1),
            _line("change_in_cash", -5, tag=MODERN_CHANGE_TAG),
        ]
    )
    viz = cashflow_viz(cf, None, None)
    residuals = [s for s in viz.bridge.steps if s.kind == "residual"]
    assert len(residuals) == 1
    assert residuals[0].label == _CASHFLOW_RESIDUAL_LABEL
    assert residuals[0].value == 2  # magnitude
    assert residuals[0].direction == "up"


def test_bridge_basis_modern_reads_restricted_cash():
    end = _bal([_line("cash_and_restricted_cash", 30), _line("cash_and_equivalents", 25)])
    begin = _bal([_line("cash_and_restricted_cash", 37), _line("cash_and_equivalents", 30)])
    b = cashflow_viz(_clean_cf(MODERN_CHANGE_TAG), end, begin).bridge
    assert b.cash_basis == "cash_and_restricted_cash"
    assert b.beginning_cash == 37 and b.ending_cash == 30


def test_bridge_basis_legacy_reads_cash_and_equivalents():
    end = _bal([_line("cash_and_restricted_cash", 30), _line("cash_and_equivalents", 25)])
    begin = _bal([_line("cash_and_restricted_cash", 37), _line("cash_and_equivalents", 32)])
    # legacy change tag: 32 + (-7) = 25 (equivalents basis)
    b = cashflow_viz(_clean_cf(LEGACY_CHANGE_TAG), end, begin).bridge
    assert b.cash_basis == "cash_and_equivalents"
    assert b.beginning_cash == 32 and b.ending_cash == 25
    assert b.basis_note is None


def test_bridge_does_not_read_wrong_basis():
    # Modern change tag, but only the equivalents level is present -> can't read the matching
    # (restricted) basis, so it must fall back to a relative walk, NOT read the wrong level.
    end = _bal([_line("cash_and_equivalents", 25)])
    begin = _bal([_line("cash_and_equivalents", 32)])
    b = cashflow_viz(_clean_cf(MODERN_CHANGE_TAG), end, begin).bridge
    assert b.cash_basis == "cash_and_restricted_cash"
    assert b.absolute is False
    assert b.beginning_cash is None and b.ending_cash is None


def test_bridge_relative_walk_when_levels_absent():
    b = cashflow_viz(_clean_cf(), None, None).bridge
    assert b.available is True
    assert b.absolute is False
    assert b.beginning_cash is None and b.ending_cash is None
    assert b.steps[0].label == "Beginning (relative)"
    assert b.steps[0].running_total == 0.0
    assert b.steps[-1].running_total == -7  # the reported change


def test_bridge_basis_note_when_reported_end_disagrees():
    # Ending level read (100) disagrees with beginning + change (37 - 7 = 30) -> surfaced note.
    end = _bal([_line("cash_and_restricted_cash", 100)])
    begin = _bal([_line("cash_and_restricted_cash", 37)])
    b = cashflow_viz(_clean_cf(), end, begin).bridge
    assert b.basis_note is not None
    # The walk still lands on the identity, not the divergent read.
    assert b.steps[-1].running_total == 30


def test_bridge_null_section_is_skipped_not_zeroed():
    cf = _cf(
        [
            _line("cash_from_operations", 110),
            _line("cash_from_financing", -117),
            _line("change_in_cash", -7, tag=MODERN_CHANGE_TAG),
        ]
    )
    b = cashflow_viz(cf, None, None).bridge
    flow_concepts = [s.canonical_concept for s in b.steps if s.kind == "flow"]
    assert flow_concepts == ["cash_from_operations", "cash_from_financing"]
    assert "cash_from_investing" not in flow_concepts  # absent, not a 0 step


def test_bridge_unavailable_without_change_in_cash():
    cf = _cf([_line("cash_from_operations", 110), _line("cash_from_financing", -117)])
    b = cashflow_viz(cf, None, None).bridge
    assert b.available is False
    assert "net change in cash" in (b.unavailable_reason or "")


def test_bridge_unavailable_without_any_section():
    cf = _cf([_line("change_in_cash", -7, tag=MODERN_CHANGE_TAG)])
    b = cashflow_viz(cf, None, None).bridge
    assert b.available is False


# ----------------------------- FCF + Earnings-Quality series -----------------------------


def test_series_fcf_equals_ocf_minus_capex():
    cf = _cf([_line("cash_from_operations", 110), _line("capital_expenditures", 10)])
    s = cashflow_series([cf], [_income(90)])
    p = s.periods[0]
    assert p.free_cash_flow == 100
    assert p.operating_cash_flow == 110
    assert p.capital_expenditures == 10


def test_series_fcf_can_be_negative():
    cf = _cf([_line("cash_from_operations", 8), _line("capital_expenditures", 20)])
    p = cashflow_series([cf], [_income(5)]).periods[0]
    assert p.free_cash_flow == -12  # not clamped


def test_series_fcf_none_when_capex_missing():
    # Bank shape: OCF present, no capex tag at all -> FCF is N/A, NEVER FCF = OCF.
    cf = _cf([_line("cash_from_operations", 110)])
    p = cashflow_series([cf], [_income(90)]).periods[0]
    assert p.operating_cash_flow == 110
    assert p.capital_expenditures is None
    assert p.free_cash_flow is None


def test_series_fcf_none_when_ocf_missing():
    cf = _cf([_line("capital_expenditures", 10)])
    p = cashflow_series([cf], [_income(90)]).periods[0]
    assert p.free_cash_flow is None
    assert p.operating_cash_flow is None  # never 0


def test_series_conversion_ok_when_positive_ni():
    cf = _cf([_line("cash_from_operations", 120)])
    p = cashflow_series([cf], [_income(100)]).periods[0]
    assert p.conversion_status == "ok"
    assert p.cash_conversion == 1.2


def test_series_conversion_nm_when_ni_nonpositive():
    for ni in (0, -50):
        cf = _cf([_line("cash_from_operations", 120)])
        p = cashflow_series([cf], [_income(ni)]).periods[0]
        assert p.conversion_status == "nm", ni
        assert p.cash_conversion is None, ni


def test_series_conversion_na_when_input_missing():
    # No net income for the period at all.
    cf = _cf([_line("cash_from_operations", 120)])
    p = cashflow_series([cf], []).periods[0]
    assert p.conversion_status == "na"
    assert p.cash_conversion is None
    assert p.net_income is None

    # No OCF for the period.
    cf2 = _cf([_line("capital_expenditures", 10)])
    p2 = cashflow_series([cf2], [_income(90)]).periods[0]
    assert p2.conversion_status == "na"
    assert p2.cash_conversion is None


def test_series_cross_statement_join_on_fiscal_key():
    cf_2023 = _cf([_line("cash_from_operations", 100)], year=2023, period_end="2023-09-30")
    cf_2024 = _cf([_line("cash_from_operations", 120)], year=2024, period_end="2024-09-28")
    # Income only for 2024 -> 2023 net income stays None (no forward-fill).
    s = cashflow_series([cf_2024, cf_2023], [_income(100, year=2024)])
    assert [p.fiscal_year for p in s.periods] == [2023, 2024]  # oldest -> newest
    assert s.periods[0].net_income is None
    assert s.periods[1].net_income == 100


def test_series_never_forward_fills_missing_side():
    cf = _cf([_line("cash_from_operations", 120)])
    # Wrong-year income must NOT match.
    s = cashflow_series([cf], [_income(100, year=1999)])
    assert s.periods[0].net_income is None


# ----------------------------- Real-fixture mock-first gate -----------------------------


def _load(name: str, cik: int):
    payload = json.loads((FIXTURES_DIR / name).read_text())
    return flatten_company_facts(payload, cik)


def _latest_fy(facts):
    return next((y, p) for (y, p) in available_periods(facts) if p == "FY")


def _run_real_bridge(name: str, cik: int):
    facts = _load(name, cik)
    year, period = _latest_fy(facts)
    cf = build_statement(facts, cik, "cashflow", year, period)
    end = build_statement(facts, cik, "balance", year, period)
    # Beginning: the balance whose period_end matches the cash-flow period_start.
    begin = None
    for (y, p) in available_periods(facts):
        if (y, p) == (year, period):
            continue
        cand = build_statement(facts, cik, "balance", y, p)
        if cand.period_end and cand.period_end == cf.period_start:
            begin = cand
            break
    return cf, cashflow_viz(cf, end, begin).bridge


def test_real_aapl_bridge_reconciles_and_residual_does_not_dominate():
    cf, b = _run_real_bridge("aapl_companyfacts.json", 320193)
    assert b.available is True
    # The four sections sum to the reported net change by identity -> residual ~ 0.
    residuals = [s for s in b.steps if s.kind == "residual"]
    assert residuals == [], "AAPL FY sections should reconcile to change_in_cash exactly"
    # Basis matches the reported change tag.
    change_tag = next(l.source_tag for l in cf.lines if l.canonical_concept == "change_in_cash")
    assert b.cash_basis is not None
    assert (b.cash_basis == "cash_and_restricted_cash") == (change_tag == MODERN_CHANGE_TAG)


def test_real_wmt_bridge_reconciles_and_residual_does_not_dominate():
    cf, b = _run_real_bridge("wmt_companyfacts.json", 104169)
    assert b.available is True
    reported = abs(b.reported_change or 0.0)
    residual_mag = sum(s.value for s in b.steps if s.kind == "residual")
    # Residual must not dominate the reported change (the mock-first coverage guard).
    if reported > 0:
        assert residual_mag <= 0.10 * reported, (residual_mag, reported)

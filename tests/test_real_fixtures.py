"""Regression tests against real (trimmed) SEC companyfacts payloads.

Unlike test_mapping.py's hand-built RawFacts, these fixtures are genuine SEC filing data
(fetched 2026-07-03, trimmed to the last 2 fiscal years per company -- see
tests/fixtures/README.md) for three companies with meaningfully different statement
shapes, covering income statement, balance sheet, and cash flow:

  - AAPL: a standard commercial/tech company -- the shape the canonical schema targets.
  - WMT:  a retailer -- has cost_of_revenue/net_income but no discrete gross_profit or
          operating_expenses tag, and no R&D (none of that is a bug; see below).
  - JPM:  a bank -- revenue/expense concepts don't fit the commercial income-statement
          shape at all (no cost_of_revenue/gross_profit/operating_income), and the
          balance sheet isn't classified into current/noncurrent at all; this is a
          known, documented scope limitation, not something these tags can fix.

These numbers were captured directly from the fixtures (see the module docstring in
scripts used to generate them) -- if a mapping.py change shifts them, that's either an
intentional coverage improvement (update the assertion) or a real regression.
"""

from __future__ import annotations

import json
from pathlib import Path

from secfin.normalize.statements import available_periods, build_statement, coverage_report
from secfin.sec.companyfacts import flatten_company_facts

FIXTURES_DIR = Path(__file__).parent / "fixtures"


def _load(name: str, cik: int):
    payload = json.loads((FIXTURES_DIR / name).read_text())
    return flatten_company_facts(payload, cik)


def test_aapl_income_statement_matches_real_filing():
    facts = _load("aapl_companyfacts.json", 320193)
    latest_fy = next(p for p in available_periods(facts) if p[1] == "FY")
    assert latest_fy == (2025, "FY")

    period_facts = [f for f in facts if (f.fiscal_year, f.fiscal_period) == latest_fy]
    # NOTE: coverage_report() counts mapped-vs-unmapped across ALL canonical concepts
    # (income + balance + cashflow), not just this statement's -- so these totals moved
    # when balance-sheet/cashflow concepts were added to mapping.py, even though this test
    # only exercises the income statement. See test_..._balance_and_cashflow below.
    assert coverage_report(period_facts) == {"unmapped": 339, "mapped": 86}

    stmt = build_statement(facts, 320193, "income", 2025, "FY")
    assert stmt.form == "10-K"
    assert stmt.filed == "2025-10-31"
    assert stmt.accession == "0000320193-25-000079"

    # Values are the filing's PRIMARY column (FY2025, 2024-09-29 -> 2025-09-27) -- the
    # pre-2026-07-16 assertions here had captured the comparative-column bug (they were
    # AAPL's FY2023 figures; see normalize/statements.py module docstring).
    assert stmt.period_end == "2025-09-27"
    by_concept = {line.canonical_concept: line.value for line in stmt.lines}
    assert by_concept["revenue"] == 416161000000
    assert by_concept["net_income"] == 112010000000
    # Apple's recent 10-Ks net interest into "other income/expense" rather than tagging a
    # discrete interest expense line -- absent here is correct, not a mapping gap.
    assert "interest_expense" not in by_concept


def test_wmt_income_statement_has_retailer_shaped_gaps():
    facts = _load("wmt_companyfacts.json", 104169)
    latest_fy = next(p for p in available_periods(facts) if p[1] == "FY")
    assert latest_fy == (2026, "FY")

    period_facts = [f for f in facts if (f.fiscal_year, f.fiscal_period) == latest_fy]
    assert coverage_report(period_facts) == {"unmapped": 434, "mapped": 84}

    stmt = build_statement(facts, 104169, "income", 2026, "FY")
    by_concept = {line.canonical_concept: line.value for line in stmt.lines}
    assert stmt.period_end == "2026-01-31"  # primary column, not a comparative
    assert by_concept["revenue"] == 706413000000
    assert by_concept["net_income"] == 21893000000
    assert by_concept["interest_expense"] == 2318000000  # InterestExpenseDebt candidate

    # Walmart's 10-K doesn't tag a discrete gross-profit or aggregate operating-expenses
    # line (or R&D, which is genuinely not applicable to a retailer) -- expected absences,
    # not a "wrong tag" bug. build_statement already skips these rather than emitting a
    # blank/zero row (see normalize/statements.py).
    for concept in ("gross_profit", "operating_expenses", "research_and_development"):
        assert concept not in by_concept


def test_jpm_bank_income_statement_has_structural_gaps():
    facts = _load("jpm_companyfacts.json", 19617)
    latest_fy = next(p for p in available_periods(facts) if p[1] == "FY")
    assert latest_fy == (2025, "FY")

    period_facts = [f for f in facts if (f.fiscal_year, f.fiscal_period) == latest_fy]
    assert coverage_report(period_facts) == {"unmapped": 949, "mapped": 54}

    stmt = build_statement(facts, 19617, "income", 2025, "FY")
    assert stmt.form == "10-K"
    assert stmt.accession == "0001628280-26-008131"

    assert stmt.period_end == "2025-12-31"  # primary column, not a comparative
    by_concept = {line.canonical_concept: line.value for line in stmt.lines}
    assert by_concept["net_income"] == 57048000000
    # InterestExpenseOperating: the aggregate across JPM's deposit/repo/debt/trading-
    # liability interest expense components.
    assert by_concept["interest_expense"] == 97898000000

    # A bank's income statement doesn't have a cost-of-revenue/gross-profit/operating-
    # income structure at all (it reports net interest income + noninterest income/
    # expense instead) -- this is a known, documented scope limitation of the current
    # canonical schema (see docs/DATA_MODEL.md), not a candidate-tag gap to close.
    for concept in (
        "cost_of_revenue",
        "gross_profit",
        "research_and_development",
        "sga_expense",
        "operating_expenses",
        "operating_income",
    ):
        assert concept not in by_concept


def test_aapl_balance_sheet_and_cashflow_fully_covered():
    facts = _load("aapl_companyfacts.json", 320193)
    latest_fy = next(p for p in available_periods(facts) if p[1] == "FY")

    balance = build_statement(facts, 320193, "balance", *latest_fy)
    by_concept = {line.canonical_concept: line.value for line in balance.lines}
    assert balance.period_end == "2025-09-27"  # primary instant, not the comparative
    assert by_concept["cash_and_equivalents"] == 35934000000
    assert by_concept["accounts_receivable"] == 39777000000
    assert by_concept["inventory"] == 5718000000
    assert by_concept["total_assets"] == 359241000000
    assert by_concept["total_liabilities"] == 285508000000
    assert by_concept["long_term_debt"] == 78328000000
    assert by_concept["stockholders_equity"] == 73733000000
    assert by_concept["shares_outstanding"] == 14773260000

    cashflow = build_statement(facts, 320193, "cashflow", *latest_fy)
    by_concept = {line.canonical_concept: line.value for line in cashflow.lines}
    assert by_concept["cash_from_operations"] == 111482000000
    assert by_concept["capital_expenditures"] == 12715000000
    assert by_concept["depreciation_amortization"] == 11698000000


def test_wmt_balance_sheet_has_retailer_shaped_gaps():
    facts = _load("wmt_companyfacts.json", 104169)
    latest_fy = next(p for p in available_periods(facts) if p[1] == "FY")

    balance = build_statement(facts, 104169, "balance", *latest_fy)
    by_concept = {line.canonical_concept: line.value for line in balance.lines}
    assert balance.period_end == "2026-01-31"
    assert by_concept["cash_and_equivalents"] == 10727000000
    assert by_concept["inventory"] == 58851000000
    assert by_concept["total_assets"] == 284668000000
    assert by_concept["stockholders_equity"] == 99617000000

    # Walmart's 10-K doesn't tag a discrete aggregate "Liabilities" line (only the
    # combined LiabilitiesAndStockholdersEquity total) -- a real coverage gap with no
    # better single candidate tag, not a "wrong tag" bug (see DATA_MODEL.md). Nor does it
    # tag CommonStockSharesOutstanding in us-gaap -- that only appears in the *dei*
    # taxonomy (cover page), which isn't ingested by fetch_raw_facts's default
    # taxonomy="us-gaap" (see mapping.py's shares_outstanding comment).
    for concept in ("total_liabilities", "shares_outstanding"):
        assert concept not in by_concept

    cashflow = build_statement(facts, 104169, "cashflow", *latest_fy)
    by_concept = {line.canonical_concept: line.value for line in cashflow.lines}
    assert by_concept["cash_from_operations"] == 41565000000
    assert by_concept["capital_expenditures"] == 26642000000


def test_jpm_bank_balance_sheet_has_structural_gaps():
    facts = _load("jpm_companyfacts.json", 19617)
    latest_fy = next(p for p in available_periods(facts) if p[1] == "FY")

    balance = build_statement(facts, 19617, "balance", *latest_fy)
    by_concept = {line.canonical_concept: line.value for line in balance.lines}
    assert balance.period_end == "2025-12-31"
    assert by_concept["total_assets"] == 4424900000000
    assert by_concept["total_liabilities"] == 4062462000000
    assert by_concept["stockholders_equity"] == 362438000000
    # JPM doesn't use the commercial CashAndCashEquivalentsAtCarryingValue tag at all --
    # it reports CashAndDueFromBanks instead, the bank-specific equivalent concept.
    assert by_concept["cash_and_equivalents"] == 21742000000

    # A bank's balance sheet isn't classified into current/noncurrent, and banks hold
    # loans/deposits rather than receivables/inventory -- these concepts genuinely don't
    # apply, not a tagging gap (mirrors the income-statement bank limitation above).
    for concept in (
        "total_current_assets",
        "total_current_liabilities",
        "accounts_receivable",
        "inventory",
        "long_term_debt",
    ):
        assert concept not in by_concept

    cashflow = build_statement(facts, 19617, "cashflow", *latest_fy)
    by_concept = {line.canonical_concept: line.value for line in cashflow.lines}
    assert by_concept["cash_from_operations"] == -147782000000
    # Banks don't report a discrete capex line in XBRL the way commercial filers do.
    assert "capital_expenditures" not in by_concept

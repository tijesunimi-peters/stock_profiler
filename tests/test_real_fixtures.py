"""Regression tests against real (trimmed) SEC companyfacts payloads.

Unlike test_mapping.py's hand-built RawFacts, these fixtures are genuine SEC filing data
(fetched 2026-07-03, trimmed to the last 2 fiscal years per company -- see
tests/fixtures/README.md) for three companies with meaningfully different income
statement shapes:

  - AAPL: a standard commercial/tech company -- the shape the canonical schema targets.
  - WMT:  a retailer -- has cost_of_revenue/net_income but no discrete gross_profit or
          operating_expenses tag, and no R&D (none of that is a bug; see below).
  - JPM:  a bank -- revenue/expense concepts don't fit the commercial income-statement
          shape at all (no cost_of_revenue/gross_profit/operating_income); this is a
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
    assert coverage_report(period_facts) == {"unmapped": 353, "mapped": 72}

    stmt = build_statement(facts, 320193, "income", 2025, "FY")
    assert stmt.form == "10-K"
    assert stmt.filed == "2025-10-31"
    assert stmt.accession == "0000320193-25-000079"

    by_concept = {line.canonical_concept: line.value for line in stmt.lines}
    assert by_concept["revenue"] == 383285000000
    assert by_concept["net_income"] == 96995000000
    # Apple's recent 10-Ks net interest into "other income/expense" rather than tagging a
    # discrete interest expense line -- absent here is correct, not a mapping gap.
    assert "interest_expense" not in by_concept


def test_wmt_income_statement_has_retailer_shaped_gaps():
    facts = _load("wmt_companyfacts.json", 104169)
    latest_fy = next(p for p in available_periods(facts) if p[1] == "FY")
    assert latest_fy == (2026, "FY")

    period_facts = [f for f in facts if (f.fiscal_year, f.fiscal_period) == latest_fy]
    assert coverage_report(period_facts) == {"unmapped": 448, "mapped": 70}

    stmt = build_statement(facts, 104169, "income", 2026, "FY")
    by_concept = {line.canonical_concept: line.value for line in stmt.lines}
    assert by_concept["revenue"] == 642637000000
    assert by_concept["net_income"] == 15511000000
    assert by_concept["interest_expense"] == 2259000000  # InterestExpenseDebt candidate

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
    assert coverage_report(period_facts) == {"unmapped": 962, "mapped": 41}

    stmt = build_statement(facts, 19617, "income", 2025, "FY")
    assert stmt.form == "10-K"
    assert stmt.accession == "0001628280-26-008131"

    by_concept = {line.canonical_concept: line.value for line in stmt.lines}
    assert by_concept["net_income"] == 49552000000
    # InterestExpenseOperating: the aggregate across JPM's deposit/repo/debt/trading-
    # liability interest expense components (verified against the sum of those tags).
    assert by_concept["interest_expense"] == 81321000000

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

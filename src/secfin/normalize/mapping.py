"""Canonical concept -> candidate US-GAAP tags.

THIS IS THE MOAT. Different companies tag the same economic concept differently, change
tags year to year, and invent extension tags. We map all of that onto a small set of
stable canonical concepts.

Each canonical concept lists candidate source tags in PREFERENCE ORDER. When building a
statement, for a given period we take the first candidate that has a value. Add tags here
as you discover coverage gaps — this table is meant to grow.

Keep this table honest: it is a starter set covering the most common tags, NOT complete.
Track coverage and expand it deliberately (see docs/DATA_MODEL.md).
"""

from __future__ import annotations

from secfin.normalize.schema import StatementType

# canonical_concept -> (human label, ordered candidate us-gaap tags)
CONCEPTS: dict[str, tuple[str, list[str]]] = {
    # --- income statement ---
    "revenue": (
        "Revenue",
        [
            "RevenueFromContractWithCustomerExcludingAssessedTax",
            "Revenues",
            "SalesRevenueNet",
            "RevenueFromContractWithCustomerIncludingAssessedTax",
        ],
    ),
    "cost_of_revenue": (
        "Cost of Revenue",
        ["CostOfRevenue", "CostOfGoodsAndServicesSold", "CostOfGoodsSold"],
    ),
    "gross_profit": ("Gross Profit", ["GrossProfit"]),
    "operating_expenses": ("Operating Expenses", ["OperatingExpenses"]),
    "research_and_development": (
        "Research & Development",
        ["ResearchAndDevelopmentExpense"],
    ),
    "sga_expense": (
        "Selling, General & Administrative",
        ["SellingGeneralAndAdministrativeExpense", "GeneralAndAdministrativeExpense"],
    ),
    "operating_income": (
        "Operating Income",
        ["OperatingIncomeLoss"],
    ),
    "interest_expense": ("Interest Expense", ["InterestExpense"]),
    "income_before_tax": (
        "Income Before Tax",
        ["IncomeLossFromContinuingOperationsBeforeIncomeTaxesExtraordinaryItemsNoncontrollingInterest"],
    ),
    "income_tax_expense": ("Income Tax Expense", ["IncomeTaxExpenseBenefit"]),
    "net_income": (
        "Net Income",
        ["NetIncomeLoss", "ProfitLoss"],
    ),
    "eps_basic": ("EPS (Basic)", ["EarningsPerShareBasic"]),
    "eps_diluted": ("EPS (Diluted)", ["EarningsPerShareDiluted"]),
    # --- balance sheet (instant facts) ---
    "cash_and_equivalents": (
        "Cash & Cash Equivalents",
        ["CashAndCashEquivalentsAtCarryingValue"],
    ),
    "total_current_assets": ("Total Current Assets", ["AssetsCurrent"]),
    "total_assets": ("Total Assets", ["Assets"]),
    "total_current_liabilities": ("Total Current Liabilities", ["LiabilitiesCurrent"]),
    "total_liabilities": ("Total Liabilities", ["Liabilities"]),
    "long_term_debt": ("Long-Term Debt", ["LongTermDebtNoncurrent", "LongTermDebt"]),
    "stockholders_equity": (
        "Stockholders' Equity",
        ["StockholdersEquity", "StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest"],
    ),
    # --- cash flow ---
    "cash_from_operations": (
        "Net Cash from Operations",
        ["NetCashProvidedByUsedInOperatingActivities"],
    ),
    "cash_from_investing": (
        "Net Cash from Investing",
        ["NetCashProvidedByUsedInInvestingActivities"],
    ),
    "cash_from_financing": (
        "Net Cash from Financing",
        ["NetCashProvidedByUsedInFinancingActivities"],
    ),
    "capital_expenditures": (
        "Capital Expenditures",
        ["PaymentsToAcquirePropertyPlantAndEquipment", "PaymentsForCapitalImprovements"],
    ),
    "depreciation_amortization": (
        "Depreciation & Amortization",
        ["DepreciationDepletionAndAmortization", "DepreciationAmortizationAndAccretionNet"],
    ),
}

# Which canonical concepts belong on which statement, in display order.
STATEMENT_CONCEPTS: dict[StatementType, list[str]] = {
    "income": [
        "revenue",
        "cost_of_revenue",
        "gross_profit",
        "research_and_development",
        "sga_expense",
        "operating_expenses",
        "operating_income",
        "interest_expense",
        "income_before_tax",
        "income_tax_expense",
        "net_income",
        "eps_basic",
        "eps_diluted",
    ],
    "balance": [
        "cash_and_equivalents",
        "total_current_assets",
        "total_assets",
        "total_current_liabilities",
        "total_liabilities",
        "long_term_debt",
        "stockholders_equity",
    ],
    "cashflow": [
        "cash_from_operations",
        "cash_from_investing",
        "cash_from_financing",
        "capital_expenditures",
        "depreciation_amortization",
    ],
}

# Reverse index: gaap_tag -> canonical_concept (first concept that claims the tag wins).
_TAG_TO_CONCEPT: dict[str, str] = {}
for _concept, (_label, _tags) in CONCEPTS.items():
    for _t in _tags:
        _TAG_TO_CONCEPT.setdefault(_t, _concept)


def concept_for_tag(gaap_tag: str) -> str | None:
    """Return the canonical concept a raw GAAP tag maps to, if any."""
    return _TAG_TO_CONCEPT.get(gaap_tag)


def label_for_concept(concept: str) -> str:
    entry = CONCEPTS.get(concept)
    return entry[0] if entry else concept


def candidate_tags(concept: str) -> list[str]:
    entry = CONCEPTS.get(concept)
    return list(entry[1]) if entry else []

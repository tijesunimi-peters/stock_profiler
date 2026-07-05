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
    "interest_expense": (
        "Interest Expense",
        [
            "InterestExpense",
            # Confirmed via real filings (2026-07-03): MSFT/TGT use InterestExpenseNonoperating,
            # WMT uses InterestExpenseDebt, and banks (JPM/BAC) use InterestExpenseOperating as
            # the aggregate across their deposit/repo/debt/trading-liability interest expense
            # components (verified against JPM: sum of those components matches this tag).
            "InterestExpenseNonoperating",
            "InterestExpenseDebt",
            "InterestExpenseOperating",
        ],
    ),
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
        # Banks (JPM) don't use the commercial CashAndCashEquivalentsAtCarryingValue tag at
        # all -- confirmed via real filing (2026-07-04) -- they report CashAndDueFromBanks
        # instead, the bank-specific equivalent concept.
        ["CashAndCashEquivalentsAtCarryingValue", "CashAndDueFromBanks"],
    ),
    "total_current_assets": ("Total Current Assets", ["AssetsCurrent"]),
    "total_assets": ("Total Assets", ["Assets"]),
    "total_current_liabilities": ("Total Current Liabilities", ["LiabilitiesCurrent"]),
    "total_liabilities": ("Total Liabilities", ["Liabilities"]),
    "accounts_receivable": (
        "Accounts Receivable",
        # AccountsReceivableNetCurrent is trade receivables (what DSO wants); ReceivablesNetCurrent
        # is broader (includes other receivables) and is the fallback when the trade tag is absent.
        ["AccountsReceivableNetCurrent", "ReceivablesNetCurrent"],
    ),
    "inventory": ("Inventory", ["InventoryNet"]),
    "long_term_debt": ("Long-Term Debt", ["LongTermDebtNoncurrent", "LongTermDebt"]),
    "debt_current": (
        "Current Debt",
        # KNOWN LIMITATION of pick-one selection: some filers report the current portion of
        # long-term debt AND short-term borrowings as SEPARATE lines with no aggregate
        # DebtCurrent tag. Picking one then undercounts total current debt. DebtCurrent (when
        # present) is the comprehensive single tag, so it leads. A correct total in the split
        # case needs a "sum multiple tags" capability the mapping doesn't have yet — track as
        # a coverage gap rather than pretending the single pick is always complete.
        ["DebtCurrent", "LongTermDebtCurrent", "ShortTermBorrowings"],
    ),
    "stockholders_equity": (
        "Stockholders' Equity",
        ["StockholdersEquity", "StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest"],
    ),
    # --- share counts ---
    # UNIT WARNING: these facts are reported in "shares" (or dei), NOT USD. Any metric using
    # them (book value/share, FCF/share, dilution trend) must be unit-aware and must not treat
    # a share count as dollars. INSTANT vs DURATION also differs (see notes) — matters for TTM.
    "shares_outstanding": (
        "Shares Outstanding",
        # INSTANT (point-in-time). CommonStockSharesOutstanding is us-gaap (balance sheet).
        # EntityCommonStockSharesOutstanding lives in the *dei* taxonomy, so it only matches if
        # ingestion flattens dei facts too — fetch_raw_facts defaults to taxonomy="us-gaap".
        # VERIFY dei is ingested, otherwise this fallback never fires and multi-class filers
        # (who often report per-class us-gaap counts) may miss a clean total.
        ["CommonStockSharesOutstanding", "EntityCommonStockSharesOutstanding"],
    ),
    "shares_basic": (
        "Weighted Avg Basic Shares",
        # DURATION (weighted average over the period), reported on the income statement near EPS.
        ["WeightedAverageNumberOfSharesOutstandingBasic"],
    ),
    "shares_diluted": (
        "Weighted Avg Diluted Shares",
        # DURATION. Use as the denominator for FCF/share; the series is the dilution/buyback signal.
        ["WeightedAverageNumberOfDilutedSharesOutstanding"],
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
        "shares_basic",
        "shares_diluted",
    ],
    "balance": [
        "cash_and_equivalents",
        "accounts_receivable",
        "inventory",
        "total_current_assets",
        "total_assets",
        "total_current_liabilities",
        "debt_current",
        "total_liabilities",
        "long_term_debt",
        "stockholders_equity",
        "shares_outstanding",
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

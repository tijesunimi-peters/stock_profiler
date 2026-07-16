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
    # --- income statement, tier 2 (ROADMAP_DATA_DEPTH Phase 2, verified 2026-07-16
    #     against the AAPL/WMT/JPM fixtures like everything else here) ---
    "comprehensive_income": (
        "Comprehensive Income",
        # Parent-attributable first, including-NCI as fallback — same preference shape
        # as net_income's [NetIncomeLoss, ProfitLoss] (WMT tags both; they differ).
        [
            "ComprehensiveIncomeNetOfTax",
            "ComprehensiveIncomeNetOfTaxIncludingPortionAttributableToNoncontrollingInterest",
        ],
    ),
    "dividends_per_share": (
        # UNIT WARNING: USD/shares, not USD — declared per-share dividend for the period.
        "Dividends Per Share (Declared)",
        ["CommonStockDividendsPerShareDeclared"],
    ),
    "share_based_compensation": (
        "Share-Based Compensation",
        # The income-statement expense element leads, NOT the aggregate cash-flow addback
        # (ShareBasedCompensation): in 10-Qs AAPL tags the addback only as the YTD
        # duration, so leading with it served a 6-month value on a discrete-quarter
        # income statement (caught live 2026-07-16 — the cross-candidate variant of the
        # comparative-column trap; candidate selection is per-concept "first tag with a
        # value", so a YTD-only first candidate shadows a discrete-quarter second one).
        # AllocatedShareBasedCompensationExpense carries the discrete quarter and its FY
        # values equal the aggregate's; JPM tags only the aggregate but with discrete
        # quarters, which the per-tag span tie-break already picks. Verified all three.
        ["AllocatedShareBasedCompensationExpense", "ShareBasedCompensation"],
    ),
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
    # --- balance sheet, tier 2 (instant facts; verified 2026-07-16 vs fixtures) ---
    "ppe_net": (
        "Property, Plant & Equipment (Net)",
        # JPM tags no PP&E line at all (premises/equipment stay untagged in XBRL) —
        # structural absence, not a candidate gap. See DATA_MODEL.md.
        ["PropertyPlantAndEquipmentNet"],
    ),
    "goodwill": (
        "Goodwill",
        # AAPL's recent 10-Ks don't break goodwill out at all — absent is correct there.
        ["Goodwill"],
    ),
    "intangible_assets": (
        "Intangible Assets (Net, Excl. Goodwill)",
        # KNOWN LIMITATION, same class as debt_current: the fallback is finite-lived
        # ONLY, so a filer that also carries indefinite-lived intangibles undercounts
        # when served from it (JPM: 1.3B finite served, another ~1.3B indefinite-lived
        # tagged separately). The comprehensive tag leads; a correct total in the split
        # case needs "sum multiple tags", which the mapping doesn't have.
        ["IntangibleAssetsNetExcludingGoodwill", "FiniteLivedIntangibleAssetsNet"],
    ),
    "accounts_payable": (
        "Accounts Payable",
        # Trade-only variant as fallback for filers that tag nothing broader (mirrors
        # accounts_receivable's trade/broader pairing, in the other direction). JPM tags
        # only payables-combined-with-accruals aggregates — not like-for-like, unmapped.
        ["AccountsPayableCurrent", "AccountsPayableTradeCurrent"],
    ),
    "deferred_revenue_current": (
        "Deferred Revenue (Current)",
        # DECISION (2026-07-16, ROADMAP_DATA_DEPTH Phase 2): serve the CURRENT portion,
        # not the total. The current portion is the balance-sheet-face line and the one
        # tagged most consistently across filers; a pick-one candidate list mixing the
        # total (ContractWithCustomerLiability) with current-only would silently change
        # meaning per company. The total stays unserved until it earns its own concept.
        ["ContractWithCustomerLiabilityCurrent"],
    ),
    "retained_earnings": (
        # Negative = accumulated deficit (AAPL is negative from buybacks — sign is real).
        "Retained Earnings (Accumulated Deficit)",
        ["RetainedEarningsAccumulatedDeficit"],
    ),
    # DECISION (2026-07-16): marketable securities ship as TWO concepts — there is no
    # reliable total tag (AAPL tags only the current/noncurrent pair), and pick-one
    # can't sum. Same precedent as the long_term_debt / debt_current split.
    "marketable_securities_current": (
        "Marketable Securities (Current)",
        ["MarketableSecuritiesCurrent"],
    ),
    "marketable_securities_noncurrent": (
        "Marketable Securities (Noncurrent)",
        ["MarketableSecuritiesNoncurrent"],
    ),
    "operating_lease_liabilities": (
        "Operating Lease Liabilities (Total)",
        # DECISION (2026-07-16): the TOTAL, not the current/noncurrent split — all three
        # fixture shapes tag OperatingLeaseLiability (JPM tags ONLY the total), and
        # falling back to one portion would silently undercount. Filers tagging only the
        # split are a documented gap, not a fallback.
        ["OperatingLeaseLiability"],
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
    # --- cash flow, tier 2 (verified 2026-07-16 vs fixtures) ---
    "dividends_paid": (
        "Dividends Paid",
        # The aggregate tag includes preferred dividends where a filer has them (JPM);
        # the common-only variant is the fallback (WMT tags only that, with NCI
        # distributions under a separate tag we deliberately don't fold in).
        ["PaymentsOfDividends", "PaymentsOfDividendsCommonStock"],
    ),
    "share_repurchases": (
        "Share Repurchases",
        # Common stock only — preferred redemptions (JPM tags them separately) are a
        # different economic event and stay unmapped.
        ["PaymentsForRepurchaseOfCommonStock"],
    ),
    "income_taxes_paid": (
        "Income Taxes Paid (Net)",
        ["IncomeTaxesPaidNet"],
    ),
    # Working-capital deltas — shipped as a set (they're read together). SIGN WARNING:
    # values carry the us-gaap element's natural sign (positive = the balance INCREASED),
    # not the cash-flow statement's presentation sign; an increase in receivables/
    # inventories is a USE of cash, an increase in payables is a SOURCE. Banks (JPM)
    # have no working-capital section at all — structural absence.
    "change_in_receivables": (
        "Change in Receivables",
        # WMT tags the combined receivables variant only. AAPL's separate
        # IncreaseDecreaseInOtherReceivables (vendor non-trade) is a different concept —
        # deliberately unmapped.
        ["IncreaseDecreaseInAccountsReceivable", "IncreaseDecreaseInAccountsAndOtherReceivables"],
    ),
    "change_in_inventories": (
        "Change in Inventories",
        # Retailers (WMT) use the retail-specific element.
        ["IncreaseDecreaseInInventories", "IncreaseDecreaseInRetailRelatedInventories"],
    ),
    "change_in_payables": (
        "Change in Accounts Payable",
        ["IncreaseDecreaseInAccountsPayable"],
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
        "comprehensive_income",
        "eps_basic",
        "eps_diluted",
        "dividends_per_share",
        "shares_basic",
        "shares_diluted",
        "share_based_compensation",
    ],
    "balance": [
        "cash_and_equivalents",
        "marketable_securities_current",
        "accounts_receivable",
        "inventory",
        "total_current_assets",
        "ppe_net",
        "goodwill",
        "intangible_assets",
        "marketable_securities_noncurrent",
        "total_assets",
        "accounts_payable",
        "deferred_revenue_current",
        "total_current_liabilities",
        "debt_current",
        "total_liabilities",
        "long_term_debt",
        "operating_lease_liabilities",
        "retained_earnings",
        "stockholders_equity",
        "shares_outstanding",
    ],
    "cashflow": [
        "cash_from_operations",
        "cash_from_investing",
        "cash_from_financing",
        "capital_expenditures",
        "depreciation_amortization",
        "change_in_receivables",
        "change_in_inventories",
        "change_in_payables",
        "dividends_paid",
        "share_repurchases",
        "income_taxes_paid",
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

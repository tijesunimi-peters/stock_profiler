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
    # eps/share concepts: the combined BasicAndDiluted tags are what small filers use
    # INSTEAD of separate basic/diluted lines (verified store-wide 2026-07-16, zero
    # conflicts across 60 filers) -- both concepts serving the same value for such a
    # filer is literally what "basic and diluted" means.
    "eps_basic": ("EPS (Basic)", ["EarningsPerShareBasic", "EarningsPerShareBasicAndDiluted"]),
    "eps_diluted": ("EPS (Diluted)", ["EarningsPerShareDiluted", "EarningsPerShareBasicAndDiluted"]),
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
    # --- income statement, tranche 1 of the cluster-driven expansion (2026-07-16,
    #     ROADMAP_DATA_DEPTH Phase 2b; every cluster verified store-wide for
    #     coexistence conflicts before inclusion -- see DATA_MODEL.md) ---
    "interest_income": (
        "Interest & Investment Income",
        ["InvestmentIncomeInterest"],
    ),
    "nonoperating_income_expense": (
        "Nonoperating Income (Expense)",
        # Aggregate first; the "Other" component is the fallback for filers whose only
        # nonoperating line is that tag. 13/50 filers tag BOTH with different values --
        # confirming aggregate vs component, so pick-one correctly prefers the
        # aggregate; a component-only filer may still understate (debt_current-class
        # caveat, documented).
        ["NonoperatingIncomeExpense", "OtherNonoperatingIncomeExpense"],
    ),
    "net_income_noncontrolling": (
        "Net Income Attributable to Noncontrolling Interest",
        ["NetIncomeLossAttributableToNoncontrollingInterest"],
    ),
    "other_comprehensive_income": (
        "Other Comprehensive Income (Loss)",
        # NOTE the asymmetry with comprehensive_income: for OCI the BARE us-gaap tag is
        # the including-NCI aggregate and the parent share is the suffixed variant
        # (verified against WMT: bare 1.009B vs parent 0.835B). Parent-attributable
        # leads, consistent with net_income/comprehensive_income.
        [
            "OtherComprehensiveIncomeLossNetOfTaxPortionAttributableToParent",
            "OtherComprehensiveIncomeLossNetOfTax",
        ],
    ),
    "current_income_tax_expense": (
        "Current Income Tax Expense",
        ["CurrentIncomeTaxExpenseBenefit"],
    ),
    "deferred_income_tax_expense": (
        "Deferred Income Tax Expense",
        ["DeferredIncomeTaxExpenseBenefit"],
    ),
    "effective_tax_rate": (
        # UNIT WARNING: 'pure' (a ratio, not USD).
        "Effective Tax Rate",
        ["EffectiveIncomeTaxRateContinuingOperations"],
    ),
    "amortization_of_intangibles": (
        "Amortization of Intangibles",
        ["AmortizationOfIntangibleAssets"],
    ),
    "goodwill_impairment": (
        "Goodwill Impairment",
        ["GoodwillImpairmentLoss"],
    ),
    "asset_impairment": (
        "Asset Impairment Charges",
        # Aggregate first; long-lived-assets-specific tag is a subset fallback
        # (verified: where both exist, aggregate >= subset).
        ["AssetImpairmentCharges", "ImpairmentOfLongLivedAssetsHeldForUse"],
    ),
    "operating_lease_cost": (
        "Operating Lease Cost",
        # Operating-scoped variants only -- the aggregate LeaseCost tag (which folds in
        # finance-lease cost) is deliberately NOT a candidate.
        ["OperatingLeaseCost", "OperatingLeaseExpense", "LeaseAndRentalExpense"],
    ),
    # --- balance sheet (instant facts) ---
    "cash_and_equivalents": (
        "Cash & Cash Equivalents",
        # Banks (JPM) don't use the commercial CashAndCashEquivalentsAtCarryingValue tag at
        # all -- confirmed via real filing (2026-07-04) -- they report CashAndDueFromBanks
        # instead, the bank-specific equivalent concept. Bare `Cash` is the last-resort
        # fallback: many small filers' entire cash line is that tag (42 filers use it),
        # but where a filer tags BOTH, Cash is a narrower quantity (5/65 conflicts,
        # verified 2026-07-16) -- which is exactly why it's last.
        ["CashAndCashEquivalentsAtCarryingValue", "CashAndDueFromBanks", "Cash"],
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
        # meaning per company. The total is served by `deferred_revenue` (tranche 1).
        # Legacy pre-ASC-606 current tag as fallback (32 filers still use it; zero
        # coexistence conflicts, verified 2026-07-16).
        ["ContractWithCustomerLiabilityCurrent", "DeferredRevenueCurrent"],
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
        # split are a documented gap, not a fallback -- the split is served by the two
        # precisely-scoped concepts below instead (tranche 1).
        ["OperatingLeaseLiability"],
    ),
    # --- balance sheet, tranche 1 of the cluster-driven expansion (2026-07-16) ---
    "prepaid_expenses": (
        "Prepaid Expenses",
        # Narrow tag first; the combined prepaid+other-assets line is the fallback for
        # filers that don't split it (verified: where both exist, combined is the
        # superset) -- broader-fallback caveat, accounts_receivable precedent.
        ["PrepaidExpenseCurrent", "PrepaidExpenseAndOtherAssetsCurrent"],
    ),
    "allowance_for_doubtful_accounts": (
        "Allowance for Doubtful Accounts",
        # Contra-asset (reported positive). Current-scoped tag first; the unclassified
        # variant is what filers without a classified split use (0 conflicts across 38).
        ["AllowanceForDoubtfulAccountsReceivableCurrent", "AllowanceForDoubtfulAccountsReceivable"],
    ),
    "other_assets_current": ("Other Current Assets", ["OtherAssetsCurrent"]),
    "assets_noncurrent": ("Total Noncurrent Assets", ["AssetsNoncurrent"]),
    "other_assets_noncurrent": ("Other Noncurrent Assets", ["OtherAssetsNoncurrent"]),
    "operating_lease_right_of_use_asset": (
        "Operating Lease Right-of-Use Asset",
        ["OperatingLeaseRightOfUseAsset"],
    ),
    "ppe_gross": (
        "Property, Plant & Equipment (Gross)",
        ["PropertyPlantAndEquipmentGross"],
    ),
    "accumulated_depreciation": (
        # Contra-asset (reported positive): ppe_gross - accumulated_depreciation = ppe_net.
        "Accumulated Depreciation",
        ["AccumulatedDepreciationDepletionAndAmortizationPropertyPlantAndEquipment"],
    ),
    "cash_and_restricted_cash": (
        # The ASU 2016-18 cash-flow reconciliation total (cash + equivalents + restricted).
        "Cash, Equivalents & Restricted Cash",
        ["CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalents"],
    ),
    "accrued_liabilities": (
        "Accrued Liabilities",
        # The aggregate accrued line only. OtherAccruedLiabilitiesCurrent (a residual
        # among itemized accruals) and the combined AP+accrued tag are DIFFERENT
        # quantities, deliberately not candidates -- the combined line has its own
        # concept below.
        ["AccruedLiabilitiesCurrent"],
    ),
    "accounts_payable_and_accrued_liabilities": (
        # For filers that report one combined line INSTEAD of separate accounts_payable
        # / accrued_liabilities -- scope is in the name, never blended into either.
        "Accounts Payable & Accrued Liabilities (Combined)",
        ["AccountsPayableAndAccruedLiabilitiesCurrent"],
    ),
    "other_liabilities_current": ("Other Current Liabilities", ["OtherLiabilitiesCurrent"]),
    "other_liabilities_noncurrent": ("Other Noncurrent Liabilities", ["OtherLiabilitiesNoncurrent"]),
    "liabilities_noncurrent": ("Total Noncurrent Liabilities", ["LiabilitiesNoncurrent"]),
    "deferred_revenue": (
        # The TOTAL contract liability (current + noncurrent), completing the
        # deferred_revenue_current decision above; legacy pre-ASC-606 total as fallback.
        "Deferred Revenue (Total)",
        ["ContractWithCustomerLiability", "DeferredRevenue"],
    ),
    "operating_lease_liabilities_current": (
        "Operating Lease Liabilities (Current)",
        ["OperatingLeaseLiabilityCurrent"],
    ),
    "operating_lease_liabilities_noncurrent": (
        "Operating Lease Liabilities (Noncurrent)",
        ["OperatingLeaseLiabilityNoncurrent"],
    ),
    "finance_lease_liabilities": (
        "Finance Lease Liabilities (Total)",
        # Total only, mirroring operating_lease_liabilities.
        ["FinanceLeaseLiability"],
    ),
    "common_stock_value": ("Common Stock (Par Value Carried)", ["CommonStockValue"]),
    "preferred_stock_value": ("Preferred Stock (Par Value Carried)", ["PreferredStockValue"]),
    "additional_paid_in_capital": (
        "Additional Paid-In Capital",
        ["AdditionalPaidInCapital", "AdditionalPaidInCapitalCommonStock"],
    ),
    "accumulated_oci": (
        "Accumulated Other Comprehensive Income (Loss)",
        ["AccumulatedOtherComprehensiveIncomeLossNetOfTax"],
    ),
    "noncontrolling_interest": (
        "Noncontrolling Interest (Equity)",
        ["MinorityInterest"],
    ),
    "liabilities_and_equity": (
        # The balance-sheet grand total. Notably the only aggregate WMT tags (its
        # missing total_liabilities is a documented gap) -- users can derive.
        "Total Liabilities & Stockholders' Equity",
        ["LiabilitiesAndStockholdersEquity"],
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
        # DURATION (weighted average over the period), reported on the income statement near
        # EPS. Combined BasicAndDiluted fallback: same rationale as eps_basic/eps_diluted.
        [
            "WeightedAverageNumberOfSharesOutstandingBasic",
            "WeightedAverageNumberOfShareOutstandingBasicAndDiluted",
        ],
    ),
    "shares_diluted": (
        "Weighted Avg Diluted Shares",
        # DURATION. Use as the denominator for FCF/share; the series is the dilution/buyback signal.
        [
            "WeightedAverageNumberOfDilutedSharesOutstanding",
            "WeightedAverageNumberOfShareOutstandingBasicAndDiluted",
        ],
    ),
    # --- cash flow ---
    # cash_from_*: the ContinuingOperations variants are what filers WITHOUT
    # discontinued operations sometimes tag as their only total (equal by definition
    # there); where a filer tags both, they differ only when discontinued ops exist,
    # and the aggregate-first order serves the true total (verified store-wide
    # 2026-07-16: 1-2 such filers, aggregate correct).
    "cash_from_operations": (
        "Net Cash from Operations",
        [
            "NetCashProvidedByUsedInOperatingActivities",
            "NetCashProvidedByUsedInOperatingActivitiesContinuingOperations",
        ],
    ),
    "cash_from_investing": (
        "Net Cash from Investing",
        [
            "NetCashProvidedByUsedInInvestingActivities",
            "NetCashProvidedByUsedInInvestingActivitiesContinuingOperations",
        ],
    ),
    "cash_from_financing": (
        "Net Cash from Financing",
        [
            "NetCashProvidedByUsedInFinancingActivities",
            "NetCashProvidedByUsedInFinancingActivitiesContinuingOperations",
        ],
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
        # Net-of-refunds first; the gross variant is the fallback for filers that tag
        # only it (where both exist, net <= gross -- verified, 2 such filers).
        ["IncomeTaxesPaidNet", "IncomeTaxesPaid"],
    ),
    # --- cash flow, tranche 1 of the cluster-driven expansion (2026-07-16) ---
    "interest_paid": (
        "Interest Paid",
        # Net-of-capitalized first, gross fallback -- mirrors income_taxes_paid.
        ["InterestPaidNet", "InterestPaid"],
    ),
    "acquisitions_net_of_cash": (
        "Acquisitions (Net of Cash Acquired)",
        ["PaymentsToAcquireBusinessesNetOfCashAcquired"],
    ),
    "proceeds_from_stock_issuance": (
        "Proceeds from Stock Issuance",
        ["ProceedsFromIssuanceOfCommonStock"],
    ),
    "proceeds_from_long_term_debt": (
        "Proceeds from Long-Term Debt",
        ["ProceedsFromIssuanceOfLongTermDebt"],
    ),
    "repayments_of_debt": (
        "Repayments of Debt",
        # Aggregate first; long-term-only as subset fallback (debt_current-class
        # caveat: a filer tagging LTD and notes-payable repayments separately with no
        # aggregate undercounts from the fallback).
        ["RepaymentsOfDebt", "RepaymentsOfLongTermDebt"],
    ),
    "effect_of_exchange_rate_on_cash": (
        "FX Effect on Cash",
        # Modern (incl. restricted cash) first, pre-ASU-2016-18 variant as fallback.
        [
            "EffectOfExchangeRateOnCashCashEquivalentsRestrictedCashAndRestrictedCashEquivalents",
            "EffectOfExchangeRateOnCashAndCashEquivalents",
        ],
    ),
    "change_in_cash": (
        "Net Change in Cash",
        # Both candidates include the FX effect; the ExcludingExchangeRateEffect tag is
        # a different quantity and deliberately not a candidate.
        [
            "CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalentsPeriodIncreaseDecreaseIncludingExchangeRateEffect",
            "CashAndCashEquivalentsPeriodIncreaseDecrease",
        ],
    ),
    # Additional working-capital deltas (same natural-sign warning as the set above).
    "change_in_prepaid_expenses": (
        "Change in Prepaid Expenses",
        # Narrow first, combined prepaid+other-assets fallback (prepaid_expenses twin).
        ["IncreaseDecreaseInPrepaidExpense", "IncreaseDecreaseInPrepaidDeferredExpenseAndOtherAssets"],
    ),
    "change_in_accrued_liabilities": (
        "Change in Accrued Liabilities",
        ["IncreaseDecreaseInAccruedLiabilities"],
    ),
    "change_in_payables_and_accrued": (
        # The combined-line twin of accounts_payable_and_accrued_liabilities -- never
        # blended into change_in_payables or change_in_accrued_liabilities.
        "Change in Payables & Accrued (Combined)",
        ["IncreaseDecreaseInAccountsPayableAndAccruedLiabilities"],
    ),
    "change_in_deferred_revenue": (
        "Change in Deferred Revenue",
        ["IncreaseDecreaseInContractWithCustomerLiability", "IncreaseDecreaseInDeferredRevenue"],
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
        "interest_income",
        "nonoperating_income_expense",
        "income_before_tax",
        "income_tax_expense",
        "current_income_tax_expense",
        "deferred_income_tax_expense",
        "effective_tax_rate",
        "net_income",
        "net_income_noncontrolling",
        "comprehensive_income",
        "other_comprehensive_income",
        "eps_basic",
        "eps_diluted",
        "dividends_per_share",
        "shares_basic",
        "shares_diluted",
        "share_based_compensation",
        "amortization_of_intangibles",
        "goodwill_impairment",
        "asset_impairment",
        "operating_lease_cost",
    ],
    "balance": [
        "cash_and_equivalents",
        "cash_and_restricted_cash",
        "marketable_securities_current",
        "accounts_receivable",
        "allowance_for_doubtful_accounts",
        "inventory",
        "prepaid_expenses",
        "other_assets_current",
        "total_current_assets",
        "ppe_gross",
        "accumulated_depreciation",
        "ppe_net",
        "operating_lease_right_of_use_asset",
        "goodwill",
        "intangible_assets",
        "marketable_securities_noncurrent",
        "other_assets_noncurrent",
        "assets_noncurrent",
        "total_assets",
        "accounts_payable",
        "accrued_liabilities",
        "accounts_payable_and_accrued_liabilities",
        "deferred_revenue_current",
        "operating_lease_liabilities_current",
        "other_liabilities_current",
        "total_current_liabilities",
        "debt_current",
        "deferred_revenue",
        "operating_lease_liabilities_noncurrent",
        "other_liabilities_noncurrent",
        "liabilities_noncurrent",
        "total_liabilities",
        "long_term_debt",
        "operating_lease_liabilities",
        "finance_lease_liabilities",
        "common_stock_value",
        "preferred_stock_value",
        "additional_paid_in_capital",
        "retained_earnings",
        "accumulated_oci",
        "noncontrolling_interest",
        "stockholders_equity",
        "liabilities_and_equity",
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
        "change_in_prepaid_expenses",
        "change_in_payables",
        "change_in_accrued_liabilities",
        "change_in_payables_and_accrued",
        "change_in_deferred_revenue",
        "acquisitions_net_of_cash",
        "dividends_paid",
        "share_repurchases",
        "proceeds_from_stock_issuance",
        "proceeds_from_long_term_debt",
        "repayments_of_debt",
        "effect_of_exchange_rate_on_cash",
        "change_in_cash",
        "income_taxes_paid",
        "interest_paid",
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

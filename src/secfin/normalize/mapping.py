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
    # --- §04 capital structure (2026-08-02) ---
    # Coverage measured on the FULL 121M-fact volume, 60 fully-backfilled filers across 71 SIC
    # groups (not the 45-filer V1 basket). Every figure below is measured, not predicted.
    "shares_issued": (
        "Shares Issued",
        # INSTANT. 83.3% recent. Issued >= outstanding; the gap is treasury stock.
        ["CommonStockSharesIssued"],
    ),
    "shares_issued_options_exercised": (
        "Shares Issued on Option Exercise",
        # DURATION. 31.7% recent (83.3% ever). A roll-forward ROW, not a total -- it is one of the ways the count moved.
        ["StockIssuedDuringPeriodSharesStockOptionsExercised"],
    ),
    "shares_issued_new": (
        "Shares Issued, New Issues",
        # DURATION. 11.7% recent (51.7% ever); median last use 2019 -- largely retired.
        ["StockIssuedDuringPeriodSharesNewIssues"],
    ),
    "shares_repurchased_count": (
        "Shares Repurchased",
        # DURATION, in SHARES. 23.3% + 13.3% recent (50.0% + 26.7% ever) for the retired variant -- both are mapped because
        # filers split cleanly between them (AAPL tags only `AndRetired`, MSFT only the plain one).
        #
        # NOT the `…DuringPeriodValue` tags, which are more common (5/10 deep filers each) and
        # are DOLLARS. A share roll-forward that put dollars in a share column would reconcile to
        # nothing, and the error would be invisible because both are large positive numbers.
        ["StockRepurchasedDuringPeriodShares", "StockRepurchasedAndRetiredDuringPeriodShares"],
    ),
    "options_outstanding": (
        "Options Outstanding",
        # INSTANT, in SHARES. 45.0% recent (83.3% ever) -- option grants have themselves declined,
        # so a blank is often "this filer grants RSUs, not options". The `…IntrinsicValue` sibling is marginally more common
        # (9/10 vs 8/10 deep) and is DOLLARS -- same trap as the repurchase count above.
        ["ShareBasedCompensationArrangementByShareBasedPaymentAwardOptionsOutstandingNumber"],
    ),
    "unvested_awards": (
        "Unvested Awards",
        # INSTANT, in SHARES. 13.3% recent, and the median filer last tagged it in **2018** -- this
        # is not thin, it is effectively RETIRED. The card that needs it says so rather than
        # implying each individual filer chose not to disclose.
        #
        # `EmployeeServiceShareBasedCompensationNonvestedAwardsTotalCompensationCostNotYetRecognized`
        # is far more common (7/10 deep filers vs 4/10) and is the obvious substitute. It is
        # UNRECOGNISED COST IN DOLLARS, not a count of unvested shares. Dilution overhang asks how
        # many shares could arrive; that tag answers what expense has yet to be booked. Filling a
        # share column with it would raise coverage and make the card wrong.
        [
            "ShareBasedCompensationArrangementByShareBasedPaymentAwardEquityInstrumentsOther"
            "ThanOptionsNonvestedNumber"
        ],
    ),
    "buyback_authorized": (
        "Repurchase Program Authorized",
        # USD. 13.3% recent (48.3% ever) -- filers have largely stopped tagging the authorisation.
        # The unsuffixed variant is at 0.0% since FY2023 (median last use 2013) and is kept ONLY so
        # a query for an old fiscal year still resolves; it will never serve a current card.
        ["StockRepurchaseProgramAuthorizedAmount1", "StockRepurchaseProgramAuthorizedAmount"],
    ),
    "buyback_remaining": (
        "Repurchase Program Remaining",
        # USD. 25.0% recent (41.7% ever); median last use 2025, so this one is still live -- unlike
        # the authorisation above. The unsuffixed variant is 0.0% since FY2023 (median 2014).
        [
            "StockRepurchaseProgramRemainingAuthorizedRepurchaseAmount1",
            "StockRepurchaseProgramRemainingAuthorizedRepurchaseAmount",
        ],
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
    # ---------------------------------------------------------------- footnote detail (§02)
    #
    # These do not sit on a statement -- they are the footnote cards on the company Overview, and
    # they reach the API through FOOTNOTE_GROUPS below rather than STATEMENT_CONCEPTS.
    #
    # Every tag here was taken from a COVERAGE SURVEY of the stored facts (scripts/v1_tag_coverage.py,
    # 2026-08-02), not from the taxonomy docs. That matters: the survey's "what filers tag instead"
    # pass showed the obvious candidate is often the less-used one. The plain inventory components
    # beat the `NetOfReserves` variants; `StockRepurchasedDuringPeriodShares` beats the `AndRetired`
    # spelling; the CECL-era allowance tags scored ZERO while the legacy ones carry the data.
    # Coverage is noted per group -- these are footnote disclosures, so a concept absent for a given
    # filer is normal and must read as N/A rather than as a gap.

    # Remaining performance obligations (~29% of filers; 44% of the well-covered ones).
    "rpo_total": (
        "Remaining Performance Obligations",
        ["RevenueRemainingPerformanceObligation"],
    ),
    "rpo_pct_next_12m": (
        "RPO Expected Within 12 Months",
        ["RevenueRemainingPerformanceObligationPercentage"],
    ),

    # Inventory composition (~27%). Plain components first -- they outscored `NetOfReserves` 27% to
    # 18% in the survey, which is the reverse of what the taxonomy's naming suggests.
    "inventory_raw_materials": (
        "Raw Materials",
        ["InventoryRawMaterials", "InventoryRawMaterialsNetOfReserves"],
    ),
    "inventory_work_in_process": (
        "Work in Process",
        ["InventoryWorkInProcess", "InventoryWorkInProcessNetOfReserves"],
    ),
    "inventory_finished_goods": (
        "Finished Goods",
        ["InventoryFinishedGoods", "InventoryFinishedGoodsNetOfReserves"],
    ),

    # Debt maturity ladder (~60%, 89% of the well-covered). Six buckets: filers use either
    # "NextTwelveMonths" or "RemainderOfFiscalYear" for the near leg, never both.
    "debt_maturity_y1": (
        "Debt Maturing in Year 1",
        [
            "LongTermDebtMaturitiesRepaymentsOfPrincipalInNextTwelveMonths",
            "LongTermDebtMaturitiesRepaymentsOfPrincipalRemainderOfFiscalYear",
        ],
    ),
    "debt_maturity_y2": ("Year 2", ["LongTermDebtMaturitiesRepaymentsOfPrincipalInYearTwo"]),
    "debt_maturity_y3": ("Year 3", ["LongTermDebtMaturitiesRepaymentsOfPrincipalInYearThree"]),
    "debt_maturity_y4": ("Year 4", ["LongTermDebtMaturitiesRepaymentsOfPrincipalInYearFour"]),
    "debt_maturity_y5": ("Year 5", ["LongTermDebtMaturitiesRepaymentsOfPrincipalInYearFive"]),
    "debt_maturity_thereafter": (
        "Thereafter",
        ["LongTermDebtMaturitiesRepaymentsOfPrincipalAfterYearFive"],
    ),

    # Effective tax rate reconciliation (~96% for the statutory rate -- the best-covered footnote
    # on the page). The line set below is the one filers ACTUALLY use, ordered by survey coverage.
    "etr_statutory_rate": (
        "U.S. Federal Statutory Rate",
        ["EffectiveIncomeTaxRateReconciliationAtFederalStatutoryIncomeTaxRate"],
    ),
    "etr_state_local": (
        "State & Local Income Taxes",
        ["EffectiveIncomeTaxRateReconciliationStateAndLocalIncomeTaxes"],
    ),
    "etr_foreign_differential": (
        "Foreign Rate Differential",
        ["EffectiveIncomeTaxRateReconciliationForeignIncomeTaxRateDifferential"],
    ),
    "etr_valuation_allowance_change": (
        "Valuation Allowance Change",
        ["EffectiveIncomeTaxRateReconciliationChangeInDeferredTaxAssetsValuationAllowance"],
    ),
    "etr_tax_credits": (
        "Tax Credits",
        ["EffectiveIncomeTaxRateReconciliationTaxCredits"],
    ),
    "etr_other": (
        "Other Adjustments",
        ["EffectiveIncomeTaxRateReconciliationOtherAdjustments"],
    ),
    "etr_effective_rate": (
        "Effective Rate",
        ["EffectiveIncomeTaxRateContinuingOperations"],
    ),
    "unrecognized_tax_benefits": ("Unrecognized Tax Benefits", ["UnrecognizedTaxBenefits"]),
    "valuation_allowance": (
        "Valuation Allowance",
        ["DeferredTaxAssetsValuationAllowance"],
    ),

    # Deferred revenue roll-forward (~53%). ASC 606 renamed the balance; both spellings persist.
    "deferred_revenue_balance": (
        "Deferred Revenue",
        ["ContractWithCustomerLiability", "ContractWithCustomerLiabilityCurrent", "DeferredRevenueCurrent"],
    ),
    "deferred_revenue_recognized": (
        "Recognized in Revenue",
        ["ContractWithCustomerLiabilityRevenueRecognized"],
    ),

    # Allowance for credit losses (~56%). The CECL-era `AccountsReceivableAllowanceForCreditLoss*`
    # tags scored ZERO in the survey; the legacy names carry the data.
    "allowance_credit_losses": (
        "Allowance for Credit Losses",
        ["AllowanceForDoubtfulAccountsReceivableCurrent", "AllowanceForDoubtfulAccountsReceivable"],
    ),
    "allowance_provision": ("Provision", ["ProvisionForDoubtfulAccounts"]),
    "allowance_writeoffs": (
        "Write-offs",
        ["AllowanceForDoubtfulAccountsReceivableWriteOffs"],
    ),

    # Leases (~82% liability, 73% discount rate). The weighted-average TERM is deliberately absent:
    # it is an ISO-8601 duration, and companyfacts carries no duration-typed facts at all -- the
    # survey found it on zero filers out of the whole volume.
    "operating_lease_discount_rate": (
        "Weighted-Average Discount Rate",
        ["OperatingLeaseWeightedAverageDiscountRatePercent"],
    ),

    # R&D capitalisation (~4%). Kept because the card exists; it will be N/A for almost everyone,
    # which is the honest answer rather than a missing row.
    "capitalized_software": (
        "Capitalized Software",
        ["CapitalizedComputerSoftwareNet", "CapitalizedComputerSoftwareGross"],
    ),

    # ---------------------------------------------------------------- §07 obligations
    #
    # Coverage re-measured 2026-08-04 over 485 filers in 70 SIC groups with FY2023+ facts (and the
    # 113 of them carrying 300+ distinct tags), superseding V1's 45-filer pre-backfill basket.
    # This is the LOWEST-COVERAGE section of the page and it is expected to render N/A often --
    # that is the honest answer for a disclosure most filers write in prose.
    #
    # Purchase commitments are the FRAGMENTATION case: three unrelated tag families say the same
    # thing and none clears 15%, so the union is what the card can render (25.4% broad / 31.9%
    # deep). The by-year ladder is thinner again -- roughly 4-5% of filers tag the anniversary
    # variants -- so the card shows a total far more often than a ladder.
    "purchase_obligation": (
        "Purchase & Capacity Commitments",
        # `UnrecordedUnconditional…` leads on coverage (8.2% / 14.2%); `PurchaseObligation` and
        # `ContractualObligation` follow at 7.4% each. `ContractualObligation` is the BROADEST of
        # the three -- it can include debt and leases already counted elsewhere on the page -- so
        # it sits last and only resolves when the narrower two are absent.
        [
            "UnrecordedUnconditionalPurchaseObligationBalanceSheetAmount",
            "PurchaseObligation",
            "LongTermPurchaseCommitmentAmount",
            "OtherCommitment",
            "ContractualObligation",
        ],
    ),
    "purchase_obligation_y1": (
        "Due Within One Year",
        [
            "PurchaseObligationDueInNextTwelveMonths",
            "UnrecordedUnconditionalPurchaseObligationDueWithinOneYear",
            "ContractualObligationDueInNextTwelveMonths",
            "OtherCommitmentDueInNextTwelveMonths",
        ],
    ),
    "purchase_obligation_y2": (
        "Due In Year Two",
        [
            "PurchaseObligationDueInSecondYear",
            "UnrecordedUnconditionalPurchaseObligationDueWithinTwoYears",
        ],
    ),
    "purchase_obligation_y3": (
        "Due In Year Three",
        [
            "PurchaseObligationDueInThirdYear",
            "UnrecordedUnconditionalPurchaseObligationDueWithinThreeYears",
        ],
    ),
    "purchase_obligation_y4": (
        "Due In Year Four",
        [
            "PurchaseObligationDueInFourthYear",
            "UnrecordedUnconditionalPurchaseObligationDueWithinFourYears",
        ],
    ),
    "purchase_obligation_y5": (
        "Due In Year Five",
        [
            "PurchaseObligationDueInFifthYear",
            "UnrecordedUnconditionalPurchaseObligationDueWithinFiveYears",
        ],
    ),
    "purchase_obligation_thereafter": (
        "Due After Five Years",
        [
            "PurchaseObligationDueAfterFifthYear",
            "UnrecordedUnconditionalPurchaseObligationDueAfterFiveYears",
            "ContractualObligationDueAfterFifthYear",
        ],
    ),

    # Restructuring -- the best-covered group in §07 (25.6% broad / 48.7% deep).
    "restructuring_charge": (
        "Restructuring Charge",
        # DURATION. 17.9% / 35.4%. `SeveranceCosts1` (8.5% / 15.9%) is a COMPONENT of a
        # restructuring charge, not a synonym, so it is a separate concept below rather than a
        # fallback that would silently under-report the total.
        ["RestructuringCharges", "RestructuringAndRelatedCostIncurredCost"],
    ),
    "restructuring_reserve": (
        "Restructuring Accrual Remaining",
        # INSTANT. 12.8% / 27.4%.
        ["RestructuringReserve"],
    ),
    "restructuring_paid": (
        "Cash Paid Against The Accrual",
        # DURATION. 10.9% / 23.9%.
        ["PaymentsForRestructuring"],
    ),
    "restructuring_positions": (
        "Positions Eliminated",
        # A COUNT, not a dollar amount -- the card's "Scope" tile. Kept apart from every dollar
        # concept above so a renderer cannot format headcount as currency.
        ["RestructuringAndRelatedCostNumberOfPositionsEliminated"],
    ),
    "severance_costs": ("Severance Costs", ["SeveranceCosts1"]),

    # Guarantees, environmental, off-balance-sheet -- the thinnest group on the page.
    "guarantee_obligations": (
        "Guarantee Obligations",
        # 4.1% / 7.1%. Deliberately NOT unioned with letters of credit: a guarantee is a promise to
        # perform another party's obligation, a standby letter of credit is a bank's undertaking
        # bought by this filer. Merging them would quadruple the coverage number by reporting a
        # different instrument under this heading.
        [
            "GuaranteeObligationsMaximumExposureUndiscounted",
            "GuaranteeObligationsCurrentCarryingValue",
        ],
    ),
    "letters_of_credit": (
        "Letters of Credit Outstanding",
        # 16.9% / 29.2% -- four times the guarantee tags, and the best-covered concept in §07.4.
        # A standby letter of credit is the textbook OFF-BALANCE-SHEET commitment, which is the
        # slot it fills (operator ruling 2026-08-04). It is never folded into `guarantee_obligations`.
        ["LettersOfCreditOutstandingAmount", "StandbyLettersOfCreditAmountOutstanding"],
    ),
    "environmental_accrual": (
        "Environmental Remediation Accrual",
        # 6.2% / 16.8% for the headline tag. The current/noncurrent split is a different cut of the
        # same liability, so it follows as a fallback rather than being summed with it.
        [
            "AccrualForEnvironmentalLossContingencies",
            "AccruedEnvironmentalLossContingenciesNoncurrent",
            "AccruedEnvironmentalLossContingenciesCurrent",
        ],
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

# Footnote CARDS -> the concepts each one shows, in display order.
#
# Statements have `STATEMENT_CONCEPTS`; footnotes have this. They are separate because a footnote
# card is not a statement: it is a small named group of disclosures that travel together, and the
# API serves them as groups so a caller asks once per card rather than once per concept.
#
# The fourth element is the group's PRIMARY concepts -- the ones the card is actually named for.
# A group is only `ok` when one of those resolves. Without that distinction "R&D capitalisation"
# reported ok on Apple by resolving the R&D EXPENSE line, implying we had capitalisation data for a
# filer that capitalises none; and "Inventory composition" reported ok on the inventory TOTAL,
# which is not a composition. A card named for a thing must not go green on its supporting cast.
#
# `coverage` is the share of surveyed filers carrying the group's PRIMARY concept
# (scripts/v1_tag_coverage.py, 2026-08-02). It is on the payload deliberately: these are footnote
# disclosures, so a card being empty for a filer is usually the filer's choice rather than our gap,
# and a reader deserves to know which is likelier before concluding anything from a blank.
# §04 capital structure -- the same (label, concepts, coverage, primary) shape as FOOTNOTE_GROUPS,
# resolved by the same `build_concept_group`, but a SEPARATE registry because the coverage number
# means something different here.
#
# A footnote group's coverage says how often filers CHOOSE to disclose it, so a blank card is
# usually the filer's decision. These are not optional disclosures in the same way: share counts
# and repurchase programs are reported by anyone who has them. A blank buyback card much more
# often means the filer ran no buyback than that it declined to say -- which is a fact about the
# company, not about our data. The distinction is in the route's copy, not in the resolution.
#
# ⚠️ Coverage here is **filers tagging the concept IN A RECENT PERIOD (FY>=2024)**, not filers who
# ever tagged it. The distinction is not pedantic -- it is the difference between a card that works
# and one that is permanently blank:
#
#   concept                     ever    FY>=2024   median last tagged
#   options outstanding        83.3%      45.0%    2024
#   buyback authorised         48.3%      13.3%    2023
#   unvested award COUNT       45.0%      13.3%    2018
#   buyback authorised (alt)   28.3%       0.0%    2013
#
# Measured first the wrong way, which is how this was found: the route returned `na` for dilution
# on both Apple and Microsoft while the mapping claimed 83% coverage. Apple last tagged options
# outstanding in FY2016 and Microsoft in FY2013. An "ever" figure describes the taxonomy's history;
# only a recent-period figure describes what a reader will see. Same trap as reading an absence
# over EDGAR's rolling window as an absence over history, in the opposite direction.
#
# Measured 2026-08-02 on the full 121M-fact volume (60 fully-backfilled filers, 71 SIC groups).
CAPITAL_GROUPS: dict[str, tuple[str, list[str], float, list[str]]] = {
    "share_rollforward": (
        "Share count roll-forward",
        [
            "shares_issued",
            "shares_outstanding",
            "shares_issued_options_exercised",
            "shares_issued_new",
            "shares_repurchased_count",
        ],
        0.88,
        ["shares_issued", "shares_outstanding"],
    ),
    "dilution": (
        "Dilution overhang",
        ["options_outstanding", "unvested_awards", "shares_outstanding"],
        0.45,
        # `shares_outstanding` is the DENOMINATOR, not the subject. A card reporting overhang
        # because it found the share count would be reporting nothing at all.
        ["options_outstanding", "unvested_awards"],
    ),
    "buyback": (
        "Repurchase program",
        ["buyback_authorized", "buyback_remaining", "share_repurchases", "shares_repurchased_count"],
        0.67,
        ["buyback_authorized", "buyback_remaining", "share_repurchases"],
    ),
}


#: Why a capital group is empty, when the honest answer is NOT "this filer chose not to disclose".
#:
#: `build_concept_group`'s default reason assumes an absence is the filer's choice, which is right
#: for optional footnote disclosures and wrong here. When a concept has fallen out of use across the
#: whole market, telling a reader that *this* filer withheld it points the blame at the wrong party
#: and invites them to read a signal into it. These notes replace that reason.
CAPITAL_GROUP_NOTES: dict[str, str] = {
    "dilution": (
        "Filers have largely stopped tagging option and unvested-award COUNTS in XBRL: the option "
        "count is on 45% of recent filers and the unvested-award count on 13%, whose median filer "
        "last tagged it in 2018. An empty card here usually reflects that industry-wide shift, or "
        "a filer that grants RSUs rather than options -- not a company hiding its overhang."
    ),
    "buyback": (
        "Repurchase amounts PAID are tagged by 67% of recent filers, but the programme's "
        "authorised size is down to 13% and is mostly disclosed in prose now. A missing "
        "authorisation is usually untagged rather than undisclosed; a missing amount paid much "
        "more often means the filer repurchased nothing."
    ),
}


#: §07's obligation groups. Same `(label, concepts, coverage, primaries)` shape as the two
#: registries above, resolved by the same `build_concept_group`.
#:
#: **Coverage here is low by nature, not by neglect.** Measured 2026-08-04 across 485 filers in 70
#: SIC groups on FY2023+ facts: purchase commitments 25.4%, restructuring 25.6%, guarantees and
#: environmental 20.2% / 8.0%. On the 113 deeply-ingested filers the same groups read 31.9%, 48.7%
#: and 34.5% / 19.5%. Most filers write these disclosures in prose; an N/A is the correct answer
#: and `OBLIGATION_GROUP_NOTES` is what tells a reader which kind of absence they are looking at.
#:
#: §07.1's legal-proceedings table is deliberately NOT here. Three of its four columns -- the
#: matter, its stage and its age -- are Item 3 narrative, so the grid can never render a row as
#: designed, and only the accrual is structured (23.7% / 37.2%). Operator ruling 2026-08-04: mark
#: the card rather than build a version of it that fills one column in four.
OBLIGATION_GROUPS: dict[str, tuple[str, list[str], float, list[str]]] = {
    "purchase_commitments": (
        "Purchase & capacity commitments",
        [
            "purchase_obligation",
            "purchase_obligation_y1",
            "purchase_obligation_y2",
            "purchase_obligation_y3",
            "purchase_obligation_y4",
            "purchase_obligation_y5",
            "purchase_obligation_thereafter",
        ],
        0.25,
        # A total alone is a real answer to "what has this filer committed to buy". The ladder is
        # a bonus roughly 1 filer in 20 provides, so requiring it would blank the card for the
        # other 19 that DID disclose a number.
        ["purchase_obligation", "purchase_obligation_y1"],
    ),
    "restructuring": (
        "Restructuring & other obligations",
        [
            "restructuring_charge",
            "restructuring_reserve",
            "restructuring_paid",
            "restructuring_positions",
            "severance_costs",
        ],
        0.26,
        # Positions eliminated is the card's "Scope" tile -- context for a restructuring, never
        # evidence that one happened, so it cannot make the card `ok` on its own.
        ["restructuring_charge", "restructuring_reserve", "restructuring_paid"],
    ),
    "guarantees": (
        "Guarantees, environmental & off-balance-sheet",
        ["guarantee_obligations", "letters_of_credit", "environmental_accrual"],
        0.20,
        ["guarantee_obligations", "letters_of_credit", "environmental_accrual"],
    ),
}


#: Why an obligation group is empty, when "this filer chose not to disclose" would be misleading.
OBLIGATION_GROUP_NOTES: dict[str, str] = {
    "purchase_commitments": (
        "Purchase commitments are split across three unrelated tag families and no single tag "
        "reaches 15% of filers, so this card reads the union of all three. Even so only about a "
        "quarter of filers tag a figure at all, and roughly one in twenty tags the year-by-year "
        "ladder -- the rest disclose the same commitments in the footnote's prose. An empty card "
        "usually means untagged, not uncommitted."
    ),
    "restructuring": (
        "Restructuring figures are tagged by about a quarter of filers, rising to half among "
        "fully-tagged large caps. An empty card here most often means the filer is not "
        "restructuring -- unlike the other two groups in this section, absence and zero are close "
        "to the same thing for this disclosure."
    ),
    "guarantees": (
        "The thinnest disclosure on the page. Guarantee obligations are tagged by 4% of filers "
        "and environmental accruals by 6%; letters of credit, at 17%, are the only line here most "
        "filers report. A blank card is the normal case and says nothing about the filer."
    ),
}


def obligation_concepts(group: str) -> list[str]:
    """The canonical concepts behind one §07 obligations card."""
    entry = OBLIGATION_GROUPS.get(group)
    return list(entry[1]) if entry else []


def obligation_primary(group: str) -> list[str]:
    """The concepts the card is NAMED for -- it is only `ok` when one of these resolves."""
    entry = OBLIGATION_GROUPS.get(group)
    return list(entry[3]) if entry else []


def capital_concepts(group: str) -> list[str]:
    """The canonical concepts behind one §04 capital card."""
    entry = CAPITAL_GROUPS.get(group)
    return list(entry[1]) if entry else []


def capital_primary(group: str) -> list[str]:
    """The concepts the card is NAMED for -- it is only `ok` when one of these resolves."""
    entry = CAPITAL_GROUPS.get(group)
    return list(entry[3]) if entry else []


FOOTNOTE_GROUPS: dict[str, tuple[str, list[str], float, list[str]]] = {
    "revenue_obligations": (
        "Remaining performance obligations",
        ["rpo_total", "rpo_pct_next_12m"],
        0.29,
        ["rpo_total"],
    ),
    "inventory": (
        "Inventory composition",
        ["inventory_raw_materials", "inventory_work_in_process", "inventory_finished_goods", "inventory"],
        0.27,
        ["inventory_raw_materials", "inventory_work_in_process", "inventory_finished_goods"],
    ),
    "debt_maturities": (
        "Debt maturity ladder",
        [
            "debt_maturity_y1", "debt_maturity_y2", "debt_maturity_y3",
            "debt_maturity_y4", "debt_maturity_y5", "debt_maturity_thereafter",
        ],
        0.60,
        ["debt_maturity_y1", "debt_maturity_y2"],
    ),
    "tax_reconciliation": (
        "Effective tax rate reconciliation",
        [
            "etr_statutory_rate", "etr_state_local", "etr_foreign_differential",
            "etr_valuation_allowance_change", "etr_tax_credits", "etr_other",
            "etr_effective_rate", "valuation_allowance", "unrecognized_tax_benefits",
        ],
        0.96,
        ["etr_statutory_rate", "etr_effective_rate"],
    ),
    "deferred_revenue": (
        "Deferred revenue",
        ["deferred_revenue_balance", "deferred_revenue_recognized"],
        0.53,
        ["deferred_revenue_balance"],
    ),
    "credit_losses": (
        "Allowance for credit losses",
        ["allowance_credit_losses", "allowance_provision", "allowance_writeoffs"],
        0.56,
        ["allowance_credit_losses"],
    ),
    "leases": (
        "Leases",
        ["operating_lease_liabilities", "operating_lease_right_of_use_asset", "operating_lease_discount_rate"],
        0.82,
        ["operating_lease_liabilities"],
    ),
    "capitalized_rd": (
        "R&D capitalisation",
        ["capitalized_software", "research_and_development"],
        0.04,
        ["capitalized_software"],
    ),
}


def footnote_concepts(group: str) -> list[str]:
    """The concepts one footnote card shows, in display order. Empty for an unknown group."""
    entry = FOOTNOTE_GROUPS.get(group)
    return list(entry[1]) if entry else []


def footnote_primary(group: str) -> list[str]:
    """The concepts a footnote card is NAMED for. A card is only `ok` when one of these resolves."""
    entry = FOOTNOTE_GROUPS.get(group)
    return list(entry[3]) if entry else []


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

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
    assert coverage_report(period_facts) == {"unmapped": 242, "mapped": 183}

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

    # Tier-2 income concepts (2026-07-16). dividends_per_share is USD/shares, not USD --
    # the unit assertion locks that in for downstream consumers.
    assert by_concept["comprehensive_income"] == 113611000000
    assert by_concept["share_based_compensation"] == 12863000000
    dps = next(line for line in stmt.lines if line.canonical_concept == "dividends_per_share")
    assert dps.value == 1.02
    assert dps.unit == "USD/shares"

    # Tranche 1 (cluster-driven, 2026-07-16). The strongest check is the filing's own
    # arithmetic: net income + OCI must equal comprehensive income EXACTLY.
    assert by_concept["other_comprehensive_income"] == 1601000000
    assert (
        by_concept["net_income"] + by_concept["other_comprehensive_income"]
        == by_concept["comprehensive_income"]
    )
    assert by_concept["nonoperating_income_expense"] == -321000000
    assert by_concept["effective_tax_rate"] == 0.156  # unit "pure", not USD


def test_aapl_quarterly_sbc_serves_the_discrete_quarter_not_the_ytd():
    """Cross-candidate variant of the comparative-column trap (caught live 2026-07-16).

    In AAPL's 10-Qs the aggregate ShareBasedCompensation addback is tagged ONLY as the
    YTD duration, while AllocatedShareBasedCompensationExpense carries both the discrete
    quarter and the YTD. Per-concept selection takes the first candidate with a value,
    so leading with the aggregate served a 6-month SBC line (7.122B) on a Q2 income
    statement whose other lines were all the 13-week quarter. The income-statement
    expense element must lead.
    """
    facts = _load("aapl_companyfacts.json", 320193)
    stmt = build_statement(facts, 320193, "income", 2026, "Q2")
    assert stmt.period_start == "2025-12-28"  # the discrete quarter, not 2025-09-28 YTD
    assert stmt.period_end == "2026-03-28"
    by_line = {line.canonical_concept: line for line in stmt.lines}
    assert by_line["revenue"].value == 111184000000
    sbc = by_line["share_based_compensation"]
    assert sbc.value == 3528000000  # 13-week quarter -- NOT the 7.122B 26-week YTD
    assert sbc.source_tag == "AllocatedShareBasedCompensationExpense"


def test_wmt_income_statement_has_retailer_shaped_gaps():
    facts = _load("wmt_companyfacts.json", 104169)
    latest_fy = next(p for p in available_periods(facts) if p[1] == "FY")
    assert latest_fy == (2026, "FY")

    period_facts = [f for f in facts if (f.fiscal_year, f.fiscal_period) == latest_fy]
    assert coverage_report(period_facts) == {"unmapped": 315, "mapped": 203}

    stmt = build_statement(facts, 104169, "income", 2026, "FY")
    by_concept = {line.canonical_concept: line.value for line in stmt.lines}
    assert stmt.period_end == "2026-01-31"  # primary column, not a comparative
    assert by_concept["revenue"] == 706413000000
    assert by_concept["net_income"] == 21893000000
    assert by_concept["interest_expense"] == 2318000000  # InterestExpenseDebt candidate

    # Tier-2: WMT tags BOTH comprehensive-income variants; the parent-attributable
    # first candidate must win (22.728B, not the 23.279B including-NCI figure). SBC
    # comes via the lead candidate -- WMT doesn't tag the aggregate
    # ShareBasedCompensation addback at all.
    assert by_concept["comprehensive_income"] == 22728000000
    assert by_concept["dividends_per_share"] == 0.94
    sbc = next(line for line in stmt.lines if line.canonical_concept == "share_based_compensation")
    assert sbc.value == 3603000000
    assert sbc.source_tag == "AllocatedShareBasedCompensationExpense"

    # Tranche 1: WMT is the filer that tags BOTH other-comprehensive-income variants
    # with different values (bare tag 1.009B includes NCI) -- the parent-attributable
    # first candidate must win, mirroring comprehensive_income above.
    oci = next(
        line for line in stmt.lines if line.canonical_concept == "other_comprehensive_income"
    )
    assert oci.value == 835000000
    assert oci.source_tag == "OtherComprehensiveIncomeLossNetOfTaxPortionAttributableToParent"
    assert by_concept["interest_income"] == 368000000
    assert by_concept["net_income_noncontrolling"] == 377000000
    assert by_concept["current_income_tax_expense"] == 4922000000
    assert by_concept["deferred_income_tax_expense"] == 2277000000
    assert by_concept["operating_lease_cost"] == 2434000000

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
    assert coverage_report(period_facts) == {"unmapped": 872, "mapped": 131}

    stmt = build_statement(facts, 19617, "income", 2025, "FY")
    assert stmt.form == "10-K"
    assert stmt.accession == "0001628280-26-008131"

    assert stmt.period_end == "2025-12-31"  # primary column, not a comparative
    by_concept = {line.canonical_concept: line.value for line in stmt.lines}
    assert by_concept["net_income"] == 57048000000
    # InterestExpenseOperating: the aggregate across JPM's deposit/repo/debt/trading-
    # liability interest expense components.
    assert by_concept["interest_expense"] == 97898000000

    # Tier-2 income concepts map cleanly even for a bank. SBC comes via the aggregate
    # ShareBasedCompensation fallback (JPM doesn't tag the income-statement expense
    # element) -- safe here because JPM tags discrete quarters on the aggregate, which
    # the per-tag span tie-break picks (see mapping.py).
    assert by_concept["comprehensive_income"] == 65214000000
    assert by_concept["dividends_per_share"] == 5.8
    sbc = next(line for line in stmt.lines if line.canonical_concept == "share_based_compensation")
    assert sbc.value == 3614000000
    assert sbc.source_tag == "ShareBasedCompensation"

    # Tranche 1: same net-income + OCI = comprehensive-income identity as AAPL.
    assert by_concept["other_comprehensive_income"] == 8166000000
    assert (
        by_concept["net_income"] + by_concept["other_comprehensive_income"]
        == by_concept["comprehensive_income"]
    )
    assert by_concept["interest_income"] == 28032000000
    assert by_concept["effective_tax_rate"] == 0.214
    assert by_concept["amortization_of_intangibles"] == 292000000
    assert by_concept["operating_lease_cost"] == 2388000000

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

    # Tier-2 balance concepts (2026-07-16). retained_earnings is genuinely NEGATIVE for
    # AAPL (accumulated deficit from buybacks) -- the sign must survive. Marketable
    # securities are the two-concept current/noncurrent split (no total tag exists).
    assert by_concept["ppe_net"] == 49834000000
    assert by_concept["accounts_payable"] == 69860000000
    assert by_concept["deferred_revenue_current"] == 9055000000
    assert by_concept["retained_earnings"] == -14264000000
    assert by_concept["marketable_securities_current"] == 18763000000
    assert by_concept["marketable_securities_noncurrent"] == 77723000000
    assert by_concept["operating_lease_liabilities"] == 12490000000
    # Apple's recent 10-Ks don't break out goodwill or the intangibles line on the
    # balance sheet (the intangibles tags reappear only in FY2026 10-Qs) -- absent is
    # correct for the FY statement, not a mapping gap.
    for concept in ("goodwill", "intangible_assets"):
        assert concept not in by_concept

    # Tranche 1: the filing's own arithmetic identities are the verification --
    # gross - accumulated depreciation = net PP&E, current + noncurrent assets = total,
    # and the balance sheet balances (L+E = assets), all EXACT.
    assert by_concept["ppe_gross"] == 125848000000
    assert by_concept["accumulated_depreciation"] == 76014000000
    assert by_concept["ppe_gross"] - by_concept["accumulated_depreciation"] == by_concept["ppe_net"]
    assert by_concept["assets_noncurrent"] == 211284000000
    assert by_concept["total_current_assets"] + by_concept["assets_noncurrent"] == by_concept["total_assets"]
    assert by_concept["liabilities_and_equity"] == by_concept["total_assets"]
    assert by_concept["deferred_revenue"] == 13700000000  # the TOTAL, beside _current
    assert by_concept["operating_lease_liabilities_current"] == 1579000000
    assert by_concept["operating_lease_liabilities_noncurrent"] == 10911000000
    assert by_concept["finance_lease_liabilities"] == 1230000000
    assert by_concept["accumulated_oci"] == -5571000000

    cashflow = build_statement(facts, 320193, "cashflow", *latest_fy)
    by_concept = {line.canonical_concept: line.value for line in cashflow.lines}
    assert by_concept["cash_from_operations"] == 111482000000
    assert by_concept["capital_expenditures"] == 12715000000
    assert by_concept["depreciation_amortization"] == 11698000000

    # Tier-2 cash-flow concepts. The working-capital deltas carry the us-gaap element's
    # natural sign (positive = balance increased), so inventories at -1.4B means
    # inventories FELL in FY2025 -- not a sign bug.
    assert by_concept["dividends_paid"] == 15421000000
    assert by_concept["share_repurchases"] == 90711000000
    assert by_concept["income_taxes_paid"] == 43369000000
    assert by_concept["change_in_receivables"] == 6682000000
    assert by_concept["change_in_payables"] == 902000000
    assert by_concept["change_in_inventories"] == -1400000000

    # Tranche 1 cash-flow concepts. repayments_of_debt comes via the LTD-only subset
    # fallback -- AAPL repays commercial paper under a separate untagged-aggregate line,
    # the documented debt_current-class undercount caveat in action.
    assert by_concept["change_in_cash"] == 5991000000
    assert by_concept["proceeds_from_long_term_debt"] == 4481000000
    repay = next(line for line in cashflow.lines if line.canonical_concept == "repayments_of_debt")
    assert repay.value == 10932000000
    assert repay.source_tag == "RepaymentsOfLongTermDebt"


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

    # Tier-2 balance concepts (2026-07-16).
    assert by_concept["ppe_net"] == 136083000000
    assert by_concept["goodwill"] == 28735000000
    assert by_concept["accounts_payable"] == 63061000000
    assert by_concept["retained_earnings"] == 104774000000
    assert by_concept["operating_lease_liabilities"] == 15572000000

    # Tranche 1: the equity components sum EXACTLY to parent stockholders' equity
    # (common stock + APIC + retained earnings + AOCI), with NCI as its own line --
    # the filing's own arithmetic verifying four new concepts at once. prepaid comes
    # via the combined prepaid+other-assets fallback (WMT doesn't tag the narrow line).
    assert by_concept["common_stock_value"] == 797000000
    assert by_concept["additional_paid_in_capital"] == 6816000000
    assert by_concept["accumulated_oci"] == -12770000000
    assert (
        by_concept["common_stock_value"]
        + by_concept["additional_paid_in_capital"]
        + by_concept["retained_earnings"]
        + by_concept["accumulated_oci"]
        == by_concept["stockholders_equity"]
    )
    assert by_concept["noncontrolling_interest"] == 6270000000
    assert by_concept["ppe_gross"] - by_concept["accumulated_depreciation"] == by_concept["ppe_net"]
    assert by_concept["liabilities_and_equity"] == by_concept["total_assets"]
    assert by_concept["accrued_liabilities"] == 31187000000
    prepaid = next(line for line in balance.lines if line.canonical_concept == "prepaid_expenses")
    assert prepaid.value == 4124000000
    assert prepaid.source_tag == "PrepaidExpenseAndOtherAssetsCurrent"
    # Retailer-shaped absences: no contract-liability (deferred revenue) or marketable-
    # securities tags at all. intangible_assets is deliberately absent too -- WMT tags
    # only the indefinite-lived piece, which we don't serve as if it were the whole
    # (see DATA_MODEL.md's tier-2 notes).
    for concept in (
        "deferred_revenue_current",
        "marketable_securities_current",
        "marketable_securities_noncurrent",
        "intangible_assets",
    ):
        assert concept not in by_concept

    cashflow = build_statement(facts, 104169, "cashflow", *latest_fy)
    by_concept = {line.canonical_concept: line.value for line in cashflow.lines}
    assert by_concept["cash_from_operations"] == 41565000000
    assert by_concept["capital_expenditures"] == 26642000000

    # Tier-2 cash-flow concepts, exercising the retailer-specific fallbacks: dividends
    # via PaymentsOfDividendsCommonStock (the aggregate tag is absent; NCI distributions
    # are tagged separately and deliberately not folded in), receivables via the
    # combined IncreaseDecreaseInAccountsAndOtherReceivables, inventories via
    # IncreaseDecreaseInRetailRelatedInventories.
    by_tag = {line.canonical_concept: line.source_tag for line in cashflow.lines}
    assert by_concept["dividends_paid"] == 7507000000
    assert by_tag["dividends_paid"] == "PaymentsOfDividendsCommonStock"
    assert by_concept["share_repurchases"] == 8088000000
    assert by_concept["income_taxes_paid"] == 5364000000
    assert by_concept["change_in_receivables"] == 1136000000
    assert by_tag["change_in_receivables"] == "IncreaseDecreaseInAccountsAndOtherReceivables"
    assert by_concept["change_in_payables"] == 1611000000
    assert by_concept["change_in_inventories"] == 1443000000
    assert by_tag["change_in_inventories"] == "IncreaseDecreaseInRetailRelatedInventories"

    # Tranche 1 cash-flow concepts.
    assert by_concept["change_in_accrued_liabilities"] == 1607000000
    assert by_concept["acquisitions_net_of_cash"] == 53000000
    assert by_concept["interest_paid"] == 2793000000
    assert by_concept["effect_of_exchange_rate_on_cash"] == 123000000
    assert by_concept["change_in_cash"] == 1785000000


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

    # Tier-2 balance concepts. intangible_assets comes via the FiniteLivedIntangibleAssetsNet
    # fallback -- a KNOWN undercount for JPM (another ~1.3B of indefinite-lived intangibles
    # is tagged separately; see mapping.py / DATA_MODEL.md). operating_lease_liabilities is
    # the total tag, which JPM (unlike AAPL/WMT) tags WITHOUT a current/noncurrent split.
    assert by_concept["goodwill"] == 52731000000
    assert by_concept["retained_earnings"] == 416055000000
    assert by_concept["operating_lease_liabilities"] == 9337000000
    intangibles = next(
        line for line in balance.lines if line.canonical_concept == "intangible_assets"
    )
    assert intangibles.value == 1300000000
    assert intangibles.source_tag == "FiniteLivedIntangibleAssetsNet"
    # Bank-shaped absences: premises/equipment aren't XBRL-tagged (no ppe_net), payables
    # exist only combined with accruals (not like-for-like), and securities live under
    # AFS/HTM/trading tags a commercial-shape schema can't honestly claim.
    for concept in (
        "ppe_net",
        "accounts_payable",
        "deferred_revenue_current",
        "marketable_securities_current",
        "marketable_securities_noncurrent",
    ):
        assert concept not in by_concept

    # Tranche 1: even a bank's balance sheet balances -- and APIC comes via the
    # common-stock-scoped fallback (JPM doesn't tag the bare AdditionalPaidInCapital).
    assert by_concept["liabilities_and_equity"] == by_concept["total_assets"]
    assert by_concept["cash_and_restricted_cash"] == 343338000000
    assert by_concept["operating_lease_right_of_use_asset"] == 8901000000
    assert by_concept["common_stock_value"] == 4105000000
    apic = next(
        line for line in balance.lines if line.canonical_concept == "additional_paid_in_capital"
    )
    assert apic.value == 91114000000
    assert apic.source_tag == "AdditionalPaidInCapitalCommonStock"
    assert by_concept["accumulated_oci"] == -4290000000
    # Banks have no classified current/noncurrent sections -- the new classified
    # concepts stay absent for the same structural reason as the tier-2 ones above.
    for concept in ("prepaid_expenses", "accrued_liabilities", "other_assets_current"):
        assert concept not in by_concept

    cashflow = build_statement(facts, 19617, "cashflow", *latest_fy)
    by_concept = {line.canonical_concept: line.value for line in cashflow.lines}
    assert by_concept["cash_from_operations"] == -147782000000
    # Banks don't report a discrete capex line in XBRL the way commercial filers do.
    assert "capital_expenditures" not in by_concept

    # Tier-2 cash-flow concepts. dividends_paid is the aggregate tag, which for JPM
    # includes preferred dividends -- documented, not a bug. share_repurchases is common
    # stock only (JPM's preferred redemptions are tagged separately, deliberately
    # unmapped). Banks have no working-capital section, so the delta set is absent.
    assert by_concept["dividends_paid"] == 16625000000
    assert by_concept["share_repurchases"] == 31591000000
    assert by_concept["income_taxes_paid"] == 5309000000
    for concept in ("change_in_receivables", "change_in_payables", "change_in_inventories"):
        assert concept not in by_concept

    # Tranche 1: interest_paid (net) sits plausibly beside the accrual
    # interest_expense (97.898B) asserted on the income statement above.
    assert by_concept["interest_paid"] == 96436000000
    assert by_concept["change_in_cash"] == -125979000000

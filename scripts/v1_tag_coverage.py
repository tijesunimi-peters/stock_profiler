"""V1 -- basket tag-coverage query (ROADMAP_REACT_PLUMBING.md).

Answers, for every candidate tag behind an `M?` card on the Company Hub Overview:
how many filers in a stratified basket ACTUALLY TAG IT.

Two outputs per family:
  1. coverage of the named candidates (the tags the roadmap guessed at)
  2. **what filers tag instead** -- the top actually-used tags matching the family's
     pattern. This is the part that turns an `M?` into an `M` (different tag, map it)
     or a `T` (nobody tags it, it is prose).

Read-only. No network. Runs against the live volume.
"""

import os
import sqlite3
from collections import defaultdict

DB = os.environ.get("SECFIN_DB_PATH", "/app/data/secfin.db")
MIN_TAGS = 150      # a filer below this was seeded headline-only, not fully backfilled
PER_GROUP = 3       # filers per 2-digit SIC group
CAP = 60

# WAL needs to open the -shm sidecar, so mode=ro fails on a live WAL DB. Open normally
# and hard-disable writes at the connection instead -- every statement below is a SELECT.
con = sqlite3.connect(DB)
con.execute("PRAGMA query_only = ON")
cur = con.cursor()

print("=" * 78)
print("V1 -- BASKET TAG COVERAGE")
print("=" * 78)

tot_facts, tot_ciks = cur.execute(
    "SELECT COUNT(*), COUNT(DISTINCT cik) FROM raw_facts"
).fetchone()
print(f"\nvolume: {tot_facts:,} raw facts across {tot_ciks:,} companies")

# ---------------------------------------------------------------- build the basket
# Fully-backfilled filers only. A frames-seeded filer carries ~6 concepts and would
# report "no" for every tag below -- that would measure OUR ingest, not the filers.
cur.execute(
    """
    SELECT cik, COUNT(DISTINCT gaap_tag) AS n
    FROM raw_facts GROUP BY cik HAVING n >= ?
    """,
    (MIN_TAGS,),
)
full = dict(cur.fetchall())
print(f"fully-backfilled filers (>= {MIN_TAGS} distinct tags): {len(full):,}")

try:
    cur.execute("SELECT cik, sic, name FROM company_profiles WHERE sic IS NOT NULL")
    profiles = {c: (s, n) for c, s, n in cur.fetchall()}
except sqlite3.OperationalError:
    profiles = {}
print(f"filers with a SIC profile: {len(profiles):,}")

by_group = defaultdict(list)
for cik, n in sorted(full.items(), key=lambda kv: -kv[1]):
    sic, name = profiles.get(cik, (None, None))
    if not sic:
        continue
    by_group[str(sic)[:2]].append((cik, n, sic, name))

basket = []
for grp in sorted(by_group):
    basket.extend(by_group[grp][:PER_GROUP])
basket = basket[:CAP]

if not basket:  # no profiles -> fall back to the best-covered filers overall
    basket = [(c, n, None, None) for c, n in sorted(full.items(), key=lambda kv: -kv[1])[:CAP]]
    print("\n!! no SIC profiles -- basket is UNSTRATIFIED (best-covered filers)")

ciks = [b[0] for b in basket]
print(f"\nbasket: {len(ciks)} filers across {len({str(b[2])[:2] for b in basket if b[2]})} "
      f"2-digit SIC groups")
for cik, n, sic, name in basket[:8]:
    print(f"   {cik:>10}  SIC {sic}  {n:>4} tags  {(name or '')[:42]}")
print(f"   ... ({len(basket)} total)")

ph = ",".join("?" * len(ciks))
cur.execute(
    f"SELECT DISTINCT cik, gaap_tag FROM raw_facts WHERE cik IN ({ph}) AND taxonomy='us-gaap'",
    ciks,
)
have = defaultdict(set)
for cik, tag in cur.fetchall():
    have[tag].add(cik)

N = len(ciks)


def cov(tag):
    return len(have.get(tag, ()))


# ---------------------------------------------------------------- the families
FAMILIES = [
    ("2.8  RPO", "%RemainingPerformanceObligation%", [
        "RevenueRemainingPerformanceObligation",
        "RevenueRemainingPerformanceObligationPercentage",
    ]),
    ("2.9  Inventory composition", "%Inventory%", [
        "InventoryRawMaterialsNetOfReserves", "InventoryWorkInProcessNetOfReserves",
        "InventoryFinishedGoodsNetOfReserves", "InventoryRawMaterials",
        "InventoryWorkInProcess", "InventoryFinishedGoods", "InventoryNet",
    ]),
    ("2.10 Debt maturity ladder", "%LongTermDebtMaturities%", [
        "LongTermDebtMaturitiesRepaymentsOfPrincipalInNextTwelveMonths",
        "LongTermDebtMaturitiesRepaymentsOfPrincipalInYearTwo",
        "LongTermDebtMaturitiesRepaymentsOfPrincipalInYearThree",
        "LongTermDebtMaturitiesRepaymentsOfPrincipalAfterYearFive",
    ]),
    ("2.12 Effective tax rate recon", "%EffectiveIncomeTaxRateReconciliation%", [
        "EffectiveIncomeTaxRateReconciliationAtFederalStatutoryIncomeTaxRate",
        "EffectiveIncomeTaxRateReconciliationForeignIncomeTaxRateDifferential",
        "EffectiveIncomeTaxRateContinuingOperations",
        "UnrecognizedTaxBenefits", "DeferredTaxAssetsValuationAllowance",
    ]),
    ("2.13 Deferred revenue roll", "%ContractWithCustomerLiability%", [
        "ContractWithCustomerLiability", "ContractWithCustomerLiabilityCurrent",
        "ContractWithCustomerLiabilityRevenueRecognized", "DeferredRevenueCurrent",
    ]),
    ("2.14 Allowance for credit losses", "%Allowance%", [
        "AllowanceForDoubtfulAccountsReceivable",
        "AllowanceForDoubtfulAccountsReceivableCurrent",
        "AccountsReceivableAllowanceForCreditLossCurrent",
        "ProvisionForDoubtfulAccounts",
        "AccountsReceivableAllowanceForCreditLossWriteoff",
    ]),
    ("2.16 R&D capitalization", "%CapitalizedComputerSoftware%", [
        "CapitalizedComputerSoftwareAdditions", "CapitalizedComputerSoftwareNet",
        "ResearchAndDevelopmentExpense",
    ]),
    ("2.18 Leases", "%OperatingLease%", [
        "OperatingLeaseLiability",
        "OperatingLeaseWeightedAverageRemainingLeaseTerm1",
        "OperatingLeaseWeightedAverageDiscountRatePercent",
    ]),
    ("4.1  Share roll-forward", "%StockIssuedDuringPeriodShares%", [
        "CommonStockSharesOutstanding", "CommonStockSharesIssued",
        "StockRepurchasedAndRetiredDuringPeriodShares",
        "StockRepurchasedDuringPeriodShares",
        "StockIssuedDuringPeriodSharesStockOptionsExercised",
    ]),
    ("4.2  Dilution overhang", "%ShareBasedCompensationArrangement%Number%", [
        "ShareBasedCompensationArrangementByShareBasedPaymentAwardOptionsOutstandingNumber",
        "ShareBasedCompensationArrangementByShareBasedPaymentAwardEquityInstrumentsOtherThanOptionsNonvestedNumber",
    ]),
    ("4.3  Repurchase program", "%StockRepurchaseProgram%", [
        "PaymentsForRepurchaseOfCommonStock",
        "StockRepurchaseProgramAuthorizedAmount1",
        "StockRepurchaseProgramRemainingAuthorizedRepurchaseAmount1",
    ]),
    ("7.1  Legal proceedings", "%LossContingency%", [
        "LossContingencyAccrualAtCarryingValue",
        "LossContingencyEstimateOfPossibleLoss",
        "LossContingencyDamagesSoughtValue",
        "EstimatedLitigationLiability",
    ]),
    ("7.2  Purchase commitments", "%PurchaseObligation%", [
        "PurchaseObligation", "PurchaseObligationDueInNextTwelveMonths",
        "UnrecordedUnconditionalPurchaseObligationBalanceSheetAmount",
        "LongTermPurchaseCommitmentAmount", "ContractualObligation",
    ]),
    ("7.3  Restructuring", "%Restructuring%", [
        "RestructuringCharges", "RestructuringReserve",
        "RestructuringAndRelatedCostIncurredCost", "PaymentsForRestructuring",
    ]),
    ("7.4  Guarantees / environmental", "%Guarantee%", [
        "GuaranteeObligationsMaximumExposure",
        "GuaranteeObligationsCurrentCarryingValue",
        "AccrualForEnvironmentalLossContingencies",
    ]),
]

for title, pattern, candidates in FAMILIES:
    print("\n" + "-" * 78)
    print(f"{title}   (basket N={N})")
    print("-" * 78)
    print("  named candidates:")
    for t in candidates:
        c = cov(t)
        bar = "#" * round(c / N * 30)
        print(f"    {c:>3}/{N}  {c / N * 100:>5.1f}%  {bar:<30} {t[:56]}")

    cur.execute(
        f"""SELECT gaap_tag, COUNT(DISTINCT cik) c FROM raw_facts
            WHERE cik IN ({ph}) AND taxonomy='us-gaap' AND gaap_tag LIKE ?
            GROUP BY gaap_tag ORDER BY c DESC LIMIT 10""",
        ciks + [pattern],
    )
    rows = [r for r in cur.fetchall() if r[0] not in candidates]
    if rows:
        print(f"  what filers tag instead (pattern {pattern}):")
        for tag, c in rows[:8]:
            print(f"    {c:>3}/{N}  {c / N * 100:>5.1f}%          {tag[:60]}")
    else:
        print(f"  no OTHER tags match {pattern} in the basket")

con.close()
print("\n" + "=" * 78)

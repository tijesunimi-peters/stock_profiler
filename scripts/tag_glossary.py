"""Regenerate docs/tag_glossary.jsonl -- the us-gaap tag glossary used as the
reference when expanding the canonical mapping (normalize/mapping.py).

One JSON object per line (first line is a _meta record), one line per distinct
us-gaap tag found in the store's fully-ingested companies, carrying:

    tag, label, description   -- the official FASB label/definition, harvested from
                                  the SEC companyfacts payloads of the ingested CIKs
    companies, facts           -- usage stats measured across those CIKs
    units, period_type         -- reported units; instant / duration / mixed
    fy_range                   -- [min, max] fiscal_year seen
    canonical_concept          -- the concept the tag feeds (normalize/mapping.py),
                                  or null if unmapped (the mapping worklist)
    topic                      -- coarse keyword bucket, a browsing/grep facet only

Run INSIDE the api container (needs the DB and network for the label/description
harvest; ~one throttled companyfacts request per ingested CIK):

    docker compose run --rm -T api python - < scripts/tag_glossary.py \
        > docs/tag_glossary.jsonl

Greppable by meaning, e.g.:  grep -i "customer advance" docs/tag_glossary.jsonl
"""

from __future__ import annotations

import asyncio
import datetime as dt
import json
import os
import re
import sqlite3
import sys

# Coarse topic buckets -- first match wins, most specific first. A grep/browse facet,
# not taxonomy truth; don't let these drive mapping decisions.
TOPIC_RULES: list[tuple[str, str]] = [
    ("Comprehensive Income & AOCI", r"ComprehensiveIncome|AccumulatedOtherComprehensive|OciBefore|ReclassificationOutOfAccumulated|OtherComprehensive|Aoci"),
    ("Income Taxes", r"Tax"),
    ("Leases", r"Lease"),
    ("Goodwill & Intangibles", r"Goodwill|Intangible"),
    ("Compensation & Benefits", r"Compensation|Pension|Postretirement|DefinedBenefit|DefinedContribution|EmployeeBenefit|EmployeeService|StockOption|RestrictedStock|EquityInstrumentsOtherThanOptions|Vest"),
    ("Derivatives & Hedging", r"Derivative|Hedg|Swap|NotionalAmount"),
    ("Insurance", r"Insurance|Policyholder|PolicyBenefit|Claims?Payable|Reinsurance"),
    ("Banking & Deposits", r"Deposit|LoansAndLeases|FederalFunds|FederalHomeLoan|InterestBearing|NoninterestBearing|CreditLoss|FinancingReceivable|DueFromBanks|Repurchase.?Agreement"),
    ("Business Combinations", r"BusinessCombination|BusinessAcquisition|AcquiredFiniteLived|Acquisition"),
    ("Cash & Investments", r"CashAndCashEquivalents|RestrictedCash|MarketableSecurities|AvailableForSale|HeldToMaturity|TradingSecurities|EquitySecurities|DebtSecurities|Investments?$|Investments?[A-Z]|ShortTermInvestments"),
    ("Receivables", r"Receivable"),
    ("Inventory", r"Inventor"),
    ("Property, Plant & Equipment", r"PropertyPlantAndEquipment|Depreciation|Premises|ConstructionInProgress|CapitalizedComputerSoftware|AssetRetirement"),
    ("Debt & Borrowings", r"Debt|Borrow|NotesPayable|CommercialPaper|LineOfCredit|LettersOfCredit|SeniorNotes|Subordinated"),
    ("Equity & Shares", r"CommonStock|PreferredStock|TreasuryStock|PaidInCapital|RetainedEarnings|Dividend|StockholdersEquity|SharesOutstanding|SharesIssued|SharesAuthorized|StockIssuedDuringPeriod|StockRepurchase|WeightedAverageNumber|EarningsPerShare"),
    ("Revenue", r"Revenue|^Sales|SalesRevenue"),
    ("Cash Flow Items", r"^ProceedsFrom|^PaymentsTo|^PaymentsFor|^PaymentsOf|^IncreaseDecreaseIn|^NetCashProvidedBy|SupplementalCash|NoncashOrPartNoncash"),
    ("Fair Value", r"FairValue"),
    ("Commitments & Contingencies", r"Commitment|Contingenc|Litigation|Guarante|LossContingency"),
    ("Earnings & Income", r"NetIncome|ProfitLoss|OperatingIncome|IncomeLoss|GrossProfit"),
    ("Costs & Expenses", r"CostOf|Expense|CostsAndExpenses|SellingGeneral|ResearchAndDevelopment"),
    ("Assets & Liabilities (Other)", r"Assets|Liabilit"),
]
_COMPILED = [(name, re.compile(pat)) for name, pat in TOPIC_RULES]


def topic_for(tag: str) -> str:
    for name, pat in _COMPILED:
        if pat.search(tag):
            return name
    return "Other"


def store_stats(db_path: str) -> tuple[list[int], dict[str, dict]]:
    """Per-tag usage stats across the store's fully-ingested companies
    (fiscal_year IS NOT NULL -- same 'real ingestion' scoping as has_any_facts)."""
    con = sqlite3.connect(db_path)
    cur = con.cursor()
    ciks = [r[0] for r in cur.execute(
        "SELECT DISTINCT cik FROM raw_facts WHERE fiscal_year IS NOT NULL ORDER BY cik"
    )]
    stats: dict[str, dict] = {}
    for tag, n_cik, n_facts, units, instants, durations, fy_min, fy_max in cur.execute(
        """
        SELECT gaap_tag, COUNT(DISTINCT cik), COUNT(*),
               GROUP_CONCAT(DISTINCT unit),
               SUM(CASE WHEN instant IS NOT NULL THEN 1 ELSE 0 END),
               SUM(CASE WHEN period_start IS NOT NULL THEN 1 ELSE 0 END),
               MIN(fiscal_year), MAX(fiscal_year)
        FROM raw_facts
        WHERE taxonomy='us-gaap' AND fiscal_year IS NOT NULL
        GROUP BY gaap_tag
        """
    ):
        stats[tag] = {
            "companies": n_cik,
            "facts": n_facts,
            "units": sorted({u for u in (units or "").split(",") if u}),
            "period_type": "instant" if durations == 0 else ("duration" if instants == 0 else "mixed"),
            "fy_range": [fy_min, fy_max],
        }
    con.close()
    return ciks, stats


async def harvest_labels(ciks: list[int]) -> dict[str, dict]:
    """tag -> {label, description} from the ingested CIKs' companyfacts payloads
    (first non-empty wins). One throttled request per CIK, compliant User-Agent --
    goes through SECClient like every other SEC call in this repo."""
    from secfin.sec.client import SECClient

    meta: dict[str, dict] = {}
    async with SECClient() as client:
        for i, cik in enumerate(ciks, 1):
            try:
                payload = await client.get_json(client.company_facts_url(cik))
            except Exception as e:  # noqa: BLE001 -- a dead CIK shouldn't kill the run
                print(f"  [{i}/{len(ciks)}] CIK {cik}: FAILED {e}", file=sys.stderr)
                continue
            for tag, body in payload.get("facts", {}).get("us-gaap", {}).items():
                slot = meta.setdefault(tag, {"label": None, "description": None})
                if not slot["label"] and body.get("label"):
                    slot["label"] = body["label"]
                if not slot["description"] and body.get("description"):
                    slot["description"] = body["description"]
            print(f"  [{i}/{len(ciks)}] CIK {cik}: ok", file=sys.stderr)
    return meta


def assemble(stats: dict[str, dict], meta: dict[str, dict], n_companies: int) -> list[dict]:
    from secfin.normalize.mapping import concept_for_tag

    rows = []
    for tag, s in stats.items():
        m = meta.get(tag, {})
        rows.append({
            "tag": tag,
            "label": m.get("label") or tag,
            "description": m.get("description") or "",
            **s,
            "canonical_concept": concept_for_tag(tag),
            "topic": topic_for(tag),
        })
    rows.sort(key=lambda r: (-r["companies"], r["tag"]))
    return rows


def main() -> None:
    db_path = os.environ.get("SECFIN_DB_PATH", "./data/secfin.db")
    ciks, stats = store_stats(db_path)
    meta = asyncio.run(harvest_labels(ciks))
    rows = assemble(stats, meta, len(ciks))
    print(json.dumps({
        "_meta": {
            "generated": dt.date.today().isoformat(),
            "ingested_companies": len(ciks),
            "distinct_tags": len(rows),
            "source": "store stats (raw_facts) + FASB labels/descriptions from SEC companyfacts",
            "regenerate": "docker compose run --rm -T api python - < scripts/tag_glossary.py > docs/tag_glossary.jsonl",
        }
    }))
    for r in rows:
        print(json.dumps(r, separators=(",", ":")))


if __name__ == "__main__":
    main()

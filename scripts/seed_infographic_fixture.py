"""Seed a realistic 12-company / 12-quarter peer universe, then run the REAL Metrics Phase 2
pipeline against it, for authoring the `infographic-template.html` example with genuine
computed numbers (not hand-invented ones).

Why this exists (see docs/ROADMAP_METRICS.md / CLAUDE.md): there is no production DB in this
repo, and a real SEC bulk companyfacts backfill needs network access and hours of runtime --
out of scope for authoring one static example page. This script is the honest substitute: it
builds synthetic-but-structurally-real `RawFact`s (the same shape `sec/companyfacts.py`
produces from an actual filing -- YTD-cumulative durations for flows, point-in-time instants
for stocks) for AAPL's real CIK plus 11 synthetic peers in AAPL's real SIC group, then runs the
*unmodified* production jobs end to end:

    RawFactRepository.upsert_raw_facts  ->  metrics_backfill.run_metrics_backfill
        ->  analytical/peer_ranks.run_peer_ranks
        ->  analytical/peer_distribution.run_peer_distribution

Every number the infographic displays is transcribed from this pipeline's real output, not
invented -- same "hand-copied from a real API response" pattern the page already uses for its
existing hardcoded sections, just from a richer fixture. See the plan's "Backend: full
companyfacts backfill" decision.

No network. Run against a throwaway DB:
    SECFIN_DB_PATH=./data/infographic_fixture.db python scripts/seed_infographic_fixture.py
Then inspect via the API (uvicorn against that same SECFIN_DB_PATH) or read the printed summary
below and copy values into the page.
"""

from __future__ import annotations

import os
from pathlib import Path

from secfin.analytical.peer_distribution import run_peer_distribution
from secfin.analytical.peer_ranks import run_peer_ranks
from secfin.ingest.metrics_backfill import run_metrics_backfill
from secfin.normalize.schema import RawFact
from secfin.storage.company_profile_repository import CompanyProfile
from secfin.storage.sqlite_company_profile_repository import SQLiteCompanyProfileRepository
from secfin.storage.sqlite_metric_distribution_repository import (
    SQLiteMetricDistributionRepository,
)
from secfin.storage.sqlite_metric_rank_repository import SQLiteMetricRankRepository
from secfin.storage.sqlite_metric_value_repository import SQLiteMetricValueRepository
from secfin.storage.sqlite_repository import SQLiteRawFactRepository

AAPL_CIK = 320193
SIC = "3571"  # Electronic Computers -- AAPL's real SIC, so the group is genuine
YEARS = [2022, 2023, 2024]
QUARTER_ENDS = ["-03-31", "-06-30", "-09-30", "-12-31"]  # calendar-aligned, for simplicity
FORM_BY_QUARTER = ["10-Q", "10-Q", "10-Q", "10-K"]

# --- GAAP tags used (see normalize/mapping.py -- these are each concept's PRIMARY candidate,
# so the metric engine's per-concept tag selection picks them up directly). ------------------
_TAG = {
    "revenue": "RevenueFromContractWithCustomerExcludingAssessedTax",
    "cost_of_revenue": "CostOfRevenue",
    "operating_income": "OperatingIncomeLoss",
    "net_income": "NetIncomeLoss",
    "cash_from_operations": "NetCashProvidedByUsedInOperatingActivities",
    "capital_expenditures": "PaymentsToAcquirePropertyPlantAndEquipment",
    "eps_diluted": "EarningsPerShareDiluted",
    "total_assets": "Assets",
    "total_current_assets": "AssetsCurrent",
    "total_current_liabilities": "LiabilitiesCurrent",
    "stockholders_equity": "StockholdersEquity",
    "long_term_debt": "LongTermDebtNoncurrent",
    "debt_current": "DebtCurrent",
    "shares_outstanding": "CommonStockSharesOutstanding",
}


class CompanyProfileGen:
    """Deterministic quarter-by-quarter financials for one synthetic (or AAPL) company.

    Not a statistical model -- a hand-tuned toy generator that produces internally-consistent,
    monotonically-spread-across-peers numbers so the REAL pipeline's percentile/z-score/
    distribution math has something genuine to compute over. Values are plausible in magnitude
    but not claimed to match any real company's actual filings (AAPL included -- this fixture
    uses AAPL's real CIK/SIC as an anchor for a realistic peer group, not its real financials).
    """

    def __init__(
        self,
        cik: int,
        name: str,
        base_quarterly_revenue: float,
        qoq_growth: float,
        gross_margin: float,
        opex_ratio: float,
        tax_rate: float,
        asset_turnover: float,
        equity_ratio: float,
        debt_ratio: float,
        ocf_multiplier: float,
        capex_ratio: float,
        shares_diluted_start: float,
        annual_buyback_rate: float,
    ) -> None:
        self.cik = cik
        self.name = name
        self.base_quarterly_revenue = base_quarterly_revenue
        self.qoq_growth = qoq_growth
        self.gross_margin = gross_margin
        self.opex_ratio = opex_ratio
        self.tax_rate = tax_rate
        self.asset_turnover = asset_turnover
        self.equity_ratio = equity_ratio
        self.debt_ratio = debt_ratio
        self.ocf_multiplier = ocf_multiplier
        self.capex_ratio = capex_ratio
        self.shares_diluted_start = shares_diluted_start
        self.annual_buyback_rate = annual_buyback_rate

    def quarterly_revenue(self, q_index: int) -> float:
        # Small seasonal bump on Q4 (holiday-quarter effect), compounding growth over 12 quarters.
        seasonal = 1.15 if q_index % 4 == 3 else 1.0
        return self.base_quarterly_revenue * (1 + self.qoq_growth) ** q_index * seasonal

    def facts(self) -> list[RawFact]:
        out: list[RawFact] = []
        cumulative: dict[str, float] = dict.fromkeys(
            [
                "revenue",
                "cost_of_revenue",
                "operating_income",
                "net_income",
                "cash_from_operations",
                "capital_expenditures",
            ],
            0.0,
        )
        q_index = 0
        shares = self.shares_diluted_start
        for year in YEARS:
            year_start = f"{year}-01-01"
            for qi, suffix in enumerate(QUARTER_ENDS):
                end = f"{year}{suffix}"
                form = FORM_BY_QUARTER[qi]
                filed = end  # filing date -- exact value doesn't matter for latest-filed-wins
                rev_q = self.quarterly_revenue(q_index)
                cor_q = rev_q * (1 - self.gross_margin)
                opinc_q = rev_q * (self.gross_margin - self.opex_ratio)
                ni_q = opinc_q * (1 - self.tax_rate)
                ocf_q = ni_q * self.ocf_multiplier
                capex_q = rev_q * self.capex_ratio

                cumulative["revenue"] += rev_q
                cumulative["cost_of_revenue"] += cor_q
                cumulative["operating_income"] += opinc_q
                cumulative["net_income"] += ni_q
                cumulative["cash_from_operations"] += ocf_q
                cumulative["capital_expenditures"] += capex_q

                for concept in (
                    "revenue",
                    "cost_of_revenue",
                    "operating_income",
                    "net_income",
                    "cash_from_operations",
                    "capital_expenditures",
                ):
                    out.append(
                        RawFact(
                            cik=self.cik,
                            taxonomy="us-gaap",
                            gaap_tag=_TAG[concept],
                            label=concept,
                            unit="USD",
                            value=cumulative[concept],
                            period_start=year_start,
                            period_end=end,
                            fiscal_year=year,
                            fiscal_period="FY" if qi == 3 else f"Q{qi + 1}",
                            form=form,
                            filed=filed,
                            accession=f"synthetic-{self.cik}-{end}",
                        )
                    )

                # FY-only EPS -- eps_diluted is not summable across quarters (see
                # normalize/metrics.py's `_reported_per_share`); a direct annual duration is
                # the only shape the engine will resolve, so only emit it at Q4/FY.
                if qi == 3:
                    ttm_ni = sum(
                        self.quarterly_revenue(q_index - k)
                        * (self.gross_margin - self.opex_ratio)
                        * (1 - self.tax_rate)
                        for k in range(4)
                    )
                    eps = ttm_ni / shares
                    out.append(
                        RawFact(
                            cik=self.cik,
                            taxonomy="us-gaap",
                            gaap_tag=_TAG["eps_diluted"],
                            label="eps_diluted",
                            unit="USD/shares",
                            value=eps,
                            period_start=year_start,
                            period_end=end,
                            fiscal_year=year,
                            fiscal_period="FY",
                            form=form,
                            filed=filed,
                            accession=f"synthetic-{self.cik}-{end}",
                        )
                    )

                # Stocks (instants): assets scale off TTM revenue via asset_turnover; equity
                # and debt as a fraction of assets; shares decline via steady buybacks.
                ttm_rev = sum(
                    self.quarterly_revenue(q_index - k) for k in range(min(4, q_index + 1))
                )
                assets = ttm_rev / self.asset_turnover if self.asset_turnover else ttm_rev
                equity = assets * self.equity_ratio
                total_debt = assets * self.debt_ratio
                long_term_debt = total_debt * 0.7
                debt_current = total_debt * 0.3
                current_assets = assets * 0.45
                current_liabilities = assets * 0.30
                shares = shares * (1 - self.annual_buyback_rate / 4)

                for concept, value, unit in (
                    ("total_assets", assets, "USD"),
                    ("total_current_assets", current_assets, "USD"),
                    ("total_current_liabilities", current_liabilities, "USD"),
                    ("stockholders_equity", equity, "USD"),
                    ("long_term_debt", long_term_debt, "USD"),
                    ("debt_current", debt_current, "USD"),
                    ("shares_outstanding", shares, "shares"),
                ):
                    out.append(
                        RawFact(
                            cik=self.cik,
                            taxonomy="us-gaap",
                            gaap_tag=_TAG[concept],
                            label=concept,
                            unit=unit,
                            value=value,
                            instant=end,
                            fiscal_year=year,
                            fiscal_period="FY" if qi == 3 else f"Q{qi + 1}",
                            form=form,
                            filed=filed,
                            accession=f"synthetic-{self.cik}-{end}",
                        )
                    )
                q_index += 1
        return out


def _build_peer_universe() -> list[CompanyProfileGen]:
    # AAPL anchors the group at a strong-but-plausible profile (high margins, thin equity from
    # buybacks -> high ROE, moderate leverage). The 11 synthetic peers spread evenly around it
    # so every metric has a real, non-degenerate cross-sectional distribution.
    companies = [
        CompanyProfileGen(
            cik=AAPL_CIK,
            name="AAPL (synthetic fixture)",
            base_quarterly_revenue=90_000_000_000,
            qoq_growth=0.018,
            gross_margin=0.44,
            opex_ratio=0.14,
            tax_rate=0.16,
            asset_turnover=1.15,
            equity_ratio=0.22,
            debt_ratio=0.30,
            ocf_multiplier=1.25,
            capex_ratio=0.03,
            shares_diluted_start=16_000_000_000,
            annual_buyback_rate=0.04,
        )
    ]
    for i in range(11):
        frac = i / 10.0  # 0.0 .. 1.0 spread across peers
        companies.append(
            CompanyProfileGen(
                cik=900_001 + i,
                name=f"Peer {i + 1}",
                base_quarterly_revenue=8_000_000_000 + frac * 40_000_000_000,
                qoq_growth=0.005 + frac * 0.02,
                gross_margin=0.25 + frac * 0.30,
                opex_ratio=0.10 + frac * 0.08,
                tax_rate=0.18 + frac * 0.05,
                asset_turnover=0.5 + frac * 1.1,
                equity_ratio=0.30 + frac * 0.30,
                debt_ratio=0.10 + frac * 0.25,
                ocf_multiplier=1.05 + frac * 0.25,
                capex_ratio=0.02 + frac * 0.07,
                shares_diluted_start=500_000_000 + frac * 4_000_000_000,
                annual_buyback_rate=0.0 + frac * 0.03,
            )
        )
    return companies


def main() -> None:
    db_path = os.environ.get("SECFIN_DB_PATH", "./data/infographic_fixture.db")
    Path(db_path).parent.mkdir(parents=True, exist_ok=True)

    companies = _build_peer_universe()

    fact_repo = SQLiteRawFactRepository(db_path)
    profile_repo = SQLiteCompanyProfileRepository(db_path)
    try:
        for c in companies:
            fact_repo.upsert_raw_facts(c.facts())
            profile_repo.upsert(
                CompanyProfile(
                    cik=c.cik, sic=SIC, sic_description="Electronic Computers", name=c.name
                )
            )
    finally:
        fact_repo.close()
        profile_repo.close()
    print(f"seeded {len(companies)} companies (SIC {SIC}), {len(YEARS) * 4} quarters each")

    run_metrics_backfill(db_path)
    print("metrics_backfill done")
    n_ranks = run_peer_ranks(db_path, sic_digits=2, min_size=5)
    print(f"peer_ranks done: {n_ranks} rows")
    n_dist = run_peer_distribution(db_path, sic_digits=2, min_size=5)
    print(f"peer_distribution done: {n_dist} rows")

    # Print AAPL's genuine computed output for every year/quarter, for hand-transcription into
    # the infographic. This is the single source of truth for every number the page shows.
    value_repo = SQLiteMetricValueRepository(db_path)
    rank_repo = SQLiteMetricRankRepository(db_path)
    dist_repo = SQLiteMetricDistributionRepository(db_path)
    try:
        print("\n=== AAPL metric_values (all periods) ===")
        for row in sorted(
            value_repo.get_for_cik(AAPL_CIK), key=lambda r: (r.fiscal_year, r.fiscal_period)
        ):
            print(row)
        print("\n=== AAPL peer ranks (2024 FY) ===")
        for row in rank_repo.get_for_cik(AAPL_CIK, 2024, "FY"):
            print(row)
        print("\n=== AAPL peer ranks, per quarter (net_margin) ===")
        for year in YEARS:
            for q in ("Q1", "Q2", "Q3", "Q4"):
                for row in rank_repo.get_for_cik(AAPL_CIK, year, q):
                    if row.metric == "net_margin":
                        print(year, q, row)
        print("\n=== Peer distribution, net_margin, 2024 FY ===")
        print(dist_repo.get("35", 2024, "FY", "net_margin"))
    finally:
        value_repo.close()
        rank_repo.close()
        dist_repo.close()


if __name__ == "__main__":
    main()

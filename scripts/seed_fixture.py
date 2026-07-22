"""Seed the operational DB with the test fixtures for a self-contained e2e/dev run.

Loads the trimmed AAPL/JPM/WMT companyfacts fixtures (us-gaap + dei) into the RawFact store at
SECFIN_DB_PATH, plus a couple of CUSIP resolutions so /coverage shows a non-empty rate. No
network — everything comes from tests/fixtures/. Used by docker-compose's `e2e` profile before
uvicorn starts; also handy locally: `SECFIN_DB_PATH=./data/e2e.db python scripts/seed_fixture.py`.
"""

from __future__ import annotations

import json
import os
from pathlib import Path

from secfin.auth.keys import hash_api_key
from secfin.normalize.schema import (
    BeneficialOwnership,
    BeneficialOwnershipFilingMeta,
    HoldingsSnapshot,
    InsiderFilingMeta,
    InsiderTransaction,
    InstitutionalHolding,
    OtherManager13F,
)
from secfin.sec.companyfacts import flatten_all_taxonomies
from secfin.storage.company_profile_repository import CompanyProfile
from secfin.storage.metric_rank_repository import MetricRankRow
from secfin.storage.sqlite_api_key_repository import SQLiteApiKeyRepository
from secfin.storage.sqlite_beneficial_ownership_repository import (
    SQLiteBeneficialOwnershipRepository,
)
from secfin.storage.sqlite_company_profile_repository import SQLiteCompanyProfileRepository
from secfin.storage.sqlite_cusip_repository import SQLiteCusipMapRepository
from secfin.storage.sqlite_holdings_repository import SQLiteHoldingsSnapshotRepository
from secfin.storage.sqlite_insider_repository import SQLiteInsiderTransactionRepository
from secfin.storage.metric_value_repository import MetricValueRow
from secfin.storage.sqlite_metric_rank_repository import SQLiteMetricRankRepository
from secfin.storage.sqlite_metric_value_repository import SQLiteMetricValueRepository
from secfin.storage.sqlite_repository import SQLiteRawFactRepository

# A fixed demo API key so gated endpoints can be exercised offline / in the e2e profile.
# NOT a real credential -- only ever created against a throwaway seeded DB.
DEMO_API_KEY = "clearyfi-demo-e2e-key"

FIXTURES = Path(__file__).resolve().parent.parent / "tests" / "fixtures"
COMPANIES = [
    ("aapl_companyfacts.json", 320193),
    ("jpm_companyfacts.json", 19617),
    ("wmt_companyfacts.json", 104169),
]

# Synthetic insider filers for the demo Insider tab (there's no companyfacts fixture for
# Forms 3/4/5). Plausible but NOT real transactions -- enough to render the tab offline.
_INSIDER_OWNERS = [
    ("Cook Timothy D", "officer: Chief Executive Officer"),
    ("Maestri Luca", "officer: Chief Financial Officer"),
    ("Adams Katherine L", "officer: General Counsel"),
    ("O'Brien Deirdre", "officer: Senior Vice President"),
    ("Levinson Arthur D", "director"),
]
_INSIDER_FILINGS = 26  # >= the Insider tab's default limit so it serves from cache offline


def _seed_insider(db_path: str) -> None:
    from datetime import date, timedelta

    repo = SQLiteInsiderTransactionRepository(db_path)
    filings, txns = [], []
    base = date(2026, 6, 15)
    shares_after = 3_400_000
    for i in range(_INSIDER_FILINGS):
        filed = (base - timedelta(days=i * 24)).isoformat()
        accession = f"0000320193-26-9{i:05d}"
        filings.append(InsiderFilingMeta(accession=accession, filed=filed, form_type="4"))
        owner, rel = _INSIDER_OWNERS[i % len(_INSIDER_OWNERS)]
        disposed = i % 3 != 0  # mostly sales (typical for insiders), some acquisitions
        shares = 5_000 + (i % 5) * 2_500
        shares_after -= shares if disposed else -shares
        txns.append(
            InsiderTransaction(
                issuer_cik=320193,
                issuer_name="Apple Inc.",
                owner_name=owner,
                owner_relationship=rel,
                transaction_date=filed,
                security_title="Common Stock",
                shares=float(shares),
                price_per_share=190.0 + (i % 8) * 5.0,
                acquired_disposed="D" if disposed else "A",
                ownership_type="direct",
                shares_owned_after=float(shares_after),
                form_type="4",
                accession=accession,
                filed=filed,
                is_holding=False,
            )
        )
    try:
        repo.upsert_insider_transactions(320193, filings, txns)
        print(f"seeded insider: {len(filings)} AAPL filings, {len(txns)} transactions")
    finally:
        repo.close()


# Synthetic 5%+ holders for the demo 13D/G tab (no fixture; modern structured-XML era only).
# A handful of institutions, each with several annual amendments -- realistic, and enough
# filings to satisfy the tab's limit so it serves from cache offline (no live SEC fetch).
_BENEFICIAL_OWNERS = [
    ("The Vanguard Group, Inc.", "13G", 8.3),
    ("BlackRock, Inc.", "13G", 6.7),
    ("State Street Corporation", "13G", 5.4),
    ("Berkshire Hathaway Inc.", "13D", 5.9),
    ("FMR LLC", "13G", 5.1),
]
_BENEFICIAL_FILINGS_PER_OWNER = 5  # 5 owners x 5 annual filings = 25 (>= the tab's limit)


def _seed_beneficial(db_path: str) -> None:
    from datetime import date, timedelta

    repo = SQLiteBeneficialOwnershipRepository(db_path)
    filings, owners = [], []
    base = date(2026, 2, 12)
    seq = 0
    for name, kind, pct0 in _BENEFICIAL_OWNERS:
        for j in range(_BENEFICIAL_FILINGS_PER_OWNER):
            # newest is the original "SCHEDULE 13x", older ones are amendments "/A"
            form = f"SCHEDULE {kind}" if j == 0 else f"SCHEDULE {kind}/A"
            filed = (base - timedelta(days=(seq * 15) + j * 365)).isoformat()
            accession = f"0001193125-26-2{seq:05d}"
            pct = round(pct0 - j * 0.3, 1)
            filings.append(
                BeneficialOwnershipFilingMeta(accession=accession, filed=filed, form_type=form)
            )
            owners.append(
                BeneficialOwnership(
                    issuer_cik=320193,
                    issuer_name="Apple Inc.",
                    owner_name=name,
                    form_type=form,
                    percent_of_class=pct,
                    shares_beneficially_owned=float(int(pct * 151_000_000)),
                    event_date=filed,
                    filed=filed,
                    accession=accession,
                )
            )
            seq += 1
    try:
        repo.upsert_beneficial_ownership(320193, filings, owners)
        print(f"seeded 13D/G: {len(filings)} AAPL filings, {len(owners)} rows")
    finally:
        repo.close()


# Synthetic 13F holdings for the demo Institutional tab + Manager profile page. Three
# managers holding AAPL (037833100, resolved in the fixture below) and Ally (02005N100,
# deliberately left unresolved) across four consecutive quarters, so: the issuer/manager
# period axes are non-empty, holders render, the quarter-over-quarter diff yields real
# New/Added/Reduced activity, and the Phase 5.4 portfolio-value-over-time line has a real
# multi-point series to draw (all four quarters are >= 2024-01-01, so none are excluded by
# that feature's unit-convention rule). AAPL resolves from the seeded cusip cache; every
# other CUSIP (Ally + the synthetic _BRK_EXTRA_POSITIONS below) stays honestly unresolved --
# their invented issuer names have no exact match in SEC's company_tickers.json, so the
# resolver records them unresolved (one live name-index fetch per process, same as before).
# Plausible but NOT real positions.
_HOLDINGS_QUARTERS = ["2025-06-30", "2025-09-30", "2025-12-31", "2026-03-31"]  # newest last;
# the views default to newest, and it's unchanged from before this series was extended.
# (manager_cik, name, location, {quarter: AAPL shares}); the second (Ally) line is a fixed
# smaller position. `location` is the filer's real HQ stateOrCountry code (Omaha NE / Malvern
# PA / Boston MA), so the demo holder-geography choropleth colors real states.
_HOLDINGS_MANAGERS = [
    (1067983, "BERKSHIRE HATHAWAY INC", "NE", {
        "2025-06-30": 320_000_000, "2025-09-30": 310_000_000,
        "2025-12-31": 300_000_000, "2026-03-31": 280_000_000,
    }),
    (102909, "VANGUARD GROUP INC", "PA", {
        "2025-06-30": 1_180_000_000, "2025-09-30": 1_210_000_000,
        "2025-12-31": 1_250_000_000, "2026-03-31": 1_310_000_000,
    }),
    (93751, "STATE STREET CORP", "MA", {
        "2025-06-30": 540_000_000, "2025-09-30": 565_000_000,
        "2025-12-31": 590_000_000, "2026-03-31": 640_000_000,
    }),
]
_AAPL_PRICE = 190.0  # rough $/share to derive a plausible position value

# Extra synthetic Berkshire-only positions so the Phase 5 charts have a realistically deep
# book to draw (composition strip/bars, % -change diverging bars, dumbbells, stat tiles).
# Issuer names are deliberately INVENTED (no normalized exact match in SEC's
# company_tickers.json), so the resolver records them unresolved rather than attaching a
# real CIK; CUSIPs use a reserved-looking 90000... prefix. Per-quarter share maps encode a
# spread of actions in the newest diff (Q4'25 -> Q1'26): added, reduced, new, exited,
# unchanged, plus one Put option row and one PRN (principal) row that charts must label /
# never share-sum. A quarter missing from a map = position not held that quarter.
# (cusip, issuer_name, $/unit, put_call, shares_or_principal, {quarter: units})
_BRK_EXTRA_POSITIONS = [
    ("90000AAA1", "NORTHWIND TRADING CO", 58.0, None, "SH",
     {"2025-06-30": 40_000_000, "2025-09-30": 44_000_000, "2025-12-31": 44_000_000, "2026-03-31": 52_000_000}),
    ("90000BBB2", "CASCADE FOODS CORP", 112.0, None, "SH",
     {"2025-06-30": 18_000_000, "2025-09-30": 18_000_000, "2025-12-31": 16_000_000, "2026-03-31": 14_000_000}),
    ("90000CCC3", "HARBORLIGHT ENERGY CO", 34.0, None, "SH",
     {"2025-06-30": 60_000_000, "2025-09-30": 55_000_000, "2025-12-31": 48_000_000, "2026-03-31": 48_000_000}),
    ("90000DDD4", "BLUE MESA RAILWAYS INC", 205.0, None, "SH",
     {"2025-06-30": 9_000_000, "2025-09-30": 9_000_000, "2025-12-31": 9_000_000, "2026-03-31": 9_000_000}),
    ("90000EEE5", "IRONGATE INSURANCE GRP", 77.0, None, "SH",
     {"2025-06-30": 25_000_000, "2025-09-30": 27_000_000, "2025-12-31": 27_000_000, "2026-03-31": 30_000_000}),
    ("90000FFF6", "SUMMIT PAPER MILLS INC", 23.0, None, "SH",
     {"2025-06-30": 70_000_000}),  # exited early: only shows in the oldest diff
    ("90000GGG7", "COPPERFIELD BANCORP", 41.0, None, "SH",
     {"2025-12-31": 12_000_000, "2026-03-31": 20_000_000}),  # new mid-history, then added
    ("90000HHH8", "LANTERN MEDIA HLDGS", 16.0, None, "SH",
     {"2025-06-30": 30_000_000, "2025-09-30": 30_000_000, "2025-12-31": 30_000_000}),  # exited in newest diff
    ("90000III9", "QUARRY INDUSTRIAL PARTNERS", 88.0, None, "SH",
     {"2026-03-31": 11_000_000}),  # new in newest diff
    ("90000JJJ0", "DRIFTWOOD HOTELS CORP", 52.0, None, "SH",
     {"2025-06-30": 14_000_000, "2025-09-30": 14_000_000, "2025-12-31": 15_000_000, "2026-03-31": 15_000_000}),
    ("90000KKK1", "THISTLEDOWN PHARMA INC", 9.0, "Put", "SH",
     {"2025-06-30": 8_000_000, "2025-09-30": 8_000_000, "2025-12-31": 6_000_000, "2026-03-31": 6_000_000}),
    ("90000LLL2", "MERIDIAN GRAIN CO NOTES", 1.0, None, "PRN",
     {"2025-06-30": 250_000_000, "2025-09-30": 250_000_000, "2025-12-31": 250_000_000, "2026-03-31": 250_000_000}),
]


def _seed_holdings(db_path: str) -> None:
    repo = SQLiteHoldingsSnapshotRepository(db_path)
    seeded = 0
    try:
        for i, (mcik, name, location, aapl_by_q) in enumerate(_HOLDINGS_MANAGERS):
            ally_shares = float(5_000_000 + i * 1_000_000)
            for qi, quarter in enumerate(_HOLDINGS_QUARTERS):
                aapl_shares = float(aapl_by_q[quarter])
                holdings = [
                    InstitutionalHolding(
                        cusip="037833100",
                        issuer_name="APPLE INC",
                        shares=aapl_shares,
                        value=aapl_shares * _AAPL_PRICE,
                    ),
                    InstitutionalHolding(
                        cusip="02005N100",
                        issuer_name="ALLY FINL INC",
                        shares=ally_shares,
                        value=ally_shares * 35.0,
                    ),
                ]
                if mcik == 1067983:
                    for cusip, iname, price, put_call, sop, by_q in _BRK_EXTRA_POSITIONS:
                        units = by_q.get(quarter)
                        if units is None:
                            continue
                        holdings.append(
                            InstitutionalHolding(
                                cusip=cusip,
                                issuer_name=iname,
                                shares=float(units),
                                shares_or_principal=sop,
                                put_call=put_call,
                                value=float(units) * price,
                            )
                        )
                # Give one manager a co-filer roster so the manager page's roster renders.
                other = (
                    [
                        OtherManager13F(
                            sequence_number=1, name="NATIONAL INDEMNITY CO", file_number="28-1234"
                        )
                    ]
                    if mcik == 1067983
                    else []
                )
                repo.upsert_snapshot(
                    HoldingsSnapshot(
                        manager_cik=mcik,
                        manager_name=name,
                        report_period=quarter,
                        filed=quarter,
                        accession=f"{mcik:010d}-26-00000{qi}",
                        is_amendment=False,
                        holdings=holdings,
                        other_managers=other,
                        filing_manager_location=location,
                    )
                )
                seeded += 1
        print(f"seeded 13F holdings: {seeded} snapshots across {len(_HOLDINGS_MANAGERS)} managers")
    finally:
        repo.close()


# A second issuer (JPM -- which HAS companyfacts, so its company page renders cleanly) held by
# one manager with NO reported location. This is the DEFAULT state for real 13F data before a
# location backfill runs, and it's the regression guard for the holder-geography EMPTY STATE
# (docs/delivery/institutional-tab-viz/4-qa.md round 3): with by_state empty, the choropleth must
# show an honest "no locations to map yet" note + tallies, never a blank all-neutral US map.
_JPM_CUSIP = "46625H100"
_JPM_CIK = 19617


def _seed_nolocation_holdings(db_path: str) -> None:
    repo = SQLiteHoldingsSnapshotRepository(db_path)
    try:
        for qi, quarter in enumerate(("2025-12-31", "2026-03-31")):
            shares = float(2_000_000 + qi * 250_000)
            repo.upsert_snapshot(
                HoldingsSnapshot(
                    manager_cik=71,
                    manager_name="NORTHLESS CAPITAL PARTNERS",
                    report_period=quarter,
                    filed=quarter,
                    accession=f"0000000071-26-00000{qi}",
                    is_amendment=False,
                    filing_manager_location=None,  # the real default: no address ingested yet
                    holdings=[
                        InstitutionalHolding(
                            cusip=_JPM_CUSIP,
                            issuer_name="JPMORGAN CHASE & CO",
                            shares=shares,
                            value=shares * 200.0,
                        )
                    ],
                )
            )
        # A SECOND JPM holder so the ownership treemap has more than one filer to tile (both
        # render as small squares against the large "not reported by these filers" remainder --
        # these two demo filers hold well under 1% of JPM's shares outstanding). Location stays
        # None so the geography empty-state guard on this same page is unaffected.
        for qi, quarter in enumerate(("2025-12-31", "2026-03-31")):
            jpm_shares = float(1_400_000 + qi * 100_000)
            repo.upsert_snapshot(
                HoldingsSnapshot(
                    manager_cik=72,
                    manager_name="EVERPEAK ADVISORS LLC",
                    report_period=quarter,
                    filed=quarter,
                    accession=f"0000000072-26-00000{qi}",
                    is_amendment=False,
                    filing_manager_location=None,
                    holdings=[
                        InstitutionalHolding(
                            cusip=_JPM_CUSIP,
                            issuer_name="JPMORGAN CHASE & CO",
                            shares=jpm_shares,
                            value=jpm_shares * 200.0,
                        )
                    ],
                )
            )
        print("seeded no-location 13F holders (JPM) for the geography empty-state guard")
    finally:
        repo.close()


# Extra AAPL holders whose OTHER books partially overlap -- gives the co-holding network
# (docs/delivery/institutional-tab-viz/2d-...) a real ~7-node graph with DIFFERENTIATED edges (a
# 4-manager cluster with Jaccard 0.2-0.6, plus the existing Vanguard/State Street pair on {Ally},
# plus an isolated Berkshire whose deep synthetic book overlaps no one above the threshold) instead
# of a 3-node triangle. Overlap is measured by CUSIP; these synthetic "other" CUSIPs stay unresolved
# by design (fine -- the network measures CUSIP overlap, not CIK). Seeded for the newest quarter only.
_CO_POOL = {  # cusip -> (issuer_name, $/share) for the shared "other holdings" pool
    "91000AAA1": ("ORCHARD RIDGE CAP CO", 40.0),
    "91000BBB2": ("SILVERBROOK INDS INC", 55.0),
    "91000CCC3": ("TIDEWATER MOBILITY CO", 28.0),
    "91000DDD4": ("KESTREL SOFTWARE INC", 120.0),
    "91000EEE5": ("BRASSTOWN UTILITIES CO", 33.0),
    "91000FFF6": ("PINEHURST FOODS CORP", 66.0),
}
# (manager_cik, name, state, AAPL shares, [other CUSIPs]) -- the "other" sets overlap by design.
_COHOLDING_MANAGERS = [
    (200, "FAIRWIND CAPITAL MGMT", "NY", 220_000_000,
     ["91000AAA1", "91000BBB2", "91000CCC3", "91000DDD4"]),
    (201, "GREYSTONE PARTNERS LP", "CA", 180_000_000,
     ["91000AAA1", "91000BBB2", "91000CCC3", "91000EEE5"]),
    (202, "MERIDIAN ASSET MGMT", "IL", 140_000_000,
     ["91000AAA1", "91000BBB2", "91000EEE5", "91000FFF6"]),
    (203, "HALLMARK ADVISORS INC", "TX", 90_000_000, ["91000DDD4", "91000FFF6"]),
]


def _seed_coholding(db_path: str) -> None:
    repo = SQLiteHoldingsSnapshotRepository(db_path)
    try:
        for mcik, name, state, aapl_shares, others in _COHOLDING_MANAGERS:
            holdings = [
                InstitutionalHolding(
                    cusip="037833100", issuer_name="APPLE INC",
                    shares=float(aapl_shares), value=float(aapl_shares) * 190.0,
                )
            ]
            for cusip in others:
                iname, price = _CO_POOL[cusip]
                holdings.append(
                    InstitutionalHolding(
                        cusip=cusip, issuer_name=iname, shares=5_000_000.0,
                        value=5_000_000.0 * price,
                    )
                )
            repo.upsert_snapshot(
                HoldingsSnapshot(
                    manager_cik=mcik,
                    manager_name=name,
                    report_period="2026-03-31",
                    filed="2026-03-31",
                    accession=f"{mcik:010d}-26-000001",
                    is_amendment=False,
                    filing_manager_location=state,
                    holdings=holdings,
                )
            )
        print(f"seeded {len(_COHOLDING_MANAGERS)} co-holding AAPL managers (overlapping books)")
    finally:
        repo.close()


# SIC codes for the three fixture companies (from their real submissions.json). Each is in a
# distinct 2-digit group, so none reaches the peer-rank min size -- the /peers endpoint returns
# an empty (insufficient-peers) result for them, which is the honest, correct outcome. Use
# scripts/seed_analytical_fixture.py for a populated peer group.
_SIC = [
    (320193, "3571", "Electronic Computers", "Apple Inc."),
    (19617, "6021", "National Commercial Banks", "JPMORGAN CHASE & CO"),
    (104169, "5331", "Retail-Variety Stores", "Walmart Inc."),
]


def _seed_sic(db_path: str) -> None:
    repo = SQLiteCompanyProfileRepository(db_path)
    try:
        for cik, sic, desc, name in _SIC:
            repo.upsert(CompanyProfile(cik=cik, sic=sic, sic_description=desc, name=name))
        print(f"seeded SIC profiles: {len(_SIC)} companies")
    finally:
        repo.close()


# Precomputed peer ranks for the demo Peer bars on the company hub. Written DIRECTLY (not via
# the DuckDB analytical batch) so the offline/e2e profile -- base install, no `analytical` extra
# -- can render peer position bars for AAPL. The real pipeline (ingest/metrics_backfill +
# analytical/peer_ranks over scripts/seed_analytical_fixture.py) is exercised by tests instead.
# Plausible but synthetic percentiles; SIC "35" is AAPL's real 2-digit group. Seeded for FY 2025
# (the hub's default period) and FY 2024.
_PEER_METRICS = [
    ("gross_margin", 78.0, 0.9),
    ("operating_margin", 82.0, 1.1),
    ("net_margin", 85.0, 1.3),
    ("roa", 91.0, 1.6),
    ("roe", 88.0, 1.4),
    ("fcf_margin", 80.0, 1.0),
    ("asset_turnover", 64.0, 0.4),
    ("eps_diluted", 72.0, 0.7),
]


def _seed_peer_ranks(db_path: str) -> None:
    repo = SQLiteMetricRankRepository(db_path)
    rows = []
    for year in (2025, 2024):
        for metric, pctile, z in _PEER_METRICS:
            rows.append(
                MetricRankRow(
                    cik=320193, fiscal_year=year, fiscal_period="FY", metric=metric,
                    peer_group="35", peer_count=8, percentile=pctile, z_score=z,
                )
            )
    try:
        repo.bulk_upsert(rows)
        print(f"seeded peer ranks: {len(rows)} AAPL rows (SIC 35)")
    finally:
        repo.close()


# Precomputed sector-aggregate DuPont rows for the demo /sectors overview. Written DIRECTLY (not
# via the DuckDB analytical batch) so the offline/e2e profile -- base install, no `analytical`
# extra -- can render the sector grid + DuPont tree + trend. The real pipeline
# (ingest/dupont_backfill + analytical/sector_dupont over a hydrated volume) is exercised
# separately. Rows are built with `aggregate_row` from synthetic sums, so the DuPont identity
# (roe == net_margin x asset_turnover x equity_multiplier) holds exactly, like real data. Shapes
# are plausible: banks thin-turnover/high-leverage, building materials leverage-heavy, etc. The
# "28" chemicals series deliberately SKIPS FY2023 so the trend line's coverage-gap break renders.
_SECTOR_DEMO = [
    # (group, net_margin, asset_turnover, equity_multiplier, base peer_count)
    ("35", 0.14, 0.85, 2.3, 26),
    ("60", 0.22, 0.06, 11.0, 40),
    ("28", 0.18, 0.62, 1.9, 22),
    ("73", 0.11, 0.78, 2.6, 55),
    ("52", 0.05, 1.90, 4.0, 12),
]
_SECTOR_YEARS = [2021, 2022, 2023, 2024, 2025]


def _seed_sector_dupont(db_path: str) -> None:
    from secfin.analytical.sector_dupont import aggregate_row
    from secfin.storage.sqlite_sector_dupont_repository import SQLiteSectorDupontRepository

    repo = SQLiteSectorDupontRepository(db_path)
    rows = []
    for group, nm, at, em, base_n in _SECTOR_DEMO:
        for year in _SECTOR_YEARS:
            if group == "28" and year == 2023:
                continue  # coverage gap -> the trend line breaks here, never a 0 point
            drift = 1.0 + 0.03 * (year - 2023)  # a gentle year-over-year margin drift
            if group == "73" and year == 2025:
                drift *= 1.5  # a latest-year JUMP so the biggest-shifts band has a favorable move
            s_eq = 1_000.0
            s_assets = em * s_eq
            s_rev = at * s_assets
            s_ni = (nm * drift) * s_rev
            row = aggregate_row(
                group, year, "FY", f"{year}-12-31", base_n + (year - 2021),
                s_ni, s_rev, s_assets, s_eq,
            )
            if row is not None:
                rows.append(row)
    try:
        repo.clear()
        repo.bulk_upsert(rows)
        print(f"seeded sector DuPont: {len(rows)} rows across {len(_SECTOR_DEMO)} sectors")
    finally:
        repo.close()


# Precomputed metric distributions for the demo /sectors box-and-whisker spreads. Written DIRECTLY
# (not via the DuckDB analytical batch) so the offline/e2e profile -- base install, no `analytical`
# extra -- can render the cross-sector box chart + per-sector spread panel. The real pipeline
# (analytical/peer_distribution.py over a hydrated volume) is exercised separately. Same SIC groups
# as `_SECTOR_DEMO`. `net_margin` is populated for every group (the default, always-drawn view);
# the liquidity/solvency metrics are populated for only SOME groups (the real-world shape -- sparse
# coverage), and group "28" is deliberately given NO liquidity/solvency rows so the per-sector panel
# exercises the omit-a-metric-never-a-zero-box path.
_SPREAD_DEMO = [
    # metric, group -> (min, p25, median, p75, max, peer_count)
    ("net_margin", {
        "35": (0.02, 0.09, 0.14, 0.19, 0.31, 26),
        "60": (-0.05, 0.12, 0.22, 0.29, 0.44, 40),
        "28": (0.04, 0.11, 0.18, 0.24, 0.33, 22),
        "73": (-0.18, 0.03, 0.11, 0.20, 0.55, 55),
        "52": (-0.02, 0.02, 0.05, 0.08, 0.14, 12),
    }),
    ("roe", {
        "35": (0.05, 0.14, 0.22, 0.31, 0.62, 26),
        "60": (0.02, 0.08, 0.13, 0.18, 0.29, 40),
        "73": (-0.30, 0.06, 0.19, 0.34, 1.10, 55),
    }),
    # roa + the growth metrics round out the Profitability / Growth theme drill-downs for group 73.
    ("roa", {
        "35": (0.01, 0.05, 0.08, 0.13, 0.24, 26),
        "73": (-0.10, 0.02, 0.06, 0.11, 0.22, 55),
    }),
    ("revenue_growth_yoy", {
        "73": (-0.20, 0.01, 0.07, 0.15, 0.48, 55),
    }),
    ("earnings_growth_yoy", {
        "73": (-0.45, -0.03, 0.05, 0.18, 0.90, 55),
    }),
    ("current_ratio", {
        "35": (0.7, 1.2, 1.7, 2.4, 4.9, 26),
        "60": (0.3, 0.7, 1.0, 1.4, 2.2, 40),
        "73": (0.9, 1.4, 2.0, 3.1, 7.1, 55),
    }),
    # quick_ratio + debt_to_equity[73] complete the Financial health drill-down (4/4) for groups
    # 73 (default) and 60 (banks -- exercises the focus-persist-across-sector-switch path).
    ("quick_ratio", {
        "60": (0.2, 0.6, 0.9, 1.2, 2.0, 40),
        "73": (0.6, 1.0, 1.4, 2.1, 4.6, 55),
    }),
    ("debt_to_equity", {
        "35": (0.05, 0.4, 0.9, 1.7, 4.2, 26),
        "60": (1.5, 4.0, 6.5, 9.0, 13.0, 40),
        "73": (0.1, 0.9, 1.6, 3.0, 8.0, 55),
    }),
    # interest_coverage has genuinely long right tails (a firm with tiny interest expense shows a
    # huge ratio) -- seeded with extreme maxima so the box chart's honest tail-CLIPPING path renders
    # (whiskers beyond the axis marked ▸, true min-max kept in the tooltip; never clipped from data).
    ("interest_coverage", {
        "35": (0.5, 4.0, 9.0, 22.0, 480.0, 26),
        "60": (1.2, 3.0, 5.5, 9.0, 40.0, 40),
        "73": (-8.0, 2.0, 6.0, 15.0, 260.0, 55),
    }),
]


def _seed_metric_distributions(db_path: str) -> None:
    from secfin.storage.metric_distribution_repository import MetricDistributionRow
    from secfin.storage.sqlite_metric_distribution_repository import (
        SQLiteMetricDistributionRepository,
    )

    repo = SQLiteMetricDistributionRepository(db_path)
    rows = []
    for metric, by_group in _SPREAD_DEMO:
        for group, (lo, p25, med, p75, hi, n) in by_group.items():
            rows.append(
                MetricDistributionRow(
                    peer_group=group,
                    fiscal_year=2025,
                    fiscal_period="FY",
                    metric=metric,
                    peer_count=n,
                    min=lo,
                    p25=p25,
                    median=med,
                    p75=p75,
                    max=hi,
                )
            )
    try:
        repo.clear()
        repo.bulk_upsert(rows)
        print(f"seeded metric distributions: {len(rows)} rows for the sector spreads")
    finally:
        repo.close()


# Precomputed sector-aggregate asset-lifecycle rows for the demo /sectors lifecycle trend. Written
# DIRECTLY (not via the DuckDB analytical batch) so the offline/e2e profile -- base install, no
# `analytical` extra -- can render the DIO/DSO/DPO/CCC multi-line chart. The real pipeline
# (ingest/lifecycle_backfill + analytical/sector_lifecycle over a hydrated volume) is exercised
# separately. Rows are built with `aggregate_row` from synthetic sums, so `ccc == dio + dso - dpo`
# holds exactly, like real data. Only WORKING-CAPITAL sectors are seeded: banks (group "60") have no
# inventory, so they honestly get NO lifecycle row and render the empty state on expand -- the same
# all-five-legs membership the real aggregate enforces. Group "73" (services) has DPO > DIO+DSO, so
# its CCC is NEGATIVE (payables outlast the cycle); group "28" (chemicals) SKIPS FY2023 so the
# trend line's coverage-gap break renders; the latest year carries approx_count > 0 so the
# "~ approximate" affordance shows.
_LIFECYCLE_DEMO = [
    # (group, dio_days, dpo_days, dso_days, base peer_count)
    ("35", 62.0, 90.0, 45.0, 24),  # machinery -- modest positive cycle
    ("28", 108.0, 78.0, 58.0, 20),  # chemicals -- inventory-heavy (gap at 2023)
    ("73", 20.0, 89.0, 64.0, 50),  # services -- NEGATIVE ccc (payables-financed)
    ("52", 70.0, 40.0, 12.0, 11),  # retail -- short DSO
]


def _seed_sector_lifecycle(db_path: str) -> None:
    from secfin.analytical.sector_lifecycle import aggregate_row
    from secfin.storage.sqlite_sector_lifecycle_repository import (
        SQLiteSectorLifecycleRepository,
    )

    repo = SQLiteSectorLifecycleRepository(db_path)
    rows = []
    s_cogs, s_rev = 1000.0, 1400.0  # fixed denominators -> days map straight from the sums
    for group, dio, dpo, dso, base_n in _LIFECYCLE_DEMO:
        for year in _SECTOR_YEARS:
            if group == "28" and year == 2023:
                continue  # coverage gap -> the trend lines break here, never a 0 point
            drift = 1.0 + 0.04 * (year - 2023)  # a gentle year-over-year lengthening
            # group 73 gets a latest-year DSO spike so the biggest-shifts band shows an UNFAVORABLE
            # move (DSO up = worse) alongside 73's favorable margin jump -- both directions demoed.
            dso_mult = 1.7 if (group == "73" and year == 2025) else 1.0
            s_inv = dio * drift / 365.0 * s_cogs
            s_ap = dpo / 365.0 * s_cogs
            s_ar = dso * drift * dso_mult / 365.0 * s_rev
            approx_count = 2 if year == max(_SECTOR_YEARS) else 0  # latest year flagged approximate
            row = aggregate_row(
                group, year, "FY", f"{year}-12-31", base_n + (year - 2021), approx_count,
                s_inv, s_ap, s_ar, s_cogs, s_rev,
            )
            if row is not None:
                rows.append(row)
    try:
        repo.clear()
        repo.bulk_upsert(rows)
        print(f"seeded sector lifecycle: {len(rows)} rows across {len(_LIFECYCLE_DEMO)} sectors")
    finally:
        repo.close()


# Composite sector THEME SCORES for the /sectors scorecard (redesign Phase 2). Written DIRECTLY via
# the Phase 0 repo (the offline scoring batch runs over a hydrated volume, exercised separately).
# Mirrors the real shapes so the render check is representative: group "73" (Business Services, the
# default landing) has all five themes with a MIX of deltas -- positive, negative, flat, and a NULL
# (no prior FY) -- plus a decomposition; group "60" (banks) OMITS operating_efficiency (banks have no
# inventory/COGS, exactly as Phase 0 omits it); groups "28"/"52" are left UNSEEDED so a selected
# sector with no scores exercises the honest empty-scorecard state. The two deferred themes
# (accounting_quality / structure_activity) are NOT seeded -- the endpoint injects them as
# scored:false markers. delta None => "no prior FY" (never a 0). score = 50 + 15*z (50 = avg).
#
# group -> theme -> (score, delta, rank, rank_of, percentile, [(metric, median, oriented_z), ...])
_THEME_SCORE_DEMO = {
    "73": {
        "profitability": (68, 5.0, 2, 11, 82.0, [
            ("net_margin", 0.11, 0.9), ("roe", 0.19, 1.2), ("roa", 0.06, 0.4), ("roic", 0.10, 0.6)]),
        "growth": (54, -3.0, 5, 11, 55.0, [
            ("revenue_growth_yoy", 0.08, 0.3), ("earnings_growth_yoy", 0.05, -0.1)]),
        "financial_health": (61, None, 3, 10, 70.0, [
            ("debt_to_equity", 1.2, 0.5), ("current_ratio", 1.8, 0.7),
            ("interest_coverage", 6.0, 0.4), ("quick_ratio", 1.3, 0.6)]),
        "cash_investment": (47, 1.0, 6, 9, 44.0, [
            ("fcf_margin", 0.09, -0.2), ("ocf_growth_yoy", 0.06, 0.1)]),
        "operating_efficiency": (38, -6.0, 9, 11, 20.0, [
            ("inventory_turnover", 6.5, -0.8), ("asset_turnover", 0.78, -0.5),
            ("dso", 64.0, -0.9), ("dio", 20.0, 0.3), ("dpo", 89.0, 0.7), ("ccc", -5.0, 0.6)]),
    },
    "60": {  # banks: OMIT operating_efficiency (no inventory/COGS)
        "profitability": (71, 2.0, 1, 11, 90.0, [
            ("net_margin", 0.23, 1.5), ("roe", 0.13, 0.4), ("roa", 0.01, -0.3)]),
        "growth": (58, 4.0, 4, 11, 66.0, [
            ("revenue_growth_yoy", 0.06, 0.2), ("earnings_growth_yoy", 0.09, 0.5)]),
        "financial_health": (44, -2.0, 7, 10, 40.0, [
            ("debt_to_equity", 6.5, -0.4), ("interest_coverage", 5.5, 0.0),
            ("current_ratio", 1.0, -0.3), ("quick_ratio", 0.9, -0.2)]),
        "cash_investment": (60, None, 2, 9, 88.0, [
            ("fcf_margin", 0.18, 0.7), ("ocf_growth_yoy", 0.04, 0.1)]),
    },
    # 35 (machinery) + 28 (chemicals): a few themes each so the peer strip shows several sectors,
    # not just 2. (Their drill-downs stay light -- the point is peer-strip breadth.)
    "35": {
        "profitability": (55, -1.0, 4, 11, 58.0, [
            ("net_margin", 0.14, 0.2), ("roe", 0.22, 0.4), ("roa", 0.08, 0.1)]),
        "growth": (49, 2.0, 6, 11, 48.0, [
            ("revenue_growth_yoy", 0.05, -0.1), ("earnings_growth_yoy", 0.06, 0.0)]),
        "financial_health": (57, 1.0, 5, 10, 62.0, [
            ("debt_to_equity", 0.9, 0.3), ("current_ratio", 1.7, 0.4)]),
    },
    "28": {
        "profitability": (62, 3.0, 3, 11, 74.0, [
            ("net_margin", 0.18, 0.6), ("roe", 0.16, 0.3), ("roa", 0.09, 0.2)]),
        "growth": (45, -4.0, 8, 11, 30.0, [
            ("revenue_growth_yoy", 0.02, -0.5), ("earnings_growth_yoy", -0.03, -0.7)]),
        "financial_health": (52, 0.0, 6, 10, 50.0, [
            ("debt_to_equity", 1.4, -0.1), ("current_ratio", 1.9, 0.5)]),
    },
}


def _seed_sector_theme_scores(db_path: str) -> None:
    from secfin.normalize.metrics import higher_is_better
    from secfin.storage.sector_theme_score_repository import (
        SectorThemeComponentRow,
        SectorThemeScoreRow,
    )
    from secfin.storage.sqlite_sector_theme_score_repository import (
        SQLiteSectorThemeScoreRepository,
    )

    year = max(_SECTOR_YEARS)
    parents, components = [], []
    for group, themes in _THEME_SCORE_DEMO.items():
        for theme, (score, delta, rank, rank_of, pctile, cons) in themes.items():
            parents.append(
                SectorThemeScoreRow(
                    peer_group=group, fiscal_year=year, fiscal_period="FY", theme=theme,
                    peer_count=max(1, len(cons) * 3), constituent_count=len(cons),
                    composite_z=(score - 50) / 15.0, score=score, percentile=pctile,
                    rank=rank, rank_of=rank_of, delta_vs_prior_fy=delta,
                )
            )
            for metric, median, oz in cons:
                components.append(
                    SectorThemeComponentRow(
                        peer_group=group, fiscal_year=year, fiscal_period="FY", theme=theme,
                        metric=metric, higher_is_better=higher_is_better(metric),
                        median_value=median, oriented_z=oz,
                    )
                )
    repo = SQLiteSectorThemeScoreRepository(db_path)
    try:
        repo.clear()
        repo.bulk_upsert(parents, components)
        print(f"seeded sector theme scores: {len(parents)} scores + {len(components)} components")
    finally:
        repo.close()


# Per-company metric_values + profiles + ranks for the Sector Analytics app's COMPANY view (the peer
# dot-cloud). Seeds a SIC-35 group of synthetic filers (ciks 900001..900010) so the dot-plots +
# search/?symbol= + dot-click render. The e2e uses ?symbol=900001 (a RAW CIK -> resolves directly,
# no ticker-cache entry needed). Two metrics on one company are left N/A to prove exclusion (never 0).
_APP_COMPANY_METRICS = [
    "net_margin", "revenue_growth_yoy", "roe", "roa",
    "debt_to_equity", "fcf_margin", "inventory_turnover", "current_ratio",
]


def _seed_app_company_group(db_path: str) -> None:
    profiles = SQLiteCompanyProfileRepository(db_path)
    values = SQLiteMetricValueRepository(db_path)
    ranks = SQLiteMetricRankRepository(db_path)
    n = 10
    vrows, rrows = [], []
    for i in range(n):
        cik = 900001 + i
        profiles.upsert(CompanyProfile(cik=cik, sic="3560", sic_description="Industrial machinery",
                                       name=f"Machinery Co {i + 1}"))
        for j, metric in enumerate(_APP_COMPANY_METRICS):
            # a deterministic spread per metric; company 3 has two N/A metrics (must be excluded)
            na = i == 3 and metric in ("fcf_margin", "inventory_turnover")
            base = 0.04 + ((i * 3 + j) % 11) * 0.02  # 0.04..0.24-ish, varied
            val = None if na else round(base * (5 if metric in ("roe", "current_ratio", "inventory_turnover", "debt_to_equity") else 1), 4)
            vrows.append(MetricValueRow(cik, 2025, "FY", metric, val, "na" if na else "ok", "ratio"))
            if not na:
                rrows.append(MetricRankRow(cik, 2025, "FY", metric, "35", n,
                                           round(i / (n - 1) * 100, 1), 0.0))
    try:
        values.bulk_upsert(vrows)
        ranks.bulk_upsert(rrows)
        print(f"seeded app company group: {n} SIC-35 filers, {len(vrows)} values, {len(rrows)} ranks")
    finally:
        profiles.close()
        values.close()
        ranks.close()


def _seed_api_key(db_path: str) -> None:
    repo = SQLiteApiKeyRepository(db_path)
    try:
        repo.create_key(
            hash_api_key(DEMO_API_KEY),
            email="demo@example.com",
            tier="demo",
            rate_limit_per_sec=1000,
            daily_quota=1_000_000,
        )
        print(f"seeded demo API key (X-API-Key: {DEMO_API_KEY})")
    except ValueError:
        print("demo API key already present")
    finally:
        repo.close()


def main() -> None:
    db_path = os.environ.get("SECFIN_DB_PATH", "./data/e2e.db")
    Path(db_path).parent.mkdir(parents=True, exist_ok=True)

    repo = SQLiteRawFactRepository(db_path)
    try:
        for name, cik in COMPANIES:
            payload = json.loads((FIXTURES / name).read_text())
            facts = flatten_all_taxonomies(payload, cik)
            repo.upsert_raw_facts(facts)
            print(f"seeded {name} (CIK {cik}): {len(facts)} facts")
    finally:
        repo.close()

    # A resolved + an unresolved CUSIP so /coverage shows a real 50% rate rather than "nothing
    # attempted yet".
    cusip = SQLiteCusipMapRepository(db_path)
    try:
        cusip.record_resolved("037833100", 320193, "APPLE INC")
        cusip.record_resolved(_JPM_CUSIP, _JPM_CIK, "JPMORGAN CHASE & CO")
        cusip.record_unresolved("02005N100", "ALLY FINL INC")
    finally:
        cusip.close()

    _seed_insider(db_path)
    _seed_beneficial(db_path)
    _seed_holdings(db_path)
    _seed_nolocation_holdings(db_path)
    _seed_coholding(db_path)
    _seed_sic(db_path)
    _seed_peer_ranks(db_path)
    _seed_sector_dupont(db_path)
    _seed_metric_distributions(db_path)
    _seed_sector_lifecycle(db_path)
    _seed_sector_theme_scores(db_path)
    _seed_app_company_group(db_path)
    _seed_api_key(db_path)
    print(f"seed complete -> {db_path}")


if __name__ == "__main__":
    main()

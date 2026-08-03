"""API routes.

Facts are served cache-aside from the SQLite store (see `_facts_for_cik`): a company
already ingested by `ingest/backfill.py` / `ingest/incremental.py`, or seen by a prior
request, is read straight from SQLite with no SEC call. Only a genuine cache miss hits
the SEC live -- and that fetch is then written back so the next request for the same
company is a cache hit. Ticker->CIK resolution is cached the same way, in memory (see
`sec/ticker_cache.py`) rather than via SQLite, since it's one small map shared process-wide
rather than per-company data.
"""

from __future__ import annotations

import datetime as dt
from collections import defaultdict
from collections.abc import Iterable
from dataclasses import asdict

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel

from secfin.api.admin_routes import require_admin_secret
from secfin.api.auth import get_api_key_repo, require_api_key
from secfin.auth.models import ApiKeyRecord, UsageSummary
from secfin.auth.usage import usage_summary
from secfin.config import settings
from secfin.normalize.coholding import co_holding_edges
from secfin.normalize.cusip import (
    CusipResolver,
    cusip_resolution_stats,
    normalize_issuer_name,
    resolve_snapshot_cusips,
)
from secfin.normalize.flows import (
    diff_holders,
    diff_snapshots,
    prior_quarter_end,
    summarize_activity,
)
from secfin.normalize.geography import classify_location
from secfin.normalize.mapping import FOOTNOTE_GROUPS, candidate_tags
from secfin.normalize.metrics import (
    METRIC_DIRECTION,
    METRIC_KEYS,
    METRIC_LABELS,
    METRIC_UNITS,
    compute_fy_metrics_with_trend,
    compute_metric_history,
    compute_metrics,
    metric_periods,
)
from secfin.normalize.themes import DEFERRED_THEMES, THEME_LABELS, THEMES
from secfin.normalize.manager_category import CATEGORY_LABELS, classify_manager_sic
from secfin.normalize.attribution import share_attribution
from secfin.normalize.overlap import peer_overlap
from secfin.normalize.supply import acceptance_lag, supply_events
from secfin.normalize.register import (
    ShareVector,
    composition,
    concentration,
    domicile,
    retention,
    share_vector,
    stable_capital_share,
    tenure,
    turnover,
)
from secfin.normalize.schema import (
    BalanceSheetViz,
    TYPE_OF_REPORTING_PERSON,
    BeneficialOwnership,
    CapitalStructureSeries,
    CashFlowSeries,
    CashFlowViz,
    CompanyMetrics,
    CompanyPeerDistribution,
    CompanyPeerRanks,
    CompanyProfileInfo,
    CondensedStatement,
    CusipResolutionStats,
    FiscalPeriod,
    GeographicMixBuckets,
    HoldingsSnapshot,
    IncomeStatementViz,
    InsiderFlowWindow,
    InsiderTransaction,
    IssuerHolder,
    MetricFrequency,
    MetricHistory,
    MetricSpread,
    NormalizedView,
    PeerDistribution,
    PeerRank,
    RawFact,
    SectorDupont,
    SectorGeographicMix,
    SectorInsiderFlow,
    SectorLifecyclePoint,
    SectorLifecycleSeries,
    SectorList,
    SectorSeries,
    SectorCompanyValue,
    SectorCompanyValueList,
    SectorSpread,
    SectorSpreadList,
    SectorSpreadProfile,
    SectorThemeScore,
    SectorThemeScoreList,
    SectorThemeScores,
    Statement,
    StatementType,
    ThemeConstituent,
)
from secfin.normalize.screening import (
    SCREENABLE_CONCEPTS,
    frame_period_for_concept,
    resolve_concept_values,
)
from secfin.normalize.sic import sic2_label
from secfin.normalize.statements import (
    build_footnote_group,
    available_periods,
    build_normalized_view,
    build_statement,
)
from secfin.normalize.viz import (
    balance_viz,
    capital_structure_series,
    cashflow_series,
    cashflow_viz,
    condensed_statement,
    income_viz,
)
from secfin.sec.client import SECClient
from secfin.sec.companyfacts import fetch_raw_facts_all
from secfin.sec.insider import fetch_insider_transactions_with_filings
from secfin.sec.institutional import fetch_13f_snapshot, fetch_beneficial_ownership_with_filings
from secfin.sec.ticker_cache import TickerCache
from secfin.storage.api_key_repository import ApiKeyRepository
from secfin.storage.beneficial_ownership_repository import BeneficialOwnershipRepository
from secfin.storage.company_profile_repository import CompanyProfileRepository
from secfin.storage.cusip_repository import CusipMapRepository
from secfin.sec.exhibits import find_ex21_filename, parse_ex21
from secfin.storage.filing_index_repository import FilingIndexRepository
from secfin.storage.holdings_repository import HoldingsSnapshotRepository
from secfin.storage.insider_repository import InsiderTransactionRepository
from secfin.storage.metric_distribution_repository import MetricDistributionRepository
from secfin.storage.metric_rank_repository import MetricRankRepository
from secfin.storage.metric_value_repository import MetricValueRepository
from secfin.storage.repository import RawFactRepository
from secfin.storage.sector_dupont_repository import SectorDupontRepository, SectorDupontRow
from secfin.storage.sector_geographic_mix_repository import SectorGeographicMixRepository
from secfin.storage.sector_insider_flow_repository import SectorInsiderFlowRepository
from secfin.storage.sector_lifecycle_repository import (
    SectorLifecycleRepository,
    SectorLifecycleRow,
)
from secfin.storage.sector_company_repository import SectorCompanyRepository
from secfin.storage.sector_theme_score_repository import (
    SectorThemeComponentRow,
    SectorThemeScoreRepository,
    SectorThemeScoreRow,
)

# Gating rule: only genuinely EXTERNAL API consumption requires a key. Any endpoint our
# own served pages (`/company/{symbol}` and friends, static/company.js) call directly
# from browser JS belongs on `public_router` -- `GET .../statements/{statement}`,
# `GET .../periods`, `GET .../metrics`, `GET .../metric-periods`, and
# `GET .../insider-trades` below (IP rate-limited via `limit_anonymous_traffic` instead).
# Everything else lives on `router`, which api/main.py includes with
# `Depends(require_api_key)`. When adding a new endpoint: if one of our own static pages
# will call it client-side, it goes on `public_router`, full stop -- gating an endpoint
# our own UI depends on just breaks that UI (see the insider-trades tab / metric-periods
# 401s this exact mistake caused). `router` is for endpoints only an external, paying API
# consumer hits directly. See api/auth.py.
public_router = APIRouter()
router = APIRouter()
# INTERNAL-ONLY endpoints (operator decision 2026-07-16, docs/ROADMAP_DATA_DEPTH.md
# Phase 1): admin-secret-gated company-data endpoints. Not on `router` (an admin isn't a
# customer -- no API key), not on `public_router` (not public, and must not burn the
# anonymous IP budget). Mounted by api/main.py alongside admin_router; every route here
# carries `Depends(require_admin_secret)` and `include_in_schema=False` itself.
internal_router = APIRouter()

# Surfaced on every institutional (13F-derived) response per CLAUDE.md: never present
# derived deltas as reported trades, and always carry the long-only / lag caveats.
_13F_CAVEATS = [
    "DERIVED by diffing two 13F quarterly snapshots -- not reported trades.",
    "13F covers long positions in Section 13(f) securities only -- no shorts, cash, "
    "or non-US holdings.",
    "13F filings lag up to ~45 days after quarter-end -- this reflects stale, not "
    "real-time, positions.",
]

# Additional caveat specific to the issuer-centric endpoints below: unlike the
# manager-centric ones, these read live from whatever's been ingested so far (no
# precomputed cross-manager inversion -- a single issuer's holder list is a fast
# indexed point lookup, not the whole-quarter aggregate DuckDB was benchmarked for; see
# docs/ARCHITECTURE.md 3b), so an empty result can mean either "no manager reported
# holding this issuer" or "this quarter hasn't been ingested for any manager yet."
_ISSUER_CENTRIC_CAVEATS = _13F_CAVEATS + [
    "An empty holder list does not confirm zero institutional ownership -- it may mean "
    "this quarter hasn't been ingested yet for any manager holding this issuer.",
]

# Holder-geography (choropleth) caveats: the location is the FILER's registered business
# address, not where its capital originates and not the issuer's location; and it is only
# known for snapshots ingested after the location column landed (older ones bucket to
# "unknown"). See normalize/geography.py and sec/institutional.parse_filing_manager_location.
_HOLDER_GEOGRAPHY_CAVEATS = _ISSUER_CENTRIC_CAVEATS + [
    "Location is the 13F filer's reported business address -- NOT where its capital "
    "originates, and NOT the company's own location.",
    "Managers whose snapshot predates location tracking are counted under 'unknown', "
    "never dropped and never assumed domestic.",
]

# Holdings-series caveats: the series plots REPORTED quarter-end shares (not value -- the
# 13F value unit changed from thousands to whole dollars ~2023, so a share series is the
# unit-stable one to compare across quarters); a quarter with no bar for a holder means that
# holder wasn't reported/ingested that quarter, not that they exited.
_HOLDINGS_SERIES_CAVEATS = _ISSUER_CENTRIC_CAVEATS + [
    "Series values are reported shares, not dollar value -- the 13F value unit changed "
    "(thousands -> whole dollars, ~2023), so shares are the unit-stable cross-quarter series.",
    "A quarter with no data for a holder means it was not reported/ingested that quarter, "
    "not that the holder exited -- quarter-over-quarter change is a DERIVED inference.",
]

# Institutional-holder-treemap caveats: each filer's square is its reported 13F common shares as a
# share of the pool of ALL ingested filers' common shares -- who holds the most among the reporting
# institutions. NOT shares outstanding, NOT % of the company, NOT all institutional ownership; it is
# coverage-dependent; 13F shares are discretion, not beneficial ownership; options/PRN excluded.
# How many recent 13D/G filings to read when looking up reporting-person types. These filings
# are per-issuer and rare (only 5%+ holders file at all), so a small window covers every current
# filer without turning a point read into a scan.
_BO_TYPE_LOOKBACK = 40

_CONVICTION_CAVEATS = _ISSUER_CENTRIC_CAVEATS + [
    "Percentage is this filer's reported 13F common shares as a share of the TOTAL 13F common "
    "shares across all INGESTED filers of this company -- NOT the company's shares outstanding, "
    "NOT a % of the company owned, and NOT all institutional ownership.",
    "Coverage-dependent: it is a share of only the filers ingested this quarter, so as more filers "
    "are ingested each filer's share shrinks -- an empty or thin result is not a confirmed zero.",
    "Common-equity (SH) shares only: option (put/call) and principal (PRN) rows are EXCLUDED from "
    "both a filer's shares and the pool -- an option's 'shares' are notional and a PRN amount is "
    "debt, neither is share ownership.",
    "13F shares are those a manager has investment DISCRETION over (often on behalf of client "
    "funds), NOT the firm's own beneficial ownership.",
]

# Co-holding-network caveats: an edge is the overlap in two filers' OTHER reported holdings (shared
# securities by CUSIP, Jaccard) as of the quarter-end snapshot -- a DERIVED structural overlap, NOT
# coordinated/timed trading, and never a style label (§9.2 descriptive-not-prescriptive).
_COHOLDING_CAVEATS = _ISSUER_CENTRIC_CAVEATS + [
    "An edge is the OVERLAP in the two filers' OTHER reported holdings (shared securities by CUSIP "
    "as a Jaccard index) as of this quarter-end snapshot -- a DERIVED structural overlap, NOT "
    "coordinated or timed trading, and never an investment-style (momentum/value/etc.) label.",
    "This company's own position is excluded from each filer's set, so an edge reflects the OTHER "
    "names they share, not the trivial fact of both holding this company. Overlap counts reported "
    "positions of any type by CUSIP.",
    "Coverage-dependent: only ingested filers are nodes, and overlap only reflects the holdings "
    "ingested for this quarter -- a thin or empty graph is coverage, not a confirmed absence of "
    "overlap.",
]

# Activity-series caveats: the quarter-over-quarter mix (counts per action) and the latest
# quarter's inflow/outflow are DERIVED by diffing each quarter against the PRIOR calendar
# quarter's 13F holders. A quarter whose calendar-prior quarter wasn't ingested is OMITTED
# (diffing against nothing would mislabel every holder as "new"), never shown as zero activity.
_ACTIVITY_SERIES_CAVEATS = _ISSUER_CENTRIC_CAVEATS + [
    "Per-quarter counts are DERIVED by diffing each quarter against the PRIOR calendar quarter's "
    "13F holders -- not reported trades.",
    "A quarter whose prior calendar quarter was not ingested is OMITTED (no bar), never shown as "
    "zero activity or as an all-new spike -- diffing against an un-ingested quarter would mislabel "
    "every holder as new.",
    "Bars are COUNTS of (manager, position) pairs and inflow/outflow are SHARES -- never dollar "
    "value, whose unit changed (thousands -> whole dollars, ~2023).",
    "Inflow/outflow are aggregate DERIVED share changes across all reporting filers -- not fund "
    "cash flows and not dollar amounts.",
]

# Beneficial ownership (13D/13G) coverage floor -- see docs/DATA_MODEL.md's "Coverage
# boundaries" section. Only modern structured-XML filings are parsed (sec/institutional.py);
# an empty result for a company whose 5%+ history predates the ~mid-2025 XML transition
# means "outside our coverage window", not "no one crossed 5%".
_BENEFICIAL_OWNERSHIP_CAVEATS = [
    "Only structured-XML Schedule 13D/13G filings are parsed (from ~mid-2025 onward) -- "
    "legacy HTML/text filings are excluded by design, not scraped.",
    "An empty result does not confirm no 5%+ beneficial owner exists -- it may mean this "
    "issuer's relevant filings predate the structured-XML transition.",
]

# Cross-company frames-based endpoints (Milestone 4, normalize/screening.py) --
# GET /screen (filter/match) and GET /concepts/{concept} (list/rank) share this same
# underlying frames data and its coverage gaps, so they share one caveats list too --
# always present, same convention as the institutional caveats above.
_FRAMES_CAVEATS = [
    "Uses SEC frame periods, which are CALENDAR-quarter aligned -- a company with a "
    "non-calendar fiscal year is matched against the nearest calendar period here, "
    "which will not exactly match its own fiscal-year label on /statements.",
    "Only companies tagging a concept with one of its standard us-gaap candidate tags "
    "are visible here -- a company-specific extension tag for that concept is invisible "
    "to frames data, unlike /statements which does catch extension tags per-company.",
    "XBRL financial data is only available from ~2009, phased in through ~2012 -- a "
    "period before a company's first XBRL filing shows no data for it, not a zero value.",
]


def get_repo(request: Request) -> RawFactRepository:
    return request.app.state.repo


def get_ticker_cache(request: Request) -> TickerCache:
    return request.app.state.ticker_cache


def get_cusip_resolver(request: Request) -> CusipResolver:
    return request.app.state.cusip_resolver


def get_insider_repo(request: Request) -> InsiderTransactionRepository:
    return request.app.state.insider_repo


def get_beneficial_ownership_repo(request: Request) -> BeneficialOwnershipRepository:
    return request.app.state.beneficial_ownership_repo


def get_holdings_repo(request: Request) -> HoldingsSnapshotRepository:
    return request.app.state.holdings_repo


def get_metric_rank_repo(request: Request) -> MetricRankRepository:
    return request.app.state.metric_rank_repo


def get_metric_distribution_repo(request: Request) -> MetricDistributionRepository:
    return request.app.state.metric_distribution_repo


def get_metric_value_repo(request: Request) -> MetricValueRepository:
    return request.app.state.metric_value_repo


def get_company_profile_repo(request: Request) -> CompanyProfileRepository:
    return request.app.state.company_profile_repo


def get_filing_index_repo(request: Request) -> FilingIndexRepository:
    return request.app.state.filing_index_repo


def get_sector_dupont_repo(request: Request) -> SectorDupontRepository:
    return request.app.state.sector_dupont_repo


def get_sector_lifecycle_repo(request: Request) -> SectorLifecycleRepository:
    return request.app.state.sector_lifecycle_repo


def get_sector_theme_score_repo(request: Request) -> SectorThemeScoreRepository:
    return request.app.state.sector_theme_score_repo


def get_sector_insider_flow_repo(request: Request) -> SectorInsiderFlowRepository:
    return request.app.state.sector_insider_flow_repo


def get_sector_geographic_mix_repo(request: Request) -> SectorGeographicMixRepository:
    return request.app.state.sector_geographic_mix_repo


def get_sector_company_repo(request: Request) -> SectorCompanyRepository:
    return request.app.state.sector_company_repo


def get_cusip_repo(request: Request) -> CusipMapRepository:
    return request.app.state.cusip_repo


async def _cik_from_symbol(client: SECClient, ticker_cache: TickerCache, symbol: str) -> int:
    """Accept either a raw CIK (digits) or a ticker symbol."""
    if symbol.isdigit():
        return int(symbol)
    cik = await ticker_cache.resolve(client, symbol)
    if cik is None:
        raise HTTPException(status_code=404, detail=f"Unknown ticker: {symbol}")
    return cik


async def _facts_for_cik(repo: RawFactRepository, client: SECClient, cik: int) -> list[RawFact]:
    """Cache-aside read: SQLite if we have it, else fetch SEC live and populate it.

    Full company history -- used by `/periods`, which genuinely needs every period to
    enumerate what's available. `get_statement` uses the period-scoped
    `_statement_facts_for_cik` below instead; see its docstring for why.
    """
    cached = repo.get_raw_facts(cik)
    if cached:
        return cached
    facts = await fetch_raw_facts_all(client, cik)
    if facts:
        repo.upsert_raw_facts(facts)
    return facts


async def _statement_facts_for_cik(
    repo: RawFactRepository, client: SECClient, cik: int, fiscal_year: int, fiscal_period: str
) -> list[RawFact]:
    """Cache-aside read scoped to ONE (fiscal_year, fiscal_period) -- avoids
    fetching+Pydantic-validating a company's ENTIRE fact history just to serve one
    statement.

    Pre-launch load-test finding (2026-07-07): `get_statement` was using
    `_facts_for_cik` (full history) and filtering to one period in Python
    (`build_statement`) -- ~220ms for an established filer like Apple (24,765 stored
    facts across ~15 years) vs. a period-filtered SQL query using the existing
    `(cik, fiscal_year, fiscal_period)` index.

    A period-scoped miss is ambiguous by itself -- it could mean "this company was
    never ingested at all" (needs a live SEC fetch) or "ingested, but this exact period
    genuinely has no data" (e.g. before the company's first XBRL filing -- a real,
    expected empty result, not a caching gap). `has_any_facts` disambiguates the two
    without a second full-history fetch, so an out-of-range period on an
    already-cached company stays a cheap local negative instead of refetching the
    whole company from SEC on every request.

    `has_any_facts` must mean "had a real companyfacts ingestion", not just "has ANY
    row in raw_facts" -- a CIK that only ever appeared via cross-company frame
    screening (`ingest/frames_backfill.py`) has raw_facts rows with no `fiscal_year`,
    and treating those as "known, empty period" would permanently 404 every statement
    request for that company with no path to self-heal. Found live 2026-07-11
    (launch-readiness §3, PLTR/GME both confirmed affected, 6,721 of 6,736 known CIKs
    at the time) and fixed by scoping `has_any_facts` itself
    (`storage/sqlite_repository.py`) rather than special-casing it here.
    """
    cached = repo.get_raw_facts_for_period(cik, fiscal_year, fiscal_period)
    if cached:
        return cached
    if repo.has_any_facts(cik):
        return []
    facts = await fetch_raw_facts_all(client, cik)
    if facts:
        repo.upsert_raw_facts(facts)
    return [f for f in facts if f.fiscal_year == fiscal_year and f.fiscal_period == fiscal_period]


async def _insider_transactions_for_cik(
    repo: InsiderTransactionRepository, client: SECClient, cik: int, limit: int
) -> list[InsiderTransaction]:
    """Cache-aside read, bounded by FILINGS cached rather than rows (see
    storage/insider_repository.py) -- a cache hit requires at least `limit` filings
    already cached for this issuer; a smaller previously-cached limit is not a superset
    of a larger one. On a miss, re-fetches the full requested `limit` from SEC (not just
    the delta) -- `upsert_insider_transactions` is safe to call with filings already
    cached, since it skips re-storing rows for any filing it already has.
    """
    if repo.cached_filing_count(cik) >= limit:
        return repo.get_insider_transactions(cik, limit)
    filings, transactions = await fetch_insider_transactions_with_filings(client, cik, limit=limit)
    if filings:
        repo.upsert_insider_transactions(cik, filings, transactions)
    return transactions


async def _beneficial_ownership_for_cik(
    repo: BeneficialOwnershipRepository, client: SECClient, cik: int, limit: int
) -> list[BeneficialOwnership]:
    """Cache-aside read, bounded by FILINGS cached rather than rows -- same shape as
    `_insider_transactions_for_cik` (see storage/beneficial_ownership_repository.py).
    """
    if repo.cached_filing_count(cik) >= limit:
        return repo.get_beneficial_ownership(cik, limit)
    filings, owners = await fetch_beneficial_ownership_with_filings(client, cik, limit=limit)
    if filings:
        repo.upsert_beneficial_ownership(cik, filings, owners)
    return owners


async def _manager_snapshot(
    repo: HoldingsSnapshotRepository, client: SECClient, manager_cik: int, period: str
) -> HoldingsSnapshot:
    """Cache-aside read keyed on (manager_cik, period), translating "no filing for that
    quarter" into a 404 on a cache miss. See storage/holdings_repository.py for why this
    doesn't re-check SEC for a later-filed amendment once a quarter is cached.
    """
    cached = repo.get_snapshot(manager_cik, period)
    if cached is not None:
        return cached
    try:
        snapshot = await fetch_13f_snapshot(client, manager_cik, period)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e)) from e
    repo.upsert_snapshot(snapshot)
    return snapshot


class CompanySuggestion(BaseModel):
    ticker: str
    cik: int
    name: str | None


class CompanySuggestResponse(BaseModel):
    query: str
    suggestions: list[CompanySuggestion]


@public_router.get(
    "/companies/suggest",
    response_model=CompanySuggestResponse,
    tags=["Financials"],
    summary="Autocomplete a partial ticker, company name, or CIK",
)
async def suggest_companies(
    q: str = Query(..., min_length=1, max_length=40),
    limit: int = Query(default=8, ge=1, le=20),
    ticker_cache: TickerCache = Depends(get_ticker_cache),
) -> CompanySuggestResponse:
    """Typeahead for the UI's company inputs (and anyone else's): matches exact ticker
    first, then ticker prefixes, then company-name substrings (a digits query also
    matches CIK prefixes), from the same cached SEC ticker map that /companies/{symbol}
    resolution uses. Public: our own pages call it per keystroke (debounced client-side,
    IP rate-limited server-side like the other public endpoints).
    """
    async with SECClient() as client:
        suggestions = await ticker_cache.suggest(client, q, limit)
    return CompanySuggestResponse(
        query=q,
        suggestions=[CompanySuggestion(**s) for s in suggestions],
    )


# Condensed-statement column budget. Four is the company Overview's card width (V3-P4); the
# ceiling keeps one request from fanning out into an unbounded number of build_statement calls.
_CONDENSED_DEFAULT_LIMIT = 4
_CONDENSED_MAX_LIMIT = 8


@public_router.get(
    "/companies/{symbol}/profile",
    response_model=CompanyProfileInfo,
    tags=["Financials"],
    summary="A company's filer identity (name + SIC industry assignment)",
)
async def get_company_profile(
    symbol: str,
    ticker_cache: TickerCache = Depends(get_ticker_cache),
    profile_repo: CompanyProfileRepository = Depends(get_company_profile_repo),
) -> CompanyProfileInfo:
    """The registrant's name and SIC industry assignment -- the identity header of the company
    Overview (V3-P4).

    A pure operational-store read (no facts fetch, no SEC call beyond the cached ticker->CIK
    resolution), so it is cheap enough to sit alongside the page's other page-load requests.

    Carries the cover-page identity too -- incorporation state, headquarters, fiscal year end,
    filer category, EIN, exchanges and the date of the filer's FIRST filing. Those come from
    `/submissions/`, which `ingest/sic_backfill.py` already walks for the SIC. They are NOT in
    companyfacts (verified: a companyfacts payload carries two `dei` tags), which is why this
    endpoint used to omit them.

    Still absent, each for its own reason: **NAICS** (the SEC assigns SIC; deriving one would
    present our mapping as the filer's), **employees** (a real tag that about one filer in nine
    thousand uses), and **auditor** (`dei:AuditorName` is tagged, but only inside the 10-K's
    inline-XBRL instance -- a document fetch this endpoint does not do). A null here means EDGAR
    did not state it, or the profile has not been backfilled since these columns were added.

    A company with facts but no ingested profile row returns 200 with null fields (the same
    convention /peers uses for an unranked company) -- an unknown TICKER is the 404.
    """
    async with SECClient() as client:
        cik = await _cik_from_symbol(client, ticker_cache, symbol)
    profile = profile_repo.get(cik)
    if profile is None:
        return CompanyProfileInfo(cik=cik)
    return CompanyProfileInfo(
        cik=cik,
        name=profile.name,
        sic=profile.sic,
        sic_description=profile.sic_description,
        state_of_incorporation=profile.state_of_incorporation,
        hq_city=profile.hq_city,
        hq_state=profile.hq_state,
        fiscal_year_end=profile.fiscal_year_end,
        filer_category=profile.filer_category,
        ein=profile.ein,
        exchanges=profile.exchanges,
        first_filing_date=profile.first_filing_date,
    )


@public_router.get(
    "/companies/{symbol}/footnotes",
    tags=["Financials"],
    summary="Footnote detail groups for one fiscal period (inventory, tax, leases, ...)",
)
async def get_footnotes(
    symbol: str,
    year: int = Query(..., description="Fiscal year, e.g. 2025"),
    period: FiscalPeriod = Query("FY", description="FY, Q1, Q2, Q3, or Q4"),
    groups: str | None = Query(
        None, description="Comma-separated group keys; omit for all of them."
    ),
    repo: RawFactRepository = Depends(get_repo),
    ticker_cache: TickerCache = Depends(get_ticker_cache),
) -> dict:
    """The footnote cards' figures -- eight named groups over the SAME facts the statements use.

    Served as GROUPS rather than one concept at a time because a footnote card is a group: a
    caller asks once per card, and the eight arrive on one read of the company's facts instead of
    eight. Same resolution as a statement line (primary column, restatements ranked), so a
    footnote and the statement above it cannot disagree about which filing they came from.

    **These are optional disclosures.** A filer publishing no inventory composition is exercising
    a choice, not revealing a gap in our ingest, and the two look identical from outside -- so
    every group carries `coverage`: the share of surveyed filers who publish it at all
    (`scripts/v1_tag_coverage.py`). The tax reconciliation is on 96% of filers; R&D capitalisation
    is on 4%. A blank card means very different things at those two ends, and the number is what
    lets a reader tell which.

    A group with nothing for this period returns `status="na"` with that reason attached -- never
    an empty line list presented as zeros.
    """
    async with SECClient() as client:
        cik = await _cik_from_symbol(client, ticker_cache, symbol)
        facts = await _facts_for_cik(repo, client, cik)
    if not facts:
        raise HTTPException(status_code=404, detail=f"No data found for {symbol}.")

    wanted = [g.strip() for g in groups.split(",")] if groups else list(FOOTNOTE_GROUPS)
    return {
        "cik": cik,
        "fiscal_year": year,
        "fiscal_period": period,
        "groups": [
            build_footnote_group(facts, cik, g, year, period)
            for g in wanted
            if g in FOOTNOTE_GROUPS
        ],
        "cannot": (
            "Footnote disclosure is optional and varies by filer -- an absent group is usually a "
            "choice rather than missing data. `coverage` is how often filers publish each one."
        ),
    }

@public_router.get(
    "/companies/{symbol}/subsidiaries",
    tags=["Financials"],
    summary="Consolidated subsidiaries from the latest 10-K's EX-21 exhibit",
)
async def get_subsidiaries(
    symbol: str,
    ticker_cache: TickerCache = Depends(get_ticker_cache),
    filing_repo: FilingIndexRepository = Depends(get_filing_index_repo),
) -> dict:
    """The registrant's consolidated subsidiaries and their jurisdictions, from EX-21.

    ⚠️ **The one endpoint that reads a filing DOCUMENT.** `CLAUDE.md` otherwise forbids parsing
    HTML; that rule is suspended here alone, by operator ruling 2026-08-02, because EX-21 is the
    only place this list exists -- it is in neither companyfacts, the DERA datasets, nor
    `/submissions/`. See `sec/exhibits.py` for what the parser refuses to do.

    Three fetches, all throttled through `SECClient`: the filing index to LOCATE the exhibit (its
    filename follows no convention -- Apple's is `a10-kexhibit21109272025.htm`), then the exhibit.

    **What this cannot tell you, and the payload says so:** the list is as of that filing, and
    EX-21 omits subsidiaries the registrant deems immaterial. It is a floor, never a census.
    `status="na"` with a reason -- never an empty list presented as "no subsidiaries" -- whenever
    the exhibit is missing, unparseable, or published as prose.
    """
    async with SECClient() as client:
        cik = await _cik_from_symbol(client, ticker_cache, symbol)

        annual = filing_repo.get_filings(cik, ["10-K", "10-K/A"], 1)
        if not annual:
            return {
                "cik": cik,
                "status": "na",
                "reason": (
                    "No annual report is indexed for this company yet, so there is no exhibit set "
                    "to look in. Run the filing-index backfill for this filer."
                ),
                "subsidiaries": [],
            }
        filing = annual[0]
        acc = (filing.accession or "").replace("-", "")
        base = f"https://www.sec.gov/Archives/edgar/data/{cik}/{acc}"

        headers = await client.get_text(f"{base}/{filing.accession}-index-headers.html")
        name = find_ex21_filename(headers)
        if not name:
            return {
                "cik": cik,
                "status": "na",
                "reason": (
                    f"The {filing.form} filed {filing.filing_date} carries no EX-21. A registrant "
                    "with no subsidiaries need not file one, so this is an absence, not a gap."
                ),
                "subsidiaries": [],
                "filing": {"form": filing.form, "filed": filing.filing_date, "accession": filing.accession},
            }

        result = parse_ex21(await client.get_text(f"{base}/{name}"))

    return {
        "cik": cik,
        "status": result.status,
        "reason": result.reason,
        "has_ownership": result.has_ownership,
        "cannot": result.cannot,
        "subsidiaries": [
            {"name": x.name, "jurisdiction": x.jurisdiction, "ownership": x.ownership}
            for x in result.subsidiaries
        ],
        "filing": {
            "form": filing.form,
            "filed": filing.filing_date,
            "accession": filing.accession,
            "exhibit_url": f"{base}/{name}",
        },
    }

@public_router.get(
    "/companies/{symbol}/statements/{statement}/condensed",
    response_model=CondensedStatement,
    tags=["Financials"],
    summary="One statement across several recent periods, side by side",
)
async def get_condensed_statement(
    symbol: str,
    statement: StatementType,
    period: FiscalPeriod = Query("FY", description="Period type for the columns (FY, Q1, ...)"),
    limit: int = Query(
        _CONDENSED_DEFAULT_LIMIT,
        ge=1,
        le=_CONDENSED_MAX_LIMIT,
        description="How many recent periods to include (most recent first, drawn oldest->newest).",
    ),
    repo: RawFactRepository = Depends(get_repo),
    ticker_cache: TickerCache = Depends(get_ticker_cache),
) -> CondensedStatement:
    """One company's statement across its most recent `limit` periods of the given `period`
    type, transposed into period columns x canonical-concept rows (columns oldest->newest).

    The same normalized values /statements/{statement} serves -- one facts read and N
    `build_statement` calls, re-shaped, NOT a new measurement. Serving this as one request is
    the point: N client calls would each trigger their own full-history facts read.

    **A `None` in a row's `values` means that period did not report that line.** It is never 0,
    never dropped, and never carried forward from an adjacent column. A company with no periods
    of the requested type returns 200 with empty `columns`/`rows` -- an honest "nothing to
    condense", not an error. An unknown ticker is still a 404.
    """
    async with SECClient() as client:
        cik = await _cik_from_symbol(client, ticker_cache, symbol)
        facts = await _facts_for_cik(repo, client, cik)
    if not facts:
        raise HTTPException(status_code=404, detail=f"No data found for {symbol}.")
    # available_periods is newest-first; condensed_statement re-sorts to oldest->newest.
    selected = [(y, p) for (y, p) in available_periods(facts) if p == period][:limit]
    statements = [build_statement(facts, cik, statement, y, p) for (y, p) in selected]
    # Drop periods that produced neither a mapped line nor filing metadata -- an empty column
    # would claim a period exists on this statement when nothing about it was reported.
    statements = [s for s in statements if s.lines or s.accession is not None]
    if not statements:
        return CondensedStatement(cik=cik, statement=statement, period_type=period)
    return condensed_statement(statements)


@public_router.get(
    "/companies/{symbol}/statements/{statement}",
    response_model=Statement,
    tags=["Financials"],
    summary="Get an income statement, balance sheet, or cash flow statement",
)
async def get_statement(
    symbol: str,
    statement: StatementType,
    year: int = Query(..., description="Fiscal year, e.g. 2024"),
    period: FiscalPeriod = Query("FY", description="FY, Q1, Q2, Q3, or Q4"),
    repo: RawFactRepository = Depends(get_repo),
    ticker_cache: TickerCache = Depends(get_ticker_cache),
) -> Statement:
    """Return one normalized statement for a company + fiscal period."""
    async with SECClient() as client:
        cik = await _cik_from_symbol(client, ticker_cache, symbol)
        facts = await _statement_facts_for_cik(repo, client, cik, year, period)
    result = build_statement(facts, cik, statement, year, period)
    if not result.lines and result.accession is None:
        # No facts at all for this period (as opposed to facts that exist but didn't map
        # to any concept on this statement, which build_statement still returns metadata
        # for — see its "empty" case).
        raise HTTPException(
            status_code=404,
            detail=f"No {statement} data found for {symbol} {period} {year}.",
        )
    return result


@public_router.get(
    "/companies/{symbol}/statements/income/viz",
    response_model=IncomeStatementViz,
    tags=["Financials"],
    summary="Waterfall bridge + 100% common-size views of an income statement",
)
async def get_income_statement_viz(
    symbol: str,
    year: int = Query(..., description="Fiscal year, e.g. 2024"),
    period: FiscalPeriod = Query("FY", description="FY, Q1, Q2, Q3, or Q4"),
    repo: RawFactRepository = Depends(get_repo),
    ticker_cache: TickerCache = Depends(get_ticker_cache),
) -> IncomeStatementViz:
    """Derived presentation views over one company's income statement for one period:
    a revenue -> net income **waterfall bridge** and a **100% common-size** breakdown.

    The numbers are the same normalized values as /statements/income, re-shaped for
    visualization -- not a new measurement (same cache-aside facts path, same
    build_statement). A filing that exists but lacks a required anchor (revenue / net
    income) or a revenue base returns 200 with an explicit `available=false` state on
    the affected view -- an honest "can't chart this period", not an error. See the
    `caveats` field and normalize/viz.py.
    """
    async with SECClient() as client:
        cik = await _cik_from_symbol(client, ticker_cache, symbol)
        facts = await _statement_facts_for_cik(repo, client, cik, year, period)
    stmt = build_statement(facts, cik, "income", year, period)
    if not stmt.lines and stmt.accession is None:
        raise HTTPException(
            status_code=404,
            detail=f"No income data found for {symbol} {period} {year}.",
        )
    return income_viz(stmt)


@public_router.get(
    "/companies/{symbol}/statements/balance/viz",
    response_model=BalanceSheetViz,
    tags=["Financials"],
    summary="Balance Matrix + Working-Capital bridge views of a balance sheet",
)
async def get_balance_statement_viz(
    symbol: str,
    year: int = Query(..., description="Fiscal year, e.g. 2024"),
    period: FiscalPeriod = Query("FY", description="FY, Q1, Q2, Q3, or Q4"),
    repo: RawFactRepository = Depends(get_repo),
    ticker_cache: TickerCache = Depends(get_ticker_cache),
) -> BalanceSheetViz:
    """Derived presentation views over one company's balance sheet for one period: the
    **Balance Matrix** (Assets vs Liabilities+Equity, with the filer's two independently
    reported totals reconciled -- never forced) and the **Working-Capital bridge** (current
    assets vs current liabilities).

    The numbers are the same normalized values as /statements/balance, re-shaped for
    visualization -- not a new measurement (same cache-aside facts path, same
    build_statement). A filing that lacks a required reported total returns 200 with an
    explicit `available=false` state on the affected view -- an honest "can't chart this",
    not an error. See the `caveats` field and normalize/viz.py.
    """
    async with SECClient() as client:
        cik = await _cik_from_symbol(client, ticker_cache, symbol)
        facts = await _statement_facts_for_cik(repo, client, cik, year, period)
    stmt = build_statement(facts, cik, "balance", year, period)
    if not stmt.lines and stmt.accession is None:
        raise HTTPException(
            status_code=404,
            detail=f"No balance data found for {symbol} {period} {year}.",
        )
    return balance_viz(stmt)


# Bound the capital-structure series work: how many periods a client may request, and the
# default when unspecified (matches the trend the mock drew).
_CAPITAL_STRUCTURE_DEFAULT_LIMIT = 6
_CAPITAL_STRUCTURE_MAX_LIMIT = 12


@public_router.get(
    "/companies/{symbol}/statements/balance/viz-series",
    response_model=CapitalStructureSeries,
    tags=["Financials"],
    summary="Capital-structure trend (financing mix across recent periods)",
)
async def get_capital_structure_series(
    symbol: str,
    period: FiscalPeriod = Query("FY", description="Period type for the series (FY for now)"),
    limit: int = Query(
        _CAPITAL_STRUCTURE_DEFAULT_LIMIT,
        ge=1,
        le=_CAPITAL_STRUCTURE_MAX_LIMIT,
        description="How many recent periods to include (most recent first, drawn oldest->newest).",
    ),
    repo: RawFactRepository = Depends(get_repo),
    ticker_cache: TickerCache = Depends(get_ticker_cache),
) -> CapitalStructureSeries:
    """The **Capital-Structure trend**: one company's financing mix (Liabilities vs Equity,
    normalized to the reported financing total) across its most recent `limit` periods of
    the given `period` type, drawn oldest->newest.

    Uses the full-history cache-aside facts path (like /periods). Percentages are NOT
    clamped -- a negative-equity period truthfully shows equity < 0 and liabilities > 100%.
    A period missing a required total is carried as an explicit gap, not omitted. An empty
    series is a valid 200 (an honest "nothing to chart"), not an error. See normalize/viz.py.
    """
    async with SECClient() as client:
        cik = await _cik_from_symbol(client, ticker_cache, symbol)
        facts = await _facts_for_cik(repo, client, cik)
    if not facts:
        raise HTTPException(status_code=404, detail=f"No data found for {symbol}.")
    # Most recent `limit` periods of the requested type (available_periods is newest-first).
    selected = [(y, p) for (y, p) in available_periods(facts) if p == period][:limit]
    statements = [build_statement(facts, cik, "balance", y, p) for (y, p) in selected]
    statements = [s for s in statements if s.lines or s.accession is not None]
    return capital_structure_series(statements)


def _prior_period_balance(
    facts: list[RawFact], cik: int, cf_stmt: Statement, period: FiscalPeriod
) -> Statement | None:
    """The balance sheet at the START of `cf_stmt`'s period -- i.e. this period's beginning
    cash. The beginning-of-period cash level is the balance instant ending the day BEFORE
    the cash-flow period_start (fiscal periods are contiguous, so a prior period_end is
    period_start - 1 day). We match on that date with a small tolerance -- NOT on "prior
    period of the same type", which would be wrong for a YTD quarterly cash flow whose start
    is the fiscal-year start, not the prior quarter end. Falls back to the immediately-prior
    same-type period only when no dated instant is close enough, else None (-> the bridge's
    relative walk). Pure over the facts list (no I/O, no SQL)."""
    periods = available_periods(facts)  # newest-first (year, period)

    def _built(y: int, p: FiscalPeriod) -> Statement | None:
        s = build_statement(facts, cik, "balance", y, p)
        return s if (s.lines or s.accession is not None) else None

    if cf_stmt.period_start:
        try:
            start = dt.date.fromisoformat(cf_stmt.period_start)
        except ValueError:
            start = None
        if start is not None:
            best: Statement | None = None
            best_gap: int | None = None
            for (y, p) in periods:
                if (y, p) == (cf_stmt.fiscal_year, cf_stmt.fiscal_period):
                    continue
                cand = _built(y, p)
                if cand is None or not cand.period_end:
                    continue
                try:
                    end = dt.date.fromisoformat(cand.period_end)
                except ValueError:
                    continue
                # A prior instant ending ~1 day before this period's start (allow a little
                # fiscal-calendar drift). Positive gap = the balance ends before the CF start.
                gap = (start - end).days
                if end < start and -2 <= gap <= 7 and (best_gap is None or gap < best_gap):
                    best, best_gap = cand, gap
            if best is not None:
                return best

    # Fallback: the immediately-prior period of the requested type (no dated match found).
    same_type = [(y, p) for (y, p) in periods if p == period]
    try:
        idx = same_type.index((cf_stmt.fiscal_year, cf_stmt.fiscal_period))
    except ValueError:
        return None
    if idx + 1 >= len(same_type):
        return None
    py, pp = same_type[idx + 1]
    return _built(py, pp)


@public_router.get(
    "/companies/{symbol}/statements/cashflow/viz",
    response_model=CashFlowViz,
    tags=["Financials"],
    summary="Cash bridge (Beginning -> CFO/CFI/CFF/FX -> Ending) view of a cash-flow statement",
)
async def get_cashflow_statement_viz(
    symbol: str,
    year: int = Query(..., description="Fiscal year, e.g. 2024"),
    period: FiscalPeriod = Query("FY", description="FY, Q1, Q2, Q3, or Q4"),
    repo: RawFactRepository = Depends(get_repo),
    ticker_cache: TickerCache = Depends(get_ticker_cache),
) -> CashFlowViz:
    """Derived presentation view over one company's cash-flow statement for one period: the
    **Cash Bridge** stepping Beginning Cash -> Operating -> Investing -> Financing -> FX ->
    Ending Cash.

    The numbers are the same normalized values as /statements/cashflow (and /statements/balance
    for the Beginning/Ending Cash levels), re-shaped for visualization -- not a new measurement
    (same cache-aside facts path, same build_statement). Uses the full-history facts because the
    bridge needs the PRIOR period-end balance for Beginning Cash. A filing lacking the reported
    net change in cash returns 200 with an explicit `available=false` state -- an honest "can't
    chart this period", not an error. See the `caveats` field and normalize/viz.py.
    """
    async with SECClient() as client:
        cik = await _cik_from_symbol(client, ticker_cache, symbol)
        facts = await _facts_for_cik(repo, client, cik)
    if not facts:
        raise HTTPException(status_code=404, detail=f"No data found for {symbol}.")
    cf_stmt = build_statement(facts, cik, "cashflow", year, period)
    if not cf_stmt.lines and cf_stmt.accession is None:
        raise HTTPException(
            status_code=404,
            detail=f"No cashflow data found for {symbol} {period} {year}.",
        )
    end_balance = build_statement(facts, cik, "balance", year, period)
    if not end_balance.lines and end_balance.accession is None:
        end_balance = None
    begin_balance = _prior_period_balance(facts, cik, cf_stmt, period)
    return cashflow_viz(cf_stmt, end_balance, begin_balance)


@public_router.get(
    "/companies/{symbol}/statements/cashflow/viz-series",
    response_model=CashFlowSeries,
    tags=["Financials"],
    summary="FCF breakdown + earnings-quality series (OCF vs CapEx vs FCF; NI vs OCF + conversion)",
)
async def get_cashflow_series(
    symbol: str,
    period: FiscalPeriod = Query("FY", description="Period type for the series (FY for now)"),
    limit: int = Query(
        _CAPITAL_STRUCTURE_DEFAULT_LIMIT,
        ge=1,
        le=_CAPITAL_STRUCTURE_MAX_LIMIT,
        description="How many recent periods to include (most recent first, drawn oldest->newest).",
    ),
    repo: RawFactRepository = Depends(get_repo),
    ticker_cache: TickerCache = Depends(get_ticker_cache),
) -> CashFlowSeries:
    """The **FCF breakdown** (Operating Cash Flow vs Capital Expenditures vs Free Cash Flow) and
    **Earnings-Quality** (Net Income vs Operating Cash Flow + the OCF/Net-Income conversion ratio)
    series across one company's most recent `limit` periods of the given `period` type, drawn
    oldest->newest.

    Cross-statement: each period's net income comes from the income statement built from the same
    facts (joined on the fiscal key). FCF is N/A for a period missing OCF or capex; the conversion
    ratio is "nm" when net income <= 0 -- never coerced to 0. An empty series is a valid 200 (an
    honest "nothing to chart"), not an error. See normalize/viz.py.
    """
    async with SECClient() as client:
        cik = await _cik_from_symbol(client, ticker_cache, symbol)
        facts = await _facts_for_cik(repo, client, cik)
    if not facts:
        raise HTTPException(status_code=404, detail=f"No data found for {symbol}.")
    selected = [(y, p) for (y, p) in available_periods(facts) if p == period][:limit]
    cf_statements = [build_statement(facts, cik, "cashflow", y, p) for (y, p) in selected]
    income_statements = [build_statement(facts, cik, "income", y, p) for (y, p) in selected]
    cf_statements = [s for s in cf_statements if s.lines or s.accession is not None]
    return cashflow_series(cf_statements, income_statements)


# Normalized tag-level view (public; ROADMAP_DATA_DEPTH "normalize without mapping",
# operator decision 2026-07-16) -- caveats always present, same convention as 13F.
_NORMALIZED_FACTS_CAVEATS = [
    "Tag-level, NOT variant-unified: different companies may report the same economic "
    "concept under different tags (that unification is the canonical /statements "
    "layer's job). Cross-company comparisons only hold where filers use the same tag.",
    "One row per (tag, unit) from the filing's PRIMARY column only: comparative "
    "columns are removed, restatements resolved to the latest filing, and a discrete "
    "quarter beats the YTD duration sharing its period end.",
    "Rows with is_extension=true are company-specific extension tags -- filer-local "
    "vocabulary with no cross-company meaning at all.",
]


class NormalizedFactsResponse(NormalizedView):
    caveats: list[str]


@router.get(
    "/companies/{symbol}/normalized-facts",
    response_model=NormalizedFactsResponse,
    tags=["Financials"],
    summary="Every reported tag for one fiscal period, mechanically normalized",
)
async def get_normalized_facts(
    symbol: str,
    year: int = Query(..., description="Fiscal year, e.g. 2024"),
    period: FiscalPeriod = Query("FY", description="FY, Q1, Q2, Q3, or Q4"),
    repo: RawFactRepository = Depends(get_repo),
    ticker_cache: TickerCache = Depends(get_ticker_cache),
) -> NormalizedFactsResponse:
    """The tag-level normalized layer: every us-gaap/dei tag the company reported for
    one fiscal period -- not just the canonically mapped ones -- with the statement
    builder's mechanical cleanups applied (primary filing column only, restatements
    resolved, one row per tag+unit). Tags keep their official FASB labels; rows that
    feed a canonical concept carry it in `canonical_concept` as a cross-link to
    /statements. See the `caveats` field: this layer is NOT variant-unified.
    """
    async with SECClient() as client:
        cik = await _cik_from_symbol(client, ticker_cache, symbol)
        facts = await _statement_facts_for_cik(repo, client, cik, year, period)
    view = build_normalized_view(facts, cik, year, period)
    if not view.rows and view.accession is None:
        raise HTTPException(
            status_code=404,
            detail=f"No data found for {symbol} {period} {year}.",
        )
    return NormalizedFactsResponse(**view.model_dump(), caveats=_NORMALIZED_FACTS_CAVEATS)


# Raw-facts endpoint caveats -- always present, same convention as the 13F endpoints'.
# The fy/fp trap is the one that turns this endpoint into a support burden if unread.
_RAW_FACTS_CAVEATS = [
    "Raw facts carry provenance but NO normalization promise -- a tag means whatever "
    "this filer meant by it, and tags are not comparable across companies or years "
    "the way canonical concepts are.",
    "fiscal_year/fiscal_period are the FILING's period, not the fact's own: one "
    "(year, period) key also contains the filing's comparative columns and YTD "
    "durations. Filter/aggregate by period_end/instant, never by fiscal_year alone. "
    "See /methodology.",
    "The same tag+period can appear in multiple filings with different values "
    "(restatements) -- latest `filed` wins for a 'current' view; prior values are "
    "deliberately retained.",
]


class RawFactRow(BaseModel):
    """The full RawFact shape, audit fields and all -- nothing derived, nothing dropped.

    A separate response model (rather than serializing RawFact directly) only because
    `is_extension` is a computed property on RawFact, which Pydantic doesn't serialize;
    every other field is carried through verbatim.
    """

    taxonomy: str
    gaap_tag: str
    label: str
    unit: str
    value: float | int | None
    period_start: str | None
    period_end: str | None
    instant: str | None
    fiscal_year: int | None
    fiscal_period: str | None
    form: str | None
    filed: str | None
    accession: str | None
    frame: str | None
    is_extension: bool


class RawFactsResponse(BaseModel):
    cik: int
    total: int  # matching facts BEFORE pagination, so the operator can page
    limit: int
    offset: int
    caveats: list[str]
    facts: list[RawFactRow]


@internal_router.get(
    "/companies/{symbol}/facts",
    response_model=RawFactsResponse,
    dependencies=[Depends(require_admin_secret)],
    include_in_schema=False,
)
async def get_raw_facts(
    symbol: str,
    tag: list[str] | None = Query(default=None, description="Exact us-gaap/dei tag; repeatable"),
    year: int | None = Query(default=None, description="Fiscal year (the FILING's, see caveats)"),
    period: FiscalPeriod | None = Query(default=None, description="FY, Q1..Q4; requires year="),
    taxonomy: str | None = Query(default=None, description="e.g. us-gaap, dei"),
    limit: int = Query(default=100, ge=1, le=1000),
    offset: int = Query(default=0, ge=0),
    repo: RawFactRepository = Depends(get_repo),
    ticker_cache: TickerCache = Depends(get_ticker_cache),
) -> RawFactsResponse:
    """INTERNAL-ONLY (docs/ROADMAP_DATA_DEPTH.md Phase 1): serve the store's raw facts
    for one company -- "show your work" as an API surface. Power users self-serve the
    hundreds of tags the canonical mapping hasn't earned yet, without us promising
    normalization we haven't done. Admin-secret-gated and out of the OpenAPI schema
    until the go-public decision (see the roadmap for why that's an open product
    question).

    At least one filter (tag= or year=) is required -- same "no unbounded scans" stance
    as /v1/screen. Serving path is the existing cache-aside `_facts_for_cik`: repo hit,
    or SEC fetch + store on a miss. No new ingestion, no schema change.
    """
    if not tag and year is None:
        raise HTTPException(
            status_code=400,
            detail="Provide at least one filter: tag= (repeatable) and/or year= "
            "(optionally with period=).",
        )
    if period is not None and year is None:
        raise HTTPException(status_code=400, detail="period= requires year=.")

    async with SECClient() as client:
        cik = await _cik_from_symbol(client, ticker_cache, symbol)
        facts = await _facts_for_cik(repo, client, cik)

    wanted_tags = set(tag) if tag else None
    matched = [
        f
        for f in facts
        if (wanted_tags is None or f.gaap_tag in wanted_tags)
        and (year is None or f.fiscal_year == year)
        and (period is None or f.fiscal_period == period)
        and (taxonomy is None or f.taxonomy == taxonomy)
    ]
    # Deterministic order so limit/offset pagination is stable across requests.
    matched.sort(
        key=lambda f: (
            f.taxonomy,
            f.gaap_tag,
            f.unit,
            f.period_end or f.instant or "",
            f.period_start or "",
            f.filed or "",
            f.accession or "",
        )
    )
    page = matched[offset : offset + limit]
    return RawFactsResponse(
        cik=cik,
        total=len(matched),
        limit=limit,
        offset=offset,
        caveats=_RAW_FACTS_CAVEATS,
        facts=[
            RawFactRow(
                taxonomy=f.taxonomy,
                gaap_tag=f.gaap_tag,
                label=f.label,
                unit=f.unit,
                value=f.value,
                period_start=f.period_start,
                period_end=f.period_end,
                instant=f.instant,
                fiscal_year=f.fiscal_year,
                fiscal_period=f.fiscal_period,
                form=f.form,
                filed=f.filed,
                accession=f.accession,
                frame=f.frame,
                is_extension=f.is_extension,
            )
            for f in page
        ],
    )


@public_router.get(
    "/companies/{symbol}/periods",
    tags=["Financials"],
    summary="List fiscal periods with data for a company",
    responses={
        200: {
            "content": {
                "application/json": {
                    "example": {
                        "cik": 320193,
                        "periods": [
                            {"year": 2024, "period": "FY"},
                            {"year": 2024, "period": "Q3"},
                        ],
                    }
                }
            }
        }
    },
)
async def get_periods(
    symbol: str,
    repo: RawFactRepository = Depends(get_repo),
    ticker_cache: TickerCache = Depends(get_ticker_cache),
) -> dict:
    """List the fiscal periods available for a company."""
    async with SECClient() as client:
        cik = await _cik_from_symbol(client, ticker_cache, symbol)
        facts = await _facts_for_cik(repo, client, cik)
    return {
        "cik": cik,
        "periods": [{"year": y, "period": p} for (y, p) in available_periods(facts)],
    }


@public_router.get(
    "/companies/{symbol}/metrics",
    response_model=CompanyMetrics,
    tags=["Financials"],
    summary="Get fundamental metrics for a company + fiscal period",
)
async def get_metrics(
    symbol: str,
    year: int = Query(..., description="Fiscal year, e.g. 2024"),
    period: FiscalPeriod = Query("FY", description="FY, Q1, Q2, Q3, or Q4"),
    repo: RawFactRepository = Depends(get_repo),
    ticker_cache: TickerCache = Depends(get_ticker_cache),
) -> CompanyMetrics:
    """Fundamental metrics (profitability, growth, health, cash flow, efficiency, per-share)
    for a company + fiscal period.

    Computed on-demand over the cached RawFacts (cache-aside, same path as /statements) --
    NOT the analytical layer, which is cross-company only. Each value carries its own status
    (ok/approximate/na/nm), basis (TTM/as-of), and a reason when it's anything but a clean
    number; see docs/ROADMAP_METRICS.md and docs/STYLE_GUIDE.md §7.
    """
    async with SECClient() as client:
        cik = await _cik_from_symbol(client, ticker_cache, symbol)
        facts = await _facts_for_cik(repo, client, cik)
    # FY cards carry an intra-year quarterly trend (sparkline); quarters are single values.
    if period == "FY":
        result = compute_fy_metrics_with_trend(facts, cik, year)
    else:
        result = compute_metrics(facts, cik, year, period)
    if not result.metrics:
        # Empty list means the period itself isn't in the data (no annual/quarter end
        # resolved) -- distinct from "resolved, but individual metrics are N/A".
        raise HTTPException(
            status_code=404,
            detail=f"No metrics available for {symbol} {period} {year}.",
        )
    return result


@public_router.get(
    "/companies/{symbol}/metric-periods",
    tags=["Financials"],
    summary="List fiscal periods the metrics engine can compute for a company",
)
async def get_metric_periods(
    symbol: str,
    repo: RawFactRepository = Depends(get_repo),
    ticker_cache: TickerCache = Depends(get_ticker_cache),
) -> dict:
    """The (year, period) combinations `/metrics` can actually compute for this company —
    annual (FY) and quarterly (Q1-Q4, including the in-progress fiscal year), newest first.

    This is the authoritative axis for a period selector: it reflects what the metric engine
    resolves (period_end-anchored), unlike `/periods` (statement-layer fiscal-label pairs).
    """
    async with SECClient() as client:
        cik = await _cik_from_symbol(client, ticker_cache, symbol)
        facts = await _facts_for_cik(repo, client, cik)
    return {"cik": cik, "periods": metric_periods(facts)}


@public_router.get(
    "/companies/{symbol}/metrics/{metric}/history",
    response_model=MetricHistory,
    tags=["Financials"],
    summary="Get one metric's full history (series + trend signals) for a company",
)
async def get_metric_history(
    symbol: str,
    metric: str,
    frequency: MetricFrequency = Query(
        "quarterly", description="Series frequency: quarterly (finest) or annual (FY only)"
    ),
    repo: RawFactRepository = Depends(get_repo),
    ticker_cache: TickerCache = Depends(get_ticker_cache),
) -> MetricHistory:
    """One fundamental metric run across the company's whole history, oldest-first, plus
    derived Tier-2 trend signals (CAGR, expansion, acceleration, streak, distance-from-peak).

    Public and served cache-aside from the operational store, same as `/metrics` (single-company
    history is NOT the cross-company analytical path). Every point is computed independently
    against the latest-filed facts, so the series shares one labeled AS-RESTATED basis (R9) and
    each point is point-in-time correct (R1); na/nm periods are gap points (`value` null), never
    interpolated. Each point carries its calendar `period_end` so a future multi-company overlay
    can align on it (R10). An unknown `metric` is a 404; a known company with no computable
    history returns 200 with empty `points`/`signals` (distinct from an unknown ticker's 404).
    """
    if metric not in METRIC_KEYS:
        raise HTTPException(
            status_code=404,
            detail=f"Unknown metric '{metric}'. Valid metrics: {', '.join(METRIC_KEYS)}.",
        )
    async with SECClient() as client:
        cik = await _cik_from_symbol(client, ticker_cache, symbol)
        facts = await _facts_for_cik(repo, client, cik)
    return compute_metric_history(facts, cik, metric, frequency)


# Surfaced on every peer-ranking response. Percentile is POSITION, not a verdict -- for some
# metrics a higher value is "worse" -- and SIC grouping is coarse; ranks exclude N/A companies.
_PEER_CAVEATS = [
    "Peers are grouped by SIC industry code, which is coarse and dated -- treat a group as a "
    "starting axis, not ground truth.",
    "Ranks exclude companies for which the metric is N/A (R7) -- an N/A company is not counted "
    "as a low value.",
    "Percentile is a company's POSITION within its peer group, not a judgment -- for some "
    "metrics (e.g. leverage) a higher value is not 'better'.",
    "Ranks are precomputed per period by a batch job; a company or metric with no rank had too "
    "few comparable peers (below the minimum group size) or no data for that period.",
]


@public_router.get(
    "/companies/{symbol}/peers",
    response_model=CompanyPeerRanks,
    tags=["Financials"],
    summary="Peer-relative metric ranks (percentile / z-score within the SIC group)",
)
async def get_peer_ranks(
    symbol: str,
    year: int = Query(..., description="Fiscal year, e.g. 2024"),
    period: FiscalPeriod = Query("FY", description="FY, Q1, Q2, Q3, or Q4"),
    ticker_cache: TickerCache = Depends(get_ticker_cache),
    rank_repo: MetricRankRepository = Depends(get_metric_rank_repo),
) -> CompanyPeerRanks:
    """How this company's metrics rank against its SIC-industry peers for one period.

    A **precomputed** point lookup (the analytical/peer_ranks.py batch is the sole producer;
    the live path never runs the DuckDB ranking -- see CLAUDE.md). Each value carries its
    `peer_group`, `peer_count`, `percentile` (0-100 position, NOT a good/bad verdict), and
    `z_score`. Empty `peers` is a valid, honest result: no peer group met the minimum size for
    any metric, or nothing has been ranked for this company/period yet (`caveats` spells this out).
    """
    async with SECClient() as client:
        cik = await _cik_from_symbol(client, ticker_cache, symbol)
    rows = rank_repo.get_for_cik(cik, year, period)
    peers = [
        PeerRank(
            metric=r.metric,
            label=METRIC_LABELS.get(r.metric, r.metric),
            unit=METRIC_UNITS.get(r.metric, ""),
            peer_group=r.peer_group,
            peer_count=r.peer_count,
            percentile=r.percentile,
            z_score=r.z_score,
        )
        for r in rows
    ]
    return CompanyPeerRanks(
        cik=cik,
        fiscal_year=year,
        fiscal_period=period,
        peer_basis=f"SIC {settings.secfin_peer_sic_digits}-digit",
        caveats=_PEER_CAVEATS,
        peers=peers,
    )


@public_router.get(
    "/companies/{symbol}/peers/{metric}/distribution",
    response_model=CompanyPeerDistribution,
    tags=["Financials"],
    summary="Peer value distribution for one metric (min/p25/median/p75/max)",
)
async def get_peer_distribution(
    symbol: str,
    metric: str,
    year: int = Query(..., description="Fiscal year, e.g. 2024"),
    period: FiscalPeriod = Query("FY", description="FY, Q1, Q2, Q3, or Q4"),
    ticker_cache: TickerCache = Depends(get_ticker_cache),
    profile_repo: CompanyProfileRepository = Depends(get_company_profile_repo),
    dist_repo: MetricDistributionRepository = Depends(get_metric_distribution_repo),
    value_repo: MetricValueRepository = Depends(get_metric_value_repo),
) -> CompanyPeerDistribution:
    """The peer group's actual value spread for one metric/period, with this company's own
    value alongside it -- for plotting a distribution (strip/box), not just a lone percentile.

    A **precomputed** group lookup (the analytical/peer_distribution.py batch is the sole
    producer; the live path never runs the DuckDB aggregation -- see CLAUDE.md). `distribution`
    is `None` when this company's SIC group never met the minimum peer-group size for this
    metric/period -- a valid, honest result, same convention as `/peers`.
    """
    if metric not in METRIC_KEYS:
        raise HTTPException(
            status_code=404,
            detail=f"Unknown metric '{metric}'. Valid metrics: {', '.join(METRIC_KEYS)}.",
        )
    async with SECClient() as client:
        cik = await _cik_from_symbol(client, ticker_cache, symbol)
    distribution = None
    profile = profile_repo.get(cik)
    sic_digits = settings.secfin_peer_sic_digits
    if profile is not None and profile.sic is not None and len(profile.sic) >= sic_digits:
        peer_group = profile.sic[:sic_digits]
        row = dist_repo.get(peer_group, year, period, metric)
        if row is not None:
            company_value = next(
                (
                    v.value
                    for v in value_repo.get_for_cik(cik)
                    if v.fiscal_year == year and v.fiscal_period == period and v.metric == metric
                ),
                None,
            )
            distribution = PeerDistribution(
                metric=metric,
                label=METRIC_LABELS.get(metric, metric),
                unit=METRIC_UNITS.get(metric, ""),
                peer_group=row.peer_group,
                peer_count=row.peer_count,
                min=row.min,
                p25=row.p25,
                median=row.median,
                p75=row.p75,
                max=row.max,
                company_value=company_value,
            )
    return CompanyPeerDistribution(
        cik=cik,
        fiscal_year=year,
        fiscal_period=period,
        peer_basis=f"SIC {sic_digits}-digit",
        caveats=_PEER_CAVEATS,
        distribution=distribution,
    )


# ---- Sector overview: asset-weighted DuPont aggregates (Sector Analytics D1) --------

_SECTOR_CAVEATS = [
    "These are ASSET-WEIGHTED sector aggregates (ΣNI/ΣRev × ΣRev/ΣAssets × ΣAssets/ΣEquity), "
    "NOT medians or averages of company ratios -- the DuPont identity (ROE = Net Margin × Asset "
    "Turnover × Equity Multiplier) holds on the aggregate by construction.",
    "A company is included only when net income, revenue, assets AND equity are all reported for "
    "the period; a company N/A on any leg is excluded, never counted as zero.",
    "Sectors are grouped by SIC industry code, which is coarse and dated -- treat a group as a "
    "starting axis, not ground truth.",
    "Companies are aggregated by fiscal-period LABEL; fiscal periods are not calendar-aligned "
    "across companies, and figures carry the usual ~quarter reporting lag (latest restatement "
    "wins).",
    "Only groups meeting the minimum size are shown; a smaller group is dropped, not shown as "
    "sparse or zero.",
    "A sector whose aggregate equity is near zero or negative (e.g. constituents with large "
    "buyback-driven equity deficits) yields an extreme ROE and equity multiplier -- read the "
    "decomposition: the DuPont legs show such a figure is leverage-driven, not a profitability "
    "signal.",
]


def _sector_dupont_model(row: SectorDupontRow) -> SectorDupont:
    """Map a SectorDupontRow (repo) to the API model, attaching the readable group label."""
    return SectorDupont(
        group=row.peer_group,
        group_label=sic2_label(row.peer_group),
        fiscal_year=row.fiscal_year,
        fiscal_period=row.fiscal_period,
        period_end=row.period_end,
        peer_count=row.peer_count,
        net_margin=row.net_margin,
        asset_turnover=row.asset_turnover,
        equity_multiplier=row.equity_multiplier,
        roe=row.roe,
        sum_net_income=row.sum_net_income,
        sum_revenue=row.sum_revenue,
        sum_avg_assets=row.sum_avg_assets,
        sum_avg_equity=row.sum_avg_equity,
    )


@public_router.get(
    "/sectors",
    response_model=SectorList,
    tags=["Sectors"],
    summary="Sector overview: asset-weighted DuPont aggregates for one period",
)
async def get_sectors(
    year: int | None = Query(
        None,
        description="Fiscal year; defaults to the latest WELL-COVERED annual (FY) year "
        "(a barely-filed newest year is skipped -- pass it explicitly to see it)",
    ),
    period: FiscalPeriod = Query("FY", description="FY, Q1, Q2, Q3, or Q4"),
    repo: SectorDupontRepository = Depends(get_sector_dupont_repo),
) -> SectorList:
    """Every qualifying SIC sector's asset-weighted DuPont decomposition for one period.

    A **precomputed** read of `sector_dupont` (the analytical/sector_dupont.py batch is the sole
    producer; the live path never runs the DuckDB aggregation -- see CLAUDE.md). Each sector's
    `roe` equals `net_margin x asset_turnover x equity_multiplier` by construction (asset-weighted
    aggregate, NOT a median). Empty `sectors` is a valid, honest result: no group met the minimum
    size, or nothing has been materialized yet (`caveats` spells this out).
    """
    resolved_year = year if year is not None else repo.latest_fy_year()
    sectors = (
        [_sector_dupont_model(r) for r in repo.list_for_period(resolved_year, period)]
        if resolved_year is not None
        else []
    )
    return SectorList(
        fiscal_year=resolved_year or 0,
        fiscal_period=period,
        peer_basis=f"SIC {settings.secfin_peer_sic_digits}-digit",
        caveats=_SECTOR_CAVEATS,
        sectors=sectors,
    )


# Metrics offered as cross-sector / per-sector SPREADS (Sector Analytics D3). Each is already a
# materialized metric (metrics.py / METRIC_KEYS); the batch (analytical/peer_distribution.py)
# writes their per-SIC five-number summaries into metric_distributions, which these views read
# cache-aside. Two families, both valid:
#   * PROFITABILITY/EFFICIENCY -- derived from headline concepts (net income, revenue, assets,
#     equity) that the ingest covers broadly, so these are populated across ~60 sectors today.
#   * LIQUIDITY/SOLVENCY -- need granular balance-sheet/income concepts (current assets, current
#     liabilities, debt, interest expense) that are still sparse market-wide, so most sectors
#     don't yet meet the minimum group size. They are offered anyway and render an HONEST empty
#     state per the usual rules (never a zero box); they light up as that coverage improves.
_SPREAD_METRICS_PROFITABILITY = (
    "net_margin",
    "roe",
    "roa",
    "asset_turnover",
    "revenue_growth_yoy",
    "earnings_growth_yoy",
)
_SPREAD_METRICS_LIQUIDITY_SOLVENCY = (
    "current_ratio",
    "quick_ratio",
    "debt_to_equity",
    "interest_coverage",
)
_SPREAD_METRICS = _SPREAD_METRICS_PROFITABILITY + _SPREAD_METRICS_LIQUIDITY_SOLVENCY

# The distribution views reuse the peer-ranking caveat vocabulary verbatim (a spread is a POSITION,
# not a verdict; N/A excluded, never a low value; SIC coarse; below-min groups dropped) plus two
# lines specific to reading a box and to the coverage-limited metrics.
_SPREAD_CAVEATS = _PEER_CAVEATS + [
    "A box shows the SPREAD of reported values within a sector (min/p25/median/p75/max) -- a wide "
    "box means the peers are dispersed, and a higher value is not automatically 'better'.",
    "Some metrics (notably the liquidity/solvency ratios) depend on granular balance-sheet "
    "concepts that are still sparsely reported across the market; a sector with too few comparable "
    "companies is omitted, never shown as zero -- coverage fills in as more filings are ingested.",
]


@public_router.get(
    "/sectors/spreads",
    response_model=SectorSpreadList,
    tags=["Sectors"],
    summary="Cross-sector spread of one metric (a box per SIC group)",
)
async def get_sector_spreads(
    metric: str = Query(
        ...,
        description="One of: " + ", ".join(_SPREAD_METRICS),
    ),
    year: int | None = Query(
        None, description="Fiscal year; defaults to the latest materialized annual (FY) year"
    ),
    period: FiscalPeriod = Query("FY", description="FY, Q1, Q2, Q3, or Q4"),
    dist_repo: MetricDistributionRepository = Depends(get_metric_distribution_repo),
) -> SectorSpreadList:
    """Every qualifying SIC sector's five-number summary (min/p25/median/p75/max) for one metric +
    period -- for a box-per-sector comparison of the within-sector spread.

    A **precomputed** read of `metric_distributions` (the analytical/peer_distribution.py batch is
    the sole producer; the live path never runs the DuckDB aggregation -- see CLAUDE.md). Only
    groups meeting the minimum peer-group size are present; a below-min group is absent, never
    zero-filled. Empty `spreads` is a valid, honest result -- expected for the coverage-limited
    liquidity/solvency metrics until their granular concepts are more broadly ingested (`caveats`
    spells this out).
    """
    if metric not in _SPREAD_METRICS:
        raise HTTPException(
            status_code=404,
            detail=f"Unknown spread metric '{metric}'. Valid metrics: "
            f"{', '.join(_SPREAD_METRICS)}.",
        )
    resolved_year = year if year is not None else dist_repo.latest_fy_year(metric)
    rows = (
        dist_repo.list_for_metric(metric, resolved_year, period)
        if resolved_year is not None
        else []
    )
    spreads = [
        SectorSpread(
            group=r.peer_group,
            group_label=sic2_label(r.peer_group),
            peer_count=r.peer_count,
            min=r.min,
            p25=r.p25,
            median=r.median,
            p75=r.p75,
            max=r.max,
        )
        for r in rows
    ]
    return SectorSpreadList(
        metric=metric,
        label=METRIC_LABELS.get(metric, metric),
        unit=METRIC_UNITS.get(metric, ""),
        fiscal_year=resolved_year or 0,
        fiscal_period=period,
        peer_basis=f"SIC {settings.secfin_peer_sic_digits}-digit",
        caveats=_SPREAD_CAVEATS,
        spreads=spreads,
    )


# ---- Sector composite theme scores (sector-overview redesign, Phase 0) ---------------
#
# Declared BEFORE `/sectors/{group}` so the literal path wins over the {group} param route (same
# ordering reason `/sectors/spreads` sits above it).

_THEME_SCORE_NORMALIZATION = (
    "Each theme score is the equal-weight mean of its constituent metrics' z-scored, "
    "favorability-oriented per-sector medians, mapped to 0-100 as 50 + 15·z clamped to [0, 100] "
    "(50 = cross-sector average, ±1σ ≈ 15 points)."
)

_THEME_SCORE_CAVEATS = _PEER_CAVEATS + [
    _THEME_SCORE_NORMALIZATION,
    "A score is a sector's POSITION relative to other sectors on that theme -- not a 'good'/'bad', "
    "'buy'/'sell', or quality verdict. The rank and percentile place the sector against its peers; "
    "the decomposition shows which constituents moved it.",
    "Only SCALE-FREE metrics (ratios, margins, growth rates, turnovers, days) are scored; raw "
    "dollar levels (e.g. free cash flow, net debt) are excluded because a cross-sector z-score of "
    "an absolute magnitude conflates sector size with health.",
    "A constituent with no comparable sector median is EXCLUDED from the average and absent from "
    "the decomposition (never counted as zero); a theme with too few available constituents is not "
    "scored for that sector.",
    "Two of the seven themes -- accounting quality and structure & activity -- are NOT scored yet "
    "(they need signals not ingested or not sector-aggregated). They appear as explicit "
    "'not yet scored' markers, never as a fabricated score.",
]


def _theme_score_model(
    row: SectorThemeScoreRow, components: list[SectorThemeComponentRow]
) -> SectorThemeScore:
    """Map a materialized score row + its included constituents to the API model."""
    return SectorThemeScore(
        theme=row.theme,
        theme_label=THEME_LABELS.get(row.theme, row.theme),
        scored=True,
        score=row.score,
        percentile=row.percentile,
        rank=row.rank,
        rank_of=row.rank_of,
        delta_vs_prior_fy=row.delta_vs_prior_fy,
        constituents=[
            ThemeConstituent(
                metric=c.metric,
                label=METRIC_LABELS.get(c.metric, c.metric),
                higher_is_better=c.higher_is_better,
                median=c.median_value,
                oriented_z=c.oriented_z,
            )
            for c in components
        ],
    )


def _deferred_theme_markers() -> list[SectorThemeScore]:
    """The two guide themes we cannot honestly score yet, as scored:false markers (never a 0)."""
    return [
        SectorThemeScore(theme=key, theme_label=label, scored=False, reason=reason)
        for key, (label, reason) in DEFERRED_THEMES.items()
    ]


@public_router.get(
    "/sectors/theme-scores",
    response_model=SectorThemeScoreList,
    tags=["Sectors"],
    summary="Composite sector health scores across the backable themes for one period",
)
async def get_sector_theme_scores(
    year: int | None = Query(
        None, description="Fiscal year; defaults to the latest well-covered annual (FY) year"
    ),
    period: FiscalPeriod = Query("FY", description="FY, Q1, Q2, Q3, or Q4"),
    repo: SectorThemeScoreRepository = Depends(get_sector_theme_score_repo),
) -> SectorThemeScoreList:
    """Every scored sector's composite theme scores for one period -- the scorecard's data source.

    A **precomputed** read of `sector_theme_scores` / `sector_theme_components` (the
    analytical/sector_theme_scores.py batch is the sole producer; the live path never recomputes a
    score -- there is no DuckDB on this path). Each sector's `themes` lists the five backable themes
    it qualified for (with score, cross-sector rank + percentile, prior-FY delta, and the
    per-constituent decomposition), followed by the two deferred themes as `scored: false` markers.
    A sector/theme that didn't meet the constituent thresholds is simply absent, never zero-filled.
    Empty `sectors` is a valid, honest result: nothing materialized yet, or no sector qualified.
    """
    resolved_year = year if year is not None else repo.latest_fy_year()
    scores = repo.list_for_period(resolved_year, period) if resolved_year is not None else []
    components = (
        repo.components_for_period(resolved_year, period) if resolved_year is not None else []
    )

    # group components under (peer_group, theme)
    comps_by_key: dict[tuple[str, str], list[SectorThemeComponentRow]] = defaultdict(list)
    for c in components:
        comps_by_key[(c.peer_group, c.theme)].append(c)

    # group scored themes under each sector
    scored_by_group: dict[str, dict[str, SectorThemeScoreRow]] = defaultdict(dict)
    for row in scores:
        scored_by_group[row.peer_group][row.theme] = row

    deferred = _deferred_theme_markers()
    sectors: list[SectorThemeScores] = []
    for group in sorted(scored_by_group):
        by_theme = scored_by_group[group]
        themes: list[SectorThemeScore] = [
            _theme_score_model(by_theme[theme], comps_by_key.get((group, theme), []))
            for theme in THEMES  # scorecard order; a theme the sector lacks is skipped
            if theme in by_theme
        ]
        themes.extend(deferred)
        sectors.append(
            SectorThemeScores(group=group, group_label=sic2_label(group), themes=themes)
        )

    return SectorThemeScoreList(
        fiscal_year=resolved_year or 0,
        fiscal_period=period,
        peer_basis=f"SIC {settings.secfin_peer_sic_digits}-digit",
        normalization=_THEME_SCORE_NORMALIZATION,
        caveats=_THEME_SCORE_CAVEATS,
        sectors=sectors,
    )


@public_router.get(
    "/sectors/{group}",
    response_model=SectorSeries,
    tags=["Sectors"],
    summary="One sector's DuPont aggregate across every materialized period (trend)",
)
async def get_sector_series(
    group: str,
    repo: SectorDupontRepository = Depends(get_sector_dupont_repo),
) -> SectorSeries:
    """One SIC group's asset-weighted DuPont aggregate over time, oldest period first.

    Feeds the sector trend chart (the UI slices it to 1Y / 5Y / All) and the DuPont tree (from the
    latest point). Empty `points` is a valid, honest result -- the group never met the minimum
    size, or isn't materialized yet.
    """
    points = [_sector_dupont_model(r) for r in repo.get_series(group)]
    return SectorSeries(
        group=group,
        group_label=sic2_label(group),
        peer_basis=f"SIC {settings.secfin_peer_sic_digits}-digit",
        caveats=_SECTOR_CAVEATS,
        points=points,
    )


@public_router.get(
    "/sectors/{group}/spreads",
    response_model=SectorSpreadProfile,
    tags=["Sectors"],
    summary="One sector's metric spread (a box per metric)",
)
async def get_sector_spread_profile(
    group: str,
    year: int | None = Query(
        None, description="Fiscal year; defaults to the latest materialized annual (FY) year"
    ),
    period: FiscalPeriod = Query("FY", description="FY, Q1, Q2, Q3, or Q4"),
    dist_repo: MetricDistributionRepository = Depends(get_metric_distribution_repo),
) -> SectorSpreadProfile:
    """One SIC group's five-number summary for each offered metric + period -- for a box-per-metric
    drill-down of that sector's spread.

    A **precomputed** read of `metric_distributions` (the analytical/peer_distribution.py batch is
    the sole producer; the live path never runs the DuckDB aggregation -- see CLAUDE.md). A metric
    the group is below the minimum size for (or N/A) is simply absent -- never rendered as a zero
    box. Empty `metrics` is a valid, honest result.
    """
    # Default the period off a broadly-covered metric so a barely-filed metric doesn't yield a
    # spurious "latest" year; the UI passes an explicit year anyway.
    resolved_year = year if year is not None else dist_repo.latest_fy_year(_SPREAD_METRICS[0])
    by_metric = (
        {r.metric: r for r in dist_repo.list_for_group(group, resolved_year, period)}
        if resolved_year is not None
        else {}
    )
    metrics = [
        MetricSpread(
            metric=m,
            label=METRIC_LABELS.get(m, m),
            unit=METRIC_UNITS.get(m, ""),
            peer_count=by_metric[m].peer_count,
            min=by_metric[m].min,
            p25=by_metric[m].p25,
            median=by_metric[m].median,
            p75=by_metric[m].p75,
            max=by_metric[m].max,
        )
        for m in _SPREAD_METRICS
        if m in by_metric
    ]
    return SectorSpreadProfile(
        group=group,
        group_label=sic2_label(group),
        fiscal_year=resolved_year or 0,
        fiscal_period=period,
        peer_basis=f"SIC {settings.secfin_peer_sic_digits}-digit",
        caveats=_SPREAD_CAVEATS,
        metrics=metrics,
    )


# Caveats for the asset-lifecycle trend. Descriptive working-capital STRUCTURE -- deliberately NO
# alpha / timing / edge language (Sector Analytics honesty flag #2: the DIO/DSO/DPO figure IS
# management's own filed number carrying the usual ~quarter lag, not an information advantage).
_LIFECYCLE_CAVEATS = [
    "These are AGGREGATE days-metrics -- ΣInventory/ΣCostOfRevenue × 365 (DIO), "
    "ΣReceivables/ΣRevenue × 365 (DSO), ΣPayables/ΣCostOfRevenue × 365 (DPO) -- a ratio of summed "
    "dollars across the sector, NOT a median or average of company figures.",
    "CCC = DIO + DSO − DPO on ONE consistent company set; a company is included only when "
    "inventory, payables, receivables, cost of revenue AND revenue are all reported, so a company "
    "N/A on any leg is excluded, never counted as zero.",
    "DIO/DSO/DPO use average balances; where a contributing company reported only a period-end "
    "balance (no prior-period), its figure is APPROXIMATE -- a point drawn from any such company "
    "is flagged.",
    "This describes a sector's WORKING-CAPITAL STRUCTURE -- how long cash sits in inventory and "
    "receivables versus how long suppliers finance it. It is descriptive, and implies nothing "
    "about future returns or when to buy or sell.",
    "Sectors are grouped by SIC industry code, which is coarse and dated -- treat a group as a "
    "starting axis, not ground truth.",
    "Companies are aggregated by fiscal-period LABEL; fiscal periods are not calendar-aligned "
    "across companies, and figures carry the usual ~quarter reporting lag (latest restatement "
    "wins).",
    "Only groups meeting the minimum size are shown; a smaller group is dropped, not shown as "
    "sparse or zero, and a fiscal year with no aggregate is a gap -- never a zero.",
]


def _sector_lifecycle_model(row: SectorLifecycleRow) -> SectorLifecyclePoint:
    """Map a SectorLifecycleRow (repo) to the API model, attaching the readable group label."""
    return SectorLifecyclePoint(
        group=row.peer_group,
        group_label=sic2_label(row.peer_group),
        fiscal_year=row.fiscal_year,
        fiscal_period=row.fiscal_period,
        period_end=row.period_end,
        peer_count=row.peer_count,
        approximate=row.approx_count > 0,
        dio=row.dio,
        dpo=row.dpo,
        dso=row.dso,
        ccc=row.ccc,
    )


@public_router.get(
    "/sectors/{group}/lifecycle",
    response_model=SectorLifecycleSeries,
    tags=["Sectors"],
    summary="One sector's aggregate asset-lifecycle (DIO/DSO/DPO/CCC) across every FY (trend)",
)
async def get_sector_lifecycle(
    group: str,
    repo: SectorLifecycleRepository = Depends(get_sector_lifecycle_repo),
) -> SectorLifecycleSeries:
    """One SIC group's aggregate DIO/DSO/DPO/CCC over time, oldest FY first.

    A **precomputed** read of `sector_lifecycle` (the analytical/sector_lifecycle.py batch is the
    sole producer; the live path never runs the DuckDB aggregation -- see CLAUDE.md). Each point is
    a ratio of summed dollars across the sector (NOT a median), and `ccc` equals `dio + dso - dpo`
    by construction (every contributing company reported all five legs). Descriptive working-capital
    structure -- no timing/edge claim. Empty `points` is a valid, honest result -- the group never
    met the minimum size for all five legs, or isn't materialized yet.
    """
    points = [_sector_lifecycle_model(r) for r in repo.get_series(group)]
    return SectorLifecycleSeries(
        group=group,
        group_label=sic2_label(group),
        peer_basis=f"SIC {settings.secfin_peer_sic_digits}-digit",
        caveats=_LIFECYCLE_CAVEATS,
        points=points,
    )


# ---- Sector insider flow (Sector Analytics v2, P6a) --------------------------------------------
#
# A trailing-window OPEN-MARKET net buy/sell for one SIC group -- a DERIVED aggregate summing
# individual companies' REPORTED Forms 3/4/5 transactions (P=buy, S=sell only). Because the
# underlying data is reported transactions (NOT a 13F snapshot diff), the caveats are reporting-lag
# + coverage, NOT the 13F long-only/45-day derived-trade caveat. A group with no in-window open-mkt
# activity returns has_data=False (net/buys/sells null) -- an honest N/A, never a fabricated zero.
_INSIDER_FLOW_CAVEATS = [
    "Sector net buy/sell is a DERIVED aggregate -- it sums individual companies' reported insider "
    "transactions; it is not a single reported figure.",
    "Forms 3/4/5 are filed after the transaction date, so the most recent window may be incomplete "
    "(reporting lag).",
    "Aggregated only over the companies and filings ingested so far -- not every filer in the "
    "sector is covered.",
    "Open-market purchases (P) and sales (S) only -- grants, option exercises, gifts, and "
    "tax-withholding dispositions are excluded.",
]


@public_router.get(
    "/sectors/{group}/insider-flow",
    response_model=SectorInsiderFlow,
    tags=["Sectors"],
    summary="One sector's trailing-window open-market insider net buy/sell (Forms 3/4/5)",
)
async def get_sector_insider_flow(
    group: str,
    repo: SectorInsiderFlowRepository = Depends(get_sector_insider_flow_repo),
) -> SectorInsiderFlow:
    """One SIC group's trailing-window OPEN-MARKET insider net buy/sell.

    A **precomputed** read of `sector_insider_flow` (the analytical/sector_insider_flow.py batch is
    the sole producer; the live path never runs the DuckDB aggregation -- see CLAUDE.md guard 6).
    A DERIVED aggregate that sums individual companies' **reported** Forms 3/4/5 open-market
    transactions (P=buy, S=sell); it is NOT a 13F snapshot diff, so it carries reporting-lag +
    coverage caveats, never the 13F long-only/45-day caveat. `has_data=False` (net/buys/sells null)
    is a valid, honest result -- the group has no in-window open-market activity ingested yet, shown
    as N/A, never a zero net-flow.
    """
    peer_basis = f"SIC {settings.secfin_peer_sic_digits}-digit"
    row = repo.get(group)
    if row is None:
        return SectorInsiderFlow(
            group=group,
            group_label=sic2_label(group),
            peer_basis=peer_basis,
            window=InsiderFlowWindow(days=settings.secfin_insider_flow_window_days, label=""),
            caveats=_INSIDER_FLOW_CAVEATS,
        )
    return SectorInsiderFlow(
        group=group,
        group_label=sic2_label(group),
        peer_basis=peer_basis,
        as_of=row.as_of,
        window=InsiderFlowWindow(
            days=row.window_days,
            start=row.window_start,
            end=row.window_end,
            label=f"last {row.window_days} days",
        ),
        unit=row.unit,
        net=row.net,
        buys=row.buys,
        sells=row.sells,
        buy_count=row.buy_count,
        sell_count=row.sell_count,
        transaction_count=row.buy_count + row.sell_count,
        filer_count=row.filer_count,
        company_count=row.company_count,
        excluded_no_price_count=row.excluded_no_price_count,
        has_data=True,
        caveats=_INSIDER_FLOW_CAVEATS,
    )


# ---- Sector geographic revenue mix (ASC 280) (Sector Analytics v2, P6b) -------------------------
#
# A revenue-weighted domestic / international / other split for one SIC group -- a DERIVED aggregate
# summing individual companies' reported ASC 280 geographic revenue (a NEW dimensional-XBRL source;
# companyfacts has no dimensional facts). The domestic/international bucketing is a documented
# normalization of inconsistent filer geography labels, not a filer-reported field. A group with no
# company disclosing usable ASC 280 geography returns has_data=False (mix null) -- an honest N/A,
# never a fabricated 0%/100% split.
_GEO_MIX_CAVEATS = [
    "Sector geographic mix is a DERIVED, revenue-weighted aggregate -- it sums individual "
    "companies' reported ASC 280 geographic revenue; it is not a single reported figure.",
    "Coverage varies: not every company discloses ASC 280 geography, so the split reflects only "
    "the companies that did (see the coverage figure).",
    "Domestic vs international is our documented normalization of inconsistent filer geography "
    "labels (some report by country, some by region), not a field the filer reports directly.",
    "Companies whose geographic revenue does not reconcile to their consolidated revenue are "
    "excluded and counted, never mis-summed.",
]


@public_router.get(
    "/sectors/{group}/geographic-mix",
    response_model=SectorGeographicMix,
    tags=["Sectors"],
    summary="One sector's revenue-weighted domestic/international geographic mix (ASC 280)",
)
async def get_sector_geographic_mix(
    group: str,
    repo: SectorGeographicMixRepository = Depends(get_sector_geographic_mix_repo),
) -> SectorGeographicMix:
    """One SIC group's revenue-weighted domestic / international / other revenue mix.

    A **precomputed** read of `sector_geographic_mix` (the analytical/sector_geographic_mix.py batch
    is the sole producer; the live path never runs the aggregation -- CLAUDE.md guardrail 6). A
    DERIVED aggregate that sums individual companies' reported ASC 280 geographic revenue; the
    domestic/international bucketing is a documented normalization (normalize/segment_geography.py),
    not a filer-reported field. `has_data=False` (mix null) is a valid, honest result -- no company
    in the group disclosed usable ASC 280 geography, shown as N/A, never a fabricated 0%/100% split.
    """
    peer_basis = f"SIC {settings.secfin_peer_sic_digits}-digit"
    row = repo.get(group)
    if row is None:
        return SectorGeographicMix(
            group=group,
            group_label=sic2_label(group),
            peer_basis=peer_basis,
            caveats=_GEO_MIX_CAVEATS,
        )
    total = row.domestic + row.international + row.other
    # total > 0 is guaranteed by the batch (a covered company has a reconciled, positive geo total),
    # but guard anyway so a degenerate row can never divide-by-zero on the request path.
    mix = GeographicMixBuckets(
        domestic=row.domestic,
        international=row.international,
        other=row.other,
        domestic_share=(row.domestic / total) if total > 0 else 0.0,
        international_share=(row.international / total) if total > 0 else 0.0,
        other_share=(row.other / total) if total > 0 else 0.0,
    )
    return SectorGeographicMix(
        group=group,
        group_label=sic2_label(group),
        peer_basis=peer_basis,
        fiscal_year=row.fiscal_year,
        unit=row.unit,
        has_data=True,
        mix=mix,
        company_count=row.company_count,
        companies_in_scope=row.companies_in_scope,
        excluded_unreconciled_count=row.excluded_unreconciled_count,
        revenue_covered_share=row.revenue_covered_share,
        as_of=row.as_of,
        caveats=_GEO_MIX_CAVEATS,
    )


# ---- Per-company value list within a sector (Sector Analytics app, Company view) ---------------

_SECTOR_COMPANY_CAVEATS = _PEER_CAVEATS + [
    "Each row is one filer's own reported value for the metric; companies with an N/A or N/M value "
    "for this period are EXCLUDED, never shown as zero.",
    "`percentile` is a company's POSITION within its SIC peer group, not a good/bad verdict -- for "
    "a lower-is-better metric a lower value is more favorable (`higher_is_better` says which).",
]


@public_router.get(
    "/sectors/{group}/{metric}/companies",
    response_model=SectorCompanyValueList,
    tags=["Sectors"],
    summary="Per-company values within a SIC sector for one metric (the peer dot-cloud)",
)
async def get_sector_company_values(
    group: str,
    metric: str,
    year: int | None = Query(
        None, description="Fiscal year; defaults to the latest FY with values for the metric"
    ),
    period: FiscalPeriod = Query("FY", description="FY, Q1, Q2, Q3, or Q4"),
    repo: SectorCompanyRepository = Depends(get_sector_company_repo),
) -> SectorCompanyValueList:
    """Every company in the SIC group with a comparable value for one metric+period -- the data for
    the Company view's peer dot-cloud (each dot a filer, the focal company marked).

    A plain cache-aside read over the materialized `metric_values` (per-company values) joined to
    `company_profiles` (SIC membership + name) and `metric_ranks` (percentile) -- no DuckDB on the
    request path. N/A · N/M companies are EXCLUDED (never a zero row); a group below the minimum peer
    size returns an honest empty `companies` list. `percentile` is a POSITION, not a verdict.
    """
    if metric not in METRIC_KEYS:
        raise HTTPException(
            status_code=404,
            detail=f"Unknown metric '{metric}'. Valid metrics: {', '.join(METRIC_KEYS)}.",
        )
    resolved_year = year if year is not None else repo.latest_fy(metric)
    sic_digits = settings.secfin_peer_sic_digits
    rows = (
        repo.list_for_group_metric(group, sic_digits, metric, resolved_year, period)
        if resolved_year is not None
        else []
    )
    # A group below the minimum peer size is not comparable -- return an honest empty list rather
    # than a handful of dots (mirrors the below-min convention on /peers and /sectors/spreads).
    if len(rows) < settings.secfin_peer_min_size:
        rows = []
    companies = [
        SectorCompanyValue(cik=r.cik, name=r.name, value=r.value, percentile=r.percentile)
        for r in rows
    ]
    return SectorCompanyValueList(
        group=group,
        group_label=sic2_label(group),
        metric=metric,
        label=METRIC_LABELS.get(metric, metric),
        unit=METRIC_UNITS.get(metric, ""),
        higher_is_better=METRIC_DIRECTION.get(metric, True),
        fiscal_year=resolved_year or 0,
        fiscal_period=period,
        peer_basis=f"SIC {sic_digits}-digit",
        caveats=_SECTOR_COMPANY_CAVEATS,
        companies=companies,
    )


@public_router.get(
    "/companies/{symbol}/insider-trades",
    response_model=list[InsiderTransaction],
    tags=["Insider Trades"],
    summary="List Form 3/4/5 insider transactions for a company",
)
async def get_insider_trades(
    symbol: str,
    limit: int = Query(
        50, ge=1, le=200, description="Max number of Form 3/4/5 filings to fetch, newest first"
    ),
    ticker_cache: TickerCache = Depends(get_ticker_cache),
    insider_repo: InsiderTransactionRepository = Depends(get_insider_repo),
) -> list[InsiderTransaction]:
    """Insider transactions (Forms 3/4/5) for a company, most recent filings first.

    Cache-aside via `_insider_transactions_for_cik`: a request is served from SQLite only
    if at least `limit` filings are already cached for this issuer (a cache holding 10
    filings can't answer `limit=50`) -- otherwise it re-fetches from SEC (one
    submissions.json fetch plus one ownership-XML fetch per matching filing) and
    populates the cache. `limit` bounds the number of *filings*, not transaction rows --
    a single filing can contain several (see sec/insider.py).
    """
    async with SECClient() as client:
        cik = await _cik_from_symbol(client, ticker_cache, symbol)
        return await _insider_transactions_for_cik(insider_repo, client, cik, limit)


@router.get(
    "/companies/{symbol}/beneficial-ownership",
    tags=["Institutional Ownership"],
    summary="List Schedule 13D/13G beneficial-ownership (5%+) filings for a company",
    responses={
        200: {
            "content": {
                "application/json": {
                    "example": {
                        "cik": 320193,
                        "caveats": _BENEFICIAL_OWNERSHIP_CAVEATS,
                        "beneficial_ownership": [
                            {
                                "issuer_cik": 320193,
                                "issuer_name": "Apple Inc.",
                                "owner_name": "The Vanguard Group",
                                "form_type": "SCHEDULE 13G",
                                "percent_of_class": 8.3,
                                "shares_beneficially_owned": 1_310_000_000,
                                "event_date": "2025-08-08",
                                "filed": "2025-08-12",
                                "accession": "0000102909-25-012345",
                            }
                        ],
                    }
                }
            }
        }
    },
)
async def get_beneficial_ownership(
    symbol: str,
    limit: int = Query(
        50,
        ge=1,
        le=200,
        description="Max number of Schedule 13D/13G filings to fetch, newest first",
    ),
    ticker_cache: TickerCache = Depends(get_ticker_cache),
    beneficial_ownership_repo: BeneficialOwnershipRepository = Depends(
        get_beneficial_ownership_repo
    ),
) -> dict:
    """Beneficial-ownership positions (Schedule 13D/13G, 5%+ crossings) for a company,
    most recent filings first.

    Only modern structured-XML filings are parsed (from ~mid-2025 onward) -- legacy
    HTML/text filings are excluded, not scraped (CLAUDE.md rules out HTML parsing). A
    company whose 5%+ history predates the transition comes back with an empty
    `beneficial_ownership` list, not an error -- `caveats` is always present so that
    reads as "outside coverage window", not "nobody crossed 5%". See
    `docs/DATA_MODEL.md`'s "Coverage boundaries" section.

    Cache-aside via `_beneficial_ownership_for_cik`, same filing-granularity shape as
    `/insider-trades`: a request is served from SQLite only if at least `limit` filings
    are already cached for this issuer, otherwise it re-fetches from SEC and populates
    the cache. `limit` bounds the number of *filings*, not rows -- a jointly-filed
    Schedule 13D can produce several rows from one filing.
    """
    async with SECClient() as client:
        cik = await _cik_from_symbol(client, ticker_cache, symbol)
        owners = await _beneficial_ownership_for_cik(beneficial_ownership_repo, client, cik, limit)
    return {
        "cik": cik,
        "caveats": _BENEFICIAL_OWNERSHIP_CAVEATS,
        # The cover-page type CODE is what the filing carries; the human label is expanded here
        # rather than in the client so `TYPE_OF_REPORTING_PERSON` stays the one place that map
        # lives -- `_vector_payload` expands it the same way for the register's holders table.
        "beneficial_ownership": [
            {
                **o.model_dump(),
                "reporting_person_type_label": (
                    TYPE_OF_REPORTING_PERSON.get(o.type_of_reporting_person)
                    if o.type_of_reporting_person
                    else None
                ),
            }
            for o in owners
        ],
    }


# --- Institutional ownership (13F, 13D/G) ------------------------------------------
#
# NOTE: 13F is a quarter-end HOLDINGS SNAPSHOT, not transactions. The "buy/sell" view
# is DERIVED by diffing consecutive quarters (normalize/flows.py). Endpoints and their
# responses must make that explicit and carry the ~45-day-lag / long-only caveats.


@router.get(
    "/usage",
    response_model=UsageSummary,
    tags=["Account"],
    summary="Get your API key's tier, limits, and recent daily usage",
)
async def get_usage(
    days: int = Query(7, ge=1, le=90, description="Trailing days to include (default 7, max 90)"),
    record: ApiKeyRecord | None = Depends(require_api_key),
    api_key_repo: ApiKeyRepository = Depends(get_api_key_repo),
) -> UsageSummary:
    """Usage metering for the calling key -- the billing-relevant half of
    docs/ROADMAP.md's "Usage metering + subscription tiers" item (tiers themselves
    landed separately; see auth/tiers.py and the admin tier-change endpoint in
    api/admin_routes.py). `record` re-resolves the same `X-API-Key` header
    `require_api_key` already validated at `include_router` granularity -- FastAPI
    dedupes the call within one request, so this doesn't re-check the key twice.
    Gaps in the trailing window are filled with explicit zero-count days
    (`auth/usage.py`), not omitted, so this reads as a complete billing series.
    """
    # /usage is an account endpoint -- it needs a real key even from a browser (the
    # first-party bypass returns None). There's no usage without a key identity.
    if record is None:
        raise HTTPException(status_code=401, detail="Account usage requires an API key.")
    today = dt.datetime.now(dt.UTC).date()
    since_day = (today - dt.timedelta(days=days - 1)).isoformat()
    stored = api_key_repo.usage_by_day(record.id, since_day)
    return usage_summary(record, stored, days, today)


# Public: a transparency/coverage metric (not per-company paid data), and the shipped
# /coverage page reads it keyless -- keep it on the anonymous public_router.
@public_router.get(
    "/cusip-resolution-stats",
    response_model=CusipResolutionStats,
    tags=["Institutional Ownership"],
    summary="Get 13F CUSIP-to-company resolution coverage",
)
async def get_cusip_resolution_stats(
    cusip_repo: CusipMapRepository = Depends(get_cusip_repo),
) -> CusipResolutionStats:
    """Coverage snapshot for 13F CUSIP->CIK resolution (normalize/cusip.py).

    Exact-normalized-match-only resolution means "who holds X" views have holes
    proportional to `unresolved` here -- surfaced as a first-class metric so API
    consumers can gauge current institutional-ownership coverage. NOT a fixed
    ceiling: `resolution_rate` drifts upward over time as CUSIPs unresolved on one
    attempt match on a later one (see CusipResolutionStats' docstring).
    """
    return cusip_resolution_stats(cusip_repo)


_13F_DEADLINE_DAYS = 45  # a 13F-HR is due within 45 days of quarter-end (17 CFR 240.13f-1)


def _require_period(period: str) -> str:
    """Reject a malformed `period` at the edge, as a 400 -- never as a finding about the data.

    Every endpoint here takes a 13F quarter-end as an ISO date. Two wrong answers were possible
    without this, and both were live (found in QA, 2026-08-01):

      * `institutional-register` raised straight out of `date.fromisoformat` and returned a
        **bare 500**. A malformed client input is not a server fault, and a bare 500 is exactly
        what the upstream-error handlers exist to avoid.
      * The three §03 endpoints answered **200 with `status: "na"`** and a reason describing the
        filings -- "none of the 0 ingested filing(s) for this quarter carries a business
        location". That reports a typo as a fact about the register, which is the one thing the
        N/A vocabulary must never do.

    `institutional-activity` already had the right answer (400 with a message); this is that
    answer, shared.
    """
    try:
        dt.date.fromisoformat(period)
    except ValueError as e:
        raise HTTPException(
            status_code=400,
            detail=(
                f"period must be an ISO quarter-end date (YYYY-MM-DD); got {period!r}. "
                "Use /institutional-periods to list the quarters ingested for this issuer."
            ),
        ) from e
    return period


def _register_period_meta(holders: list[IssuerHolder], report_period: str) -> dict:
    """Freshness metadata for one quarter's ingested register.

    An issuer's register is assembled from MANY managers filing on DIFFERENT days, so there is
    no single "filed on" date -- reporting one would imply a single filing produced the
    register. Hence a RANGE (`filed_earliest`..`filed_latest`), with the deadline arithmetic
    anchored on the latest, which is the one that determines how stale the register is.

    `age_days` is computed here rather than client-side so the entity bar and the freshness
    strip cannot state different ages for the same register (STYLE_GUIDE rule 12).

    Honest zeros vs unknowns: `amendment_count` of 0 is a MEASURED zero (we ingested filings
    and none was an amendment) and stays 0. `filed_*`/`deadline`/`age_days` are None when no
    ingested filing carries a filed date -- never backfilled with today.
    """
    filed_dates = sorted(h.filed for h in holders if h.filed)
    # is_amendment is a snapshot-level flag repeated on every holding row, so count DISTINCT
    # managers, not rows -- otherwise a deep book inflates the amendment count.
    amendment_ciks = {h.manager_cik for h in holders if h.is_amendment}
    deadline = (
        dt.date.fromisoformat(report_period) + dt.timedelta(days=_13F_DEADLINE_DAYS)
    ).isoformat()
    filed_latest = filed_dates[-1] if filed_dates else None
    days_after = (
        (dt.date.fromisoformat(filed_latest) - dt.date.fromisoformat(report_period)).days
        if filed_latest
        else None
    )
    return {
        "as_of": report_period,
        "filed_earliest": filed_dates[0] if filed_dates else None,
        "filed_latest": filed_latest,
        "deadline": deadline,
        "deadline_days": _13F_DEADLINE_DAYS,
        "days_after_period_end": days_after,
        "within_deadline": (days_after <= _13F_DEADLINE_DAYS) if days_after is not None else None,
        "ingested_filer_count": len({h.manager_cik for h in holders}),
        "amendment_count": len(amendment_ciks),
        "age_days": (
            (dt.datetime.now(dt.UTC).date() - dt.date.fromisoformat(filed_latest)).days
            if filed_latest
            else None
        ),
    }


async def _cusips_for_issuer(cusip_repo: CusipMapRepository, cik: int) -> list[str]:
    """CUSIP(s) resolved to this issuer so far, or a 404 if none -- covers both "nobody
    has reported holding this issuer yet" and "its CUSIP hasn't been resolved yet"
    (see storage/cusip_repository.py's `cusips_for_cik` and
    /v1/cusip-resolution-stats for the aggregate coverage picture).
    """
    cusips = cusip_repo.cusips_for_cik(cik)
    if not cusips:
        raise HTTPException(
            status_code=404,
            detail=(
                f"No resolved CUSIP found for CIK {cik}. Either no manager has reported "
                "holding this issuer yet, or its CUSIP hasn't been resolved yet -- see "
                "GET /v1/cusip-resolution-stats for overall coverage."
            ),
        )
    return cusips


@router.get(
    "/companies/{symbol}/institutional-holders",
    tags=["Institutional Ownership"],
    summary="List institutional managers holding a company as of a 13F quarter-end",
    responses={
        200: {
            "content": {
                "application/json": {
                    "example": {
                        "cik": 320193,
                        "cusips": ["037833100"],
                        "period": "2024-06-30",
                        "caveats": _ISSUER_CENTRIC_CAVEATS,
                        "holders": [
                            {
                                "manager_cik": 1067983,
                                "manager_name": "Berkshire Hathaway Inc",
                                "cusip": "037833100",
                                "issuer_name": "Apple Inc.",
                                "shares": 300_000_000,
                                "value": 71_400_000_000,
                                "other_managers": [],
                            }
                        ],
                    }
                }
            }
        }
    },
)
async def get_institutional_holders(
    symbol: str,
    period: str = Query(..., description="Quarter-end, e.g. 2024-06-30"),
    ticker_cache: TickerCache = Depends(get_ticker_cache),
    cusip_repo: CusipMapRepository = Depends(get_cusip_repo),
    holdings_repo: HoldingsSnapshotRepository = Depends(get_holdings_repo),
) -> dict:
    """Managers holding this issuer as of a quarter-end, aggregated across ALL 13F
    filings for that quarter -- the issuer-centric inverse of
    `/managers/{manager_cik}/holdings`.

    Served live from the operational store (`HoldingsSnapshotRepository.holders_of`), a
    fast indexed point lookup by CUSIP -- not a precomputed cross-manager inversion (see
    `_ISSUER_CENTRIC_CAVEATS` and `docs/ARCHITECTURE.md` 3b for why that distinction
    matters for reading an empty result).
    """
    async with SECClient() as client:
        cik = await _cik_from_symbol(client, ticker_cache, symbol)
    cusips = await _cusips_for_issuer(cusip_repo, cik)
    holders = holdings_repo.holders_of(cusips, period)
    return {
        "cik": cik,
        "cusips": cusips,
        "period": period,
        "caveats": _ISSUER_CENTRIC_CAVEATS,
        "holders": holders,
    }


@router.get(
    "/companies/{symbol}/institutional-activity",
    tags=["Institutional Ownership"],
    summary="Get DERIVED institutional buy/sell activity for a company (13F diff)",
    responses={
        200: {
            "content": {
                "application/json": {
                    "example": {
                        "cik": 320193,
                        "cusips": ["037833100"],
                        "from_period": "2024-03-31",
                        "to_period": "2024-06-30",
                        "caveats": _ISSUER_CENTRIC_CAVEATS,
                        "activity": [
                            {
                                "manager_cik": 1067983,
                                "manager_name": "Berkshire Hathaway Inc",
                                "cusip": "037833100",
                                "issuer_name": "Apple Inc.",
                                "cik": 320193,
                                "from_period": "2024-03-31",
                                "to_period": "2024-06-30",
                                "shares_before": 320_000_000,
                                "shares_after": 300_000_000,
                                "shares_change": -20_000_000,
                                "action": "reduced",
                            }
                        ],
                    }
                }
            }
        }
    },
)
async def get_institutional_activity(
    symbol: str,
    period: str = Query(..., description="Current quarter-end, e.g. 2024-06-30"),
    include_unchanged: bool = Query(
        False, description="Include positions with no share change since the prior quarter"
    ),
    ticker_cache: TickerCache = Depends(get_ticker_cache),
    cusip_repo: CusipMapRepository = Depends(get_cusip_repo),
    holdings_repo: HoldingsSnapshotRepository = Depends(get_holdings_repo),
) -> dict:
    """DERIVED buy/sell activity for this issuer (current vs. prior quarter 13F diff),
    aggregated across ALL managers -- the issuer-centric inverse of
    `/managers/{manager_cik}/activity`.

    IMPORTANT: this is a COMPUTED result (`normalize/flows.diff_holders`) from two
    issuer-centric holder lists -- never reported trade data. `caveats` is always
    present; see CLAUDE.md's 13F section.
    """
    try:
        prior_period = prior_quarter_end(period)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e

    async with SECClient() as client:
        cik = await _cik_from_symbol(client, ticker_cache, symbol)
    cusips = await _cusips_for_issuer(cusip_repo, cik)

    current = holdings_repo.holders_of(cusips, period)
    prior = holdings_repo.holders_of(cusips, prior_period)
    deltas = diff_holders(
        current,
        prior,
        to_period=period,
        from_period=prior_period,
        include_unchanged=include_unchanged,
    )
    return {
        "cik": cik,
        "cusips": cusips,
        "from_period": prior_period,
        "to_period": period,
        "caveats": _ISSUER_CENTRIC_CAVEATS,
        "activity": deltas,
    }


@router.get(
    "/companies/{symbol}/institutional-activity-series",
    tags=["Institutional Ownership"],
    summary="DERIVED per-quarter holder-activity mix + latest-quarter share flow (13F diff)",
    responses={
        200: {
            "content": {
                "application/json": {
                    "example": {
                        "cik": 320193,
                        "cusips": ["037833100"],
                        "transitions": [
                            {
                                "from_period": "2024-09-30",
                                "to_period": "2024-12-31",
                                "counts": {"new": 12, "added": 40, "reduced": 33, "exited": 5},
                                "inflow_shares": 6_100_000.0,
                                "outflow_shares": 1_900_000.0,
                                "net_shares": 4_200_000.0,
                            }
                        ],
                        "caveats": _ACTIVITY_SERIES_CAVEATS,
                    }
                }
            }
        }
    },
)
async def get_institutional_activity_series(
    symbol: str,
    quarters: int = Query(6, ge=1, le=12, description="Max number of quarter-over-quarter bars"),
    ticker_cache: TickerCache = Depends(get_ticker_cache),
    cusip_repo: CusipMapRepository = Depends(get_cusip_repo),
    holdings_repo: HoldingsSnapshotRepository = Depends(get_holdings_repo),
) -> dict:
    """DERIVED holder-activity trend for this issuer over recent quarters.

    For each of the most recent ingested quarters, diffs it against its PRIOR CALENDAR
    quarter (`flows.diff_holders`, the same derivation `/institutional-activity` uses for a
    single quarter) and rolls the result up into per-action counts + share inflow/outflow
    (`flows.summarize_activity`). Feeds two views: a stacked bar of the new/added/reduced/
    exited mix over the quarters, and a latest-quarter inflow-vs-outflow flow.

    A quarter is included ONLY when its prior calendar quarter is itself ingested -- a diff
    against an un-ingested quarter would mislabel every holder as "new" (`diff_holders`'
    `prior=[]` convention), a phantom "everyone entered" spike. Such quarters are OMITTED
    (never a zero bar). So each transition is a genuine two-ingested-quarter diff, and the
    counts for a to-quarter equal `GET /institutional-activity?period=<that quarter>` grouped
    by action. `transitions` is oldest -> newest (chart axis order). An empty list is a valid
    result (fewer than two ingested quarters, or no adjacent ingested pair), not an error.

    Pure composition of the same live indexed point reads the tab already uses
    (`issuer_periods` + `holders_of`) -- no new store query, no DuckDB. These are DERIVED
    from REPORTED snapshots; see `caveats`.
    """
    async with SECClient() as client:
        cik = await _cik_from_symbol(client, ticker_cache, symbol)
    cusips = await _cusips_for_issuer(cusip_repo, cik)

    ingested = holdings_repo.issuer_periods(cusips)  # newest-first
    ingested_set = set(ingested)

    transitions: list[dict] = []
    for period in ingested:  # newest-first; we collect up to `quarters` then reverse
        if len(transitions) >= quarters:
            break
        try:
            prior_period = prior_quarter_end(period)
        except ValueError:
            continue  # not a recognized quarter-end; can't derive a prior
        if prior_period not in ingested_set:
            continue  # prior not ingested -> omit (diffing against nothing => false all-new)
        deltas = diff_holders(
            holdings_repo.holders_of(cusips, period),
            holdings_repo.holders_of(cusips, prior_period),
            to_period=period,
            from_period=prior_period,
        )
        summary = summarize_activity(deltas)
        transitions.append(
            {
                "from_period": prior_period,
                "to_period": period,
                "counts": {
                    "new": summary.new,
                    "added": summary.added,
                    "reduced": summary.reduced,
                    "exited": summary.exited,
                },
                "inflow_shares": summary.inflow_shares,
                "outflow_shares": summary.outflow_shares,
                "net_shares": summary.net_shares,
            }
        )

    transitions.reverse()  # oldest -> newest for the chart axis
    return {
        "cik": cik,
        "cusips": cusips,
        "transitions": transitions,
        "caveats": _ACTIVITY_SERIES_CAVEATS,
    }


@router.get(
    "/companies/{symbol}/institutional-periods",
    tags=["Institutional Ownership"],
    summary="List 13F quarter-ends with holdings data for a company (issuer axis)",
)
async def get_institutional_periods(
    symbol: str,
    ticker_cache: TickerCache = Depends(get_ticker_cache),
    cusip_repo: CusipMapRepository = Depends(get_cusip_repo),
    holdings_repo: HoldingsSnapshotRepository = Depends(get_holdings_repo),
) -> dict:
    """The quarter-ends for which some manager has reported holding this issuer, newest
    first -- the authoritative axis for the issuer-view period selector (mirrors
    `metric-periods` for Fundamentals). Feed one of these back as `period=` to
    `/institutional-holders` or `/institutional-activity`.

    An empty `periods` list is a valid result, not an error: it carries the same
    ambiguity as an empty holder list (`_ISSUER_CENTRIC_CAVEATS`) -- "no manager reported
    this issuer" vs. "no quarter ingested yet for any manager holding it".

    `period_meta` describes the NEWEST quarter's register: when it is as of, the range of
    dates its filings arrived, its statutory 45-day deadline and where the filings sit in
    that window, how many filers we ingested, and how many of those were amendments. It is
    the one source the freshness strip reads, so the age shown beside the register can never
    drift from the register itself (STYLE_GUIDE rule 12). `null` when no quarter is ingested
    -- never a zero-filled object.
    """
    async with SECClient() as client:
        cik = await _cik_from_symbol(client, ticker_cache, symbol)
    cusips = await _cusips_for_issuer(cusip_repo, cik)
    periods = holdings_repo.issuer_periods(cusips)
    return {
        "cik": cik,
        "cusips": cusips,
        "periods": periods,
        "period_meta": (
            _register_period_meta(holdings_repo.holders_of(cusips, periods[0]), periods[0])
            if periods
            else None
        ),
        "caveats": _ISSUER_CENTRIC_CAVEATS,
    }


def _reporting_person_types(owners: Iterable[BeneficialOwnership]) -> dict[str, str]:
    """{normalized reporting-person name: cover-page TYPE OF REPORTING PERSON code}.

    Schedules 13D/G carry the only entity self-classification anywhere in the ownership forms
    we ingest -- Form 13F has no strategy, style or type field at all. The code is the FILER's
    own declaration, from a fixed SEC set (`TYPE_OF_REPORTING_PERSON`).

    Matched by name, and only by an EXACT match after normalization, because a 13D/G names its
    reporting persons in text and carries no CIK for them (the accession's filer CIK is the
    submitter, which on a jointly-filed 13D is one of several persons and can be an agent).
    Same conservative posture as `normalize/cusip.py`'s issuer resolution: a near-match is not
    a match, and an unmatched manager gets no type rather than a guessed one.

    Newest filing wins when the same person appears on several -- consistent with the
    latest-filed rule everywhere else.
    """
    out: dict[str, str] = {}
    for o in sorted(owners, key=lambda o: (o.filed or "", o.accession or "")):
        if o.owner_name and o.type_of_reporting_person:
            out[normalize_issuer_name(o.owner_name)] = o.type_of_reporting_person
    return out


def _vector_payload(
    vector: ShareVector,
    limit: int,
    types: dict[str, str] | None = None,
    sic_by_cik: dict[int, str | None] | None = None,
) -> list[dict]:
    """The ranked share vector, trimmed for transport.

    The concentration figures are computed over the WHOLE vector server-side; only the rows
    shipped for charting are trimmed. So a chart drawn from `top` never changes what the tiles
    beside it mean -- the same reason the holders table paginates without moving its totals.

    `reporting_person_type` is joined here rather than in the client so the name-matching rule
    lives in one place and the API owns it (no raw SQL or matching logic in the UI). It is
    `None` for any manager that has not filed a 13D/G -- which is most of them, because that
    only happens above 5%.
    """
    types = types or {}
    sic_by_cik = sic_by_cik or {}
    rows = []
    for r in vector.rows[:limit]:
        code = types.get(normalize_issuer_name(r.manager_name or ""))
        sic = sic_by_cik.get(r.manager_cik)
        category = classify_manager_sic(sic)
        rows.append(
            {
                "manager_cik": r.manager_cik,
                "manager_name": r.manager_name,
                "shares": r.shares,
                "weight": r.weight,
                "cumulative": r.cumulative,
                "reporting_person_type": code,
                "reporting_person_type_label": TYPE_OF_REPORTING_PERSON.get(code) if code else None,
                "sic": sic,
                "registrant_category": category,
                "registrant_category_label": CATEGORY_LABELS.get(category) if category else None,
            }
        )
    return rows


@router.get(
    "/companies/{symbol}/institutional-register",
    tags=["Institutional Ownership"],
    summary="Concentration of one quarter's ingested 13F register (DERIVED)",
)
async def get_institutional_register(
    symbol: str,
    period: str = Query(..., description="13F quarter-end, e.g. 2026-03-31"),
    top: int = Query(25, ge=1, le=100, description="How many ranked holders to return"),
    ticker_cache: TickerCache = Depends(get_ticker_cache),
    cusip_repo: CusipMapRepository = Depends(get_cusip_repo),
    holdings_repo: HoldingsSnapshotRepository = Depends(get_holdings_repo),
    bo_repo: BeneficialOwnershipRepository = Depends(get_beneficial_ownership_repo),
    profile_repo: CompanyProfileRepository = Depends(get_company_profile_repo),
) -> dict:
    """How concentrated one quarter's ingested 13F register is -- **derived, not reported**.

    Nobody files a Herfindahl index. This computes one, plus the effective holder count, a
    Gini coefficient, top-1/5/10 shares and "how many managers hold half the register", over
    the filers we have ingested for `period`. Every figure carries `status`, `reason`,
    `formula`, `population` and `cannot` (what it does NOT tell you) -- see
    `normalize/register.py`.

    **The base is reported 13F shares across INGESTED filers.** It is NOT a percentage of
    shares outstanding, NOT the company's shareholder register, and NOT all institutional
    ownership: 13F is long-only, quarter-end, and only covers managers over $100M who have
    been ingested here. `status="na"` with a reason (never a 0, never a fabricated figure)
    when fewer than two filers report a share count.

    `share_vector` is the same ranked vector the concentration figures are computed from, so a
    cumulative-share chart and the tiles beside it can never disagree (STYLE_GUIDE rule 12).

    A live indexed point read (`holders_of`) -- no DuckDB, no batch job (guardrail 6).
    """
    async with SECClient() as client:
        cik = await _cik_from_symbol(client, ticker_cache, symbol)
    cusips = await _cusips_for_issuer(cusip_repo, cik)
    holders = holdings_repo.holders_of(cusips, _require_period(period))
    vector = share_vector(holders)
    conc = concentration(vector)
    types = _reporting_person_types(bo_repo.get_beneficial_ownership(cik, _BO_TYPE_LOOKBACK))
    # Joined on the manager's OWN CIK -- exact, so none of the name-matching caveats that apply
    # to the 13D/G reporting-person type apply here. A manager with no profile row simply has no
    # SIC, and `composition` counts it as unclassified rather than folding it into "other".
    sic_by_cik = {
        r.manager_cik: (p.sic if (p := profile_repo.get(r.manager_cik)) else None)
        for r in vector.rows
    }
    comp = composition(vector, sic_by_cik)
    return {
        "cik": cik,
        "cusips": cusips,
        "period": period,
        "period_meta": _register_period_meta(holders, period),
        "concentration": asdict(conc),
        "composition": asdict(comp),
        "share_vector": _vector_payload(vector, top, types, sic_by_cik),
        "share_vector_total_rows": vector.holder_count,
        "excluded_holder_count": vector.excluded_count,
        "total_reported_shares": vector.total_shares,
        "caveats": _CONVICTION_CAVEATS,
    }


@router.get(
    "/companies/{symbol}/institutional-register-shape",
    tags=["Institutional Ownership"],
    summary="Register turnover, holder tenure and stable-capital share (DERIVED)",
)
async def get_institutional_register_shape(
    symbol: str,
    quarters: int = Query(9, ge=2, le=20, description="How many recent ingested quarters"),
    ticker_cache: TickerCache = Depends(get_ticker_cache),
    cusip_repo: CusipMapRepository = Depends(get_cusip_repo),
    holdings_repo: HoldingsSnapshotRepository = Depends(get_holdings_repo),
) -> dict:
    """How the register CHANGES: who comes and goes, how long they stay, how much is long-held.

    Three **derived** views over the recent ingested quarters, returned together because they
    all consume the identical multi-quarter read -- splitting them would triple the work for
    one dataset:

    * `turnover` -- managers entering and exiting vs the prior quarter. An "exit" means the
      manager left the *ingested* register, which also happens when it drops under the $100M
      threshold or simply has not been ingested. **It is not evidence of a sale.**
    * `tenure` -- consecutive quarters each manager has held, counting back from the newest
      quarter, plus cohort rows and the median. Bounded by how many quarters we hold, so it is
      a **floor, not a history**; a mid-series gap ends a streak and a gap can be a coverage gap.
    * `stable_capital` -- the register weighted by tenure (8+ quarters 1.0, 4-7 0.5, 2-3 0.25).
      The weights ship in the payload so the reader can see the weighting, not just its output.

    Same live indexed loop as `/institutional-holdings-series` (`issuer_periods` +
    `holders_of` per quarter) -- no DuckDB, no batch job (guardrail 6).
    """
    async with SECClient() as client:
        cik = await _cik_from_symbol(client, ticker_cache, symbol)
    cusips = await _cusips_for_issuer(cusip_repo, cik)
    periods = holdings_repo.issuer_periods(cusips)[:quarters]
    by_period = {p: holdings_repo.holders_of(cusips, p) for p in periods}

    newest = periods[0] if periods else None
    prior = periods[1] if len(periods) > 1 else None
    return {
        "cik": cik,
        "cusips": cusips,
        "periods": periods,
        "turnover": asdict(
            turnover(
                by_period.get(newest, []) if newest else [],
                by_period.get(prior) if prior else None,
                to_period=newest or "",
                from_period=prior,
            )
        ),
        "tenure": asdict(tenure(by_period)),
        "retention": asdict(retention(by_period)),
        "stable_capital": asdict(stable_capital_share(by_period)),
        "caveats": _ISSUER_CENTRIC_CAVEATS,
    }


@router.get(
    "/companies/{symbol}/institutional-filed-since",
    tags=["Institutional Ownership"],
    summary="Ownership filings accepted since a quarter's 13F register was assembled",
)
async def get_institutional_filed_since(
    symbol: str,
    period: str = Query(..., description="13F quarter-end the register is as of"),
    ticker_cache: TickerCache = Depends(get_ticker_cache),
    cusip_repo: CusipMapRepository = Depends(get_cusip_repo),
    holdings_repo: HoldingsSnapshotRepository = Depends(get_holdings_repo),
    insider_repo: InsiderTransactionRepository = Depends(get_insider_repo),
    beneficial_repo: BeneficialOwnershipRepository = Depends(get_beneficial_ownership_repo),
) -> dict:
    """Ownership filings that arrived AFTER a quarter's 13F register was assembled.

    A 13F register is ~45 days stale the day it lands. Faster forms -- Schedule 13D/G and
    Forms 3/4/5 -- keep arriving after it. This lists them so a reader can see what has
    happened since, **without pretending to know the register's new share count.**

    ## It deliberately does NOT restate the register

    `does_not_restate` is always `true`, and `does_not_restate_reason` says why: a Schedule
    13D/G reports a **total** beneficial position, a Form 4 reports a **transaction**, and a
    13F reports a **quarter-end holding** by a different population of filers. Adding them
    onto a 13F base would produce a share count **nobody filed** -- so no adjusted total is
    returned here, or anywhere. The count of filings is real; an "adjusted register" is not.

    Rows are ordered newest-filed first and each carries its form, filer, what it reported and
    its **filed date**. That date is a filing DATE, not an EDGAR acceptance timestamp -- we do
    not store acceptance timestamps (V3-P3), so nothing here may be labelled "accepted".

    An empty list is a real answer for the insider side, but on the 13D/G side it is ambiguous
    (nothing filed vs. a window predating the ~mid-2025 structured-XML floor) -- `caveats`
    carries that, and it never means nobody crossed 5%.
    """
    async with SECClient() as client:
        cik = await _cik_from_symbol(client, ticker_cache, symbol)
    cusips = await _cusips_for_issuer(cusip_repo, cik)
    meta = _register_period_meta(holdings_repo.holders_of(cusips, _require_period(period)), period)
    since = meta["filed_latest"]

    rows: list[dict] = []
    if since:
        for o in beneficial_repo.filings_since(cik, since):
            rows.append(
                {
                    "form": o.form_type,
                    "filer": o.owner_name,
                    "reported": "beneficial stake",
                    "percent_of_class": o.percent_of_class,
                    "shares": o.shares_beneficially_owned,
                    "shares_are": "total position held",
                    "filed": o.filed,
                }
            )
        for t in insider_repo.transactions_since(cik, since):
            rows.append(
                {
                    "form": f"Form {t.form_type}" if t.form_type else None,
                    "filer": t.owner_name,
                    "reported": (
                        "holding"
                        if t.is_holding
                        else {"A": "acquired", "D": "disposed"}.get(t.acquired_disposed or "")
                        or "reported"
                    ),
                    "percent_of_class": None,
                    "shares": t.shares,
                    "shares_are": "single transaction, not a position",
                    "filed": t.filed,
                }
            )
        rows.sort(key=lambda r: (r["filed"] or ""), reverse=True)

    return {
        "cik": cik,
        "cusips": cusips,
        "period": period,
        "register_filed_latest": since,
        "filings": rows,
        "filing_count": len(rows),
        "does_not_restate": True,
        "does_not_restate_reason": (
            "A Schedule 13D/G reports a total beneficial position, a Form 4 reports a single "
            "transaction, and a 13F reports a quarter-end holding by a different population of "
            "filers. Summing them onto the 13F base would invent a share count nobody filed, so "
            "no adjusted register total is derived here."
        ),
        "dates_are": (
            "filing dates, not EDGAR acceptance timestamps -- acceptance timestamps are not "
            "stored yet (V3-P3)"
        ),
        "caveats": _ISSUER_CENTRIC_CAVEATS + _BENEFICIAL_OWNERSHIP_CAVEATS,
    }


@router.get(
    "/companies/{symbol}/institutional-holdings-series",
    tags=["Institutional Ownership"],
    summary="Reported 13F shares held per manager over recent quarters (issuer axis)",
    responses={
        200: {
            "content": {
                "application/json": {
                    "example": {
                        "cik": 320193,
                        "cusips": ["037833100"],
                        "periods": ["2024-06-30", "2024-03-31"],
                        "caveats": _HOLDINGS_SERIES_CAVEATS,
                        "series": [
                            {
                                "manager_cik": 1067983,
                                "manager_name": "Berkshire Hathaway Inc",
                                "cusip": "037833100",
                                "issuer_name": "Apple Inc.",
                                "points": [
                                    {"period": "2024-06-30", "shares": 300_000_000,
                                     "value": 71_400_000_000},
                                    {"period": "2024-03-31", "shares": 320_000_000,
                                     "value": 68_000_000_000},
                                ],
                            }
                        ],
                    }
                }
            }
        }
    },
)
async def get_institutional_holdings_series(
    symbol: str,
    quarters: int = Query(8, ge=1, le=20, description="How many recent ingested quarters"),
    ticker_cache: TickerCache = Depends(get_ticker_cache),
    cusip_repo: CusipMapRepository = Depends(get_cusip_repo),
    holdings_repo: HoldingsSnapshotRepository = Depends(get_holdings_repo),
) -> dict:
    """Reported quarter-end shares held by each manager in this issuer, across the most
    recent `quarters` ingested quarters -- the time axis the accumulation chart stacks.

    Pure composition of the same issuer-centric point reads the tab already uses
    (`issuer_periods` + `holders_of`, both live indexed lookups) -- no new store query, no
    DuckDB. A manager absent in a quarter simply has no point for it (an honest gap: not
    reported/ingested, not a zero position). These are REPORTED snapshots; the period-over-
    period change a reader infers from them is DERIVED -- see `caveats`.
    """
    async with SECClient() as client:
        cik = await _cik_from_symbol(client, ticker_cache, symbol)
    cusips = await _cusips_for_issuer(cusip_repo, cik)

    periods = holdings_repo.issuer_periods(cusips)[:quarters]
    # Assemble per-(manager, cusip) point series. Keyed the same way flows.diff_holders keys
    # its diff -- (manager_cik, cusip) -- so a multi-class issuer's classes stay distinct.
    series: dict[tuple[int, str], dict] = {}
    for period in periods:
        for h in holdings_repo.holders_of(cusips, period):
            key = (h.manager_cik, h.cusip)
            entry = series.get(key)
            if entry is None:
                entry = {
                    "manager_cik": h.manager_cik,
                    "manager_name": h.manager_name,
                    "cusip": h.cusip,
                    "issuer_name": h.issuer_name,
                    "points": [],
                }
                series[key] = entry
            entry["points"].append({"period": period, "shares": h.shares, "value": h.value})
    return {
        "cik": cik,
        "cusips": cusips,
        "periods": periods,
        "caveats": _HOLDINGS_SERIES_CAVEATS,
        "series": list(series.values()),
    }


@router.get(
    "/companies/{symbol}/institutional-holder-geography",
    tags=["Institutional Ownership"],
    summary="Where the 13F filers holding a company are headquartered (issuer axis)",
    responses={
        200: {
            "content": {
                "application/json": {
                    "example": {
                        "cik": 320193,
                        "cusips": ["037833100"],
                        "period": "2024-06-30",
                        "caveats": _HOLDER_GEOGRAPHY_CAVEATS,
                        "by_state": [
                            {"state": "NE", "filer_count": 1, "value": 71_400_000_000}
                        ],
                        "outside_states": {"filer_count": 0, "value": 0.0},
                        "unknown": {"filer_count": 0, "value": 0.0},
                    }
                }
            }
        }
    },
)
async def get_institutional_holder_geography(
    symbol: str,
    period: str = Query(..., description="Quarter-end, e.g. 2024-06-30"),
    ticker_cache: TickerCache = Depends(get_ticker_cache),
    cusip_repo: CusipMapRepository = Depends(get_cusip_repo),
    holdings_repo: HoldingsSnapshotRepository = Depends(get_holdings_repo),
) -> dict:
    """The 13F filers holding this issuer as of `period`, bucketed by their reported
    business address -- the choropleth's data.

    `by_state` counts distinct filers (and sums their reported value) per US state/DC code;
    `outside_states` aggregates any non-state code (foreign OR a US territory `albers-usa`
    can't draw); `unknown` aggregates filers whose snapshot predates location tracking.
    Nothing is dropped. IMPORTANT (see `caveats`): the location is the filer's registered
    BUSINESS ADDRESS -- not where its capital originates, not the company's location.

    A small Python aggregation over one issuer's holders (`holders_of`, a live indexed
    point read) -- never a DuckDB cross-manager scan (guardrail 6).
    """
    async with SECClient() as client:
        cik = await _cik_from_symbol(client, ticker_cache, symbol)
    cusips = await _cusips_for_issuer(cusip_repo, cik)

    holders = holdings_repo.holders_of(cusips, period)
    # Per-state: distinct filers (a manager can hold >1 class -> >1 row, but is one filer)
    # plus a value sum across all their rows for this issuer. Off-map / unknown buckets the
    # same way. `value` is summed only where reported (never invented from a None).
    by_state: dict[str, dict] = {}
    outside_managers: set[int] = set()
    outside_value = 0.0
    unknown_managers: set[int] = set()
    unknown_value = 0.0
    for h in holders:
        bucket = classify_location(h.location)
        val = h.value if isinstance(h.value, (int, float)) and h.value > 0 else 0.0
        if bucket == "state":
            code = h.location.strip().upper()
            state = by_state.setdefault(code, {"state": code, "_managers": set(), "value": 0.0})
            state["_managers"].add(h.manager_cik)
            state["value"] += val
        elif bucket == "other":
            outside_managers.add(h.manager_cik)
            outside_value += val
        else:
            unknown_managers.add(h.manager_cik)
            unknown_value += val

    by_state_out = sorted(
        (
            {"state": s["state"], "filer_count": len(s["_managers"]), "value": s["value"]}
            for s in by_state.values()
        ),
        key=lambda s: (-s["filer_count"], s["state"]),
    )
    return {
        "cik": cik,
        "cusips": cusips,
        "period": period,
        "caveats": _HOLDER_GEOGRAPHY_CAVEATS,
        "by_state": by_state_out,
        "outside_states": {"filer_count": len(outside_managers), "value": outside_value},
        "unknown": {"filer_count": len(unknown_managers), "value": unknown_value},
    }


# Peer-overlap caveats. The overlap ITSELF is reported (two 13Fs each name their issuer); what
# is derived is the framing -- who counts as a peer, and whether a shared holder means anything.
_PEER_OVERLAP_CAVEATS = _ISSUER_CENTRIC_CAVEATS + [
    "A shared holder is not a shared view -- broad-market index funds report nearly every "
    "large issuer, so high overlap usually reflects index construction, not conviction.",
    "The matrix is deliberately ASYMMETRIC: each cell is a share of the ROW issuer's managers, "
    "so a small register overlapping a large one reads high one way and low the other.",
    "Peers are companies sharing this company's SIC industry prefix, ranked by the size of "
    "their own INGESTED 13F register -- a coverage-dependent choice, not a judgment about "
    "which companies compete.",
]

# Domicile caveats. Same underlying field as the choropleth, different question: the choropleth
# buckets for a map (50 states + DC vs everything else); this RANKS places by shares.
_DOMICILE_CAVEATS = _ISSUER_CENTRIC_CAVEATS + [
    "Domicile is the filing manager's registered BUSINESS ADDRESS from its 13F cover page -- "
    "not where its capital originates, not where its assets are managed, not the company's "
    "location.",
    "Inside the US the ranking is by state and elsewhere by country, so the rows are not the "
    "same kind of place -- deliberate, because a US-state breakdown is what the register "
    "supports and a world region is not.",
    "Filers whose location we do not hold are reported as a coverage gap, never folded into a "
    "'rest of world' row and never counted as zero.",
]

# Share-attribution caveats. The load-bearing one is the first: these rows DO NOT ADD UP.
_ATTRIBUTION_CAVEATS = _13F_CAVEATS + [
    "These rows do NOT sum and are NOT exhaustive -- a holder above 5% files both a 13F and a "
    "Schedule 13D/G, and a 10% owner is also an insider, so the same shares appear twice. "
    "There is deliberately no total.",
    "Each row is measured on its own date (13F at quarter-end and ~45 days stale; Forms 3/4/5 "
    "within two business days of a trade; 13D/G ten days after crossing 5%), against shares "
    "outstanding reported on a cover date of its own.",
    "What no filing accounts for is deliberately NOT shown: a remainder of five "
    "differently-dated numbers is not a measurement.",
]

# How many SIC-group companies to consider before picking peers. A cap on the CANDIDATE scan,
# not on the peer count -- the candidates are then ranked by ingested register size (one counting
# read), and only the winners get a holder-list read.
_PEER_CANDIDATE_CAP = 120

# How many recent insider rows to read for the attribution figure. Only the NEWEST row per
# (owner, security, ownership form) counts -- a position is a state, not an event -- so this is
# a window wide enough to reach every current insider's latest filing, not a history.
_ATTRIBUTION_INSIDER_LOOKBACK = 400


def _shares_outstanding(facts: list[RawFact]) -> tuple[float | None, str | None, str | None]:
    """The company's most recently reported shares outstanding: (value, as_of, tag).

    An INSTANT fact, so the latest `instant` wins; ties break on the latest `filed`, which is the
    repo-wide restatement rule (CLAUDE.md). Returns `(None, None, None)` rather than a zero when
    the company has no such fact ingested -- a missing denominator is not a company with no
    shares.
    """
    wanted = set(candidate_tags("shares_outstanding"))
    usable = [
        f
        for f in facts
        if f.gaap_tag in wanted and f.instant and isinstance(f.value, (int, float)) and f.value > 0
    ]
    if not usable:
        return None, None, None
    best = max(usable, key=lambda f: (f.instant or "", f.filed or ""))
    return float(best.value), best.instant, best.gaap_tag




# Supply-event caveats. The load-bearing one is the first: this is filing METADATA, and an
# absence is only ever an absence over the window we indexed.
_SUPPLY_CAVEATS = [
    "This reports which filings EXIST and when -- never what they say. A registration statement "
    "establishes which shares may be resold; it does not say a sale occurred, how many shares "
    "it covers, or on what terms.",
    "An absence is scoped to the indexed window, which is EDGAR's rolling recent-filings list "
    "and not a company's whole history. 'None on file' means none among the filings we read.",
    "Lock-up terms live in an underwriting-agreement exhibit -- free text this product does not "
    "parse -- so no count here answers whether a lock-up is in force.",
    "Acceptance lag measures when EDGAR accepted a filing relative to the period it reports on. "
    "The statutory 13F deadline is 45 days, so a register is never complete before then.",
]

# How many indexed filings to read for the supply summary. The index is per-company metadata, so
# this is a bounded read over one company's rows, not a scan.
_SUPPLY_LOOKBACK = 400

# The 13F form tokens the acceptance-lag histogram measures. Amendments count: a 13F-HR/A is a
# filing that arrived when it arrived, and excluding it would flatter the lag.
_13F_FORMS = ["13F-HR", "13F-HR/A"]


@router.get(
    "/companies/{symbol}/filing-index",
    tags=["Institutional Ownership"],
    summary="Supply-side filings that exist for a company, and EDGAR acceptance lag",
)
async def get_filing_index(
    symbol: str,
    period: str | None = Query(None, description="13F quarter-end to measure acceptance lag at"),
    ticker_cache: TickerCache = Depends(get_ticker_cache),
    cusip_repo: CusipMapRepository = Depends(get_cusip_repo),
    holdings_repo: HoldingsSnapshotRepository = Depends(get_holdings_repo),
    filing_repo: FilingIndexRepository = Depends(get_filing_index_repo),
) -> dict:
    """Which share-supply filings a company has on file, and how late its filings are accepted.

    Both halves come from the SAME indexed metadata -- form, filing date, acceptance timestamp,
    accession -- read from `/submissions/` by `ingest/filing_index_backfill.py`. **No filing
    document is fetched or parsed here.**

    ## An absence is only honest once we have looked

    The point of this endpoint is the difference between *"no tender offer on file"* and *"no
    tender offer among the 400 filings we indexed, which run from X to Y"*. Only the second is
    something we know. When nothing has been indexed for a company, `supply.status` is `"na"`
    with a reason -- **never a confident zero**, because a count of nothing over nothing is not
    a finding.

    ## Existence and dates, never terms

    A registration statement establishes which shares MAY be resold; it does not say a sale
    occurred, how many shares it covers, or how long any lock-up runs. Lock-up length lives in an
    underwriting-agreement exhibit -- free text, Track 2, deliberately not parsed. `cannot` says
    so and a caller must not soften it.

    A bounded read over one company's indexed rows. No DuckDB, no document fetch.
    """
    async with SECClient() as client:
        cik = await _cik_from_symbol(client, ticker_cache, symbol)
    entries = filing_repo.get_filings(cik, None, _SUPPLY_LOOKBACK)
    indexed = filing_repo.indexed_count(cik)
    covered_from, covered_to = filing_repo.indexed_window(cik)

    # ⚠ The acceptance-lag histogram is over the MANAGERS' 13F-HR filings, not the issuer's own.
    # A 13F is filed by the manager; reading the issuer's index for it would measure Forms 4 and
    # 10-Qs -- different statutory deadlines, so a different and meaningless distribution. (Caught
    # on real data: AAPL's own filings gave a 2-day median, which is the Form 4 rule, not the 13F
    # one.) Bounded to the filers of the quarter being described.
    manager_ciks: list[int] = []
    if period:
        cusips = await _cusips_for_issuer(cusip_repo, cik)
        manager_ciks = sorted({h.manager_cik for h in holdings_repo.holders_of(cusips, period)})
    lag_entries = (
        filing_repo.filings_for_ciks(manager_ciks, _13F_FORMS, period) if manager_ciks else []
    )
    indexed_managers = sum(1 for m in manager_ciks if filing_repo.indexed_count(m))

    return {
        "cik": cik,
        "indexed_count": indexed,
        "covered_from": covered_from,
        "covered_to": covered_to,
        "supply": asdict(
            supply_events(
                entries,
                indexed_count=indexed,
                covered_from=covered_from,
                covered_to=covered_to,
            )
        ),
        "acceptance_lag": asdict(acceptance_lag(lag_entries, period_end=period)),
        # How much of the register we could actually measure. A histogram over 3 of 1,600 filers
        # is a statement about those 3, and the caller has to be able to say so.
        "lag_population": {
            "manager_count": len(manager_ciks),
            "indexed_manager_count": indexed_managers,
        },
        "caveats": _SUPPLY_CAVEATS,
    }


@router.get(
    "/companies/{symbol}/institutional-holder-domicile",
    tags=["Institutional Ownership"],
    summary="Where a company's 13F filers file from, ranked by reported shares (DERIVED)",
)
async def get_institutional_holder_domicile(
    symbol: str,
    period: str = Query(..., description="13F quarter-end, e.g. 2026-03-31"),
    ticker_cache: TickerCache = Depends(get_ticker_cache),
    cusip_repo: CusipMapRepository = Depends(get_cusip_repo),
    holdings_repo: HoldingsSnapshotRepository = Depends(get_holdings_repo),
) -> dict:
    """The register ranked by where its managers file from -- US states, then countries.

    The companion to `/institutional-holder-geography`, not a replacement for it. That one
    buckets the same raw `stateOrCountry` code for a CHOROPLETH, which can draw the 50 states
    and DC and nothing else, so every foreign filer lands in one `outside_states` bucket. This
    one answers a ranking question instead, so it resolves each code to its place through
    EDGAR's own published code table (`normalize/edgar_locations.py`) and rolls foreign filers
    up by country.

    Weighted by reported SHARES, not filer count: fifty small managers in one state are not a
    bigger presence than one large one.

    `prior` is the same ranking one quarter earlier, for the tick on each bar. A place absent
    from that quarter has `prior_weight: null` -- it was not there, which is not 0%.

    Locations are backfilled separately (`ingest/location_backfill.py`), so a volume where that
    has not run returns `status: "na"` with a reason. That is missing coverage, never a register
    without a domicile.

    A live indexed point read (`holders_of`, twice) plus a pure grouping -- no DuckDB
    (guardrail 6).
    """
    async with SECClient() as client:
        cik = await _cik_from_symbol(client, ticker_cache, symbol)
    cusips = await _cusips_for_issuer(cusip_repo, cik)

    _require_period(period)
    try:
        prior_period: str | None = prior_quarter_end(period)
    except ValueError:
        prior_period = None
    prior_holders = holdings_repo.holders_of(cusips, prior_period) if prior_period else []

    result = domicile(holdings_repo.holders_of(cusips, period), prior_holders or None)
    return {
        "cik": cik,
        "cusips": cusips,
        "period": period,
        "prior_period": prior_period,
        "domicile": asdict(result),
        "caveats": _DOMICILE_CAVEATS,
    }


@router.get(
    "/companies/{symbol}/institutional-share-attribution",
    tags=["Institutional Ownership"],
    summary="Shares reported by each ownership filing family, vs shares outstanding (DERIVED)",
)
async def get_institutional_share_attribution(
    symbol: str,
    period: str = Query(..., description="13F quarter-end, e.g. 2026-03-31"),
    ticker_cache: TickerCache = Depends(get_ticker_cache),
    fact_repo: RawFactRepository = Depends(get_repo),
    cusip_repo: CusipMapRepository = Depends(get_cusip_repo),
    holdings_repo: HoldingsSnapshotRepository = Depends(get_holdings_repo),
    insider_repo: InsiderTransactionRepository = Depends(get_insider_repo),
    beneficial_repo: BeneficialOwnershipRepository = Depends(get_beneficial_ownership_repo),
) -> dict:
    """How many shares each ownership filing family reports holding, against shares outstanding.

    Three rows -- 13F-reported institutional, insider & affiliate (Forms 3/4/5), and 5%-plus
    beneficial stakes (Schedules 13D/G) -- each measured on ITS OWN date and divided by the
    company's own most recently reported `shares outstanding`.

    ## There is no total, and there is no residual row

    The rows are **not disjoint**: a holder above 5% files a 13F *and* a 13D/G, and a 10% owner
    is also an insider, so the same shares legitimately appear twice. Adding them would
    double-count real holders, which is why no total is returned -- and why a caller must not
    render them as a stacked bar summing to 100%.

    An earlier design carried a fourth "unreported residual" row (shares outstanding minus the
    rest). It is deliberately gone: it is the only row that is a *subtraction* rather than a
    measurement, and a remainder of differently-dated numbers is a figure nobody filed. Same
    reasoning that keeps an "adjusted register" off this view entirely.

    Derivative rows (options, RSUs, warrants) are EXCLUDED from the insider figure -- their
    share counts are underlying shares of instruments that are not owned stock. Rows cached
    before that flag existed count as unknown and are excluded too, with the count surfaced in
    the row's `reason` so the figure reads as the floor it is.

    Live cache-aside reads (`holders_of`, the insider and 13D/G caches, the fact store) plus a
    pure computation -- no DuckDB (guardrail 6).
    """
    async with SECClient() as client:
        cik = await _cik_from_symbol(client, ticker_cache, symbol)
        facts = await _facts_for_cik(fact_repo, client, cik)
    cusips = await _cusips_for_issuer(cusip_repo, cik)

    vector = share_vector(holdings_repo.holders_of(cusips, _require_period(period)))
    outstanding, outstanding_as_of, outstanding_tag = _shares_outstanding(facts)
    result = share_attribution(
        institutional_shares=vector.total_shares or None,
        institutional_holder_count=vector.holder_count or None,
        institutional_as_of=period,
        insider_rows=insider_repo.get_insider_transactions(cik, _ATTRIBUTION_INSIDER_LOOKBACK),
        beneficial_rows=beneficial_repo.get_beneficial_ownership(cik, _BO_TYPE_LOOKBACK),
        shares_outstanding=outstanding,
        shares_outstanding_as_of=outstanding_as_of,
        shares_outstanding_tag=outstanding_tag,
    )
    return {
        "cik": cik,
        "cusips": cusips,
        "period": period,
        "attribution": asdict(result),
        "caveats": _ATTRIBUTION_CAVEATS,
    }


async def _peer_labels(
    client: SECClient,
    ticker_cache: TickerCache,
    cusip_repo: CusipMapRepository,
    holdings_repo: HoldingsSnapshotRepository,
    profile_repo: CompanyProfileRepository,
    cik: int,
    period: str,
    peers: int,
) -> dict:
    """Pick this company's peers and look up a symbol for each.

    Candidates are the SIC group (the same axis `analytical/peer_ranks.py` groups on), then
    ranked by the size of their OWN ingested 13F register -- one counting read over every
    candidate's CUSIPs, rather than a full holder list each. A candidate with no resolved CUSIP
    cannot be identified in the 13F data at all and is skipped, not shown empty.

    Tickers come last, for LABELLING only: a matrix axis has room for "NVDA" and not for
    "NVIDIA CORPORATION", and a truncated registrant name identifies nothing. Peers are reached
    by CIK, so the symbol has to be looked back up -- one pass over the already-cached ticker
    map, no extra SEC request.
    """
    candidates = profile_repo.sic_group_peers(
        cik, settings.secfin_peer_sic_digits, _PEER_CANDIDATE_CAP
    )
    cusips_by_cik = cusip_repo.cusips_for_ciks([c.cik for c in candidates])
    counts = holdings_repo.distinct_holder_counts(
        [cu for group in cusips_by_cik.values() for cu in group], period
    )
    ranked = sorted(
        (
            (sum(counts.get(cu, 0) for cu in cusips_by_cik.get(c.cik, [])), c)
            for c in candidates
            if cusips_by_cik.get(c.cik)
        ),
        key=lambda pair: (-pair[0], pair[1].cik),
    )
    selected = [profile for size, profile in ranked if size > 0][:peers]
    return {
        "selected": selected,
        "cusips_by_cik": cusips_by_cik,
        "tickers": await ticker_cache.tickers_for(client, [p.cik for p in selected]),
    }


@router.get(
    "/companies/{symbol}/institutional-peer-overlap",
    tags=["Institutional Ownership"],
    summary="Which managers report this company AND its industry peers (DERIVED framing)",
)
async def get_institutional_peer_overlap(
    symbol: str,
    period: str = Query(..., description="13F quarter-end, e.g. 2026-03-31"),
    peers: int = Query(5, ge=1, le=8, description="How many peer issuers to compare against"),
    top: int = Query(5, ge=1, le=25, description="How many of this company's holders to list"),
    ticker_cache: TickerCache = Depends(get_ticker_cache),
    cusip_repo: CusipMapRepository = Depends(get_cusip_repo),
    holdings_repo: HoldingsSnapshotRepository = Depends(get_holdings_repo),
    profile_repo: CompanyProfileRepository = Depends(get_company_profile_repo),
) -> dict:
    """Manager overlap between this company's 13F register and its industry peers'.

    Returns the asymmetric overlap matrix, the exclusive combinations behind an UpSet plot, and
    this company's largest holders with the peers each also reports.

    ## What is reported and what is derived

    That a manager reported two issuers in the same quarter is stated outright by that manager's
    own 13F -- this intersects sets of filers, it does not infer a relationship. What IS derived
    is the framing: which companies count as peers, and whether a shared holder means anything.
    `cannot` carries both, and the honest reading of a high cell is usually index construction.

    ## How the peers are chosen, and why that is a choice

    Candidates are companies sharing this company's SIC prefix (`secfin_peer_sic_digits`, the
    same axis `analytical/peer_ranks.py` groups on), capped at a candidate scan. They are then
    ranked by **the size of their own ingested 13F register** and the largest are kept. That is
    coverage-dependent by construction: a peer nobody has ingested cannot be compared, so it is
    absent rather than shown empty. `peer_basis` says this in words, on the payload.

    Bounded and live: one `holders_of` for this company, one batched CUSIP read, one counting
    read to rank candidates, then one `holders_of` per selected peer -- indexed point reads of
    the same character as `/institutional-co-holding`, NOT the whole-quarter cross-manager scan
    reserved for DuckDB (guardrail 6).
    """
    async with SECClient() as client:
        cik = await _cik_from_symbol(client, ticker_cache, symbol)
        cusips = await _cusips_for_issuer(cusip_repo, cik)
        focus_holders = holdings_repo.holders_of(cusips, _require_period(period))
        peer_tickers = await _peer_labels(
            client, ticker_cache, cusip_repo, holdings_repo, profile_repo, cik, period, peers
        )
        selected = peer_tickers["selected"]
        cusips_by_cik = peer_tickers["cusips_by_cik"]
        tickers = peer_tickers["tickers"]
    focus_vector = share_vector(focus_holders)

    managers_by_issuer: dict[int, set[int]] = {
        cik: {h.manager_cik for h in focus_holders},
    }
    labels: dict[int, str] = {cik: symbol.upper()}
    names: dict[int, str | None] = {cik: None}
    for profile in selected:
        peer_holders = holdings_repo.holders_of(cusips_by_cik.get(profile.cik, []), period)
        managers_by_issuer[profile.cik] = {h.manager_cik for h in peer_holders}
        # Ticker where we have one, the registrant's own name otherwise. Never a bare CIK.
        labels[profile.cik] = tickers.get(profile.cik) or profile.name or str(profile.cik)
        names[profile.cik] = profile.name

    result = peer_overlap(
        cik,
        managers_by_issuer,
        labels=labels,
        names=names,
        focus_weights={r.manager_cik: r.weight for r in focus_vector.rows},
        focus_names={r.manager_cik: r.manager_name for r in focus_vector.rows},
        top_holders=top,
        peer_basis=(
            f"companies sharing this company's {settings.secfin_peer_sic_digits}-digit SIC "
            "prefix, ranked by the size of their own ingested 13F register for this quarter"
        ),
    )
    return {
        "cik": cik,
        "cusips": cusips,
        "period": period,
        "overlap": asdict(result),
        "caveats": _PEER_OVERLAP_CAVEATS,
    }


@router.get(
    "/companies/{symbol}/institutional-conviction",
    tags=["Institutional Ownership"],
    summary="Each 13F filer's share of the ingested institutional (13F) shares of a company",
    responses={
        200: {
            "content": {
                "application/json": {
                    "example": {
                        "cik": 320193,
                        "cusips": ["037833100"],
                        "period": "2024-06-30",
                        "caveats": _CONVICTION_CAVEATS,
                        "pool_total_shares": 2_250_000_000,
                        "ingested_filer_count": 3,
                        "holders": [
                            {
                                "manager_cik": 102909,
                                "manager_name": "Vanguard Group Inc",
                                "issuer_name": "Apple Inc.",
                                "shares": 1_330_000_000,
                                "weight": 0.591,
                                "status": "ok",
                                "reason": None,
                            }
                        ],
                        "other_ingested": {
                            "filer_count": 1,
                            "shares": 280_000_000,
                            "weight": 0.124,
                        },
                        "na_filers": [
                            {
                                "manager_cik": 1067983,
                                "manager_name": "Berkshire Hathaway Inc",
                                "reason": "reported no share count for one or more of its "
                                "common-equity positions",
                            }
                        ],
                    }
                }
            }
        }
    },
)
async def get_institutional_conviction(
    symbol: str,
    period: str = Query(..., description="Quarter-end, e.g. 2024-06-30"),
    top: int = Query(20, ge=1, le=50, description="How many top filers to show as squares"),
    ticker_cache: TickerCache = Depends(get_ticker_cache),
    cusip_repo: CusipMapRepository = Depends(get_cusip_repo),
    holdings_repo: HoldingsSnapshotRepository = Depends(get_holdings_repo),
) -> dict:
    """For this company's 13F filers as of `period`, each filer's share of the TOTAL 13F shares held
    across all INGESTED filers -- the institutional-holder treemap's data.

    `weight = (this filer's reported 13F common shares) / (Σ common shares across ALL ingested
    filers of the company, this quarter)`. Only **SH-equity** rows count -- option (put/call) and
    principal (PRN) rows are excluded, since their "shares" are notional/debt, not share ownership.
    The denominator is the whole ingested pool (`pool_total_shares`), so a shown filer's share is
    its slice of the pool, not of the visible subset. A pure `holders_of` composition -- no
    companyfacts read, no DuckDB, no cross-manager scan.

    **Honesty (see `caveats`):** this is share of the *ingested* 13F shares -- NOT the company's
    shares outstanding, NOT % of the company owned, NOT all institutional ownership. It is
    coverage-dependent (more ingested filers shrink each share). 13F shares are those a manager has
    investment DISCRETION over (often client funds), not the firm's own beneficial ownership.

    Filers beyond the top-`top` are aggregated into `other_ingested` (a minority "other ingested
    filers" tile); a filer that reported an equity position but no share count is excluded from the
    pool and listed in `na_filers` -- never a fabricated 0.
    """
    async with SECClient() as client:
        cik = await _cik_from_symbol(client, ticker_cache, symbol)
        cusips = await _cusips_for_issuer(cusip_repo, cik)

        # Per filer: sum of SH-equity shares of the issuer. Option (put/call) rows are notional and
        # PRN rows are debt -- both skipped, so a manager holding ONLY those is not a common-equity
        # holder and never enters the pool. `has_null` flags a filer that reported an equity
        # position but left its share count blank (stake unknown -> excluded from the pool, N/A).
        per_manager: dict[int, dict] = {}
        for h in holdings_repo.holders_of(cusips, period):
            if h.put_call is not None or h.shares_or_principal == "PRN":
                continue
            entry = per_manager.get(h.manager_cik)
            if entry is None:
                entry = {
                    "manager_cik": h.manager_cik,
                    "manager_name": h.manager_name,
                    "issuer_name": h.issuer_name,
                    "shares": 0.0,
                    "has_null": False,
                }
                per_manager[h.manager_cik] = entry
            if isinstance(h.shares, (int, float)):
                entry["shares"] += h.shares
            else:
                entry["has_null"] = True

    # A filer counts toward the pool only with a positive, fully-reported SH share count; the rest
    # are N/A (excluded from the denominator, never zero-filled). Denominator is the WHOLE pool.
    valued = sorted(
        (m for m in per_manager.values() if not m["has_null"] and m["shares"] > 0),
        key=lambda m: -m["shares"],
    )
    na = [m for m in per_manager.values() if m["has_null"] or m["shares"] <= 0]
    pool_total = sum(m["shares"] for m in valued)

    holders = []
    other_ingested = None
    if pool_total > 0:
        holders = [
            {
                "manager_cik": m["manager_cik"],
                "manager_name": m["manager_name"],
                "issuer_name": m["issuer_name"],
                "shares": m["shares"],
                "weight": m["shares"] / pool_total,
                "status": "ok",
                "reason": None,
            }
            for m in valued[:top]
        ]
        rest = valued[top:]
        if rest:
            rest_shares = sum(m["shares"] for m in rest)
            other_ingested = {
                "filer_count": len(rest),
                "shares": rest_shares,
                "weight": rest_shares / pool_total,
            }

    na_filers = [
        {
            "manager_cik": m["manager_cik"],
            "manager_name": m["manager_name"],
            "reason": "reported no share count for one or more of its common-equity positions",
        }
        for m in na
    ]
    return {
        "cik": cik,
        "cusips": cusips,
        "period": period,
        "caveats": _CONVICTION_CAVEATS,
        "pool_total_shares": pool_total if pool_total > 0 else None,
        "ingested_filer_count": len(valued),
        "holders": holders,
        "other_ingested": other_ingested,
        "na_filers": na_filers,
    }


@router.get(
    "/companies/{symbol}/institutional-co-holding",
    tags=["Institutional Ownership"],
    summary="Network of a company's 13F holders linked by overlap in their OTHER holdings",
    responses={
        200: {
            "content": {
                "application/json": {
                    "example": {
                        "cik": 320193,
                        "cusips": ["037833100"],
                        "period": "2024-06-30",
                        "caveats": _COHOLDING_CAVEATS,
                        "min_overlap": 0.1,
                        "nodes": [
                            {
                                "manager_cik": 102909,
                                "manager_name": "Vanguard Group Inc",
                                "shares": 1_330_000_000,
                                "other_holdings_count": 3200,
                            },
                            {
                                "manager_cik": 93751,
                                "manager_name": "State Street Corp",
                                "shares": 640_000_000,
                                "other_holdings_count": 2800,
                            },
                        ],
                        "edges": [
                            {
                                "source": 93751,
                                "target": 102909,
                                "jaccard": 0.62,
                                "shared_count": 2100,
                            }
                        ],
                    }
                }
            }
        }
    },
)
async def get_institutional_co_holding(
    symbol: str,
    period: str = Query(..., description="Quarter-end, e.g. 2024-06-30"),
    top: int = Query(25, ge=2, le=50, description="How many top holders to graph as nodes"),
    min_overlap: float = Query(
        0.1, ge=0.0, le=1.0, description="Minimum Jaccard overlap to draw an edge"
    ),
    ticker_cache: TickerCache = Depends(get_ticker_cache),
    cusip_repo: CusipMapRepository = Depends(get_cusip_repo),
    holdings_repo: HoldingsSnapshotRepository = Depends(get_holdings_repo),
) -> dict:
    """A network of this company's 13F holders (nodes) linked by the OVERLAP in their OTHER reported
    holdings (edges) -- the co-holding graph's data.

    Nodes are the top-`top` holders by reported stake in this company (node size). An edge between
    two holders is the **Jaccard overlap of their other-holdings CUSIP sets** (this company's own
    CUSIPs excluded), drawn when it clears `min_overlap`. A DERIVED structural overlap -- NOT
    coordinated or timed trading, no style labels (see `caveats`).

    Bounded and live: `holders_of` (top-`top`) + one bounded `manager_cusip_sets` read + pairwise
    Jaccard in Python -- NOT a DuckDB cross-manager scan (guardrail 6). A holder that shares no
    other names is an honest isolated node (still listed in `nodes`, with no edge). Thin/empty is
    the UI's honest-state call.
    """
    async with SECClient() as client:
        cik = await _cik_from_symbol(client, ticker_cache, symbol)
    cusips = await _cusips_for_issuer(cusip_repo, cik)

    # Nodes: dedup holders to one per manager (sum shares across classes), largest stake first,
    # capped to `top`. holders_of already orders by shares DESC.
    per_manager: dict[int, dict] = {}
    for h in holdings_repo.holders_of(cusips, period):
        entry = per_manager.get(h.manager_cik)
        if entry is None:
            entry = {"manager_cik": h.manager_cik, "manager_name": h.manager_name, "shares": 0.0}
            per_manager[h.manager_cik] = entry
        if isinstance(h.shares, (int, float)):
            entry["shares"] += h.shares
    top_managers = list(per_manager.values())[:top]

    # Edges: each node manager's full CUSIP set (bounded read), minus this company's own CUSIPs,
    # then pairwise Jaccard. `other_holdings_count` is the size of that other-names set (tooltip).
    issuer_cusips = set(cusips)
    sets = holdings_repo.manager_cusip_sets([m["manager_cik"] for m in top_managers], period)
    edges = co_holding_edges(sets, issuer_cusips, min_overlap)

    nodes = [
        {
            "manager_cik": m["manager_cik"],
            "manager_name": m["manager_name"],
            "shares": m["shares"],
            "other_holdings_count": len(sets.get(m["manager_cik"], set()) - issuer_cusips),
        }
        for m in top_managers
    ]
    return {
        "cik": cik,
        "cusips": cusips,
        "period": period,
        "caveats": _COHOLDING_CAVEATS,
        "min_overlap": min_overlap,
        "nodes": nodes,
        "edges": [e._asdict() for e in edges],
    }


@router.get(
    "/managers/{manager_cik}/holdings",
    response_model=HoldingsSnapshot,
    tags=["Institutional Ownership"],
    summary="Get one manager's full 13F holdings snapshot for a quarter",
)
async def get_manager_holdings(
    manager_cik: int,
    period: str = Query(..., description="Quarter-end, e.g. 2024-06-30"),
    resolver: CusipResolver = Depends(get_cusip_resolver),
    holdings_repo: HoldingsSnapshotRepository = Depends(get_holdings_repo),
) -> HoldingsSnapshot:
    """One manager's full 13F holdings snapshot for a quarter.

    This is a reported point-in-time SNAPSHOT, not trade data -- see
    /managers/{manager_cik}/activity for DERIVED buy/sell vs. the prior quarter, and its
    caveats (long-only, ~45-day filing lag) apply here too.
    """
    async with SECClient() as client:
        snapshot = await _manager_snapshot(holdings_repo, client, manager_cik, period)
        await resolve_snapshot_cusips(client, resolver, snapshot)
    return snapshot


@router.get(
    "/managers/{manager_cik}/activity",
    tags=["Institutional Ownership"],
    summary="Get DERIVED buy/sell activity for one manager (13F diff)",
    responses={
        200: {
            "content": {
                "application/json": {
                    "example": {
                        "manager_cik": 1067983,
                        "manager_name": "Berkshire Hathaway Inc",
                        "from_period": "2024-03-31",
                        "to_period": "2024-06-30",
                        "caveats": _13F_CAVEATS,
                        "activity": [
                            {
                                "manager_cik": 1067983,
                                "manager_name": "Berkshire Hathaway Inc",
                                "cusip": "037833100",
                                "issuer_name": "Apple Inc.",
                                "cik": 320193,
                                "from_period": "2024-03-31",
                                "to_period": "2024-06-30",
                                "shares_before": 320_000_000,
                                "shares_after": 300_000_000,
                                "shares_change": -20_000_000,
                                "action": "reduced",
                            }
                        ],
                    }
                }
            }
        }
    },
)
async def get_manager_activity(
    manager_cik: int,
    period: str = Query(..., description="Current quarter-end, e.g. 2024-06-30"),
    include_unchanged: bool = Query(
        False, description="Include positions with no share change since the prior quarter"
    ),
    resolver: CusipResolver = Depends(get_cusip_resolver),
    holdings_repo: HoldingsSnapshotRepository = Depends(get_holdings_repo),
) -> dict:
    """DERIVED buy/sell activity for one manager: current 13F vs. the prior quarter's.

    IMPORTANT: this is a COMPUTED result (normalize/flows.diff_snapshots) from two 13F
    holdings snapshots -- never reported trade data. `caveats` is always present in the
    response; see CLAUDE.md's 13F section for why.
    """
    try:
        prior_period = prior_quarter_end(period)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e

    async with SECClient() as client:
        current = await _manager_snapshot(holdings_repo, client, manager_cik, period)
        try:
            prior = await _manager_snapshot(holdings_repo, client, manager_cik, prior_period)
        except HTTPException:
            # No filing for the prior quarter (e.g. the manager's first 13F) -- every
            # current position is then "new", per flows.diff_snapshots' own handling.
            prior = None

        await resolve_snapshot_cusips(client, resolver, current)
        if prior is not None:
            await resolve_snapshot_cusips(client, resolver, prior)

    deltas = diff_snapshots(current, prior, include_unchanged=include_unchanged)
    return {
        "manager_cik": manager_cik,
        "manager_name": current.manager_name,
        "from_period": None if prior is None else prior.report_period,
        "to_period": current.report_period,
        "caveats": _13F_CAVEATS,
        "activity": deltas,
    }


@router.get(
    "/managers/{manager_cik}/periods",
    tags=["Institutional Ownership"],
    summary="List 13F quarter-ends with holdings data for a manager (manager axis)",
)
async def get_manager_periods(
    manager_cik: int,
    holdings_repo: HoldingsSnapshotRepository = Depends(get_holdings_repo),
) -> dict:
    """The quarter-ends for which this manager has a cached 13F snapshot, newest first --
    the authoritative axis for the manager-profile period selector. Feed one of these back
    as `period=` to `/managers/{manager_cik}/holdings` or `.../activity`.

    Served straight from the operational store (no SEC call): an empty list means nothing
    has been ingested for this manager yet, NOT that the manager never filed. See
    `_13F_CAVEATS` for the standing snapshot caveats.
    """
    return {
        "manager_cik": manager_cik,
        "periods": holdings_repo.manager_periods(manager_cik),
        "caveats": _13F_CAVEATS,
    }


# --- Cross-company screening (Milestone 4) -----------------------------------------
#
# Built on the SEC `frames` API (one GAAP tag across ALL filers for one period) rather
# than a home-grown query language -- see CLAUDE.md's scope note on why this stays a
# bounded set of typed filters, not an open-ended query DSL. `ingest/frames_backfill.py`
# seeds `raw_facts` with frames-sourced rows (tagged with the exact SEC frame string,
# `RawFact.frame`); this endpoint is a live read against that data via
# `RawFactRepository.screen()` -- a plain indexed SQLite query, not DuckDB (see
# docs/ARCHITECTURE.md 3b: frames scale is far below the 13F-inversion workload that
# justified DuckDB there).

# One (min, max) filter pair per screenable concept -- kept as an explicit, small map
# rather than dynamically generated Query params, so FastAPI/OpenAPI can describe each
# one individually. Extending SCREENABLE_CONCEPTS (normalize/screening.py) means adding
# a pair here too.
_SCREEN_FILTER_CONCEPTS = SCREENABLE_CONCEPTS

ScreenFilters = dict[str, tuple[float | None, float | None]]


def _run_screen(
    repo: RawFactRepository, fiscal_year: int, fiscal_period: FiscalPeriod, filters: ScreenFilters
) -> tuple[set[int], dict[str, dict[int, float]]]:
    """DB-only screening core, no SECClient dependency -- testable without network
    (same "extract the testable piece, keep the route thin" shape as `_facts_for_cik`/
    `_manager_snapshot`). `filters` must already be non-empty. Returns the matching CIKs
    (AND across every concept in `filters`) plus each concept's full per-CIK value map,
    so the route can report a matching company's values for concepts beyond the one(s)
    that happened to filter it.
    """
    per_concept_values: dict[str, dict[int, float]] = {}
    matching: set[int] = set()
    for i, (concept, (lo, hi)) in enumerate(filters.items()):
        frame_period = frame_period_for_concept(concept, fiscal_year, fiscal_period)
        rows = repo.screen(candidate_tags(concept), frame_period)
        values = resolve_concept_values(rows, concept)
        per_concept_values[concept] = values
        concept_matches = {
            cik
            for cik, val in values.items()
            if (lo is None or val >= lo) and (hi is None or val <= hi)
        }
        matching = concept_matches if i == 0 else (matching & concept_matches)
    return matching, per_concept_values


@router.get(
    "/screen",
    tags=["Screening"],
    summary="Filter companies by financial-concept thresholds for one period",
    responses={
        200: {
            "content": {
                "application/json": {
                    "example": {
                        "fiscal_year": 2023,
                        "fiscal_period": "FY",
                        "concepts_screened": ["revenue"],
                        "caveats": _FRAMES_CAVEATS,
                        "results": [
                            {
                                "cik": 320193,
                                "entity_name": "Apple Inc.",
                                "values": {"revenue": 383285000000},
                            }
                        ],
                    }
                }
            }
        }
    },
)
async def screen_companies(
    fiscal_year: int = Query(..., description="Calendar year, e.g. 2023"),
    fiscal_period: FiscalPeriod = Query("FY", description="FY, Q1, Q2, Q3, or Q4"),
    revenue_min: float | None = Query(None, description="Minimum revenue (USD)"),
    revenue_max: float | None = Query(None, description="Maximum revenue (USD)"),
    net_income_min: float | None = Query(None, description="Minimum net income (USD)"),
    net_income_max: float | None = Query(None, description="Maximum net income (USD)"),
    total_assets_min: float | None = Query(None, description="Minimum total assets (USD)"),
    total_assets_max: float | None = Query(None, description="Maximum total assets (USD)"),
    total_liabilities_min: float | None = Query(
        None, description="Minimum total liabilities (USD)"
    ),
    total_liabilities_max: float | None = Query(
        None, description="Maximum total liabilities (USD)"
    ),
    stockholders_equity_min: float | None = Query(
        None, description="Minimum stockholders' equity (USD)"
    ),
    stockholders_equity_max: float | None = Query(
        None, description="Maximum stockholders' equity (USD)"
    ),
    cash_and_equivalents_min: float | None = Query(
        None, description="Minimum cash and equivalents (USD)"
    ),
    cash_and_equivalents_max: float | None = Query(
        None, description="Maximum cash and equivalents (USD)"
    ),
    repo: RawFactRepository = Depends(get_repo),
    ticker_cache: TickerCache = Depends(get_ticker_cache),
) -> dict:
    """Cross-company screening for one fiscal period, e.g. "revenue > $10B".

    Bounded, structured filters only (`{concept}_min`/`{concept}_max` over
    `normalize.screening.SCREENABLE_CONCEPTS`) -- AND semantics across concepts, no
    OR/nesting and no free-form query string, deliberately: this is a scoped MVP, not
    the open-ended "screening query language" CLAUDE.md flags as a separate, later
    decision. Requires at least one filter. `caveats` is always present -- see
    `_FRAMES_CAVEATS` for the calendar-alignment and extension-tag coverage gaps
    specific to frames-sourced data.
    """
    filters = {
        "revenue": (revenue_min, revenue_max),
        "net_income": (net_income_min, net_income_max),
        "total_assets": (total_assets_min, total_assets_max),
        "total_liabilities": (total_liabilities_min, total_liabilities_max),
        "stockholders_equity": (stockholders_equity_min, stockholders_equity_max),
        "cash_and_equivalents": (cash_and_equivalents_min, cash_and_equivalents_max),
    }
    active = {c: (lo, hi) for c, (lo, hi) in filters.items() if lo is not None or hi is not None}
    if not active:
        raise HTTPException(
            status_code=400,
            detail=(
                "At least one filter is required. Screenable concepts: "
                f"{', '.join(_SCREEN_FILTER_CONCEPTS)}."
            ),
        )

    matching, per_concept_values = _run_screen(repo, fiscal_year, fiscal_period, active)

    results = []
    async with SECClient() as client:
        for cik in sorted(matching):
            entity_name = await ticker_cache.resolve_name(client, cik)
            results.append(
                {
                    "cik": cik,
                    "entity_name": entity_name,
                    "values": {
                        c: per_concept_values[c][cik]
                        for c in active
                        if cik in per_concept_values[c]
                    },
                }
            )

    return {
        "fiscal_year": fiscal_year,
        "fiscal_period": fiscal_period,
        "concepts_screened": list(active.keys()),
        "caveats": _FRAMES_CAVEATS,
        "results": results,
    }


# --- Cross-company concept listing (Milestone 4) -----------------------------------
#
# The rank/browse complement to /screen above: no min/max thresholds, just every
# reporting company's value for one concept+period, sorted and capped at `limit`. Same
# frames-sourced data (`RawFactRepository.screen()`), same coverage caveats
# (_FRAMES_CAVEATS) -- narrower in a different direction than /screen: one concept only,
# but no filter-and-match required, e.g. "top 10 companies by revenue this quarter."


def _list_concept(
    repo: RawFactRepository,
    concept: str,
    fiscal_year: int,
    fiscal_period: FiscalPeriod,
    sort: str,
    limit: int,
) -> list[tuple[int, float]]:
    """DB-only listing core, no SECClient dependency -- same "extract the testable
    piece" shape as `_run_screen`. Returns up to `limit` (cik, value) pairs sorted by
    value, ascending or descending.
    """
    frame_period = frame_period_for_concept(concept, fiscal_year, fiscal_period)
    rows = repo.screen(candidate_tags(concept), frame_period)
    values = resolve_concept_values(rows, concept)
    ordered = sorted(values.items(), key=lambda item: item[1], reverse=(sort == "desc"))
    return ordered[:limit]


@router.get(
    "/concepts/{concept}",
    tags=["Screening"],
    summary="List/rank companies by one financial concept for one period",
    responses={
        200: {
            "content": {
                "application/json": {
                    "example": {
                        "concept": "revenue",
                        "fiscal_year": 2023,
                        "fiscal_period": "FY",
                        "caveats": _FRAMES_CAVEATS,
                        "results": [
                            {
                                "cik": 104169,
                                "entity_name": "Walmart Inc.",
                                "value": 648125000000,
                            },
                            {"cik": 320193, "entity_name": "Apple Inc.", "value": 383285000000},
                        ],
                    }
                }
            }
        }
    },
)
async def list_concept_values(
    concept: str,
    fiscal_year: int = Query(..., description="Calendar year, e.g. 2023"),
    fiscal_period: FiscalPeriod = Query("FY", description="FY, Q1, Q2, Q3, or Q4"),
    sort: str = Query("desc", pattern="^(asc|desc)$", description="Sort by value"),
    limit: int = Query(100, ge=1, le=500, description="Max companies to return"),
    repo: RawFactRepository = Depends(get_repo),
    ticker_cache: TickerCache = Depends(get_ticker_cache),
) -> dict:
    """List every reporting company's value for one canonical concept + fiscal period,
    sorted and capped at `limit` -- e.g. "top 10 companies by revenue this quarter."

    The rank/browse complement to `GET /screen`: no thresholds, just a ranked list over
    one of `normalize.screening.SCREENABLE_CONCEPTS`. `caveats` is always present -- see
    `_FRAMES_CAVEATS` (same coverage gaps `/screen` carries, since both read the same
    frames-sourced data).
    """
    if concept not in SCREENABLE_CONCEPTS:
        raise HTTPException(
            status_code=404,
            detail=(
                f"Unknown concept: {concept!r}. Screenable concepts: "
                f"{', '.join(SCREENABLE_CONCEPTS)}."
            ),
        )

    ranked = _list_concept(repo, concept, fiscal_year, fiscal_period, sort, limit)

    results = []
    async with SECClient() as client:
        for cik, value in ranked:
            entity_name = await ticker_cache.resolve_name(client, cik)
            results.append({"cik": cik, "entity_name": entity_name, "value": value})

    return {
        "concept": concept,
        "fiscal_year": fiscal_year,
        "fiscal_period": fiscal_period,
        "caveats": _FRAMES_CAVEATS,
        "results": results,
    }

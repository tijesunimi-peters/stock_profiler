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

from fastapi import APIRouter, Depends, HTTPException, Query, Request

from secfin.api.auth import get_api_key_repo, require_api_key
from secfin.auth.models import ApiKeyRecord, UsageSummary
from secfin.auth.usage import usage_summary
from secfin.normalize.cusip import CusipResolver, cusip_resolution_stats, resolve_snapshot_cusips
from secfin.normalize.flows import diff_holders, diff_snapshots, prior_quarter_end
from secfin.normalize.schema import (
    BeneficialOwnership,
    CusipResolutionStats,
    FiscalPeriod,
    HoldingsSnapshot,
    InsiderTransaction,
    RawFact,
    Statement,
    StatementType,
)
from secfin.normalize.statements import available_periods, build_statement
from secfin.sec.client import SECClient
from secfin.sec.companyfacts import fetch_raw_facts
from secfin.sec.insider import fetch_insider_transactions_with_filings
from secfin.sec.institutional import fetch_13f_snapshot, fetch_beneficial_ownership_with_filings
from secfin.sec.ticker_cache import TickerCache
from secfin.storage.api_key_repository import ApiKeyRepository
from secfin.storage.beneficial_ownership_repository import BeneficialOwnershipRepository
from secfin.storage.cusip_repository import CusipMapRepository
from secfin.storage.holdings_repository import HoldingsSnapshotRepository
from secfin.storage.insider_repository import InsiderTransactionRepository
from secfin.storage.repository import RawFactRepository

# `public_router` holds the two read-only endpoints the public Data Explorer
# (`/explorer`, static/explorer.js) calls directly from browser JS with no API key --
# `GET .../statements/{statement}` and `GET .../periods` below. Everything else lives on
# `router`, which api/main.py includes with `Depends(require_api_key)`. Keep this split
# deliberate: a new endpoint defaults to gated (`router`) unless it's specifically meant
# to be part of the public demo surface. See api/auth.py.
public_router = APIRouter()
router = APIRouter()

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
    """Cache-aside read: SQLite if we have it, else fetch SEC live and populate it."""
    cached = repo.get_raw_facts(cik)
    if cached:
        return cached
    facts = await fetch_raw_facts(client, cik)
    if facts:
        repo.upsert_raw_facts(facts)
    return facts


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


@public_router.get("/companies/{symbol}/statements/{statement}", response_model=Statement)
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
        facts = await _facts_for_cik(repo, client, cik)
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


@public_router.get("/companies/{symbol}/periods")
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


@router.get("/companies/{symbol}/insider-trades", response_model=list[InsiderTransaction])
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


@router.get("/companies/{symbol}/beneficial-ownership")
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
        "beneficial_ownership": owners,
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
    days: int = Query(
        7, ge=1, le=90, description="Trailing days to include (default 7, max 90)"
    ),
    record: ApiKeyRecord = Depends(require_api_key),
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
    today = dt.datetime.now(dt.UTC).date()
    since_day = (today - dt.timedelta(days=days - 1)).isoformat()
    stored = api_key_repo.usage_by_day(record.id, since_day)
    return usage_summary(record, stored, days, today)


@router.get("/cusip-resolution-stats", response_model=CusipResolutionStats)
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


@router.get("/companies/{symbol}/institutional-holders")
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


@router.get("/companies/{symbol}/institutional-activity")
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


@router.get("/managers/{manager_cik}/holdings", response_model=HoldingsSnapshot)
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


@router.get("/managers/{manager_cik}/activity")
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

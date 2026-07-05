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

from fastapi import APIRouter, Depends, HTTPException, Query, Request

from secfin.normalize.cusip import CusipResolver, resolve_snapshot_cusips
from secfin.normalize.flows import diff_snapshots, prior_quarter_end
from secfin.normalize.schema import (
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
from secfin.sec.insider import fetch_insider_transactions
from secfin.sec.institutional import fetch_13f_snapshot
from secfin.sec.ticker_cache import TickerCache
from secfin.storage.repository import RawFactRepository

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


def get_repo(request: Request) -> RawFactRepository:
    return request.app.state.repo


def get_ticker_cache(request: Request) -> TickerCache:
    return request.app.state.ticker_cache


def get_cusip_resolver(request: Request) -> CusipResolver:
    return request.app.state.cusip_resolver


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


async def _manager_snapshot(client: SECClient, manager_cik: int, period: str) -> HoldingsSnapshot:
    """fetch_13f_snapshot, translating "no filing for that quarter" into a 404.

    No cache-aside store yet -- every call re-fetches and re-parses from SEC (see
    docs/ROADMAP.md's "Cache-aside store for 13F holdings snapshots").
    """
    try:
        return await fetch_13f_snapshot(client, manager_cik, period)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e)) from e


@router.get("/companies/{symbol}/statements/{statement}", response_model=Statement)
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


@router.get("/companies/{symbol}/periods")
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
) -> list[InsiderTransaction]:
    """Insider transactions (Forms 3/4/5) for a company, most recent filings first.

    Fetched live from SEC on every request -- there is no cache-aside store for insider
    transactions yet (unlike statements' `_facts_for_cik`), so this is a heavier request
    than /statements: one submissions.json fetch plus one ownership-XML fetch per
    matching filing. `limit` bounds the number of *filings* fetched, not transaction
    rows -- a single filing can contain several (see sec/insider.py).
    """
    async with SECClient() as client:
        cik = await _cik_from_symbol(client, ticker_cache, symbol)
        return await fetch_insider_transactions(client, cik, limit=limit)


# --- Institutional ownership (13F, 13D/G) ------------------------------------------
#
# NOTE: 13F is a quarter-end HOLDINGS SNAPSHOT, not transactions. The "buy/sell" view
# is DERIVED by diffing consecutive quarters (normalize/flows.py). Endpoints and their
# responses must make that explicit and carry the ~45-day-lag / long-only caveats.


@router.get("/companies/{symbol}/institutional-holders")
async def get_institutional_holders(
    symbol: str,
    period: str = Query(..., description="Quarter-end, e.g. 2024-06-30"),
) -> dict:
    """Managers holding this issuer as of a quarter-end (aggregated across 13F filings).

    Requires the cross-manager 13F index + CUSIP→CIK resolution. Not yet implemented.
    """
    raise HTTPException(
        status_code=501,
        detail="Institutional holders endpoint not yet implemented (needs 13F aggregation).",
    )


@router.get("/companies/{symbol}/institutional-activity")
async def get_institutional_activity(
    symbol: str,
    period: str = Query(..., description="Current quarter-end, e.g. 2024-06-30"),
) -> dict:
    """DERIVED buy/sell activity for this issuer (current vs. prior quarter 13F diff).

    Values are computed by diffing snapshots — not reported trades. Not yet implemented.
    """
    raise HTTPException(
        status_code=501,
        detail="Institutional activity endpoint not yet implemented (derived from 13F diffs).",
    )


@router.get("/managers/{manager_cik}/holdings", response_model=HoldingsSnapshot)
async def get_manager_holdings(
    manager_cik: int,
    period: str = Query(..., description="Quarter-end, e.g. 2024-06-30"),
    resolver: CusipResolver = Depends(get_cusip_resolver),
) -> HoldingsSnapshot:
    """One manager's full 13F holdings snapshot for a quarter.

    This is a reported point-in-time SNAPSHOT, not trade data -- see
    /managers/{manager_cik}/activity for DERIVED buy/sell vs. the prior quarter, and its
    caveats (long-only, ~45-day filing lag) apply here too.
    """
    async with SECClient() as client:
        snapshot = await _manager_snapshot(client, manager_cik, period)
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
        current = await _manager_snapshot(client, manager_cik, period)
        try:
            prior = await _manager_snapshot(client, manager_cik, prior_period)
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

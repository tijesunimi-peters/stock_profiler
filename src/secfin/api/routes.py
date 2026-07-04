"""API routes.

Facts are served cache-aside from the SQLite store (see `_facts_for_cik`): a company
already ingested by `ingest/backfill.py` / `ingest/incremental.py`, or seen by a prior
request, is read straight from SQLite with no SEC call. Only a genuine cache miss hits
the SEC live -- and that fetch is then written back so the next request for the same
company is a cache hit. Ticker->CIK resolution still hits SEC per request (a separate,
still-open gap -- see ROADMAP's "Ticker->CIK map caching" item).
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, Request

from secfin.normalize.schema import FiscalPeriod, RawFact, Statement, StatementType
from secfin.normalize.statements import available_periods, build_statement
from secfin.sec.client import SECClient
from secfin.sec.companyfacts import fetch_raw_facts, resolve_ticker
from secfin.storage.repository import RawFactRepository

router = APIRouter()


def get_repo(request: Request) -> RawFactRepository:
    return request.app.state.repo


async def _cik_from_symbol(client: SECClient, symbol: str) -> int:
    """Accept either a raw CIK (digits) or a ticker symbol."""
    if symbol.isdigit():
        return int(symbol)
    cik = await resolve_ticker(client, symbol)
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


@router.get("/companies/{symbol}/statements/{statement}", response_model=Statement)
async def get_statement(
    symbol: str,
    statement: StatementType,
    year: int = Query(..., description="Fiscal year, e.g. 2024"),
    period: FiscalPeriod = Query("FY", description="FY, Q1, Q2, Q3, or Q4"),
    repo: RawFactRepository = Depends(get_repo),
) -> Statement:
    """Return one normalized statement for a company + fiscal period."""
    async with SECClient() as client:
        cik = await _cik_from_symbol(client, symbol)
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
async def get_periods(symbol: str, repo: RawFactRepository = Depends(get_repo)) -> dict:
    """List the fiscal periods available for a company."""
    async with SECClient() as client:
        cik = await _cik_from_symbol(client, symbol)
        facts = await _facts_for_cik(repo, client, cik)
    return {
        "cik": cik,
        "periods": [{"year": y, "period": p} for (y, p) in available_periods(facts)],
    }


@router.get("/companies/{symbol}/insider-trades")
async def get_insider_trades(symbol: str) -> dict:
    """Insider trades (Forms 3/4/5) — not yet implemented (see sec/insider.py)."""
    raise HTTPException(status_code=501, detail="Insider-trade endpoint not yet implemented.")


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


@router.get("/managers/{manager_cik}/holdings")
async def get_manager_holdings(
    manager_cik: int,
    period: str = Query(..., description="Quarter-end, e.g. 2024-06-30"),
) -> dict:
    """One manager's full 13F holdings snapshot for a quarter. Not yet implemented."""
    raise HTTPException(status_code=501, detail="Manager holdings endpoint not yet implemented.")

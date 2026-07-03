"""API routes.

NOTE: these fetch from the SEC live on each request for now. Before launch, put the
storage/cache layer in front of `fetch_raw_facts` so we don't hit the SEC per request
(and so we respect fair-access limits at scale). Wiring the cache is a to-do — see ROADMAP.
"""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query

from secfin.normalize.schema import FiscalPeriod, Statement, StatementType
from secfin.normalize.statements import available_periods, build_statement
from secfin.sec.client import SECClient
from secfin.sec.companyfacts import fetch_raw_facts, resolve_ticker

router = APIRouter()


async def _cik_from_symbol(client: SECClient, symbol: str) -> int:
    """Accept either a raw CIK (digits) or a ticker symbol."""
    if symbol.isdigit():
        return int(symbol)
    cik = await resolve_ticker(client, symbol)
    if cik is None:
        raise HTTPException(status_code=404, detail=f"Unknown ticker: {symbol}")
    return cik


@router.get("/companies/{symbol}/statements/{statement}", response_model=Statement)
async def get_statement(
    symbol: str,
    statement: StatementType,
    year: int = Query(..., description="Fiscal year, e.g. 2024"),
    period: FiscalPeriod = Query("FY", description="FY, Q1, Q2, Q3, or Q4"),
) -> Statement:
    """Return one normalized statement for a company + fiscal period."""
    async with SECClient() as client:
        cik = await _cik_from_symbol(client, symbol)
        facts = await fetch_raw_facts(client, cik)
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
async def get_periods(symbol: str) -> dict:
    """List the fiscal periods available for a company."""
    async with SECClient() as client:
        cik = await _cik_from_symbol(client, symbol)
        facts = await fetch_raw_facts(client, cik)
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

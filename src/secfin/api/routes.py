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
    if not result.lines:
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

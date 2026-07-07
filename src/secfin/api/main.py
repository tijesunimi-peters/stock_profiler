"""FastAPI application entrypoint.

Run locally:
    uvicorn secfin.api.main:app --reload
Docs at /docs.
"""

from __future__ import annotations

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from secfin.api.routes import router
from secfin.config import settings
from secfin.normalize.cusip import CusipResolver
from secfin.sec.ticker_cache import TickerCache
from secfin.storage.sqlite_cusip_repository import SQLiteCusipMapRepository
from secfin.storage.sqlite_holdings_repository import SQLiteHoldingsSnapshotRepository
from secfin.storage.sqlite_insider_repository import SQLiteInsiderTransactionRepository
from secfin.storage.sqlite_repository import SQLiteRawFactRepository

STATIC_DIR = Path(__file__).parent / "static"


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    # One repository/connection for the process lifetime -- routes read it via
    # api.routes.get_repo (a Depends on request.app.state.repo), same interface
    # ingest/backfill.py and ingest/incremental.py already write through.
    app.state.repo = SQLiteRawFactRepository(settings.secfin_db_path)
    # Likewise, one in-memory ticker->CIK cache for the process lifetime -- see
    # sec/ticker_cache.py and api.routes.get_ticker_cache.
    app.state.ticker_cache = TickerCache(ttl_seconds=settings.secfin_ticker_cache_ttl_seconds)
    # CUSIP -> CIK resolution for 13F holdings (normalize/cusip.py). Own connection to
    # the same db file (fine under WAL mode) plus an in-memory name-index cache with the
    # same refresh shape as TickerCache above -- reuses its TTL setting since both cache
    # the same company_tickers.json source with the same staleness tolerance.
    app.state.cusip_repo = SQLiteCusipMapRepository(settings.secfin_db_path)
    app.state.cusip_resolver = CusipResolver(
        app.state.cusip_repo, ttl_seconds=settings.secfin_ticker_cache_ttl_seconds
    )
    # Cache-aside store for insider (Forms 3/4/5) transactions -- see
    # api.routes.get_insider_repo / storage/insider_repository.py. Own connection to the
    # same db file, same as cusip_repo above (fine under WAL mode).
    app.state.insider_repo = SQLiteInsiderTransactionRepository(settings.secfin_db_path)
    # Cache-aside store for 13F holdings snapshots, keyed on (manager_cik, report_period)
    # -- see api.routes.get_holdings_repo / storage/holdings_repository.py.
    app.state.holdings_repo = SQLiteHoldingsSnapshotRepository(settings.secfin_db_path)
    try:
        yield
    finally:
        app.state.repo.close()
        app.state.cusip_repo.close()
        app.state.insider_repo.close()
        app.state.holdings_repo.close()


app = FastAPI(
    title="sec-financials-api",
    version="0.1.0",
    description="Normalized SEC financial data (Track 1: structured numeric data).",
    lifespan=lifespan,
)

app.include_router(router, prefix="/v1")
app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")


@app.get("/", include_in_schema=False)
async def landing_page() -> FileResponse:
    return FileResponse(STATIC_DIR / "index.html")


@app.get("/explorer", include_in_schema=False)
async def data_explorer() -> FileResponse:
    return FileResponse(STATIC_DIR / "explorer.html")


@app.get("/components", include_in_schema=False)
async def component_reference() -> FileResponse:
    # Kitchen-sink reference for the shared data-page design system (static/app.css + app.js).
    return FileResponse(STATIC_DIR / "components.html")


@app.get("/coverage", include_in_schema=False)
async def data_coverage() -> FileResponse:
    return FileResponse(STATIC_DIR / "coverage.html")


@app.get("/company/{symbol}", include_in_schema=False)
async def company_hub(symbol: str) -> FileResponse:
    # The company hub shell; company.js reads {symbol} from the path and calls the v1 API.
    return FileResponse(STATIC_DIR / "company.html")


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}

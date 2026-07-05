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
    try:
        yield
    finally:
        app.state.repo.close()
        app.state.cusip_repo.close()


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


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}

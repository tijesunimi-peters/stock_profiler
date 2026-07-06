"""FastAPI application entrypoint.

Run locally:
    uvicorn secfin.api.main:app --reload
Docs at /docs.
"""

from __future__ import annotations

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import Depends, FastAPI
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from secfin.api.auth import limit_anonymous_traffic, require_api_key
from secfin.api.auth_routes import signup_router
from secfin.api.routes import public_router, router
from secfin.auth.rate_limiter import TokenBucketLimiter
from secfin.config import settings
from secfin.normalize.cusip import CusipResolver
from secfin.sec.ticker_cache import TickerCache
from secfin.storage.sqlite_api_key_repository import SQLiteApiKeyRepository
from secfin.storage.sqlite_beneficial_ownership_repository import (
    SQLiteBeneficialOwnershipRepository,
)
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
    # Cache-aside store for Schedule 13D/G beneficial-ownership rows, keyed at filing
    # granularity like insider_repo above -- see
    # api.routes.get_beneficial_ownership_repo / storage/beneficial_ownership_repository.py.
    app.state.beneficial_ownership_repo = SQLiteBeneficialOwnershipRepository(
        settings.secfin_db_path
    )
    # API key store (Milestone 3 auth) + the in-memory rate limiter shared by
    # api/auth.py's per-key and per-IP checks -- see auth/rate_limiter.py for why this
    # is in-process rather than SQLite-backed.
    app.state.api_key_repo = SQLiteApiKeyRepository(settings.secfin_db_path)
    app.state.rate_limiter = TokenBucketLimiter()
    try:
        yield
    finally:
        app.state.repo.close()
        app.state.cusip_repo.close()
        app.state.insider_repo.close()
        app.state.holdings_repo.close()
        app.state.beneficial_ownership_repo.close()
        app.state.api_key_repo.close()


app = FastAPI(
    title="sec-financials-api",
    version="0.1.0",
    description="Normalized SEC financial data (Track 1: structured numeric data).",
    lifespan=lifespan,
)

app.include_router(
    public_router, prefix="/v1", dependencies=[Depends(limit_anonymous_traffic)]
)
app.include_router(signup_router, prefix="/v1")
app.include_router(router, prefix="/v1", dependencies=[Depends(require_api_key)])
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

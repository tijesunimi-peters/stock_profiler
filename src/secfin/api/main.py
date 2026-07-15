"""FastAPI application entrypoint.

Run locally:
    uvicorn secfin.api.main:app --reload
Docs at /docs.
"""

from __future__ import annotations

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from pathlib import Path

import httpx
from fastapi import Depends, FastAPI, Request
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from secfin.api.admin_routes import admin_router
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
from secfin.storage.sqlite_company_profile_repository import SQLiteCompanyProfileRepository
from secfin.storage.sqlite_cusip_repository import SQLiteCusipMapRepository
from secfin.storage.sqlite_holdings_repository import SQLiteHoldingsSnapshotRepository
from secfin.storage.sqlite_insider_repository import SQLiteInsiderTransactionRepository
from secfin.storage.sqlite_metric_distribution_repository import (
    SQLiteMetricDistributionRepository,
)
from secfin.storage.sqlite_metric_rank_repository import SQLiteMetricRankRepository
from secfin.storage.sqlite_metric_value_repository import SQLiteMetricValueRepository
from secfin.storage.sqlite_repository import SQLiteRawFactRepository

STATIC_DIR = Path(__file__).parent / "static"

# Rendered as the overview on the Swagger UI (`/docs`) landing page. Narrative
# quickstart/error-code/tier content lives on the static `/guide` page instead (see
# `landing_page`/`docs_guide` below) -- this stays short, since Swagger already shows
# per-endpoint detail from each route's own docstring.
_OPENAPI_DESCRIPTION = """
Normalized SEC financial data (Track 1: structured numeric data) -- income statements,
balance sheets, cash flow, insider trades (Forms 3/4/5), and institutional ownership
(13F, Schedule 13D/13G), served as clean JSON instead of raw XBRL/XML.

**Auth:** every endpoint below except `/companies/{symbol}/statements/{statement}` and
`/companies/{symbol}/periods` requires an `X-API-Key` header. `POST /v1/signup` issues a
free-tier key. See `/guide` for a walkthrough, current tier limits, and error codes.

**13F is a quarter-end holdings snapshot, not transactions.** Any "buy/sell" activity
endpoint below DERIVES that view by diffing two quarters -- never reported trades. Every
such response carries a `caveats` field spelling this out, plus the long-only /
~45-day-filing-lag caveats.
""".strip()

_OPENAPI_TAGS = [
    {
        "name": "Financials",
        "description": "Income statement, balance sheet, and cash flow -- public, keyless "
        "endpoints (IP rate-limited instead).",
    },
    {
        "name": "Insider Trades",
        "description": "Forms 3/4/5 insider transactions.",
    },
    {
        "name": "Institutional Ownership",
        "description": "13F holdings/activity and Schedule 13D/13G beneficial ownership. "
        "'Activity' endpoints are DERIVED by diffing snapshots -- see each endpoint's "
        "own caveats.",
    },
    {
        "name": "Account",
        "description": "Signup and usage metering for your own API key.",
    },
    {
        "name": "Screening",
        "description": "Cross-company screening (filter/match) and concept listing "
        "(rank/browse) by financial-concept, built on the SEC frames API (Milestone 4).",
    },
]


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
    # Precomputed peer ranks (Metrics Phase 2). The serving path only READS this table
    # (a point lookup per issuer); the analytical/peer_ranks.py batch is the sole writer,
    # so the live API never touches DuckDB. See api.routes.get_metric_rank_repo.
    app.state.metric_rank_repo = SQLiteMetricRankRepository(settings.secfin_db_path)
    # Precomputed peer distributions (min/p25/median/p75/max) -- sibling of metric_rank_repo
    # above, same read-only-on-the-serving-path shape; analytical/peer_distribution.py is the
    # sole writer. See api.routes.get_metric_distribution_repo.
    app.state.metric_distribution_repo = SQLiteMetricDistributionRepository(settings.secfin_db_path)
    # Materialized per-company metric values (Metrics Phase 2) -- read here only to surface a
    # company's own value alongside its peer distribution; ingest/metrics_backfill.py is the
    # sole writer. See api.routes.get_metric_value_repo.
    app.state.metric_value_repo = SQLiteMetricValueRepository(settings.secfin_db_path)
    # Company SIC profile (cik -> peer group) -- read here to resolve which peer group's
    # distribution applies to a company; ingest/sic_backfill.py is the sole writer. See
    # api.routes.get_company_profile_repo.
    app.state.company_profile_repo = SQLiteCompanyProfileRepository(settings.secfin_db_path)
    try:
        yield
    finally:
        app.state.repo.close()
        app.state.cusip_repo.close()
        app.state.insider_repo.close()
        app.state.holdings_repo.close()
        app.state.beneficial_ownership_repo.close()
        app.state.api_key_repo.close()
        app.state.metric_rank_repo.close()
        app.state.metric_distribution_repo.close()
        app.state.metric_value_repo.close()
        app.state.company_profile_repo.close()


app = FastAPI(
    title="Profin API",
    version="0.1.0",
    description=_OPENAPI_DESCRIPTION,
    openapi_tags=_OPENAPI_TAGS,
    lifespan=lifespan,
)


# Pre-launch cold-path finding (2026-07-07): a cache MISS on any cache-aside endpoint
# fetches from SEC live, uncaught -- an upstream SEC failure (rate-limited/blocked/down)
# previously propagated as a bare, unhandled 500 ("Internal Server Error", no body),
# Starlette's generic default. That's technically safe (nothing sensitive leaks) but
# wrong in two ways: a 500 tells the caller WE are broken, when the real cause is
# upstream; and it gives an API consumer nothing actionable to distinguish "retry later"
# from "this is a bug, report it". These two handlers translate the two real failure
# shapes seen from `httpx` (raised by sec/client.py's `get_json`/`get_bytes`, uncaught by
# every route handler that does `async with SECClient() as client: ...`) into a
# gateway-style response instead -- 502 for "SEC responded but with an error status" vs.
# 503 for "couldn't complete the request at all" (timeout/connect failure), matching
# standard proxy semantics for "the thing I depend on failed", not "I am broken".
@app.exception_handler(httpx.HTTPStatusError)
async def _handle_upstream_http_error(request: Request, exc: httpx.HTTPStatusError) -> JSONResponse:
    return JSONResponse(
        status_code=502,
        content={
            "detail": (
                "Upstream SEC request failed "
                f"(HTTP {exc.response.status_code}). This is transient -- please retry."
            )
        },
    )


@app.exception_handler(httpx.TransportError)
async def _handle_upstream_transport_error(
    request: Request, exc: httpx.TransportError
) -> JSONResponse:
    return JSONResponse(
        status_code=503,
        content={"detail": "Upstream SEC request timed out or could not connect. Please retry."},
    )


app.include_router(public_router, prefix="/v1", dependencies=[Depends(limit_anonymous_traffic)])
app.include_router(signup_router, prefix="/v1")
app.include_router(router, prefix="/v1", dependencies=[Depends(require_api_key)])
# Own gating (require_admin_secret, an admin shared secret) at the route level, not
# require_api_key -- an admin isn't a paying customer. See admin_routes.py.
app.include_router(admin_router, prefix="/v1")
app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")


@app.get("/", include_in_schema=False)
async def landing_page() -> FileResponse:
    return FileResponse(STATIC_DIR / "index.html")


@app.get("/explorer", include_in_schema=False)
async def data_explorer() -> FileResponse:
    return FileResponse(STATIC_DIR / "explorer.html")


@app.get("/guide", include_in_schema=False)
async def docs_guide() -> FileResponse:
    return FileResponse(STATIC_DIR / "guide.html")


@app.get("/components", include_in_schema=False)
async def component_reference() -> FileResponse:
    # Kitchen-sink reference for the shared data-page design system (static/app.css + app.js).
    return FileResponse(STATIC_DIR / "components.html")


@app.get("/coverage", include_in_schema=False)
async def data_coverage() -> FileResponse:
    return FileResponse(STATIC_DIR / "coverage.html")


@app.get("/robots.txt", include_in_schema=False)
async def robots_txt() -> FileResponse:
    # Crawlers are welcome on the marketing/docs pages but kept off /v1/ -- API
    # JSON has no SEO value and would burn the anonymous per-IP rate limit.
    return FileResponse(STATIC_DIR / "robots.txt")


@app.get("/favicon.ico", include_in_schema=False)
async def favicon_ico() -> FileResponse:
    # Browsers request this path by default; the pages' <link rel="icon"> data
    # URI doesn't cover it. Same brand mark as the inline SVG.
    return FileResponse(STATIC_DIR / "favicon.ico")


@app.get("/favicon.svg", include_in_schema=False)
async def favicon_svg() -> FileResponse:
    return FileResponse(STATIC_DIR / "favicon.svg")


@app.get("/company/{symbol}", include_in_schema=False)
async def company_hub(symbol: str) -> FileResponse:
    # The company hub shell; company.js reads {symbol} from the path and calls the v1 API.
    return FileResponse(STATIC_DIR / "company.html")


@app.get("/manager/{cik}", include_in_schema=False)
async def manager_profile(cik: str) -> FileResponse:
    # The 13F manager profile shell; manager.js reads {cik} from the path and calls the v1 API.
    return FileResponse(STATIC_DIR / "manager.html")


@app.get("/compare", include_in_schema=False)
async def company_comparison() -> FileResponse:
    # The multi-company comparison shell; compare.js reads ?symbols=&year= and calls the v1 API.
    return FileResponse(STATIC_DIR / "compare.html")


@app.get("/screen", include_in_schema=False)
async def screening() -> FileResponse:
    # The cross-company screening shell; screen.js reads the query and calls /v1/screen + /concepts.
    return FileResponse(STATIC_DIR / "screen.html")


@app.get("/privacy", include_in_schema=False)
async def privacy_policy() -> FileResponse:
    # Draft legal/trust page -- see docs/product/tracks/writing.md for status.
    return FileResponse(STATIC_DIR / "privacy.html")


@app.get("/terms", include_in_schema=False)
async def terms_of_service() -> FileResponse:
    # Draft legal/trust page -- see docs/product/tracks/writing.md for status.
    return FileResponse(STATIC_DIR / "terms.html")


@app.get("/disclaimer", include_in_schema=False)
async def data_disclaimer() -> FileResponse:
    # "Data, not investment advice" -- linked from every page footer (guardrail 2).
    return FileResponse(STATIC_DIR / "disclaimer.html")


@app.get("/methodology", include_in_schema=False)
async def data_methodology() -> FileResponse:
    # Data source & methodology page -- doubles as the E-E-A-T surface (content-seo skill).
    return FileResponse(STATIC_DIR / "methodology.html")


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}

"""FastAPI application entrypoint.

Run locally:
    uvicorn secfin.api.main:app --reload
Docs at /docs.
"""

from __future__ import annotations

import datetime as dt
from collections import Counter
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from pathlib import Path
from urllib.parse import quote

import httpx
from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.responses import FileResponse, JSONResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles

from secfin.api.admin_routes import admin_router
from secfin.api.auth import limit_anonymous_traffic, require_api_key
from secfin.api.auth_routes import signup_router
from secfin.api.routes import internal_router, public_router, router
from secfin.auth.rate_limiter import TokenBucketLimiter
from secfin.config import settings
from secfin.normalize.cusip import CusipResolver
from secfin.sec.ticker_cache import TickerCache
from secfin.storage.sqlite_api_key_repository import SQLiteApiKeyRepository
from secfin.storage.sqlite_beneficial_ownership_repository import (
    SQLiteBeneficialOwnershipRepository,
)
from secfin.storage.sqlite_company_profile_repository import SQLiteCompanyProfileRepository
from secfin.storage.sqlite_filing_cover_repository import SQLiteFilingCoverRepository
from secfin.storage.sqlite_filing_index_repository import SQLiteFilingIndexRepository
from secfin.storage.sqlite_cusip_repository import SQLiteCusipMapRepository
from secfin.storage.sqlite_dimensional_repository import SQLiteDimensionalRepository
from secfin.storage.sqlite_trading_arrangement_repository import (
    SQLiteTradingArrangementRepository,
)
from secfin.storage.sqlite_holdings_repository import SQLiteHoldingsSnapshotRepository
from secfin.storage.sqlite_insider_repository import SQLiteInsiderTransactionRepository
from secfin.storage.sqlite_metric_distribution_repository import (
    SQLiteMetricDistributionRepository,
)
from secfin.storage.sqlite_metric_rank_repository import SQLiteMetricRankRepository
from secfin.storage.sqlite_metric_value_repository import SQLiteMetricValueRepository
from secfin.storage.sqlite_repository import SQLiteRawFactRepository
from secfin.storage.sqlite_sector_dupont_repository import SQLiteSectorDupontRepository
from secfin.storage.sqlite_sector_geographic_mix_repository import (
    SQLiteSectorGeographicMixRepository,
)
from secfin.storage.sqlite_disclosure_stat_repository import SQLiteDisclosureStatRepository
from secfin.storage.sqlite_sector_governance_stat_repository import (
    SQLiteSectorGovernanceStatRepository,
)
from secfin.storage.sqlite_insider_peer_ratio_repository import (
    SQLiteInsiderPeerRatioRepository,
)
from secfin.storage.sqlite_sector_insider_flow_repository import (
    SQLiteSectorInsiderFlowRepository,
)
from secfin.storage.sqlite_sector_lifecycle_repository import SQLiteSectorLifecycleRepository
from secfin.storage.sqlite_sector_company_repository import SQLiteSectorCompanyRepository
from secfin.storage.sqlite_sector_theme_score_repository import (
    SQLiteSectorThemeScoreRepository,
)

STATIC_DIR = Path(__file__).parent / "static"

# The built React app (`clearyfi_frontend`), mounted at /app.
#
# ALONGSIDE the server-rendered site, not over it: `/`, `/company/{symbol}` and `/sectors` are live
# routes below, and mounting the SPA at the root would silently take over pages that already work.
# Under a prefix, shipping it is additive and rolling it back is deleting two routes.
#
# The directory is OPTIONAL. It is produced by a Node build stage that only the deployment image
# runs, so a plain `pip install -e .` checkout has no `app/` here -- and must still start. Every
# route below checks `APP_DIR.is_dir()` and 404s rather than raising at import time, which is what
# keeps `pytest` and `uvicorn --reload` working on a tree that has never run `npm run app:build`.
APP_DIR = Path(__file__).parent / "app"

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
    # The generic filing index (form, dates, acceptance timestamp, 8-K items) read from
    # /submissions/. Populated by ingest/filing_index_backfill.py; the live path only reads it.
    # An EMPTY index is meaningful and is surfaced as such -- "we have not looked" is a different
    # answer from "we looked and found none", which is the whole point of the store.
    app.state.filing_index_repo = SQLiteFilingIndexRepository(settings.secfin_db_path)
    # Parsed 10-K cover-page facts (auditor, extension-tag census). Written cache-aside by the
    # /audit route because the fetch behind it is 1.4-14.9 MB per filing and there is no range
    # shortcut -- so a filing is downloaded once per accession, ever. See sec/cover.py.
    app.state.filing_cover_repo = SQLiteFilingCoverRepository(settings.secfin_db_path)
    app.state.trading_arrangement_repo = SQLiteTradingArrangementRepository(
        settings.secfin_db_path
    )
    # §03's ASC 280 segment/geography facts. A SEPARATE table from dimensional_geo_facts,
    # whose contract the sector-mix batch depends on -- see storage/dimensional_repository.py.
    app.state.dimensional_repo = SQLiteDimensionalRepository(settings.secfin_db_path)
    # Precomputed asset-weighted sector DuPont aggregates (Sector Analytics D1) -- sibling of
    # metric_rank_repo above, same read-only-on-the-serving-path shape; analytical/sector_dupont.py
    # is the sole writer, so the live API never touches DuckDB. See routes.get_sector_dupont_repo.
    app.state.sector_dupont_repo = SQLiteSectorDupontRepository(settings.secfin_db_path)
    # Precomputed aggregate asset-lifecycle days-metrics (Sector Analytics D5) -- same
    # read-only-on-the-serving-path shape; analytical/sector_lifecycle.py is the sole writer, so
    # the live API never touches DuckDB. See routes.get_sector_lifecycle_repo.
    app.state.sector_lifecycle_repo = SQLiteSectorLifecycleRepository(settings.secfin_db_path)
    # Precomputed composite sector theme scores (sector-overview redesign, Phase 0) -- same
    # read-only-on-the-serving-path shape; analytical/sector_theme_scores.py is the sole writer
    # (a pure-Python offline batch over metric_distributions -- no DuckDB on this path at all).
    # See routes.get_sector_theme_score_repo.
    app.state.sector_theme_score_repo = SQLiteSectorThemeScoreRepository(settings.secfin_db_path)
    # Per-company value list within a sector (Sector Analytics app, Company view) -- a plain read
    # over metric_values ⨝ company_profiles (+ metric_ranks); no DuckDB on the request path.
    app.state.sector_company_repo = SQLiteSectorCompanyRepository(settings.secfin_db_path)
    # Precomputed sector insider flow (Sector Analytics v2, P6a) -- same read-only-on-the-serving-
    # path shape; analytical/sector_insider_flow.py is the sole writer, so the live API never
    # touches DuckDB. See routes.get_sector_insider_flow_repo.
    app.state.sector_insider_flow_repo = SQLiteSectorInsiderFlowRepository(settings.secfin_db_path)
    # Per-COMPANY insider ratios for the peer strip. Same deal: written by an offline DuckDB
    # batch, read here as plain point lookups -- the request path never touches DuckDB.
    app.state.insider_peer_ratio_repo = SQLiteInsiderPeerRatioRepository(settings.secfin_db_path)
    app.state.disclosure_stat_repo = SQLiteDisclosureStatRepository(settings.secfin_db_path)
    # Precomputed sector geographic mix (Sector Analytics v2, P6b) -- same read-only-on-the-serving-
    # path shape; analytical/sector_geographic_mix.py is the sole writer (a pure-Python offline batch
    # over dimensional_geo_facts -- no DuckDB on this path at all). See
    # routes.get_sector_geographic_mix_repo.
    app.state.sector_geographic_mix_repo = SQLiteSectorGeographicMixRepository(
        settings.secfin_db_path
    )
    # Precomputed sector cyber/auditor/deficient-filing stats (Track 2 Wave 0) -- same read-only-
    # on-the-serving-path shape; analytical/sector_governance_stats.py is the sole writer. See
    # routes.get_sector_governance_stat_repo.
    app.state.sector_governance_stat_repo = SQLiteSectorGovernanceStatRepository(
        settings.secfin_db_path
    )
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
        app.state.filing_index_repo.close()
        app.state.filing_cover_repo.close()
        app.state.trading_arrangement_repo.close()
        app.state.dimensional_repo.close()
        app.state.sector_dupont_repo.close()
        app.state.sector_lifecycle_repo.close()
        app.state.sector_theme_score_repo.close()
        app.state.sector_company_repo.close()
        app.state.sector_insider_flow_repo.close()
        app.state.insider_peer_ratio_repo.close()
        app.state.disclosure_stat_repo.close()
        app.state.sector_geographic_mix_repo.close()
        app.state.sector_governance_stat_repo.close()


app = FastAPI(
    title="ClearyFi API",
    version="0.1.0",
    description=_OPENAPI_DESCRIPTION,
    openapi_tags=_OPENAPI_TAGS,
    lifespan=lifespan,
)

# Process-lifetime response counters for GET /v1/admin/ops (admin_routes.py) -- the
# error-rate half of the observability story (traffic/keys come from the repository).
# Deliberately in-memory, not persisted: the app is a hard single process
# (docs/DEPLOYMENT.md §1), so one process's counters ARE the whole picture, and they
# resetting on restart is fine for "is production erroring right now?". Counted by
# class ("2xx".."5xx") -- handled exceptions (the 502/503 handlers below, HTTPException)
# arrive here as normal responses; only an unhandled exception takes the `except`
# branch, and is counted as the 500 Starlette will turn it into.
app.state.ops_started_at = dt.datetime.now(dt.UTC).isoformat(timespec="seconds")
app.state.ops_response_counts = Counter()


@app.middleware("http")
async def _count_response_classes(request: Request, call_next):  # type: ignore[no-untyped-def]
    try:
        response = await call_next(request)
    except Exception:
        app.state.ops_response_counts["5xx"] += 1
        raise
    app.state.ops_response_counts[f"{response.status_code // 100}xx"] += 1
    return response


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
# Internal-only company-data endpoints (raw facts) -- same admin-secret gating as
# admin_router, declared per-route. See routes.py's internal_router comment and
# docs/ROADMAP_DATA_DEPTH.md Phase 1.
app.include_router(internal_router, prefix="/v1")
app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")
if APP_DIR.is_dir():
    # Hashed filenames, so these are immutable and safe to serve directly. At `/assets` rather
    # than `/app/assets` since the app moved to the root (operator ruling, 2026-08-17).
    app.mount("/assets", StaticFiles(directory=APP_DIR / "assets"), name="app-assets")


@app.get("/app", include_in_schema=False)
@app.get("/app/{path:path}", include_in_schema=False)
async def app_prefix_redirect(path: str = "", request: Request = None):  # type: ignore[assignment]
    """`/app/...` -> the same path at the root.

    The app shipped under `/app` for one deploy (2026-08-17) before the ruling that it is the only
    frontend. Anything linked or bookmarked in that window keeps working, and 301 tells caches and
    crawlers the root is canonical -- there must not be two URLs serving the same view.
    """
    target = f"/{path}" if path else "/sectors"
    if request is not None and request.url.query:
        target = f"{target}?{request.url.query}"
    return RedirectResponse(target, status_code=301)


@app.get("/", include_in_schema=False)
async def landing_page() -> FileResponse:
    return FileResponse(STATIC_DIR / "index.html")


@app.get("/explorer", include_in_schema=False)
async def data_explorer(symbol: str = "AAPL", statement: str = "income") -> RedirectResponse:
    # The Data Explorer merged into the company hub's Statements tab (2026-07-17, see
    # docs/ROADMAP_UI.md). Old deep links (?symbol=&statement=) translate so nothing
    # bookmarked or linked from the marketing pages breaks.
    if statement not in ("income", "balance", "cashflow", "segments"):
        statement = "income"
    return RedirectResponse(
        f"/company/{quote(symbol.upper())}?tab=statements&stmt={statement}", status_code=301
    )


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


@app.get("/sector-analytics", include_in_schema=False)
async def sector_analytics_redirect(request: Request) -> RedirectResponse:
    # M2 routing swap (2026-07-24, ROADMAP_SECTOR_MIGRATION.md): /sectors is canonical now and
    # serves the v2 Sector Analytics app. Keep existing /sector-analytics links + bookmarks working
    # by 301-redirecting, carrying the raw query string through (?group=&view=&symbol=&a=&b=) -- the
    # app honors those params identically at the new URL. Use request.url.query (already-encoded) so
    # nothing is dropped or double-encoded.
    target = "/sectors"
    if request.url.query:
        target = f"{target}?{request.url.query}"
    return RedirectResponse(target, status_code=301)


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


# ---------------------------------------------------------------------------------------------
# THE DATA APP. One frontend now (operator ruling, 2026-08-17): the React app in
# `clearyfi_frontend` serves every data surface, and the server-rendered shells it replaced
# (company.html, sector-analytics.html, manager.html, compare.html, screen.html) are no longer
# routed to. Their files stay in `static/` for one release as a rollback, and the roadmap that
# retires them is docs/ROADMAP_UI.md.
#
# What did NOT move, deliberately: `/` and the prose, legal and reference pages below. The React
# app has no landing page -- its router redirects `/` to `/sectors` -- and it links OUT to
# `/methodology` and `/docs`. Handing it the front door would replace the page that explains what
# the product IS with a data view.
#
# Every route here serves the SAME shell, and none validates its path segments: the CLIENT owns
# routing, so an unknown view slug must fall back to the app's default view rather than 404 --
# the rule the server-rendered shells already followed.
# ---------------------------------------------------------------------------------------------


def _spa() -> FileResponse:
    """The SPA shell, or a 404 when this build has no bundle (see APP_DIR)."""
    index = APP_DIR / "index.html"
    if not index.is_file():
        raise HTTPException(status_code=404, detail="The app bundle is not present in this build.")
    return FileResponse(index)


@app.get("/company/{symbol}", include_in_schema=False)
@app.get("/company/{symbol}/{view}", include_in_schema=False)
async def company_app(symbol: str, view: str = "") -> FileResponse:
    return _spa()


@app.get("/manager/{cik}", include_in_schema=False)
@app.get("/manager/{cik}/{view}", include_in_schema=False)
async def manager_app(cik: str, view: str = "") -> FileResponse:
    return _spa()


@app.get("/compare", include_in_schema=False)
@app.get("/compare/{view}", include_in_schema=False)
async def compare_app(view: str = "") -> FileResponse:
    return _spa()


@app.get("/screen", include_in_schema=False)
async def screen_app() -> FileResponse:
    return _spa()


@app.get("/sectors", include_in_schema=False)
async def sectors_app() -> FileResponse:
    return _spa()


# The two URL vocabularies for a sector differ, so the old links are TRANSLATED rather than served.
#
# The server-rendered app put the SIC group in the PATH (`/sectors/36/sector`); the React app puts
# the view in the path and the group in the query (`/sectors/sector?sector=36`). Serving the shell
# at the old shape would have silently dropped the group -- React's router reads segment 1 as a
# VIEW, `36` is not one, so it would fall back to the default view and a different sector. A
# bookmark that quietly changes which industry it shows is worse than one that 404s.
_SECTOR_VIEWS = {"sector", "qualitative", "filings"}


@app.get("/sectors/{group}", include_in_schema=False)
@app.get("/sectors/{group}/{view}", include_in_schema=False)
async def sectors_legacy_group(group: str, view: str = "sector", request: Request = None):  # type: ignore[assignment]
    # `/sectors/sector` is already the NEW shape (a view, not a group) -- serve it as-is.
    if group in _SECTOR_VIEWS:
        return _spa()
    target = f"/sectors/{view if view in _SECTOR_VIEWS else 'sector'}?sector={quote(group)}"
    if request is not None and request.url.query:
        target = f"{target}&{request.url.query}"
    return RedirectResponse(target, status_code=301)


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

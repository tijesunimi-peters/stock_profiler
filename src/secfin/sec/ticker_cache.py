"""In-memory ticker->CIK cache, refreshed from SEC's `company_tickers.json`.

The SEC's ticker map changes rarely (new listings, delistings, occasional relabels), so
resolving a ticker doesn't need a live fetch on every request -- only once per
`ttl_seconds`. One `TickerCache` is created for the process lifetime (`api/main.py`'s
`lifespan`) and shared across requests via `api/routes.py`'s `get_ticker_cache`
dependency -- the same shape as the RawFact cache in `_facts_for_cik`.
"""

from __future__ import annotations

import asyncio
import time

from secfin.sec.client import SECClient


def parse_ticker_map(payload: dict) -> dict[str, int]:
    """SEC's company_tickers.json -> {TICKER: cik}. Pure, so it's testable without network."""
    out: dict[str, int] = {}
    for row in payload.values():
        ticker = row.get("ticker")
        cik = row.get("cik_str")
        if ticker and cik is not None:
            out[ticker.upper()] = int(cik)
    return out


class TickerCache:
    """Caches the whole ticker->CIK map in memory, refreshing at most every `ttl_seconds`."""

    def __init__(self, ttl_seconds: float) -> None:
        self._ttl = ttl_seconds
        self._map: dict[str, int] = {}
        self._loaded_at: float | None = None
        self._lock = asyncio.Lock()

    def _is_fresh(self) -> bool:
        return self._loaded_at is not None and (time.monotonic() - self._loaded_at) < self._ttl

    async def _ensure_fresh(self, client: SECClient) -> None:
        if self._is_fresh():
            return
        async with self._lock:
            if self._is_fresh():  # another task may have refreshed while we waited
                return
            payload = await client.get_json(client.company_tickers_url())
            self._map = parse_ticker_map(payload)
            self._loaded_at = time.monotonic()

    async def resolve(self, client: SECClient, ticker: str) -> int | None:
        await self._ensure_fresh(client)
        return self._map.get(ticker.upper().strip())

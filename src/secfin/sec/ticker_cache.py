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


def parse_company_names(payload: dict) -> dict[int, str]:
    """SEC's company_tickers.json -> {cik: title}. Pure, same source payload as
    parse_ticker_map -- the reverse direction, used by cross-company screening
    (normalize/screening.py) to attach a company name to a bare CIK result without a
    second data source or extra network call."""
    out: dict[int, str] = {}
    for row in payload.values():
        title = row.get("title")
        cik = row.get("cik_str")
        if title and cik is not None:
            out[int(cik)] = title
    return out


class TickerCache:
    """Caches the whole ticker->CIK map (and its cik->name reverse) in memory,
    refreshing at most every `ttl_seconds`."""

    def __init__(self, ttl_seconds: float) -> None:
        self._ttl = ttl_seconds
        self._map: dict[str, int] = {}
        self._names: dict[int, str] = {}
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
            self._names = parse_company_names(payload)
            self._loaded_at = time.monotonic()

    async def resolve(self, client: SECClient, ticker: str) -> int | None:
        await self._ensure_fresh(client)
        return self._map.get(ticker.upper().strip())

    async def resolve_name(self, client: SECClient, cik: int) -> str | None:
        await self._ensure_fresh(client)
        return self._names.get(cik)

    async def tickers_for(self, client: SECClient, ciks: list[int]) -> dict[int, str]:
        """cik -> ticker for a bounded set of companies -- the reverse of `resolve`.

        For labelling companies we reached by CIK rather than by symbol (the peer-overlap
        matrix): a chart axis has room for "NVDA" and not for "NVIDIA CORPORATION", and a
        truncated registrant name identifies nothing. A cik with no ticker in the map is simply
        absent, so the caller falls back to the name rather than showing a bare number.

        A cik can carry several tickers (share classes); the shortest wins, then alphabetical,
        so the choice is deterministic and the pick is the plain-common-stock symbol in
        practice. One pass over the cached ~10k-entry map, no SEC call beyond its normal refresh.
        """
        await self._ensure_fresh(client)
        wanted = set(ciks)
        out: dict[int, str] = {}
        for ticker, cik in self._map.items():
            if cik not in wanted:
                continue
            current = out.get(cik)
            if current is None or (len(ticker), ticker) < (len(current), current):
                out[cik] = ticker
        return out

    async def suggest(self, client: SECClient, query: str, limit: int = 8) -> list[dict]:
        """Autocomplete candidates for a partial ticker / company name / CIK.

        Ranking: exact ticker, then ticker prefix, then company-name substring (a
        digits-only query also matches CIK prefixes at name-substring rank). Ties break
        alphabetically by ticker. Pure in-memory scan of the cached map (~10k entries)
        -- no SEC call beyond the cache's normal refresh.
        """
        await self._ensure_fresh(client)
        q = query.strip().upper()
        if not q:
            return []
        ranked: list[tuple[int, str, int]] = []
        for ticker, cik in self._map.items():
            if ticker == q:
                rank = 0
            elif ticker.startswith(q):
                rank = 1
            elif q in (self._names.get(cik) or "").upper():
                rank = 2
            elif q.isdigit() and str(cik).startswith(q):
                rank = 2
            else:
                continue
            ranked.append((rank, ticker, cik))
        ranked.sort()
        return [
            {"ticker": t, "cik": c, "name": self._names.get(c)}
            for _, t, c in ranked[:limit]
        ]

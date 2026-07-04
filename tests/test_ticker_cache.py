"""Tests for sec/ticker_cache.py (no network)."""

from __future__ import annotations

from secfin.sec.ticker_cache import TickerCache, parse_ticker_map


def test_parse_ticker_map_uppercases_and_keys_by_ticker():
    payload = {
        "0": {"cik_str": 320193, "ticker": "aapl", "title": "Apple Inc."},
        "1": {"cik_str": 789019, "ticker": "MSFT", "title": "Microsoft Corp"},
    }
    assert parse_ticker_map(payload) == {"AAPL": 320193, "MSFT": 789019}


def test_parse_ticker_map_skips_rows_without_a_ticker():
    payload = {"0": {"cik_str": 1, "title": "No ticker field here"}}
    assert parse_ticker_map(payload) == {}


class _FakeClient:
    def __init__(self, payload: dict) -> None:
        self.payload = payload
        self.calls = 0

    def company_tickers_url(self) -> str:
        return "http://fake/company_tickers.json"

    async def get_json(self, url: str) -> dict:
        self.calls += 1
        return self.payload


async def test_resolve_fetches_once_then_serves_from_cache():
    client = _FakeClient({"0": {"cik_str": 320193, "ticker": "AAPL"}})
    cache = TickerCache(ttl_seconds=3600)

    assert await cache.resolve(client, "aapl") == 320193
    assert await cache.resolve(client, "AAPL") == 320193
    assert client.calls == 1  # second lookup was a cache hit, no refetch


async def test_resolve_returns_none_for_unknown_ticker():
    client = _FakeClient({"0": {"cik_str": 320193, "ticker": "AAPL"}})
    cache = TickerCache(ttl_seconds=3600)

    assert await cache.resolve(client, "ZZZZ") is None
    assert client.calls == 1


async def test_resolve_refetches_once_ttl_has_elapsed():
    client = _FakeClient({"0": {"cik_str": 320193, "ticker": "AAPL"}})
    cache = TickerCache(ttl_seconds=0)  # elapsed time is never < 0, so always stale

    await cache.resolve(client, "AAPL")
    await cache.resolve(client, "AAPL")

    assert client.calls == 2

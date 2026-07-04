"""Tests for api/routes.py's _cik_from_symbol (digit passthrough + ticker cache delegation)."""

from __future__ import annotations

import pytest
from fastapi import HTTPException

from secfin.api.routes import _cik_from_symbol


class _FakeTickerCache:
    def __init__(self, mapping: dict) -> None:
        self.mapping = mapping
        self.calls = 0

    async def resolve(self, client, ticker: str):
        self.calls += 1
        return self.mapping.get(ticker.upper())


async def test_digit_symbol_short_circuits_without_touching_the_cache():
    cache = _FakeTickerCache({})
    cik = await _cik_from_symbol(client=None, ticker_cache=cache, symbol="320193")
    assert cik == 320193
    assert cache.calls == 0


async def test_ticker_symbol_resolves_via_the_cache():
    cache = _FakeTickerCache({"AAPL": 320193})
    cik = await _cik_from_symbol(client=None, ticker_cache=cache, symbol="aapl")
    assert cik == 320193
    assert cache.calls == 1


async def test_unknown_ticker_raises_404():
    cache = _FakeTickerCache({})
    with pytest.raises(HTTPException) as exc_info:
        await _cik_from_symbol(client=None, ticker_cache=cache, symbol="ZZZZ")
    assert exc_info.value.status_code == 404
    assert "ZZZZ" in exc_info.value.detail

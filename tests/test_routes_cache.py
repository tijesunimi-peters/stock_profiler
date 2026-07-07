"""Tests for the cache-aside read in api/routes.py (no network, no real SQLite)."""

from __future__ import annotations

from secfin.api import routes as routes_module
from secfin.normalize.schema import RawFact


def _fact(tag: str) -> RawFact:
    return RawFact(cik=320193, taxonomy="us-gaap", gaap_tag=tag, label=tag, unit="USD", value=1)


class _FakeRepo:
    """Minimal RawFactRepository double -- just the two methods _facts_for_cik calls."""

    def __init__(self, facts: list[RawFact]) -> None:
        self._facts = facts
        self.upserted: list[RawFact] | None = None

    def get_raw_facts(self, cik: int) -> list[RawFact]:
        return list(self._facts)

    def upsert_raw_facts(self, facts) -> int:
        self.upserted = list(facts)
        return len(self.upserted)


async def test_cache_hit_skips_sec_fetch(monkeypatch):
    repo = _FakeRepo([_fact("NetIncomeLoss")])

    async def _boom(client, cik):
        raise AssertionError("should not hit SEC on a cache hit")

    monkeypatch.setattr(routes_module, "fetch_raw_facts_all", _boom)

    result = await routes_module._facts_for_cik(repo, client=None, cik=320193)
    assert len(result) == 1
    assert repo.upserted is None  # nothing written back on a hit


async def test_cache_miss_fetches_and_populates_repo(monkeypatch):
    repo = _FakeRepo([])
    fetched = [_fact("NetIncomeLoss"), _fact("Assets")]

    async def _fake_fetch(client, cik):
        return fetched

    monkeypatch.setattr(routes_module, "fetch_raw_facts_all", _fake_fetch)

    result = await routes_module._facts_for_cik(repo, client=None, cik=320193)
    assert result == fetched
    assert repo.upserted == fetched


async def test_cache_miss_with_no_facts_does_not_upsert(monkeypatch):
    repo = _FakeRepo([])

    async def _fake_fetch(client, cik):
        return []

    monkeypatch.setattr(routes_module, "fetch_raw_facts_all", _fake_fetch)

    result = await routes_module._facts_for_cik(repo, client=None, cik=999999)
    assert result == []
    assert repo.upserted is None

"""Tests for the cache-aside reads in api/routes.py (no network, no real SQLite)."""

from __future__ import annotations

from secfin.api import routes as routes_module
from secfin.normalize.schema import RawFact


def _fact(tag: str, fiscal_year: int = 2024, fiscal_period: str = "FY") -> RawFact:
    return RawFact(
        cik=320193,
        taxonomy="us-gaap",
        gaap_tag=tag,
        label=tag,
        unit="USD",
        value=1,
        fiscal_year=fiscal_year,
        fiscal_period=fiscal_period,
    )


class _FakeRepo:
    """Minimal RawFactRepository double -- just the methods these helpers call."""

    def __init__(self, facts: list[RawFact]) -> None:
        self._facts = facts
        self.upserted: list[RawFact] | None = None

    def get_raw_facts(self, cik: int) -> list[RawFact]:
        return list(self._facts)

    def get_raw_facts_for_period(
        self, cik: int, fiscal_year: int, fiscal_period: str
    ) -> list[RawFact]:
        return [
            f
            for f in self._facts
            if f.fiscal_year == fiscal_year and f.fiscal_period == fiscal_period
        ]

    def has_any_facts(self, cik: int) -> bool:
        return bool(self._facts)

    def upsert_raw_facts(self, facts) -> int:
        self.upserted = list(facts)
        return len(self.upserted)


async def test_cache_hit_skips_sec_fetch(monkeypatch):
    repo = _FakeRepo([_fact("NetIncomeLoss")])

    async def _boom(client, cik):
        raise AssertionError("should not hit SEC on a cache hit")

    monkeypatch.setattr(routes_module, "fetch_raw_facts", _boom)

    result = await routes_module._facts_for_cik(repo, client=None, cik=320193)
    assert len(result) == 1
    assert repo.upserted is None  # nothing written back on a hit


async def test_cache_miss_fetches_and_populates_repo(monkeypatch):
    repo = _FakeRepo([])
    fetched = [_fact("NetIncomeLoss"), _fact("Assets")]

    async def _fake_fetch(client, cik):
        return fetched

    monkeypatch.setattr(routes_module, "fetch_raw_facts", _fake_fetch)

    result = await routes_module._facts_for_cik(repo, client=None, cik=320193)
    assert result == fetched
    assert repo.upserted == fetched


async def test_cache_miss_with_no_facts_does_not_upsert(monkeypatch):
    repo = _FakeRepo([])

    async def _fake_fetch(client, cik):
        return []

    monkeypatch.setattr(routes_module, "fetch_raw_facts", _fake_fetch)

    result = await routes_module._facts_for_cik(repo, client=None, cik=999999)
    assert result == []
    assert repo.upserted is None


async def test_statement_facts_hit_skips_sec_fetch(monkeypatch):
    repo = _FakeRepo([_fact("NetIncomeLoss", 2024, "FY")])

    async def _boom(client, cik):
        raise AssertionError("should not hit SEC on a cache hit")

    monkeypatch.setattr(routes_module, "fetch_raw_facts", _boom)

    result = await routes_module._statement_facts_for_cik(
        repo, client=None, cik=320193, fiscal_year=2024, fiscal_period="FY"
    )
    assert len(result) == 1
    assert repo.upserted is None


async def test_statement_facts_out_of_range_period_on_known_company_skips_sec_fetch(
    monkeypatch,
):
    """The key correctness case for the period-scoped fix: a company that's cached but
    has no data for THIS specific period must not be treated as a cache miss requiring
    a live SEC fetch -- has_any_facts distinguishes "known company, empty period" from
    "never ingested".
    """
    repo = _FakeRepo([_fact("NetIncomeLoss", 2024, "FY")])  # only 2024 FY cached

    async def _boom(client, cik):
        raise AssertionError("should not refetch the whole company for an empty period")

    monkeypatch.setattr(routes_module, "fetch_raw_facts", _boom)

    result = await routes_module._statement_facts_for_cik(
        repo, client=None, cik=320193, fiscal_year=1999, fiscal_period="FY"
    )
    assert result == []
    assert repo.upserted is None


async def test_statement_facts_miss_on_never_ingested_company_fetches_and_filters(
    monkeypatch,
):
    repo = _FakeRepo([])  # never ingested at all
    fetched = [
        _fact("NetIncomeLoss", 2024, "FY"),
        _fact("Assets", 2024, "FY"),
        _fact("NetIncomeLoss", 2023, "FY"),  # a different period in the same fetch
    ]

    async def _fake_fetch(client, cik):
        return fetched

    monkeypatch.setattr(routes_module, "fetch_raw_facts", _fake_fetch)

    result = await routes_module._statement_facts_for_cik(
        repo, client=None, cik=320193, fiscal_year=2024, fiscal_period="FY"
    )

    assert repo.upserted == fetched  # the FULL fetch is cached, not just the one period
    assert {f.gaap_tag for f in result} == {"NetIncomeLoss", "Assets"}
    assert all(f.fiscal_year == 2024 for f in result)  # but the RETURN is period-scoped

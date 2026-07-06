"""Tests for CUSIP -> CIK resolution (secfin.normalize.cusip).

The company_tickers.json rows below are real (Apple, Alphabet, American Express, Ally
Financial), and the 13F nameOfIssuer strings are real too -- lifted from
tests/fixtures/institutional/brk13f_2026q1_infotable_trimmed.xml -- so this test exercises
the actual real-world mismatch (13F says "ALLY FINL INC", SEC's registered title is
"Ally Financial Inc.") that motivates staying conservative rather than fuzzy-matching.
"""

from __future__ import annotations

from secfin.normalize.cusip import (
    CusipResolver,
    cusip_resolution_stats,
    normalize_issuer_name,
    parse_company_name_index,
    resolve_snapshot_cusips,
)
from secfin.normalize.schema import HoldingsSnapshot, InstitutionalHolding
from secfin.storage.sqlite_cusip_repository import SQLiteCusipMapRepository

_COMPANY_TICKERS_PAYLOAD = {
    "0": {"cik_str": 320193, "ticker": "AAPL", "title": "Apple Inc."},
    "1": {"cik_str": 1652044, "ticker": "GOOGL", "title": "Alphabet Inc."},
    "2": {"cik_str": 4962, "ticker": "AXP", "title": "AMERICAN EXPRESS CO"},
    "3": {"cik_str": 40729, "ticker": "ALLY", "title": "Ally Financial Inc."},
}


def test_normalize_issuer_name_strips_case_punctuation_and_legal_suffixes():
    assert normalize_issuer_name("Apple Inc.") == "APPLE"
    assert normalize_issuer_name("APPLE INC") == "APPLE"
    assert normalize_issuer_name("AMERICAN EXPRESS CO") == "AMERICAN EXPRESS"


def test_normalize_issuer_name_does_not_expand_abbreviations():
    # This is the real case that must NOT match -- "FINL" is not expanded to "FINANCIAL".
    assert normalize_issuer_name("ALLY FINL INC") == "ALLY FINL"
    assert normalize_issuer_name("Ally Financial Inc.") == "ALLY FINANCIAL"
    assert normalize_issuer_name("ALLY FINL INC") != normalize_issuer_name("Ally Financial Inc.")


def test_parse_company_name_index_keys_by_normalized_title():
    index = parse_company_name_index(_COMPANY_TICKERS_PAYLOAD)
    assert index["APPLE"] == 320193
    assert index["ALPHABET"] == 1652044
    assert index["AMERICAN EXPRESS"] == 4962
    assert index["ALLY FINANCIAL"] == 40729


class _FakeClient:
    def __init__(self, payload: dict) -> None:
        self.payload = payload
        self.calls = 0

    def company_tickers_url(self) -> str:
        return "http://fake/company_tickers.json"

    async def get_json(self, url: str) -> dict:
        self.calls += 1
        return self.payload


async def test_resolver_resolves_an_exact_normalized_match(tmp_path):
    repo = SQLiteCusipMapRepository(tmp_path / "secfin.db")
    resolver = CusipResolver(repo, ttl_seconds=3600)
    client = _FakeClient(_COMPANY_TICKERS_PAYLOAD)

    cik = await resolver.resolve(client, "02079K107", "ALPHABET INC")

    assert cik == 1652044
    assert repo.get_cik("02079K107") == 1652044
    repo.close()


async def test_resolver_leaves_abbreviated_name_unresolved_rather_than_guessing(tmp_path):
    """Real case: Berkshire's 13F reports "ALLY FINL INC" for CUSIP 02005N100, but SEC's
    registered title is "Ally Financial Inc." -- this must stay unresolved, not get
    fuzzy-matched to Ally Financial's CIK."""
    repo = SQLiteCusipMapRepository(tmp_path / "secfin.db")
    resolver = CusipResolver(repo, ttl_seconds=3600)
    client = _FakeClient(_COMPANY_TICKERS_PAYLOAD)

    cik = await resolver.resolve(client, "02005N100", "ALLY FINL INC")

    assert cik is None
    assert repo.get_cik("02005N100") is None
    assert [u["cusip"] for u in repo.unresolved_cusips()] == ["02005N100"]
    repo.close()


async def test_resolver_serves_repeat_lookups_from_the_repo_without_refetching(tmp_path):
    repo = SQLiteCusipMapRepository(tmp_path / "secfin.db")
    resolver = CusipResolver(repo, ttl_seconds=3600)
    client = _FakeClient(_COMPANY_TICKERS_PAYLOAD)

    first = await resolver.resolve(client, "037833100", "APPLE INC")
    second = await resolver.resolve(client, "037833100", "APPLE INC")

    assert first == second == 320193
    # Second call was a repo cache hit -- the name index was fetched only once.
    assert client.calls == 1
    repo.close()


async def test_resolve_snapshot_cusips_populates_cik_in_place(tmp_path):
    repo = SQLiteCusipMapRepository(tmp_path / "secfin.db")
    resolver = CusipResolver(repo, ttl_seconds=3600)
    client = _FakeClient(_COMPANY_TICKERS_PAYLOAD)
    snapshot = HoldingsSnapshot(
        manager_cik=1000,
        report_period="2026-03-31",
        holdings=[
            InstitutionalHolding(cusip="037833100", issuer_name="APPLE INC"),
            InstitutionalHolding(cusip="02079K107", issuer_name="ALPHABET INC"),
            # Real, deliberately-unresolvable case (see module docstring).
            InstitutionalHolding(cusip="02005N100", issuer_name="ALLY FINL INC"),
            # No issuer_name at all -- nothing to match against, must not raise.
            InstitutionalHolding(cusip="000000000", issuer_name=None),
        ],
    )

    await resolve_snapshot_cusips(client, resolver, snapshot)

    by_cusip = {h.cusip: h.cik for h in snapshot.holdings}
    assert by_cusip["037833100"] == 320193
    assert by_cusip["02079K107"] == 1652044
    assert by_cusip["02005N100"] is None
    assert by_cusip["000000000"] is None
    repo.close()


def test_cusip_resolution_stats_on_an_empty_repo_reports_no_rate(tmp_path):
    repo = SQLiteCusipMapRepository(tmp_path / "secfin.db")
    stats = cusip_resolution_stats(repo)

    assert stats.resolved == 0
    assert stats.unresolved == 0
    assert stats.total == 0
    assert stats.resolution_rate is None  # nothing attempted yet -- not a 0% rate
    repo.close()


def test_cusip_resolution_stats_computes_rate(tmp_path):
    repo = SQLiteCusipMapRepository(tmp_path / "secfin.db")
    repo.record_resolved("037833100", 320193, "APPLE INC")
    repo.record_resolved("02079K107", 1652044, "ALPHABET INC")
    repo.record_resolved("004962", 4962, "AMERICAN EXPRESS CO")
    repo.record_unresolved("02005N100", "ALLY FINL INC")

    stats = cusip_resolution_stats(repo)

    assert stats.resolved == 3
    assert stats.unresolved == 1
    assert stats.total == 4
    assert stats.resolution_rate == 0.75
    repo.close()


def test_cusip_resolution_stats_reflects_a_cusip_resolving_later():
    """The rate is expected to drift upward over time, never downward, as a CUSIP
    unresolved on one attempt matches on a later one (see the module docstring)."""
    repo = SQLiteCusipMapRepository(":memory:")
    repo.record_unresolved("02005N100", "ALLY FINL INC")
    assert cusip_resolution_stats(repo).resolution_rate == 0.0

    repo.record_resolved("02005N100", 40729, "Ally Financial Inc.")

    assert cusip_resolution_stats(repo).resolution_rate == 1.0
    repo.close()

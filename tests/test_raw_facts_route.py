"""Tests for the INTERNAL-ONLY raw-facts endpoint (docs/ROADMAP_DATA_DEPTH.md Phase 1).

Handler-level tests call `get_raw_facts` directly with fakes (the
tests/test_routes_cache.py pattern -- no network, no real SQLite); the gating/wiring
tests go through a TestClient because router-level dependencies and OpenAPI hiding
only exist through FastAPI's routing (the tests/test_app_auth_wiring.py pattern).
The gated requests are rejected before the endpoint body runs, and the one request
that does reach the body uses a digits CIK, so nothing here needs ticker resolution.
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient

from secfin.api import routes as routes_module
from secfin.api.routes import get_raw_facts
from secfin.config import settings
from secfin.normalize.mapping import concept_for_tag
from secfin.sec.companyfacts import flatten_company_facts

FIXTURES_DIR = Path(__file__).parent / "fixtures"


class _FakeRepo:
    def __init__(self, facts) -> None:
        self._facts = facts

    def get_raw_facts(self, cik: int):
        return [f for f in self._facts if f.cik == cik]

    def upsert_raw_facts(self, facts) -> int:  # pragma: no cover - not hit on cache hits
        raise AssertionError("cache hit expected; nothing should be upserted")


class _FakeTickerCache:
    def __init__(self, mapping: dict[str, int]) -> None:
        self.mapping = mapping

    async def resolve(self, client, ticker: str):
        return self.mapping.get(ticker.upper())


def _aapl_repo() -> _FakeRepo:
    payload = json.loads((FIXTURES_DIR / "aapl_companyfacts.json").read_text())
    return _FakeRepo(flatten_company_facts(payload, 320193))


async def _call(repo, **overrides):
    """Call the handler with every parameter explicit (direct calls bypass FastAPI, so
    omitted parameters would be raw Query(...) defaults, not their values)."""
    params = dict(
        symbol="320193",
        tag=None,
        year=None,
        period=None,
        taxonomy=None,
        limit=100,
        offset=0,
        repo=repo,
        ticker_cache=_FakeTickerCache({"AAPL": 320193}),
    )
    params.update(overrides)
    return await get_raw_facts(**params)


async def test_requires_at_least_one_filter():
    with pytest.raises(HTTPException) as exc_info:
        await _call(_aapl_repo())
    assert exc_info.value.status_code == 400


async def test_period_requires_year():
    with pytest.raises(HTTPException) as exc_info:
        await _call(_aapl_repo(), period="FY")
    assert exc_info.value.status_code == 400


async def test_unknown_ticker_404s():
    with pytest.raises(HTTPException) as exc_info:
        await _call(_aapl_repo(), symbol="ZZZZ", year=2025)
    assert exc_info.value.status_code == 404


async def test_unmapped_tag_round_trips_with_full_fidelity():
    # ContractWithCustomerLiability (TOTAL deferred revenue) is deliberately unmapped --
    # only its Current variant became a canonical concept (deferred_revenue_current).
    # This endpoint is exactly how that number stays reachable.
    assert concept_for_tag("ContractWithCustomerLiability") is None

    resp = await _call(
        _aapl_repo(),
        symbol="AAPL",  # ticker path, via the fake cache
        tag=["ContractWithCustomerLiability"],
        year=2025,
        period="FY",
    )
    assert resp.cik == 320193
    assert resp.total == 2  # the primary instant AND the comparative -- nothing dropped
    assert resp.caveats  # the fy/fp-trap caveats are always present
    assert any("fiscal_year/fiscal_period are the FILING's period" in c for c in resp.caveats)

    # Deterministic order: sorted by date, so comparative (2024-09-28) precedes primary.
    comparative, primary = resp.facts
    assert comparative.instant == "2024-09-28"
    assert comparative.value == 12800000000
    assert comparative.frame == "CY2024Q3I"  # SEC frame string passes through untouched
    assert primary.instant == "2025-09-27"
    assert primary.value == 13700000000
    for row in (comparative, primary):
        assert row.taxonomy == "us-gaap"
        assert row.gaap_tag == "ContractWithCustomerLiability"
        assert row.unit == "USD"
        # Source-faithful flattening: an instant fact carries period_end == instant
        # (sec/companyfacts.py sets instant from `end` when there's no `start`) --
        # served as stored, not tidied.
        assert row.period_start is None
        assert row.period_end == row.instant
        assert (row.fiscal_year, row.fiscal_period) == (2025, "FY")
        assert row.form == "10-K"
        assert row.filed == "2025-10-31"
        assert row.accession == "0000320193-25-000079"
        assert row.is_extension is False


async def test_pagination_is_stable_and_total_is_pre_pagination():
    repo = _aapl_repo()
    full = await _call(repo, tag=["ContractWithCustomerLiability"], year=2025, period="FY")
    first = await _call(
        repo, tag=["ContractWithCustomerLiability"], year=2025, period="FY", limit=1
    )
    second = await _call(
        repo, tag=["ContractWithCustomerLiability"], year=2025, period="FY", limit=1, offset=1
    )
    assert first.total == second.total == full.total == 2
    assert [first.facts[0], second.facts[0]] == full.facts
    assert (first.limit, first.offset) == (1, 0)
    assert (second.limit, second.offset) == (1, 1)


async def test_year_filter_spans_tags_and_taxonomy_filter_narrows():
    repo = _aapl_repo()
    year_only = await _call(repo, year=2025, period="FY")
    # The whole fiscal key's fact count -- matches the coverage_report totals in
    # tests/test_real_fixtures.py (296 unmapped + 129 mapped).
    assert year_only.total == 425
    assert len(year_only.facts) == 100  # default page size

    gaap_only = await _call(repo, year=2025, period="FY", taxonomy="us-gaap")
    assert gaap_only.total == 425  # fixture has dei stripped, so us-gaap is everything
    none_match = await _call(repo, year=2025, period="FY", taxonomy="dei")
    assert none_match.total == 0
    assert none_match.facts == []


def _wiring_client(tmp_path, monkeypatch) -> TestClient:
    monkeypatch.setattr(settings, "secfin_db_path", str(tmp_path / "test.db"))

    async def _no_fetch(client, cik):  # pragma: no cover - safety net
        return []

    monkeypatch.setattr(routes_module, "fetch_raw_facts_all", _no_fetch)
    from secfin.api.main import app

    return TestClient(app)


def test_wiring_rejects_missing_or_wrong_admin_secret(tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "secfin_admin_secret", "test-secret")
    with _wiring_client(tmp_path, monkeypatch) as client:
        no_header = client.get("/v1/companies/320193/facts?year=2025")
        wrong = client.get(
            "/v1/companies/320193/facts?year=2025", headers={"X-Admin-Secret": "nope"}
        )
    assert no_header.status_code == 401
    assert wrong.status_code == 401


def test_wiring_503s_when_admin_secret_unconfigured(tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "secfin_admin_secret", "")
    with _wiring_client(tmp_path, monkeypatch) as client:
        resp = client.get("/v1/companies/320193/facts?year=2025")
    assert resp.status_code == 503


def test_wiring_reaches_handler_with_correct_secret(tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "secfin_admin_secret", "test-secret")
    with _wiring_client(tmp_path, monkeypatch) as client:
        # Digits CIK (no ticker resolution); fresh empty DB + patched fetch -> no facts,
        # so an empty page proves the request passed the gate and ran the handler.
        resp = client.get(
            "/v1/companies/320193/facts?year=2025", headers={"X-Admin-Secret": "test-secret"}
        )
    assert resp.status_code == 200
    body = resp.json()
    assert body["cik"] == 320193
    assert body["total"] == 0
    assert body["caveats"]


def test_endpoint_is_hidden_from_the_openapi_schema(tmp_path, monkeypatch):
    with _wiring_client(tmp_path, monkeypatch) as client:
        paths = client.get("/openapi.json").json()["paths"]
    assert not any("/facts" in p for p in paths)
    assert "/v1/companies/{symbol}/statements/{statement}" in paths  # sanity: schema is real

"""Tests for the tag-level normalized view (normalize/statements.build_normalized_view)
and its public endpoint -- the "normalize without mapping" layer from ROADMAP_DATA_DEPTH.

Unit tests use the same filing-realistic fact shapes as tests/test_mapping.py (fy/fp are
the FILING's period, so comparative columns share them); the fixture test pins the view
against the real AAPL payload with an independently-computed row count; the wiring test
confirms the endpoint sits behind the customer API key.
"""

from __future__ import annotations

import json
from pathlib import Path

from fastapi.testclient import TestClient

from secfin.api import routes as routes_module
from secfin.config import settings
from secfin.normalize.schema import RawFact
from secfin.normalize.statements import build_normalized_view
from secfin.sec.companyfacts import flatten_company_facts

FIXTURES_DIR = Path(__file__).parent / "fixtures"


def _fact(
    tag: str,
    val: float | None,
    *,
    start: str | None = None,
    end: str | None = None,
    instant: str | None = None,
    unit: str = "USD",
    taxonomy: str = "us-gaap",
    fy: int = 2023,
    fp: str = "FY",
    filed: str = "2023-11-03",
) -> RawFact:
    return RawFact(
        cik=320193,
        taxonomy=taxonomy,
        gaap_tag=tag,
        label=tag,
        unit=unit,
        value=val,
        period_start=start,
        period_end=end,
        instant=instant,
        fiscal_year=fy,
        fiscal_period=fp,
        form="10-K",
        filed=filed,
        accession="0000320193-23-000106",
    )


def test_serves_every_tag_not_just_mapped_ones():
    facts = [
        _fact("RevenueFromContractWithCustomerExcludingAssessedTax", 383e9,
              start="2022-09-25", end="2023-09-30"),
        _fact("SomeObscureDisclosureTag", 42e6, start="2022-09-25", end="2023-09-30"),
    ]
    view = build_normalized_view(facts, 320193, 2023, "FY")
    by_tag = {r.gaap_tag: r for r in view.rows}
    assert by_tag["RevenueFromContractWithCustomerExcludingAssessedTax"].canonical_concept == "revenue"
    assert by_tag["SomeObscureDisclosureTag"].canonical_concept is None
    assert by_tag["SomeObscureDisclosureTag"].value == 42e6


def test_comparative_columns_are_dropped_for_all_tags():
    facts = [
        _fact("SomeObscureDisclosureTag", 1e6, start="2021-09-26", end="2022-09-24"),
        _fact("SomeObscureDisclosureTag", 2e6, start="2022-09-25", end="2023-09-30"),
        _fact("ComparativeOnlyTag", 9e6, start="2021-09-26", end="2022-09-24"),
    ]
    view = build_normalized_view(facts, 320193, 2023, "FY")
    by_tag = {r.gaap_tag: r for r in view.rows}
    assert by_tag["SomeObscureDisclosureTag"].value == 2e6  # primary column, not comparative
    assert "ComparativeOnlyTag" not in by_tag  # dropped, not borrowed
    assert view.period_end == "2023-09-30"


def test_discrete_quarter_beats_ytd_for_unmapped_tags_too():
    facts = [
        _fact("SomeObscureDisclosureTag", 293e6, start="2023-01-01", end="2023-09-30", fp="Q3"),
        _fact("SomeObscureDisclosureTag", 89e6, start="2023-07-01", end="2023-09-30", fp="Q3"),
    ]
    view = build_normalized_view(facts, 320193, 2023, "Q3")
    assert [r.value for r in view.rows] == [89e6]


def test_tag_reported_in_two_units_keeps_both_rows():
    facts = [
        _fact("DualUnitTag", 5e9, instant="2023-09-30"),
        _fact("DualUnitTag", 123456, instant="2023-09-30", unit="shares"),
    ]
    view = build_normalized_view(facts, 320193, 2023, "FY")
    assert {(r.unit, r.value) for r in view.rows} == {("USD", 5e9), ("shares", 123456)}


def test_dei_row_is_served_without_anchoring_the_column():
    facts = [
        _fact("Assets", 359e9, instant="2023-09-30"),
        _fact("EntityCommonStockSharesOutstanding", 14.7e9, instant="2023-10-17",
              taxonomy="dei", unit="shares"),
    ]
    view = build_normalized_view(facts, 320193, 2023, "FY")
    assert view.period_end == "2023-09-30"  # anchored by us-gaap, not the dei cover page
    by_tag = {r.gaap_tag: r for r in view.rows}
    assert by_tag["EntityCommonStockSharesOutstanding"].value == 14.7e9


def test_restatement_latest_filed_wins_and_null_values_are_dropped():
    facts = [
        _fact("SomeObscureDisclosureTag", 1e6, instant="2023-09-30", filed="2023-11-03"),
        _fact("SomeObscureDisclosureTag", 2e6, instant="2023-09-30", filed="2024-02-01"),
        _fact("NullValueTag", None, instant="2023-09-30"),
    ]
    view = build_normalized_view(facts, 320193, 2023, "FY")
    assert [r.value for r in view.rows] == [2e6]


def test_aapl_fixture_full_view():
    payload = json.loads((FIXTURES_DIR / "aapl_companyfacts.json").read_text())
    facts = flatten_company_facts(payload, 320193)
    view = build_normalized_view(facts, 320193, 2025, "FY")

    assert view.period_end == "2025-09-27"
    assert view.period_start == "2024-09-29"  # header prefers a span-matching duration
    assert view.form == "10-K"
    assert view.accession == "0000320193-25-000079"
    # Independently computed from the fixture JSON: distinct (tag, unit) with a
    # non-null point in the primary column (fy=2025, fp=FY, end=2025-09-27).
    assert len(view.rows) == 187

    by_tag = {r.gaap_tag: r for r in view.rows}
    # A mapped tag cross-links to its canonical concept with the statement's value...
    rev = by_tag["RevenueFromContractWithCustomerExcludingAssessedTax"]
    assert rev.value == 416161000000
    assert rev.canonical_concept == "revenue"
    # ...total deferred revenue cross-links to the tranche-1 concept it now feeds...
    total_dr = by_tag["ContractWithCustomerLiability"]
    assert total_dr.value == 13700000000
    assert total_dr.canonical_concept == "deferred_revenue"
    # ...and a genuinely unmapped tag (a parenthetical share count -- single-tag
    # non-face elements stay tag-level by design) is served right alongside.
    issued = by_tag["CommonStockSharesIssued"]
    assert issued.value == 14773260000
    assert issued.unit == "shares"
    assert issued.canonical_concept is None
    # Every non-dei row sits in the primary column -- no comparative leakage anywhere.
    assert all(
        (r.period_end or r.instant) == "2025-09-27"
        for r in view.rows
        if r.taxonomy != "dei"
    )


def test_endpoint_requires_an_api_key(tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "secfin_db_path", str(tmp_path / "test.db"))

    async def _no_fetch(client, cik):  # pragma: no cover - never reached (401 first)
        return []

    monkeypatch.setattr(routes_module, "fetch_raw_facts_all", _no_fetch)
    from secfin.api.main import app

    with TestClient(app) as client:
        resp = client.get("/v1/companies/320193/normalized-facts?year=2025")
        paths = client.get("/openapi.json").json()["paths"]
    assert resp.status_code == 401  # customer-key-gated, unlike the admin /facts
    assert "/v1/companies/{symbol}/normalized-facts" in paths  # public schema, unlike /facts

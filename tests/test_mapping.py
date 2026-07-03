"""Tests for the normalization layer (no network required)."""

from __future__ import annotations

from secfin.normalize.mapping import candidate_tags, concept_for_tag
from secfin.normalize.schema import RawFact
from secfin.normalize.statements import build_statement


def test_tag_maps_to_concept():
    assert concept_for_tag("NetIncomeLoss") == "net_income"
    assert concept_for_tag("Assets") == "total_assets"
    assert concept_for_tag("SomeUnknownTag") is None


def test_candidate_tags_is_ordered():
    tags = candidate_tags("revenue")
    assert tags[0] == "RevenueFromContractWithCustomerExcludingAssessedTax"
    assert "Revenues" in tags


def _fact(tag: str, val: float, filed: str) -> RawFact:
    return RawFact(
        cik=320193,
        taxonomy="us-gaap",
        gaap_tag=tag,
        label=tag,
        unit="USD",
        value=val,
        period_start="2023-10-01",
        period_end="2024-09-28",
        fiscal_year=2024,
        fiscal_period="FY",
        form="10-K",
        filed=filed,
        accession="0000320193-24-000123",
    )


def test_build_statement_prefers_first_candidate():
    facts = [
        _fact("Revenues", 100, "2024-11-01"),
        _fact("RevenueFromContractWithCustomerExcludingAssessedTax", 383, "2024-11-01"),
        _fact("NetIncomeLoss", 97, "2024-11-01"),
    ]
    stmt = build_statement(facts, 320193, "income", 2024, "FY")
    revenue = next(line for line in stmt.lines if line.canonical_concept == "revenue")
    # first candidate in the mapping wins over "Revenues"
    assert revenue.value == 383
    assert revenue.source_tag == "RevenueFromContractWithCustomerExcludingAssessedTax"


def test_restatement_latest_filed_wins():
    facts = [
        _fact("NetIncomeLoss", 90, "2024-11-01"),
        _fact("NetIncomeLoss", 97, "2025-02-01"),  # later restatement
    ]
    stmt = build_statement(facts, 320193, "income", 2024, "FY")
    net = next(line for line in stmt.lines if line.canonical_concept == "net_income")
    assert net.value == 97

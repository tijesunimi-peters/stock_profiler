"""Tests for cross-company screening reconciliation logic (secfin.normalize.screening)."""

from __future__ import annotations

from secfin.normalize.screening import (
    SCREENABLE_CONCEPTS,
    facts_from_frame,
    frame_period_for_concept,
    is_instant_concept,
    resolve_concept_values,
)
from secfin.sec.frames import FrameFact


def test_is_instant_concept_splits_balance_sheet_from_income():
    assert is_instant_concept("total_assets") is True
    assert is_instant_concept("stockholders_equity") is True
    assert is_instant_concept("revenue") is False
    assert is_instant_concept("net_income") is False


def test_frame_period_for_concept_picks_duration_or_instant_builder():
    assert frame_period_for_concept("revenue", 2023, "FY") == "CY2023"
    assert frame_period_for_concept("total_assets", 2023, "FY") == "CY2023Q4I"


def test_facts_from_frame_sets_instant_vs_duration_fields():
    frame_facts = [
        FrameFact(
            cik=320193,
            entity_name="Apple Inc.",
            value=1000.0,
            accession="0001-24-000001",
            period_start=None,
            period_end="2023-12-31",
        )
    ]
    facts = facts_from_frame("total_assets", "Assets", "CY2023Q4I", frame_facts)

    assert len(facts) == 1
    f = facts[0]
    assert f.cik == 320193
    assert f.gaap_tag == "Assets"
    assert f.taxonomy == "us-gaap"
    assert f.value == 1000.0
    assert f.instant == "2023-12-31"
    assert f.period_start is None
    assert f.period_end is None
    assert f.frame == "CY2023Q4I"
    assert f.accession == "0001-24-000001"
    assert f.is_extension is False


def test_facts_from_frame_duration_concept_sets_start_and_end():
    frame_facts = [
        FrameFact(
            cik=1,
            entity_name="A",
            value=500.0,
            accession="acc-1",
            period_start="2023-01-01",
            period_end="2023-12-31",
        )
    ]
    facts = facts_from_frame("revenue", "Revenues", "CY2023", frame_facts)

    assert facts[0].period_start == "2023-01-01"
    assert facts[0].period_end == "2023-12-31"
    assert facts[0].instant is None


def test_resolve_concept_values_prefers_higher_priority_tag():
    # "revenue"'s candidate order: RevenueFromContractWithCustomerExcludingAssessedTax,
    # Revenues, SalesRevenueNet, RevenueFromContractWithCustomerIncludingAssessedTax.
    rows = [
        (1, "Revenues", 100.0),
        (1, "RevenueFromContractWithCustomerExcludingAssessedTax", 200.0),
        (2, "SalesRevenueNet", 50.0),
    ]
    values = resolve_concept_values(rows, "revenue")
    assert values[1] == 200.0  # higher-priority tag wins over the lower-priority one
    assert values[2] == 50.0


def test_resolve_concept_values_ignores_tags_not_in_candidate_list():
    rows = [(1, "SomeUnrelatedTag", 999.0)]
    values = resolve_concept_values(rows, "revenue")
    assert values == {}


def test_screenable_concepts_are_all_real_canonical_concepts():
    from secfin.normalize.mapping import CONCEPTS

    for concept in SCREENABLE_CONCEPTS:
        assert concept in CONCEPTS

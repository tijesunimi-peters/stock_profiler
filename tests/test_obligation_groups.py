"""Tests for §07's obligation groups -- `OBLIGATION_GROUPS` + the `/obligations` route.

Group resolution itself is covered by `test_footnote_groups.py`; these pin what makes §07
DIFFERENT, which is almost entirely about how it handles being mostly empty:

* it is the lowest-coverage section on the page, so an absence must be attributed to the market
  rather than to the filer,
* three unrelated tag families mean the same thing, and the union is what a card can render,
* two pairs of concepts look mergeable and are not -- a letter of credit is not a guarantee, and
  severance is a component of a restructuring charge rather than a synonym for it,
* a headcount and a dollar amount share a card.
"""

from __future__ import annotations

import pytest

from secfin.normalize.mapping import (
    OBLIGATION_GROUP_NOTES,
    OBLIGATION_GROUPS,
    candidate_tags,
    obligation_concepts,
    obligation_primary,
)
from secfin.normalize.schema import RawFact
from secfin.normalize.statements import build_concept_group


def _fact(tag, value=1_000.0, *, unit="USD", fiscal_year=2025, fiscal_period="FY"):
    return RawFact(
        cik=320193,
        taxonomy="us-gaap",
        gaap_tag=tag,
        label=tag,
        unit=unit,
        value=value,
        fiscal_year=fiscal_year,
        fiscal_period=fiscal_period,
        accession="0000320193-25-000079",
        filed="2025-10-30",
    )


def _tag(concept: str) -> str:
    return candidate_tags(concept)[0]


def _group(facts, group):
    return build_concept_group(facts, 320193, group, 2025, "FY", OBLIGATION_GROUPS)


class TestRegistryShape:
    @pytest.mark.parametrize("group", sorted(OBLIGATION_GROUPS))
    def test_primaries_are_drawn_from_the_groups_own_concepts(self, group):
        assert obligation_primary(group)
        assert set(obligation_primary(group)) <= set(obligation_concepts(group))

    @pytest.mark.parametrize("group", sorted(OBLIGATION_GROUPS))
    def test_every_concept_resolves_to_at_least_one_tag(self, group):
        for concept in obligation_concepts(group):
            assert candidate_tags(concept), f"{concept} maps to no tag"

    @pytest.mark.parametrize("group", sorted(OBLIGATION_GROUPS))
    def test_every_group_explains_its_own_emptiness(self, group):
        """At 20-26% coverage the empty card is the COMMON case, so a note is not optional here."""
        assert OBLIGATION_GROUP_NOTES.get(group)


class TestConceptsThatLookMergeableAndAreNot:
    def test_a_letter_of_credit_is_not_a_guarantee(self):
        """Merging them would take guarantee coverage from 4% to 17% by reporting a bank's
        undertaking bought BY this filer under a heading that means a promise made by it."""
        guarantees = set(candidate_tags("guarantee_obligations"))
        loc = set(candidate_tags("letters_of_credit"))
        assert guarantees and loc
        assert not (guarantees & loc)
        assert all("Guarantee" in t for t in guarantees)
        assert all("LettersOfCredit" in t or "LetterOfCredit" in t for t in loc)

    def test_severance_is_a_component_not_a_fallback_for_the_charge(self):
        """`SeveranceCosts1` is on 8.5% of filers against 17.9% for the charge. Using it as a
        fallback would report one component as if it were the whole restructuring."""
        assert "SeveranceCosts1" not in candidate_tags("restructuring_charge")
        assert candidate_tags("severance_costs") == ["SeveranceCosts1"]
        assert "severance_costs" not in obligation_primary("restructuring")

    def test_the_broadest_purchase_tag_resolves_last(self):
        """`ContractualObligation` can include debt and leases already shown elsewhere on the
        page, so it must never win over a tag that means purchase commitments specifically."""
        tags = candidate_tags("purchase_obligation")
        assert tags[-1] == "ContractualObligation"
        assert tags.index("PurchaseObligation") < tags.index("ContractualObligation")


class TestTheUnionIsWhatTheCardCanRender:
    """No single purchase-commitment tag reaches 15% of filers; three families exist. A card that
    read only the most common one would be blank for filers that plainly did disclose."""

    @pytest.mark.parametrize(
        "tag",
        [
            "PurchaseObligation",
            "UnrecordedUnconditionalPurchaseObligationBalanceSheetAmount",
            "ContractualObligation",
            "LongTermPurchaseCommitmentAmount",
            "OtherCommitment",
        ],
    )
    def test_any_family_alone_resolves_the_card(self, tag):
        assert _group([_fact(tag, 5_000.0)], "purchase_commitments")["status"] == "ok"

    def test_a_total_without_a_ladder_still_resolves(self):
        """Roughly one filer in twenty tags the anniversary variants. Requiring the ladder would
        blank the card for the nineteen that disclosed a total."""
        result = _group([_fact("PurchaseObligation", 5_000.0)], "purchase_commitments")
        assert result["status"] == "ok"
        assert [ln.canonical_concept for ln in result["lines"]] == ["purchase_obligation"]

    def test_the_ladder_renders_when_the_filer_tagged_it(self):
        facts = [
            _fact(_tag("purchase_obligation_y1"), 100.0),
            _fact(_tag("purchase_obligation_y2"), 200.0),
            _fact(_tag("purchase_obligation_thereafter"), 300.0),
        ]
        resolved = {ln.canonical_concept for ln in _group(facts, "purchase_commitments")["lines"]}
        assert resolved == {
            "purchase_obligation_y1",
            "purchase_obligation_y2",
            "purchase_obligation_thereafter",
        }


class TestRestructuring:
    def test_positions_eliminated_cannot_make_the_card_ok_on_its_own(self):
        """It is the Scope tile -- context for a restructuring, not evidence one happened."""
        facts = [_fact(_tag("restructuring_positions"), 500.0, unit="employee")]
        assert _group(facts, "restructuring")["status"] == "na"

    def test_a_headcount_and_a_dollar_amount_keep_their_own_units(self):
        facts = [
            _fact(_tag("restructuring_charge"), 1_200_000_000.0, unit="USD"),
            _fact(_tag("restructuring_positions"), 500.0, unit="employee"),
        ]
        units = {ln.canonical_concept: ln.unit for ln in _group(facts, "restructuring")["lines"]}
        assert units["restructuring_charge"] == "USD"
        # `employee`, as EDGAR actually serves it (verified live on Howmet Aerospace).
        assert units["restructuring_positions"] == "employee"


class TestAbsenceIsAttributedToTheMarketNotTheFiler:
    @pytest.mark.parametrize("group", sorted(OBLIGATION_GROUPS))
    def test_coverage_is_declared_and_matches_what_was_measured(self, group):
        coverage = OBLIGATION_GROUPS[group][2]
        # Measured 2026-08-04 over 485 filers, FY2023+. Nothing in §07 clears a third.
        assert 0.05 < coverage < 0.35

    def test_the_note_says_untagged_rather_than_uncommitted(self):
        note = OBLIGATION_GROUP_NOTES["purchase_commitments"]
        assert "untagged, not uncommitted" in note

    def test_restructuring_is_the_one_group_where_absence_really_can_mean_zero(self):
        """The other two groups' absences say nothing about the filer. This one usually does mean
        the company is not restructuring, and conflating the two would be a false equivalence."""
        assert "not restructuring" in OBLIGATION_GROUP_NOTES["restructuring"]

    def test_an_empty_group_carries_its_coverage(self):
        result = _group([], "guarantees")
        assert result["status"] == "na"
        assert result["coverage"] == OBLIGATION_GROUPS["guarantees"][2]
        assert result["lines"] == []

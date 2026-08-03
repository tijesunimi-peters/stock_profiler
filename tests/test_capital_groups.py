"""Tests for §04's capital-structure groups -- `CAPITAL_GROUPS` + the `/capital` route.

These share `build_concept_group` with the footnote groups, so the resolution itself is covered by
`test_footnote_groups.py`. What is tested here is what makes §04 DIFFERENT:

* units -- share counts and dollar amounts sit in the same group, and the tags that would raise
  coverage are the ones that would put dollars in a share column,
* the empty-card reason -- an absence caused by the whole market retiring a tag must not be
  reported as this filer's choice,
* the roll-forward is not forced to balance, and no plug row is invented.
"""

from __future__ import annotations

import pytest

from secfin.normalize.mapping import (
    CAPITAL_GROUP_NOTES,
    CAPITAL_GROUPS,
    candidate_tags,
    capital_concepts,
    capital_primary,
)
from secfin.normalize.schema import RawFact
from secfin.normalize.statements import build_concept_group


def _fact(tag, value=1_000.0, *, unit="shares", fiscal_year=2025, fiscal_period="FY"):
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


class TestRegistryShape:
    @pytest.mark.parametrize("group", sorted(CAPITAL_GROUPS))
    def test_primaries_are_drawn_from_the_groups_own_concepts(self, group):
        assert capital_primary(group)
        assert set(capital_primary(group)) <= set(capital_concepts(group))

    @pytest.mark.parametrize("group", sorted(CAPITAL_GROUPS))
    def test_every_concept_resolves_to_at_least_one_tag(self, group):
        for concept in capital_concepts(group):
            assert candidate_tags(concept), f"{concept} maps to no tag"

    def test_shares_outstanding_is_not_a_primary_of_dilution(self):
        """It is the DENOMINATOR. A card that went green because it found the share count would be
        reporting overhang it does not have."""
        assert "shares_outstanding" in capital_concepts("dilution")
        assert "shares_outstanding" not in capital_primary("dilution")


class TestUnitsAreNotTradedForCoverage:
    """The tags that would raise coverage are the ones that would make the cards wrong.

    For both of these, a MORE common sibling tag exists and measures something else in another
    unit. Mapping it would lift the coverage number and put dollars under a heading that says
    shares -- an error invisible to a reader, since both are large positive numbers.
    """

    def test_repurchased_count_maps_shares_not_the_more_common_value_tags(self):
        tags = candidate_tags("shares_repurchased_count")
        assert all(t.endswith("Shares") for t in tags), tags
        assert not any(t.endswith("Value") for t in tags), tags

    def test_options_outstanding_maps_the_count_not_the_intrinsic_value(self):
        tags = candidate_tags("options_outstanding")
        assert any(t.endswith("OptionsOutstandingNumber") for t in tags)
        assert not any("IntrinsicValue" in t for t in tags)

    def test_unvested_awards_maps_a_count_not_unrecognised_cost(self):
        """`…NonvestedAwardsTotalCompensationCostNotYetRecognized` is on 7 of 10 deep filers versus
        4 for the count -- and is unrecognised expense in dollars, not shares that may vest."""
        tags = candidate_tags("unvested_awards")
        assert all("CompensationCost" not in t for t in tags), tags
        assert any(t.endswith("NonvestedNumber") for t in tags)

    def test_a_group_can_carry_both_units_and_each_line_keeps_its_own(self):
        facts = [
            _fact(_tag("share_repurchases"), 90_711_000_000, unit="USD"),
            _fact(_tag("shares_repurchased_count"), 402_000_000, unit="shares"),
        ]
        result = build_concept_group(facts, 320193, "buyback", 2025, "FY", CAPITAL_GROUPS)
        units = {ln.canonical_concept: ln.unit for ln in result["lines"]}
        assert units["share_repurchases"] == "USD"
        assert units["shares_repurchased_count"] == "shares"


class TestTheRollForwardIsNotForcedToBalance:
    def test_only_the_movements_the_filer_tagged_are_returned(self):
        """Opening + issued - repurchased = closing holds only if every movement is tagged, and
        they are not. Returning the rows that exist is honest; inventing a plug row to make the
        identity close would be arithmetic nobody filed."""
        facts = [
            _fact(_tag("shares_issued"), 14_773_260_000),
            _fact(_tag("shares_repurchased_count"), 402_000_000),
        ]
        result = build_concept_group(facts, 320193, "share_rollforward", 2025, "FY", CAPITAL_GROUPS)
        resolved = {ln.canonical_concept for ln in result["lines"]}
        assert resolved == {"shares_issued", "shares_repurchased_count"}
        assert result["status"] == "ok"
        assert all(ln.value is not None for ln in result["lines"])


class TestAbsenceIsAttributedToTheRightParty:
    """The lesson that cost this section a rewrite.

    Coverage was first measured as "filers who ever tagged this", which said 83% for options
    outstanding -- while Apple last tagged it in FY2016 and Microsoft in FY2013. A card can be
    permanently blank at 83% "coverage", and blaming the filer for it is simply false.
    """

    def test_a_retired_concept_blames_the_market_not_the_filer(self):
        result = build_concept_group([], 320193, "dilution", 2025, "FY", CAPITAL_GROUPS)
        assert result["status"] == "na"
        note = CAPITAL_GROUP_NOTES["dilution"]
        # The route substitutes the note for the default reason; the note is what must be shown.
        assert "stopped tagging" in note
        assert "2018" in note

    def test_the_default_reason_would_have_misattributed_it(self):
        """Guards the substitution itself: if the route stopped applying the note, the generic
        reason underneath still says the filer chose not to disclose."""
        result = build_concept_group([], 320193, "dilution", 2025, "FY", CAPITAL_GROUPS)
        assert "did not disclose" in (result["reason"] or "")

    @pytest.mark.parametrize("group", sorted(CAPITAL_GROUPS))
    def test_coverage_is_declared_and_plausible(self, group):
        coverage = CAPITAL_GROUPS[group][2]
        assert 0.0 < coverage <= 1.0

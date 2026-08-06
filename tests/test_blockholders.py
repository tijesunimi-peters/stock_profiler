"""Tests for §04's blockholder card -- `build_blockholders`.

A 13D/G history is not a position list, and each test below is one way rendering it raw goes
wrong. All three came from real filings read 2026-08-06.
"""

from __future__ import annotations

from secfin.normalize.blockholders import build_blockholders
from secfin.normalize.schema import BeneficialOwnership


def _row(owner, pct, filed, *, accession=None, shares=1000.0, form="SCHEDULE 13G"):
    return BeneficialOwnership(
        issuer_cik=320193,
        issuer_name="Apple Inc",
        owner_name=owner,
        form_type=form,
        percent_of_class=pct,
        shares_beneficially_owned=shares,
        filed=filed,
        accession=accession or f"{owner}-{filed}",
    )


class TestOneRowPerOwner:
    def test_the_latest_filing_supersedes_its_predecessor(self):
        # A 13D/G amendment replaces the prior filing. Showing both lists one holder twice at two
        # contradictory stakes.
        result = build_blockholders(
            [
                _row("The Vanguard Group", 9.47, "2025-07-29"),
                _row("The Vanguard Group", 8.10, "2026-01-30", form="SCHEDULE 13G/A"),
            ]
        )
        (holder,) = result.holders
        assert holder.percent_of_class == 8.10
        assert holder.filed == "2026-01-30"

    def test_distinct_owners_are_kept_apart(self):
        result = build_blockholders(
            [_row("BlackRock Inc", 6.5, "2026-02-01"), _row("State Street", 5.2, "2026-02-02")]
        )
        assert [h.owner for h in result.holders] == ["BlackRock Inc", "State Street"]

    def test_holders_sort_by_stake(self):
        result = build_blockholders(
            [_row("Small", 5.1, "2026-01-01"), _row("Big", 9.9, "2026-01-01")]
        )
        assert [h.owner for h in result.holders] == ["Big", "Small"]


class TestBelowTheThresholdIsAnExit:
    def test_a_residual_stake_is_an_exit_not_a_small_blockholder(self):
        # Alphabet's cache holds 13G/A rows down to 0.01%. Listing those under "reported
        # blockholders" contradicts the 5% threshold the card is named for.
        result = build_blockholders(
            [
                _row("Hillspire Holdings, LLC", 0.01, "2026-01-01"),
                _row("Sergey Brin", 5.81, "2026-01-01"),
            ]
        )
        assert [h.owner for h in result.holders] == ["Sergey Brin"]
        assert [e.owner for e in result.exited] == ["Hillspire Holdings, LLC"]

    def test_exactly_five_percent_is_still_a_blockholder(self):
        result = build_blockholders([_row("At The Line", 5.0, "2026-01-01")])
        assert [h.owner for h in result.holders] == ["At The Line"]

    def test_a_zero_percent_amendment_is_reported_as_an_exit(self):
        # Rule 13d-2 requires an amendment on dropping through 5%, so 0% is the filer saying "we
        # are out". In a stakes column it reads as a holder who owns nothing.
        result = build_blockholders(
            [_row("The Vanguard Group", 0.0, "2026-03-26", shares=0.0, form="SCHEDULE 13G/A")]
        )
        assert result.holders == []
        assert [e.owner for e in result.exited] == ["The Vanguard Group"]
        assert result.status == "na"
        assert "below the 5% threshold" in (result.reason or "")

    def test_an_exit_does_not_suppress_a_current_holder(self):
        result = build_blockholders(
            [
                _row("The Vanguard Group", 0.0, "2026-03-26", shares=0.0),
                _row("Vanguard Capital Management", 7.48, "2026-04-29"),
            ]
        )
        assert [h.owner for h in result.holders] == ["Vanguard Capital Management"]
        assert [e.owner for e in result.exited] == ["The Vanguard Group"]

    def test_an_untagged_percentage_is_not_an_exit(self):
        # None is "the filing carried no percentage"; 0 is "we hold none". Collapsing them would
        # move a real holder into the exit list.
        result = build_blockholders([_row("Unknown Stake", None, "2026-01-01")])
        assert [h.owner for h in result.holders] == ["Unknown Stake"]
        assert result.exited == []

    def test_an_exit_that_supersedes_a_stake_removes_the_holder(self):
        result = build_blockholders(
            [
                _row("The Vanguard Group", 9.47, "2025-07-29"),
                _row("The Vanguard Group", 0.0, "2026-03-26", shares=0.0),
            ]
        )
        assert result.holders == []
        assert [e.owner for e in result.exited] == ["The Vanguard Group"]


class TestEmptyStates:
    def test_no_filings_says_why_that_is_normal(self):
        # Only a holder crossing 5% files at all, so an empty list is common and is NOT evidence
        # of dispersed ownership.
        result = build_blockholders([])
        assert result.status == "na"
        assert "crossing 5%" in (result.reason or "")

    def test_the_filing_count_travels_so_a_short_list_can_be_attributed(self):
        result = build_blockholders(
            [
                _row("A", 6.0, "2026-01-01", accession="x"),
                _row("B", 5.5, "2026-01-02", accession="y"),
            ]
        )
        assert result.filings_read == 2

    def test_an_owner_with_no_name_is_dropped_rather_than_rendered_blank(self):
        result = build_blockholders([_row("", 6.0, "2026-01-01"), _row("Real", 5.5, "2026-01-02")])
        assert [h.owner for h in result.holders] == ["Real"]

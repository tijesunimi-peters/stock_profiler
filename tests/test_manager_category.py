"""Manager registration-category classification (normalize/manager_category.py).

The load-bearing rule here is the one that is easiest to get wrong: "we have no SIC" and "the
SIC is not a named institution type" are DIFFERENT answers, and collapsing them would turn a
coverage gap into a finding about the register.
"""

from __future__ import annotations

from secfin.normalize.manager_category import (
    CATEGORY_LABELS,
    CATEGORY_ORDER,
    classify_manager_sic,
)
from secfin.normalize.register import ShareVector, composition, share_vector
from secfin.normalize.schema import IssuerHolder


def _holder(cik: int, shares: float) -> IssuerHolder:
    return IssuerHolder(
        manager_cik=cik,
        manager_name=f"MANAGER {cik}",
        cusip="037833100",
        issuer_name="APPLE INC",
        shares=shares,
        value=shares * 100,
    )


class TestClassify:
    def test_the_common_institution_types_map(self):
        assert classify_manager_sic("6282") == "adviser"
        assert classify_manager_sic("6022") == "bank"
        assert classify_manager_sic("6311") == "insurance"
        assert classify_manager_sic("6726") == "fund"
        assert classify_manager_sic("6211") == "broker_dealer"
        assert classify_manager_sic("6733") == "trust"

    def test_an_unrecognized_code_is_other_not_none(self):
        """We HAVE a code -- it just is not a named institution type."""
        assert classify_manager_sic("2834") == "other"  # pharmaceutical preparations

    def test_no_code_is_none_not_other(self):
        """The distinction the whole block rests on: absent != 'other'."""
        assert classify_manager_sic(None) is None
        assert classify_manager_sic("") is None
        assert classify_manager_sic("   ") is None

    def test_unpadded_codes_normalize(self):
        """Some SEC payloads drop the leading zero; the same filer must not split in two."""
        assert classify_manager_sic("700") == classify_manager_sic("0700")

    def test_every_category_has_a_label_and_an_order(self):
        for key in CATEGORY_ORDER:
            assert key in CATEGORY_LABELS
        assert set(CATEGORY_ORDER) == set(CATEGORY_LABELS)
        assert CATEGORY_ORDER[-1] == "other", "a residual bucket must never lead"


class TestComposition:
    def test_groups_by_category_and_weights_over_classified_shares(self):
        vector = share_vector([_holder(1, 600), _holder(2, 300), _holder(3, 100)])
        comp = composition(vector, {1: "6282", 2: "6282", 3: "6022"})

        assert comp.status == "ok"
        assert [c.key for c in comp.categories] == ["adviser", "bank"]
        adviser, bank = comp.categories
        assert adviser.holder_count == 2
        assert adviser.shares == 900
        assert adviser.weight == 0.9
        assert bank.weight == 0.1
        assert comp.coverage == 1.0

    def test_unclassified_holders_are_excluded_from_the_mix_not_folded_into_other(self):
        vector = share_vector([_holder(1, 500), _holder(2, 500)])
        comp = composition(vector, {1: "6282", 2: None})

        assert [c.key for c in comp.categories] == ["adviser"]
        # The one adviser is 100% of what we could classify ...
        assert comp.categories[0].weight == 1.0
        # ... and coverage is what stops that reading as 100% of the register.
        assert comp.coverage == 0.5
        assert comp.unclassified_holder_count == 1
        assert comp.unclassified_shares == 500
        assert all(c.key != "other" for c in comp.categories)

    def test_na_with_a_reason_when_nothing_can_be_classified(self):
        vector = share_vector([_holder(1, 500), _holder(2, 500)])
        comp = composition(vector, {})

        assert comp.status == "na"
        assert comp.categories == []
        assert comp.coverage == 0.0
        # Never a zero passed off as a finding -- the reason must say it is coverage.
        assert "SIC code on file" in comp.reason
        assert "missing coverage" in comp.reason

    def test_carries_the_registration_not_strategy_caveat(self):
        comp = composition(share_vector([_holder(1, 100)]), {1: "6282"})
        assert "not a strategy" in comp.cannot
        assert "6282" in comp.cannot

    def test_empty_register_is_na_not_a_crash(self):
        comp = composition(ShareVector(rows=[], total_shares=0.0, excluded_count=0), {})
        assert comp.status == "na"
        assert comp.coverage is None

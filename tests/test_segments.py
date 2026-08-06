"""Tests for §03 -- `build_segment_breakdown` and the ingest filters behind it.

Every case here came out of measuring 2026q1's 4,309 annual filings, or out of a real filer:

* a filing can carry several revenue tags, and summing across them double-counts,
* margin needs BOTH inputs, and only 35.0% of filers with named segments tag operating income,
* shares are of the DISCLOSED splits, because they do not sum to consolidated revenue,
* `ReportableSegment` / `Corporate` are structure, not businesses -- 531 filers have nothing else,
* Tesla tags segment gross profit but not segment revenue, so "no facts" and "not these facts"
  look identical from the store and the empty state must not claim the first.
"""

from __future__ import annotations

from secfin.ingest.dimensional_backfill import _NON_SEGMENT_MEMBERS, _dimensional_kind
from secfin.normalize.segments import build_segment_breakdown, readable_member
from secfin.storage.dimensional_repository import DimensionalFact

CIK = 320193
REV = "RevenueFromContractWithCustomerExcludingAssessedTax"


def _f(member, tag, value, *, axis="BusinessSegments", fy=2025, qtrs="4"):
    return DimensionalFact(
        cik=CIK, accession="a-1", axis=axis, member=member, tag=tag, ddate="20250927",
        qtrs=qtrs, value=value, unit="USD", fiscal_year=fy, form="10-K",
    )


class TestSegmentRows:
    def test_revenue_operating_income_and_margin(self):
        result = build_segment_breakdown(
            CIK,
            [
                _f("AmericasSegment", REV, 178_353e6),
                _f("AmericasSegment", "OperatingIncomeLoss", 72_480e6),
            ],
        )
        (row,) = result.segments
        assert row.label == "Americas"
        assert row.revenue == 178_353e6
        assert round(row.margin * 100, 1) == 40.6

    def test_margin_needs_both_inputs(self):
        # 35.0% of filers with named segments tag segment operating income. A margin from revenue
        # alone would be invented.
        result = build_segment_breakdown(CIK, [_f("EuropeSegment", REV, 111_032e6)])
        assert result.segments[0].revenue == 111_032e6
        assert result.segments[0].margin is None

    def test_a_zero_revenue_does_not_produce_a_margin(self):
        result = build_segment_breakdown(
            CIK, [_f("X", REV, 0.0), _f("X", "OperatingIncomeLoss", 5e6)]
        )
        assert result.segments[0].margin is None

    def test_a_segment_with_only_assets_still_renders(self):
        # JPMorgan tags segment Assets but no segment revenue on this axis.
        result = build_segment_breakdown(CIK, [_f("ConsumerCommunityBanking", "Assets", 664.7e9)])
        (row,) = result.segments
        assert row.assets == 664.7e9
        assert row.revenue is None and row.margin is None

    def test_segments_sort_by_revenue_with_unpriced_last(self):
        result = build_segment_breakdown(
            CIK,
            [_f("Small", REV, 10.0), _f("Big", REV, 100.0), _f("NoRev", "Assets", 5.0)],
        )
        assert [s.label for s in result.segments] == ["Big", "Small", "No Rev"]


class TestOneRevenueTagPerFiling:
    def test_variant_revenue_tags_are_not_summed(self):
        # A filing carrying two revenue tags must contribute ONE. Summing double-counts.
        result = build_segment_breakdown(
            CIK,
            [
                _f("A", "RevenueFromContractWithCustomerExcludingAssessedTax", 100.0),
                _f("A", "Revenues", 100.0),
            ],
        )
        (row,) = result.segments
        assert row.revenue == 100.0
        assert result.revenue_tag == "RevenueFromContractWithCustomerExcludingAssessedTax"


class TestShares:
    def test_shares_are_of_the_disclosed_splits_not_a_total(self):
        # The disclosed splits routinely do not sum to consolidated revenue, so dividing by the
        # total would imply a remainder this data cannot describe.
        result = build_segment_breakdown(CIK, [_f("A", REV, 75.0), _f("B", REV, 25.0)])
        assert [round(s.revenue_share, 2) for s in result.segments] == [0.75, 0.25]

    def test_a_segment_with_no_revenue_gets_no_share(self):
        result = build_segment_breakdown(CIK, [_f("A", REV, 100.0), _f("B", "Assets", 50.0)])
        assert result.segments[1].revenue_share is None


class TestGeography:
    def test_revenue_and_long_lived_assets_sit_on_one_row(self):
        result = build_segment_breakdown(
            CIK,
            [
                _f("US", REV, 19.1e9, axis="Geographical"),
                _f("US", "PropertyPlantAndEquipmentNet", 4.8e9, axis="Geographical", qtrs="0"),
            ],
        )
        (row,) = result.geography
        assert row.revenue == 19.1e9
        assert row.long_lived_assets == 4.8e9

    def test_a_country_code_is_not_word_spaced(self):
        assert readable_member("US") == "US"
        assert readable_member("CN") == "CN"

    def test_a_camel_member_is_spaced_but_never_translated(self):
        assert readable_member("AmazonWebServicesSegment") == "Amazon Web Services"
        assert readable_member("EuropeMiddleEastAfrica") == "Europe Middle East Africa"
        # The filer's own run-together spelling survives -- it is their identifier, not ours.
        assert readable_member("A.Pacific") == "A.Pacific"


class TestIngestFilters:
    """The ingest drops structure and cross-tabs; these pin why."""

    def test_placeholder_and_reconciling_members_are_excluded(self):
        for member in ("ReportableSegment", "Corporate", "AllOtherSegments",
                       "IntersegmentEliminations"):
            assert member in _NON_SEGMENT_MEMBERS

    def test_a_cross_tab_is_not_a_clean_split(self):
        assert _dimensional_kind(
            "BusinessSegments=Auto;ProductOrService=Cars;", "BusinessSegments"
        ) is None

    def test_a_consolidation_qualifier_of_operating_segments_is_tolerated(self):
        assert _dimensional_kind(
            "BusinessSegments=Auto;ConsolidationItems=OperatingSegments;", "BusinessSegments"
        ) == "Auto"

    def test_a_reconciling_consolidation_qualifier_is_dropped(self):
        assert _dimensional_kind(
            "BusinessSegments=Auto;ConsolidationItems=MaterialReconcilingItems;", "BusinessSegments"
        ) is None

    def test_a_row_without_the_axis_is_skipped(self):
        assert _dimensional_kind("Geographical=US;", "BusinessSegments") is None


class TestEmptyStates:
    def test_no_facts_names_both_causes(self):
        # "Its quarter is unpublished" and "it tags other measures" are indistinguishable from the
        # store, and Tesla is the second: it tags segment gross profit, not segment revenue.
        result = build_segment_breakdown(CIK, [])
        assert result.status == "na"
        assert "not be published yet" in (result.reason or "")
        assert "does not read" in (result.reason or "")

    def test_only_structural_members_is_na_with_its_own_reason(self):
        # The ingest strips them, so this filing arrives with nothing -- but the wording must not
        # blame the ingest for what the filer chose.
        result = build_segment_breakdown(CIK, [_f("US", "SomethingElse", 1.0, axis="Other")])
        assert result.status == "na"
        assert "structural" in (result.reason or "")

    def test_the_fiscal_year_is_reported_never_implied(self):
        result = build_segment_breakdown(CIK, [_f("A", REV, 1.0, fy=2024)])
        assert result.fiscal_year == 2024

    def test_only_the_newest_fiscal_year_is_shaped(self):
        result = build_segment_breakdown(
            CIK, [_f("A", REV, 1.0, fy=2024), _f("B", REV, 2.0, fy=2025)]
        )
        assert [s.label for s in result.segments] == ["B"]

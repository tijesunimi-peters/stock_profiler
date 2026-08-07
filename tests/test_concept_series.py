"""Tests for the financial-history line-item series -- `compute_concept_series`.

The load-bearing groups are `TestRestatementBasis` (the two bases must actually differ, and each
must be internally consistent) and `TestFlowsAndStocks` (differencing a stock or levelling a flow
both produce a plausible line that means nothing).
"""

from __future__ import annotations

import pytest

from secfin.normalize.metrics import compute_concept_series
from secfin.normalize.schema import RawFact

CIK = 320193


def _flow(tag, start, end, value, filed, *, fy=2024, fp="FY"):
    return RawFact(
        cik=CIK, taxonomy="us-gaap", gaap_tag=tag, label=tag, unit="USD", value=value,
        period_start=start, period_end=end, instant=None, fiscal_year=fy, fiscal_period=fp,
        form="10-K", filed=filed, accession=f"acc-{filed}",
    )


def _stock(tag, instant, value, filed, *, fy=2024, fp="FY"):
    return RawFact(
        cik=CIK, taxonomy="us-gaap", gaap_tag=tag, label=tag, unit="USD", value=value,
        period_start=None, period_end=None, instant=instant, fiscal_year=fy, fiscal_period=fp,
        form="10-K", filed=filed, accession=f"acc-{filed}",
    )


def _annual_revenue(value, filed, *, year=2024):
    """A full fiscal year of revenue ending 30 Sep, as one tagged annual duration."""
    return _flow(
        "RevenueFromContractWithCustomerExcludingAssessedTax",
        f"{year - 1}-10-01", f"{year}-09-30", value, filed, fy=year,
    )


class TestRestatementBasis:
    def test_as_restated_takes_the_latest_filing(self):
        # The same period reported twice. Which value is "the" value is a question about basis,
        # and the answer must not depend on the order facts arrived in.
        facts = [
            _annual_revenue(100.0, "2024-11-01"),
            _annual_revenue(120.0, "2025-11-01"),
        ]
        s = compute_concept_series(facts, CIK, "revenue", "annual", "as-restated")
        assert [p.value for p in s.points] == [120.0]
        assert s.restatement_basis == "as-restated"

    def test_as_originally_reported_takes_the_first_filing(self):
        facts = [
            _annual_revenue(100.0, "2024-11-01"),
            _annual_revenue(120.0, "2025-11-01"),
        ]
        s = compute_concept_series(facts, CIK, "revenue", "annual", "as-originally-reported")
        assert [p.value for p in s.points] == [100.0]

    def test_the_basis_does_not_depend_on_fact_order(self):
        newest_first = [_annual_revenue(120.0, "2025-11-01"), _annual_revenue(100.0, "2024-11-01")]
        oldest_first = list(reversed(newest_first))
        for facts in (newest_first, oldest_first):
            assert compute_concept_series(
                facts, CIK, "revenue", "annual", "as-originally-reported"
            ).points[0].value == 100.0

    def test_an_unrestated_period_reads_the_same_on_both_bases(self):
        # Most periods are never restated, and the two lines must sit exactly on top of each
        # other there -- a spurious gap would invent a correction the filer never made.
        facts = [_annual_revenue(100.0, "2024-11-01")]
        a = compute_concept_series(facts, CIK, "revenue", "annual", "as-restated")
        b = compute_concept_series(facts, CIK, "revenue", "annual", "as-originally-reported")
        assert [p.value for p in a.points] == [p.value for p in b.points]

    def test_the_chosen_tag_does_not_change_with_the_basis(self):
        """Switching basis must change VALUES, never which line you are reading.

        Tag selection picks the first candidate with any usable value. If that were computed
        per-basis, a filer that switched tags mid-history could show as-filed reading one concept
        and as-restated reading another, and the two lines would not be comparable at all.
        """
        facts = [_annual_revenue(100.0, "2024-11-01"), _annual_revenue(120.0, "2025-11-01")]
        a = compute_concept_series(facts, CIK, "revenue", "annual", "as-restated")
        b = compute_concept_series(facts, CIK, "revenue", "annual", "as-originally-reported")
        assert a.source_tag == b.source_tag


class TestFlowsAndStocks:
    def test_a_flow_is_labelled_a_flow_and_summed_over_the_year(self):
        s = compute_concept_series([_annual_revenue(100.0, "2024-11-01")], CIK, "revenue", "annual")
        assert s.kind == "flow"
        assert s.points[0].value == 100.0

    def test_a_stock_is_labelled_a_stock_and_read_at_the_period_end(self):
        # A balance is a level, never a sum: adding four quarter-end cash balances would report
        # four times the cash a company holds.
        facts = [
            _annual_revenue(100.0, "2024-11-01"),
            _stock("CashAndCashEquivalentsAtCarryingValue", "2024-09-30", 42.0, "2024-11-01"),
        ]
        s = compute_concept_series(facts, CIK, "cash_and_equivalents", "annual")
        assert s.kind == "stock"
        assert s.points[0].value == 42.0

    def test_a_quarterly_flow_is_the_discrete_quarter_not_the_ytd(self):
        # Filers tag YTD durations; a chart of YTD values shows a sawtooth that resets each year
        # and is not the quarter's revenue. Q2 = 6-month YTD - 3-month YTD.
        tag = "RevenueFromContractWithCustomerExcludingAssessedTax"
        facts = [
            _flow(tag, "2023-10-01", "2024-09-30", 400.0, "2024-11-01", fy=2024),
            _flow(tag, "2023-10-01", "2023-12-30", 100.0, "2024-02-01", fy=2024, fp="Q1"),
            _flow(tag, "2023-10-01", "2024-03-30", 250.0, "2024-05-01", fy=2024, fp="Q2"),
        ]
        s = compute_concept_series(facts, CIK, "revenue", "quarterly")
        by_end = {p.period_end: p.value for p in s.points}
        assert by_end.get("2023-12-30") == 100.0
        assert by_end.get("2024-03-30") == 150.0  # 250 YTD - 100 YTD, not 250


class TestAbsenceIsNotZero:
    def test_an_untagged_concept_returns_no_points_and_a_reason(self):
        s = compute_concept_series([_annual_revenue(100.0, "2024-11-01")], CIK, "inventory")
        assert s.points == []
        assert s.unit is None
        assert "not a zero" in (s.reason or "")

    def test_a_period_the_filer_skipped_is_a_gap_point_not_a_zero(self):
        tag = "RevenueFromContractWithCustomerExcludingAssessedTax"
        facts = [
            _flow(tag, "2023-10-01", "2024-09-30", 400.0, "2024-11-01", fy=2024),
            _flow(tag, "2023-10-01", "2023-12-30", 100.0, "2024-02-01", fy=2024, fp="Q1"),
            # No Q2 YTD tagged at all.
            _flow(tag, "2023-10-01", "2024-06-29", 300.0, "2024-08-01", fy=2024, fp="Q3"),
        ]
        s = compute_concept_series(facts, CIK, "revenue", "quarterly")
        gaps = [p for p in s.points if p.value is None]
        assert all(p.status == "na" for p in gaps)
        assert all("not reported" in (p.reason or "") for p in gaps)
        assert not any(p.value == 0 for p in s.points)

    def test_an_unknown_concept_raises_so_the_route_can_404(self):
        with pytest.raises(KeyError):
            compute_concept_series([], CIK, "not_a_concept")


class TestProvenance:
    def test_the_series_carries_its_source_tag(self):
        s = compute_concept_series([_annual_revenue(100.0, "2024-11-01")], CIK, "revenue", "annual")
        assert s.source_tag == "RevenueFromContractWithCustomerExcludingAssessedTax"
        assert s.is_extension is False
        assert s.label == "Revenue"

    def test_a_point_carries_the_filing_it_came_from(self):
        s = compute_concept_series([_annual_revenue(100.0, "2024-11-01")], CIK, "revenue", "annual")
        assert s.points[0].as_of == "2024-11-01"

    def test_as_of_follows_the_basis(self):
        # On the as-originally-reported basis the value is the 2024 filing's, so a 2025 as_of
        # would attribute the number to a filing that reports something else.
        facts = [_annual_revenue(100.0, "2024-11-01"), _annual_revenue(120.0, "2025-11-01")]
        b = compute_concept_series(facts, CIK, "revenue", "annual", "as-originally-reported")
        assert b.points[0].value == 100.0


class TestTagSelectionPrefersTheTagActuallyUsED:
    """The series fixes on ONE tag for its whole history; these guard WHICH one.

    NVIDIA tagged `RevenueFromContractWithCustomerExcludingAssessedTax` for FY2019-FY2022 and
    `Revenues` for FY2009-FY2027. Under a first-candidate-with-any-value rule the four-year tag
    won, which ended NVIDIA's revenue series in 2022 and made its gross and net margin `N/A` on
    the live product. 18.7% of companies with a full payload were picking a revenue tag with
    under two thirds the coverage of the best available.
    """

    def _rev(self, tag, year, value, filed="2024-11-01"):
        return _flow(tag, f"{year - 1}-10-01", f"{year}-09-30", value, filed, fy=year)

    def test_a_fragment_tag_loses_to_the_one_covering_the_history(self):
        preferred = "RevenueFromContractWithCustomerExcludingAssessedTax"
        facts = [self._rev(preferred, y, 10.0) for y in (2020, 2021)]
        facts += [self._rev("Revenues", y, 20.0) for y in range(2010, 2027)]
        s = compute_concept_series(facts, CIK, "revenue", "annual")
        assert s.source_tag == "Revenues"
        # ...and the series actually reaches the recent years, which is the point.
        assert max(p.fiscal_year for p in s.points if p.value is not None) >= 2026

    def test_preference_still_wins_when_both_cover_the_history(self):
        # Only fragments are rejected. Where the preferred tag is genuinely in use it keeps its
        # preference, even if another candidate has a few more periods -- otherwise a company
        # would switch to a broader, semantically different tag over a rounding difference.
        preferred = "RevenueFromContractWithCustomerExcludingAssessedTax"
        facts = [self._rev(preferred, y, 10.0) for y in range(2011, 2027)]
        facts += [self._rev("Revenues", y, 20.0) for y in range(2010, 2027)]
        s = compute_concept_series(facts, CIK, "revenue", "annual")
        assert s.source_tag == preferred

    def test_a_single_tag_is_chosen_even_when_it_is_the_only_one(self):
        facts = [self._rev("Revenues", y, 20.0) for y in (2024, 2025)]
        assert compute_concept_series(facts, CIK, "revenue", "annual").source_tag == "Revenues"

    def test_the_series_never_mixes_two_tags(self):
        """One tag for the whole series, still.

        A ratio whose denominator changed definition halfway along would move for a reason that is
        not the business, so the fix changes WHICH tag is chosen and never starts blending them.
        """
        preferred = "RevenueFromContractWithCustomerExcludingAssessedTax"
        # 2021 is tagged ONLY by the losing candidate, so its value must not appear anywhere.
        facts = [self._rev(preferred, 2021, 10.0)]
        years = list(range(2010, 2021)) + list(range(2022, 2027))
        facts += [self._rev("Revenues", y, 20.0) for y in years]
        s = compute_concept_series(facts, CIK, "revenue", "annual")
        values = [p.value for p in s.points]
        assert 10.0 not in values
        assert {v for v in values if v is not None} == {20.0}

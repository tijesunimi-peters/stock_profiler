"""Tests for §06.2's tenure floor -- `build_auditor_continuity`.

The load-bearing ones are `TestItIsAFloorNotATenure` and `TestAShortWindowMakesNoClaim`: a floor
that silently varied with a company's filing VOLUME rather than with its auditor's tenure would
read as a measurement while measuring nothing.
"""

from __future__ import annotations

from secfin.normalize.auditor_continuity import MIN_WINDOW_YEARS, build_auditor_continuity


def _change(filed, item="4.01"):
    return {"kind": "auditor_change", "item": item, "form": "8-K", "filed": filed}


class TestTheFloorFromAnAbsence:
    def test_no_change_in_a_long_window_floors_at_the_window_start(self):
        # Apple: 1,000 filings reaching 2015-06-01, no Item 4.01.
        result = build_auditor_continuity(
            "Ernst & Young LLP", [], covered_from="2015-06-01", covered_to="2026-07-31"
        )
        assert result.status == "ok"
        assert result.since == "2015-06-01"
        assert result.since_is_a_change is False
        assert result.years == 11.2

    def test_a_4_02_restatement_is_not_an_auditor_change(self):
        # Both ride in the same events list off the same filing index. Reading 4.02 as a change
        # would date an engagement from a restatement the same auditor signed off on.
        result = build_auditor_continuity(
            "Ernst & Young LLP",
            [_change("2020-03-01", item="4.02")],
            covered_from="2015-06-01",
            covered_to="2026-07-31",
        )
        assert result.since == "2015-06-01"
        assert result.since_is_a_change is False


class TestAChangeOnFileDatesTheEngagement:
    def test_the_floor_moves_to_the_change_not_the_window_edge(self):
        # Crediting the incumbent with the window start would hand it its predecessor's years.
        result = build_auditor_continuity(
            "Deloitte & Touche LLP",
            [_change("2019-03-14")],
            covered_from="2015-06-01",
            covered_to="2026-07-31",
        )
        assert result.since == "2019-03-14"
        assert result.since_is_a_change is True

    def test_the_latest_change_wins_when_there_are_several(self):
        result = build_auditor_continuity(
            "Deloitte & Touche LLP",
            [_change("2017-01-05"), _change("2022-08-09"), _change("2019-03-14")],
            covered_from="2015-06-01",
            covered_to="2026-07-31",
        )
        assert result.since == "2022-08-09"

    def test_a_dated_change_survives_a_window_too_short_for_an_absence_claim(self):
        # Positive evidence, not an absence -- so the window-length rule below does not apply.
        result = build_auditor_continuity(
            "PricewaterhouseCoopers LLP",
            [_change("2026-02-02")],
            covered_from="2025-08-01",
            covered_to="2026-07-31",
        )
        assert result.status == "ok"
        assert result.since == "2026-02-02"
        assert result.since_is_a_change is True


class TestAShortWindowMakesNoClaim:
    def test_jpmorgans_one_year_index_establishes_nothing(self):
        # 25,529 filings a year, so the same rolling index buys 1.0 year. The floor would be set by
        # filing volume, not by tenure.
        result = build_auditor_continuity(
            "PricewaterhouseCoopers LLP",
            [],
            covered_from="2025-08-01",
            covered_to="2026-07-31",
            indexed_filings=25529,
        )
        assert result.status == "na"
        assert result.since is None
        assert "25,529" in (result.reason or "")
        assert "rolling window" in (result.reason or "")

    def test_the_threshold_is_two_annual_cycles(self):
        assert MIN_WINDOW_YEARS == 2.0
        just_under = build_auditor_continuity(
            "PwC", [], covered_from="2024-09-01", covered_to="2026-07-31"
        )
        just_over = build_auditor_continuity(
            "PwC", [], covered_from="2024-06-01", covered_to="2026-07-31"
        )
        assert just_under.status == "na"
        assert just_over.status == "ok"


class TestItIsAFloorNotATenure:
    def test_the_field_is_named_since_and_there_is_no_tenure_field(self):
        """There is no `tenure` field, and there must not be one.

        E&Y has audited Apple since 2009; the index reaches 2015. Any field a caller could read as
        a tenure would be wrong by fourteen years, and wrong in the flattering direction.
        """
        from dataclasses import fields

        from secfin.normalize.auditor_continuity import AuditorContinuity

        names = {f.name for f in fields(AuditorContinuity)}
        for forbidden in ("tenure", "tenure_years", "auditor_since", "engaged"):
            assert forbidden not in names
        assert "since" in names and "since_is_a_change" in names

    def test_the_window_travels_with_the_floor(self):
        result = build_auditor_continuity(
            "Ernst & Young LLP",
            [],
            covered_from="2018-04-04",
            covered_to="2026-07-31",
            indexed_filings=1000,
        )
        assert result.indexed_from == "2018-04-04"
        assert result.indexed_to == "2026-07-31"
        assert result.indexed_filings == 1000


class TestEmptyStates:
    def test_an_untagged_auditor_has_no_floor(self):
        result = build_auditor_continuity(
            None, [], covered_from="2015-06-01", covered_to="2026-07-31"
        )
        assert result.status == "na"
        assert "no firm" in (result.reason or "")

    def test_an_unindexed_company_says_it_has_not_looked(self):
        result = build_auditor_continuity("PwC", [], covered_from=None, covered_to=None)
        assert result.status == "na"
        assert "not the same as finding none" in (result.reason or "")

    def test_a_malformed_date_is_not_read_as_a_window(self):
        result = build_auditor_continuity("PwC", [], covered_from="", covered_to="2026-07-31")
        assert result.status == "na"

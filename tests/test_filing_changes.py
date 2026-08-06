"""Tests for the "What changed this filing" band -- `build_filing_changes`.

The band is a NOTIFICATION, not a status board (operator direction 2026-08-05): every row is
something that happened, and a quiet company produces none. Each test below pins one way that
distinction gets lost, or one signal that was measured and found untrustworthy.
"""

from __future__ import annotations

from secfin.normalize.filing_changes import build_filing_changes
from secfin.sec.filing_index import FilingIndexEntry

CIK = 320193


def _annual(accession: str, filed: str, tags: set[str]):
    return (accession, filed, tags)


def _entry(form: str, date: str, items: str = "", accession: str = "x"):
    return FilingIndexEntry(
        cik=CIK, accession=f"{accession}-{date}", form=form, filing_date=date, items=items
    )


def _build(annuals=(), filings=(), *, index_built=True, **kw):
    return build_filing_changes(
        annuals=list(annuals), filings=list(filings), index_built=index_built, **kw
    )


BASE = {"Revenues", "Assets", "NetIncomeLoss"}


class TestNothingIsReportedUnlessItHappened:
    def test_a_quiet_company_produces_no_rows_at_all(self):
        # The whole point. A status board would print "no auditor change"; a notification is silent.
        result = _build(
            [_annual("new", "2026-01-29", BASE), _annual("old", "2025-01-30", BASE)],
            [_entry("8-K", "2025-06-01", "2.02"), _entry("10-Q", "2025-08-01")],
        )
        assert result.changes == []
        assert result.status == "ok"

    def test_an_empty_result_still_says_what_was_checked(self):
        # Silence has to be a CHECKED absence, not a shrug.
        result = _build(
            [_annual("new", "2026-01-29", BASE), _annual("old", "2025-01-30", BASE)],
            error_correction=False,
        )
        assert result.changes == []
        assert any("tag set" in c for c in result.checked)
        assert any("error-correction" in c for c in result.checked)

    def test_no_row_ever_states_that_something_did_not_happen(self):
        result = _build(
            [_annual("new", "2026-01-29", BASE | {"Extra"}), _annual("old", "2025-01-30", BASE)],
            [_entry("8-K", "2025-06-01", "4.01")],
        )
        for change in result.changes:
            assert not any(
                w in change.text.lower() for w in ("no ", "unchanged", "none", "not ")
            ), change.text


class TestTagSetDiff:
    def test_added_and_removed_concepts_are_counted(self):
        result = _build(
            [
                _annual("new", "2026-01-29", {"Revenues", "Assets", "NewOne", "NewTwo"}),
                _annual("old", "2025-01-30", {"Revenues", "Assets", "Gone"}),
            ]
        )
        (row,) = result.changes
        assert row.tag == "TAGS"
        assert "2 concepts newly tagged" in row.text
        assert "1 no longer tagged" in row.text

    def test_an_identical_tag_set_is_a_finding_but_not_a_change(self):
        assert _build(
            [_annual("new", "2026-01-29", BASE), _annual("old", "2025-01-30", BASE)]
        ).changes == []

    def test_one_annual_filing_cannot_be_diffed(self):
        result = _build([_annual("only", "2026-01-29", BASE)])
        assert result.changes == []
        assert result.since is None

    def test_no_annual_filing_at_all_is_na_with_a_reason(self):
        result = _build([])
        assert result.status == "na"
        assert "nothing to compare" in (result.reason or "")

    def test_the_prior_filing_being_compared_against_is_named(self):
        result = _build(
            [_annual("new", "2026-01-29", BASE | {"X"}), _annual("old", "2025-01-30", BASE)]
        )
        assert result.since == "2025-01-30"
        assert "2025-01-30" in result.changes[0].source


class TestEventWindow:
    def test_only_filings_after_the_prior_annual_report_count(self):
        result = _build(
            [_annual("new", "2026-01-29", BASE), _annual("old", "2025-01-30", BASE)],
            [
                _entry("8-K", "2024-06-01", "4.01"),  # before the prior annual -- old news
                _entry("8-K", "2025-06-01", "4.01"),  # after it -- a change
            ],
        )
        assert [c.date for c in result.changes] == ["2025-06-01"]

    def test_an_unindexed_company_reports_only_the_tag_diff(self):
        result = _build(
            [_annual("new", "2026-01-29", BASE | {"X"}), _annual("old", "2025-01-30", BASE)],
            [_entry("8-K", "2025-06-01", "4.01")],
            index_built=False,
        )
        assert [c.tag for c in result.changes] == ["TAGS"]
        assert not any("8-K" in c for c in result.checked)


class TestEventKinds:
    def test_each_item_code_maps_to_its_own_kind(self):
        result = _build(
            [_annual("new", "2026-01-29", BASE), _annual("old", "2025-01-30", BASE)],
            [
                _entry("8-K", "2025-06-01", "4.01", "a"),
                _entry("8-K", "2025-07-01", "4.02", "b"),
                _entry("8-K", "2025-08-01", "1.05", "c"),
                _entry("NT 10-Q", "2025-09-01", "", "d"),
            ],
        )
        assert {c.tag for c in result.changes} == {"AUDIT", "RESTATED", "CYBER", "LATE"}

    def test_routine_items_collapse_into_one_row_each(self):
        # Coca-Cola files 28 Item 5.02s and Tesla 18 Item 1.01s. A notification band that scrolls
        # is not a notification.
        result = _build(
            [_annual("new", "2026-01-29", BASE), _annual("old", "2025-01-30", BASE)],
            [_entry("8-K", f"2025-06-{d:02d}", "5.02", str(d)) for d in range(1, 6)]
            + [_entry("8-K", f"2025-07-{d:02d}", "1.01", f"a{d}") for d in range(1, 4)],
        )
        by_tag = {c.tag: c for c in result.changes}
        assert by_tag["OFFICERS"].text == "5 officer or director changes reported"
        assert by_tag["DEBT"].text == "3 material agreements entered"

    def test_a_single_routine_event_reads_singular(self):
        result = _build(
            [_annual("new", "2026-01-29", BASE), _annual("old", "2025-01-30", BASE)],
            [_entry("8-K", "2025-06-01", "1.01")],
        )
        assert result.changes[0].text == "1 material agreement entered"

    def test_the_filers_own_error_correction_flag_is_a_restatement(self):
        # Distinct from the 8-K: Item 4.02 announces non-reliance, the cover flag IS the correction.
        result = _build(
            [_annual("new", "2026-01-29", BASE), _annual("old", "2025-01-30", BASE)],
            error_correction=True,
        )
        assert [c.tag for c in result.changes] == ["RESTATED"]
        assert "10-K cover" in result.changes[0].source

    def test_a_false_error_correction_flag_produces_no_row(self):
        result = _build(
            [_annual("new", "2026-01-29", BASE), _annual("old", "2025-01-30", BASE)],
            error_correction=False,
        )
        assert result.changes == []


class TestOrdering:
    def test_newest_first(self):
        result = _build(
            [_annual("new", "2026-01-29", BASE), _annual("old", "2024-01-30", BASE)],
            [
                _entry("8-K", "2025-03-01", "4.01", "a"),
                _entry("8-K", "2025-09-01", "1.05", "b"),
            ],
        )
        assert [c.date for c in result.changes] == ["2025-09-01", "2025-03-01"]

    def test_a_restatement_outranks_an_agreement_on_the_same_day(self):
        result = _build(
            [_annual("new", "2026-01-29", BASE), _annual("old", "2025-01-30", BASE)],
            [
                _entry("8-K", "2025-06-01", "1.01", "a"),
                _entry("8-K", "2025-06-01", "4.02", "b"),
            ],
        )
        assert result.changes[0].tag == "RESTATED"

    def test_the_row_count_is_capped(self):
        result = _build(
            [_annual("new", "2026-01-29", BASE), _annual("old", "2024-01-30", BASE)],
            [_entry("NT 10-Q", f"2025-0{d}-01", "", str(d)) for d in range(1, 8)],
            limit=4,
        )
        assert len(result.changes) == 4

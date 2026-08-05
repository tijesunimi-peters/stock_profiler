"""Tests for §05.1 -- `build_officer_changes`, and the role fields it depends on.

Each test pins one thing that would otherwise be quietly wrong on screen:

* a Form 3 lists every security held, so one arrival produces four rows,
* a 10% owner crossing a threshold files the same Form 3 as an incoming CFO,
* the role columns are NULL on every row cached before they existed, so the filter falls back to
  the display string's left prefix -- which is decidable even though the whole string is not,
* "See Remarks" is an EDGAR pointer, not a job title,
* an unindexed company has NOT been checked for Item 5.02, which is not the same as finding none,
* nothing anywhere produces an action verb, because no source carries one.
"""

from __future__ import annotations

from secfin.normalize.officer_changes import build_officer_changes
from secfin.normalize.schema import InsiderTransaction
from secfin.sec.filing_index import FilingIndexEntry

CIK = 320193


def _form3(
    *,
    owner: str = "Borders Ben",
    accession: str = "0002100523-26-000002",
    filed: str = "2026-01-02",
    title: str | None = "Principal Accounting Officer",
    officer: bool | None = True,
    director: bool | None = False,
    ten_pct: bool | None = False,
    security: str = "Common Stock",
    form: str = "3",
) -> InsiderTransaction:
    roles = []
    if director:
        roles.append("director")
    if officer:
        roles.append(f"officer ({title})" if title else "officer")
    if ten_pct:
        roles.append("10% owner")
    return InsiderTransaction(
        issuer_cik=CIK,
        owner_name=owner,
        owner_relationship=", ".join(roles) or None,
        officer_title=title,
        is_officer=officer,
        is_director=director,
        is_ten_percent_owner=ten_pct,
        form_type=form,
        filed=filed,
        accession=accession,
        security_title=security,
        is_holding=True,
    )


def _eightk(filed: str, items: str = "5.02", accession: str = "0000320193-26-000001"):
    return FilingIndexEntry(
        cik=CIK, accession=accession, form="8-K", filing_date=filed, items=items
    )


def _build(rows=(), filings=(), *, index_built=True, **kw):
    return build_officer_changes(
        CIK,
        initial_statements=list(rows),
        filings=list(filings),
        index_built=index_built,
        **kw,
    )


class TestArrivals:
    def test_one_form_3_is_one_arrival_not_one_row_per_security(self):
        # Apple's Form 3 for Ben Borders produced four rows, one per security held.
        rows = [_form3(security=s) for s in ("Common Stock", "RSU A", "RSU B", "RSU C")]
        result = _build(rows)
        assert result.arrival_count == 1
        assert result.changes[0].person == "Borders Ben"

    def test_two_people_in_one_filing_are_two_arrivals(self):
        rows = [_form3(owner="Borders Ben"), _form3(owner="Khan Sabih", title="COO")]
        assert _build(rows).arrival_count == 2

    def test_an_arrival_carries_the_role_and_the_source(self):
        # The role is the filer's OWN relationship string, whole. Rebuilding a cleaner label out
        # of `officer_title` would mean splitting a field that cannot be split.
        change = _build([_form3()]).changes[0]
        assert change.kind == "arrival"
        assert change.role == "officer (Principal Accounting Officer)"
        assert change.role_is_stated_title is True
        assert change.source == "Form 3"
        assert change.date == "2026-01-02"

    def test_a_director_with_no_officer_title_still_reads_as_a_role(self):
        rows = [_form3(owner="NORA JOHNSON SUZANNE M", title=None, officer=False, director=True)]
        assert _build(rows).changes[0].role == "director"


class TestWhoCounts:
    def test_a_ten_percent_owner_is_not_a_personnel_change(self):
        # NVIDIA Corp files a Form 3 against itself as a 10% owner. That is an ownership event.
        rows = [
            _form3(owner="NVIDIA CORP", title=None, officer=False, director=False, ten_pct=True),
            _form3(owner="Borders Ben"),
        ]
        result = _build(rows)
        assert result.arrival_count == 1
        assert [c.person for c in result.changes] == ["Borders Ben"]
        assert result.arrivals_excluded == 1  # named, not silently dropped

    def test_an_officer_who_is_also_a_ten_percent_owner_still_counts(self):
        rows = [_form3(owner="Founder A", director=True, ten_pct=True)]
        assert _build(rows).arrival_count == 1

    def test_unclassified_rows_are_excluded_and_counted_separately(self):
        # Rows cached before the role columns existed. None is UNKNOWN -- assuming "not an
        # officer" would silently drop real arrivals, so they are reported instead.
        rows = [_form3(officer=None, director=None, ten_pct=None, title=None)]
        result = _build(rows)
        assert result.arrival_count == 0
        assert result.arrivals_unclassified == 1
        assert result.status == "na"


class TestRoleHonesty:
    def test_see_remarks_is_not_rendered_as_a_job_title(self):
        # EDGAR's convention for "the role is in the remarks", on 9,303 rows in our store.
        # Printing it would present a pointer as an answer.
        change = _build([_form3(title="See Remarks")]).changes[0]
        assert "See Remarks" not in (change.role or "")
        assert change.role_is_stated_title is False
        assert "remarks" in (change.role or "").lower()

    def test_an_officer_with_no_title_shows_the_bare_box(self):
        change = _build([_form3(title=None)]).changes[0]
        assert change.role == "officer"
        assert change.role_is_stated_title is False

    def test_the_full_relationship_string_travels_for_a_tooltip(self):
        change = _build([_form3(director=True)]).changes[0]
        assert change.relationship == "director, officer (Principal Accounting Officer)"


class TestLegacyRowsFallBackToTheDisplayString:
    """438,628 rows were cached before the role columns existed. Dropping them would be a gap of
    our own making, so the officer/director filter falls back to the string's LEFT PREFIX --
    decidable because `_relationship_label` joins in a fixed order, verified against all 12,630
    distinct values in the store (0 violations)."""

    @staticmethod
    def _legacy(relationship: str, **kw) -> InsiderTransaction:
        return InsiderTransaction(
            issuer_cik=CIK,
            owner_name=kw.get("owner", "Legacy Person"),
            owner_relationship=relationship,
            officer_title=None,
            is_officer=None,
            is_director=None,
            is_ten_percent_owner=None,
            form_type="3",
            filed="2020-05-01",
            accession=kw.get("accession", "legacy-1"),
            is_holding=True,
        )

    def test_a_legacy_officer_row_is_still_an_arrival(self):
        result = _build([self._legacy("officer (Chief Financial Officer)")])
        assert result.arrival_count == 1
        assert result.changes[0].role == "officer (Chief Financial Officer)"

    def test_a_legacy_director_row_is_still_an_arrival(self):
        assert _build([self._legacy("director")]).arrival_count == 1

    def test_a_legacy_ten_percent_owner_is_still_excluded(self):
        result = _build([self._legacy("10% owner")])
        assert result.arrival_count == 0
        assert result.arrivals_excluded == 1

    def test_a_title_containing_the_separator_does_not_break_the_filter(self):
        # The exact shape V4 flagged: a ", " inside the title. The filter never enters the paren.
        result = _build([self._legacy("director, officer (CEO, Acting CFO, Chairman)")])
        assert result.arrival_count == 1
        assert result.changes[0].role == "director, officer (CEO, Acting CFO, Chairman)"

    def test_free_text_naming_a_role_does_not_promote_an_other_filer(self):
        # "other" sorts last in the join, so a role word inside its text can never reach the
        # prefix. This is what makes the fallback exact rather than merely usually right.
        for text in ("other (Director of Subsidiary)", "other (officer of an affiliate)"):
            assert _build([self._legacy(text)]).arrival_count == 0

    def test_a_row_with_no_relationship_at_all_is_unclassified_not_excluded(self):
        result = _build([self._legacy("")])
        assert result.arrivals_unclassified == 1
        assert result.status == "na"


class TestEvents:
    def test_an_item_502_filing_becomes_an_event_with_no_person(self):
        change = _build(filings=[_eightk("2026-04-20")]).changes[0]
        assert change.kind == "event"
        assert change.person is None and change.role is None
        assert change.source == "8-K Item 5.02"

    def test_item_502_is_found_among_other_items(self):
        assert _build(filings=[_eightk("2026-06-25", "5.02,5.07,9.01")]).event_count == 1

    def test_an_eight_k_without_502_is_not_an_event(self):
        assert _build(filings=[_eightk("2026-06-25", "2.02,9.01")]).event_count == 0

    def test_no_action_verb_is_ever_produced(self):
        # The whole point: Item 5.02 covers departure, election, appointment AND compensatory
        # arrangement, and EDGAR's code says which one it is nowhere.
        change = _build(filings=[_eightk("2026-04-20")]).changes[0]
        assert not hasattr(change, "action")
        for verb in ("appointed", "resigned", "retired", "elected"):
            assert verb not in (change.source or "").lower()


class TestInterleaving:
    def test_both_sources_sort_together_by_date(self):
        result = _build(
            [_form3(filed="2026-03-06", owner="Newstead Jennifer", title="SVP, GC and Secretary")],
            [_eightk("2026-04-20"), _eightk("2025-12-05", accession="b")],
        )
        assert [c.date for c in result.changes] == ["2026-04-20", "2026-03-06", "2025-12-05"]

    def test_a_same_day_form_3_and_8_k_stay_two_rows(self):
        # Apple, 2026-01-02: almost certainly one appointment, but neither filing references the
        # other. Joining them would be our inference presented as their disclosure.
        result = _build([_form3(filed="2026-01-02")], [_eightk("2026-01-02")])
        assert len(result.changes) == 2
        assert {c.kind for c in result.changes} == {"arrival", "event"}

    def test_the_display_cap_bounds_rows_not_counts(self):
        rows = [_form3(accession=str(i), filed=f"2026-01-{i:02d}") for i in range(1, 13)]
        result = _build(rows, limit=8)
        assert result.arrival_count == 12
        assert len(result.changes) == 8


class TestUncheckedVersusEmpty:
    def test_an_unindexed_company_says_the_event_half_was_not_looked_at(self):
        result = _build(index_built=False)
        assert result.status == "na"
        assert result.index_built is False
        assert "not been built" in (result.reason or "")

    def test_an_unindexed_company_still_shows_its_arrivals(self):
        result = _build([_form3()], index_built=False)
        assert result.status == "ok"
        assert result.arrival_count == 1
        assert result.event_count == 0
        assert result.index_built is False

    def test_an_indexed_company_with_nothing_reports_a_finding(self):
        result = _build(index_built=True, indexed_filings=1000)
        assert result.status == "na"
        assert result.index_built is True
        assert "not been built" not in (result.reason or "")

    def test_the_indexed_window_travels_with_the_answer(self):
        result = _build(
            filings=[_eightk("2026-04-20")],
            indexed_filings=1000,
            covered_from="2015-06-01",
            covered_to="2026-07-30",
        )
        assert (result.covered_from, result.covered_to) == ("2015-06-01", "2026-07-30")


def _span(
    owner="Mercer Patrick",
    relationship="officer (President and CEO)",
    *,
    officer=True,
    director=False,
    title="President and CEO",
    first="2026-05-26",
    last=None,
):
    from secfin.normalize.schema import InsiderOwnerRole

    return InsiderOwnerRole(
        owner_name=owner,
        relationship=relationship,
        officer_title=title,
        is_officer=officer,
        is_director=director,
        first_filed=first,
        last_filed=last or first,
    )


class TestRoleBoxTransitions:
    """A filer restates its own boxes on every form, so a box turning ON is reported, not
    inferred. A box turning OFF is not reportable, and the reason is a real filing."""

    def test_an_officer_joining_the_board_is_reported(self):
        # IRIDEX: Patrick Mercer filed twice as officer, then as director and officer.
        result = _build(
            role_spans=[
                _span(first="2026-05-26", last="2026-06-16"),
                _span(
                    relationship="director, officer (President and CEO)",
                    director=True,
                    first="2026-07-14",
                ),
            ]
        )
        assert result.role_change_count == 1
        (change,) = [c for c in result.changes if c.kind == "role_change"]
        assert change.person == "Mercer Patrick"
        assert change.previous_role == "officer (President and CEO)"
        assert change.role == "director, officer (President and CEO)"
        assert change.date == "2026-07-14"

    def test_a_box_disappearing_is_not_a_departure(self):
        # Motorcar Parts of America: Selwyn Joffe filed as director+officer, then officer only --
        # while his own title still read "Chairman". The box was omitted, not vacated, and 854
        # removals in the store are indistinguishable from that one.
        result = _build(
            role_spans=[
                _span(
                    owner="SELWYN JOFFE",
                    relationship="director, officer (President, CEO & Chairman)",
                    director=True,
                    title="President, CEO & Chairman",
                    first="2026-06-23",
                ),
                _span(
                    owner="SELWYN JOFFE",
                    relationship="officer (President, CEO & Chairman)",
                    director=False,
                    title="President, CEO & Chairman",
                    first="2026-07-24",
                ),
            ]
        )
        assert result.role_change_count == 0

    def test_a_swap_of_one_box_for_another_is_not_reported(self):
        result = _build(
            role_spans=[
                _span(first="2026-01-01"),
                _span(relationship="director", officer=False, director=True, title=None,
                      first="2026-06-01"),
            ]
        )
        assert result.role_change_count == 0

    def test_two_roles_first_filed_the_same_day_have_no_direction(self):
        # 102 transitions in the store are same-day, usually an amendment restating a role.
        # Picking a direction would be a coin flip presented as a promotion.
        result = _build(
            role_spans=[
                _span(owner="Kaye Douglas", relationship="director, officer (CEO)",
                      director=True, first="2026-06-08"),
                _span(owner="Kaye Douglas", relationship="officer (CEO)", first="2026-06-08"),
            ]
        )
        assert result.role_change_count == 0

    def test_a_title_change_alone_is_never_a_promotion(self):
        # "Chief Operating Officer" -> "Chief Operating Off." is the same job. 2,340 people show
        # a changed title string and no rule separates the real ones without judging spelling.
        result = _build(
            role_spans=[
                _span(relationship="officer (VP and Chief Financial Officer)", first="2013-04-12"),
                _span(relationship="officer (VP and CFO)", first="2013-11-05"),
            ]
        )
        assert result.role_change_count == 0

    def test_an_arrival_and_its_role_change_on_the_same_day_are_one_row(self):
        # Rocky Mountain Chocolate: Allen Harper's Form 3 as interim CEO and his boxes changing
        # from 10%-owner are one appointment seen twice.
        result = _build(
            [_form3(owner="Harper Allen C", filed="2026-07-13", title="Interim CEO")],
            role_spans=[
                _span(owner="Harper Allen C", relationship="10% owner", officer=False,
                      title=None, first="2025-01-02"),
                _span(owner="Harper Allen C", relationship="officer (Interim CEO)",
                      title="Interim CEO", first="2026-07-13"),
            ],
        )
        assert result.arrival_count == 1
        assert result.role_change_count == 0


class TestRoster:
    def test_the_roster_lists_each_person_once_under_their_latest_role(self):
        result = _build(
            role_spans=[
                _span(first="2026-05-26", last="2026-06-16"),
                _span(relationship="director, officer (President and CEO)", director=True,
                      first="2026-07-14", last="2026-07-14"),
            ]
        )
        assert result.roster_total == 1
        assert result.roster[0].role == "director, officer (President and CEO)"
        assert (result.roster[0].is_officer, result.roster[0].is_director) == (True, True)

    def test_officers_sort_before_directors(self):
        result = _build(
            role_spans=[
                _span(owner="A Director", relationship="director", officer=False, director=True,
                      title=None, first="2026-07-30"),
                _span(owner="A CFO", relationship="officer (CFO)", first="2026-01-01"),
            ]
        )
        assert [m.person for m in result.roster] == ["A CFO", "A Director"]

    def test_a_ten_percent_owner_is_not_on_the_roster(self):
        result = _build(
            role_spans=[
                _span(owner="VANGUARD GROUP", relationship="10% owner", officer=False,
                      title=None, first="2026-01-01"),
                _span(first="2026-01-01"),
            ]
        )
        assert [m.person for m in result.roster] == ["Mercer Patrick"]

    def test_the_roster_is_capped_but_the_total_is_not(self):
        spans = [_span(owner=f"Officer {i}", first=f"2026-01-{i:02d}") for i in range(1, 13)]
        result = _build(role_spans=spans, roster_limit=5)
        assert result.roster_total == 12
        assert len(result.roster) == 5

    def test_the_roster_reports_the_window_it_rests_on(self):
        # Apple's 16 people come from a window covering its whole Section 16 population;
        # JPMorgan's 9 do not. The card cannot tell them apart without this.
        result = _build(role_spans=[_span()], cached_filings=12)
        assert result.roster_filings == 12

    def test_a_company_with_only_a_roster_still_renders(self):
        # No arrivals, no Item 5.02 — but we do know who the officers are. That is not `na`.
        result = _build(role_spans=[_span()], index_built=True)
        assert result.status == "ok"
        assert result.changes == []
        assert result.roster_total == 1

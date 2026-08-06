"""Tests for §05.5 -- Item 408(a) Rule 10b5-1 trading arrangements.

Every test here pins something a plausible implementation gets wrong, and each one comes from a
real filing read on 2026-08-05:

* the facts are DIMENSIONAL -- JPMorgan tags ten people and three securities amounts, so reading
  in document order attributes one officer's plan size to another,
* the `...Date` elements are typed as TEXT and the format varies between filers,
* a filing that says "no arrangements" still answers the question, which is different from a
  filing that predates Item 408(a) and answers nothing,
* an adoption and a termination look alike until you read the flag -- Amazon's Brian Olsavsky
  TERMINATED a plan and would otherwise render as a dateless adoption,
* the catch-all "other officers or directors" member is not a person.
"""

from __future__ import annotations

from secfin.sec.trading_arrangements import iso_date, parse_trading_arrangements

ECD = "http://xbrl.sec.gov/ecd/2025"
XBRLI = "http://www.xbrl.org/2003/instance"
XBRLDI = "http://xbrl.org/2006/xbrldi"


def _instance(facts: str, contexts: str = "", units: str = "") -> str:
    return (
        f'<xbrl xmlns="{XBRLI}" xmlns:ecd="{ECD}" xmlns:xbrldi="{XBRLDI}">'
        f"{contexts}{units}{facts}</xbrl>"
    )


def _ctx(cid: str, member: str | None = None, *, axis: str = "ecd:IndividualAxis") -> str:
    """A context, optionally qualified by an IndividualAxis member -- how a fact names a person."""
    seg = (
        f'<segment><xbrldi:explicitMember dimension="{axis}">{member}'
        "</xbrldi:explicitMember></segment>"
        if member
        else ""
    )
    return (
        f'<context id="{cid}"><entity><identifier scheme="s">1</identifier>{seg}</entity>'
        '<period><startDate>2025-10-01</startDate><endDate>2025-12-31</endDate></period></context>'
    )


_SHARES = '<unit id="shares"><measure>xbrli:shares</measure></unit>'


def _person(ctx: str, name: str, title: str, **facts: str) -> str:
    out = [
        f'<ecd:TrdArrIndName contextRef="{ctx}">{name}</ecd:TrdArrIndName>',
        f'<ecd:TrdArrIndTitle contextRef="{ctx}">{title}</ecd:TrdArrIndTitle>',
    ]
    for element, value in facts.items():
        unit = ' unitRef="shares"' if element == "TrdArrSecuritiesAggAvailAmt" else ""
        out.append(f'<ecd:{element} contextRef="{ctx}"{unit}>{value}</ecd:{element}>')
    return "".join(out)


class TestDimensionalGrouping:
    def test_each_person_gets_their_own_facts(self):
        # The JPMorgan shape: several people, and only some with a securities amount. Reading in
        # document order would hand Dimon's 200,000 shares to whoever was tagged next.
        xml = _instance(
            _person(
                "c1", "James Dimon", "Chairman and CEO",
                Rule10b51ArrAdoptedFlag="true",
                TrdArrAdoptionDate="November 10, 2025",
                TrdArrSecuritiesAggAvailAmt="200000",
            )
            + _person(
                "c2", "Ashley Bacon", "Chief Risk Officer",
                Rule10b51ArrAdoptedFlag="true",
                TrdArrAdoptionDate="November 12, 2025",
            ),
            _ctx("c1", "jpm:JamesDimonMember") + _ctx("c2", "jpm:AshleyBaconMember"),
            _SHARES,
        )
        result = parse_trading_arrangements(xml)
        by_name = {a.person: a for a in result.arrangements}
        assert by_name["James Dimon"].securities_amount == 200_000
        assert by_name["Ashley Bacon"].securities_amount is None
        assert by_name["Ashley Bacon"].adoption_date == "2025-11-12"

    def test_a_filing_level_fact_is_not_attributed_to_anyone(self):
        # The material-terms text block is tagged without an IndividualAxis. It is also prose, and
        # is read by nothing here.
        xml = _instance(
            '<ecd:MtrlTermsOfTrdArrTextBlock contextRef="c0">prose</ecd:MtrlTermsOfTrdArrTextBlock>'
            + _person("c1", "Amy E. Hood", "CFO", Rule10b51ArrAdoptedFlag="true"),
            _ctx("c0") + _ctx("c1", "msft:AmyEHoodMember"),
        )
        result = parse_trading_arrangements(xml)
        assert [a.person for a in result.arrangements] == ["Amy E. Hood"]

    def test_facts_split_across_two_contexts_for_one_person_are_merged(self):
        # Microsoft tags the securities amount against an INSTANT context and the rest against a
        # duration context -- same member, two contexts.
        xml = _instance(
            _person("c1", "Amy E. Hood", "CFO", Rule10b51ArrAdoptedFlag="true",
                    TrdArrAdoptionDate="June 10, 2026")
            + '<ecd:TrdArrSecuritiesAggAvailAmt contextRef="c2" unitRef="shares">4870'
              "</ecd:TrdArrSecuritiesAggAvailAmt>",
            _ctx("c1", "msft:AmyEHoodMember") + _ctx("c2", "msft:AmyEHoodMember"),
            _SHARES,
        )
        (row,) = parse_trading_arrangements(xml).arrangements
        assert row.adoption_date == "2026-06-10"
        assert row.securities_amount == 4870
        assert row.securities_unit == "shares"


class TestDates:
    def test_the_three_formats_filers_actually_use(self):
        assert iso_date("June 10, 2026") == "2026-06-10"  # Microsoft
        assert iso_date("November 3, 2025") == "2025-11-03"  # Amazon
        assert iso_date("12/10/2025") == "2025-12-10"  # NVIDIA
        assert iso_date("2025-11-14") == "2025-11-14"

    def test_an_unrecognised_format_is_left_unparsed_not_guessed(self):
        assert iso_date("Q4 2025") is None
        assert iso_date("the second week of November") is None
        assert iso_date("") is None

    def test_a_nonsense_date_does_not_produce_a_number(self):
        assert iso_date("Smarch 3, 2025") is None
        assert iso_date("13/45/2025") is None

    def test_the_raw_string_is_always_kept_beside_the_parsed_one(self):
        # `12/10/2025` is read US-order. A filer writing day-first would be misread, so the raw
        # value has to survive for a reader to check.
        xml = _instance(
            _person("c1", "X Y", "CFO", Rule10b51ArrAdoptedFlag="true",
                    TrdArrAdoptionDate="Q4 2025"),
            _ctx("c1", "co:XYMember"),
        )
        (row,) = parse_trading_arrangements(xml).arrangements
        assert row.adoption_date_raw == "Q4 2025"
        assert row.adoption_date is None


class TestAdoptionVersusTermination:
    def test_a_termination_is_not_a_dateless_adoption(self):
        # Amazon's Brian Olsavsky. Without reading the flag he renders as an adoption with no
        # date, which inverts what the filing says.
        xml = _instance(
            _person("c1", "Brian T. Olsavsky", "SVP and CFO",
                    Rule10b51ArrTrmntdFlag="true",
                    TrdArrTerminationDate="November 19, 2025",
                    TrdArrSecuritiesAggAvailAmt="53249"),
            _ctx("c1", "amzn:BrianT.OlsavskyMember"),
            _SHARES,
        )
        (row,) = parse_trading_arrangements(xml).arrangements
        assert row.rule_10b5_1_terminated is True
        assert row.rule_10b5_1_adopted is None
        assert row.termination_date == "2025-11-19"
        assert row.adoption_date is None

    def test_a_non_rule_arrangement_is_kept_apart_from_a_rule_10b5_1_one(self):
        # Item 408(a) asks about both. Only a Rule 10b5-1 plan carries the affirmative defence,
        # so conflating them would overstate what the disclosure means.
        xml = _instance(
            _person("c1", "X Y", "CFO", NonRule10b51ArrAdoptedFlag="true"),
            _ctx("c1", "co:XYMember"),
        )
        (row,) = parse_trading_arrangements(xml).arrangements
        assert row.non_rule_10b5_1_adopted is True
        assert row.rule_10b5_1_adopted is None


class TestDisclosedVersusEmpty:
    def test_a_filer_with_no_arrangements_still_answered_the_question(self):
        # Apple and Coca-Cola: flags tagged false against a catch-all member, no names. That is a
        # finding -- "nobody adopted a plan this quarter" -- not an absence of disclosure.
        xml = _instance(
            '<ecd:Rule10b51ArrAdoptedFlag contextRef="c1">false</ecd:Rule10b51ArrAdoptedFlag>'
            '<ecd:Rule10b51ArrTrmntdFlag contextRef="c1">false</ecd:Rule10b51ArrTrmntdFlag>',
            _ctx("c1", "aapl:OtherOfficersOrDirectorsMember"),
        )
        result = parse_trading_arrangements(xml)
        assert result.status == "ok"
        assert result.disclosed is True
        assert result.arrangements == []

    def test_the_catch_all_member_is_not_a_person(self):
        xml = _instance(
            '<ecd:Rule10b51ArrAdoptedFlag contextRef="c0">false</ecd:Rule10b51ArrAdoptedFlag>'
            + _person("c1", "Amy E. Hood", "CFO", Rule10b51ArrAdoptedFlag="true"),
            _ctx("c0", "msft:OtherOfficersOrDirectorsMember")
            + _ctx("c1", "msft:AmyEHoodMember"),
        )
        assert [a.person for a in parse_trading_arrangements(xml).arrangements] == ["Amy E. Hood"]

    def test_a_filing_predating_item_408a_is_na_not_an_empty_finding(self):
        # The requirement applies to periods ending after 2022-12-15. Before that a filing says
        # nothing, which must not read as "nobody adopted a plan".
        result = parse_trading_arrangements(_instance("", _ctx("c1")))
        assert result.status == "na"
        assert result.disclosed is False
        assert "took effect" in (result.reason or "")

    def test_unreadable_xml_is_na_with_a_reason(self):
        result = parse_trading_arrangements("<xbrl><unclosed>")
        assert result.status == "na"
        assert result.reason


class TestOrdering:
    def test_arrangements_sort_by_date_then_name(self):
        xml = _instance(
            _person("c1", "Zoe Last", "CFO", Rule10b51ArrAdoptedFlag="true",
                    TrdArrAdoptionDate="November 14, 2025")
            + _person("c2", "Al First", "CEO", Rule10b51ArrAdoptedFlag="true",
                      TrdArrAdoptionDate="November 10, 2025"),
            _ctx("c1", "co:ZMember") + _ctx("c2", "co:AMember"),
        )
        result = parse_trading_arrangements(xml)
        assert [a.person for a in result.arrangements] == ["Al First", "Zoe Last"]

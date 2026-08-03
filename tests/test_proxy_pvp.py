"""Tests for `sec/proxy.py` -- pay-versus-performance from the DEF 14A's extracted XBRL. No network.

The load-bearing behaviours here are boundaries, not arithmetic:

* the parser reads XML facts and NEVER the HTML `…TextBlock` elements in the same instance,
* it reads only DIMENSIONLESS contexts, because the same figures are also tagged per named
  executive and picking one would attribute a number to a person the filing did not,
* compensation actually paid can be NEGATIVE, and a card that clamps it is wrong.
"""

from __future__ import annotations

from secfin.sec.proxy import (
    find_def14a_instance,
    parse_pay_versus_performance,
)

ECD = "http://xbrl.sec.gov/ecd/2025"
XBRLI = "http://www.xbrl.org/2003/instance"
XBRLDI = "http://xbrl.org/2006/xbrldi"


def _instance(facts: str, contexts: str) -> str:
    return (
        f'<xbrl xmlns="{XBRLI}" xmlns:ecd="{ECD}" xmlns:xbrldi="{XBRLDI}">'
        f"{contexts}{facts}</xbrl>"
    )


def _ctx(cid: str, start: str, end: str, members: int = 0) -> str:
    dims = "".join(
        f'<segment><xbrldi:explicitMember dimension="ecd:D{i}">m{i}</xbrldi:explicitMember></segment>'
        for i in range(members)
    )
    entity = f"<entity><identifier scheme='s'>1</identifier>{dims}</entity>" if dims else ""
    return (
        f'<context id="{cid}">{entity}'
        f"<period><startDate>{start}</startDate><endDate>{end}</endDate></period></context>"
    )


class TestFindsTheExtractedInstance:
    def test_picks_the_instance_not_the_linkbases(self):
        index = {
            "directory": {
                "item": [
                    {"name": "aapl-20260224.xsd"},
                    {"name": "aapl-20260224_lab.xml"},
                    {"name": "aapl-20260224_cal.xml"},
                    {"name": "aapl014016-def14a_htm.xml"},
                ]
            }
        }
        assert find_def14a_instance(index) == "aapl014016-def14a_htm.xml"

    def test_a_proxy_without_one_is_an_absence(self):
        """Proxies before the rule's phase-in are not inline-XBRL and carry no instance."""
        assert find_def14a_instance({"directory": {"item": [{"name": "def14a.htm"}]}}) is None
        assert find_def14a_instance({}) is None


class TestReadsTheTable:
    def _two_years(self) -> str:
        contexts = _ctx("y1", "2023-10-01", "2024-09-28") + _ctx("y2", "2024-09-29", "2025-09-27")
        facts = (
            '<ecd:PeoTotalCompAmt contextRef="y1">74609802</ecd:PeoTotalCompAmt>'
            '<ecd:PeoActuallyPaidCompAmt contextRef="y1">168980568</ecd:PeoActuallyPaidCompAmt>'
            '<ecd:TotalShareholderRtnAmt contextRef="y1">207.59</ecd:TotalShareholderRtnAmt>'
            '<ecd:PeoTotalCompAmt contextRef="y2">74294811</ecd:PeoTotalCompAmt>'
            '<ecd:PeoActuallyPaidCompAmt contextRef="y2">108423733</ecd:PeoActuallyPaidCompAmt>'
            '<ecd:TotalShareholderRtnAmt contextRef="y2">233.88</ecd:TotalShareholderRtnAmt>'
            '<ecd:PeerGroupTotalShareholderRtnAmt contextRef="y2">279.51</ecd:PeerGroupTotalShareholderRtnAmt>'
            '<ecd:CoSelectedMeasureName contextRef="y2">Net Sales</ecd:CoSelectedMeasureName>'
        )
        return _instance(facts, contexts)

    def test_years_come_back_oldest_first_with_their_figures(self):
        r = parse_pay_versus_performance(self._two_years())
        assert r.status == "ok"
        assert [y.period_end for y in r.years] == ["2024-09-28", "2025-09-27"]
        assert r.years[1].peo_total == 74294811
        assert r.years[1].peo_actually_paid == 108423733
        assert r.years[1].peer_tsr == 279.51
        assert r.company_measure_name == "Net Sales"

    def test_an_absent_figure_stays_none_not_zero(self):
        r = parse_pay_versus_performance(self._two_years())
        assert r.years[0].peer_tsr is None
        assert r.years[0].neo_avg_total is None

    def test_compensation_actually_paid_can_be_negative(self):
        """NVIDIA's FY2023 is -$4,118,947: unvested equity fell, so the mark-to-market went below
        zero. A parser or card that treats this as invalid would hide a real disclosure."""
        xml = _instance(
            '<ecd:PeoActuallyPaidCompAmt contextRef="y1">-4118947</ecd:PeoActuallyPaidCompAmt>',
            _ctx("y1", "2022-01-31", "2023-01-29"),
        )
        assert parse_pay_versus_performance(xml).years[0].peo_actually_paid == -4118947


class TestBoundariesItRefusesToCross:
    def test_text_blocks_are_never_read(self):
        """The same instance carries HTML prose. Track 2 starts at that element and stops here."""
        xml = _instance(
            '<ecd:PeoTotalCompAmt contextRef="y1">100</ecd:PeoTotalCompAmt>'
            '<ecd:PvpTableTextBlock contextRef="y1">&lt;div&gt;prose&lt;/div&gt;</ecd:PvpTableTextBlock>'
            '<ecd:AwardTmgMethodTextBlock contextRef="y1">Equity awards are discretionary</ecd:AwardTmgMethodTextBlock>',
            _ctx("y1", "2024-09-29", "2025-09-27"),
        )
        result = parse_pay_versus_performance(xml)
        assert result.years[0].peo_total == 100
        # Nothing anywhere on the result carries the prose.
        assert "prose" not in repr(result)
        assert "discretionary" not in repr(result)

    def test_dimensional_contexts_are_ignored(self):
        """The same figures are tagged per named executive. Apple tags three different PEO members
        across five years -- reading them would attribute a figure to a person the filing did
        not."""
        xml = _instance(
            '<ecd:PeoTotalCompAmt contextRef="plain">74294811</ecd:PeoTotalCompAmt>'
            '<ecd:PeoTotalCompAmt contextRef="dim">999</ecd:PeoTotalCompAmt>',
            _ctx("plain", "2024-09-29", "2025-09-27")
            + _ctx("dim", "2024-09-29", "2025-09-27", members=2),
        )
        result = parse_pay_versus_performance(xml)
        assert len(result.years) == 1
        assert result.years[0].peo_total == 74294811

    def test_the_caveats_travel_with_the_numbers(self):
        r = parse_pay_versus_performance(self_xml := _instance("", ""))
        assert "not cash received" in r.cannot
        assert "indexed value of $100" in r.cannot
        # The three things that are NOT tagged anywhere are named, so no caller goes looking.
        assert "pay ratio" in r.cannot and "say-on-pay" in r.cannot
        assert self_xml  # silence the walrus lint


class TestDegradesHonestly:
    def test_an_untagged_proxy_is_na_with_a_reason(self):
        r = parse_pay_versus_performance(_instance("", ""))
        assert r.status == "na"
        assert "FY2024" in (r.reason or "")
        assert r.years == []

    def test_malformed_xml_does_not_raise(self):
        r = parse_pay_versus_performance("<xbrl><unclosed>")
        assert r.status == "na"
        assert r.reason

    def test_governance_flags_are_booleans_or_absent_never_false_by_default(self):
        """NVIDIA tags the policy flag and not the award-timing ones. `None` and `False` are
        different answers to 'does this company time awards around MNPI?'"""
        xml = _instance(
            '<ecd:InsiderTrdPoliciesProcAdoptedFlag contextRef="y1">true</ecd:InsiderTrdPoliciesProcAdoptedFlag>'
            '<ecd:PeoTotalCompAmt contextRef="y1">1</ecd:PeoTotalCompAmt>',
            _ctx("y1", "2024-09-29", "2025-09-27"),
        )
        r = parse_pay_versus_performance(xml)
        assert r.insider_trading_policy_adopted is True
        assert r.award_timing_considers_mnpi is None
        assert r.award_timing_predetermined is None

"""Tests for `sec/cover.py` -- the 10-K's auditor facts and extension-tag census. No network.

What is load-bearing here is not the extraction but the BOUNDARIES around it:

* the ICFR attestation flag is stored and is NOT the Item 9A effectiveness conclusion,
* `None` and `False` stay distinct on every flag -- they are different disclosures,
* extension counting distinguishes the registrant's own namespace from the standard ones, and
  counts element NAMES without ever reading an element's content,
* a dimensional fact is never taken for the company-level one.
"""

from __future__ import annotations

from secfin.sec.cover import find_extracted_instance, parse_cover_facts

DEI = "http://xbrl.sec.gov/dei/2025"
GAAP = "http://fasb.org/us-gaap/2025"
XBRLI = "http://www.xbrl.org/2003/instance"
XBRLDI = "http://xbrl.org/2006/xbrldi"
OWN = "http://www.apple.com/20250927"


def _instance(facts: str, contexts: str = "", *, ns: str = OWN) -> str:
    return (
        f'<xbrl xmlns="{XBRLI}" xmlns:dei="{DEI}" xmlns:us-gaap="{GAAP}" '
        f'xmlns:aapl="{ns}" xmlns:xbrldi="{XBRLDI}">{contexts}{facts}</xbrl>'
    )


def _ctx(cid: str, *, members: int = 0) -> str:
    dims = "".join(
        f'<segment><xbrldi:explicitMember dimension="d{i}">m{i}</xbrldi:explicitMember></segment>'
        for i in range(members)
    )
    entity = f"<entity><identifier scheme='s'>1</identifier>{dims}</entity>" if dims else ""
    return f'<context id="{cid}">{entity}<period><instant>2025-09-27</instant></period></context>'


#: Two extension elements, one of them used twice -- so `distinct` and `facts` cannot coincide.
_EXT_A = "CashCashEquivalentsAndMarketableSecuritiesCost"
_EXT_B = "EquitySecuritiesFVNIAccumulatedGrossUnrealizedGainBeforeTax"


def _ext(local: str, value: int) -> str:
    return f'<aapl:{local} contextRef="c">{value}</aapl:{local}>'


def _apple() -> str:
    return _instance(
        '<dei:AuditorName contextRef="c">Ernst &amp; Young LLP</dei:AuditorName>'
        '<dei:AuditorFirmId contextRef="c">42</dei:AuditorFirmId>'
        '<dei:AuditorLocation contextRef="c">San Jose, California</dei:AuditorLocation>'
        '<dei:IcfrAuditorAttestationFlag contextRef="c">true</dei:IcfrAuditorAttestationFlag>'
        '<dei:DocumentPeriodEndDate contextRef="c">2025-09-27</dei:DocumentPeriodEndDate>'
        '<us-gaap:Assets contextRef="c">331000000000</us-gaap:Assets>'
        + _ext(_EXT_A, 1)
        + _ext(_EXT_A, 2)
        + _ext(_EXT_B, 3),
        _ctx("c"),
    )


class TestFindsTheInstance:
    def test_picks_the_instance_not_the_linkbases(self):
        index = {
            "directory": {
                "item": [
                    {"name": "aapl-20250927.xsd"},
                    {"name": "aapl-20250927_lab.xml"},
                    {"name": "aapl-20250927_cal.xml"},
                    {"name": "aapl-20250927_def.xml"},
                    {"name": "aapl-20250927_htm.xml"},
                ]
            }
        }
        assert find_extracted_instance(index) == "aapl-20250927_htm.xml"

    def test_a_filing_without_one_is_an_absence(self):
        assert find_extracted_instance({"directory": {"item": [{"name": "a.htm"}]}}) is None
        assert find_extracted_instance({}) is None


class TestReadsTheAuditor:
    def test_name_firm_id_and_location_come_back(self):
        r = parse_cover_facts(_apple())
        assert r.status == "ok"
        assert r.auditor_name == "Ernst & Young LLP"
        assert r.auditor_firm_id == "42"
        assert r.auditor_location == "San Jose, California"
        assert r.period_end == "2025-09-27"

    def test_the_firm_id_stays_a_string(self):
        """It is the PCAOB's identifier, and the join key to Form AP. A number would invite
        arithmetic on it and drop a leading zero on any firm that has one."""
        assert isinstance(parse_cover_facts(_apple()).auditor_firm_id, str)

    def test_the_location_is_returned_as_the_filer_wrote_it(self):
        """Filers are not consistent -- 'Atlanta, Georgia' against 'New York, NY 10017'. Parsing
        that into city/state would invent a precision the filing does not carry."""
        xml = _instance(
            '<dei:AuditorLocation contextRef="c">New York, NY 10017</dei:AuditorLocation>'
            '<dei:AuditorName contextRef="c">PricewaterhouseCoopers LLP</dei:AuditorName>',
            _ctx("c"),
        )
        assert parse_cover_facts(xml).auditor_location == "New York, NY 10017"

    def test_a_dimensional_fact_is_never_taken_for_the_company_level_one(self):
        """A multi-registrant filing tags the auditor per registrant against a member axis."""
        xml = _instance(
            '<dei:AuditorName contextRef="plain">Ernst &amp; Young LLP</dei:AuditorName>'
            '<dei:AuditorName contextRef="dim">Some Other LLP</dei:AuditorName>',
            _ctx("plain") + _ctx("dim", members=1),
        )
        assert parse_cover_facts(xml).auditor_name == "Ernst & Young LLP"


class TestTheIcfrFlagIsNotTheConclusion:
    """The substitution this section exists to prevent.

    `IcfrAuditorAttestationFlag` means the control is SUBJECT TO auditor attestation. It does not
    say the control was effective and it does not say no material weakness was found -- both are
    the Item 9A prose conclusion. It is parsed, and it is never renamed into the other thing.
    """

    def test_the_flag_is_read_as_a_boolean(self):
        assert parse_cover_facts(_apple()).icfr_auditor_attestation is True

    def test_an_untagged_flag_stays_none_not_false(self):
        """`None` is 'the filer did not tag it'. `False` is 'the filer said no'. A card that
        collapsed them would report a disclosure that was never made."""
        xml = _instance('<dei:AuditorName contextRef="c">E&amp;Y</dei:AuditorName>', _ctx("c"))
        assert parse_cover_facts(xml).icfr_auditor_attestation is None

    def test_nothing_on_the_result_claims_effectiveness(self):
        r = parse_cover_facts(_apple())
        assert not any("effective" in f.lower() for f in vars(r))


class TestExtensionCensus:
    def test_only_the_registrants_own_namespace_counts_as_an_extension(self):
        census = parse_cover_facts(_apple()).extensions
        assert census.namespace == OWN
        assert census.distinct == 2  # two distinct aapl: elements
        assert census.facts == 3  # one used twice
        assert census.total_facts == 9  # + 5 dei + 1 us-gaap

    def test_us_gaap_dei_and_srt_are_never_counted_as_extensions(self):
        xml = _instance(
            '<us-gaap:Assets contextRef="c">1</us-gaap:Assets>'
            '<dei:AuditorName contextRef="c">E&amp;Y</dei:AuditorName>',
            _ctx("c"),
        )
        assert parse_cover_facts(xml).extensions.facts == 0

    def test_the_share_is_a_fraction_and_is_none_when_nothing_was_tagged(self):
        assert parse_cover_facts(_apple()).extensions.share == 3 / 9
        assert parse_cover_facts(_instance("")).extensions.share is None

    def test_the_census_records_element_names_never_their_values(self):
        """Counting how many elements a filer defined is structural. Reading what those elements
        SAY would be a different thing, and a filer's extension set includes TextBlocks."""
        top = dict(parse_cover_facts(_apple()).extensions.top)
        assert _EXT_A in top
        assert top[_EXT_A] == 2
        # No fact VALUE from an extension element reaches the result.
        assert "331000000000" not in repr(parse_cover_facts(_apple()))


class TestDegradesHonestly:
    def test_an_untagged_filing_is_na_with_a_reason(self):
        r = parse_cover_facts(_instance(""))
        assert r.status == "na"
        assert "December 2021" in (r.reason or "")

    def test_malformed_xml_does_not_raise(self):
        r = parse_cover_facts("<xbrl><unclosed>")
        assert r.status == "na"
        assert r.reason

    def test_the_measured_size_travels_so_the_next_estimate_is_not_a_guess(self):
        xml = _apple()
        assert parse_cover_facts(xml).instance_bytes == len(xml)

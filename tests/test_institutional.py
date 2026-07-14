"""Tests for Form 13F ingestion (secfin.sec.institutional).

Uses real (trimmed) SEC data for Berkshire Hathaway -- see
tests/fixtures/institutional/README.md -- including two info tables from before and
after the SEC's thousands-vs-whole-dollars `value` convention change, confirmed against
real share counts and historical prices, not assumed.
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from secfin.sec.client import DATA_HOST, SECClient
from secfin.sec.institutional import (
    FORM_13DG,
    FORM_13F,
    _find_info_table_document,
    _parse_other_manager_refs,
    _recent_13dg_filings,
    fetch_13f_snapshot,
    fetch_13f_snapshot_for_filing,
    fetch_beneficial_ownership,
    fetch_beneficial_ownership_with_filings,
    parse_cover_page_xml,
    parse_info_table_xml,
    parse_schedule_13dg_xml,
    recent_13f_filings,
)

FIXTURES_DIR = Path(__file__).parent / "fixtures" / "institutional"


def _submissions_url(cik: int) -> str:
    return f"{DATA_HOST}/submissions/CIK{SECClient.cik10(cik)}.json"


def _read_bytes(name: str) -> bytes:
    return (FIXTURES_DIR / name).read_bytes()


def _read_json(name: str) -> dict:
    return json.loads((FIXTURES_DIR / name).read_text())


class _FakeSECClient:
    """Stand-in for SECClient: serves fixed payloads/bytes by URL instead of the network.

    URL-building methods delegate to the real (stateless) SECClient logic so the URLs
    this test constructs line up with what institutional.py actually requests -- same
    approach as test_bulk_parity.py's _FakeSECClient / test_ticker_cache.py's _FakeClient.
    """

    def __init__(self, json_by_url: dict, bytes_by_url: dict) -> None:
        self._json = json_by_url
        self._bytes = bytes_by_url

    async def get_json(self, url: str) -> dict:
        return self._json[url]

    async def get_bytes(self, url: str) -> bytes:
        return self._bytes[url]

    def submissions_url(self, cik: int) -> str:
        return _submissions_url(cik)

    def filing_document_url(self, cik: int, accession: str, document: str) -> str:
        return SECClient.filing_document_url(cik, accession, document)

    def filing_index_json_url(self, cik: int, accession: str) -> str:
        return SECClient.filing_index_json_url(cik, accession)

    def strip_viewer_subdir(self, document: str) -> str:
        return SECClient.strip_viewer_subdir(document)

    cik10 = staticmethod(SECClient.cik10)


BERKSHIRE_CIK = 1067983
ACCESSION = "0001193125-26-226661"


def test_recent_13f_filings_filters_and_keeps_order():
    payload = _read_json("brk_submissions_trimmed.json")
    filings = recent_13f_filings(payload)

    assert all(f["form"] in FORM_13F for f in filings)
    # Only one 13F-HR falls inside the trimmed 40-entry slice (see README).
    assert len(filings) == 1
    assert filings[0]["accessionNumber"] == ACCESSION
    assert filings[0]["reportDate"] == "2026-03-31"


def test_parse_info_table_xml_2026_reports_whole_dollars():
    holdings = parse_info_table_xml(_read_bytes("brk13f_2026q1_infotable_trimmed.xml"))
    assert len(holdings) == 5

    ally_rows = [h for h in holdings if h.cusip == "02005N100"]
    assert len(ally_rows) == 2
    assert ally_rows[0].issuer_name == "ALLY FINL INC"
    assert ally_rows[0].shares == 12719675
    # Whole dollars: value / shares ~= a plausible per-share price (~$39), not thousands.
    assert ally_rows[0].value == 498992850
    assert ally_rows[0].shares_or_principal == "SH"
    assert ally_rows[0].investment_discretion == "DFND"
    assert ally_rows[0].put_call is None  # no option positions in this real sample
    # Real joint-filer attribution: each row's <otherManager> lists sequenceNumbers
    # into the cover page's otherManagers2Info roster (see test_parse_cover_page_xml).
    assert ally_rows[0].other_managers == [4]
    assert ally_rows[1].other_managers == [2, 4, 11]


def test_parse_info_table_xml_tolerates_padded_enum_fields():
    """Some filers pad sshPrnamtType/putCall with trailing whitespace (e.g. "SH ") --
    found live 2026-07-14 during the 2025-06-30 bulk backfill, where it silently dropped
    the entire manager's snapshot via a Pydantic Literal mismatch on the un-stripped value.
    """
    xml = b"""<?xml version="1.0"?>
<informationTable xmlns="http://www.sec.gov/edgar/document/thirteenf/informationtable">
  <infoTable>
    <nameOfIssuer>ALLY FINL INC</nameOfIssuer>
    <titleOfClass>COM</titleOfClass>
    <cusip>02005N100</cusip>
    <value>498992850</value>
    <shrsOrPrnAmt>
      <sshPrnamt>12719675</sshPrnamt>
      <sshPrnamtType>SH </sshPrnamtType>
    </shrsOrPrnAmt>
    <putCall>Put </putCall>
    <investmentDiscretion>DFND</investmentDiscretion>
  </infoTable>
</informationTable>"""
    holdings = parse_info_table_xml(xml)
    assert len(holdings) == 1
    assert holdings[0].shares_or_principal == "SH"
    assert holdings[0].put_call == "Put"


def test_parse_other_manager_refs():
    assert _parse_other_manager_refs(None) == []
    assert _parse_other_manager_refs("") == []
    assert _parse_other_manager_refs("   ") == []
    assert _parse_other_manager_refs("4") == [4]
    assert _parse_other_manager_refs("2,4,11") == [2, 4, 11]


def test_parse_cover_page_xml_real_berkshire_2026_roster():
    roster = parse_cover_page_xml(_read_bytes("brk13f_2026q1_coverpage.xml"))
    # Real cover page: 14 co-filing Berkshire subsidiaries/insurers (otherManagers2Info).
    assert len(roster) == 14
    assert roster[0].sequence_number == 1
    assert roster[0].name == "Berkshire Hathaway Homestate Insurance Co."
    assert roster[0].file_number == "28-2226"
    # sequenceNumber 4, referenced by the info table's ALLY FINL / ALPHABET rows above.
    buffett = next(m for m in roster if m.sequence_number == 4)
    assert buffett.name == "Buffett Warren E"


def test_parse_cover_page_xml_dedupes_a_reused_sequence_number():
    """Regression test for the real 2026-07-11 bug (docs/product/tracks/data.md): a
    real manager's cover page (CIK 1890906, accession 0001890906-26-000040) listed two
    DIFFERENT co-filers under the SAME sequenceNumber -- a real-world EDGAR
    data-quality quirk. `holdings_other_managers`'s storage key is
    (manager_cik, report_period, sequence_number), so storing both raises
    sqlite3.IntegrityError and crashed a real bulk backfill (see
    ingest/institutional_backfill.py's per-candidate isolation fix, added the same day).
    The parser now keeps the FIRST entry for a reused sequenceNumber and drops the rest,
    so a snapshot from this filing can be stored at all.
    """
    xml = b"""<?xml version="1.0" encoding="UTF-8"?>
<edgarSubmission xmlns="http://www.sec.gov/edgar/thirteenffiler">
  <formData>
    <summaryPage>
      <otherManagers2Info>
        <otherManager2>
          <sequenceNumber>1</sequenceNumber>
          <otherManager>
            <form13FFileNumber>28-1111</form13FFileNumber>
            <name>First Co-Filer</name>
          </otherManager>
        </otherManager2>
        <otherManager2>
          <sequenceNumber>2</sequenceNumber>
          <otherManager>
            <form13FFileNumber>28-2222</form13FFileNumber>
            <name>Second Co-Filer</name>
          </otherManager>
        </otherManager2>
        <otherManager2>
          <sequenceNumber>2</sequenceNumber>
          <otherManager>
            <form13FFileNumber>28-3333</form13FFileNumber>
            <name>Duplicate-Numbered Co-Filer</name>
          </otherManager>
        </otherManager2>
      </otherManagers2Info>
    </summaryPage>
  </formData>
</edgarSubmission>"""

    roster = parse_cover_page_xml(xml)

    assert [m.sequence_number for m in roster] == [1, 2]
    assert next(m for m in roster if m.sequence_number == 2).name == "Second Co-Filer"


def test_parse_cover_page_xml_ignores_legacy_unnumbered_other_managers_info():
    # Real 2016 Berkshire cover page carries BOTH a legacy, unnumbered
    # <otherManagersInfo> block (one entry: New England Asset Management Inc, no
    # sequenceNumber) AND the numbered otherManagers2Info roster. Only the latter
    # supports per-holding attribution, so only it is parsed -- "New England Asset
    # Management" must not appear.
    roster = parse_cover_page_xml(_read_bytes("brk13f_2016q3_coverpage.xml"))
    assert len(roster) == 14
    assert all(m.name != "New England Asset Management Inc" for m in roster)


def test_parse_info_table_xml_2016_reports_thousands():
    holdings = parse_info_table_xml(_read_bytes("brk13f_2016q3_infotable_trimmed.xml"))
    assert len(holdings) == 5

    aal = holdings[0]
    assert aal.issuer_name == "AMERICAN AIRLS GROUP INC"
    assert aal.shares == 13355099
    # Thousands: 488930 (thousand) / 13,355,099 shares ~= $36.60/share, not $0.0366.
    # Stored exactly as reported -- no rescaling (see module docstring UNIT CAVEAT).
    assert aal.value == 488930


async def test_find_info_table_document_picks_the_non_cover_xml():
    index_url = SECClient.filing_index_json_url(BERKSHIRE_CIK, ACCESSION)
    client = _FakeSECClient(
        json_by_url={index_url: _read_json("brk13f_2026q1_index.json")},
        bytes_by_url={},
    )
    doc = await _find_info_table_document(
        client, BERKSHIRE_CIK, ACCESSION, "xslForm13F_X02/primary_doc.xml"
    )
    assert doc == "53405.xml"


async def test_find_info_table_document_raises_on_ambiguous_directory():
    index_url = SECClient.filing_index_json_url(BERKSHIRE_CIK, ACCESSION)
    client = _FakeSECClient(
        json_by_url={
            index_url: {
                "directory": {
                    "item": [
                        {"name": "primary_doc.xml"},
                        {"name": "a.xml"},
                        {"name": "b.xml"},
                    ]
                }
            }
        },
        bytes_by_url={},
    )
    with pytest.raises(ValueError, match="expected exactly one"):
        await _find_info_table_document(
            client, BERKSHIRE_CIK, ACCESSION, "xslForm13F_X02/primary_doc.xml"
        )


async def test_fetch_13f_snapshot_assembles_holdings_snapshot():
    submissions_url = _submissions_url(BERKSHIRE_CIK)
    index_url = SECClient.filing_index_json_url(BERKSHIRE_CIK, ACCESSION)
    doc_url = SECClient.filing_document_url(BERKSHIRE_CIK, ACCESSION, "53405.xml")
    cover_url = SECClient.filing_document_url(BERKSHIRE_CIK, ACCESSION, "primary_doc.xml")

    client = _FakeSECClient(
        json_by_url={
            submissions_url: _read_json("brk_submissions_trimmed.json"),
            index_url: _read_json("brk13f_2026q1_index.json"),
        },
        bytes_by_url={
            doc_url: _read_bytes("brk13f_2026q1_infotable_trimmed.xml"),
            cover_url: _read_bytes("brk13f_2026q1_coverpage.xml"),
        },
    )

    snapshot = await fetch_13f_snapshot(client, BERKSHIRE_CIK, "2026-03-31")

    assert snapshot.manager_cik == BERKSHIRE_CIK
    assert snapshot.manager_name == "BERKSHIRE HATHAWAY INC"
    assert snapshot.report_period == "2026-03-31"
    assert snapshot.accession == ACCESSION
    assert snapshot.is_amendment is False
    assert len(snapshot.holdings) == 5
    # Joint-filer roster now fetched + attached alongside the holdings.
    assert len(snapshot.other_managers) == 14
    assert snapshot.holdings[0].other_managers == [4]


async def test_fetch_13f_snapshot_for_filing_skips_submissions_lookup():
    """A caller that already knows the winning filing (e.g. ingest/institutional_backfill.py,
    which resolves it locally from a submissions.zip scan) must get the same snapshot
    without fetch_13f_snapshot_for_filing ever touching submissions.json -- the fake
    client below has no submissions_url entry at all, so a stray call would KeyError."""
    index_url = SECClient.filing_index_json_url(BERKSHIRE_CIK, ACCESSION)
    doc_url = SECClient.filing_document_url(BERKSHIRE_CIK, ACCESSION, "53405.xml")
    cover_url = SECClient.filing_document_url(BERKSHIRE_CIK, ACCESSION, "primary_doc.xml")

    payload = _read_json("brk_submissions_trimmed.json")
    filing = recent_13f_filings(payload)[0]

    client = _FakeSECClient(
        json_by_url={index_url: _read_json("brk13f_2026q1_index.json")},
        bytes_by_url={
            doc_url: _read_bytes("brk13f_2026q1_infotable_trimmed.xml"),
            cover_url: _read_bytes("brk13f_2026q1_coverpage.xml"),
        },
    )

    snapshot = await fetch_13f_snapshot_for_filing(
        client, BERKSHIRE_CIK, "BERKSHIRE HATHAWAY INC", "2026-03-31", filing
    )

    assert snapshot.manager_cik == BERKSHIRE_CIK
    assert snapshot.manager_name == "BERKSHIRE HATHAWAY INC"
    assert snapshot.report_period == "2026-03-31"
    assert snapshot.accession == ACCESSION
    assert snapshot.is_amendment is False
    assert len(snapshot.holdings) == 5
    assert len(snapshot.other_managers) == 14


async def test_fetch_13f_snapshot_raises_when_quarter_not_found():
    submissions_url = _submissions_url(BERKSHIRE_CIK)
    client = _FakeSECClient(
        json_by_url={submissions_url: _read_json("brk_submissions_trimmed.json")},
        bytes_by_url={},
    )
    with pytest.raises(ValueError, match="no 13F-HR filing found"):
        await fetch_13f_snapshot(client, BERKSHIRE_CIK, "1999-12-31")


# --- Schedules 13D / 13G ------------------------------------------------------------

AAPL_CIK = 320193
RYTHM_CIK = 1800637


def test_recent_13dg_filings_excludes_legacy_html_text_form_types():
    payload = _read_json("aapl_submissions_13dg_trimmed.json")
    filings = _recent_13dg_filings(payload)

    assert all(f["form"] in FORM_13DG for f in filings)
    # Real slice has 3 modern (SCHEDULE 13G/13G-A) entries, 3 legacy (SC 13G/A) entries
    # deliberately excluded, and 3 unrelated Form 4s -- see the fixture README.
    assert len(filings) == 3
    assert filings[0]["accessionNumber"] == "0002100119-26-000139"
    assert filings[0]["form"] == "SCHEDULE 13G"


def test_parse_schedule_13g_single_reporting_person():
    owners = parse_schedule_13dg_xml(
        _read_bytes("aapl_schedule13g_vanguard.xml"),
        form_type="SCHEDULE 13G",
        filed="2026-04-29",
        accession="0002100119-26-000139",
    )
    assert len(owners) == 1
    owner = owners[0]
    assert owner.issuer_cik == AAPL_CIK
    assert owner.issuer_name == "Apple Inc"
    assert owner.owner_name == "Vanguard Capital Management"
    assert owner.form_type == "SCHEDULE 13G"
    assert owner.percent_of_class == 7.48
    assert owner.shares_beneficially_owned == 1099168953
    # eventDateRequiresFilingThisStatement is "03/31/2026" in the raw XML (MM/DD/YYYY).
    assert owner.event_date == "2026-03-31"
    assert owner.filed == "2026-04-29"
    assert owner.accession == "0002100119-26-000139"


def test_parse_schedule_13d_multiple_joint_reporting_persons():
    owners = parse_schedule_13dg_xml(
        _read_bytes("rythm_schedule13d_rslgh.xml"),
        form_type="SCHEDULE 13D/A",
        filed="2026-03-03",
        accession="0001213900-26-023065",
    )
    # 6 joint reporting persons in this real amendment (RSLGH up through Green Thumb).
    assert len(owners) == 6
    names = [o.owner_name for o in owners]
    assert names == [
        "RSLGH, LLC",
        "WELLNESS MGMT, LLC",
        "FOR SUCCESS HOLDING COMPANY",
        "VCP23, LLC",
        "GTI23, INC.",
        "GREEN THUMB INDUSTRIES INC.",
    ]
    for owner in owners:
        assert owner.issuer_cik == RYTHM_CIK
        assert owner.issuer_name == "RYTHM, Inc."
        assert owner.form_type == "SCHEDULE 13D/A"
        assert owner.percent_of_class == 49.99
        assert owner.shares_beneficially_owned == 13211928
        # dateOfEvent is "03/01/2026" in the raw XML (MM/DD/YYYY).
        assert owner.event_date == "2026-03-01"


def test_parse_schedule_13dg_xml_rejects_unrecognized_form_type():
    with pytest.raises(ValueError, match="unrecognized"):
        parse_schedule_13dg_xml(
            _read_bytes("aapl_schedule13g_vanguard.xml"),
            form_type="10-K",  # neither "13D" nor "13G" -- the dispatcher's guard clause
            filed=None,
            accession=None,
        )


async def test_fetch_beneficial_ownership_fetches_only_structured_filings():
    submissions_url = _submissions_url(AAPL_CIK)
    doc_url = SECClient.filing_document_url(AAPL_CIK, "0002100119-26-000139", "primary_doc.xml")

    client = _FakeSECClient(
        json_by_url={submissions_url: _read_json("aapl_submissions_13dg_trimmed.json")},
        bytes_by_url={doc_url: _read_bytes("aapl_schedule13g_vanguard.xml")},
    )

    owners = await fetch_beneficial_ownership(client, AAPL_CIK, limit=1)

    assert len(owners) == 1
    assert owners[0].owner_name == "Vanguard Capital Management"


async def test_fetch_beneficial_ownership_with_filings_returns_filing_metadata():
    submissions_url = _submissions_url(AAPL_CIK)
    doc_url = SECClient.filing_document_url(AAPL_CIK, "0002100119-26-000139", "primary_doc.xml")

    client = _FakeSECClient(
        json_by_url={submissions_url: _read_json("aapl_submissions_13dg_trimmed.json")},
        bytes_by_url={doc_url: _read_bytes("aapl_schedule13g_vanguard.xml")},
    )

    filings, owners = await fetch_beneficial_ownership_with_filings(client, AAPL_CIK, limit=1)

    assert len(filings) == 1
    assert filings[0].accession == "0002100119-26-000139"
    assert filings[0].form_type == "SCHEDULE 13G"
    assert len(owners) == 1
    assert owners[0].accession == "0002100119-26-000139"

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
    _recent_13dg_filings,
    _recent_13f_filings,
    fetch_13f_snapshot,
    fetch_beneficial_ownership,
    parse_info_table_xml,
    parse_schedule_13dg_xml,
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
    filings = _recent_13f_filings(payload)

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

    client = _FakeSECClient(
        json_by_url={
            submissions_url: _read_json("brk_submissions_trimmed.json"),
            index_url: _read_json("brk13f_2026q1_index.json"),
        },
        bytes_by_url={doc_url: _read_bytes("brk13f_2026q1_infotable_trimmed.xml")},
    )

    snapshot = await fetch_13f_snapshot(client, BERKSHIRE_CIK, "2026-03-31")

    assert snapshot.manager_cik == BERKSHIRE_CIK
    assert snapshot.manager_name == "BERKSHIRE HATHAWAY INC"
    assert snapshot.report_period == "2026-03-31"
    assert snapshot.accession == ACCESSION
    assert snapshot.is_amendment is False
    assert len(snapshot.holdings) == 5


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

"""Tests for Forms 3/4/5 ingestion (secfin.sec.insider).

Uses real (trimmed) SEC data -- see tests/fixtures/insider/README.md -- not synthetic
XML, so the parser is verified against actual schema quirks (e.g. isOfficer as "true"/
"false" in one filing vs "1"/"0" in another; a transactionPricePerShare with no <value>,
only a footnote).
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from secfin.sec.insider import (
    INSIDER_FORMS,
    _raw_document_name,
    _recent_filings,
    parse_ownership_xml,
)

FIXTURES_DIR = Path(__file__).parent / "fixtures" / "insider"


def _read(name: str) -> bytes:
    return (FIXTURES_DIR / name).read_bytes()


def test_raw_document_name_strips_viewer_subdirectory():
    # See the sec/insider.py module docstring: primaryDocument points at EDGAR's
    # rendered-HTML viewer path; the raw XML sits at the filing root under the same name.
    assert _raw_document_name("xslF345X06/form4.xml") == "form4.xml"
    assert _raw_document_name("xslF345X02/wk-form3_1772839848.xml") == "wk-form3_1772839848.xml"
    # No nested viewer folder -> no-op.
    assert _raw_document_name("form4.xml") == "form4.xml"


def test_recent_filings_filters_to_insider_forms_and_keeps_order():
    payload = json.loads((FIXTURES_DIR / "aapl_submissions_trimmed.json").read_text())
    filings = _recent_filings(payload, INSIDER_FORMS)

    assert all(f["form"] in INSIDER_FORMS for f in filings)
    # Real slice has 17 Form 4s + 1 Form 3 in the first 30 recent filings (see README).
    assert len(filings) == 18
    # Newest-first order is preserved (first insider filing in the real slice).
    assert filings[0]["accessionNumber"] == "0001140361-26-025622"
    assert filings[0]["form"] == "4"


def test_form4_parses_nonderivative_and_derivative_transactions():
    records = parse_ownership_xml(
        _read("aapl_form4_newstead.xml"),
        form_type="4",
        filed="2026-06-17",
        accession="0001140361-26-025622",
    )
    # 2 nonDerivativeTransaction rows + 1 derivativeTransaction row, no holdings.
    assert len(records) == 3
    assert all(r.issuer_cik == 320193 for r in records)
    assert all(r.issuer_name == "Apple Inc." for r in records)
    assert all(r.owner_name == "Newstead Jennifer" for r in records)
    assert all(r.owner_relationship == "officer (SVP, GC and Secretary)" for r in records)
    assert all(not r.is_holding for r in records)

    rsu_vest, tax_withholding, derivative = records

    assert rsu_vest.security_title == "Common Stock"
    assert rsu_vest.shares == 30104
    assert rsu_vest.acquired_disposed == "A"
    assert rsu_vest.ownership_type == "direct"
    assert rsu_vest.shares_owned_after == 57784
    # No <value> under transactionPricePerShare (only a footnote) -> None, not a crash.
    assert rsu_vest.price_per_share is None

    assert tax_withholding.shares == 16238
    assert tax_withholding.price_per_share == 296.42
    assert tax_withholding.acquired_disposed == "D"

    assert derivative.security_title == "Restricted Stock Unit"
    assert derivative.shares == 30104


def test_form3_parses_holdings_with_no_transaction_amounts():
    records = parse_ownership_xml(
        _read("aapl_form3_newstead.xml"),
        form_type="3",
        filed="2026-03-06",
        accession="0001780525-26-000003",
    )
    # nonDerivativeTable is empty; derivativeTable has 2 derivativeHolding rows.
    assert len(records) == 2
    assert all(r.is_holding for r in records)
    assert all(r.transaction_date is None for r in records)
    assert all(r.shares is None for r in records)
    assert all(r.acquired_disposed is None for r in records)
    assert {r.security_title for r in records} == {"Restricted Stock Unit"}
    # isDirector=0, isOfficer=1 with a title, isTenPercentOwner=0, isOther=0.
    assert records[0].owner_relationship == "officer (SVP, GC and Secretary)"


def test_form5_director_relationship_uses_1_0_flag_format():
    records = parse_ownership_xml(
        _read("aapl_form5_wagner.xml"),
        form_type="5",
        filed="2024-10-01",
        accession="0000320193-24-000102",
    )
    assert len(records) >= 1
    assert records[0].owner_name == "WAGNER SUSAN"
    # isDirector=1, isOfficer=0, no officerTitle -- "1"/"0" flag format (older schema).
    assert records[0].owner_relationship == "director"


def test_form4_joint_filers_emit_one_row_per_reporting_owner():
    # Real Berkshire Hathaway / Warren Buffett joint Form 4 on DaVita Inc. (DVA) -- a
    # single shared sale transaction, reported jointly by the corporate 10% owner and
    # its controlling stockholder. See tests/fixtures/insider/README.md.
    records = parse_ownership_xml(
        _read("brka_form4_davita_joint.xml"),
        form_type="4",
        filed="2026-05-05",
        accession="0001193125-26-207021",
    )
    # 1 nonDerivativeTransaction row x 2 reportingOwners -> 2 records, not 1.
    assert len(records) == 2
    assert {r.owner_name for r in records} == {"BERKSHIRE HATHAWAY INC", "BUFFETT WARREN E"}
    assert all(r.issuer_cik == 927066 for r in records)
    assert all(r.issuer_name == "DAVITA INC." for r in records)
    assert all(r.security_title == "Common Stock" for r in records)
    assert all(r.shares == 1220376 for r in records)
    assert all(r.acquired_disposed == "D" for r in records)
    assert all(r.owner_relationship == "10% owner" for r in records)


def test_parse_ownership_xml_requires_issuer_cik():
    with pytest.raises(ValueError, match="issuerCik"):
        parse_ownership_xml(
            b"<ownershipDocument><issuer></issuer></ownershipDocument>",
            form_type="4",
            filed=None,
            accession=None,
        )

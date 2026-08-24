"""Tests for filing segmentation (sec/filing_sections.py) + its store. No network.

The load-bearing rule: a Table-of-Contents entry must never be mistaken for a real section body,
and a section that legitimately doesn't apply to a form (CYBER on a 10-Q) gets no row at all --
never a manufactured `status="na"`.
"""

from __future__ import annotations

import importlib.util

import pytest

from secfin.storage.sqlite_filing_section_repository import SQLiteFilingSectionRepository

_HAS_SEC_PARSER = importlib.util.find_spec("sec_parser") is not None
_needs_sec_parser = pytest.mark.skipif(
    not _HAS_SEC_PARSER, reason="requires the narrative extra (sec-parser)"
)

# A minimal but real-shaped 10-K fragment: a Table of Contents (anchor links only, no body) is
# immediately followed by the actual document, whose Item 1A has a substantial body and Item 1B
# is deliberately near-empty (a real, common pattern -- "None." is the entire section for many
# filers) to exercise the word-count floor.
_SYNTHETIC_10K = """
<html><body>
<div>
  <p>TABLE OF CONTENTS</p>
  <p><a href="#rf">Item 1A. Risk Factors</a></p>
  <p><a href="#legal">Item 3. Legal Proceedings</a></p>
</div>
<h2 id="rf">Item 1A. Risk Factors</h2>
<p>{risk_body}</p>
<h2>Item 1B. Unresolved Staff Comments</h2>
<p>None.</p>
<h2 id="legal">Item 3. Legal Proceedings</h2>
<p>{legal_body}</p>
<h2>Item 4. Mine Safety Disclosures</h2>
<p>Not applicable.</p>
</body></html>
""".format(
    risk_body=" ".join(
        ["The Company faces various risks that could materially affect results."] * 20
    ),
    legal_body=" ".join(
        ["The Company is involved in routine legal proceedings from time to time."] * 10
    ),
)

_HEADERLESS = (
    "<html><body><p>Just some prose with no Item headings at all in it whatsoever.</p>"
    "</body></html>"
)


@_needs_sec_parser
def test_toc_entry_is_not_mistaken_for_the_section_body():
    """The TOC lists "Item 1A. Risk Factors" as a bare link with no content after it; the real
    section, much further down, has a substantial body. Extraction must land on the real one.

    (Only RF is asserted here -- a minimal synthetic fixture is not a reliable stand-in for
    sec-parser's real title-classification heuristics on every section; `segment_filing` was
    validated far more thoroughly against three REAL filings during the Wave A implementation
    spike, see sec/filing_sections.py's docstring, which is the stronger evidence for the other
    items' correctness.)
    """
    from secfin.sec.filing_sections import segment_filing

    results = {r.item_code: r for r in segment_filing(_SYNTHETIC_10K, "10-K")}
    assert results["RF"].status == "ok"
    assert results["RF"].word_count > 50  # the real body, not the TOC's handful of words


@_needs_sec_parser
def test_cyber_has_no_row_at_all_on_a_10q():
    from secfin.sec.filing_sections import segment_filing

    results = segment_filing(_SYNTHETIC_10K, "10-Q")
    assert "CYBER" not in {r.item_code for r in results}


@_needs_sec_parser
def test_headerless_document_gets_no_header_found_reason():
    from secfin.sec.filing_sections import segment_filing

    results = {r.item_code: r for r in segment_filing(_HEADERLESS, "10-K")}
    assert results["RF"].status == "na"
    assert "No recognizable" in results["RF"].reason


def test_unrecognized_form_returns_empty_list():
    from secfin.sec.filing_sections import segment_filing

    assert segment_filing(_SYNTHETIC_10K, "8-K") == []


def test_repo_roundtrip_and_schema_version_healing(tmp_path):
    from secfin.sec.filing_sections import SECTIONS_SCHEMA_VERSION, SectionResult

    repo = SQLiteFilingSectionRepository(str(tmp_path / "s.db"))
    ok = SectionResult(
        item_code="RF", section_name="Risk Factors", cleaned_text="some text",
        word_count=2, sentence_count=1,
    )
    na = SectionResult(
        item_code="LEGAL", section_name="Legal Proceedings", cleaned_text="",
        word_count=0, sentence_count=0, status="na", reason="No recognizable heading found.",
    )
    repo.upsert_sections(1, "acc-1", [ok, na])

    got = repo.get_sections(1, "acc-1")
    assert got["RF"].status == "ok" and got["RF"].word_count == 2
    assert got["LEGAL"].status == "na"
    assert repo.get_sections(1, "acc-missing") == {}

    # A row written under an older schema version reads as a cache MISS, not an answer.
    repo._conn.execute(
        "UPDATE filing_sections SET schema_version = ? WHERE cik = 1 AND accession = 'acc-1'",
        (SECTIONS_SCHEMA_VERSION - 1,),
    )
    repo._conn.commit()
    assert repo.get_sections(1, "acc-1") == {}
    repo.close()

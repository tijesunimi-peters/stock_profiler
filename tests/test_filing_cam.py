"""Tests for Critical Audit Matter extraction (sec/filing_cam.py), Track 2 Wave B §8.2.

The load-bearing evidence for this module is REAL-FILING verification, not synthetic HTML -- see
the module's own docstring for the full account of what real structure looks like (Apple: one
matter merged into one blob; Microsoft: two matters, cleanly separated elements; JPMorgan Chase:
two matters merged into one blob, with a mid-page-break split and a spurious repeated report
heading in between). Every fix in that docstring was found by running against those three real
10-Ks and checking actual output, matching the same discipline `filing_sections.py`'s own
`_MIN_WORDS`/TOC-handling verification used. A minimal synthetic document cannot exercise most of
that -- `sec-parser`'s real classification quirks (running headers landing as `TitleElement`s,
titles split across elements, page-header interleaving) simply don't reproduce reliably on a
handful of `<h2>` tags, the same limitation `test_filing_sections.py` already documents for RF.

This file tests what IS reliably testable without a live network fetch: the pure regex/string
helpers in isolation, and end-to-end extraction over one minimal single-matter synthetic document
(no multi-matter splitting asserted here -- that's exactly the real-filing-dependent behavior).
"""

from __future__ import annotations

import importlib.util

import pytest

from secfin.sec.filing_cam import (
    _extract_title,
    _merge_continuations,
    _split_merged_piece,
    segment_cam_matters,
)

_HAS_SEC_PARSER = importlib.util.find_spec("sec_parser") is not None
_needs_sec_parser = pytest.mark.skipif(
    not _HAS_SEC_PARSER, reason="requires the narrative extra (sec-parser)"
)


# ============================================================ pure helpers, no sec-parser needed

def test_merge_continuations_joins_text_missing_terminal_punctuation():
    raw = ["...fair value estimate of certain level", "3 financial instruments..."]
    assert _merge_continuations(raw) == [
        "...fair value estimate of certain level 3 financial instruments..."
    ]


def test_merge_continuations_keeps_separate_pieces_that_end_in_punctuation():
    assert _merge_continuations(["First matter text.", "Second matter text."]) == [
        "First matter text.",
        "Second matter text.",
    ]


def test_merge_continuations_skips_empty_strings():
    assert _merge_continuations(["", "  ", "Real text."]) == ["Real text."]


def test_split_merged_piece_leaves_single_note_reference_alone():
    piece = (
        "Uncertain Tax Positions. Refer to Note 7 to the financial statements. "
        "Auditing management's evaluation was complex. "
        "We evaluated the assessment included in Note 7 to the financial statements."
    )
    # TWO mentions of the SAME note -- not two matters. No no-space boundary sits near either
    # mention (both are normally spaced prose), so no split should be found.
    assert _split_merged_piece(piece) == [piece]


def test_split_merged_piece_splits_on_no_space_boundary_near_a_second_note():
    piece = (
        "Allowance for Loan Losses. As described in Note 13 to the consolidated financial "
        "statements, the allowance was material.Fair Value of Certain InstrumentsAs described "
        "in Note 2 to the consolidated financial statements, these were level 3."
    )
    parts = _split_merged_piece(piece)
    assert len(parts) == 2
    assert parts[0].startswith("Allowance for Loan Losses")
    assert parts[1].startswith("Fair Value of Certain Instruments")


def test_extract_title_stops_at_known_description_intro_phrase():
    assert _extract_title("Revenue Recognition. Refer to Note 1 to the financial statements.") == (
        "Revenue Recognition."
    )
    assert _extract_title(
        "Uncertain Tax PositionsDescription of the MatterAs discussed in Note 7..."
    ) == "Uncertain Tax Positions"


def test_extract_title_returns_none_when_no_known_phrase_found():
    text = "Some prose with no recognizable delimiter anywhere in it at all."
    assert _extract_title(text) is None


# ============================================================ end-to-end, needs sec-parser

_SYNTHETIC_SINGLE_MATTER = """
<html><body>
<h2>Report of Independent Registered Public Accounting Firm</h2>
<p>To the Shareholders and the Board of Directors of Example Inc.</p>
<h2>Opinion on the Financial Statements</h2>
<p>We have audited the accompanying consolidated balance sheets of Example Inc.</p>
<h2>Critical Audit Matter</h2>
<p>The critical audit matter communicated below is a matter arising from the current period audit
of the financial statements that was communicated or required to be communicated to the audit
committee and that involved especially challenging, subjective, or complex judgments. The
communication of the critical audit matter does not alter in any way our opinion on the financial
statements, taken as a whole, and we are not, by communicating the critical audit matter below,
providing a separate opinion on the critical audit matter or on the account or disclosure to which
it relates. Revenue Recognition. Refer to Note 1 to the financial statements. {body}We tested
controls relating to revenue recognition. Our audit procedures included testing management's
assumptions. /s/ Example LLP We have served as the Company's auditor since 2015.</p>
</body></html>
""".format(body="The Company recognizes revenue upon transfer of control of promised goods. " * 15)

_NO_CAM_LANGUAGE = (
    "<html><body><p>Just some prose with no auditor's report in it at all.</p></body></html>"
)


@_needs_sec_parser
def test_single_matter_extracted_with_real_content():
    matters = segment_cam_matters(_SYNTHETIC_SINGLE_MATTER)
    assert len(matters) == 1
    assert matters[0].status == "ok"
    assert matters[0].word_count > 100
    assert "Revenue Recognition" in matters[0].cleaned_text
    assert matters[0].title_text == "Revenue Recognition."


@_needs_sec_parser
def test_no_disclaimer_found_returns_na():
    matters = segment_cam_matters(_NO_CAM_LANGUAGE)
    assert len(matters) == 1
    assert matters[0].status == "na"
    assert "No recognizable" in matters[0].reason


@_needs_sec_parser
def test_malformed_document_does_not_crash():
    # `import sec_parser` happens BEFORE the try/except (matching filing_sections.py's own
    # segment_filing exactly) -- there is no graceful missing-extra fallback at this level by
    # design; the caller is responsible for only calling this when the extra is installed. This
    # test is scoped to what the try/except DOES guard: a document sec-parser itself can't handle.
    matters = segment_cam_matters("<html><body><p>unclosed")
    assert len(matters) == 1
    assert matters[0].status == "na"

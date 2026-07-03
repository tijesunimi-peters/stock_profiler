"""Tests for parsing the SEC daily form index (no network).

Fixture text below mirrors the real column layout of a live 2026 QTR3 sample
(form.20260702.idx), including the quirky two-line header EDGAR still ships.
"""

from __future__ import annotations

import datetime as dt

from secfin.ingest.incremental import daily_index_url, parse_form_index

_SAMPLE = """Description:  Daily Index of EDGAR Dissemination Feed by Form Type
Last Data Received:  Jul 2, 2026

Form Type   Company Name        CIK
      Date Filed  File Name
--------------------------------------------------------
1-A       Arte Consulting Inc.       2137570  20260702  edgar/data/2137570/f.txt
10-K      UNIVERSAL SAFETY PRODUCTS  102109   20260702  edgar/data/102109/f.txt
10-Q      Concentrix Corp            1803599  20260702  edgar/data/1803599/f.txt
10-Q      KB Global Holdings Ltd     1897525  20260702  edgar/data/1897525/f.txt
SC 13G    Some Fund LP               9999999  20260702  edgar/data/9999999/f.txt
"""


def test_parse_form_index_filters_and_dedupes():
    ciks = parse_form_index(_SAMPLE)
    assert ciks == [102109, 1803599, 1897525]


def test_parse_form_index_respects_custom_forms():
    ciks = parse_form_index(_SAMPLE, forms=frozenset({"SC 13G"}))
    assert ciks == [9999999]


def test_daily_index_url_picks_correct_quarter():
    assert (
        daily_index_url(dt.date(2026, 7, 2))
        == "https://www.sec.gov/Archives/edgar/daily-index/2026/QTR3/form.20260702.idx"
    )
    assert (
        daily_index_url(dt.date(2026, 1, 15))
        == "https://www.sec.gov/Archives/edgar/daily-index/2026/QTR1/form.20260115.idx"
    )

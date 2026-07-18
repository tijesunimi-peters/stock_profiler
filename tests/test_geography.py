"""Tests for the 13F filer-location classifier (normalize/geography.py, no network).

See the module docstring for why territories fall to `other` (off the albers-usa map) and
why a missing code is `unknown` rather than assumed domestic.
"""

from __future__ import annotations

from secfin.normalize.geography import US_STATE_CODES, classify_location


def test_states_and_dc_classify_as_state():
    assert classify_location("NE") == "state"
    assert classify_location("CA") == "state"
    assert classify_location("DC") == "state"
    assert len(US_STATE_CODES) == 51  # 50 states + DC


def test_case_and_whitespace_are_normalized():
    assert classify_location(" ne ") == "state"
    assert classify_location("ca") == "state"


def test_missing_code_is_unknown_not_domestic():
    assert classify_location(None) == "unknown"
    assert classify_location("") == "unknown"
    assert classify_location("   ") == "unknown"


def test_foreign_and_territory_codes_are_other():
    # A foreign country code and a US territory both land in `other` -- neither is drawn by
    # the albers-usa choropleth. The bucket is labelled "outside the 50 states & DC", so a
    # Puerto Rico filer is never mislabelled "foreign".
    assert classify_location("L2") == "other"  # EDGAR code for Cayman Islands
    assert classify_location("PR") == "other"  # Puerto Rico (US territory, off-map)

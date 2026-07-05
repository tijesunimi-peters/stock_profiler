"""Tests for deriving institutional buy/sell from 13F snapshot diffs (no network)."""

from __future__ import annotations

import pytest

from secfin.normalize.flows import diff_snapshots, prior_quarter_end
from secfin.normalize.schema import HoldingsSnapshot, InstitutionalHolding


def _snap(period: str, positions: dict[str, float]) -> HoldingsSnapshot:
    return HoldingsSnapshot(
        manager_cik=1000,
        manager_name="Test Capital",
        report_period=period,
        holdings=[
            InstitutionalHolding(cusip=c, issuer_name=c, shares=s)
            for c, s in positions.items()
        ],
    )


def test_new_added_reduced_exited():
    prior = _snap("2024-03-31", {"AAA": 100, "BBB": 50, "CCC": 10})
    current = _snap("2024-06-30", {"AAA": 150, "BBB": 20, "DDD": 5})  # CCC exited, DDD new

    deltas = {d.cusip: d for d in diff_snapshots(current, prior)}

    assert deltas["AAA"].action == "added"
    assert deltas["AAA"].shares_change == 50
    assert deltas["BBB"].action == "reduced"
    assert deltas["BBB"].shares_change == -30
    assert deltas["CCC"].action == "exited"
    assert deltas["CCC"].shares_after is None
    assert deltas["DDD"].action == "new"
    assert deltas["DDD"].from_period is None or deltas["DDD"].shares_before is None


def test_first_filing_all_new():
    current = _snap("2024-06-30", {"AAA": 100})
    deltas = diff_snapshots(current, None)
    assert len(deltas) == 1
    assert deltas[0].action == "new"
    assert deltas[0].from_period is None


def test_unchanged_hidden_by_default():
    prior = _snap("2024-03-31", {"AAA": 100})
    current = _snap("2024-06-30", {"AAA": 100})
    assert diff_snapshots(current, prior) == []
    assert diff_snapshots(current, prior, include_unchanged=True)[0].action == "unchanged"


def test_prior_quarter_end_within_a_year():
    assert prior_quarter_end("2026-06-30") == "2026-03-31"
    assert prior_quarter_end("2026-09-30") == "2026-06-30"
    assert prior_quarter_end("2026-12-31") == "2026-09-30"


def test_prior_quarter_end_crosses_a_year_boundary():
    assert prior_quarter_end("2026-03-31") == "2025-12-31"


def test_prior_quarter_end_rejects_non_quarter_end_dates():
    with pytest.raises(ValueError, match="not a 13F quarter-end"):
        prior_quarter_end("2026-06-15")
    with pytest.raises(ValueError, match="not a 13F quarter-end"):
        prior_quarter_end("2026-01-31")

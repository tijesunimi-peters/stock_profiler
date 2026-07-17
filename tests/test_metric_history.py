"""Tests for the Phase 1b metric-history engine + Tier-2 trend signals (no network).

Three flavors:
  * fixture-based series checks against the real (trimmed) AAPL/JPM companyfacts payloads
    (series shape, oldest->newest, latest point == single-value compute_metrics, R7 gaps);
  * synthetic MetricSeriesPoint lists that pin each signal's exact behavior (streak, CAGR,
    distance-from-peak, acceleration, expansion) and the honesty rules (gaps skipped, no
    interpolation, insufficient history -> nm/na);
  * a route test for GET /companies/{symbol}/metrics/{metric}/history.

See docs/ROADMAP_METRICS.md Phase 1b (R9: one as-restated basis, per-point R1, gaps not
interpolated; R10: each point carries its calendar period_end).
"""

from __future__ import annotations

import json
from pathlib import Path

from fastapi.testclient import TestClient

from secfin.config import settings
from secfin.normalize.metrics import (
    _sig_acceleration,
    _sig_cagr,
    _sig_distance_from_peak,
    _sig_expansion,
    _sig_streak,
    compute_metric_history,
    compute_metrics,
)
from secfin.normalize.schema import MetricSeriesPoint, RawFact
from secfin.sec.companyfacts import flatten_company_facts
from secfin.storage.sqlite_repository import SQLiteRawFactRepository

FIXTURES_DIR = Path(__file__).parent / "fixtures"
_BROWSER = {"Sec-Fetch-Site": "same-origin"}  # bypasses the anon IP limiter for a clean read


def _load(name: str, cik: int) -> list[RawFact]:
    return flatten_company_facts(json.loads((FIXTURES_DIR / name).read_text()), cik)


def _pt(value, status="ok", *, end="2020-03-31", fy=2020, fp="Q1") -> MetricSeriesPoint:
    return MetricSeriesPoint(
        fiscal_year=fy, fiscal_period=fp, period_end=end, value=value, status=status
    )


# --- fixture-based series -----------------------------------------------------------


def test_history_series_is_oldest_first_and_labeled_as_restated():
    facts = _load("aapl_companyfacts.json", 320193)
    hist = compute_metric_history(facts, 320193, "net_margin")

    assert hist.metric == "net_margin"
    assert hist.frequency == "quarterly"
    assert hist.restatement_basis == "as-restated"
    assert hist.points, "AAPL should have a quarterly net-margin series"
    ends = [p.period_end for p in hist.points]
    assert ends == sorted(ends), "series must be oldest -> newest by period_end"
    assert hist.signals, "a non-empty series should carry Tier-2 signals"


def test_latest_history_point_matches_single_value_compute_metrics():
    # Consistency: each history point is just compute_metrics at that anchor, so the last point
    # must equal the standalone computation for its (year, period).
    facts = _load("aapl_companyfacts.json", 320193)
    hist = compute_metric_history(facts, 320193, "net_margin")
    last = hist.points[-1]

    single = {
        m.metric: m
        for m in compute_metrics(facts, 320193, last.fiscal_year, last.fiscal_period).metrics
    }["net_margin"]
    assert last.value == single.value
    assert last.status == single.status


def test_annual_frequency_yields_only_fy_points():
    facts = _load("aapl_companyfacts.json", 320193)
    hist = compute_metric_history(facts, 320193, "net_margin", frequency="annual")
    assert hist.points
    assert all(p.fiscal_period == "FY" for p in hist.points)


def test_bank_current_ratio_history_has_na_gap_points():
    # R7: a bank has no current ratio -> na points with a reason, value None (a gap, not 0).
    facts = _load("jpm_companyfacts.json", 19617)
    hist = compute_metric_history(facts, 19617, "current_ratio")
    na_points = [p for p in hist.points if p.status == "na"]
    assert na_points, "JPM current ratio should be structurally N/A"
    assert all(p.value is None for p in na_points)
    assert all(p.reason for p in na_points)


def test_unknown_metric_key_raises():
    facts = _load("aapl_companyfacts.json", 320193)
    try:
        compute_metric_history(facts, 320193, "not_a_metric")
        raise AssertionError("expected KeyError for an unknown metric key")
    except KeyError:
        pass


# --- signal correctness (synthetic series) ------------------------------------------


def test_streak_counts_consecutive_rising_and_breaks_at_a_gap():
    pts = [
        _pt(1.0), _pt(2.0), _pt(None, "na"), _pt(3.0), _pt(4.0), _pt(5.0)
    ]  # the gap resets contiguity; trailing run is 3,4,5
    sig = _sig_streak(pts)
    assert sig.status == "ok"
    assert sig.value == 2.0  # 3->4 and 4->5 == two consecutive rising steps
    assert "rising" in sig.reason


def test_streak_needs_two_consecutive_points():
    assert _sig_streak([_pt(1.0), _pt(None, "na")]).status == "nm"


def test_cagr_computes_over_the_dated_span_and_is_nm_on_nonpositive_base():
    pts = [
        _pt(100.0, end="2020-12-31", fy=2020, fp="FY"),
        _pt(200.0, end="2024-12-31", fy=2024, fp="FY"),
    ]
    sig = _sig_cagr(pts, window=8)
    assert sig.status == "ok"
    # (200/100)^(1/~4.0y) - 1 ~= 0.189
    assert abs(sig.value - 0.1892) < 0.01

    neg = [_pt(-10.0, end="2020-12-31"), _pt(50.0, end="2024-12-31")]
    assert _sig_cagr(neg, window=8).status == "nm"


def test_distance_from_peak_is_zero_at_peak_and_negative_after_decline():
    at_peak = [_pt(1.0), _pt(2.0), _pt(3.0)]
    assert _sig_distance_from_peak(at_peak, window=8).value == 0.0

    declined = [_pt(1.0), _pt(4.0), _pt(3.0)]  # peak 4, last 3 -> (3-4)/4 = -0.25
    sig = _sig_distance_from_peak(declined, window=8)
    assert abs(sig.value - (-0.25)) < 1e-9
    assert "below" in sig.reason


def test_acceleration_sign_and_insufficient_history():
    accel = _sig_acceleration([_pt(1.0), _pt(2.0), _pt(4.0)], "ratio", 8)  # steps +1,+2 -> +1
    assert accel.status == "ok" and accel.value > 0 and "accelerating" in accel.reason
    assert _sig_acceleration([_pt(1.0), _pt(2.0)], "ratio", 8).status == "nm"


def test_expansion_direction_and_insufficient_history():
    exp = _sig_expansion([_pt(0.2), _pt(0.25), _pt(0.3)], "ratio", 8)
    assert exp.status == "ok" and exp.value > 0 and "expanding" in exp.reason
    assert _sig_expansion([_pt(0.2)], "ratio", 8).status == "nm"


def test_signals_ignore_gap_points_no_interpolation():
    # A gap between two equal values must not read as movement.
    pts = [_pt(0.3), _pt(None, "nm"), _pt(0.3)]
    exp = _sig_expansion(pts, "ratio", 8)
    assert exp.value == 0.0 and "flat" in exp.reason


# --- route ---------------------------------------------------------------------------


def test_history_route_returns_series_and_signals(tmp_path, monkeypatch):
    db = str(tmp_path / "test.db")
    monkeypatch.setattr(settings, "secfin_db_path", db)
    monkeypatch.setattr(settings, "sec_user_agent", "clearyfi-test test@example.com")
    repo = SQLiteRawFactRepository(db)
    repo.upsert_raw_facts(_load("aapl_companyfacts.json", 320193))
    repo.close()

    from secfin.api.main import app

    with TestClient(app) as client:
        resp = client.get(
            "/v1/companies/320193/metrics/net_margin/history", headers=_BROWSER
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body["metric"] == "net_margin"
        assert body["restatement_basis"] == "as-restated"
        assert body["points"]
        assert {s["key"] for s in body["signals"]} == {
            "expansion", "cagr", "acceleration", "streak", "distance_from_peak"
        }

        # Unknown metric -> 404 (not a data-empty 200).
        assert client.get(
            "/v1/companies/320193/metrics/bogus/history", headers=_BROWSER
        ).status_code == 404

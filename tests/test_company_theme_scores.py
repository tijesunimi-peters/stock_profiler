"""Tests for per-company theme percentiles (normalize/themes.company_theme_scores). No network.

The prototype's panel showed all SEVEN themes with a percentile, including the two this project
has explicitly ruled unscorable. These protect two things: that a lower-is-better metric is
oriented before it is averaged, and that an unscorable theme stays unscored.
"""

from __future__ import annotations

from secfin.normalize.themes import DEFERRED_THEMES, THEMES, company_theme_scores


def _by_key(rows):
    return {r.key: r for r in rows}


def test_a_lower_is_better_metric_is_oriented_before_averaging():
    """debt_to_equity at the 99th percentile is the MOST levered filer in its group. Averaged
    raw it would pull 'financial health' up; oriented it pulls it down, which is the point."""
    rows = _by_key(company_theme_scores({"debt_to_equity": 99.0, "current_ratio": 20.0}))
    fh = rows["financial_health"]
    assert fh.scored
    # (100-99 + 20) / 2 = 10.5, NOT (99+20)/2 = 59.5
    assert fh.percentile == 10.5


def test_a_higher_is_better_metric_passes_through_unchanged():
    rows = _by_key(company_theme_scores({"net_margin": 90.0, "roa": 80.0}))
    assert rows["profitability"].percentile == 85.0


def test_coverage_is_reported_and_the_theme_is_not_rescaled():
    """Ranked on 2 of 6 means a percentile over those 2 — never the missing four imputed as
    average, which would drag every sparse theme toward 50."""
    rows = _by_key(company_theme_scores({"net_margin": 100.0, "roa": 100.0}))
    prof = rows["profitability"]
    assert prof.percentile == 100.0
    assert (prof.covered, prof.total) == (2, 6)


def test_a_theme_below_the_coverage_floor_is_unscored_with_a_reason():
    rows = _by_key(company_theme_scores({"net_margin": 90.0}))
    prof = rows["profitability"]
    assert prof.scored is False
    assert prof.percentile is None
    assert "at least 2" in (prof.reason or "")


def test_the_two_deferred_themes_are_returned_unscored_never_fabricated():
    """The prototype gave accounting quality P82 and structure P70 from a seed. Neither can be
    scored: the signals are Track-2 / not ingested, which is what DEFERRED_THEMES records."""
    rows = _by_key(company_theme_scores({m: 50.0 for m in THEMES["profitability"][1]}))
    for key in DEFERRED_THEMES:
        assert rows[key].scored is False
        assert rows[key].percentile is None
        assert rows[key].reason


def test_every_theme_is_returned_so_a_caller_cannot_omit_the_unanswerable_ones():
    rows = company_theme_scores({})
    assert {r.key for r in rows} == set(THEMES) | set(DEFERRED_THEMES)
    assert all(r.scored is False for r in rows)


def test_components_carry_the_oriented_values_the_percentile_was_built_from():
    rows = _by_key(company_theme_scores({"debt_to_equity": 99.0, "current_ratio": 20.0}))
    comps = dict(rows["financial_health"].components)
    assert comps["debt_to_equity"] == 1.0
    assert comps["current_ratio"] == 20.0


def test_no_constituent_lacks_a_favorability_direction():
    """`higher_is_better` raises for an undeclared metric BY DESIGN. If a theme ever gains a
    constituent with no direction, this fails here rather than orienting it silently wrong."""
    from secfin.normalize.metrics import METRIC_DIRECTION

    for _label, metrics in THEMES.values():
        for m in metrics:
            assert m in METRIC_DIRECTION, m

"""Pure unit tests for normalize/register.py -- no DB, no network, no clock.

The honesty properties are tested as hard as the arithmetic: a missing input must come back
`status="na"` WITH a reason, never as a zero, and the caveat strings that make a derived
register statistic readable must be present (a test that would still pass with the caveat
deleted is not a test).
"""

from __future__ import annotations

import pytest

from secfin.normalize.register import (
    STABLE_CAPITAL_WEIGHTS,
    concentration,
    domicile,
    retention,
    share_vector,
    stable_capital_share,
    tenure,
    turnover,
)
from secfin.normalize.schema import IssuerHolder


def _h(cik: int, shares: float | None, *, name: str | None = None, **kw) -> IssuerHolder:
    return IssuerHolder(
        manager_cik=cik,
        manager_name=name or f"MANAGER {cik}",
        cusip="037833100",
        issuer_name="Apple Inc.",
        shares=shares,
        value=(shares or 0) * 190.0,
        **kw,
    )


# --- share_vector -------------------------------------------------------------------


def test_share_vector_ranks_and_accumulates():
    v = share_vector([_h(1, 100.0), _h(2, 300.0), _h(3, 600.0)])
    assert [r.manager_cik for r in v.rows] == [3, 2, 1]  # ranked desc
    assert v.total_shares == 1000.0
    assert v.holder_count == 3
    assert [round(r.weight, 3) for r in v.rows] == [0.6, 0.3, 0.1]
    assert round(v.rows[-1].cumulative, 6) == 1.0  # exactly 100%, no float drift


def test_share_vector_sums_a_managers_share_classes():
    """One manager holding two CUSIPs is ONE holder of the company (unlike flows.diff_holders,
    which keeps share classes apart -- see the module docstring)."""
    a = _h(1, 100.0)
    b = _h(1, 400.0)
    b.cusip = "037833200"  # a second class
    v = share_vector([a, b])
    assert v.holder_count == 1
    assert v.rows[0].shares == 500.0


def test_share_vector_excludes_unusable_rows_without_zeroing_them():
    """No share count, an option row and a PRN row are OUT OF POPULATION -- not zeros."""
    rows = [
        _h(1, 500.0),
        _h(2, None),  # never reported a share count
        _h(3, 100.0, put_call="Put"),  # notional, not ownership
        _h(4, 100.0, shares_or_principal="PRN"),  # debt principal
    ]
    v = share_vector(rows)
    assert v.holder_count == 1
    assert v.excluded_count == 3
    assert v.total_shares == 500.0  # the excluded rows contributed nothing, as zeros would --
    assert [r.manager_cik for r in v.rows] == [1]  # but they are absent, not present-at-zero


def test_share_vector_empty():
    v = share_vector([])
    assert v.rows == [] and v.holder_count == 0 and v.total_shares == 0.0


# --- concentration ------------------------------------------------------------------


def test_concentration_na_with_reason_for_single_holder():
    """An HHI over one holder is 10,000 -- arithmetically true, analytically worthless."""
    c = concentration(share_vector([_h(1, 100.0)]))
    assert c.status == "na"
    assert c.reason and "coverage" in c.reason
    assert c.hhi is None and c.effective_holders is None  # NOT 10_000, NOT 0


def test_concentration_na_when_no_holder_reports_shares():
    c = concentration(share_vector([_h(1, None), _h(2, None)]))
    assert c.status == "na" and c.reason
    assert c.hhi is None


def test_concentration_all_equal_gives_zero_gini():
    c = concentration(share_vector([_h(i, 100.0) for i in range(1, 5)]))
    assert c.status == "ok"
    assert round(c.gini, 6) == 0.0  # perfectly even register
    assert round(c.hhi, 1) == 2500.0  # 4 x 25^2
    assert round(c.effective_holders, 6) == 4.0  # 10,000 / 2,500
    assert c.managers_for_half == 2  # two of four equal holders reach 50%


def test_concentration_one_dominant_holder():
    c = concentration(share_vector([_h(1, 970.0), _h(2, 10.0), _h(3, 10.0), _h(4, 10.0)]))
    assert c.status == "ok"
    assert c.hhi > 9000  # near-total concentration
    assert c.effective_holders < 1.2
    assert c.gini > 0.7
    assert c.managers_for_half == 1
    assert round(c.top1_share, 3) == 0.97


def test_concentration_managers_for_half_boundary():
    """Exactly-50% must count as reaching half (>=, not >)."""
    c = concentration(share_vector([_h(1, 50.0), _h(2, 50.0)]))
    assert c.managers_for_half == 1


def test_concentration_top_n_saturates_below_n_holders():
    c = concentration(share_vector([_h(1, 60.0), _h(2, 40.0)]))
    assert round(c.top5_share, 6) == 1.0  # only 2 holders -> top-5 IS the whole register
    assert round(c.top10_share, 6) == 1.0


def test_concentration_carries_its_caveats():
    c = concentration(share_vector([_h(1, 60.0), _h(2, 40.0)]))
    assert "long-only" in c.cannot and "$100M" in c.cannot
    assert "ingested" in c.population
    assert "HHI" in c.formula


# --- turnover -----------------------------------------------------------------------


def test_turnover_na_without_a_prior_quarter():
    t = turnover([_h(1, 100.0)], None, to_period="2026-03-31", from_period=None)
    assert t.status == "na"
    assert t.reason and "no prior ingested quarter" in t.reason
    assert t.turnover_pct is None  # not 0.0


def test_turnover_counts_entrants_exits_retained():
    prior = [_h(1, 100.0), _h(2, 100.0)]
    current = [_h(2, 100.0), _h(3, 100.0)]
    t = turnover(current, prior, to_period="2026-03-31", from_period="2025-12-31")
    assert t.status == "ok"
    assert (t.entrants, t.exits, t.retained) == (1, 1, 1)
    assert t.prior_holder_count == 2
    assert t.turnover_pct == 100.0  # (1 + 1) / 2


def test_turnover_caveat_explains_that_an_exit_is_not_a_sale():
    t = turnover([_h(1, 1.0)], [_h(1, 1.0)], to_period="2026-03-31", from_period="2025-12-31")
    assert "$100M" in t.cannot and "not evidence that the position was sold" in t.cannot


# --- tenure -------------------------------------------------------------------------


def _by_period(*quarters: tuple[str, list[int]]) -> dict[str, list[IssuerHolder]]:
    """(period, [manager ciks]) -> the by_period map tenure() consumes."""
    return {p: [_h(c, 100.0) for c in ciks] for p, ciks in quarters}


def test_tenure_streak_counts_back_from_newest_and_breaks_on_a_gap():
    bp = _by_period(
        ("2026-03-31", [1, 2]),
        ("2025-12-31", [1, 2]),
        ("2025-09-30", [1]),  # 2 is absent here -> its streak stops at 2
        ("2025-06-30", [1, 2]),
    )
    p = tenure(bp)
    assert p.status == "ok"
    assert p.quarters_by_manager == {1: 4, 2: 2}
    assert p.newest_period == "2026-03-31"


def test_tenure_ignores_a_manager_absent_from_the_newest_quarter():
    bp = _by_period(("2026-03-31", [1]), ("2025-12-31", [1, 2]))
    p = tenure(bp)
    assert 2 not in p.quarters_by_manager  # not in today's register -> has no tenure in it


def test_tenure_median_of_even_count():
    bp = _by_period(("2026-03-31", [1, 2]), ("2025-12-31", [1]))
    p = tenure(bp)  # streaks: {1: 2, 2: 1}
    assert p.median_quarters_held == 1.5


def test_tenure_empty_is_na_with_reason():
    p = tenure({})
    assert p.status == "na" and p.reason
    assert p.median_quarters_held is None


def test_tenure_flags_that_few_ingested_quarters_cap_it():
    p = tenure(_by_period(("2026-03-31", [1]), ("2025-12-31", [1])))
    assert p.status == "ok"
    assert p.reason and "capped by the 2 ingested quarter" in p.reason
    assert "floor, not a history" in p.cannot


def test_tenure_no_reason_when_eight_quarters_available():
    quarters = [
        "2026-03-31", "2025-12-31", "2025-09-30", "2025-06-30",
        "2025-03-31", "2024-12-31", "2024-09-30", "2024-06-30",
    ]
    p = tenure(_by_period(*[(q, [1]) for q in quarters]))
    assert p.quarters_by_manager == {1: 8}
    assert p.reason is None  # nothing to warn about at full depth


# --- the cohort boundaries: 2, 3, 4, 7, 8 quarters ----------------------------------
#
# The architecture named this off-by-one as the likeliest silent bug, so every boundary gets
# its own assertion rather than one "it works" case.


def _cohort(p, label):
    return next(c for c in p.cohorts if c.label == label)


def test_tenure_cohort_boundaries_are_exact():
    quarters = [
        "2026-03-31", "2025-12-31", "2025-09-30", "2025-06-30",
        "2025-03-31", "2024-12-31", "2024-09-30", "2024-06-30",
    ]
    # Manager N is present in the newest N quarters -> a streak of exactly N.
    bp = {q: [] for q in quarters}
    for run in range(1, 9):
        for q in quarters[:run]:
            bp[q].append(_h(run, 100.0))
    p = tenure(bp)
    assert p.quarters_by_manager == {n: n for n in range(1, 9)}

    assert _cohort(p, "1 quarter").holder_count == 1  # exactly run==1
    assert _cohort(p, "2-3 quarters").holder_count == 2  # runs 2, 3
    assert _cohort(p, "4-7 quarters").holder_count == 4  # runs 4, 5, 6, 7
    assert _cohort(p, "8+ quarters").holder_count == 1  # run 8
    # Every manager lands in exactly one cohort -- no double-count, no one dropped.
    assert sum(c.holder_count for c in p.cohorts) == 8


# --- stable_capital_share -----------------------------------------------------------


def test_stable_capital_weights_are_exposed_not_hidden():
    s = stable_capital_share(_by_period(("2026-03-31", [1])))
    assert s.weights == STABLE_CAPITAL_WEIGHTS == [(8, 1.0), (4, 0.5), (2, 0.25)]
    assert "8+ quarters 1.0" in s.formula


def test_stable_capital_single_quarter_holder_contributes_nothing():
    s = stable_capital_share(_by_period(("2026-03-31", [1])))
    assert s.status == "ok"
    assert s.stable_share == 0.0  # a 1-quarter holder is not stable capital
    assert s.reason and "floor" in s.reason


def test_stable_capital_applies_each_weight_band():
    quarters = [
        "2026-03-31", "2025-12-31", "2025-09-30", "2025-06-30",
        "2025-03-31", "2024-12-31", "2024-09-30", "2024-06-30",
    ]
    bp = {q: [] for q in quarters}
    # Three equal-weight managers with streaks 8, 4 and 2 -> 1.0, 0.5 and 0.25.
    for cik, run in ((8, 8), (4, 4), (2, 2)):
        for q in quarters[:run]:
            bp[q].append(_h(cik, 100.0))
    s = stable_capital_share(bp)
    assert s.status == "ok"
    # All three hold 100 shares in the newest quarter -> weight 1/3 each.
    assert round(s.stable_share, 6) == round((1.0 + 0.5 + 0.25) / 3, 6)
    assert s.reason is None  # 8 quarters available -> the top weight IS reachable


def test_stable_capital_na_when_no_register():
    s = stable_capital_share({})
    assert s.status == "na"
    assert s.stable_share is None  # not 0.0
    assert "understates" in s.cannot


# --- Lorenz curve (V3-P5a section 03) -----------------------------------------------


class TestLorenz:
    def test_it_is_a_fixed_length_curve_whatever_the_register_size(self):
        """The payload must not grow with the register -- a real issuer has thousands of filers."""
        small = concentration(share_vector([_h(1, 10.0), _h(2, 90.0)])).lorenz
        larger = concentration(share_vector([_h(i, float(i)) for i in range(1, 40)])).lorenz
        assert small is not None and larger is not None
        assert len(small) == len(larger) == 101

    def test_it_runs_from_zero_to_the_whole_register(self):
        curve = concentration(share_vector([_h(i, float(i)) for i in range(1, 21)])).lorenz
        assert curve[0] == 0.0
        assert curve[-1] == 1.0

    def test_it_is_monotonically_non_decreasing(self):
        """A cumulative share that dips would mean a manager held negative shares."""
        curve = concentration(share_vector([_h(i, float(i * i)) for i in range(1, 26)])).lorenz
        assert all(b >= a for a, b in zip(curve, curve[1:]))

    def test_a_perfectly_equal_register_is_the_diagonal(self):
        curve = concentration(share_vector([_h(i, 100.0) for i in range(1, 101)])).lorenz
        # 100 equal holders: the smallest 25% hold 25% of the register.
        assert curve[25] == pytest.approx(0.25)
        assert curve[50] == pytest.approx(0.5)

    def test_it_bows_below_the_diagonal_when_the_register_is_concentrated(self):
        """The whole point of the curve: the gap from the diagonal IS the concentration."""
        holders = [_h(1, 9000.0)] + [_h(i, 10.0) for i in range(2, 101)]
        curve = concentration(share_vector(holders)).lorenz
        assert curve[50] < 0.5
        assert curve[90] < 0.9

    def test_it_agrees_with_gini_about_which_register_is_more_concentrated(self):
        """Curve and coefficient come from the same weights, so they can never disagree."""
        flat = concentration(share_vector([_h(i, 100.0) for i in range(1, 51)]))
        skewed = concentration(
            share_vector([_h(1, 4000.0)] + [_h(i, 10.0) for i in range(2, 51)])
        )
        assert skewed.gini > flat.gini
        assert skewed.lorenz[50] < flat.lorenz[50]

    def test_na_carries_no_curve_rather_than_a_flat_line(self):
        """A flat line at zero would render as a real, maximally-unequal register."""
        assert concentration(share_vector([_h(1, 100.0)])).lorenz is None


# --- domicile (V3-P5a section 03) ---------------------------------------------------


class TestDomicile:
    def test_us_filers_rank_by_state_and_foreign_filers_by_country(self):
        result = domicile(
            [
                _h(1, 600.0, location="PA"),
                _h(2, 300.0, location="NY"),
                _h(3, 100.0, location="V8"),  # Switzerland, per EDGAR's own table
            ]
        )
        assert result.status == "ok"
        assert [r.place for r in result.rows] == [
            "United States · Pennsylvania",
            "United States · New York",
            "Switzerland",
        ]
        assert [r.country for r in result.rows] == ["United States", "United States", "Switzerland"]

    def test_it_weights_by_shares_not_by_filer_count(self):
        """Fifty small managers in one state are not a bigger presence than one large one."""
        result = domicile(
            [_h(1, 900.0, location="PA")]
            + [_h(i, 10.0, location="NY") for i in range(2, 12)]
        )
        assert result.rows[0].place == "United States · Pennsylvania"
        assert result.rows[0].holder_count == 1
        assert result.rows[1].holder_count == 10
        assert result.rows[0].weight == 0.9

    def test_canadian_provinces_roll_up_into_one_country(self):
        result = domicile([_h(1, 50.0, location="A6"), _h(2, 50.0, location="A8")])
        assert [r.place for r in result.rows] == ["Canada"]
        assert result.rows[0].holder_count == 2

    def test_a_manager_holding_several_classes_is_counted_once(self):
        result = domicile(
            [
                _h(1, 300.0, location="PA"),
                _h(1, 300.0, location="PA"),  # same manager, second share class
                _h(2, 400.0, location="NY"),
            ]
        )
        assert result.rows[0].holder_count == 1
        assert result.rows[0].shares == 600.0

    def test_unlocated_filers_are_a_coverage_gap_never_a_rest_of_world_row(self):
        result = domicile([_h(1, 500.0, location="PA"), _h(2, 500.0)])
        assert [r.place for r in result.rows] == ["United States · Pennsylvania"]
        # 100% of what we could place ...
        assert result.rows[0].weight == 1.0
        # ... and `coverage` is what stops that reading as 100% of the register.
        assert result.coverage == 0.5
        assert result.unlocated_holder_count == 1
        assert result.unlocated_shares == 500.0

    def test_edgars_own_unknown_code_is_not_a_place(self):
        result = domicile([_h(1, 500.0, location="PA"), _h(2, 500.0, location="XX")])
        assert [r.place for r in result.rows] == ["United States · Pennsylvania"]
        assert result.unlocated_holder_count == 1

    def test_no_location_anywhere_is_na_with_a_reason(self):
        result = domicile([_h(1, 500.0), _h(2, 500.0)])
        assert result.status == "na"
        assert result.rows == []
        assert "location_backfill" in (result.reason or "")
        assert "missing coverage" in (result.reason or "")

    def test_the_prior_quarter_supplies_the_tick(self):
        result = domicile(
            [_h(1, 600.0, location="PA"), _h(2, 400.0, location="NY")],
            [_h(1, 500.0, location="PA"), _h(2, 500.0, location="NY")],
        )
        assert result.rows[0].prior_weight == 0.5
        assert result.rows[0].weight == 0.6

    def test_a_place_absent_last_quarter_has_no_prior_not_a_zero(self):
        """A zero tick would draw at the axis, reading as 'it collapsed' rather than 'it is new'."""
        result = domicile(
            [_h(1, 600.0, location="PA"), _h(2, 400.0, location="NY")],
            [_h(1, 500.0, location="PA")],
        )
        by_place = {r.place: r for r in result.rows}
        assert by_place["United States · New York"].prior_weight is None
        assert by_place["United States · Pennsylvania"].prior_weight == 1.0

    def test_the_business_address_caveat_travels_with_the_ranking(self):
        cannot = domicile([_h(1, 100.0, location="PA")]).cannot
        assert "BUSINESS ADDRESS" in cannot
        assert "not where its capital originates" in cannot


# --- retention (V3-P5a section 05) ---------------------------------------------------


class TestRetention:
    def _periods(self, spec: dict[str, list[int]]) -> dict[str, list]:
        """quarter -> [manager cik] as holders, all with a usable share count."""
        return {p: [_h(c, 100.0) for c in ciks] for p, ciks in spec.items()}

    def test_cohorts_are_managers_first_observed_in_that_quarter(self):
        r = retention(self._periods({
            "2025-03-31": [1, 2],
            "2025-06-30": [1, 2, 3],
            "2025-09-30": [1, 3, 4],
        }))
        assert r.status == "ok"
        assert [c.period for c in r.cohorts] == ["2025-03-31", "2025-06-30", "2025-09-30"]
        assert [c.holder_count for c in r.cohorts] == [2, 1, 1]  # {1,2}, {3}, {4}

    def test_survival_is_triangular_and_starts_at_one(self):
        r = retention(self._periods({
            "2025-03-31": [1, 2],
            "2025-06-30": [1, 2, 3],
            "2025-09-30": [1, 3, 4],
        }))
        assert [len(c.survival) for c in r.cohorts] == [3, 2, 1]
        assert all(c.survival[0] == 1.0 for c in r.cohorts if c.holder_count)

    def test_survival_follows_the_cohort_forward(self):
        """Manager 2 leaves after the second quarter, so the first cohort halves."""
        r = retention(self._periods({
            "2025-03-31": [1, 2],
            "2025-06-30": [1, 2],
            "2025-09-30": [1],
        }))
        assert r.cohorts[0].survival == [1.0, 1.0, 0.5]

    def test_a_manager_that_returns_is_not_a_new_cohort(self):
        """Re-appearing is not entering -- a gap can be OUR coverage, not a sale and repurchase."""
        r = retention(self._periods({
            "2025-03-31": [1],
            "2025-06-30": [],
            "2025-09-30": [1],
        }))
        assert [c.holder_count for c in r.cohorts] == [1, 0, 0]
        assert r.cohorts[0].survival == [1.0, 0.0, 1.0]

    def test_the_oldest_cohort_is_flagged_left_censored(self):
        """Everyone already holding lands in it, however long they had actually held."""
        r = retention(self._periods({"2025-03-31": [1, 2], "2025-06-30": [1, 2]}))
        assert r.cohorts[0].left_censored is True
        assert all(c.left_censored is False for c in r.cohorts[1:])

    def test_a_quarter_with_no_new_manager_is_an_empty_cohort_not_a_dropped_row(self):
        r = retention(self._periods({"2025-03-31": [1], "2025-06-30": [1]}))
        assert len(r.cohorts) == 2
        assert r.cohorts[1].holder_count == 0
        assert r.cohorts[1].survival == []

    def test_one_quarter_is_na_with_a_reason(self):
        r = retention(self._periods({"2025-03-31": [1, 2]}))
        assert r.status == "na"
        assert r.cohorts == []
        assert "at least two quarters" in (r.reason or "")

    def test_it_answers_a_different_question_from_tenure(self):
        """tenure counts CURRENT holders backwards; retention follows cohorts forwards."""
        by_period = self._periods({
            "2025-03-31": [1, 2, 3],
            "2025-06-30": [1],
            "2025-09-30": [1],
        })
        assert tenure(by_period).cohorts  # current holders, streaks from newest
        r = retention(by_period)
        # Two of the three original managers are gone, which tenure's newest-quarter view cannot
        # see at all -- it only knows about manager 1.
        assert r.cohorts[0].survival == [1.0, 1 / 3, 1 / 3]

    def test_the_exit_caveat_travels_with_the_numbers(self):
        r = retention(self._periods({"2025-03-31": [1], "2025-06-30": [1]}))
        assert "$100M" in r.cannot
        assert "left-censored" in r.cannot
        assert "floor" in r.cannot

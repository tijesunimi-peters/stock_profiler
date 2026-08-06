"""Tests for §04's class structure -- `build_share_classes`.

The load-bearing one is `test_share_counts_never_imply_control`: Alphabet's Class B is 6.9% of
shares and carries ten votes each, so the founders control the company on a small minority of the
stock. A card showing share counts without saying the voting ratio is unknowable invites exactly
the wrong inference, and that is the whole reason this card was `X` for so long.
"""

from __future__ import annotations

from dataclasses import fields

from secfin.normalize.share_classes import ShareClass, build_share_classes
from secfin.storage.dimensional_repository import DimensionalFact

CIK = 1652044


def _f(member, tag, value, *, fy=2025, ddate="20251231"):
    return DimensionalFact(
        cik=CIK, accession="a-1", axis="ClassOfStock", member=member, tag=tag, ddate=ddate,
        qtrs="0", value=value, unit="shares", fiscal_year=fy, form="10-K",
    )


class TestClassRows:
    def test_alphabets_three_classes(self):
        result = build_share_classes(
            CIK,
            [
                _f("CommonClassA", "CommonStockSharesOutstanding", 5.82e9),
                _f("CommonClassB", "CommonStockSharesOutstanding", 0.84e9),
                _f("CapitalClassC", "CommonStockSharesOutstanding", 5.43e9),
            ],
        )
        assert [c.label for c in result.classes] == [
            "Common Class A",
            "Capital Class C",
            "Common Class B",
        ]
        # 48.1 not the live API's 48.2: these fixture counts are rounded to two decimals, so the
        # ratio differs in the first decimal. The rule under test is the ordering and the share
        # being of OUTSTANDING shares, not the exact figure.
        assert round(result.classes[0].outstanding_share * 100, 1) == 48.1

    def test_authorised_and_outstanding_are_never_mixed(self):
        # The gap between them is issuance headroom -- a real fact about dilution capacity, and a
        # different measure from shares in issue.
        result = build_share_classes(
            CIK,
            [
                _f("CommonClassA", "CommonStockSharesOutstanding", 2.19e9),
                _f("CommonClassA", "CommonStockSharesAuthorized", 5.0e9),
            ],
        )
        (row,) = result.classes
        assert row.shares_outstanding == 2.19e9
        assert row.shares_authorized == 5.0e9
        # The share is of OUTSTANDING, never of authorised.
        assert row.outstanding_share == 1.0

    def test_preferred_series_are_shown_as_the_filer_tagged_them(self):
        # A filer tagging SeriesAPreferredStock has told us its structure has one; dropping it
        # would understate the capital structure.
        result = build_share_classes(
            CIK,
            [
                _f("CommonClassA", "CommonStockSharesOutstanding", 100.0),
                _f("SeriesAPreferredStock", "CommonStockSharesOutstanding", 5.0),
            ],
        )
        assert "Series A Preferred Stock" in [c.label for c in result.classes]

    def test_the_newest_instant_within_the_year_wins(self):
        # A filing tags the balance at this year end and the last; the current one is the newer.
        result = build_share_classes(
            CIK,
            [
                _f("CommonClassA", "CommonStockSharesOutstanding", 900.0, ddate="20241231"),
                _f("CommonClassA", "CommonStockSharesOutstanding", 1000.0, ddate="20251231"),
            ],
        )
        assert result.classes[0].shares_outstanding == 1000.0

    def test_only_the_newest_fiscal_year_is_shaped(self):
        result = build_share_classes(
            CIK,
            [
                _f("CommonClassA", "CommonStockSharesOutstanding", 1.0, fy=2024),
                _f("CommonClassB", "CommonStockSharesOutstanding", 2.0, fy=2025),
            ],
        )
        assert [c.label for c in result.classes] == ["Common Class B"]
        assert result.fiscal_year == 2025


class TestWhatItRefusesToSay:
    def test_share_counts_never_imply_control(self):
        """There is no votes-per-share field, and there must not be one.

        Alphabet's Class B is 6.9% of shares at ten votes each. Any field a caller could read as
        voting power would be inferred from counts, and inferring it is exactly wrong.
        """
        names = {f.name for f in fields(ShareClass)}
        for forbidden in ("votes", "votes_per_share", "voting_power", "control"):
            assert forbidden not in names
        # `outstanding_share` is a share of SHARES, and its docstring says so.
        assert "outstanding_share" in names

    def test_a_single_class_registrant_is_na_with_a_reason(self):
        result = build_share_classes(320193, [])
        assert result.status == "na"
        assert "single-class registrant" in (result.reason or "")
        assert "may not be published yet" in (result.reason or "")

    def test_facts_from_another_axis_are_ignored(self):
        other = DimensionalFact(
            cik=CIK, accession="a", axis="BusinessSegments", member="X",
            tag="CommonStockSharesOutstanding", ddate="20251231", qtrs="0",
            value=5.0, unit="shares", fiscal_year=2025, form="10-K",
        )
        assert build_share_classes(CIK, [other]).status == "na"

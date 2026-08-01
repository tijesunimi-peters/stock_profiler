"""Pure unit tests for normalize/attribution.py -- no DB, no network, no clock.

The operator's ruling (2026-08-01) is what these lock down: three REPORTED rows, no residual,
no total. The tests are written so that re-adding either one fails here rather than in review.
"""

from __future__ import annotations

from secfin.normalize.attribution import share_attribution
from secfin.normalize.schema import BeneficialOwnership, InsiderTransaction


def _insider(owner: str, after: float, date: str, *, derivative: bool | None = False, **kw):
    return InsiderTransaction(
        issuer_cik=320193,
        owner_name=owner,
        transaction_date=date,
        security_title=kw.pop("security_title", "Common Stock"),
        shares_owned_after=after,
        ownership_type=kw.pop("ownership_type", "direct"),
        form_type="4",
        filed=date,
        is_derivative=derivative,
        **kw,
    )


def _beneficial(owner: str, shares: float, filed: str, form: str = "SCHEDULE 13G"):
    return BeneficialOwnership(
        issuer_cik=320193,
        owner_name=owner,
        form_type=form,
        shares_beneficially_owned=shares,
        filed=filed,
    )


def _attr(**kw):
    base = dict(
        institutional_shares=200.0,
        institutional_holder_count=4,
        institutional_as_of="2026-03-31",
        insider_rows=[],
        beneficial_rows=[],
        shares_outstanding=1000.0,
        shares_outstanding_as_of="2026-03-28",
        shares_outstanding_tag="CommonStockSharesOutstanding",
    )
    base.update(kw)
    return share_attribution(**base)


class TestTheOperatorsRuling:
    def test_there_are_exactly_three_rows_and_none_is_a_residual(self):
        result = _attr()
        assert [r.key for r in result.rows] == ["institutional", "insider", "beneficial"]
        assert not any("residual" in r.key or "residual" in r.label.lower() for r in result.rows)

    def test_the_rows_are_declared_non_additive(self):
        """No total is returned, and the flag says why -- a caller must not stack these."""
        assert _attr().rows_are_additive is False

    def test_no_total_field_exists_to_be_rendered(self):
        assert not hasattr(_attr(), "total_shares")
        assert not hasattr(_attr(), "total_share_of_outstanding")

    def test_the_double_counting_caveat_is_explicit(self):
        cannot = _attr().cannot
        assert "do NOT add up" in cannot
        assert "13D/G" in cannot and "insider" in cannot
        # The reason the residual is gone must survive in the text, not only in a commit message.
        assert "remainder" in cannot


class TestRows:
    def test_percentages_are_against_shares_outstanding(self):
        result = _attr()
        assert result.rows[0].share_of_outstanding == 0.2
        assert result.shares_outstanding_tag == "CommonStockSharesOutstanding"

    def test_each_row_carries_its_own_as_of_date(self):
        result = _attr(
            insider_rows=[_insider("A", 50.0, "2026-05-02")],
            beneficial_rows=[_beneficial("B", 100.0, "2026-01-09")],
        )
        assert [r.as_of for r in result.rows] == ["2026-03-31", "2026-05-02", "2026-01-09"]

    def test_only_the_newest_row_per_holder_counts(self):
        """A position is a state, not an event -- stacking filings multiplies one holding."""
        result = _attr(
            insider_rows=[
                _insider("A", 10.0, "2026-01-01"),
                _insider("A", 40.0, "2026-05-01"),
            ]
        )
        assert result.rows[1].shares == 40.0
        assert result.rows[1].holder_count == 1

    def test_direct_and_indirect_holdings_are_separate_positions(self):
        result = _attr(
            insider_rows=[
                _insider("A", 30.0, "2026-05-01", ownership_type="direct"),
                _insider("A", 20.0, "2026-05-01", ownership_type="indirect"),
            ]
        )
        assert result.rows[1].shares == 50.0

    def test_an_amendment_supersedes_rather_than_adds(self):
        result = _attr(
            beneficial_rows=[
                _beneficial("B", 300.0, "2025-02-01", "SCHEDULE 13G"),
                _beneficial("B", 250.0, "2026-02-01", "SCHEDULE 13G/A"),
            ]
        )
        assert result.rows[2].shares == 250.0


class TestDerivativeExclusion:
    def test_option_rows_are_excluded_from_insider_ownership(self):
        result = _attr(
            insider_rows=[
                _insider("A", 40.0, "2026-05-01"),
                _insider(
                    "A", 900.0, "2026-05-01",
                    derivative=True,
                    security_title="Employee Stock Option (Right to Buy)",
                ),
            ]
        )
        assert result.rows[1].shares == 40.0, "an option's underlying is not owned stock"

    def test_unknown_kind_is_excluded_and_the_gap_is_reported(self):
        """A row cached before the flag existed is UNKNOWN -- counting it would readmit options."""
        result = _attr(
            insider_rows=[
                _insider("A", 40.0, "2026-05-01"),
                _insider("B", 999.0, "2026-05-01", derivative=None),
            ]
        )
        assert result.rows[1].shares == 40.0
        assert "predate the derivative flag" in (result.rows[1].reason or "")
        assert "floor" in (result.rows[1].reason or "")

    def test_all_unknown_gives_na_with_a_reason_not_a_zero(self):
        result = _attr(insider_rows=[_insider("A", 999.0, "2026-05-01", derivative=None)])
        assert result.rows[1].shares is None
        assert result.rows[1].share_of_outstanding is None
        assert "cannot tell owned stock from options" in (result.rows[1].reason or "")


class TestHonesty:
    def test_a_family_that_filed_nothing_is_none_with_a_reason(self):
        result = _attr()
        insider, beneficial = result.rows[1], result.rows[2]
        assert insider.shares is None and beneficial.shares is None
        assert "no ingested Form 3/4/5" in (insider.reason or "")
        assert "structured-XML floor" in (beneficial.reason or "")

    def test_no_denominator_keeps_the_share_counts_but_drops_the_percentages(self):
        result = _attr(shares_outstanding=None)
        assert result.status == "ok"
        assert result.rows[0].shares == 200.0
        assert result.rows[0].share_of_outstanding is None
        assert "cannot be computed" in (result.reason or "")

    def test_nothing_ingested_at_all_is_na_not_three_zeros(self):
        result = _attr(institutional_shares=None, institutional_holder_count=None)
        assert result.status == "na"
        assert all(r.shares is None for r in result.rows)
        assert "missing coverage" in (result.reason or "")

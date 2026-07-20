"""Tests for the balance-sheet visualization derivations (normalize/viz).

The honesty invariants under test:
  * Balance Matrix: leaf-line segments only (subtotals feed the reported total + residual,
    never a segment -- no double-count); contra concepts EXCLUDED (no double-subtract);
    the gap to a reported total is ONE labeled "Other / unmapped" residual; the two
    independently reported totals (total_assets vs liabilities_and_equity) are reconciled
    via reconciliation_delta/balanced and NEVER rescaled to force a match; a missing
    required total -> explicit unavailable state -- AC-11/12/13.
  * Working-Capital bridge: NWC = CA - CL (signed); a missing reported current total ->
    unavailable (never summed from components); a null component stays null, never 0 --
    AC-8/9/10.
  * Capital-Structure series: two-way Liabilities/Equity summing to the financing total;
    a negative-equity period's percentages are UNCLAMPED; a period missing a required
    total is an explicit gap; FY selection + oldest->newest ordering -- AC-4/5/6.

Fixtures build a Statement directly (the helpers' input contract); values mirror a real
AAPL-shaped FY balance sheet so the reconciliation is realistic.
"""

from __future__ import annotations

from secfin.normalize.schema import Statement, StatementLine
from secfin.normalize.viz import (
    _BALANCE_RESIDUAL_LABEL,
    balance_viz,
    capital_structure_series,
)


def _line(concept: str, value: float | None, *, tag: str = "", ext: bool = False) -> StatementLine:
    return StatementLine(
        canonical_concept=concept,
        label=concept.replace("_", " ").title(),
        value=value,
        unit="USD",
        source_tag=tag or concept,
        is_extension=ext,
    )


def _stmt(lines: list[StatementLine], *, year: int = 2024, period_end: str = "2024-09-28") -> Statement:
    return Statement(
        cik=320193,
        statement="balance",
        fiscal_year=year,
        fiscal_period="FY",
        period_end=period_end,
        form="10-K",
        filed=f"{year}-11-01",
        accession=f"0000320193-{year % 100:02d}-000123",
        lines=lines,
    )


# An AAPL-shaped balance sheet that reconciles cleanly.
#   current assets: 45 + 30 + 6 = 81 -> reported total_current_assets 81
#   noncurrent: ppe_net 45 + goodwill 0 + other_assets_noncurrent 226 = 271
#   total_assets 352
#   current liab: AP 68 + debt_current 20 = 88 -> total_current_liabilities 88
#   noncurrent: long_term_debt 96 + other 87 = 183 -> total_liabilities 271
#   equity 81 ; liabilities_and_equity 352 ; total_assets 352 -> balanced
def _clean_statement(**kw) -> Statement:
    return _stmt(
        [
            _line("cash_and_equivalents", 45),
            _line("accounts_receivable", 30),
            _line("inventory", 6),
            _line("total_current_assets", 81),
            _line("ppe_net", 45),
            _line("other_assets_noncurrent", 226),
            _line("total_assets", 352),
            _line("accounts_payable", 68),
            _line("debt_current", 20),
            _line("total_current_liabilities", 88),
            _line("long_term_debt", 96),
            _line("other_liabilities_noncurrent", 87),
            _line("total_liabilities", 271),
            _line("stockholders_equity", 81),
            _line("liabilities_and_equity", 352),
        ],
        **kw,
    )


# --- Balance Matrix ---------------------------------------------------------------------


def test_matrix_reconciles_and_balances():
    """AC-12: the two reported totals agree -> balanced True, delta ~0, no rescale."""
    m = balance_viz(_clean_statement()).matrix
    assert m.available is True
    assert m.assets.reported_total == 352
    assert m.financing.reported_total == 352
    assert m.financing.reported_total_concept == "liabilities_and_equity"
    assert m.balanced is True
    assert abs(m.reconciliation_delta) < 1.0


def test_matrix_asset_segments_are_leaves_plus_residual():
    """AC-11/13: leaf lines only (no total_current_assets segment); the gap to total_assets
    is ONE labeled residual."""
    m = balance_viz(_clean_statement()).matrix
    concepts = [s.canonical_concept for s in m.assets.segments if s.kind == "line"]
    assert "total_current_assets" not in concepts  # subtotal never a segment
    assert set(concepts) == {"cash_and_equivalents", "accounts_receivable", "inventory", "ppe_net", "other_assets_noncurrent"}
    residuals = [s for s in m.assets.segments if s.kind == "residual"]
    # 45+30+6+45+226 = 352 == total_assets -> no residual needed here
    assert residuals == []


def test_matrix_residual_is_the_only_balancer():
    """AC-13: an unmapped chunk of assets surfaces as one labeled residual, signed to close."""
    lines = [l for l in _clean_statement().lines if l.canonical_concept != "other_assets_noncurrent"]
    m = balance_viz(_stmt(lines)).matrix
    residuals = [s for s in m.assets.segments if s.kind == "residual"]
    assert len(residuals) == 1
    assert residuals[0].label == _BALANCE_RESIDUAL_LABEL
    assert residuals[0].canonical_concept is None
    assert residuals[0].source_tag is None
    # covered assets now 45+30+6+45 = 126; residual = 352 - 126 = 226
    assert residuals[0].value == 226
    # segments + residual reconcile to the reported total exactly
    assert sum(s.value for s in m.assets.segments) == m.assets.reported_total


def test_matrix_excludes_contra_assets_no_double_subtract():
    """RISK-3: allowance/accumulated_depreciation/ppe_gross are NOT segments -- ppe_net
    already embeds them; including them would double-subtract."""
    stmt = _clean_statement()
    stmt.lines.extend([
        _line("accumulated_depreciation", 70),
        _line("ppe_gross", 115),
        _line("allowance_for_doubtful_accounts", 2),
    ])
    m = balance_viz(stmt).matrix
    concepts = {s.canonical_concept for s in m.assets.segments if s.kind == "line"}
    assert "accumulated_depreciation" not in concepts
    assert "ppe_gross" not in concepts
    assert "allowance_for_doubtful_accounts" not in concepts
    # reconciliation is unchanged: assets still sum to total_assets, no residual
    assert [s for s in m.assets.segments if s.kind == "residual"] == []


def test_matrix_derived_le_fallback():
    """AC-12: filer without a combined LiabilitiesAndStockholdersEquity tag -> LE derived
    from reported total_liabilities + stockholders_equity, flagged in the note."""
    lines = [l for l in _clean_statement().lines if l.canonical_concept != "liabilities_and_equity"]
    m = balance_viz(_stmt(lines)).matrix
    assert m.available is True
    assert m.financing.reported_total_concept == "derived"
    assert m.financing.reported_total == 352  # 271 + 81
    assert m.reconciliation_note is not None
    assert m.balanced is True


def test_matrix_discrepancy_surfaced_not_forced():
    """AC-12: when the two reported totals disagree beyond tolerance, balanced=False and the
    signed delta is carried -- columns keep their own reported totals (no rescale)."""
    stmt = _clean_statement()
    for l in stmt.lines:
        if l.canonical_concept == "liabilities_and_equity":
            l.value = 300  # deliberately != total_assets 352
    m = balance_viz(stmt).matrix
    assert m.balanced is False
    assert m.reconciliation_delta == 52  # 352 - 300
    assert m.assets.reported_total == 352  # NOT rescaled to 300
    assert m.financing.reported_total == 300


def test_matrix_negative_equity_kept_signed():
    """RISK-3: a company with an accumulated deficit shows equity < 0, not abs()'d."""
    stmt = _clean_statement()
    for l in stmt.lines:
        if l.canonical_concept == "stockholders_equity":
            l.value = -40
        if l.canonical_concept == "total_liabilities":
            l.value = 392
        if l.canonical_concept == "other_liabilities_noncurrent":
            l.value = 208  # 68+20+96+208 = 392
    m = balance_viz(stmt).matrix
    equity_seg = [s for s in m.financing.segments if s.canonical_concept == "stockholders_equity"][0]
    assert equity_seg.value == -40  # signed, never abs()'d


def test_matrix_unavailable_when_total_assets_missing():
    """AC-13: no reported total assets -> explicit unavailable, not a lopsided column."""
    lines = [l for l in _clean_statement().lines if l.canonical_concept != "total_assets"]
    m = balance_viz(_stmt(lines)).matrix
    assert m.available is False
    assert "total assets" in m.unavailable_reason.lower()
    assert m.assets is None


def test_matrix_unavailable_when_no_financing_total():
    """AC-13: no reported LE and can't derive it (equity missing) -> unavailable."""
    lines = [
        l for l in _clean_statement().lines
        if l.canonical_concept not in ("liabilities_and_equity", "stockholders_equity")
    ]
    m = balance_viz(_stmt(lines)).matrix
    assert m.available is False


# --- Working-Capital bridge -------------------------------------------------------------


def test_working_capital_sign_positive():
    """AC-8: NWC = CA - CL, positive when the company has a cushion."""
    wc = balance_viz(_clean_statement()).working_capital
    assert wc.available is True
    assert wc.current_assets == 81
    assert wc.current_liabilities == 88
    assert wc.net_working_capital == -7  # 81 - 88, a deficit, kept signed


def test_working_capital_deficit_kept_signed():
    """AC-8: a negative NWC reads as a deficit, not flipped positive."""
    stmt = _clean_statement()
    for l in stmt.lines:
        if l.canonical_concept == "total_current_liabilities":
            l.value = 120
    wc = balance_viz(stmt).working_capital
    assert wc.net_working_capital == 81 - 120
    assert wc.net_working_capital < 0


def test_working_capital_unavailable_when_current_total_missing():
    """AC-9: no reported total_current_liabilities -> unavailable, NOT summed from parts."""
    lines = [l for l in _clean_statement().lines if l.canonical_concept != "total_current_liabilities"]
    wc = balance_viz(_stmt(lines)).working_capital
    assert wc.available is False
    assert "current liabilities" in wc.unavailable_reason.lower()
    assert wc.net_working_capital is None


def test_working_capital_null_component_stays_null():
    """AC-10: a current-asset line present but null renders as null, never 0."""
    stmt = _clean_statement()
    stmt.lines.append(_line("prepaid_expenses", None))
    wc = balance_viz(stmt).working_capital
    prepaid = [c for c in wc.asset_components if c.canonical_concept == "prepaid_expenses"]
    assert len(prepaid) == 1
    assert prepaid[0].value is None  # not coerced to 0


def test_working_capital_residual_balances_to_reported_total():
    """AC-10: the mapped current-asset leaves plus residual reconcile to the reported CA."""
    wc = balance_viz(_clean_statement()).working_capital
    # cash 45 + AR 30 + inv 6 = 81 == CA -> no residual
    assert [c for c in wc.asset_components if c.kind == "residual"] == []
    # current liab: AP 68 + debt_current 20 = 88 == CL -> no residual
    assert [c for c in wc.liability_components if c.kind == "residual"] == []


# --- Capital-Structure series -----------------------------------------------------------


def test_series_two_way_sums_to_financing_total():
    """AC-4/5: liabilities + equity percentages sum to 1 (two-way, no double-count)."""
    series = capital_structure_series([_clean_statement()])
    p = series.periods[0]
    assert p.available is True
    kinds = {s.kind for s in p.segments}
    assert kinds == {"liabilities", "equity"}  # clean -> no residual
    assert abs(sum(s.pct for s in p.segments) - 1.0) < 1e-9
    assert p.financing_total == 352


def test_series_negative_equity_pct_unclamped():
    """AC-5: a negative-equity period shows equity pct < 0 and liabilities pct > 1 -- real,
    never clamped to [0,1]."""
    stmt = _clean_statement()
    for l in stmt.lines:
        if l.canonical_concept == "stockholders_equity":
            l.value = -40
        if l.canonical_concept == "total_liabilities":
            l.value = 392
        if l.canonical_concept == "liabilities_and_equity":
            l.value = 352  # 392 + (-40)
    p = capital_structure_series([stmt]).periods[0]
    equity = [s for s in p.segments if s.kind == "equity"][0]
    liab = [s for s in p.segments if s.kind == "liabilities"][0]
    assert equity.pct < 0
    assert liab.pct > 1.0


def test_series_derives_liabilities_when_aggregate_untagged():
    """WMT-class filers report LiabilitiesAndStockholdersEquity + equity but never tag the
    aggregate `Liabilities`. Liabilities is derived from reported LE - reported equity (an
    identity between two reported numbers, not a plug), so the period is chartable, not a
    gap. Residual is exactly 0."""
    lines = [l for l in _clean_statement().lines if l.canonical_concept != "total_liabilities"]
    p = capital_structure_series([_stmt(lines)]).periods[0]
    assert p.available is True
    liab = [s for s in p.segments if s.kind == "liabilities"][0]
    assert liab.value == 352 - 81  # reported LE - reported equity == 271
    assert [s for s in p.segments if s.kind == "residual"] == []
    assert abs(sum(s.pct for s in p.segments) - 1.0) < 1e-9


def test_series_gappy_period_is_explicit_not_a_bar():
    """AC-6: a period missing a required total is carried as available=False, no segments."""
    incomplete = _stmt(
        [_line("total_assets", 100)],  # no liabilities/equity/LE
        year=2023,
        period_end="2023-09-30",
    )
    series = capital_structure_series([incomplete, _clean_statement()])
    gap = [p for p in series.periods if p.fiscal_year == 2023][0]
    assert gap.available is False
    assert gap.segments == []


def test_series_ordered_oldest_to_newest():
    """The series is drawn oldest->newest regardless of input order."""
    a = _clean_statement(year=2022, period_end="2022-09-24")
    b = _clean_statement(year=2024, period_end="2024-09-28")
    series = capital_structure_series([b, a])
    ends = [p.period_end for p in series.periods]
    assert ends == ["2022-09-24", "2024-09-28"]


def test_series_residual_when_total_exceeds_liab_plus_equity():
    """A reported LE larger than total_liabilities + equity surfaces one labeled residual."""
    stmt = _clean_statement()
    for l in stmt.lines:
        if l.canonical_concept == "liabilities_and_equity":
            l.value = 362  # 10 more than 271 + 81
    p = capital_structure_series([stmt]).periods[0]
    residual = [s for s in p.segments if s.kind == "residual"]
    assert len(residual) == 1
    assert residual[0].label == _BALANCE_RESIDUAL_LABEL
    assert residual[0].value == 10

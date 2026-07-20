"""Tests for the income-statement visualization derivation (normalize/viz.income_viz).

The honesty invariants under test:
  * the waterfall reconciles EXACTLY to reported net income (the residual is the only
    balancer) -- AC-4;
  * a segment gap surfaces as ONE labeled "Other / unattributed" residual, and no flow
    step is fudged to force the total -- AC-5;
  * a missing required anchor -> explicit unavailable state, never a partial bridge -- AC-6;
  * common-size percentages are value/revenue, sign preserved, null stays null (never 0%),
    and a missing/zero revenue base -> unavailable -- AC-8/9/10/11.

Fixtures build a Statement directly (income_viz's input contract); the values mirror a
real AAPL-shaped FY income statement so the reconciliation is realistic.
"""

from __future__ import annotations

from secfin.normalize.schema import Statement, StatementLine
from secfin.normalize.viz import _RESIDUAL_LABEL, income_viz


def _line(concept: str, value: float | None, *, tag: str = "", ext: bool = False) -> StatementLine:
    return StatementLine(
        canonical_concept=concept,
        label=concept.replace("_", " ").title(),
        value=value,
        unit="USD",
        source_tag=tag or concept,
        is_extension=ext,
    )


def _stmt(lines: list[StatementLine]) -> Statement:
    return Statement(
        cik=320193,
        statement="income",
        fiscal_year=2024,
        fiscal_period="FY",
        period_start="2023-10-01",
        period_end="2024-09-28",
        form="10-K",
        filed="2024-11-01",
        accession="0000320193-24-000123",
        lines=lines,
    )


# A full AAPL-shaped statement where every segment reconciles cleanly (residual ~= 0).
def _clean_statement() -> Statement:
    return _stmt(
        [
            _line("revenue", 391_035),
            _line("cost_of_revenue", 210_352),
            _line("gross_profit", 180_683),  # 391035 - 210352
            _line("research_and_development", 31_370),
            _line("sga_expense", 26_097),
            _line("operating_income", 123_216),  # 180683 - 31370 - 26097
            _line("nonoperating_income_expense", 269),
            _line("income_before_tax", 123_485),  # 123216 + 269
            _line("income_tax_expense", 29_749),
            _line("net_income", 93_736),  # 123485 - 29749
        ]
    )


def test_bridge_reconciles_to_net_income():
    """AC-4: the final running total equals reported net income, exactly."""
    viz = income_viz(_clean_statement())
    bridge = viz.bridge
    assert bridge.available is True
    assert bridge.net_income == 93_736
    assert bridge.steps[-1].kind == "anchor"
    assert bridge.steps[-1].canonical_concept == "net_income"
    assert bridge.steps[-1].running_total == 93_736
    # Every anchor column reads its reported value.
    anchors = {s.canonical_concept: s.running_total for s in bridge.steps if s.kind == "anchor"}
    assert anchors == {
        "revenue": 391_035,
        "gross_profit": 180_683,
        "operating_income": 123_216,
        "income_before_tax": 123_485,
        "net_income": 93_736,
    }
    # A cleanly-reconciling statement needs no residual.
    assert not any(s.kind == "residual" for s in bridge.steps)


def test_flow_step_directions_and_provenance():
    """Costs step down, income steps up; flow/anchor steps carry provenance."""
    viz = income_viz(_clean_statement())
    steps = {s.canonical_concept: s for s in viz.bridge.steps}
    assert steps["cost_of_revenue"].direction == "down"
    assert steps["research_and_development"].direction == "down"
    assert steps["nonoperating_income_expense"].direction == "up"  # +269
    assert steps["income_tax_expense"].direction == "down"
    # value is a magnitude (>= 0); sign lives in direction/running_total.
    assert steps["cost_of_revenue"].value == 210_352
    # provenance preserved on reported steps.
    assert steps["revenue"].source_tag == "revenue"
    assert steps["revenue"].is_extension is False


def test_residual_step_labeled_and_only_balancer():
    """AC-5: a segment whose components don't sum to the anchor gap yields exactly one
    labeled residual of the correct sign, and no flow step was altered to compensate."""
    # gross_profit -> operating_income gap is 180683 - 123216 = 57467, but only R&D
    # (31370) is reported -> residual should be -(57467 - 31370) = -26097 (the missing SG&A).
    stmt = _stmt(
        [
            _line("revenue", 391_035),
            _line("cost_of_revenue", 210_352),
            _line("gross_profit", 180_683),
            _line("research_and_development", 31_370),
            _line("operating_income", 123_216),
            _line("income_before_tax", 123_216),
            _line("income_tax_expense", 29_480),
            _line("net_income", 93_736),
        ]
    )
    bridge = income_viz(stmt).bridge
    residuals = [s for s in bridge.steps if s.kind == "residual"]
    # exactly one residual, in the gross_profit->operating_income segment.
    assert len(residuals) == 1
    res = residuals[0]
    assert res.label == _RESIDUAL_LABEL
    assert res.canonical_concept is None
    assert res.source_tag is None  # computed, not a reported line
    assert res.direction == "down"
    assert res.value == 26_097
    # the R&D flow step kept its reported value -- nothing was fudged.
    rnd = next(s for s in bridge.steps if s.canonical_concept == "research_and_development")
    assert rnd.value == 31_370
    # still lands exactly on net income.
    assert bridge.steps[-1].running_total == 93_736


def test_missing_required_anchor_unavailable():
    """AC-6: no revenue (or no net income) -> explicit unavailable, no partial bridge."""
    no_rev = _stmt([_line("gross_profit", 100), _line("net_income", 50)])
    b1 = income_viz(no_rev).bridge
    assert b1.available is False
    assert b1.steps == []
    assert "revenue" in b1.unavailable_reason.lower()

    no_ni = _stmt([_line("revenue", 100), _line("gross_profit", 80)])
    b2 = income_viz(no_ni).bridge
    assert b2.available is False
    assert b2.steps == []
    assert "net income" in b2.unavailable_reason.lower()


def test_opex_double_count_dropped():
    """The disambiguation rule: when R&D/SG&A are present, the operating_expenses
    aggregate is dropped from the walk (else it double-counts and the residual explodes)."""
    stmt = _stmt(
        [
            _line("revenue", 391_035),
            _line("cost_of_revenue", 210_352),
            _line("gross_profit", 180_683),
            _line("research_and_development", 31_370),
            _line("sga_expense", 26_097),
            _line("operating_expenses", 57_467),  # == R&D + SG&A (the aggregate)
            _line("operating_income", 123_216),
            _line("income_before_tax", 123_216),
            _line("income_tax_expense", 29_480),
            _line("net_income", 93_736),
        ]
    )
    bridge = income_viz(stmt).bridge
    walked = {s.canonical_concept for s in bridge.steps if s.kind == "flow"}
    assert "operating_expenses" not in walked  # aggregate dropped
    assert {"research_and_development", "sga_expense"} <= walked
    # with the parts (not the aggregate), the segment reconciles -> no residual there.
    assert not any(s.kind == "residual" for s in bridge.steps)
    assert bridge.steps[-1].running_total == 93_736


def test_operating_expenses_kept_when_alone():
    """The mirror of the above: when only the aggregate is present, it IS walked."""
    stmt = _stmt(
        [
            _line("revenue", 391_035),
            _line("cost_of_revenue", 210_352),
            _line("gross_profit", 180_683),
            _line("operating_expenses", 57_467),
            _line("operating_income", 123_216),
            _line("income_before_tax", 123_216),
            _line("income_tax_expense", 29_480),
            _line("net_income", 93_736),
        ]
    )
    bridge = income_viz(stmt).bridge
    walked = {s.canonical_concept for s in bridge.steps if s.kind == "flow"}
    assert "operating_expenses" in walked
    assert not any(s.kind == "residual" for s in bridge.steps)


def test_interior_anchor_missing_merges_segment():
    """A missing interior anchor (gross_profit) merges its components into the following
    present segment; the walk still reconciles to net income."""
    stmt = _stmt(
        [
            _line("revenue", 391_035),
            _line("cost_of_revenue", 210_352),
            # no gross_profit reported
            _line("research_and_development", 31_370),
            _line("sga_expense", 26_097),
            _line("operating_income", 123_216),
            _line("income_before_tax", 123_216),
            _line("income_tax_expense", 29_480),
            _line("net_income", 93_736),
        ]
    )
    bridge = income_viz(stmt).bridge
    assert bridge.available is True
    anchors = {s.canonical_concept for s in bridge.steps if s.kind == "anchor"}
    assert "gross_profit" not in anchors  # not reported -> not an anchor column
    # cost_of_revenue and the opex parts share the revenue->operating_income segment.
    walked = {s.canonical_concept for s in bridge.steps if s.kind == "flow"}
    assert {"cost_of_revenue", "research_and_development", "sga_expense"} <= walked
    assert bridge.steps[-1].running_total == 93_736


def test_nonoperating_signed_value_respected():
    """nonoperating_income_expense uses its as-reported sign (can be negative)."""
    stmt = _stmt(
        [
            _line("revenue", 1000),
            _line("cost_of_revenue", 700),
            _line("gross_profit", 300),
            _line("operating_income", 300),  # no opex reported: operating == gross
            _line("nonoperating_income_expense", -50),  # a net loss on the line
            _line("income_before_tax", 250),  # 300 + (-50)
            _line("income_tax_expense", 50),
            _line("net_income", 200),
        ]
    )
    bridge = income_viz(stmt).bridge
    nonop = next(s for s in bridge.steps if s.canonical_concept == "nonoperating_income_expense")
    assert nonop.direction == "down"  # -50 reduces the running total
    assert nonop.value == 50
    assert not any(s.kind == "residual" for s in bridge.steps)
    assert bridge.steps[-1].running_total == 200


def test_common_size_percentages_and_signs():
    """AC-8/AC-11: pct == value/revenue with sign preserved."""
    viz = income_viz(_clean_statement())
    cs = viz.common_size
    assert cs.available is True
    assert cs.revenue == 391_035
    by = {ln.canonical_concept: ln for ln in cs.lines}
    assert by["revenue"].pct_of_revenue == 1.0
    assert abs(by["cost_of_revenue"].pct_of_revenue - 210_352 / 391_035) < 1e-9
    assert abs(by["net_income"].pct_of_revenue - 93_736 / 391_035) < 1e-9
    # a genuinely negative line keeps its negative share.
    stmt = _stmt([_line("revenue", 1000), _line("nonoperating_income_expense", -40),
                  _line("net_income", 100)])
    neg = {ln.canonical_concept: ln for ln in income_viz(stmt).common_size.lines}
    assert neg["nonoperating_income_expense"].pct_of_revenue == -0.04


def test_common_size_null_is_none_not_zero():
    """AC-9: a null line stays None (both value and pct) -- never rendered as 0%."""
    stmt = _stmt(
        [
            _line("revenue", 1000),
            _line("cost_of_revenue", None),  # reported absent for this filer/period
            _line("net_income", 200),
        ]
    )
    cs = income_viz(stmt).common_size
    by = {ln.canonical_concept: ln for ln in cs.lines}
    assert by["cost_of_revenue"].value is None
    assert by["cost_of_revenue"].pct_of_revenue is None  # NOT 0.0


def test_common_size_no_revenue_base_unavailable():
    """AC-10: missing OR zero revenue -> unavailable, no divide-by-zero, no fabricated base."""
    missing = _stmt([_line("net_income", 200)])
    cs_missing = income_viz(missing).common_size
    assert cs_missing.available is False
    assert cs_missing.revenue is None
    assert cs_missing.lines == []

    zero = _stmt([_line("revenue", 0), _line("net_income", 200)])
    cs_zero = income_viz(zero).common_size
    assert cs_zero.available is False
    assert cs_zero.revenue is None
    assert "zero" in cs_zero.unavailable_reason.lower()


def test_per_share_and_ratio_concepts_excluded():
    """Per-share / share-count / ratio concepts appear in neither view."""
    stmt = _stmt(
        [
            _line("revenue", 1000),
            _line("net_income", 200),
            StatementLine(canonical_concept="eps_basic", label="EPS Basic", value=3.5,
                          unit="USD/shares", source_tag="EarningsPerShareBasic"),
            StatementLine(canonical_concept="shares_basic", label="Shares Basic", value=57e6,
                          unit="shares", source_tag="WeightedAvgShares"),
            StatementLine(canonical_concept="effective_tax_rate", label="Effective Tax Rate",
                          value=0.15, unit="pure", source_tag="EffectiveTaxRate"),
        ]
    )
    viz = income_viz(stmt)
    cs_concepts = {ln.canonical_concept for ln in viz.common_size.lines}
    assert cs_concepts == {"revenue", "net_income"}
    bridge_concepts = {s.canonical_concept for s in viz.bridge.steps if s.canonical_concept}
    assert "eps_basic" not in bridge_concepts
    assert "shares_basic" not in bridge_concepts
    assert "effective_tax_rate" not in bridge_concepts


def test_caveats_present():
    """AC-12: the derived view always carries the source/lag caveats."""
    viz = income_viz(_clean_statement())
    assert viz.caveats
    assert any("EDGAR" in c for c in viz.caveats)
    # period metadata carried through from the statement.
    assert viz.period_end == "2024-09-28"
    assert viz.accession == "0000320193-24-000123"

"""Derived presentation views over a canonical income statement.

`income_viz(stmt)` turns a built income `Statement` into two visualization shapes:

  * a **waterfall bridge** stepping Revenue -> Gross Profit -> Operating Income ->
    Income Before Tax -> Net Income, with the reported component lines shown inside each
    segment; and
  * a **100% common-size** breakdown (every line as a share of revenue).

Nothing here measures anything new -- it re-shapes values already normalized by
`build_statement`. Two honesty invariants drive the whole module:

  1. The bridge is built between the **reported anchor subtotals** the filer actually
     reports. Where the mapped components in a segment do not sum to the next reported
     anchor, the gap is shown as ONE explicit, labeled "Other / unattributed" residual
     step -- never absorbed silently, never a flow bar whose height was fudged to make
     the total balance. The residual is the ONLY balancing term, so the walk lands on
     reported net income exactly.
  2. A missing value stays missing: a null line is omitted (bridge) or carried as `None`
     (common-size), never coerced to 0. If a required anchor (revenue / net income) or
     the revenue base is absent, the view returns an explicit `available=False` state
     rather than a partial, misleading chart.

These functions are pure (no I/O); the endpoint in api/routes.py feeds them a Statement
built through the normal cache-aside path.
"""

from __future__ import annotations

from secfin.normalize.schema import (
    CommonSize,
    CommonSizeLine,
    IncomeBridge,
    IncomeBridgeStep,
    IncomeStatementViz,
    Statement,
    StatementLine,
)

# The reported subtotals the bridge hangs on, in canonical (top-to-bottom) order.
# Revenue and net income are the required endpoints; the interior three are used when
# present and skipped (segments merge) when the filer doesn't report them.
_ANCHORS: list[str] = [
    "revenue",
    "gross_profit",
    "operating_income",
    "income_before_tax",
    "net_income",
]
_REQUIRED_ANCHORS = ("revenue", "net_income")

# Which anchor segment each component belongs to, by the anchor that CLOSES its segment.
# (A component sits in the segment running from the previous present anchor to this one.)
# Order within each list is the canonical statement order.
_SEGMENT_COMPONENTS: dict[str, list[str]] = {
    "gross_profit": ["cost_of_revenue"],
    "operating_income": ["research_and_development", "sga_expense", "operating_expenses"],
    "income_before_tax": ["interest_expense", "interest_income", "nonoperating_income_expense"],
    "net_income": ["income_tax_expense"],
}

# Each component's effect on the running total, walking DOWN the statement. Costs and
# expenses subtract; income items add. `nonoperating_income_expense` is a signed net
# line, so it adds its as-reported value (which may itself be negative).
_CONTRIBUTION_SIGN: dict[str, int] = {
    "cost_of_revenue": -1,
    "research_and_development": -1,
    "sga_expense": -1,
    "operating_expenses": -1,
    "interest_expense": -1,
    "interest_income": +1,
    "nonoperating_income_expense": +1,
    "income_tax_expense": -1,
}

# Monetary income-statement concepts eligible for the common-size view. Per-share,
# share-count and ratio concepts are excluded -- they are not a share of revenue.
_MONETARY_INCOME_CONCEPTS: list[str] = [
    "revenue",
    "cost_of_revenue",
    "gross_profit",
    "research_and_development",
    "sga_expense",
    "operating_expenses",
    "operating_income",
    "interest_expense",
    "interest_income",
    "nonoperating_income_expense",
    "income_before_tax",
    "income_tax_expense",
    "net_income",
    "net_income_noncontrolling",
    "comprehensive_income",
    "other_comprehensive_income",
    "share_based_compensation",
    "amortization_of_intangibles",
    "goodwill_impairment",
    "asset_impairment",
    "operating_lease_cost",
]

# Sub-dollar reconciliation noise is not a real "Other" bucket.
_RESIDUAL_EPSILON = 1.0

_RESIDUAL_LABEL = "Other / unattributed"

# Same source/lag caveat the /statements table carries -- a chart is never a
# caveat-free surface.
INCOME_VIZ_CAVEATS: list[str] = [
    "Sourced from SEC EDGAR filings -- subject to normal filing lag (a 10-K posts "
    "~45-90 days after period end).",
    "Derived presentation view: the same normalized values as /statements/income, "
    "re-shaped for visualization. Not a new measurement.",
    "The waterfall bridges the filer's own reported subtotals; any gap between the "
    "mapped components and the next subtotal is shown as an explicit "
    f'"{_RESIDUAL_LABEL}" step, not hidden. A large such step usually means a '
    "reporting line we have not yet mapped, not a real economic bucket.",
]


def _lines_by_concept(stmt: Statement) -> dict[str, StatementLine]:
    """Index the statement's lines by canonical concept. build_statement emits at most
    one line per concept, so a plain dict is faithful."""
    return {line.canonical_concept: line for line in stmt.lines}


def _has_value(line: StatementLine | None) -> bool:
    return line is not None and line.value is not None


def _walk_components(present_components: list[str]) -> list[str]:
    """Drop double-counted aggregates from a segment's component walk.

    `operating_expenses` is the total of R&D + SG&A for many filers; when the
    disaggregated parts are present, the aggregate would double-count, so we drop it and
    let the (small) residual absorb any remaining opex. When only `operating_expenses`
    is present, we keep it. (income_tax_expense's current/deferred sub-parts are never
    in _SEGMENT_COMPONENTS, so there is nothing to drop there.)
    """
    has_disaggregated_opex = (
        "research_and_development" in present_components or "sga_expense" in present_components
    )
    if has_disaggregated_opex:
        return [c for c in present_components if c != "operating_expenses"]
    return present_components


def _build_bridge(stmt: Statement) -> IncomeBridge:
    by_concept = _lines_by_concept(stmt)

    for required in _REQUIRED_ANCHORS:
        if not _has_value(by_concept.get(required)):
            label = by_concept.get(required)
            label_text = label.label if label else required.replace("_", " ")
            return IncomeBridge(
                available=False,
                unavailable_reason=f"No reported {label_text} for this period.",
                steps=[],
                net_income=None,
            )

    # The anchor chain: required endpoints plus whichever interior anchors are present.
    present_anchors = [a for a in _ANCHORS if _has_value(by_concept.get(a))]

    steps: list[IncomeBridgeStep] = []
    revenue_line = by_concept["revenue"]
    running = float(revenue_line.value)  # type: ignore[arg-type]
    steps.append(
        IncomeBridgeStep(
            kind="anchor",
            canonical_concept="revenue",
            label=revenue_line.label,
            value=abs(running),
            direction="base",
            running_total=running,
            unit=revenue_line.unit,
            source_tag=revenue_line.source_tag,
            is_extension=revenue_line.is_extension,
        )
    )

    # Walk each closing anchor after revenue. Components of a segment whose opening
    # anchor is absent bracket to the nearest present anchor -- so a missing interior
    # anchor merges its components into the following present segment.
    prev_anchor_value = running
    pending_components: list[str] = []
    for closing_anchor in _ANCHORS[1:]:
        pending_components.extend(_SEGMENT_COMPONENTS.get(closing_anchor, []))
        if closing_anchor not in present_anchors:
            # Anchor not reported: its components fall through to the next present anchor.
            continue

        # Emit the flow steps for every present component in this (possibly merged) segment.
        present_components = [c for c in pending_components if _has_value(by_concept.get(c))]
        present_components = _walk_components(present_components)
        contribution_total = 0.0
        for concept in present_components:
            line = by_concept[concept]
            signed = _CONTRIBUTION_SIGN[concept] * float(line.value)  # type: ignore[arg-type]
            contribution_total += signed
            running += signed
            steps.append(
                IncomeBridgeStep(
                    kind="flow",
                    canonical_concept=concept,
                    label=line.label,
                    value=abs(signed),
                    direction="up" if signed >= 0 else "down",
                    running_total=running,
                    unit=line.unit,
                    source_tag=line.source_tag,
                    is_extension=line.is_extension,
                )
            )

        anchor_line = by_concept[closing_anchor]
        anchor_value = float(anchor_line.value)  # type: ignore[arg-type]
        gap = anchor_value - prev_anchor_value
        residual = gap - contribution_total
        if abs(residual) >= _RESIDUAL_EPSILON:
            running += residual
            steps.append(
                IncomeBridgeStep(
                    kind="residual",
                    canonical_concept=None,
                    label=_RESIDUAL_LABEL,
                    value=abs(residual),
                    direction="up" if residual >= 0 else "down",
                    running_total=running,
                    unit=anchor_line.unit,
                    source_tag=None,
                    is_extension=None,
                )
            )

        # Snap the running total onto the reported anchor -- the residual made this exact,
        # this just clears floating-point dust so the anchor column reads its true value.
        running = anchor_value
        steps.append(
            IncomeBridgeStep(
                kind="anchor",
                canonical_concept=closing_anchor,
                label=anchor_line.label,
                value=abs(anchor_value),
                direction="base",
                running_total=running,
                unit=anchor_line.unit,
                source_tag=anchor_line.source_tag,
                is_extension=anchor_line.is_extension,
            )
        )
        prev_anchor_value = anchor_value
        pending_components = []

    net_income = float(by_concept["net_income"].value)  # type: ignore[arg-type]
    return IncomeBridge(available=True, unavailable_reason=None, steps=steps, net_income=net_income)


def _build_common_size(stmt: Statement) -> CommonSize:
    by_concept = _lines_by_concept(stmt)
    revenue_line = by_concept.get("revenue")

    if not _has_value(revenue_line) or float(revenue_line.value) == 0.0:  # type: ignore[union-attr,arg-type]
        reason = (
            "No reported revenue for this period."
            if not _has_value(revenue_line)
            else "Reported revenue is zero -- no base to divide by."
        )
        return CommonSize(available=False, unavailable_reason=reason, revenue=None, lines=[])

    revenue = float(revenue_line.value)  # type: ignore[arg-type]
    lines: list[CommonSizeLine] = []
    for concept in _MONETARY_INCOME_CONCEPTS:
        line = by_concept.get(concept)
        if line is None:
            continue  # concept not on this filing at all -- nothing to show
        value = line.value
        pct = (float(value) / revenue) if value is not None else None
        lines.append(
            CommonSizeLine(
                canonical_concept=concept,
                label=line.label,
                value=value,
                pct_of_revenue=pct,
                source_tag=line.source_tag,
                is_extension=line.is_extension,
            )
        )

    return CommonSize(
        available=True, unavailable_reason=None, revenue=revenue_line.value, lines=lines
    )


def income_viz(stmt: Statement) -> IncomeStatementViz:
    """Derive the waterfall bridge and 100% common-size views from an income statement.

    `stmt` must be an income statement (built via build_statement with statement="income").
    Carries through the statement's period metadata and provenance; adds the shared
    source/lag caveats.
    """
    return IncomeStatementViz(
        cik=stmt.cik,
        fiscal_year=stmt.fiscal_year,
        fiscal_period=stmt.fiscal_period,
        period_start=stmt.period_start,
        period_end=stmt.period_end,
        form=stmt.form,
        filed=stmt.filed,
        accession=stmt.accession,
        bridge=_build_bridge(stmt),
        common_size=_build_common_size(stmt),
        caveats=INCOME_VIZ_CAVEATS,
    )

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
    BalanceMatrix,
    BalanceMatrixSegment,
    BalanceMatrixSide,
    BalanceSheetViz,
    CapitalStructurePeriod,
    CapitalStructureSegment,
    CapitalStructureSeries,
    CommonSize,
    CommonSizeLine,
    IncomeBridge,
    IncomeBridgeStep,
    IncomeStatementViz,
    Statement,
    StatementLine,
    WorkingCapitalBridge,
    WorkingCapitalComponent,
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


# ---------------------------------------------------------------------------
# Balance-sheet visualizations (Balance Matrix, Working-Capital bridge,
# Capital-Structure trend). Same honesty invariants as the income viz above:
# a null line stays null (never 0); any gap between the mapped leaf lines and a
# reported total is ONE explicit, labeled residual (never a plug); the two
# independently reported totals (total_assets vs liabilities_and_equity) are
# reconciled and shown, never forced; equity stays SIGNED.
# ---------------------------------------------------------------------------

_BALANCE_RESIDUAL_LABEL = "Other / unmapped"

# Matrix asset column -- leaf, NET concepts only, in canonical statement order. The
# standalone contra concepts (allowance_for_doubtful_accounts, accumulated_depreciation,
# ppe_gross) are deliberately EXCLUDED: the net leaves (ppe_net, accounts_receivable =
# AccountsReceivableNetCurrent) already embed them, so including the contras would
# double-subtract. Subtotals (total_current_assets, assets_noncurrent) are excluded too --
# they feed reported_total + the residual, never a segment (would double-count).
_MATRIX_ASSET_CONCEPTS: list[str] = [
    "cash_and_equivalents",
    "marketable_securities_current",
    "accounts_receivable",
    "inventory",
    "prepaid_expenses",
    "other_assets_current",
    "ppe_net",
    "operating_lease_right_of_use_asset",
    "goodwill",
    "intangible_assets",
    "marketable_securities_noncurrent",
    "other_assets_noncurrent",
]

# Matrix financing column -- leaf liability lines (equity is added separately as one block).
_MATRIX_LIABILITY_CONCEPTS: list[str] = [
    "accounts_payable",
    "accrued_liabilities",
    "accounts_payable_and_accrued_liabilities",
    "debt_current",
    "deferred_revenue_current",
    "operating_lease_liabilities_current",
    "other_liabilities_current",
    "long_term_debt",
    "deferred_revenue",
    "operating_lease_liabilities_noncurrent",
    "other_liabilities_noncurrent",
]

_MATRIX_EQUITY_CONCEPT = "stockholders_equity"

# Working-capital bridge -- the current-scoped leaf subsets of the above.
_CURRENT_ASSET_CONCEPTS: list[str] = [
    "cash_and_equivalents",
    "marketable_securities_current",
    "accounts_receivable",
    "inventory",
    "prepaid_expenses",
    "other_assets_current",
]
_CURRENT_LIABILITY_CONCEPTS: list[str] = [
    "accounts_payable",
    "accrued_liabilities",
    "accounts_payable_and_accrued_liabilities",
    "debt_current",
    "deferred_revenue_current",
    "operating_lease_liabilities_current",
    "other_liabilities_current",
]

# When total_assets and reported liabilities_and_equity disagree by more than this, the
# matrix flags it as a genuine discrepancy (annotated) rather than "balances". Dollar-exact
# normally (both from the same filing, same unit); the relative guard covers rounding on a
# large sheet.
_RECON_REL_TOLERANCE = 0.005

BALANCE_VIZ_CAVEATS: list[str] = [
    "Sourced from SEC EDGAR filings -- subject to normal filing lag (a 10-K posts "
    "~45-90 days after period end).",
    "Derived presentation view: the same normalized values as /statements/balance, "
    "re-shaped for visualization. Not a new measurement.",
    "A balance sheet is an instant snapshot -- the reported position as of the period "
    "end, not a flow over the period.",
    "Any gap between the mapped lines and the filer's reported total is shown as an "
    f'explicit "{_BALANCE_RESIDUAL_LABEL}" block, not hidden. A large such block usually '
    "means a reporting line we have not yet mapped, not a real economic bucket.",
    "The Assets = Liabilities + Equity check compares the filer's two independently "
    "reported totals; any discrepancy is annotated, never forced by rescaling a column.",
]


def _value(line: StatementLine | None) -> float | None:
    """The line's value as a float, or None when the line is absent/null. Never 0 for a
    missing line -- absence stays absence."""
    if not _has_value(line):
        return None
    return float(line.value)  # type: ignore[union-attr,arg-type]


def _matrix_side(
    label: str,
    concepts: list[str],
    by_concept: dict[str, StatementLine],
    reported_total: float,
    reported_total_concept: str,
    extra_segments: list[BalanceMatrixSegment] | None = None,
) -> BalanceMatrixSide:
    """Build one matrix column: a `line` segment per present leaf concept (plus any
    `extra_segments`, e.g. the equity block), then one `residual` = reported_total - sum
    of the segments when it exceeds the epsilon. The residual is the ONLY balancing term."""
    segments: list[BalanceMatrixSegment] = []
    covered = 0.0
    for concept in concepts:
        line = by_concept.get(concept)
        v = _value(line)
        if v is None:
            continue
        covered += v
        segments.append(
            BalanceMatrixSegment(
                kind="line",
                canonical_concept=concept,
                label=line.label,  # type: ignore[union-attr]
                value=line.value,  # type: ignore[union-attr]
                unit=line.unit,  # type: ignore[union-attr]
                source_tag=line.source_tag,  # type: ignore[union-attr]
                is_extension=line.is_extension,  # type: ignore[union-attr]
            )
        )
    for seg in extra_segments or []:
        covered += float(seg.value)
        segments.append(seg)

    residual = reported_total - covered
    if abs(residual) >= _RESIDUAL_EPSILON:
        segments.append(
            BalanceMatrixSegment(
                kind="residual",
                canonical_concept=None,
                label=_BALANCE_RESIDUAL_LABEL,
                value=residual,
                unit="USD",
                source_tag=None,
                is_extension=None,
            )
        )
    return BalanceMatrixSide(
        label=label,
        segments=segments,
        reported_total=reported_total,
        reported_total_concept=reported_total_concept,
    )


def _financing_total(by_concept: dict[str, StatementLine]) -> tuple[float | None, str | None]:
    """The reported financing total: the filer's own LiabilitiesAndStockholdersEquity when
    present, else the sum of reported total_liabilities + stockholders_equity (both must be
    present -- reported liabilities + reported equity, not a plug). Returns (value, concept)
    or (None, None) when neither is derivable."""
    le = _value(by_concept.get("liabilities_and_equity"))
    if le is not None:
        return le, "liabilities_and_equity"
    liabilities = _value(by_concept.get("total_liabilities"))
    equity = _value(by_concept.get(_MATRIX_EQUITY_CONCEPT))
    if liabilities is not None and equity is not None:
        return liabilities + equity, "derived"
    return None, None


def _build_matrix(stmt: Statement) -> BalanceMatrix:
    by_concept = _lines_by_concept(stmt)

    total_assets = _value(by_concept.get("total_assets"))
    if total_assets is None:
        return BalanceMatrix(
            available=False,
            unavailable_reason="No reported total assets for this period.",
        )

    le, le_concept = _financing_total(by_concept)
    if le is None:
        return BalanceMatrix(
            available=False,
            unavailable_reason=(
                "No reported total liabilities & equity for this period (and no "
                "reported liabilities + equity to derive it from)."
            ),
        )

    assets_side = _matrix_side(
        "Assets", _MATRIX_ASSET_CONCEPTS, by_concept, total_assets, "total_assets"
    )

    equity_line = by_concept.get(_MATRIX_EQUITY_CONCEPT)
    equity_segments: list[BalanceMatrixSegment] = []
    if _has_value(equity_line):
        equity_segments.append(
            BalanceMatrixSegment(
                kind="line",
                canonical_concept=_MATRIX_EQUITY_CONCEPT,
                label=equity_line.label,  # type: ignore[union-attr]
                value=equity_line.value,  # type: ignore[union-attr]
                unit=equity_line.unit,  # type: ignore[union-attr]
                source_tag=equity_line.source_tag,  # type: ignore[union-attr]
                is_extension=equity_line.is_extension,  # type: ignore[union-attr]
            )
        )
    financing_side = _matrix_side(
        "Liabilities & Equity",
        _MATRIX_LIABILITY_CONCEPTS,
        by_concept,
        le,
        le_concept,
        extra_segments=equity_segments,
    )

    delta = total_assets - le
    tolerance = max(_RESIDUAL_EPSILON, _RECON_REL_TOLERANCE * abs(total_assets))
    balanced = abs(delta) <= tolerance
    note = None
    if le_concept == "derived":
        note = "Reconciled against reported total liabilities + stockholders' equity (the filer did not tag a combined total)."

    return BalanceMatrix(
        available=True,
        assets=assets_side,
        financing=financing_side,
        reconciliation_delta=delta,
        balanced=balanced,
        reconciliation_note=note,
    )


def _wc_components(
    concepts: list[str], by_concept: dict[str, StatementLine], reported_total: float
) -> list[WorkingCapitalComponent]:
    """The current-asset (or -liability) component breakdown for the working-capital
    bridge: one `line` per present concept (a null value stays null, never 0), then a
    `residual` to the reported current total."""
    components: list[WorkingCapitalComponent] = []
    covered = 0.0
    for concept in concepts:
        line = by_concept.get(concept)
        if line is None:
            continue  # concept not on this filing at all
        v = _value(line)
        if v is not None:
            covered += v
        components.append(
            WorkingCapitalComponent(
                kind="line",
                canonical_concept=concept,
                label=line.label,
                value=line.value,  # None stays None
                source_tag=line.source_tag,
                is_extension=line.is_extension,
            )
        )
    residual = reported_total - covered
    if abs(residual) >= _RESIDUAL_EPSILON:
        components.append(
            WorkingCapitalComponent(
                kind="residual",
                canonical_concept=None,
                label=_BALANCE_RESIDUAL_LABEL,
                value=residual,
                source_tag=None,
                is_extension=None,
            )
        )
    return components


def _build_working_capital(stmt: Statement) -> WorkingCapitalBridge:
    by_concept = _lines_by_concept(stmt)
    ca_line = by_concept.get("total_current_assets")
    cl_line = by_concept.get("total_current_liabilities")
    ca = _value(ca_line)
    cl = _value(cl_line)

    if ca is None or cl is None:
        missing = []
        if ca is None:
            missing.append("total current assets")
        if cl is None:
            missing.append("total current liabilities")
        return WorkingCapitalBridge(
            available=False,
            unavailable_reason=f"No reported {' and '.join(missing)} for this period.",
        )

    unit = ca_line.unit if ca_line is not None else "USD"  # type: ignore[union-attr]
    return WorkingCapitalBridge(
        available=True,
        current_assets=ca_line.value,  # type: ignore[union-attr]
        current_liabilities=cl_line.value,  # type: ignore[union-attr]
        net_working_capital=ca - cl,
        unit=unit,
        asset_components=_wc_components(_CURRENT_ASSET_CONCEPTS, by_concept, ca),
        liability_components=_wc_components(_CURRENT_LIABILITY_CONCEPTS, by_concept, cl),
    )


def balance_viz(stmt: Statement) -> BalanceSheetViz:
    """Derive the Balance Matrix and Working-Capital bridge from a balance sheet.

    `stmt` must be a balance sheet (built via build_statement with statement="balance").
    Carries through the statement's period metadata; adds the shared source/lag caveats.
    """
    return BalanceSheetViz(
        cik=stmt.cik,
        fiscal_year=stmt.fiscal_year,
        fiscal_period=stmt.fiscal_period,
        period_start=stmt.period_start,
        period_end=stmt.period_end,
        form=stmt.form,
        filed=stmt.filed,
        accession=stmt.accession,
        matrix=_build_matrix(stmt),
        working_capital=_build_working_capital(stmt),
        caveats=BALANCE_VIZ_CAVEATS,
    )


def _capital_structure_period(stmt: Statement) -> CapitalStructurePeriod:
    by_concept = _lines_by_concept(stmt)
    le, _le_concept = _financing_total(by_concept)
    equity = _value(by_concept.get(_MATRIX_EQUITY_CONCEPT))
    reported_liab = _value(by_concept.get("total_liabilities"))
    reported_le = _value(by_concept.get("liabilities_and_equity"))

    # Required: a financing total to normalize against, plus the equity segment. The
    # liabilities segment is the reported aggregate when present, else derived from the
    # two OTHER reported totals (reported LE - reported equity -- an accounting identity
    # between two reported numbers, not a plug). Many large filers (e.g. WMT) never tag
    # the aggregate `Liabilities` at all, so requiring it would make the whole trend a
    # wall of gaps for them. Missing a genuinely required input -> an explicit gap, never
    # a drawn 0%/100% bar.
    if reported_liab is not None:
        liabilities = reported_liab
    elif reported_le is not None and equity is not None:
        liabilities = reported_le - equity
    else:
        liabilities = None

    if le is None or le == 0.0 or equity is None or liabilities is None:
        if le is None:
            reason = "No reported total liabilities & equity for this period."
        elif le == 0.0:
            reason = "Reported total liabilities & equity is zero -- no base to normalize."
        elif equity is None:
            reason = "No reported stockholders' equity for this period."
        else:
            reason = "No reported (or derivable) total liabilities for this period."
        return CapitalStructurePeriod(
            fiscal_year=stmt.fiscal_year,
            fiscal_period=stmt.fiscal_period,
            period_end=stmt.period_end,
            available=False,
            unavailable_reason=reason,
        )

    equity_line = by_concept[_MATRIX_EQUITY_CONCEPT]
    liab_line = by_concept.get("total_liabilities")
    liab_label = liab_line.label if liab_line is not None else "Total Liabilities"
    segments = [
        CapitalStructureSegment(
            kind="liabilities", label=liab_label, value=liabilities, pct=liabilities / le
        ),
        CapitalStructureSegment(
            kind="equity", label=equity_line.label, value=equity_line.value, pct=equity / le
        ),
    ]
    residual = le - (liabilities + equity)
    if abs(residual) >= _RESIDUAL_EPSILON:
        segments.append(
            CapitalStructureSegment(
                kind="residual",
                label=_BALANCE_RESIDUAL_LABEL,
                value=residual,
                pct=residual / le,
            )
        )
    return CapitalStructurePeriod(
        fiscal_year=stmt.fiscal_year,
        fiscal_period=stmt.fiscal_period,
        period_end=stmt.period_end,
        available=True,
        financing_total=le,
        segments=segments,
    )


def capital_structure_series(statements: list[Statement]) -> CapitalStructureSeries:
    """Derive the Capital-Structure trend from a sequence of balance sheets (any order in;
    emitted oldest -> newest). Two-way Liabilities-vs-Equity split normalized to each
    period's reported financing total. Percentages are NOT clamped -- a negative-equity
    period truthfully shows equity < 0 and liabilities > 100%. Periods missing a required
    total are carried as explicit gaps."""
    ordered = sorted(statements, key=lambda s: (s.period_end or "", s.fiscal_year))
    periods = [_capital_structure_period(s) for s in ordered]
    cik = statements[0].cik if statements else 0
    fp = statements[0].fiscal_period if statements else "FY"
    return CapitalStructureSeries(
        cik=cik,
        fiscal_period=fp,
        periods=periods,
        caveats=BALANCE_VIZ_CAVEATS,
    )

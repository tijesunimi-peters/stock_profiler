"""Canonical data models.

Two layers:
  * RawFact           -- source-faithful, straight from SEC (before normalization)
  * canonical outputs -- StatementLine / Statement / InsiderTransaction (what we serve)

Keeping them separate is deliberate: RawFact preserves exactly what the SEC reported
(including the original tag and whether it was a company extension), which we need for
auditability and to keep improving the mapping. Canonical models are what subscribers see.
"""

from __future__ import annotations

from typing import Literal, NamedTuple

from pydantic import BaseModel, Field

FiscalPeriod = Literal["Q1", "Q2", "Q3", "Q4", "FY"]
StatementType = Literal["income", "balance", "cashflow"]


class RawFact(BaseModel):
    """One data point exactly as reported in a filing (pre-normalization)."""

    cik: int
    taxonomy: str
    gaap_tag: str  # e.g. "Revenues", "RevenueFromContractWithCustomerExcludingAssessedTax"
    label: str
    unit: str  # e.g. "USD", "shares", "USD/shares"
    value: float | int | None

    # Duration facts have start+end; instant facts (balance sheet) have instant only.
    period_start: str | None = None
    period_end: str | None = None
    instant: str | None = None

    fiscal_year: int | None = None
    fiscal_period: str | None = None  # SEC uses "FY","Q1".. ; may be None
    form: str | None = None  # "10-K","10-Q",...
    filed: str | None = None  # filing date
    accession: str | None = None
    frame: str | None = None  # present when the point aligns to an SEC "frame"

    @property
    def is_extension(self) -> bool:
        """Company-specific extension tags are not in the us-gaap/dei taxonomies."""
        return self.taxonomy not in {"us-gaap", "dei"}


class StatementLine(BaseModel):
    """One normalized line on a statement, for one period."""

    canonical_concept: str  # our stable key, e.g. "revenue"
    label: str  # human label, e.g. "Revenue"
    value: float | int | None
    unit: str
    source_tag: str  # the gaap_tag we mapped from (audit trail)
    is_extension: bool = False


class Statement(BaseModel):
    """A full statement for one company + fiscal period."""

    cik: int
    statement: StatementType
    fiscal_year: int
    fiscal_period: FiscalPeriod
    period_start: str | None = None
    period_end: str | None = None
    form: str | None = None
    filed: str | None = None
    accession: str | None = None
    lines: list[StatementLine] = Field(default_factory=list)


class NormalizedFactLine(BaseModel):
    """One (tag, unit) row of the tag-level normalized view -- the statement builder's
    mechanical normalizations with NO concept mapping. `canonical_concept` cross-links
    to the curated layer when the tag happens to feed one."""

    taxonomy: str
    gaap_tag: str
    label: str
    unit: str
    value: float | int
    period_start: str | None = None
    period_end: str | None = None
    instant: str | None = None
    is_extension: bool = False
    canonical_concept: str | None = None


class NormalizedView(BaseModel):
    """Every tag a company reported for one fiscal period, mechanically normalized:
    primary column only, restatements resolved, one row per (tag, unit). See
    normalize/statements.py's build_normalized_view."""

    cik: int
    fiscal_year: int
    fiscal_period: FiscalPeriod
    period_start: str | None = None
    period_end: str | None = None
    form: str | None = None
    filed: str | None = None
    accession: str | None = None
    rows: list[NormalizedFactLine] = Field(default_factory=list)


class IncomeBridgeStep(BaseModel):
    """One step of the income-statement waterfall (see normalize/viz.py).

    A derived presentation shape over the canonical income statement -- NOT a new
    measurement. `value` is the magnitude drawn (>= 0); `direction`/`running_total`
    carry the sign and position so the renderer never re-derives sign. Anchors and
    flow steps carry the provenance of the reported line behind them; a `residual`
    step ("Other / unattributed") is computed, so it has no source line.
    """

    kind: Literal["anchor", "flow", "residual"]
    canonical_concept: str | None = None  # None for residual steps
    label: str
    value: float  # magnitude for the bar (>= 0)
    direction: Literal["up", "down", "base"]  # base = anchor column from 0; up/down = floating flow
    running_total: float  # cumulative position AFTER this step (anchors == their reported value)
    unit: str  # always the monetary unit (USD); the bridge is monetary-only
    source_tag: str | None = None  # provenance for anchor/flow; None for residual
    is_extension: bool | None = None  # provenance for anchor/flow; None for residual


class IncomeBridge(BaseModel):
    """The revenue -> net income waterfall for one period, or an explicit unavailable
    state when a required anchor (revenue / net income) is missing -- never a partial,
    misleading bridge."""

    available: bool
    unavailable_reason: str | None = None
    steps: list[IncomeBridgeStep] = Field(default_factory=list)
    net_income: float | None = None  # the reconciliation target; final running_total equals this


class CommonSizeLine(BaseModel):
    """One income line as a share of revenue. A null `value` stays null (`pct_of_revenue`
    is None too) -- a missing line is a documented gap, never rendered as 0%."""

    canonical_concept: str
    label: str
    value: float | int | None  # raw reported value (None = N/A, never coerced to 0)
    pct_of_revenue: float | None  # value / revenue, sign preserved; None when value is None
    source_tag: str
    is_extension: bool = False


class CommonSize(BaseModel):
    """The 100% common-size income view for one period, or an unavailable state when
    there is no revenue base to divide by (missing or zero)."""

    available: bool
    unavailable_reason: str | None = None
    revenue: float | int | None = None
    lines: list[CommonSizeLine] = Field(default_factory=list)


class IncomeStatementViz(BaseModel):
    """Derived presentation views over an income statement: the waterfall bridge and
    the 100% common-size breakdown. The numbers are the same normalized values as
    /statements/income, re-shaped for visualization -- not a new measurement. See
    normalize/viz.py."""

    cik: int
    fiscal_year: int
    fiscal_period: FiscalPeriod
    period_start: str | None = None
    period_end: str | None = None
    form: str | None = None
    filed: str | None = None
    accession: str | None = None
    bridge: IncomeBridge
    common_size: CommonSize
    caveats: list[str] = Field(default_factory=list)


# --- Balance-sheet visualization shapes (see normalize/viz.py) ---
# Three derived presentation views over a canonical balance sheet: the Balance Matrix
# (Assets vs Liabilities+Equity, with the filer's two independently reported totals
# reconciled, never forced), the Working-Capital bridge, and -- across periods -- the
# Capital-Structure trend. Same honesty invariants as the income viz: a null line stays
# null (never 0), any gap between mapped lines and a reported total is one explicit,
# labeled "Other / unmapped" residual (never a fudged plug), and equity is kept SIGNED
# (a negative/accumulated-deficit equity is real, never abs()'d).


class BalanceMatrixSegment(BaseModel):
    """One block of a Balance-Matrix column. `value` is SIGNED (equity may be negative,
    and so may a residual). A `residual` block is the labeled "Other / unmapped" gap
    between the mapped leaf lines and the side's reported total -- computed, so no source
    line."""

    kind: Literal["line", "residual"]
    canonical_concept: str | None = None  # None for residual
    label: str
    value: float | int  # SIGNED reported value (never coerced/abs'd)
    unit: str
    source_tag: str | None = None  # provenance for lines; None for residual
    is_extension: bool | None = None


class BalanceMatrixSide(BaseModel):
    """One column of the Balance Matrix -- Assets, or Liabilities & Equity. Segments are
    leaf lines only (subtotals feed `reported_total` + the residual, never stacked as
    their own segment, which would double-count)."""

    label: str  # "Assets" | "Liabilities & Equity"
    segments: list[BalanceMatrixSegment] = Field(default_factory=list)
    reported_total: float | int | None = None  # total_assets / LE (signed)
    reported_total_concept: str | None = None  # "total_assets" | "liabilities_and_equity" | "derived"


class BalanceMatrix(BaseModel):
    """Assets vs Liabilities+Equity for one period, or an explicit unavailable state when
    a required reported total is missing. The reconciliation between the filer's two
    independently reported totals (total_assets vs liabilities_and_equity) is SURFACED via
    `reconciliation_delta`/`balanced` -- never forced by rescaling a column."""

    available: bool
    unavailable_reason: str | None = None
    assets: BalanceMatrixSide | None = None
    financing: BalanceMatrixSide | None = None
    reconciliation_delta: float | int | None = None  # total_assets - LE, SIGNED
    balanced: bool | None = None
    reconciliation_note: str | None = None  # e.g. "reconciled against derived L+E sum"


class WorkingCapitalComponent(BaseModel):
    """One current-asset or current-liability line inside the working-capital bridge. A
    null `value` stays null (never 0). A `residual` block is the labeled "Other / unmapped"
    gap between the mapped current leaves and the reported current total."""

    kind: Literal["line", "residual"]
    canonical_concept: str | None = None
    label: str
    value: float | int | None  # None = N/A (never coerced to 0); residual signed
    source_tag: str | None = None
    is_extension: bool | None = None


class WorkingCapitalBridge(BaseModel):
    """Net working capital (current assets vs current liabilities) for one period, or an
    explicit unavailable state when a reported current total is missing -- never a
    fabricated total summed from components."""

    available: bool
    unavailable_reason: str | None = None
    current_assets: float | int | None = None
    current_liabilities: float | int | None = None
    net_working_capital: float | int | None = None  # CA - CL, SIGNED
    unit: str | None = None
    asset_components: list[WorkingCapitalComponent] = Field(default_factory=list)
    liability_components: list[WorkingCapitalComponent] = Field(default_factory=list)


class BalanceSheetViz(BaseModel):
    """Derived presentation views over a balance sheet for one period: the Balance Matrix
    and the Working-Capital bridge. Same normalized values as /statements/balance,
    re-shaped for visualization -- not a new measurement. See normalize/viz.py."""

    cik: int
    fiscal_year: int
    fiscal_period: FiscalPeriod
    period_start: str | None = None
    period_end: str | None = None
    form: str | None = None
    filed: str | None = None
    accession: str | None = None
    matrix: BalanceMatrix
    working_capital: WorkingCapitalBridge
    caveats: list[str] = Field(default_factory=list)


class CapitalStructureSegment(BaseModel):
    """One segment of a period's 100% financing bar. `pct` is `value / financing_total`
    and is NOT clamped: a filer with negative equity legitimately shows equity `pct` < 0
    and liabilities `pct` > 1. Equity is kept signed."""

    kind: Literal["liabilities", "equity", "residual"]
    label: str
    value: float | int  # SIGNED
    pct: float  # value / financing_total (may be >1 or <0 -- both are real, never clamped)


class CapitalStructurePeriod(BaseModel):
    """One period's financing mix (Liabilities vs Equity, normalized to the reported
    financing total), or an explicit gap state when a required total is missing -- never a
    drawn 0%/100% bar for a period we can't chart."""

    fiscal_year: int
    fiscal_period: FiscalPeriod
    period_end: str | None = None
    available: bool
    unavailable_reason: str | None = None
    financing_total: float | int | None = None  # LE (reported or derived)
    segments: list[CapitalStructureSegment] = Field(default_factory=list)


class CapitalStructureSeries(BaseModel):
    """The Capital-Structure trend: a company's financing mix across recent periods,
    oldest->newest. Periods missing a required total are carried as explicit gaps, not
    omitted silently. See normalize/viz.py."""

    cik: int
    fiscal_period: FiscalPeriod  # the period type of the series (FY for v1)
    periods: list[CapitalStructurePeriod] = Field(default_factory=list)  # oldest -> newest
    caveats: list[str] = Field(default_factory=list)


class CashFlowBridgeStep(BaseModel):
    """One step of the cash bridge (Beginning -> CFO -> CFI -> CFF -> FX -> residual -> Ending).

    A derived presentation shape over the canonical cash-flow statement -- NOT a new
    measurement. `value` is the magnitude drawn (>= 0); `direction`/`running_total` carry
    the sign and position so the renderer never re-derives a sign. Anchors and flow steps
    carry the provenance of the reported line behind them; a `residual` step ("Other /
    unreconciled") is computed, so it has no source line, and the derived Beginning/Ending
    anchors carry no single reported line either.
    """

    kind: Literal["anchor", "flow", "residual"]
    canonical_concept: str | None = None  # None for residual + derived Beginning/Ending anchors
    label: str
    value: float | int  # magnitude drawn, >= 0
    direction: Literal["base", "up", "down"]
    running_total: float | int
    unit: str
    source_tag: str | None = None  # provenance for section flows; None for residual/anchors
    is_extension: bool | None = None


class CashFlowBridge(BaseModel):
    """The single-period cash bridge. `absolute` = beginning/ending are real reported levels
    on the basis matching the reported change_in_cash tag; when False the walk is 0-anchored
    (relative) and begin/end levels are null (never fabricated). `cash_basis` names which
    basis matched. `basis_note` is set only when the independently reported period-end cash
    disagrees with beginning + reported change beyond tolerance -- surfaced, never rescaled."""

    available: bool
    unavailable_reason: str | None = None
    steps: list[CashFlowBridgeStep] = Field(default_factory=list)
    absolute: bool = False
    beginning_cash: float | int | None = None
    ending_cash: float | int | None = None
    reported_change: float | int | None = None  # the reported change_in_cash value
    cash_basis: str | None = None  # "cash_and_restricted_cash" | "cash_and_equivalents"
    basis_note: str | None = None


class CashFlowViz(BaseModel):
    """Derived presentation view over one company's cash-flow statement for one period: the
    cash bridge. See normalize/viz.py."""

    cik: int
    fiscal_year: int
    fiscal_period: FiscalPeriod
    period_start: str | None = None
    period_end: str | None = None
    form: str | None = None
    filed: str | None = None
    accession: str | None = None
    bridge: CashFlowBridge
    caveats: list[str] = Field(default_factory=list)


class CashFlowSeriesPeriod(BaseModel):
    """One period of the FCF + earnings-quality series. Every monetary field is None when its
    source line is absent (NEVER 0). `free_cash_flow` is None unless BOTH `operating_cash_flow`
    and `capital_expenditures` are present. `cash_conversion` (OCF / Net Income) is None unless
    `net_income` > 0 AND OCF present; `conversion_status` names why ("ok" | "nm" | "na")."""

    fiscal_year: int
    fiscal_period: FiscalPeriod
    period_end: str | None = None
    operating_cash_flow: float | int | None = None
    capital_expenditures: float | int | None = None  # reported positive payment
    free_cash_flow: float | int | None = None  # ocf - capex, else None
    net_income: float | int | None = None  # from the income statement (cross-statement join)
    cash_conversion: float | None = None  # ocf / net_income, else None
    conversion_status: Literal["ok", "nm", "na"] = "na"
    conversion_reason: str | None = None
    unit: str = "USD"


class CashFlowSeries(BaseModel):
    """The FCF-breakdown + earnings-quality series: a company's operating cash flow, capex,
    free cash flow, net income and cash-conversion ratio across recent periods, oldest->newest.
    A missing input is carried as an explicit None (never 0). See normalize/viz.py."""

    cik: int
    fiscal_period: FiscalPeriod  # the period type of the series (FY for v1)
    periods: list[CashFlowSeriesPeriod] = Field(default_factory=list)  # oldest -> newest
    caveats: list[str] = Field(default_factory=list)


class InsiderTransaction(BaseModel):
    """One insider transaction (from Forms 3/4/5). See sec/insider.py."""

    issuer_cik: int
    issuer_name: str | None = None
    owner_name: str | None = None
    owner_relationship: str | None = None  # director / officer / 10% owner / other
    transaction_date: str | None = None
    security_title: str | None = None
    shares: float | None = None
    price_per_share: float | None = None
    acquired_disposed: Literal["A", "D"] | None = None
    ownership_type: Literal["direct", "indirect"] | None = None
    shares_owned_after: float | None = None
    form_type: str | None = None
    accession: str | None = None
    filed: str | None = None
    is_holding: bool = False  # True if this is a holding, not a transaction


class InsiderFilingMeta(NamedTuple):
    """One Form 3/4/5 filing that's been fetched and parsed, independent of how many
    (if any) InsiderTransaction rows it produced -- a filing can legitimately yield zero
    rows (e.g. an initial Form 3 with no reportable holdings at all). Used by
    `storage/insider_repository.py`'s cache to track "how many filings have we cached"
    separately from transaction-row counts. See sec/insider.py.
    """

    accession: str
    filed: str | None
    form_type: str


# --- Institutional ownership (13F) -------------------------------------------------
#
# IMPORTANT: 13F is a *holdings snapshot*, not transactions. A manager reports the
# positions it held at quarter-end. There is no "bought/sold on date X". Buy/sell is
# DERIVED by diffing two consecutive quarterly snapshots (see normalize/flows.py and
# the HoldingDelta model). Keep this distinction visible in the API — never imply
# trade-level data we don't have.


class InstitutionalHolding(BaseModel):
    """One position line from a manager's 13F information table (quarter-end snapshot)."""

    cusip: str  # security identifier used in 13F
    issuer_name: str | None = None  # "nameOfIssuer" as reported
    title_of_class: str | None = None
    value: float | None = None  # reported market value of the position
    shares: float | None = None  # sshPrnamt (shares or principal amount)
    shares_or_principal: Literal["SH", "PRN"] | None = None
    put_call: Literal["Put", "Call"] | None = None  # set for option positions
    investment_discretion: str | None = None  # SOLE / DFND / OTR
    # Sequence numbers into this holding's HoldingsSnapshot.other_managers -- the
    # co-filing manager(s) exercising discretion for THIS specific position (from the
    # infoTable row's own <otherManager> tag). Empty when only the filing manager itself
    # has discretion. See sec/institutional.py.
    other_managers: list[int] = Field(default_factory=list)
    cik: int | None = None  # issuer CIK, if resolved from CUSIP


class OtherManager13F(BaseModel):
    """One co-filing manager on a 13F cover page's `otherManagers2Info` roster.

    `sequence_number` is how individual InstitutionalHolding rows attribute discretion
    for a specific position to one of these managers via their own `other_managers`
    field, instead of (or alongside) the filing manager itself.
    """

    sequence_number: int
    name: str | None = None
    file_number: str | None = None  # the co-manager's own 13F file number, e.g. "28-554"


class HoldingsSnapshot(BaseModel):
    """A single manager's full 13F for one quarter."""

    manager_cik: int
    manager_name: str | None = None
    # Report period is a calendar quarter-end, e.g. "2024-06-30".
    report_period: str
    filed: str | None = None
    accession: str | None = None
    is_amendment: bool = False
    holdings: list[InstitutionalHolding] = Field(default_factory=list)
    # Roster of co-filing managers from the cover page (empty if this manager filed
    # alone). See InstitutionalHolding.other_managers for per-holding attribution.
    other_managers: list[OtherManager13F] = Field(default_factory=list)
    # The filing manager's reported business `stateOrCountry` code from the cover page,
    # stored raw (a US state code, or a country code for a foreign filer; None when the
    # cover page didn't carry it, e.g. a pre-location-column cached snapshot). This is the
    # management entity's registered business address -- NOT capital origin, NOT the
    # issuer's location. Classification (US state / foreign / unknown) happens at the
    # serve/UI edge via normalize.US_STATE_CODES. See sec/institutional.py.
    filing_manager_location: str | None = None


class HoldingDelta(BaseModel):
    """DERIVED change in one manager's position in one security between two quarters.

    Computed by diffing consecutive HoldingsSnapshots — not reported by the SEC.
    """

    manager_cik: int
    manager_name: str | None = None
    cusip: str
    issuer_name: str | None = None
    cik: int | None = None  # issuer CIK if resolved

    from_period: str | None = None  # prior quarter-end ("2024-03-31"); None => new position
    to_period: str  # current quarter-end

    shares_before: float | None = None
    shares_after: float | None = None
    shares_change: float | None = None  # after - before (positive = added)
    # new | added | reduced | exited | unchanged
    action: Literal["new", "added", "reduced", "exited", "unchanged"]


class BeneficialOwnership(BaseModel):
    """A 13D/13G beneficial-ownership position (crossing the 5% threshold).

    13D signals activist intent; 13G is the passive/institutional variant.
    """

    issuer_cik: int | None = None
    issuer_name: str | None = None
    owner_name: str | None = None
    # NOTE: these are the real submissionType/form values used by the SEC's structured-
    # XML Schedule 13D/G filings (confirmed against real filings, 2026-07-05) -- NOT the
    # abbreviated "SC 13D"/"SC 13G" strings, which belong to the legacy HTML/text filings
    # this module deliberately does not parse (see sec/institutional.py's module
    # docstring).
    form_type: (
        Literal["SCHEDULE 13D", "SCHEDULE 13G", "SCHEDULE 13D/A", "SCHEDULE 13G/A"] | None
    ) = None
    percent_of_class: float | None = None
    shares_beneficially_owned: float | None = None
    event_date: str | None = None  # date of the triggering event
    filed: str | None = None
    accession: str | None = None


class BeneficialOwnershipFilingMeta(NamedTuple):
    """One structured-XML Schedule 13D/G filing that's been fetched and parsed,
    independent of how many `BeneficialOwnership` rows it produced. Same rationale as
    `InsiderFilingMeta`: a 13D/G filing is immutable once accepted (an amendment gets its
    own accession, "13D/A"/"13G/A", never rewriting a prior one), so
    `storage/beneficial_ownership_repository.py`'s cache keys off the filing, not
    individual rows. See sec/institutional.py.
    """

    accession: str
    filed: str | None
    form_type: str


class CusipResolutionStats(BaseModel):
    """Coverage snapshot of 13F CUSIP -> issuer CIK resolution (normalize/cusip.py).

    NOT a fixed data-quality ceiling: exact-normalized-match-only resolution means
    `unresolved` holes the "who holds X" view proportional to this rate, but it drifts
    upward over time as a CUSIP unresolved on one attempt matches on a later one (a
    resolved CIK is never re-cleared; see storage/cusip_repository.py).
    """

    resolved: int
    unresolved: int
    total: int
    resolution_rate: float | None = None  # None when total == 0 (nothing attempted yet)


class IssuerHolder(BaseModel):
    """One manager's reported position in one of an issuer's CUSIPs, for one quarter.

    The issuer-centric inverse of `InstitutionalHolding` -- that's "one position line
    from one manager's 13F"; this is "one manager, from the perspective of one issuer,
    across ALL managers" (`storage/holdings_repository.py`'s `holders_of`). A live query
    over the same `holdings` rows, not a new canonical concept.
    """

    manager_cik: int
    manager_name: str | None = None
    cusip: str  # which of the issuer's CUSIPs this row is (multi-class issuers have >1)
    issuer_name: str | None = None
    shares: float | None = None
    value: float | None = None
    other_managers: list[int] = Field(default_factory=list)
    # The holding manager's reported business `stateOrCountry` (raw, from the snapshot's
    # cover page -- see HoldingsSnapshot.filing_manager_location). Carried onto the
    # issuer-centric row so the holder-geography endpoint can bucket holders by location.
    # None for holders whose snapshot predates the location column (an honest "unknown").
    location: str | None = None
    # Carried through so issuer-centric consumers can tell a plain long-equity position from an
    # option or a debt (principal) row: `put_call` is set for option positions (Put/Call), and
    # `shares_or_principal` is "SH" (share count) vs "PRN" (principal amount). The ownership
    # treemap counts only SH-equity (put_call None, not PRN) shares -- an option's "shares" are
    # notional and a PRN amount is debt, neither of which is share ownership.
    put_call: str | None = None
    shares_or_principal: str | None = None


# --- Fundamental metrics (normalize/metrics.py) ------------------------------------
#
# Derived ratios/signals computed over the RawFact/Statement history. Like HoldingDelta,
# these are COMPUTED results, not source-faithful facts -- so every value carries its own
# honesty metadata: a status (ok/approximate/na/nm), the basis it was computed on, and a
# reason when it's anything but a clean number. See docs/ROADMAP_METRICS.md (rules R1-R10).

MetricStatus = Literal["ok", "approximate", "na", "nm"]
# TTM = trailing twelve months (flows); as-of = point-in-time (stocks). See R2.
MetricBasis = Literal["TTM", "as-of"]
# Which restatement version each period's inputs came from. as-restated = latest-filed
# wins (matches build_statement); as-originally-reported = as known when first filed. See R9.
RestatementBasis = Literal["as-restated", "as-originally-reported"]


class MetricPoint(BaseModel):
    """One point in a metric's intra-fiscal-year quarterly trend (see MetricValue.trend)."""

    period: FiscalPeriod  # Q1..Q4
    period_end: str | None = None
    value: float | None = None  # None when this quarter's status is na/nm
    status: MetricStatus = "ok"


class MetricValue(BaseModel):
    """One fundamental metric for one company + fiscal period (a computed result).

    `value` is None whenever `status` is `na` or `nm` -- never a fabricated 0 or a
    misleading number (see docs/STYLE_GUIDE.md §7 and ROADMAP_METRICS R7/R8). `approximate`
    still carries a usable `value`, flagged (e.g. R5 debt-split undercount).
    """

    metric: str  # stable key, e.g. "gross_margin"
    label: str  # human label, e.g. "Gross Margin"
    value: float | None
    unit: str  # unit family: "ratio" | "USD" | "USD/shares" | "shares" | "days"

    fiscal_year: int
    fiscal_period: FiscalPeriod
    period_end: str | None = None

    basis: MetricBasis
    restatement_basis: RestatementBasis = "as-restated"
    as_of: str | None = None  # filing date the value is current as of (provenance / R1)

    status: MetricStatus = "ok"
    reason: str | None = None  # reason code / human reason for approximate/na/nm

    # For an FY response only: this metric across the fiscal year's quarters (Q1..Q4), for a
    # sparkline. Empty for quarterly requests. Flow metrics are TTM at each quarter-end, so the
    # last point equals the annual value; stock metrics are the quarter-end level.
    trend: list[MetricPoint] = Field(default_factory=list)


class CompanyMetrics(BaseModel):
    """The full point-in-time metric set for one company + fiscal period."""

    cik: int
    fiscal_year: int
    fiscal_period: FiscalPeriod
    metrics: list[MetricValue] = Field(default_factory=list)


# --- Peer comparison & ranking (Phase 2, analytical/peer_ranks.py) ------------------
#
# Peer-relative position of one company's metrics within its SIC industry group, for one
# period. PRECOMPUTED by the analytical batch and read as a point lookup on the serving
# path (never computed live). Percentile is *position*, not a good/bad verdict (STYLE_GUIDE
# §9.2) -- for some metrics higher is "worse" (e.g. debt_to_equity); the UI stays descriptive.


class PeerRank(BaseModel):
    """One metric's peer-relative rank for a company (within its SIC group, one period)."""

    metric: str
    label: str
    unit: str
    peer_group: str  # the SIC prefix ranked within, e.g. "35"
    peer_count: int  # companies in the group with a comparable (non-N/A) value
    percentile: float  # 0..100 position in the peer distribution (descriptive, not a verdict)
    z_score: float  # (value - peer mean) / peer stddev


class CompanyPeerRanks(BaseModel):
    """A company's peer ranks for one period (empty `peers` when no group met the min size)."""

    cik: int
    fiscal_year: int
    fiscal_period: FiscalPeriod
    peer_basis: str  # e.g. "SIC 2-digit"
    caveats: list[str] = Field(default_factory=list)
    peers: list[PeerRank] = Field(default_factory=list)


class PeerDistribution(BaseModel):
    """The peer group's value spread for one metric/period, plus this company's own value.

    PRECOMPUTED by `analytical/peer_distribution.py` (same batch family as peer ranks) --
    a five-number summary (min/p25/median/p75/max), never a live DuckDB read.
    """

    metric: str
    label: str
    unit: str
    peer_group: str  # the SIC prefix the distribution was computed within, e.g. "35"
    peer_count: int  # companies in the group with a comparable (non-N/A) value
    min: float
    p25: float
    median: float
    p75: float
    max: float
    company_value: float | None = None  # this company's own value; None if N/A for this period


class CompanyPeerDistribution(BaseModel):
    """One metric's peer distribution for one company + period.

    `distribution` is None when this company's SIC group never met the minimum peer-group
    size for this metric/period -- a valid, honest result, not an error.
    """

    cik: int
    fiscal_year: int
    fiscal_period: FiscalPeriod
    peer_basis: str  # e.g. "SIC 2-digit"
    caveats: list[str] = Field(default_factory=list)
    distribution: PeerDistribution | None = None


# --- Sector-aggregate DuPont (Sector Analytics D1, analytical/sector_dupont.py) ------
#
# One SIC group's ASSET-WEIGHTED DuPont decomposition for one period. roe is SigmaNI/SigmaEquity
# and equals net_margin x asset_turnover x equity_multiplier by construction -- an aggregate, NOT
# a median or mean of company ratios. PRECOMPUTED by the batch; never a live DuckDB read.


class SectorDupont(BaseModel):
    """One sector's asset-weighted DuPont aggregate for one period."""

    group: str  # the SIC prefix aggregated within, e.g. "35"
    group_label: str  # readable SIC major-group name (falls back to the bare code)
    fiscal_year: int
    fiscal_period: FiscalPeriod
    period_end: str  # representative (max) period-end in the group for this fiscal period
    peer_count: int  # companies contributing every DuPont leg (N/A on any leg -> excluded)
    net_margin: float  # SigmaNI / SigmaRev
    asset_turnover: float  # SigmaRev / SigmaAssets
    equity_multiplier: float  # SigmaAssets / SigmaEquity
    roe: float  # SigmaNI / SigmaEquity (== the product of the three)
    sum_net_income: float  # kept for auditability of the aggregate
    sum_revenue: float
    sum_avg_assets: float
    sum_avg_equity: float


_SECTOR_AGGREGATION = (
    "asset-weighted sector aggregate "
    "(ΣNI/ΣRev × ΣRev/ΣAssets × ΣAssets/ΣEquity) -- not a median"
)


class SectorList(BaseModel):
    """Every qualifying sector's DuPont aggregate for one period (the overview grid).

    Empty `sectors` is a valid, honest result: no SIC group met the minimum size, or nothing has
    been materialized yet (`caveats` spells this out)."""

    fiscal_year: int
    fiscal_period: FiscalPeriod
    peer_basis: str  # e.g. "SIC 2-digit"
    aggregation: str = _SECTOR_AGGREGATION
    caveats: list[str] = Field(default_factory=list)
    sectors: list[SectorDupont] = Field(default_factory=list)


class SectorSeries(BaseModel):
    """One sector's DuPont aggregate across every materialized period (the trend).

    Empty `points` is a valid, honest result (the group never met the minimum size, or isn't
    materialized yet)."""

    group: str
    group_label: str
    peer_basis: str  # e.g. "SIC 2-digit"
    aggregation: str = _SECTOR_AGGREGATION
    caveats: list[str] = Field(default_factory=list)
    points: list[SectorDupont] = Field(default_factory=list)


# --- Metric history & trend signals (Phase 1b, normalize/metrics.py) ----------------
#
# One metric run across a company's whole history (Tier 1: the series) plus derived
# trend signals over it (Tier 2). Governed by R9/R10 (docs/ROADMAP_METRICS.md): the whole
# series shares ONE labeled restatement basis (as-restated -- latest-filed throughout),
# every point independently satisfies R1, and na/nm periods are GAPS (value None), never
# interpolated. Each point carries its calendar period_end so a future multi-company
# overlay can align on it (R10).

MetricFrequency = Literal["quarterly", "annual"]


class MetricSeriesPoint(BaseModel):
    """One period's value of a single metric in its history series.

    `value` is None whenever `status` is na/nm -- a gap, honestly broken, never a fabricated
    number or an interpolation across it (R9).
    """

    fiscal_year: int
    fiscal_period: FiscalPeriod
    period_end: str | None = None
    value: float | None = None
    status: MetricStatus = "ok"
    reason: str | None = None
    as_of: str | None = None  # filing date this point is current as of (R1 provenance)


class TrendSignal(BaseModel):
    """A derived Tier-2 signal over a metric's series (CAGR, streak, etc.).

    A computed result like MetricValue -- carries its own status/reason; insufficient
    history to cover the window is `nm`/`na`, never a fabricated number.
    """

    key: str  # stable key, e.g. "cagr", "expansion", "streak", "distance_from_peak"
    label: str
    value: float | None
    unit: str  # "ratio" | "USD" | "USD/shares" | "shares" | "days" | "count"
    status: MetricStatus = "ok"
    reason: str | None = None
    window: int | None = None  # number of series points the signal considered


class MetricHistory(BaseModel):
    """One metric's full history for one company (Tier 1 series + Tier 2 signals)."""

    cik: int
    metric: str
    label: str
    unit: str
    basis: MetricBasis
    restatement_basis: RestatementBasis = "as-restated"
    frequency: MetricFrequency = "quarterly"
    points: list[MetricSeriesPoint] = Field(default_factory=list)
    signals: list[TrendSignal] = Field(default_factory=list)

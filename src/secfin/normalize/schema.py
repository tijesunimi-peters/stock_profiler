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


class CompanyProfileInfo(BaseModel):
    """A company's filer identity: name + SIC industry assignment, as EDGAR assigns them.

    The cover-page fields come from `/submissions/`, NOT from companyfacts -- verified 2026-08-02
    that a companyfacts payload carries exactly two `dei` tags, so incorporation state, filer
    status and the rest are structurally absent from it. That was the reasoning behind this model
    being name+SIC only (V3-P4); it was right about companyfacts and wrong about the submissions
    payload, which we already download and which carries them plainly.

    Three fields a reader might still expect are NOT here, and each for a different reason:

    * **NAICS** -- the SEC assigns SIC, not NAICS. Not in `/submissions/` and not in the DERA
      datasets either (checked). Deriving one from SIC would present our mapping as the filer's.
    * **Employees** -- `EntityNumberOfEmployees` is a real tag used by roughly one filer in nine
      thousand. Effectively nobody reports it, so a field would be null almost always.
    * **Auditor** -- `dei:AuditorName` IS tagged, but only inside the 10-K's inline-XBRL instance,
      which is a document fetch this endpoint does not do. It stays out until that path exists.

    Every field is nullable: a company we have facts for but no ingested profile row is a valid
    200 with nulls (the same convention /peers uses for an unranked company), NOT a 404. An
    unknown *ticker* is still the 404.
    """

    cik: int
    name: str | None = None
    sic: str | None = None
    sic_description: str | None = None
    #: EDGAR's two-letter code. "CA" is California for a US incorporation; for a foreign one it is
    #: a country code. We serve it raw rather than expanding it, because the same two letters mean
    #: different things in the two cases and a wrong expansion is worse than a code.
    state_of_incorporation: str | None = None
    hq_city: str | None = None
    hq_state: str | None = None
    #: MMDD as EDGAR writes it -- "0926" is 26 September. Raw, so the caller formats it and the
    #: ordering survives.
    fiscal_year_end: str | None = None
    #: EDGAR's own vocabulary: "Large accelerated filer", "Non-accelerated filer", ...
    filer_category: str | None = None
    ein: str | None = None
    #: Comma-joined listing venues, e.g. "Nasdaq".
    exchanges: str | None = None
    #: Oldest filing EDGAR holds, read from the FULL history (`filings.files`), not the rolling
    #: recent window -- which for a prolific filer covers about a year and would badly understate
    #: how long the company has been filing.
    first_filing_date: str | None = None
    source: str = "SEC EDGAR filer index (SIC assignment)"


class CondensedStatementColumn(BaseModel):
    """One period column of a condensed statement, with the filing it came from."""

    fiscal_year: int
    fiscal_period: FiscalPeriod
    period_end: str | None = None
    form: str | None = None
    filed: str | None = None
    accession: str | None = None


class CondensedStatementRow(BaseModel):
    """One canonical line across every column of a condensed statement.

    `values` is positionally aligned to `CondensedStatement.columns`. **A `None` means that
    period did not report this line.** It is never 0, never dropped, and never carried forward
    from an adjacent period -- rendering an absent line as 0 is the exact failure the honesty
    rules exist to prevent (STYLE_GUIDE section 7).
    """

    canonical_concept: str
    label: str
    unit: str
    values: list[float | int | None] = Field(default_factory=list)
    unit_mixed: bool = False  # the concept's unit differs across columns; `unit` is the newest


class CondensedStatement(BaseModel):
    """One statement across several periods side by side -- the multi-period read behind the
    company Overview's condensed-statements card (V3-P4).

    A re-shaping of the SAME normalized statements /statements/{statement} serves, not a new
    measurement: one facts read, N build_statement calls, columns oldest->newest. An empty
    result is a valid 200 (an honest "nothing to condense"), not an error.
    """

    cik: int
    statement: StatementType
    period_type: FiscalPeriod  # the period type the columns share (FY, Q1, ...)
    columns: list[CondensedStatementColumn] = Field(default_factory=list)  # oldest -> newest
    rows: list[CondensedStatementRow] = Field(default_factory=list)


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
    # A DISPLAY string, joined with ", " from the four role elements below -- e.g.
    # "director, officer (Chief Executive Officer), 10% owner". Do NOT parse it: a title is free
    # text and frequently contains the same ", " used as the separator ("officer (CEO, Acting CFO,
    # Chairman)"), which makes a split wrong on 35% of the paren-bearing values in our own store.
    # The structured fields below carry what a caller should actually branch on.
    owner_relationship: str | None = None  # director / officer / 10% owner / other
    # The role boxes from the ownership XML (`isDirector`, `isOfficer`, `officerTitle`,
    # `isTenPercentOwner`), unjoined. Added 2026-08-04 for §05.1, which has to FILTER on role --
    # a 10% owner crossing a threshold files the same Form 3 as an incoming CFO and is not a
    # personnel change.
    #
    # `None` means UNKNOWN, not "no": rows cached before these columns existed carry no value,
    # and defaulting them to False would assert "not an officer" about rows nobody classified.
    # Same rule as `is_derivative` and `rule_10b5_1` below.
    # Raw `officerTitle`. "See Remarks" is an EDGAR convention, not a job title.
    officer_title: str | None = None
    is_director: bool | None = None
    is_officer: bool | None = None
    is_ten_percent_owner: bool | None = None
    transaction_date: str | None = None
    security_title: str | None = None
    shares: float | None = None
    price_per_share: float | None = None
    acquired_disposed: Literal["A", "D"] | None = None
    # Raw SEC transaction code (P=open-market buy, S=open-market sale, M=option exercise,
    # A=grant/award, G=gift, F=tax withholding, ...). Kept a free str, not a Literal: the code
    # set is open-ended and we never want to drop an unknown code on parse. None for holdings.
    transaction_code: str | None = None
    ownership_type: Literal["direct", "indirect"] | None = None
    shares_owned_after: float | None = None
    form_type: str | None = None
    accession: str | None = None
    filed: str | None = None
    is_holding: bool = False  # True if this is a holding, not a transaction
    # True when the row came from the ownership form's DERIVATIVE table (options, RSUs,
    # warrants, convertibles) rather than its non-derivative table. Not a nuance: a derivative
    # row's `shares` and `shares_owned_after` are the UNDERLYING share count of an instrument
    # that is not owned stock, so anything summing insider ownership must exclude them or it
    # reports options as shares. The distinction is in the XML (which table the row sits in) --
    # it was simply being discarded on parse until 2026-08-01.
    #
    # `None` means UNKNOWN, not "no": rows cached before the column existed have no flag, and
    # defaulting those to False would quietly readmit exactly the option rows this field exists
    # to keep out. A consumer summing ownership must drop `None` and report the coverage gap.
    is_derivative: bool | None = None
    # The Form 4 cover box "Check this box to indicate that a transaction was made pursuant to a
    # contract, instruction or written plan meeting the conditions of Rule 10b5-1(c)" -- the
    # filer's own declaration that the trade was PRE-ARRANGED rather than discretionary. A
    # structured element (`aff10b5One`) in the ownership XML we already download; it was simply
    # being discarded on parse until 2026-08-01.
    #
    # It matters because a planned sale and a discretionary sale are different events, and
    # showing them alike invites reading a scheduled disposal as a decision taken now.
    #
    # `None` means UNKNOWN, not "no": pre-2022 filings predate the box, and rows cached before
    # this column existed carry no value. Defaulting those to False would report "discretionary"
    # about trades nobody classified.
    rule_10b5_1: bool | None = None


class InsiderOwnerRole(NamedTuple):
    """One (person, role) pairing an issuer's Section 16 filers reported, and when.

    A read model over `insider_transactions`, grouped so a person who filed forty Form 4s under
    the same title is one span rather than forty rows. Two spans for the same person means the
    filer restated their own role between filings -- which is the only structured promotion or
    board-appointment signal we have.
    """

    owner_name: str
    relationship: str | None
    officer_title: str | None
    is_officer: bool | None
    is_director: bool | None
    first_filed: str | None
    last_filed: str | None


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


class OfficerChange(BaseModel):
    """One officer-or-director change signal. See normalize/officer_changes.py.

    Two kinds, from two sources, and neither is convertible into the other:

    * `arrival` -- a Form 3, the initial statement of beneficial ownership, filed within 10 days
      of becoming an officer or director. Carries the person and the role. Says nothing about
      departures, which require no filing at all.
    * `event` -- an 8-K carrying Item 5.02. Carries the date and nothing else: EDGAR's item code
      has no sub-item letter, so departure, election, appointment and compensatory arrangement
      are indistinguishable, and which one it was is in the narrative (Track 2).

    There is deliberately no `action` field. "Appointed" / "resigned" / "retired" is prose in
    every source we hold, and a guess dressed as a verb is the failure this whole card avoids.
    """

    kind: Literal["arrival", "role_change", "event"]
    person: str | None = None  # None on an `event` -- the 8-K index carries no names
    role: str | None = None  # None on an `event`
    # `role_change` only: the role boxes the person reported BEFORE this filing. A checkbox
    # transition (officer -> officer and director), never a re-reading of the title text --
    # 2,340 people restate a title cosmetically ("Chief Operating Officer" -> "Chief Operating
    # Off."), and calling that a promotion would be our guess about their abbreviation.
    previous_role: str | None = None
    # False when the filer ticked the officer box but stated no title (or wrote EDGAR's "See
    # Remarks" convention). The role then names the box, and a caller must not present it as a
    # job title.
    role_is_stated_title: bool = True
    source: str | None = None  # "Form 3" | "8-K Item 5.02"
    date: str | None = None  # filing date
    accession: str | None = None
    relationship: str | None = None  # the full display string, for a tooltip


class RosterMember(BaseModel):
    """One current Section 16 officer or director, with the role they LAST reported themselves.

    Not a board list and not a management list -- it is who has filed an ownership form inside
    the window we hold, which is a proxy for both and identical to neither. Someone who has not
    traded recently is absent; a person is never inferred to have left.
    """

    person: str
    role: str | None = None
    role_is_stated_title: bool = True
    is_officer: bool = False
    is_director: bool = False
    last_filed: str | None = None

    # What changed for this person since the comparison date, if anything.
    #
    # `new` -- they filed a Form 3, which Section 16 requires within 10 days of becoming an
    # insider. That makes it the filer's own arrival signal rather than "first time we saw them",
    # which would be a fact about our cache: someone who has been a director for a decade and
    # only just traded would otherwise be marked new.
    #
    # `role_change` -- a role box turned ON. Never off; see `_gained_a_box`.
    #
    # There is no `departed`. Nothing is filed on leaving, so it cannot be marked, and a person
    # dropping out of the window means they stopped filing, not that they stepped down.
    change: Literal["new", "role_change"] | None = None
    change_date: str | None = None
    previous_role: str | None = None  # `role_change` only


class OfficerChanges(BaseModel):
    """Form 3 arrivals and 8-K Item 5.02 events for one company, interleaved by date.

    Interleaved, never joined: a Form 3 and an Item 5.02 filed the same day are almost certainly
    the same appointment, but neither filing references the other, so the correspondence is left
    for a reader to see rather than asserted here.
    """

    cik: int
    changes: list[OfficerChange] = Field(default_factory=list)
    arrival_count: int = 0  # arrivals found, before the display cap
    role_change_count: int = 0
    event_count: int = 0

    # Who the officers and directors ARE, per their most recent filing -- a different question
    # from who arrived, and the one the filings answer best. `roster_total` is the full count;
    # `roster` is capped for display. `roster_filings` is how many filings that reading rests on,
    # because completeness tracks it: Apple's 16 people come from a window that covers its whole
    # Section 16 population, JPMorgan's 9 do not.
    roster: list[RosterMember] = Field(default_factory=list)
    roster_total: int = 0
    roster_filings: int = 0

    # The comparison date the roster's change marks are measured against -- the previous calendar
    # quarter end by default. Stated rather than implied: "who changed" is meaningless without it.
    since: str | None = None
    changed_count: int = 0
    # 8-K Item 5.02 filings after `since`. They report a change but name nobody, so they cannot
    # become a mark on a person -- they are counted alongside the roster instead of dropped.
    events_since: int = 0

    # Whether this company's 8-K index exists at all. Without it, "no Item 5.02" is not a
    # finding -- it means the event half was never looked at.
    index_built: bool = False
    indexed_filings: int = 0
    covered_from: str | None = None
    covered_to: str | None = None

    # Form 3 filers deliberately left out: 10% owners crossing a threshold, and the `other` box.
    # Reported so the exclusion is visible rather than silent.
    arrivals_excluded: int = 0
    # Rows cached before the role columns existed -- UNKNOWN, not "neither".
    arrivals_unclassified: int = 0

    status: Literal["ok", "na"] = "ok"
    reason: str | None = None


class InsiderSummaryRow(BaseModel):
    """One counted transaction, flattened for display. See InsiderSummary."""

    owner_name: str | None = None
    owner_relationship: str | None = None
    transaction_date: str | None = None
    security_title: str | None = None
    shares: float | None = None
    acquired_disposed: Literal["A", "D"] | None = None
    transaction_code: str | None = None
    # Plain-language readings of `transaction_code` from the Form 4 legend (TRANSACTION_CODES
    # in normalize/insider_summary.py): `code_short` fits a table cell, `code_label` is the
    # legend's full meaning. Both are None for a code the SEC has not defined -- an unknown
    # code is carried through, never dropped and never guessed at.
    code_short: str | None = None
    code_label: str | None = None
    rule_10b5_1: bool | None = None
    form_type: str | None = None
    accession: str | None = None


class InsiderSummary(BaseModel):
    """DERIVED Section 16 activity summary over the Form 3/4/5 filings we read.

    Every count here is computed by tallying rows -- the SEC reports no such summary. Three
    exclusions make the tally mean what it says, and each is reported rather than assumed:

    * **Holdings rows are not transactions.** A Form 3, and the "shares owned following" line
      of a Form 4, state a balance. They carry no code and are excluded.
    * **Derivative rows double-count.** An option exercise files two rows -- the derivative
      disposed and the underlying stock acquired. Counting both reports one event twice, and
      the derivative row's `shares` is the underlying count of an instrument that is not owned
      stock. Excluded (`derivative_excluded`); rows whose flag is UNKNOWN are excluded too and
      counted separately (`derivative_unknown`), because assuming "not a derivative" would
      readmit exactly the rows the exclusion exists to keep out.
    * **The window is filings, not days.** `filings` bounds what was read; `window_start` /
      `window_end` report the span those filings actually cover. It is six days for one filer
      and eight months for another -- so the span is stated, never assumed to be recent.

    `acquisitions` / `dispositions` are the A/D flag and nothing more: they count option
    exercises, vesting and tax withholding alongside decisions. `open_market_purchases` /
    `open_market_sales` are the codes P and S -- the subset that is a decision to trade, and
    the same filter analytical/sector_insider_flow uses.
    """

    cik: int
    filings: int = 0  # Form 3/4/5 filings read
    transactions: int = 0  # non-derivative transaction rows counted
    window_start: str | None = None  # earliest counted transaction date
    window_end: str | None = None  # latest counted transaction date

    acquisitions: int = 0  # A flag, all codes
    dispositions: int = 0  # D flag, all codes
    net: int = 0  # acquisitions - dispositions
    direction: Literal["net acquisitions", "net dispositions", "balanced"] = "balanced"

    open_market_purchases: int = 0  # code P
    open_market_sales: int = 0  # code S

    # The Form 4 cover box, tallied. `plan_known` is the denominator: pre-2022 filings predate
    # the box, so a bare "N under a plan" would imply the rest were discretionary when nobody
    # classified them. It reports a trade was made UNDER a plan -- never the plan's adoption
    # date, so no cooling-off window can be drawn from it.
    plan_flagged: int = 0
    plan_known: int = 0

    holdings_excluded: int = 0
    derivative_excluded: int = 0
    derivative_unknown: int = 0

    recent: list[InsiderSummaryRow] = Field(default_factory=list)

    status: Literal["ok", "na"] = "ok"
    reason: str | None = None


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
    # The cover page's "TYPE OF REPORTING PERSON" box -- the filer's OWN declaration of what
    # kind of entity it is, from the SEC's fixed code set (see TYPE_OF_REPORTING_PERSON below).
    # Present on both 13D and 13G, one per reporting person.
    #
    # NOTE this is NOT Schedule 13G's Item 3, which carries the same code but only when the 13G
    # was filed under Rule 13d-1(b) (the qualified-institution route) -- a 13d-1(c) passive filer
    # marks Item 3 not-applicable. And Schedule 13D's Item 3 is an entirely different item
    # ("Source and Amount of Funds"), free prose, which is Track 2 and deliberately not parsed.
    # The cover-page box is the field that exists on every structured 13D/G, so it is the one
    # we carry.
    type_of_reporting_person: str | None = None
    event_date: str | None = None  # date of the triggering event
    filed: str | None = None
    accession: str | None = None


"""The SEC's fixed code set for the cover-page "TYPE OF REPORTING PERSON" box on Schedules
13D and 13G. This is the ONLY entity self-classification available anywhere in the ownership
forms we ingest -- Form 13F has no strategy, style or type field of any kind, and inferring one
from a manager's name would be our label presented as theirs.

Filers pick their own code, so it is a disclosure rather than a judgment, and it is exactly as
reliable as the filer chose to be. `OO` ("other") is a real answer and a common one.
"""
TYPE_OF_REPORTING_PERSON: dict[str, str] = {
    "BD": "Broker-dealer",
    "BK": "Bank",
    "IC": "Insurance company",
    "IV": "Investment company",
    "IA": "Investment adviser",
    "EP": "Employee benefit plan",
    "HC": "Parent holding company",
    "SA": "Savings association",
    "CP": "Church plan",
    "CO": "Corporation",
    "PN": "Partnership",
    "IN": "Individual",
    "OO": "Other",
}


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
    # The date the holding manager's 13F-HR for this quarter was filed (from the snapshot --
    # see HoldingsSnapshot.filed), carried onto the issuer-centric row the same way `location`
    # above is. An issuer's register is assembled from MANY managers who file on DIFFERENT
    # days, so consumers aggregate this into a RANGE (earliest..latest) -- there is no single
    # "the register was filed on" date, and presenting one would imply a single filing produced
    # the register. None for rows whose snapshot has no filed date (an honest "unknown", never
    # backfilled with today).
    filed: str | None = None
    # Whether the 13F-HR this row came from was an amendment (13F-HR/A). Carried for the same
    # reason as `filed`: the register's freshness strip reports how many of a quarter's ingested
    # filings were amendments, and an amendment restates a quarter that was already filed.
    is_amendment: bool = False


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


# --- Sector asset-lifecycle trend (Sector Analytics D5, analytical/sector_lifecycle.py) ----------
#
# Aggregate DIO/DSO/DPO/CCC per (SIC group, period) -- a RATIO OF SUMMED DOLLARS across the sector,
# NOT a median of company figures. PRECOMPUTED by the sector-lifecycle batch, never a live DuckDB
# read. A DESCRIPTIVE read of a sector's working-capital STRUCTURE (how long cash sits in inventory
# + receivables vs. how long suppliers finance it), NOT a timing signal or edge. Every company in a
# point contributed all five legs, so ccc == dio + dso - dpo by construction; a period with no
# qualifying group is OMITTED, never emitted as a zero.

_LIFECYCLE_AGGREGATION = (
    "aggregate days-metrics -- Σinventory/Σcost_of_revenue × 365 (DIO), "
    "Σreceivables/Σrevenue × 365 (DSO), Σpayables/Σcost_of_revenue × 365 (DPO), "
    "CCC = DIO + DSO − DPO -- a ratio of summed dollars, not a median"
)


class SectorLifecyclePoint(BaseModel):
    """One sector's aggregate asset-lifecycle days-metrics for one period (a point on the trend)."""

    group: str  # the SIC prefix aggregated within, e.g. "35"
    group_label: str  # readable SIC major-group name (falls back to the bare code)
    fiscal_year: int
    fiscal_period: FiscalPeriod
    period_end: str  # representative (max) period-end in the group for this fiscal period
    peer_count: int  # companies contributing all five legs (N/A on any leg -> excluded)
    approximate: bool  # at least one contributing company reported only a period-end balance
    dio: float  # ΣInventory / ΣCostOfRevenue × 365
    dpo: float  # ΣAccountsPayable / ΣCostOfRevenue × 365
    dso: float  # ΣAccountsReceivable / ΣRevenue × 365
    ccc: float  # dio + dso − dpo (exact on the shared company set)


class SectorLifecycleSeries(BaseModel):
    """One sector's asset-lifecycle aggregate across every materialized FY period (the trend).

    Empty `points` is a valid, honest result (the group never met the minimum size for all five
    legs, or isn't materialized yet). A missing fiscal year is simply absent -- the client breaks
    the line on the gap, never interpolates and never draws a zero."""

    group: str
    group_label: str
    peer_basis: str  # e.g. "SIC 2-digit"
    aggregation: str = _LIFECYCLE_AGGREGATION
    caveats: list[str] = Field(default_factory=list)
    points: list[SectorLifecyclePoint] = Field(default_factory=list)


# --- Sector liquidity/solvency spreads (Sector Analytics D3, analytical/peer_distribution.py) ---
#
# Five-number summaries (min/p25/median/p75/max) of a metric's DISTRIBUTION within a SIC group --
# for box-and-whisker views on the sector page. PRECOMPUTED by the peer-distribution batch (the
# same rows the company-anchored /peers/{metric}/distribution endpoint reads), never a live DuckDB
# read. A spread is a POSITION/dispersion, NOT a good/bad verdict; N/A companies are excluded from
# the summary, never counted as a low value; a missing box is an honest empty state, never a 0.


class SectorSpread(BaseModel):
    """One SIC group's five-number summary for one metric -- a single cross-sector box."""

    group: str  # the SIC prefix the distribution was computed within, e.g. "35"
    group_label: str  # readable SIC major-group name (falls back to the bare code)
    peer_count: int  # companies in the group with a comparable (non-N/A) value
    min: float
    p25: float
    median: float
    p75: float
    max: float


class SectorSpreadList(BaseModel):
    """Cross-sector: every qualifying sector's box for ONE liquidity/solvency metric + period.

    Empty `spreads` is a valid, honest result: no SIC group met the minimum size for this
    metric/period, or nothing has been materialized yet (`caveats` spells this out)."""

    metric: str
    label: str
    unit: str
    fiscal_year: int
    fiscal_period: FiscalPeriod
    peer_basis: str  # e.g. "SIC 2-digit"
    caveats: list[str] = Field(default_factory=list)
    spreads: list[SectorSpread] = Field(default_factory=list)


class MetricSpread(BaseModel):
    """One metric's five-number summary for one sector -- a single box in the per-sector panel."""

    metric: str
    label: str
    unit: str
    peer_count: int
    min: float
    p25: float
    median: float
    p75: float
    max: float


class SectorSpreadProfile(BaseModel):
    """Per-sector: the liquidity/solvency box set for ONE SIC group + period.

    Empty `metrics` is a valid, honest result (the group never met the minimum size for any of
    these metrics, or isn't materialized yet)."""

    group: str
    group_label: str
    fiscal_year: int
    fiscal_period: FiscalPeriod
    peer_basis: str  # e.g. "SIC 2-digit"
    caveats: list[str] = Field(default_factory=list)
    metrics: list[MetricSpread] = Field(default_factory=list)


# --- Composite sector theme scores (sector-overview redesign Phase 0) -----------------
# (analytical/sector_theme_scores.py)
#
# A 0-100 composite health score per (SIC group, period) for each of five backable THEMES, plus the
# cross-sector rank/percentile that give a single sector context, the prior-FY trend delta, and the
# score DECOMPOSITION (guide 00 §9a). Scores are POSITIONS vs other sectors, not good/bad verdicts:
# each is the equal-weight mean of its constituents' z-scored, favorability-ORIENTED per-sector
# medians, mapped 50 + 15*z clamped [0, 100] (50 = cross-sector average). N/A is never a low value:
# an unavailable constituent is excluded from the average and absent from the decomposition, and a
# theme with too few constituents is absent for that sector. The two themes we cannot honestly score
# yet (accounting quality, structure & activity) are surfaced as scored:false markers, never a 0.


class ThemeConstituent(BaseModel):
    """One metric's contribution to a theme score (decomposition, guide 00 §9a)."""

    metric: str
    label: str
    higher_is_better: bool  # orientation (drives the sign of oriented_z), NOT a color
    median: float  # the sector median that fed the z-score
    oriented_z: float  # signed so a higher value is always more favorable


class SectorThemeScore(BaseModel):
    """One theme's composite for one sector. When `scored` is False (a deferred theme) the numeric
    fields are None and `reason` explains why -- never a fabricated 0."""

    theme: str  # a THEMES / DEFERRED_THEMES key, e.g. "profitability"
    theme_label: str
    scored: bool
    score: int | None = None  # 0-100, 50 = cross-sector average
    percentile: float | None = None  # position of this sector vs all scored sectors on the theme
    rank: int | None = None  # 1 = most favorable
    rank_of: int | None = None  # scored sectors for this theme+period
    delta_vs_prior_fy: float | None = None  # score change vs prior FY; None if no prior
    constituents: list[ThemeConstituent] = Field(default_factory=list)
    reason: str | None = None  # set only when scored is False


class SectorThemeScores(BaseModel):
    """One sector and its ordered theme list (five scored, then the two deferred markers)."""

    group: str  # the SIC prefix scored within, e.g. "35"
    group_label: str  # readable SIC major-group name (falls back to the bare code)
    themes: list[SectorThemeScore] = Field(default_factory=list)


class SectorThemeScoreList(BaseModel):
    """Every scored sector's theme scores for one period (the scorecard's data source).

    Empty `sectors` is a valid, honest result: nothing has been materialized yet, or no sector met
    the constituent thresholds (`caveats` spells this out)."""

    fiscal_year: int
    fiscal_period: FiscalPeriod
    peer_basis: str  # e.g. "SIC 2-digit"
    normalization: str  # one-line statement of how the 0-100 score is built (guide 00 §9a)
    caveats: list[str] = Field(default_factory=list)
    sectors: list[SectorThemeScores] = Field(default_factory=list)


# --- Sector insider flow (Sector Analytics v2, P6a) -------------------------------------------
#
# A trailing-window OPEN-MARKET net buy/sell for one SIC group, a DERIVED aggregate summing
# individual companies' REPORTED Forms 3/4/5 transactions (P=buy, S=sell only). NOT a 13F snapshot
# diff -- so it carries reporting-lag + coverage caveats, never the 13F long-only/45-day caveat.
# `has_data=False` (net/buys/sells None) is an honest N/A, never a fabricated zero net-flow.


class InsiderFlowWindow(BaseModel):
    """The trailing window a sector flow was computed over."""

    days: int  # window length
    start: str | None = None  # as_of - days (None when has_data is False)
    end: str | None = None  # == as_of (None when has_data is False)
    label: str  # human label, e.g. "last 90 days"


class SectorInsiderFlow(BaseModel):
    """One SIC group's trailing-window open-market insider net buy/sell.

    Empty (`has_data=False`, net/buys/sells None) is a valid, honest result: the group has no
    in-window open-market activity ingested yet -- rendered as N/A, never a zero."""

    group: str  # SIC prefix, e.g. "35"
    group_label: str
    peer_basis: str  # e.g. "SIC 2-digit"
    as_of: str | None = None  # window anchor date, None when has_data is False
    window: InsiderFlowWindow
    unit: str = "USD"
    net: float | None = None  # buys - sells, None when has_data is False
    buys: float | None = None
    sells: float | None = None
    buy_count: int = 0
    sell_count: int = 0
    transaction_count: int = 0  # buy_count + sell_count
    filer_count: int = 0  # distinct reporting owners
    company_count: int = 0  # distinct issuers contributing
    excluded_no_price_count: int = 0  # in-window P/S rows dropped from the sums for missing price
    has_data: bool = False
    derived: bool = True  # always True -- a derived aggregate rollup, labeled as such
    caveats: list[str] = Field(default_factory=list)


# --- Sector geographic revenue mix (Sector Analytics v2, P6b) ----------------------------------
#
# A revenue-weighted domestic / international / other split for one SIC group, DERIVED by summing
# individual companies' reported ASC 280 geographic revenue (a NEW dimensional-XBRL source, not
# companyfacts). The domestic/international bucketing is a documented normalization of inconsistent
# filer geography labels (normalize/segment_geography.py), not a filer-reported field. `other`
# (unclassifiable / residual) is SHOWN, never hidden. `has_data=False` (mix None) is an honest N/A --
# no company in the group disclosed usable ASC 280 geography -- never a fabricated 0%/100% split.


class GeographicMixBuckets(BaseModel):
    """The three revenue buckets, as reported USD amounts and as shares (0-1) that sum to ~1."""

    domestic: float  # US revenue, reported USD
    international: float  # non-US revenue, reported USD
    other: float  # unclassifiable / residual geography revenue, reported USD (shown, not hidden)
    domestic_share: float  # domestic / (domestic + international + other)
    international_share: float
    other_share: float


class SectorGeographicMix(BaseModel):
    """One SIC group's revenue-weighted geographic revenue mix.

    Empty (`has_data=False`, `mix=None`) is a valid, honest result: no company in the group has a
    reconciled ASC 280 geographic disclosure ingested -- rendered as N/A, never a fabricated 0%."""

    group: str  # SIC prefix, e.g. "35"
    group_label: str
    peer_basis: str  # e.g. "SIC 2-digit"
    fiscal_year: int | None = None  # annual (10-K) basis, None when has_data is False
    unit: str = "USD"
    has_data: bool = False
    derived: bool = True  # always True -- a derived, revenue-weighted aggregate rollup
    mix: GeographicMixBuckets | None = None  # None when has_data is False
    company_count: int = 0  # distinct companies contributing a reconciled geo split (== covered)
    companies_in_scope: int = 0  # distinct companies in the group with an ingested consolidated total
    excluded_unreconciled_count: int = 0  # companies dropped because geo != consolidated (~1%)
    revenue_covered_share: float | None = None  # covered / in-scope consolidated revenue (0-1)
    as_of: str | None = None  # batch run date, None when has_data is False
    caveats: list[str] = Field(default_factory=list)


# --- Per-company value list within a sector (Sector Analytics app, Company view / altitude 2) -----
#
# Every company in a SIC group with a comparable (non-N/A) value for one metric+period -- for the
# peer dot-cloud (each dot a filer). A plain read over materialized metric_values ⨝ company_profiles
# (+ metric_ranks percentile). N/A · N/M companies are EXCLUDED, never surfaced as 0; a group below
# the minimum peer size returns an honest empty list. `percentile` is a POSITION within the peer
# set, not a good/bad verdict; `higher_is_better` orients it (invert for a lower-is-better metric).


class SectorCompanyValue(BaseModel):
    """One company's value for a metric, for a peer dot in the distribution."""

    cik: int  # stored/passed as an int (never the zero-padded string)
    name: str | None  # display name from company_profiles (may be None)
    value: float  # the company's reported value (raw unit; never None -- N/A rows are excluded)
    percentile: float | None  # 0-100 position within the peer group, or None if not ranked


class SectorCompanyValueList(BaseModel):
    """Every qualifying company's value for one metric within a SIC group.

    Empty `companies` is a valid, honest result: the group is below the minimum peer size, or has no
    comparable values for this metric/period (`caveats` spells this out)."""

    group: str  # the SIC prefix, e.g. "35"
    group_label: str  # readable SIC major-group name (falls back to the bare code)
    metric: str
    label: str
    unit: str
    higher_is_better: bool  # orientation for the client (invert the percentile for lower-is-better)
    fiscal_year: int
    fiscal_period: FiscalPeriod
    peer_basis: str  # e.g. "SIC 2-digit"
    caveats: list[str] = Field(default_factory=list)
    companies: list[SectorCompanyValue] = Field(default_factory=list)


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


class ConceptSeries(BaseModel):
    """One canonical CONCEPT's value across every period on file, for the history chart.

    Distinct from `MetricHistory`, which serves the 30 computed metrics: this serves the
    statement LINE ITEMS (revenue, cost of revenue, cash from operations...) that have no ratio
    behind them. Both share `MetricSeriesPoint`, `frequency` and `restatement_basis` so a chart
    can overlay one on the other without reconciling two shapes.
    """

    cik: int
    concept: str
    label: str
    #: The reported unit (USD, shares, ...). None when the concept resolved to no usable fact.
    unit: str | None = None
    #: Flows are summed over a period; stocks are a level at its end. A chart must not mix them
    #: on one axis without saying so, and the two are never differenced against each other.
    kind: Literal["flow", "stock"] | None = None
    #: Which candidate tag was chosen, and whether it is the filer's own extension. Provenance
    #: travels with the series, not just with a point.
    source_tag: str | None = None
    is_extension: bool = False
    frequency: MetricFrequency = "quarterly"
    restatement_basis: RestatementBasis = "as-restated"
    points: list[MetricSeriesPoint] = Field(default_factory=list)
    #: Set when the concept resolves to nothing for this filer -- an untagged concept, not a zero.
    reason: str | None = None


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

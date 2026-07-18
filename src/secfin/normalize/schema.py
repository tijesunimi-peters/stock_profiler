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

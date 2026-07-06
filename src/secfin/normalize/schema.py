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

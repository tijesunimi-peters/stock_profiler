"""Canonical data models.

Two layers:
  * RawFact           -- source-faithful, straight from SEC (before normalization)
  * canonical outputs -- StatementLine / Statement / InsiderTransaction (what we serve)

Keeping them separate is deliberate: RawFact preserves exactly what the SEC reported
(including the original tag and whether it was a company extension), which we need for
auditability and to keep improving the mapping. Canonical models are what subscribers see.
"""

from __future__ import annotations

from typing import Literal

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

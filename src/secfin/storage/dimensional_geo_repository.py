"""Repository for raw DIMENSIONAL GEOGRAPHIC-REVENUE facts (Sector Analytics v2, P6b).

Written by the bounded DERA ingest (`ingest/dimensional_backfill.py`) and read by the offline
rollup batch (`analytical/sector_geographic_mix.py`). This is the raw layer -- one row per
disaggregated revenue fact -- deliberately scoped to ASC 280 GEOGRAPHIC revenue only (NOT the
general dimensional_facts store from the spike sketch, and NOT business-segment / product axes).

Companyfacts carries no dimensional facts at all, so this is a NEW ingest source: the SEC Financial
Statement Data Sets (DERA) quarterly ZIPs, whose `num.txt` carries a `segments` (`Axis=Member;`)
column. See docs/SPIKE_DIMENSIONAL.md (source (a), proven) and docs/DATA_MODEL.md.

Two kinds of row share the table (distinguished by `is_consolidated`):
  * a DIMENSIONAL geography row -- a revenue value tagged with a geography member
    (`is_consolidated=False`, `member` set), and
  * the CONSOLIDATED total revenue row for the same filing/tag/period (`is_consolidated=True`,
    `member=''`) -- the denominator the rollup uses to reconcile-or-exclude a company (a company
    whose geography members don't sum to its consolidated revenue is dropped, never mis-summed).

Values are stored in their RAW reported unit (USD), with provenance (accession, tag, member)
preserved -- same invariants as the rest of the store. CIK is an int.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from typing import NamedTuple


class DimensionalGeoRow(NamedTuple):
    cik: int  # stored/passed as an int (never the zero-padded string)
    accession: str  # source filing provenance
    tag: str  # the revenue us-gaap tag disaggregated (varies per filer -- see mapping "revenue")
    ddate: str  # period end, DERA "YYYYMMDD"
    qtrs: str  # duration in quarters ("4" == annual, the only basis we ingest)
    member: str  # DERA geography member identifier ('' for the consolidated total row)
    value: float  # raw reported revenue value (USD)
    unit: str  # reported unit, "USD"
    is_consolidated: bool  # True == the non-dimensional total (member=''); False == a geo member
    fiscal_year: int  # the filing's fiscal year (from sub.txt / ddate), for the annual basis
    form: str  # "10-K" / "10-K/A"


class DimensionalGeoRepository(ABC):
    """Persists raw dimensional geographic-revenue facts (+ the consolidated total per filing)."""

    @abstractmethod
    def bulk_upsert(self, rows: list[DimensionalGeoRow]) -> None:
        """Idempotently store rows, replacing any existing
        (cik, accession, tag, ddate, qtrs, member) keys -- re-ingesting a quarter must not
        duplicate."""

    @abstractmethod
    def rows_for_fiscal_year(self, fiscal_year: int) -> list[DimensionalGeoRow]:
        """All geo + consolidated rows for one annual basis (the rollup batch's input)."""

    @abstractmethod
    def latest_well_covered_fiscal_year(self) -> int | None:
        """The latest annual basis with enough filers to characterise a sector, or None.

        NOT simply the newest year present. The DERA quarterly ZIPs land a fiscal year gradually --
        a 10-K for FY2025 filed by a March-FYE company arrives a year after a December-FYE one --
        so the newest year in this table is always a thin leading edge. Measured on the 2026-08-15
        ingest of 2025q3+2025q4+2026q1: FY2025 had 3,546 companies and FY2026 had **54**. Defaulting
        to "latest" would have rolled 54 companies up into a figure labelled as the market's.

        Same rule and the same reason as `SectorDupontRepository.latest_fy_year`: the newest year
        whose coverage is at least half the best-covered year's.
        """

    @abstractmethod
    def fiscal_years(self) -> list[int]:
        """Distinct fiscal years materialized, descending (latest first)."""

    @abstractmethod
    def count(self) -> int:
        """Total rows (for ingest progress / tests)."""

    @abstractmethod
    def clear(self) -> None:
        """Delete all rows."""

    @abstractmethod
    def close(self) -> None:
        """Release the underlying connection."""

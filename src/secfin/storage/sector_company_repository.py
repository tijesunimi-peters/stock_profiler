"""Repository for the per-company value list within a SIC sector (Sector Analytics app, Company
view / altitude 2).

Reads the already-materialized `metric_values` (per-company metric values) joined to
`company_profiles` (cik -> SIC, for group membership + a display name) and, when present,
`metric_ranks` (per-company percentile). One row per company in the sector that has a comparable
(non-N/A) value for the metric+period -- for plotting a peer dot-cloud (each dot a filer) with the
focal company marked.

A plain cache-aside READ over the operational store (no DuckDB on the request path). N/A and N/M
companies (`value IS NULL` / status not ok/approximate) are EXCLUDED, never surfaced as 0. See
sqlite_sector_company_repository.py.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from typing import NamedTuple


class CompanyMetricValueRow(NamedTuple):
    cik: int
    name: str | None  # from company_profiles (may be None if the profile has no name)
    value: float  # the company's reported value for the metric (raw unit; never None here)
    percentile: float | None  # position within its peer group (from metric_ranks), or None


class SectorCompanyRepository(ABC):
    """Persists nothing new -- a read view over metric_values JOIN company_profiles (+ ranks)."""

    @abstractmethod
    def list_for_group_metric(
        self, sic_prefix: str, sic_digits: int, metric: str, fiscal_year: int, fiscal_period: str
    ) -> list[CompanyMetricValueRow]:
        """Every company in the SIC group (whose `sic` starts with `sic_prefix`) that has a
        comparable value for `metric`+period, ordered by value. N/A · N/M companies are EXCLUDED
        (never a 0-valued row)."""

    @abstractmethod
    def latest_fy(self, metric: str) -> int | None:
        """The most recent annual (FY) fiscal year with any materialized value for `metric`, or None
        -- the default period when none is given."""

    @abstractmethod
    def count(self) -> int:
        """Total materialized metric-value rows (for tests)."""

    @abstractmethod
    def close(self) -> None:
        """Release the underlying connection."""

"""Per-company dimensional facts for §03 -- segments and geography.

## Why this is a SECOND table beside `dimensional_geo_facts`

`dimensional_geo_facts` is the input to a shipped sector metric (P6b), and
`analytical/sector_geographic_mix.py` reads it via `rows_for_fiscal_year` with **no tag or axis
filter** -- every non-consolidated row there is taken to be a geographic revenue split. Widening
that table with business-segment rows, or with `PropertyPlantAndEquipmentNet`, would silently
corrupt a metric already in production, and the corruption would look like a plausible number.

So its contract is frozen and §03 gets its own store. Geographic revenue is deliberately ingested
into BOTH -- ~8k rows, trivially cheap -- rather than making one table serve two contracts.

The distinction to keep in mind when adding a query: `dimensional_geo_facts` is the SECTOR
aggregate's input; this is the COMPANY-facing store, carries an `axis`, and holds tags beyond
revenue.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from typing import NamedTuple


class DimensionalFact(NamedTuple):
    """One dimensional fact as filed: an axis member, a tag, and a value."""

    cik: int  # stored/passed as an int, never the zero-padded string
    accession: str
    axis: str  # DERA short axis name, e.g. "BusinessSegments" / "Geographical"
    member: str  # the member identifier AS FILED -- never normalised, never prettified here
    tag: str  # the us-gaap tag disaggregated
    ddate: str  # period end, DERA "YYYYMMDD"
    qtrs: str  # "4" == annual duration, "0" == instant (balance-sheet tags)
    value: float  # raw reported value
    unit: str
    fiscal_year: int
    form: str


class DimensionalRepository(ABC):
    """Persists per-company dimensional facts for the segments & geography surface."""

    @abstractmethod
    def bulk_upsert(self, rows: list[DimensionalFact]) -> int:
        """Idempotently store rows, replacing any existing
        `(cik, accession, axis, member, tag, ddate, qtrs)` key -- re-ingesting a quarter must not
        duplicate. Returns the number written."""

    @abstractmethod
    def facts_for_cik(self, cik: int, axis: str | None = None) -> list[DimensionalFact]:
        """Every stored fact for one company, newest fiscal year first.

        A company appears in exactly ONE DERA quarter -- the one it filed in -- so this returns
        whatever quarters have been ingested, and a caller must report the fiscal year rather than
        implying currency.
        """

    @abstractmethod
    def count(self) -> int:
        """Total rows, for the backfill's own reporting."""

    @abstractmethod
    def close(self) -> None:
        """Release the underlying connection."""

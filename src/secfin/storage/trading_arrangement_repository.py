"""Repository interface for parsed Item 408(a) trading arrangements.

Stored beside `filing_cover_facts` and filled by the SAME instance read: `sec/cover.py` already
fetches a 1.4-14.9 MB extracted instance per accession, and Item 408(a)'s `ecd` facts sit in it.
Parsing both from one fetch is the difference between free and doubling the most expensive read
this product makes.

Keyed on (cik, accession, member) rather than (cik, accession): a filing discloses one row per
individual, and JPMorgan's most recent 10-K has ten.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from collections.abc import Sequence

from secfin.sec.trading_arrangements import TradingArrangement


class TradingArrangementRepository(ABC):
    """Persists Item 408(a) arrangements, at filing granularity."""

    @abstractmethod
    def replace_for_filing(
        self, cik: int, accession: str, arrangements: Sequence[TradingArrangement]
    ) -> int:
        """Store this filing's arrangements, replacing anything previously held FOR IT.

        Scoped to the one accession, never a wipe of the company: a re-read of the 2026 10-K must
        not drop what the 2025 one disclosed. Replacement (rather than insert-if-absent) is what
        makes a re-parse under a newer `COVER_SCHEMA_VERSION` actually write -- the mistake that
        left `transaction_code` at 0.03% populated in the insider store.

        An empty sequence is meaningful and is stored as such: a filing that says "no arrangements"
        has answered the question, and the caller distinguishes that from never having looked.
        """

    @abstractmethod
    def get_for_filing(self, cik: int, accession: str) -> list[TradingArrangement]:
        """This filing's arrangements, adoption date then name. Empty if it disclosed none."""

    @abstractmethod
    def close(self) -> None:
        """Release the underlying connection."""

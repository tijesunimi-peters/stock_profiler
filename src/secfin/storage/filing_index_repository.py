"""Repository interface for the generic filing index (form, dates, accession -- never contents).

Populated from `/submissions/` via `sec/filing_index.py`. One row per (cik, accession).

## Why a generic store rather than one per feature

Three consumers want the same walk over the same payload (operator ruling D-filing-index,
2026-08-01):

* **V3-P5a §06's supply events** -- does an S-1/S-3/SC TO/Form 25/15 exist, and when.
* **V3-P5a §06's acceptance-lag histogram** -- `acceptance_datetime` minus the reported period.
* **V3-P3** -- 8-K `items` codes and acceptance timestamps.

Building one store for the first would have meant a second, near-identical walk for the others.

## The window, and why every consumer must state it

`filings.recent` is EDGAR's ROLLING window, not a company's whole history. `covered_from` on
each row is therefore load-bearing: **an absence over a window is not an absence over history**,
and a caller reporting "no tender offer on file" has to say how far back it actually looked.
That is the entire point of this store -- it turns an asserted absence into a checked one.
"""

from __future__ import annotations

from abc import ABC, abstractmethod

from secfin.sec.filing_index import FilingIndexEntry


class FilingIndexRepository(ABC):
    """Persists one row per (cik, accession) of filing METADATA -- never filing contents."""

    @abstractmethod
    def upsert_filings(self, cik: int, entries: list[FilingIndexEntry]) -> int:
        """Idempotently store filings for one company; returns the number written.

        Keyed on (cik, accession), so re-ingesting a window that overlaps a previous one updates
        rather than duplicates -- EDGAR can restate a filing's metadata (an acceptance timestamp
        corrected, say) and the newest read should win.
        """

    @abstractmethod
    def get_filings(self, cik: int, forms: list[str] | None, limit: int) -> list[FilingIndexEntry]:
        """Filings for one company, newest filing date first, optionally filtered to `forms`.

        An empty list is ambiguous between "this company filed none of these" and "we have not
        indexed this company yet" -- `indexed_count` below is how a caller tells them apart, and
        it must, because the difference is the whole honesty question for an absence claim.
        """

    @abstractmethod
    def filings_for_ciks(
        self, ciks: list[int], forms: list[str], report_date: str | None
    ) -> list[FilingIndexEntry]:
        """Indexed filings for a BOUNDED set of companies, filtered to `forms`.

        For a measure about a group of filers rather than one company -- §06's acceptance-lag
        histogram is over the MANAGERS that hold an issuer, because a 13F-HR is filed by the
        manager, not by the issuer whose page it appears on. Reading the issuer's own index for
        that would measure the wrong filings entirely.

        `report_date` restricts to filings reporting on that period when given. One indexed read
        over an explicit CIK list, the same character as `manager_cusip_sets`.
        """

    @abstractmethod
    def indexed_count(self, cik: int) -> int:
        """How many filings we hold for this company. `0` means NOT INDEXED, not "never filed"."""

    @abstractmethod
    def indexed_window(self, cik: int) -> tuple[str | None, str | None]:
        """(earliest, latest) filing date held for this company, or (None, None).

        What a caller quotes when it reports an absence: "no SC TO among the filings we hold,
        which run from X to Y". Without it, "none on file" is a claim about history that this
        store cannot support.
        """

    @abstractmethod
    def close(self) -> None:
        """Release the underlying connection."""

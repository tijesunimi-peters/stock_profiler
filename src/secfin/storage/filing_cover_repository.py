"""Repository interface for a 10-K's parsed cover-page facts. See `sec/cover.py`.

## Why this is a STORE and not a cache-aside read like the others

The insider and 13F caches exist to spare the SEC repeated traffic for data we could re-derive
cheaply. This one exists because the fetch behind it is **expensive and unbounded**: the extracted
instance runs from 1.4 MB to 14.9 MB per annual report (measured, 2026-08-03), and no byte-range
shortcut exists -- the auditor facts sit at 9% of the way through one filer's instance and 99.9%
through another's.

So the rule is stronger than "cache if convenient": **fetch once per (cik, accession), ever.**
A second question about the same filing -- the cover page for §01, the cybersecurity flags for
§08.3, the 10b5-1 flags for §05.5 -- reads this table rather than downloading 15 MB again.

One row per (cik, accession), so a filer's history accumulates naturally and a restatement (a
10-K/A with its own accession) never overwrites the original. Latest `filed` wins for "current",
the same convention `RawFact` uses.
"""

from __future__ import annotations

from abc import ABC, abstractmethod

from secfin.sec.cover import CoverFacts


class FilingCoverRepository(ABC):
    """Persists the parsed cover-page facts of one annual report per (cik, accession)."""

    @abstractmethod
    def upsert_cover(self, cik: int, facts: CoverFacts) -> None:
        """Idempotently store one filing's parsed cover facts.

        Re-parsing the same accession updates in place -- a later parse knows more (a new field
        added to the allowlist), and the row should carry it without a duplicate appearing.
        """

    @abstractmethod
    def get_cover(self, cik: int, accession: str | None = None) -> CoverFacts | None:
        """One filing's stored cover facts; the most recently FILED one when `accession` is None.

        `None` means NOT STORED -- never "this filer has no auditor". The caller has to keep those
        apart, because one is a gap in our ingest and the other would be a false claim about a
        registrant.
        """

    @abstractmethod
    def close(self) -> None:
        """Release the underlying connection."""

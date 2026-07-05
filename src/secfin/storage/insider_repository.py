"""Repository interface for cached insider (Forms 3/4/5) transactions.

Unlike `RawFactRepository` (facts can be *restated* -- the same concept+period gets a
new value under a new accession, so idempotency has to merge in place), a Form 3/4/5
filing is immutable once accepted: an amendment gets its own accession number ("4/A"),
it never rewrites a prior one. So caching keys off **the filing**, not individual
transaction rows -- track which accessions we've already fetched+parsed for an issuer,
and skip re-storing a filing's rows once we have it. This sidesteps a real problem: two
genuinely-distinct real rows in the same filing can be field-for-field identical under
our current `InsiderTransaction` schema (e.g. two `derivativeHolding` rows for the same
security title and ownership type, differing only in the underlying-security share count
we don't currently parse -- see `tests/fixtures/insider/aapl_form3_newstead.xml`), so a
natural-key UNIQUE constraint built from `InsiderTransaction` fields alone would silently
collapse them. Filing-level dedup avoids needing a per-row identity at all.

`limit`-bounded cache hits: `GET /insider-trades?limit=N` bounds the number of *filings*
fetched, not transaction rows (see `sec/insider.py`). A cache holding 10 filings' worth of
rows can answer `limit=5` but not `limit=50` -- a smaller previously-cached limit is not a
superset of a larger one. Callers MUST check `cached_filing_count()` against the
requested `limit` before trusting `get_insider_transactions()`.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from collections.abc import Iterable, Sequence

from secfin.normalize.schema import InsiderFilingMeta, InsiderTransaction


class InsiderTransactionRepository(ABC):
    """Persists parsed insider transactions, cached per issuer at filing granularity."""

    @abstractmethod
    def upsert_insider_transactions(
        self,
        issuer_cik: int,
        filings: Sequence[InsiderFilingMeta],
        transactions: Iterable[InsiderTransaction],
    ) -> int:
        """Idempotently store freshly-fetched filings and their parsed rows for one
        issuer, in the same transaction. Filings already cached are left untouched (and
        their rows are NOT re-inserted, even if passed in again) -- safe to call with a
        full re-fetch that includes previously-seen filings. Returns the number of
        transaction rows newly written (0 if every filing passed in was already cached).
        """

    @abstractmethod
    def cached_filing_count(self, issuer_cik: int) -> int:
        """Number of distinct Form 3/4/5 filings ever cached for this issuer."""

    @abstractmethod
    def get_insider_transactions(self, issuer_cik: int, limit: int) -> list[InsiderTransaction]:
        """Transaction/holding rows from the newest `limit` cached filings, newest
        filing first (ties within a filing preserve original document order). Filing
        recency is approximated by (filed date, accession) sort, not a globally exact
        chronological order -- see the SQLite implementation's docstring.
        """

    @abstractmethod
    def close(self) -> None:
        """Release the underlying connection."""

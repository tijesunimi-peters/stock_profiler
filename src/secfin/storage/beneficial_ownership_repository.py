"""Repository interface for cached Schedule 13D/13G beneficial-ownership rows.

Same rationale as `storage/insider_repository.py`: a structured-XML Schedule 13D/G
filing is immutable once accepted -- an amendment gets its own accession ("13D/A" /
"13G/A"), it never rewrites a prior one. So caching keys off **the filing**, not
individual reporting-person rows -- track which accessions we've already fetched+parsed
for an issuer, and skip re-storing a filing's rows once we have it.

`limit`-bounded cache hits: `GET /beneficial-ownership?limit=N` bounds the number of
*filings* fetched, not `BeneficialOwnership` rows (see `sec/institutional.py`). A cache
holding 10 filings' worth of rows can answer `limit=5` but not `limit=50` -- a smaller
previously-cached limit is not a superset of a larger one. Callers MUST check
`cached_filing_count()` against the requested `limit` before trusting
`get_beneficial_ownership()`.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from collections.abc import Iterable, Sequence

from secfin.normalize.schema import BeneficialOwnership, BeneficialOwnershipFilingMeta


class BeneficialOwnershipRepository(ABC):
    """Persists parsed Schedule 13D/G rows, cached per issuer at filing granularity."""

    @abstractmethod
    def upsert_beneficial_ownership(
        self,
        issuer_cik: int,
        filings: Sequence[BeneficialOwnershipFilingMeta],
        owners: Iterable[BeneficialOwnership],
    ) -> int:
        """Idempotently store freshly-fetched filings and their parsed rows for one
        issuer, in the same transaction. Filings already cached are left untouched (and
        their rows are NOT re-inserted, even if passed in again) -- safe to call with a
        full re-fetch that includes previously-seen filings. Returns the number of
        `BeneficialOwnership` rows newly written (0 if every filing passed in was
        already cached).
        """

    @abstractmethod
    def cached_filing_count(self, issuer_cik: int) -> int:
        """Number of distinct structured-XML Schedule 13D/G filings ever cached for
        this issuer."""

    @abstractmethod
    def get_beneficial_ownership(self, issuer_cik: int, limit: int) -> list[BeneficialOwnership]:
        """Rows from the newest `limit` cached filings, newest filing first (ties
        within a filing preserve original document order)."""

    @abstractmethod
    def close(self) -> None:
        """Release the underlying connection."""

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

from secfin.normalize.schema import (
    InsiderFilingMeta,
    InsiderOwnerRole,
    InsiderTransaction,
)


class InsiderTransactionRepository(ABC):
    """Persists parsed insider transactions, cached per issuer at filing granularity."""

    @abstractmethod
    def upsert_insider_transactions(
        self,
        issuer_cik: int,
        filings: Sequence[InsiderFilingMeta],
        transactions: Iterable[InsiderTransaction],
        refresh: bool = False,
    ) -> int:
        """Idempotently store freshly-fetched filings and their parsed rows for one
        issuer, in the same transaction. Filings already cached are left untouched (and
        their rows are NOT re-inserted, even if passed in again) -- safe to call with a
        full re-fetch that includes previously-seen filings. Returns the number of
        transaction rows newly written (0 if every filing passed in was already cached).

        `refresh=True` REPLACES the cached rows for the accessions passed in, instead of
        skipping them. This exists for one specific situation: the parser learned to extract
        fields the cached corpus predates. `sec/insider.py` gained `transaction_code`,
        `is_derivative` and `rule_10b5_1`, and because the default path skips a known
        accession outright, re-running the backfill over 163k rows wrote exactly nothing --
        the columns sat at 0.03% populated while the job reported success.

        A Form 3/4/5 is immutable once filed, so re-parsing the same accession yields the same
        rows plus the newly-extracted columns. That is what makes replacement safe here and is
        NOT a licence to replace elsewhere: `raw_facts` restatements are a different thing
        entirely, where an old value must survive alongside the new one.
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
    def get_initial_statements(self, issuer_cik: int, limit: int) -> list[InsiderTransaction]:
        """Rows from the newest `limit` **Form 3 / 3-A** filings cached for this issuer.

        Separate from `get_insider_transactions` because the two windows are different in kind.
        A Form 3 is the *initial* statement of beneficial ownership, filed within 10 days of
        becoming an officer, director or 10% owner -- so it marks an arrival, and arrivals are
        rare next to the Form 4 stream they are buried in. Apple's newest 10 filings are all
        Form 4s; its three most recent Form 3s are months older. A caller wanting arrivals has
        to ask for them by form, not by recency.

        Unlike `get_insider_transactions`, this does NOT need a `cached_filing_count` check: it
        answers "what arrivals do we hold", and holding fewer is a coverage fact the caller
        reports, not a stale answer to a different question.
        """

    @abstractmethod
    def owner_role_history(self, issuer_cik: int) -> list[InsiderOwnerRole]:
        """Every (person, role) pairing this issuer's Section 16 filers reported, with its span.

        Grouped in SQL rather than by pulling rows: a prolific filer's cached corpus is tens of
        thousands of rows, and the question is about distinct roles, not transactions. Ordered by
        `first_filed` so a caller can walk one person's spans in order and see a role change.

        Bounded by whatever is cached -- this is the whole cached window, not a recency slice,
        because "who are the officers" is a question about all of it.
        """

    @abstractmethod
    def transactions_since(self, issuer_cik: int, since: str) -> list[InsiderTransaction]:
        """Cached rows for this issuer FILED strictly after `since` (an ISO date), newest first.

        Filtered on `filed`, not `transaction_date`: the question this answers is "what has
        reached EDGAR since the register was assembled", which is about when the filing
        arrived, not when the trade happened. A Form 4 reporting an old trade still counts as
        news arriving after the 13F.

        Bounded by the date, so it stays a live indexed point read like
        `get_insider_transactions` -- no aggregate scan. An empty list means nothing was filed
        in the window, which is a real answer, not a coverage gap.
        """

    @abstractmethod
    def stale_accessions(self) -> list[tuple[int, str]]:
        """Every (issuer_cik, accession) whose cached rows predate the current parser.

        The marker is `is_derivative IS NULL`, and the choice matters. `parse_ownership_xml`
        sets that column unconditionally -- it is decided by WHICH TABLE the row sat in
        (`nonDerivativeTable` vs `derivativeTable`), so every row the current parser writes
        carries `True` or `False` and a NULL can only have come from an older one.

        `transaction_code` is NOT a sound marker even though it went missing in the same
        parser era: a Form 3 holding row legitimately has no transaction coding element, so
        selecting on it would drag every genuine initial statement into the repair set and
        re-fetch filings that were never stale.

        Returned sorted by (cik, accession) so a run is deterministic and an interrupted one
        resumes sensibly. This is an aggregate scan over the whole table, so it is for the
        batch repair path only -- never a live request.
        """

    @abstractmethod
    def close(self) -> None:
        """Release the underlying connection."""

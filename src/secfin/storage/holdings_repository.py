"""Repository interface for cached 13F holdings snapshots.

Unlike insider transactions (a Form 3/4/5 is immutable once accepted -- see
insider_repository.py), a 13F CAN be superseded: `sec/institutional.py`'s
`fetch_13f_snapshot` already picks whichever of an original 13F-HR / 13F-HR/A pair for a
quarter was filed most recently, since an amendment restates that quarter. So caching is
keyed on `(manager_cik, report_period)` -- one snapshot per manager per quarter, the same
identity `fetch_13f_snapshot` itself resolves to -- rather than per accession the way
insider filings are.

**Known staleness window, deliberate, same shape as `_facts_for_cik`'s:** once a
snapshot is cached for a (manager, quarter), the live read path serves it forever and
never re-checks SEC for a later-filed amendment that would supersede it. This mirrors
statements: `_facts_for_cik` doesn't re-fetch a cached company to pick up restatements
either -- picking up new data is `ingest/incremental.py`'s job, not the read path's. A
future 13F bulk-ingest job (Milestone 2.5) re-running `upsert_snapshot` with a fresher
fetch would update the cache the same way; there's no such job yet for 13F, so today an
amendment only lands here if the cache is empty (or a repository is dropped/rebuilt) when
the next request for that manager+quarter comes in.

CUSIP -> CIK resolution (`InstitutionalHolding.cik`) is deliberately NOT cached here --
`normalize/cusip.resolve_snapshot_cusips` always runs on the snapshot after it's
returned, cached or not, so previously-unresolved CUSIPs get a chance to resolve as the
CUSIP map improves over time rather than being frozen at first-cache time.

Unlike CUSIP->CIK, the cover page's co-filing-manager roster (`HoldingsSnapshot
.other_managers`) and each holding's attribution to it (`InstitutionalHolding
.other_managers`) ARE cached as-reported -- they're part of the filing itself (not a
resolution this app performs), so there's nothing to re-run on a cache hit.
"""

from __future__ import annotations

from abc import ABC, abstractmethod

from secfin.normalize.schema import HoldingsSnapshot, IssuerHolder


class HoldingsSnapshotRepository(ABC):
    """Persists 13F holdings snapshots, cached per (manager_cik, report_period)."""

    @abstractmethod
    def upsert_snapshot(self, snapshot: HoldingsSnapshot) -> None:
        """Idempotently store one manager's 13F snapshot for a quarter, replacing
        whatever was previously cached for the same (manager_cik, report_period) --
        e.g. if a future bulk re-ingest supplies a newer amendment. `cik` on each
        `InstitutionalHolding` is NOT persisted (see module docstring); only the
        as-reported fields are.
        """

    @abstractmethod
    def get_snapshot(self, manager_cik: int, report_period: str) -> HoldingsSnapshot | None:
        """Cached snapshot for one manager + quarter-end, or None on a cache miss.
        Every `InstitutionalHolding.cik` comes back None -- callers must run
        `resolve_snapshot_cusips` themselves, cache hit or not.
        """

    @abstractmethod
    def cached_accession(self, manager_cik: int, report_period: str) -> str | None:
        """Accession of the currently-cached snapshot, or None if nothing is cached.

        A single indexed lookup with no join to `holdings`/`holdings_other_managers`,
        so `ingest/institutional_backfill.py` can cheaply check thousands of managers
        per run without deserializing full snapshots for the (usual, on a re-run)
        case where nothing needs re-fetching -- it compares this against the winning
        filing's accession it already knows from a local `submissions.zip` scan, and
        only fetches+upserts on a mismatch (first ingest, or a newer amendment).
        """

    @abstractmethod
    def manager_periods(self, manager_cik: int) -> list[str]:
        """Every quarter-end this manager has a cached 13F snapshot for, newest first.

        The manager-centric periods axis for a UI selector (mirrors the issuer-centric
        `issuer_periods` below and the metrics engine's `metric_periods`): the set of
        `period=` values `get_snapshot` / `/managers/{cik}/holdings` can actually answer.
        An empty list means nothing has been ingested for this manager yet -- not that
        the manager never filed.
        """

    @abstractmethod
    def issuer_periods(self, cusips: list[str]) -> list[str]:
        """Every quarter-end for which some manager reported holding any of `cusips`,
        across ALL managers, newest first -- the issuer-centric periods axis, the
        companion to `holders_of`'s point-in-time read.

        A live indexed query over the `(cusip, report_period)` index, same as
        `holders_of`. Empty `cusips` returns `[]`. An empty result carries the same
        ambiguity as `holders_of`: "no manager reported this issuer" vs. "this quarter
        hasn't been ingested for any manager yet" -- callers must surface that, not treat
        it as a confirmed zero.
        """

    @abstractmethod
    def holders_of(self, cusips: list[str], report_period: str) -> list[IssuerHolder]:
        """Every manager holding any of `cusips` as of `report_period`, across ALL
        managers -- the issuer-centric inverse of `get_snapshot`'s manager-centric read.

        A live indexed query (see the `(cusip, report_period)` index in
        `sqlite_holdings_repository.py`), not a precomputed batch job: a single issuer's
        holder list is a point lookup, not the whole-quarter aggregate scan DuckDB was
        benchmarked for (see `docs/ARCHITECTURE.md` 3b) -- that benchmark answers a
        different, more expensive question than this one. An empty result is ambiguous
        between "no manager reported holding this issuer" and "this quarter hasn't been
        ingested for any manager yet" -- callers must surface that ambiguity, not treat
        it as a confirmed zero.
        """

    @abstractmethod
    def close(self) -> None:
        """Release the underlying connection."""

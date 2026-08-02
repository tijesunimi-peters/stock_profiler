"""Repository for company profile metadata (SIC industry code).

Populated by `ingest/sic_backfill.py` from `submissions.json`'s top-level `sic` /
`sicDescription` / `name`. The SIC code is the peer-grouping axis for Metrics Phase 2
(`analytical/peer_ranks.py` groups companies by the first N digits of `sic`). See
sqlite_company_profile_repository.py for the impl.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from typing import NamedTuple


class CompanyProfile(NamedTuple):
    """One filer's identity, as EDGAR states it.

    The cover-page fields below come from `/submissions/CIK##########.json` -- NOT from
    companyfacts, which carries numeric facts only. That distinction is why they are stored here
    rather than derived: verified 2026-08-02 that companyfacts holds exactly two `dei` tags, so
    incorporation state, filer status and the rest are structurally absent from it.

    Every one is optional. EDGAR omits fields for some filers, and a missing value must read as
    unknown -- never as an empty string and never as a default that looks like a fact.
    """

    cik: int
    sic: str | None
    sic_description: str | None
    name: str | None
    # --- cover-page identity, all from /submissions/ ---
    state_of_incorporation: str | None = None
    hq_city: str | None = None
    hq_state: str | None = None
    #: EDGAR's `fiscalYearEnd`, an MMDD string ("0926" = 26 September). Stored raw; formatting is
    #: the caller's job, and storing a formatted string would lose the ordering.
    fiscal_year_end: str | None = None
    #: EDGAR's `category`, e.g. "Large accelerated filer". Its own vocabulary, not ours.
    filer_category: str | None = None
    ein: str | None = None
    exchanges: str | None = None
    #: Earliest filing date EDGAR holds for this filer. Taken from `filings.files` where present --
    #: the OLDER paginated history, not the rolling recent window -- so "first filing" means what
    #: it says. Apple's reaches 1994-01-26; the recent window alone would have said 2015.
    first_filing_date: str | None = None


class CompanyProfileRepository(ABC):
    """Persists one profile row per company (cik -> SIC industry metadata)."""

    @abstractmethod
    def upsert(self, profile: CompanyProfile) -> None:
        """Idempotently store one company's profile, replacing any prior row for the cik."""

    @abstractmethod
    def get(self, cik: int) -> CompanyProfile | None:
        """The stored profile for a cik, or None if none has been ingested."""

    @abstractmethod
    def sic_group_peers(self, cik: int, sic_digits: int, limit: int) -> list[CompanyProfile]:
        """Other companies sharing this company's first-`sic_digits` SIC prefix, `cik` excluded.

        The same grouping axis `analytical/peer_ranks.py` ranks on, so "peer" means one thing
        across the product. Returns `[]` when the company has no profile row or no SIC -- which
        is a coverage gap, NOT a company without peers, and the caller must say so.

        A single indexed prefix scan bounded by `limit`, cheap enough for the request path.
        Ordering is by cik: `company_profiles` holds no size or liquidity signal to rank on, so
        any ordering here would be arbitrary, and the CALLER ranks the candidates on a signal it
        can defend (see `/institutional-peer-overlap`, which ranks by ingested register size).
        `limit` is therefore a candidate cap, not a peer selection.
        """

    @abstractmethod
    def close(self) -> None:
        """Release the underlying connection."""

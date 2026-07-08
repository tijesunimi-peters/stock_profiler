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
    cik: int
    sic: str | None
    sic_description: str | None
    name: str | None


class CompanyProfileRepository(ABC):
    """Persists one profile row per company (cik -> SIC industry metadata)."""

    @abstractmethod
    def upsert(self, profile: CompanyProfile) -> None:
        """Idempotently store one company's profile, replacing any prior row for the cik."""

    @abstractmethod
    def get(self, cik: int) -> CompanyProfile | None:
        """The stored profile for a cik, or None if none has been ingested."""

    @abstractmethod
    def close(self) -> None:
        """Release the underlying connection."""

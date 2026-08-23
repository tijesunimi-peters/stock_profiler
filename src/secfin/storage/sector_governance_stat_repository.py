"""Repository interface for per-COMPANY governance/disclosure statistics (Wave 0 of Track 2's
sector Qualitative page -- see docs/ROADMAP_TRACK2.md).

Cybersecurity Item 1C flags, auditor identity, an auditor-tenure FLOOR (same method as
`normalize/auditor_continuity.py`), and late-filing/restatement counts. All of it is Track 1:
tagged XBRL cover-page facts (`sec/cover.py`) plus the filing INDEX (form, dates, 8-K item
codes) -- no document is read here, no narrative is parsed.

**Not the same scope as `disclosure_stat_repository.py`.** That table is filing BEHAVIOUR (how a
company files); this one is disclosure CONTENT (what a tagged fact or a filing's existence says).
Kept as a separate table on purpose so neither endpoint's caveats have to describe the other's
data, even though the late-filing/restatement counts below are computed the same way and would
otherwise be duplicated with that table -- see the batch module's docstring for why the
duplication is deliberate (self-containment, not DRY).

Why a materialized table rather than a live aggregate: same reasoning as disclosure_stats.py --
placing one sector's cyber/auditor picture together means reading every company in the group, and
CLAUDE.md guardrail 7 puts that cross-company aggregation in a batch job, not the request path.

Written only by `analytical/sector_governance_stats.py`.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass


@dataclass
class SectorGovernanceStatRow:
    """One company's governance-disclosure snapshot, as of the batch's most recent run.

    Cyber flags reflect the LATEST filing_cover_facts row for this cik (one fiscal year's Item 1C
    disclosure) -- `None` means untagged, never "no" (see sec/cover.py). Auditor tenure fields are
    the output of `normalize.auditor_continuity.build_auditor_continuity`, computed here rather
    than re-derived by a caller, so `get_group()` needs no further computation to report a floor.
    """

    cik: int
    peer_group: str
    company_name: str | None
    #: Item 1C flags off the latest annual report on file. None is UNTAGGED, never "no".
    cyber_processes_integrated: bool | None
    cyber_reports_to_board: bool | None
    cyber_positions_responsible: bool | None
    #: Count of 8-K Item 1.05 (material cybersecurity incident) filings in the indexed window.
    cyber_incident_8k_count: int
    #: `dei:AuditorName` off the latest annual report. None means untagged.
    auditor_name: str | None
    #: `AuditorContinuity.since` / `.since_is_a_change` / `.years` / `.status` / `.reason` --
    #: see normalize/auditor_continuity.py. `tenure_status == "na"` means no floor could be
    #: established (short window); `tenure_years` is only meaningful when status is "ok".
    tenure_since: str | None
    tenure_since_is_change: bool
    tenure_years: float | None
    tenure_status: str
    tenure_reason: str | None
    #: Count of 12b-25 late-filing notices (NT 10-K / NT 10-Q family) in the indexed window.
    late_notice_count: int
    #: Count of 8-K Item 4.02 non-reliance filings in the indexed window.
    non_reliance_count: int
    indexed_filings: int
    indexed_from: str | None
    indexed_to: str | None


class SectorGovernanceStatRepository(ABC):
    """Persists per-company governance/disclosure statistics for sector-level roll-up."""

    @abstractmethod
    def bulk_upsert(self, rows: list[SectorGovernanceStatRow]) -> None:
        """Idempotently store a batch, keyed by cik."""

    @abstractmethod
    def get_group(self, peer_group: str) -> list[SectorGovernanceStatRow]:
        """Every company in one SIC group with computed governance stats.

        Bounded by the group, so it stays an indexed read. An empty list means the batch has not
        covered this group -- which the endpoint must report as "not computed", never as a group
        with no cyber disclosure or no auditor.
        """

    @abstractmethod
    def get(self, cik: int) -> SectorGovernanceStatRow | None:
        """One company's governance stats, or None if the batch has not covered it."""

    @abstractmethod
    def close(self) -> None:
        """Release the underlying connection."""

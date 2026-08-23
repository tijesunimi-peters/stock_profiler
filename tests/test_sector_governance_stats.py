"""Tests for per-company governance/disclosure stats (analytical/sector_governance_stats.py +
its store). No network.

Rules these must not break: cyber flags are UNTAGGED-vs-tagged (None, never "no"), a filing_cover_
facts row below the current COVER_SCHEMA_VERSION is excluded (a cache miss, not an answer), and
auditor tenure is computed by the SAME pure function the per-company /audit endpoint uses.
"""

from __future__ import annotations

import importlib.util

import pytest

from secfin.storage.sector_governance_stat_repository import SectorGovernanceStatRow
from secfin.storage.sqlite_sector_governance_stat_repository import (
    SQLiteSectorGovernanceStatRepository,
)

_HAS_DUCKDB = importlib.util.find_spec("duckdb") is not None
_needs_duckdb = pytest.mark.skipif(not _HAS_DUCKDB, reason="requires the analytical extra (duckdb)")


def _row(cik: int, **kw) -> SectorGovernanceStatRow:
    base = dict(
        cik=cik, peer_group="35", company_name="TEST CO",
        cyber_processes_integrated=True, cyber_reports_to_board=True,
        cyber_positions_responsible=False, cyber_incident_8k_count=0,
        auditor_name="Example LLP", tenure_since="2020-01-01", tenure_since_is_change=True,
        tenure_years=5.0, tenure_status="ok", tenure_reason=None,
        late_notice_count=0, non_reliance_count=0, indexed_filings=100,
        indexed_from="2015-01-01", indexed_to="2026-01-01",
    )
    base.update(kw)
    return SectorGovernanceStatRow(**base)


def test_repo_roundtrip_by_group_and_cik(tmp_path):
    repo = SQLiteSectorGovernanceStatRepository(str(tmp_path / "g.db"))
    repo.bulk_upsert([_row(1), _row(2), _row(3, peer_group="60")])

    assert [r.cik for r in repo.get_group("35")] == [1, 2]
    assert repo.get(3).peer_group == "60"
    assert repo.get(999) is None
    repo.close()


def test_upsert_replaces_rather_than_duplicating(tmp_path):
    repo = SQLiteSectorGovernanceStatRepository(str(tmp_path / "g.db"))
    repo.bulk_upsert([_row(1, auditor_name="Old LLP")])
    repo.bulk_upsert([_row(1, auditor_name="New LLP")])

    rows = repo.get_group("35")
    assert len(rows) == 1 and rows[0].auditor_name == "New LLP"
    repo.close()


def test_untagged_cyber_flags_survive_the_roundtrip_as_none(tmp_path):
    """None means "not tagged"; False would claim a measured "no"."""
    repo = SQLiteSectorGovernanceStatRepository(str(tmp_path / "g.db"))
    repo.bulk_upsert([_row(1, cyber_processes_integrated=None, cyber_reports_to_board=None)])

    got = repo.get(1)
    assert got.cyber_processes_integrated is None
    assert got.cyber_reports_to_board is None
    repo.close()


@_needs_duckdb
def test_compute_detects_auditor_change_and_excludes_stale_schema_cover_row(tmp_path):
    from secfin.analytical.sector_governance_stats import compute_sector_governance_stats
    from secfin.sec.cover import COVER_SCHEMA_VERSION, CoverFacts
    from secfin.sec.filing_index import FilingIndexEntry
    from secfin.storage.company_profile_repository import CompanyProfile
    from secfin.storage.sqlite_company_profile_repository import SQLiteCompanyProfileRepository
    from secfin.storage.sqlite_filing_cover_repository import SQLiteFilingCoverRepository
    from secfin.storage.sqlite_filing_index_repository import SQLiteFilingIndexRepository

    db = str(tmp_path / "b.db")

    prof = SQLiteCompanyProfileRepository(db)
    prof.upsert(CompanyProfile(cik=1, sic="3571", sic_description=None, name="ACME INC"))
    prof.upsert(CompanyProfile(cik=2, sic="3572", sic_description=None, name="STALE CO"))
    prof.close()

    cover = SQLiteFilingCoverRepository(db)
    # cik 1: a real, current-schema cover row with cyber + auditor tagged.
    cover.upsert_cover(1, CoverFacts(
        accession="a1", form="10-K", filed="2024-03-01",
        auditor_name="Acme Auditors LLP",
        cyber_processes_integrated=True, cyber_reports_to_board=True,
    ))
    # cik 2: written under an OLDER schema version -- must read back as untagged, not as an answer.
    cover.upsert_cover(2, CoverFacts(
        accession="s1", form="10-K", filed="2024-03-01",
        auditor_name="Stale Auditors LLP", cyber_processes_integrated=True,
    ))
    cover.close()
    # Force cik 2's row below the current schema version directly (upsert_cover always stamps the
    # current one, so this simulates a row written before a field existed).
    import sqlite3
    conn = sqlite3.connect(db)
    conn.execute(
        "UPDATE filing_cover_facts SET schema_version = ? WHERE cik = 2",
        (COVER_SCHEMA_VERSION - 1,),
    )
    conn.commit()
    conn.close()

    fi = SQLiteFilingIndexRepository(db)
    fi.upsert_filings(1, [
        FilingIndexEntry(cik=1, accession="a1", form="10-K", filing_date="2024-03-01",
                         report_date="2023-12-31"),
        # A 4.01 auditor change -- this is what makes tenure "since a change", not a window floor.
        FilingIndexEntry(cik=1, accession="a2", form="8-K", filing_date="2023-06-15",
                         report_date=None, items="4.01"),
        # A 12b-25 late notice and an 8-K Item 1.05 cyber incident, both counted.
        FilingIndexEntry(cik=1, accession="a3", form="NT 10-Q", filing_date="2023-08-01",
                         report_date=None),
        FilingIndexEntry(cik=1, accession="a4", form="8-K", filing_date="2023-09-01",
                         report_date=None, items="1.05"),
    ])
    fi.upsert_filings(2, [
        FilingIndexEntry(cik=2, accession="s1", form="10-K", filing_date="2024-03-01",
                         report_date="2023-12-31"),
    ])
    fi.close()

    rows = {r.cik: r for r in compute_sector_governance_stats(db, 4)}

    assert rows[1].auditor_name == "Acme Auditors LLP"
    assert rows[1].cyber_processes_integrated is True
    assert rows[1].tenure_since_is_change is True
    assert rows[1].tenure_since == "2023-06-15"
    assert rows[1].late_notice_count == 1
    assert rows[1].non_reliance_count == 0
    assert rows[1].cyber_incident_8k_count == 1

    # cik 2's cover row predates the current schema and must read back as untagged, exactly like
    # SQLiteFilingCoverRepository.get_cover() treats it as a cache miss rather than an answer.
    assert rows[2].auditor_name is None
    assert rows[2].cyber_processes_integrated is None

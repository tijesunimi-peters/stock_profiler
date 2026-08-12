"""Tests for per-company disclosure stats (analytical/disclosure_stats.py + its store). No network.

The measures describe HOW a company files. The rules they must not break: lag is over periodic
reports only, a company with no computable value gets NULL rather than 0, and every number is
scoped to the filer's own indexed window.
"""

from __future__ import annotations

import importlib.util

import pytest

from secfin.storage.disclosure_stat_repository import DisclosureStatRow
from secfin.storage.sqlite_disclosure_stat_repository import SQLiteDisclosureStatRepository

_HAS_DUCKDB = importlib.util.find_spec("duckdb") is not None
_needs_duckdb = pytest.mark.skipif(not _HAS_DUCKDB, reason="requires the analytical extra (duckdb)")


def _row(cik: int, **kw) -> DisclosureStatRow:
    base = dict(
        cik=cik, peer_group="35", median_filing_lag_days=40.0, amended_share=0.05,
        late_notice_count=0, non_reliance_count=0, indexed_filings=100,
        indexed_from="2015-01-01", indexed_to="2026-01-01",
    )
    base.update(kw)
    return DisclosureStatRow(**base)


def test_repo_roundtrip_by_group_and_cik(tmp_path):
    repo = SQLiteDisclosureStatRepository(str(tmp_path / "d.db"))
    repo.bulk_upsert([_row(1), _row(2), _row(3, peer_group="60")])

    assert [r.cik for r in repo.get_group("35")] == [1, 2]
    assert repo.get(3).peer_group == "60"
    assert repo.get(999) is None
    repo.close()


def test_upsert_replaces_rather_than_duplicating(tmp_path):
    repo = SQLiteDisclosureStatRepository(str(tmp_path / "d.db"))
    repo.bulk_upsert([_row(1, median_filing_lag_days=40.0)])
    repo.bulk_upsert([_row(1, median_filing_lag_days=31.0)])

    rows = repo.get_group("35")
    assert len(rows) == 1 and rows[0].median_filing_lag_days == 31.0
    repo.close()


def test_a_null_lag_survives_the_roundtrip_as_null(tmp_path):
    """NULL means "we could not measure"; 0 would mean "filed on the period end date"."""
    repo = SQLiteDisclosureStatRepository(str(tmp_path / "d.db"))
    repo.bulk_upsert([_row(1, median_filing_lag_days=None, amended_share=None)])

    got = repo.get(1)
    assert got.median_filing_lag_days is None
    assert got.amended_share is None
    repo.close()


@_needs_duckdb
def test_lag_is_measured_over_periodic_reports_only(tmp_path):
    """An 8-K is due four business days after an EVENT and a 424B2 has no period at all —
    including them would measure filing mix rather than timeliness."""
    from secfin.analytical.disclosure_stats import compute_disclosure_stats
    from secfin.sec.filing_index import FilingIndexEntry
    from secfin.storage.company_profile_repository import CompanyProfile
    from secfin.storage.sqlite_company_profile_repository import SQLiteCompanyProfileRepository
    from secfin.storage.sqlite_filing_index_repository import SQLiteFilingIndexRepository

    db = str(tmp_path / "b.db")
    prof = SQLiteCompanyProfileRepository(db)
    prof.upsert(CompanyProfile(cik=1, sic="3571", sic_description=None, name=None))
    prof.close()

    fi = SQLiteFilingIndexRepository(db)
    fi.upsert_filings(1, [
        # 30-day lag on a 10-Q -- the only row that should count.
        FilingIndexEntry(cik=1, accession="a1", form="10-Q", filing_date="2024-05-01",
                         acceptance_datetime="2024-05-01T16:00:00.000Z", report_date="2024-04-01"),
        # A 300-day "lag" on an 8-K would swamp the median if it were counted.
        FilingIndexEntry(cik=1, accession="a2", form="8-K", filing_date="2024-12-01",
                         acceptance_datetime="2024-12-01T16:00:00.000Z", report_date="2024-02-05"),
    ])
    fi.close()

    rows = compute_disclosure_stats(db, 2)

    assert len(rows) == 1
    assert rows[0].median_filing_lag_days == 30.0
    assert rows[0].indexed_filings == 2  # the 8-K still counts as an indexed filing

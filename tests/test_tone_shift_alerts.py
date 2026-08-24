"""Tests for the sector tone-shift leaderboard (analytical/tone_shift_alerts.py) + its store.

No network. The DuckDB compute test mirrors test_sector_governance_stats.py's structure.
"""

from __future__ import annotations

import importlib.util

import pytest

from secfin.storage.sqlite_tone_shift_alert_repository import SQLiteToneShiftAlertRepository
from secfin.storage.tone_shift_alert_repository import ToneShiftAlertRow

_HAS_DUCKDB = importlib.util.find_spec("duckdb") is not None
_needs_duckdb = pytest.mark.skipif(not _HAS_DUCKDB, reason="requires the analytical extra (duckdb)")


def _row(cik: int, **kw) -> ToneShiftAlertRow:
    base = dict(
        cik=cik, peer_group="35", company_name="TEST CO", item_code="RF",
        accession="a-2026", prior_accession="a-2025", filing_date="2026-01-01",
        cosine_similarity=0.9, jaccard_similarity=0.8,
    )
    base.update(kw)
    return ToneShiftAlertRow(**base)


def test_repo_roundtrip_by_group(tmp_path):
    repo = SQLiteToneShiftAlertRepository(str(tmp_path / "t.db"))
    repo.bulk_upsert([_row(1), _row(2), _row(3, peer_group="60")])

    assert [r.cik for r in repo.get_group("35")] == [1, 2]
    assert repo.get_group("60")[0].cik == 3
    assert repo.get_group("99") == []
    repo.close()


def test_upsert_replaces_rather_than_duplicating(tmp_path):
    repo = SQLiteToneShiftAlertRepository(str(tmp_path / "t.db"))
    repo.bulk_upsert([_row(1, cosine_similarity=0.9)])
    repo.bulk_upsert([_row(1, cosine_similarity=0.2)])

    rows = repo.get_group("35")
    assert len(rows) == 1 and rows[0].cosine_similarity == 0.2
    repo.close()


@_needs_duckdb
def test_compute_joins_similarity_to_sic_group_and_filters_to_rf_legal(tmp_path):
    from secfin.analytical.tone_shift_alerts import compute_tone_shift_alerts
    from secfin.sec.filing_index import FilingIndexEntry
    from secfin.storage.company_profile_repository import CompanyProfile
    from secfin.storage.section_similarity_repository import SectionSimilarityRow
    from secfin.storage.sqlite_company_profile_repository import SQLiteCompanyProfileRepository
    from secfin.storage.sqlite_filing_index_repository import SQLiteFilingIndexRepository
    from secfin.storage.sqlite_section_similarity_repository import (
        SQLiteSectionSimilarityRepository,
    )

    db = str(tmp_path / "b.db")

    prof = SQLiteCompanyProfileRepository(db)
    prof.upsert(CompanyProfile(cik=1, sic="3571", sic_description=None, name="ACME INC"))
    prof.close()

    fi = SQLiteFilingIndexRepository(db)
    fi.upsert_filings(1, [
        FilingIndexEntry(cik=1, accession="a-2026", form="10-K", filing_date="2026-03-01"),
    ])
    fi.close()

    sim = SQLiteSectionSimilarityRepository(db)
    sim.upsert(SectionSimilarityRow(
        cik=1, accession="a-2026", item_code="RF", prior_accession="a-2025",
        cosine_similarity=0.42, jaccard_similarity=0.3,
    ))
    # MDNA is not part of the tone-shift leaderboard's scope (RF/LEGAL only) -- must be excluded.
    sim.upsert(SectionSimilarityRow(
        cik=1, accession="a-2026", item_code="MDNA", prior_accession="a-2025",
        cosine_similarity=0.99, jaccard_similarity=0.9,
    ))
    sim.close()

    rows = compute_tone_shift_alerts(db, sic_digits=2)
    assert len(rows) == 1
    assert rows[0].item_code == "RF"
    assert rows[0].peer_group == "35"
    assert rows[0].company_name == "ACME INC"
    assert rows[0].cosine_similarity == 0.42

"""Tests for YoY section similarity (normalize/section_similarity.py) + its store. No network."""

from __future__ import annotations

import pytest

from secfin.normalize.section_similarity import compute_similarity, find_prior_accession
from secfin.sec.filing_index import FilingIndexEntry
from secfin.storage.section_similarity_repository import SectionSimilarityRow
from secfin.storage.sqlite_filing_index_repository import SQLiteFilingIndexRepository
from secfin.storage.sqlite_section_similarity_repository import (
    SQLiteSectionSimilarityRepository,
)


def test_identical_text_scores_1():
    r = compute_similarity("the quick brown fox jumps", "the quick brown fox jumps")
    assert r.cosine_similarity == pytest.approx(1.0)
    assert r.jaccard_similarity == 1.0


def test_disjoint_vocabulary_scores_0():
    r = compute_similarity("risk factors supply chain tariffs", "legal proceedings claims filed")
    assert r.cosine_similarity == 0.0
    assert r.jaccard_similarity == 0.0


def test_empty_side_returns_none_not_a_similarity_of_0():
    assert compute_similarity("some real words here", "") is None
    assert compute_similarity("", "") is None


def test_find_prior_accession_walks_newest_first_order(tmp_path):
    db = str(tmp_path / "f.db")
    fi = SQLiteFilingIndexRepository(db)
    fi.upsert_filings(1, [
        FilingIndexEntry(cik=1, accession="a-2026", form="10-K", filing_date="2026-01-01"),
        FilingIndexEntry(cik=1, accession="a-2025", form="10-K", filing_date="2025-01-01"),
        FilingIndexEntry(cik=1, accession="a-2024", form="10-K", filing_date="2024-01-01"),
    ])
    assert find_prior_accession(fi, 1, "10-K", "a-2026") == "a-2025"
    assert find_prior_accession(fi, 1, "10-K", "a-2024") is None  # oldest on file
    assert find_prior_accession(fi, 1, "10-K", "a-unknown") is None
    fi.close()


def test_repo_roundtrip_and_schema_version_healing(tmp_path):
    from secfin.normalize.section_similarity import SIMILARITY_SCHEMA_VERSION

    repo = SQLiteSectionSimilarityRepository(str(tmp_path / "s.db"))
    row = SectionSimilarityRow(
        cik=1, accession="a-2026", item_code="RF", prior_accession="a-2025",
        cosine_similarity=0.87, jaccard_similarity=0.72,
    )
    repo.upsert(row)

    got = repo.get(1, "a-2026", "RF")
    assert got.cosine_similarity == 0.87
    assert repo.get(1, "a-2026", "LEGAL") is None

    repo._conn.execute(
        "UPDATE section_similarity SET schema_version = ? WHERE cik = 1 AND accession = 'a-2026'",
        (SIMILARITY_SCHEMA_VERSION - 1,),
    )
    repo._conn.commit()
    assert repo.get(1, "a-2026", "RF") is None
    repo.close()

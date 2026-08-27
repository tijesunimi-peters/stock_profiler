"""Tests for the CAM-matters store (storage/sqlite_filing_cam_repository.py). No network, no
`narrative` extra needed -- pure SQLite, independent of whatever computed the rows.
"""

from __future__ import annotations

from secfin.sec.filing_cam import CamMatterResult
from secfin.storage.sqlite_filing_cam_repository import SQLiteFilingCamRepository


def test_roundtrip_preserves_order_and_fields(tmp_path):
    repo = SQLiteFilingCamRepository(str(tmp_path / "c.db"))
    matters = [
        CamMatterResult(
            ordinal=1, title_text="Revenue Recognition", cleaned_text="some text", word_count=200,
        ),
        CamMatterResult(ordinal=2, title_text=None, cleaned_text="more text", word_count=150),
    ]
    repo.upsert_matters(1, "acc-1", matters)

    got = repo.get_matters(1, "acc-1")
    assert len(got) == 2
    assert got[0].title_text == "Revenue Recognition"
    assert got[0].word_count == 200
    assert got[1].title_text is None
    assert got[1].word_count == 150
    repo.close()


def test_unknown_filing_returns_empty_list(tmp_path):
    repo = SQLiteFilingCamRepository(str(tmp_path / "c.db"))
    assert repo.get_matters(1, "acc-missing") == []
    repo.close()


def test_na_row_is_stored_and_returned(tmp_path):
    repo = SQLiteFilingCamRepository(str(tmp_path / "c.db"))
    na = CamMatterResult(
        ordinal=1, title_text=None, cleaned_text="", word_count=0, status="na",
        reason="No recognizable Critical Audit Matters disclaimer found.",
    )
    repo.upsert_matters(1, "acc-1", [na])

    got = repo.get_matters(1, "acc-1")
    assert len(got) == 1
    assert got[0].status == "na"
    assert got[0].reason == "No recognizable Critical Audit Matters disclaimer found."
    repo.close()


def test_upsert_replaces_prior_matters_wholesale(tmp_path):
    repo = SQLiteFilingCamRepository(str(tmp_path / "c.db"))
    repo.upsert_matters(1, "acc-1", [
        CamMatterResult(ordinal=1, title_text="A", cleaned_text="a", word_count=100),
        CamMatterResult(ordinal=2, title_text="B", cleaned_text="b", word_count=100),
        CamMatterResult(ordinal=3, title_text="C", cleaned_text="c", word_count=100),
    ])
    # A re-parse under a newer algorithm finding FEWER matters must not leave stale trailing rows.
    repo.upsert_matters(1, "acc-1", [
        CamMatterResult(ordinal=1, title_text="Only One Now", cleaned_text="x", word_count=100),
    ])

    got = repo.get_matters(1, "acc-1")
    assert len(got) == 1
    assert got[0].title_text == "Only One Now"
    repo.close()


def test_filings_are_independent(tmp_path):
    repo = SQLiteFilingCamRepository(str(tmp_path / "c.db"))
    a = CamMatterResult(ordinal=1, title_text="A", cleaned_text="a", word_count=100)
    b = CamMatterResult(ordinal=1, title_text="B", cleaned_text="b", word_count=100)
    repo.upsert_matters(1, "acc-2025", [a])
    repo.upsert_matters(1, "acc-2026", [b])
    assert len(repo.get_matters(1, "acc-2025")) == 1
    assert repo.get_matters(1, "acc-2025")[0].title_text == "A"
    assert repo.get_matters(1, "acc-2026")[0].title_text == "B"
    repo.close()


def test_schema_version_healing(tmp_path):
    from secfin.sec.filing_cam import CAM_SCHEMA_VERSION

    repo = SQLiteFilingCamRepository(str(tmp_path / "c.db"))
    repo.upsert_matters(1, "acc-1", [
        CamMatterResult(ordinal=1, title_text="A", cleaned_text="a", word_count=100),
    ])
    assert len(repo.get_matters(1, "acc-1")) == 1

    repo._conn.execute(
        "UPDATE filing_cam_matters SET schema_version = ? WHERE cik = 1 AND accession = 'acc-1'",
        (CAM_SCHEMA_VERSION - 1,),
    )
    repo._conn.commit()
    # A row written under an older schema version reads as a cache MISS, not stale data.
    assert repo.get_matters(1, "acc-1") == []
    repo.close()

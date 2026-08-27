"""Tests for the section-sentence-embeddings store (storage/sqlite_section_embedding_repository.py).
No network, no `narrative` extra needed -- storage is pure stdlib (`array`), independent of
whatever computed the vectors.
"""

from __future__ import annotations

from secfin.storage.sqlite_section_embedding_repository import SQLiteSectionEmbeddingRepository


def test_roundtrip_preserves_order_and_values(tmp_path):
    repo = SQLiteSectionEmbeddingRepository(str(tmp_path / "e.db"))
    vectors = [[0.1, 0.2, 0.3], [0.4, 0.5, 0.6], [-0.7, 0.0, 1.0]]
    repo.upsert_embeddings(1, "a-2026", "RF", vectors)

    got = repo.get_embeddings(1, "a-2026", "RF")
    assert len(got) == 3
    for expected, actual in zip(vectors, got, strict=True):
        for e, a in zip(expected, actual, strict=True):
            assert abs(e - a) < 1e-6  # float32 round-trip, not exact
    repo.close()


def test_unknown_section_returns_empty_list(tmp_path):
    repo = SQLiteSectionEmbeddingRepository(str(tmp_path / "e.db"))
    assert repo.get_embeddings(1, "a-2026", "RF") == []
    repo.close()


def test_upsert_replaces_prior_embeddings_wholesale(tmp_path):
    repo = SQLiteSectionEmbeddingRepository(str(tmp_path / "e.db"))
    repo.upsert_embeddings(1, "a-2026", "RF", [[0.1, 0.2], [0.3, 0.4], [0.5, 0.6]])
    # A re-embed with FEWER sentences than before must not leave the third row behind.
    repo.upsert_embeddings(1, "a-2026", "RF", [[0.9, 0.9]])

    got = repo.get_embeddings(1, "a-2026", "RF")
    assert len(got) == 1
    assert abs(got[0][0] - 0.9) < 1e-6
    repo.close()


def test_empty_embeddings_list_clears_prior_rows(tmp_path):
    repo = SQLiteSectionEmbeddingRepository(str(tmp_path / "e.db"))
    repo.upsert_embeddings(1, "a-2026", "RF", [[0.1, 0.2]])
    repo.upsert_embeddings(1, "a-2026", "RF", [])
    assert repo.get_embeddings(1, "a-2026", "RF") == []
    repo.close()


def test_item_codes_are_independent(tmp_path):
    repo = SQLiteSectionEmbeddingRepository(str(tmp_path / "e.db"))
    repo.upsert_embeddings(1, "a-2026", "RF", [[0.1, 0.2]])
    repo.upsert_embeddings(1, "a-2026", "LEGAL", [[0.9, 0.8]])
    assert len(repo.get_embeddings(1, "a-2026", "RF")) == 1
    assert len(repo.get_embeddings(1, "a-2026", "LEGAL")) == 1
    repo.close()


def test_schema_version_healing(tmp_path):
    from secfin.normalize.section_embeddings import EMBEDDINGS_SCHEMA_VERSION

    repo = SQLiteSectionEmbeddingRepository(str(tmp_path / "e.db"))
    repo.upsert_embeddings(1, "a-2026", "RF", [[0.1, 0.2]])
    assert len(repo.get_embeddings(1, "a-2026", "RF")) == 1

    repo._conn.execute(
        "UPDATE section_sentence_embeddings SET schema_version = ? "
        "WHERE cik = 1 AND accession = 'a-2026'",
        (EMBEDDINGS_SCHEMA_VERSION - 1,),
    )
    repo._conn.commit()
    # A row written under an older schema version reads as a cache MISS, not stale data.
    assert repo.get_embeddings(1, "a-2026", "RF") == []
    repo.close()

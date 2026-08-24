"""SQLite implementation of the section-similarity store. See section_similarity_repository.py."""

from __future__ import annotations

from pathlib import Path

from secfin.normalize.section_similarity import SIMILARITY_SCHEMA_VERSION
from secfin.storage.connection import connect
from secfin.storage.section_similarity_repository import (
    SectionSimilarityRepository,
    SectionSimilarityRow,
)

_COLS = (
    "cik, accession, item_code, prior_accession, cosine_similarity, jaccard_similarity, "
    "schema_version"
)

_SCHEMA = """
CREATE TABLE IF NOT EXISTS section_similarity (
    cik INTEGER NOT NULL,
    accession TEXT NOT NULL,
    item_code TEXT NOT NULL,
    prior_accession TEXT NOT NULL,
    cosine_similarity REAL NOT NULL,
    jaccard_similarity REAL NOT NULL,
    schema_version INTEGER,
    PRIMARY KEY (cik, accession, item_code)
);
"""

_UPSERT = f"""
INSERT INTO section_similarity ({_COLS})
VALUES (?, ?, ?, ?, ?, ?, ?)
ON CONFLICT (cik, accession, item_code) DO UPDATE SET
    prior_accession = excluded.prior_accession,
    cosine_similarity = excluded.cosine_similarity,
    jaccard_similarity = excluded.jaccard_similarity,
    schema_version = excluded.schema_version
"""


class SQLiteSectionSimilarityRepository(SectionSimilarityRepository):
    def __init__(self, db_path: str | Path) -> None:
        self._db_path = Path(db_path)
        self._conn = connect(self._db_path)
        self._conn.executescript(_SCHEMA)

    def upsert(self, row: SectionSimilarityRow) -> None:
        self._conn.execute(
            _UPSERT,
            (
                row.cik, row.accession, row.item_code, row.prior_accession,
                row.cosine_similarity, row.jaccard_similarity, SIMILARITY_SCHEMA_VERSION,
            ),
        )
        self._conn.commit()

    def get(self, cik: int, accession: str, item_code: str) -> SectionSimilarityRow | None:
        cur = self._conn.execute(
            "SELECT cik, accession, item_code, prior_accession, cosine_similarity, "
            "jaccard_similarity, schema_version FROM section_similarity "
            "WHERE cik = ? AND accession = ? AND item_code = ?",
            (cik, accession, item_code),
        )
        r = cur.fetchone()
        if not r or (r[6] or 0) < SIMILARITY_SCHEMA_VERSION:
            return None
        return SectionSimilarityRow(
            cik=r[0], accession=r[1], item_code=r[2], prior_accession=r[3],
            cosine_similarity=r[4], jaccard_similarity=r[5],
        )

    def close(self) -> None:
        self._conn.close()

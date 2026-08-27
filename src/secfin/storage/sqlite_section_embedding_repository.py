"""SQLite implementation of the section-sentence-embeddings store. See
section_embedding_repository.py.

Vectors are packed as raw `array('f', ...)` bytes (stdlib, not numpy) -- a repository stays
dependency-free like every other one in `storage/`, even though the module that COMPUTES these
vectors (`normalize/section_embeddings.py`) does depend on the `narrative` extra. Storage and
computation are separate concerns; only the latter needs fastembed/numpy.
"""

from __future__ import annotations

from array import array
from pathlib import Path

from secfin.normalize.section_embeddings import EMBEDDINGS_SCHEMA_VERSION
from secfin.storage.connection import connect
from secfin.storage.section_embedding_repository import SectionEmbeddingRepository

_SCHEMA = """
CREATE TABLE IF NOT EXISTS section_sentence_embeddings (
    cik INTEGER NOT NULL,
    accession TEXT NOT NULL,
    item_code TEXT NOT NULL,
    sentence_index INTEGER NOT NULL,
    embedding BLOB NOT NULL,
    schema_version INTEGER NOT NULL,
    PRIMARY KEY (cik, accession, item_code, sentence_index)
);
CREATE INDEX IF NOT EXISTS idx_section_sentence_embeddings_section
    ON section_sentence_embeddings (cik, accession, item_code);
"""

_DELETE = """
DELETE FROM section_sentence_embeddings WHERE cik = ? AND accession = ? AND item_code = ?
"""

_INSERT = """
INSERT INTO section_sentence_embeddings
    (cik, accession, item_code, sentence_index, embedding, schema_version)
VALUES (?, ?, ?, ?, ?, ?)
"""

_SELECT = """
SELECT sentence_index, embedding, schema_version FROM section_sentence_embeddings
WHERE cik = ? AND accession = ? AND item_code = ?
ORDER BY sentence_index
"""


def _pack(vector: list[float]) -> bytes:
    return array("f", vector).tobytes()


def _unpack(blob: bytes) -> list[float]:
    vec: array = array("f")
    vec.frombytes(blob)
    return vec.tolist()


class SQLiteSectionEmbeddingRepository(SectionEmbeddingRepository):
    def __init__(self, db_path: str | Path) -> None:
        self._db_path = Path(db_path)
        self._conn = connect(self._db_path)
        self._conn.executescript(_SCHEMA)

    def upsert_embeddings(
        self, cik: int, accession: str, item_code: str, embeddings: list[list[float]]
    ) -> None:
        self._conn.execute("BEGIN")
        try:
            # DELETE-then-INSERT (not an upsert-per-row) so a re-embed with fewer sentences than
            # last time never leaves stale trailing rows behind -- see the ABC's docstring.
            self._conn.execute(_DELETE, (cik, accession, item_code))
            if embeddings:
                self._conn.executemany(
                    _INSERT,
                    [
                        (cik, accession, item_code, i, _pack(vec), EMBEDDINGS_SCHEMA_VERSION)
                        for i, vec in enumerate(embeddings)
                    ],
                )
            self._conn.execute("COMMIT")
        except Exception:
            self._conn.execute("ROLLBACK")
            raise

    def get_embeddings(self, cik: int, accession: str, item_code: str) -> list[list[float]]:
        cur = self._conn.execute(_SELECT, (cik, accession, item_code))
        rows = cur.fetchall()
        if not rows:
            return []
        # A row written under an older schema version is a cache MISS -- same convention as
        # SQLiteFilingSectionRepository.get_sections. One upsert_embeddings call stamps every row
        # for a section with the same version, so checking the first row stands in for all of them.
        if (rows[0][2] or 0) < EMBEDDINGS_SCHEMA_VERSION:
            return []
        return [_unpack(r[1]) for r in rows]

    def close(self) -> None:
        self._conn.close()

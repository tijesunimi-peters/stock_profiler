"""SQLite implementation of the CAM-matters store. See filing_cam_repository.py."""

from __future__ import annotations

from pathlib import Path

from secfin.sec.filing_cam import CAM_SCHEMA_VERSION, CamMatterResult
from secfin.storage.connection import connect
from secfin.storage.filing_cam_repository import FilingCamRepository

_COLS = (
    "cik, accession, ordinal, title_text, cleaned_text, word_count, "
    "status, reason, schema_version"
)

_SCHEMA = """
CREATE TABLE IF NOT EXISTS filing_cam_matters (
    cik INTEGER NOT NULL,
    accession TEXT NOT NULL,
    ordinal INTEGER NOT NULL,
    title_text TEXT,
    cleaned_text TEXT,
    word_count INTEGER,
    status TEXT NOT NULL,
    reason TEXT,
    schema_version INTEGER,
    PRIMARY KEY (cik, accession, ordinal)
);
CREATE INDEX IF NOT EXISTS idx_filing_cam_matters_cik_accession
    ON filing_cam_matters (cik, accession);
"""

_DELETE = "DELETE FROM filing_cam_matters WHERE cik = ? AND accession = ?"

_INSERT = f"""
INSERT INTO filing_cam_matters ({_COLS})
VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
"""


def _row(r: tuple) -> CamMatterResult:
    return CamMatterResult(
        ordinal=int(r[0]),
        title_text=r[1],
        cleaned_text=r[2] or "",
        word_count=int(r[3] or 0),
        status=r[4],
        reason=r[5],
    )


class SQLiteFilingCamRepository(FilingCamRepository):
    def __init__(self, db_path: str | Path) -> None:
        self._db_path = Path(db_path)
        self._conn = connect(self._db_path)
        self._conn.executescript(_SCHEMA)

    def upsert_matters(self, cik: int, accession: str, matters: list[CamMatterResult]) -> None:
        self._conn.execute("BEGIN")
        try:
            self._conn.execute(_DELETE, (cik, accession))
            if matters:
                self._conn.executemany(
                    _INSERT,
                    [
                        (
                            cik, accession, m.ordinal, m.title_text, m.cleaned_text,
                            m.word_count, m.status, m.reason, CAM_SCHEMA_VERSION,
                        )
                        for m in matters
                    ],
                )
            self._conn.execute("COMMIT")
        except Exception:
            self._conn.execute("ROLLBACK")
            raise

    def get_matters(self, cik: int, accession: str) -> list[CamMatterResult]:
        cur = self._conn.execute(
            "SELECT ordinal, title_text, cleaned_text, word_count, status, reason, schema_version "
            "FROM filing_cam_matters WHERE cik = ? AND accession = ? ORDER BY ordinal",
            (cik, accession),
        )
        rows = cur.fetchall()
        if not rows:
            return []
        # A row written under an older schema version is a cache MISS -- same convention as
        # SQLiteFilingSectionRepository.get_sections. One upsert_matters call stamps every row
        # for a filing with the same version, so checking the first row stands in for all of them.
        if (rows[0][6] or 0) < CAM_SCHEMA_VERSION:
            return []
        return [_row(r[:6]) for r in rows]

    def close(self) -> None:
        self._conn.close()

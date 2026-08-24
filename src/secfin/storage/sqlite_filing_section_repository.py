"""SQLite implementation of the filing-sections store. See filing_section_repository.py."""

from __future__ import annotations

from pathlib import Path

from secfin.sec.filing_sections import SECTIONS_SCHEMA_VERSION, SectionResult
from secfin.storage.connection import connect
from secfin.storage.filing_section_repository import FilingSectionRepository

_COLS = (
    "cik, accession, item_code, section_name, cleaned_text, word_count, sentence_count, "
    "status, reason, schema_version"
)

_SCHEMA = """
CREATE TABLE IF NOT EXISTS filing_sections (
    cik INTEGER NOT NULL,
    accession TEXT NOT NULL,
    item_code TEXT NOT NULL,
    section_name TEXT,
    cleaned_text TEXT,
    word_count INTEGER,
    sentence_count INTEGER,
    status TEXT NOT NULL,
    reason TEXT,
    schema_version INTEGER,
    PRIMARY KEY (cik, accession, item_code)
);
CREATE INDEX IF NOT EXISTS idx_filing_sections_cik_accession
    ON filing_sections (cik, accession);
"""

_UPSERT = f"""
INSERT INTO filing_sections ({_COLS})
VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
ON CONFLICT (cik, accession, item_code) DO UPDATE SET
    section_name = excluded.section_name,
    cleaned_text = excluded.cleaned_text,
    word_count = excluded.word_count,
    sentence_count = excluded.sentence_count,
    status = excluded.status,
    reason = excluded.reason,
    schema_version = excluded.schema_version
"""


def _row(r: tuple) -> SectionResult:
    return SectionResult(
        item_code=r[0],
        section_name=r[1],
        cleaned_text=r[2] or "",
        word_count=int(r[3] or 0),
        sentence_count=int(r[4] or 0),
        status=r[5],
        reason=r[6],
    )


class SQLiteFilingSectionRepository(FilingSectionRepository):
    def __init__(self, db_path: str | Path) -> None:
        self._db_path = Path(db_path)
        self._conn = connect(self._db_path)
        self._conn.executescript(_SCHEMA)

    def upsert_sections(self, cik: int, accession: str, sections: list[SectionResult]) -> None:
        if not sections:
            return
        self._conn.execute("BEGIN")
        try:
            self._conn.executemany(
                _UPSERT,
                [
                    (
                        cik, accession, s.item_code, s.section_name, s.cleaned_text,
                        s.word_count, s.sentence_count, s.status, s.reason,
                        SECTIONS_SCHEMA_VERSION,
                    )
                    for s in sections
                ],
            )
            self._conn.execute("COMMIT")
        except Exception:
            self._conn.execute("ROLLBACK")
            raise

    def get_sections(self, cik: int, accession: str) -> dict[str, SectionResult]:
        cur = self._conn.execute(
            "SELECT item_code, section_name, cleaned_text, word_count, sentence_count, "
            "status, reason, schema_version FROM filing_sections WHERE cik = ? AND accession = ?",
            (cik, accession),
        )
        out: dict[str, SectionResult] = {}
        for r in cur.fetchall():
            # A row written under an older schema version is a cache MISS, not an answer -- same
            # convention as SQLiteFilingCoverRepository.get_cover's COVER_SCHEMA_VERSION check.
            if (r[7] or 0) < SECTIONS_SCHEMA_VERSION:
                continue
            out[r[0]] = _row(r[:7])
        return out

    def close(self) -> None:
        self._conn.close()

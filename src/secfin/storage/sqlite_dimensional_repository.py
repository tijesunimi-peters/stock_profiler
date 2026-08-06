"""SQLite implementation of the per-company dimensional store. See its interface."""

from __future__ import annotations

import sqlite3
from pathlib import Path

from secfin.storage.dimensional_repository import DimensionalFact, DimensionalRepository

_SCHEMA = """
CREATE TABLE IF NOT EXISTS dimensional_facts (
    cik INTEGER NOT NULL,
    accession TEXT NOT NULL,
    axis TEXT NOT NULL,
    member TEXT NOT NULL,
    tag TEXT NOT NULL,
    ddate TEXT NOT NULL,
    qtrs TEXT NOT NULL,
    value REAL NOT NULL,
    unit TEXT NOT NULL DEFAULT 'USD',
    fiscal_year INTEGER NOT NULL,
    form TEXT NOT NULL DEFAULT '10-K',
    PRIMARY KEY (cik, accession, axis, member, tag, ddate, qtrs)
);

CREATE INDEX IF NOT EXISTS idx_dimensional_facts_cik_axis
    ON dimensional_facts (cik, axis, fiscal_year DESC);
"""

_COLS = "cik, accession, axis, member, tag, ddate, qtrs, value, unit, fiscal_year, form"


class SQLiteDimensionalRepository(DimensionalRepository):
    def __init__(self, db_path: str | Path) -> None:
        self._db_path = Path(db_path)
        self._db_path.parent.mkdir(parents=True, exist_ok=True)
        self._conn = sqlite3.connect(self._db_path, isolation_level=None)
        self._conn.execute("PRAGMA journal_mode=WAL")
        self._conn.execute("PRAGMA synchronous=NORMAL")
        self._conn.executescript(_SCHEMA)

    def bulk_upsert(self, rows: list[DimensionalFact]) -> int:
        if not rows:
            return 0
        self._conn.execute("BEGIN")
        try:
            self._conn.executemany(
                f"INSERT OR REPLACE INTO dimensional_facts ({_COLS}) "
                f"VALUES ({','.join('?' * 11)})",
                [tuple(r) for r in rows],
            )
            self._conn.execute("COMMIT")
        except BaseException:
            self._conn.execute("ROLLBACK")
            raise
        return len(rows)

    def facts_for_cik(self, cik: int, axis: str | None = None) -> list[DimensionalFact]:
        sql = f"SELECT {_COLS} FROM dimensional_facts WHERE cik = ?"
        params: list = [cik]
        if axis:
            sql += " AND axis = ?"
            params.append(axis)
        sql += " ORDER BY fiscal_year DESC, axis, member, tag"
        return [DimensionalFact(*r) for r in self._conn.execute(sql, tuple(params))]

    def count(self) -> int:
        return self._conn.execute("SELECT COUNT(*) FROM dimensional_facts").fetchone()[0]

    def close(self) -> None:
        self._conn.close()

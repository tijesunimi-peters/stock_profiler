"""SQLite implementation of the dimensional geographic-revenue repository. See
dimensional_geo_repository.py.

Own connection to the same db file (fine under WAL mode). The bounded DERA ingest writes here
through this repo (single writer -- guardrail 8); the offline rollup batch reads it. Nothing on the
live request path touches this table.
"""

from __future__ import annotations

import sqlite3
from pathlib import Path

from secfin.storage.dimensional_geo_repository import (
    DimensionalGeoRepository,
    DimensionalGeoRow,
)

_COLS = "cik, accession, tag, ddate, qtrs, member, value, unit, is_consolidated, fiscal_year, form"

_SCHEMA = """
CREATE TABLE IF NOT EXISTS dimensional_geo_facts (
    cik INTEGER NOT NULL,
    accession TEXT NOT NULL,
    tag TEXT NOT NULL,
    ddate TEXT NOT NULL,
    qtrs TEXT NOT NULL,
    member TEXT NOT NULL,           -- '' for the consolidated (non-dimensional) total row
    value REAL NOT NULL,
    unit TEXT NOT NULL,
    is_consolidated INTEGER NOT NULL,
    fiscal_year INTEGER NOT NULL,
    form TEXT NOT NULL,
    PRIMARY KEY (cik, accession, tag, ddate, qtrs, member)
);
CREATE INDEX IF NOT EXISTS idx_dgf_fy ON dimensional_geo_facts (fiscal_year);
"""

_UPSERT = f"""
INSERT INTO dimensional_geo_facts ({_COLS})
VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
ON CONFLICT (cik, accession, tag, ddate, qtrs, member) DO UPDATE SET
    value = excluded.value,
    unit = excluded.unit,
    is_consolidated = excluded.is_consolidated,
    fiscal_year = excluded.fiscal_year,
    form = excluded.form
"""


def _to_db(r: DimensionalGeoRow) -> tuple:
    return (
        r.cik, r.accession, r.tag, r.ddate, r.qtrs, r.member, r.value, r.unit,
        1 if r.is_consolidated else 0, r.fiscal_year, r.form,
    )


def _from_db(row: tuple) -> DimensionalGeoRow:
    return DimensionalGeoRow(
        cik=row[0], accession=row[1], tag=row[2], ddate=row[3], qtrs=row[4], member=row[5],
        value=row[6], unit=row[7], is_consolidated=bool(row[8]), fiscal_year=row[9], form=row[10],
    )


class SQLiteDimensionalGeoRepository(DimensionalGeoRepository):
    def __init__(self, db_path: str | Path) -> None:
        self._db_path = Path(db_path)
        self._db_path.parent.mkdir(parents=True, exist_ok=True)
        self._conn = sqlite3.connect(self._db_path, isolation_level=None)
        self._conn.execute("PRAGMA journal_mode=WAL")
        self._conn.execute("PRAGMA synchronous=NORMAL")
        self._conn.executescript(_SCHEMA)

    def bulk_upsert(self, rows: list[DimensionalGeoRow]) -> None:
        if not rows:
            return
        self._conn.execute("BEGIN")
        try:
            self._conn.executemany(_UPSERT, [_to_db(r) for r in rows])
            self._conn.execute("COMMIT")
        except BaseException:
            self._conn.execute("ROLLBACK")
            raise

    def rows_for_fiscal_year(self, fiscal_year: int) -> list[DimensionalGeoRow]:
        cur = self._conn.execute(
            f"SELECT {_COLS} FROM dimensional_geo_facts WHERE fiscal_year = ?", (fiscal_year,)
        )
        return [_from_db(r) for r in cur.fetchall()]

    def fiscal_years(self) -> list[int]:
        cur = self._conn.execute(
            "SELECT DISTINCT fiscal_year FROM dimensional_geo_facts ORDER BY fiscal_year DESC"
        )
        return [r[0] for r in cur.fetchall()]

    def count(self) -> int:
        return self._conn.execute("SELECT COUNT(*) FROM dimensional_geo_facts").fetchone()[0]

    def clear(self) -> None:
        self._conn.execute("DELETE FROM dimensional_geo_facts")

    def close(self) -> None:
        self._conn.close()

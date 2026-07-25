"""SQLite implementation of the sector geographic-mix repository. See
sector_geographic_mix_repository.py.

Own connection to the same db file (fine under WAL mode). The offline batch writes here through this
repo; the serving endpoint reads it as plain point lookups (no DuckDB on the request path).
"""

from __future__ import annotations

import sqlite3
from pathlib import Path

from secfin.storage.sector_geographic_mix_repository import (
    SectorGeographicMixRepository,
    SectorGeographicMixRow,
)

_COLS = (
    "peer_group, fiscal_year, domestic, international, other, unit, company_count, "
    "companies_in_scope, excluded_unreconciled_count, revenue_covered_share, as_of"
)

_SCHEMA = """
CREATE TABLE IF NOT EXISTS sector_geographic_mix (
    peer_group TEXT NOT NULL,
    fiscal_year INTEGER NOT NULL,
    domestic REAL NOT NULL,
    international REAL NOT NULL,
    other REAL NOT NULL,
    unit TEXT NOT NULL DEFAULT 'USD',
    company_count INTEGER NOT NULL,
    companies_in_scope INTEGER NOT NULL,
    excluded_unreconciled_count INTEGER NOT NULL,
    revenue_covered_share REAL NOT NULL,
    as_of TEXT NOT NULL,
    PRIMARY KEY (peer_group, fiscal_year)
);
CREATE INDEX IF NOT EXISTS idx_sgm_fy ON sector_geographic_mix (fiscal_year);
"""

_UPSERT = f"""
INSERT INTO sector_geographic_mix ({_COLS})
VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
ON CONFLICT (peer_group, fiscal_year) DO UPDATE SET
    domestic = excluded.domestic,
    international = excluded.international,
    other = excluded.other,
    unit = excluded.unit,
    company_count = excluded.company_count,
    companies_in_scope = excluded.companies_in_scope,
    excluded_unreconciled_count = excluded.excluded_unreconciled_count,
    revenue_covered_share = excluded.revenue_covered_share,
    as_of = excluded.as_of
"""


class SQLiteSectorGeographicMixRepository(SectorGeographicMixRepository):
    def __init__(self, db_path: str | Path) -> None:
        self._db_path = Path(db_path)
        self._db_path.parent.mkdir(parents=True, exist_ok=True)
        self._conn = sqlite3.connect(self._db_path, isolation_level=None)
        self._conn.execute("PRAGMA journal_mode=WAL")
        self._conn.execute("PRAGMA synchronous=NORMAL")
        self._conn.executescript(_SCHEMA)

    def bulk_upsert(self, rows: list[SectorGeographicMixRow]) -> None:
        if not rows:
            return
        self._conn.execute("BEGIN")
        try:
            self._conn.executemany(_UPSERT, [tuple(r) for r in rows])
            self._conn.execute("COMMIT")
        except BaseException:
            self._conn.execute("ROLLBACK")
            raise

    def clear(self) -> None:
        self._conn.execute("DELETE FROM sector_geographic_mix")

    def get(
        self, peer_group: str, fiscal_year: int | None = None
    ) -> SectorGeographicMixRow | None:
        if fiscal_year is None:
            cur = self._conn.execute(
                f"SELECT {_COLS} FROM sector_geographic_mix WHERE peer_group = ? "
                "ORDER BY fiscal_year DESC LIMIT 1",
                (peer_group,),
            )
        else:
            cur = self._conn.execute(
                f"SELECT {_COLS} FROM sector_geographic_mix "
                "WHERE peer_group = ? AND fiscal_year = ?",
                (peer_group, fiscal_year),
            )
        row = cur.fetchone()
        return SectorGeographicMixRow(*row) if row is not None else None

    def latest_fiscal_year(self) -> int | None:
        row = self._conn.execute(
            "SELECT MAX(fiscal_year) FROM sector_geographic_mix"
        ).fetchone()
        return row[0] if row and row[0] is not None else None

    def count(self) -> int:
        return self._conn.execute("SELECT COUNT(*) FROM sector_geographic_mix").fetchone()[0]

    def close(self) -> None:
        self._conn.close()

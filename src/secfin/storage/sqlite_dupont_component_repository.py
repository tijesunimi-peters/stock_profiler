"""SQLite implementation of the DuPont-component repository. See dupont_component_repository.py.

Own connection to the same db file (fine under WAL mode). `ingest/dupont_backfill.py` writes here;
the analytical batch reads the table straight through DuckDB's `ATTACH ... (TYPE sqlite)`, so this
repo's surface is deliberately just write + housekeeping (no per-CIK serving read)."""

from __future__ import annotations

import sqlite3
from pathlib import Path

from secfin.storage.dupont_component_repository import (
    DupontComponentRepository,
    DupontComponentRow,
)

_SCHEMA = """
CREATE TABLE IF NOT EXISTS dupont_components (
    cik INTEGER NOT NULL,
    fiscal_year INTEGER NOT NULL,
    fiscal_period TEXT NOT NULL,
    period_end TEXT NOT NULL,
    net_income REAL NOT NULL,
    revenue REAL NOT NULL,
    avg_assets REAL NOT NULL,
    avg_equity REAL NOT NULL,
    approximate INTEGER NOT NULL,
    PRIMARY KEY (cik, fiscal_year, fiscal_period)
);
"""

_UPSERT_SQL = """
INSERT INTO dupont_components
    (cik, fiscal_year, fiscal_period, period_end,
     net_income, revenue, avg_assets, avg_equity, approximate)
VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
ON CONFLICT (cik, fiscal_year, fiscal_period) DO UPDATE SET
    period_end = excluded.period_end,
    net_income = excluded.net_income,
    revenue = excluded.revenue,
    avg_assets = excluded.avg_assets,
    avg_equity = excluded.avg_equity,
    approximate = excluded.approximate
"""


class SQLiteDupontComponentRepository(DupontComponentRepository):
    def __init__(self, db_path: str | Path) -> None:
        self._db_path = Path(db_path)
        self._db_path.parent.mkdir(parents=True, exist_ok=True)
        self._conn = sqlite3.connect(self._db_path, isolation_level=None)
        self._conn.execute("PRAGMA journal_mode=WAL")
        self._conn.execute("PRAGMA synchronous=NORMAL")
        self._conn.executescript(_SCHEMA)

    def bulk_upsert(self, rows: list[DupontComponentRow]) -> None:
        if not rows:
            return
        params = [
            (
                r.cik,
                r.fiscal_year,
                r.fiscal_period,
                r.period_end,
                r.net_income,
                r.revenue,
                r.avg_assets,
                r.avg_equity,
                int(r.approximate),
            )
            for r in rows
        ]
        self._conn.execute("BEGIN")
        try:
            self._conn.executemany(_UPSERT_SQL, params)
            self._conn.execute("COMMIT")
        except BaseException:
            self._conn.execute("ROLLBACK")
            raise

    def clear(self) -> None:
        self._conn.execute("DELETE FROM dupont_components")

    def count(self) -> int:
        return self._conn.execute("SELECT COUNT(*) FROM dupont_components").fetchone()[0]

    def close(self) -> None:
        self._conn.close()

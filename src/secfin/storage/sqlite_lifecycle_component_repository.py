"""SQLite implementation of the lifecycle-component repository. See
lifecycle_component_repository.py.

Own connection to the same db file (fine under WAL mode). `ingest/lifecycle_backfill.py` writes
here; the analytical batch reads the table straight through DuckDB's `ATTACH ... (TYPE sqlite)`, so
this repo's surface is deliberately just write + housekeeping (no per-CIK serving read)."""

from __future__ import annotations

import sqlite3
from pathlib import Path

from secfin.storage.lifecycle_component_repository import (
    LifecycleComponentRepository,
    LifecycleComponentRow,
)

_SCHEMA = """
CREATE TABLE IF NOT EXISTS lifecycle_components (
    cik INTEGER NOT NULL,
    fiscal_year INTEGER NOT NULL,
    fiscal_period TEXT NOT NULL,
    period_end TEXT NOT NULL,
    inventory REAL NOT NULL,
    accounts_payable REAL NOT NULL,
    accounts_receivable REAL NOT NULL,
    cost_of_revenue REAL NOT NULL,
    revenue REAL NOT NULL,
    approximate INTEGER NOT NULL,
    PRIMARY KEY (cik, fiscal_year, fiscal_period)
);
"""

_UPSERT_SQL = """
INSERT INTO lifecycle_components
    (cik, fiscal_year, fiscal_period, period_end,
     inventory, accounts_payable, accounts_receivable, cost_of_revenue, revenue, approximate)
VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
ON CONFLICT (cik, fiscal_year, fiscal_period) DO UPDATE SET
    period_end = excluded.period_end,
    inventory = excluded.inventory,
    accounts_payable = excluded.accounts_payable,
    accounts_receivable = excluded.accounts_receivable,
    cost_of_revenue = excluded.cost_of_revenue,
    revenue = excluded.revenue,
    approximate = excluded.approximate
"""


class SQLiteLifecycleComponentRepository(LifecycleComponentRepository):
    def __init__(self, db_path: str | Path) -> None:
        self._db_path = Path(db_path)
        self._db_path.parent.mkdir(parents=True, exist_ok=True)
        self._conn = sqlite3.connect(self._db_path, isolation_level=None)
        self._conn.execute("PRAGMA journal_mode=WAL")
        self._conn.execute("PRAGMA synchronous=NORMAL")
        self._conn.executescript(_SCHEMA)

    def bulk_upsert(self, rows: list[LifecycleComponentRow]) -> None:
        if not rows:
            return
        params = [
            (
                r.cik,
                r.fiscal_year,
                r.fiscal_period,
                r.period_end,
                r.inventory,
                r.accounts_payable,
                r.accounts_receivable,
                r.cost_of_revenue,
                r.revenue,
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
        self._conn.execute("DELETE FROM lifecycle_components")

    def count(self) -> int:
        return self._conn.execute("SELECT COUNT(*) FROM lifecycle_components").fetchone()[0]

    def close(self) -> None:
        self._conn.close()

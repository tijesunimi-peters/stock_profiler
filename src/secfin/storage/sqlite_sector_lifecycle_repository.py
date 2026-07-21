"""SQLite implementation of the sector-aggregate lifecycle repository. See
sector_lifecycle_repository.py.

Own connection to the same db file (fine under WAL mode). The analytical batch writes here through
this repo (NOT via DuckDB) so the write path stays on the operational store; the serving endpoint
reads it as a plain series lookup."""

from __future__ import annotations

import sqlite3
from pathlib import Path

from secfin.storage.sector_lifecycle_repository import (
    SectorLifecycleRepository,
    SectorLifecycleRow,
)

_COLUMNS = (
    "peer_group, fiscal_year, fiscal_period, period_end, peer_count, approx_count, "
    "sum_inventory, sum_accounts_payable, sum_accounts_receivable, sum_cost_of_revenue, "
    "sum_revenue, dio, dpo, dso, ccc"
)

_SCHEMA = """
CREATE TABLE IF NOT EXISTS sector_lifecycle (
    peer_group TEXT NOT NULL,
    fiscal_year INTEGER NOT NULL,
    fiscal_period TEXT NOT NULL,
    period_end TEXT NOT NULL,
    peer_count INTEGER NOT NULL,
    approx_count INTEGER NOT NULL,
    sum_inventory REAL NOT NULL,
    sum_accounts_payable REAL NOT NULL,
    sum_accounts_receivable REAL NOT NULL,
    sum_cost_of_revenue REAL NOT NULL,
    sum_revenue REAL NOT NULL,
    dio REAL NOT NULL,
    dpo REAL NOT NULL,
    dso REAL NOT NULL,
    ccc REAL NOT NULL,
    PRIMARY KEY (peer_group, fiscal_year, fiscal_period)
);

-- The trend reads one sector's whole FY series.
CREATE INDEX IF NOT EXISTS idx_sector_lifecycle_group
    ON sector_lifecycle (peer_group);
"""

_UPSERT_SQL = f"""
INSERT INTO sector_lifecycle ({_COLUMNS})
VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
ON CONFLICT (peer_group, fiscal_year, fiscal_period) DO UPDATE SET
    period_end = excluded.period_end,
    peer_count = excluded.peer_count,
    approx_count = excluded.approx_count,
    sum_inventory = excluded.sum_inventory,
    sum_accounts_payable = excluded.sum_accounts_payable,
    sum_accounts_receivable = excluded.sum_accounts_receivable,
    sum_cost_of_revenue = excluded.sum_cost_of_revenue,
    sum_revenue = excluded.sum_revenue,
    dio = excluded.dio,
    dpo = excluded.dpo,
    dso = excluded.dso,
    ccc = excluded.ccc
"""


class SQLiteSectorLifecycleRepository(SectorLifecycleRepository):
    def __init__(self, db_path: str | Path) -> None:
        self._db_path = Path(db_path)
        self._db_path.parent.mkdir(parents=True, exist_ok=True)
        self._conn = sqlite3.connect(self._db_path, isolation_level=None)
        self._conn.execute("PRAGMA journal_mode=WAL")
        self._conn.execute("PRAGMA synchronous=NORMAL")
        self._conn.executescript(_SCHEMA)

    def bulk_upsert(self, rows: list[SectorLifecycleRow]) -> None:
        if not rows:
            return
        self._conn.execute("BEGIN")
        try:
            self._conn.executemany(_UPSERT_SQL, [tuple(r) for r in rows])
            self._conn.execute("COMMIT")
        except BaseException:
            self._conn.execute("ROLLBACK")
            raise

    def clear(self) -> None:
        self._conn.execute("DELETE FROM sector_lifecycle")

    def get_series(self, peer_group: str) -> list[SectorLifecycleRow]:
        # FY-only: quarterly aggregates are sparse, and mixing frequencies would double-count.
        cur = self._conn.execute(
            f"SELECT {_COLUMNS} FROM sector_lifecycle "
            "WHERE peer_group = ? AND fiscal_period = 'FY' ORDER BY period_end ASC",
            (peer_group,),
        )
        return [SectorLifecycleRow(*row) for row in cur.fetchall()]

    def count(self) -> int:
        return self._conn.execute("SELECT COUNT(*) FROM sector_lifecycle").fetchone()[0]

    def close(self) -> None:
        self._conn.close()

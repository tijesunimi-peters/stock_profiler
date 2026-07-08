"""SQLite implementation of the materialized-metric-value repository.

See metric_value_repository.py. Own connection to the same db file (fine under WAL mode).
The `(sic-joinable)` peer-rank batch reads this table via DuckDB `ATTACH`, so the columns
are kept flat and typed.
"""

from __future__ import annotations

import sqlite3
from pathlib import Path

from secfin.storage.metric_value_repository import MetricValueRepository, MetricValueRow

_SCHEMA = """
CREATE TABLE IF NOT EXISTS metric_values (
    cik INTEGER NOT NULL,
    fiscal_year INTEGER NOT NULL,
    fiscal_period TEXT NOT NULL,
    metric TEXT NOT NULL,
    value REAL,
    status TEXT NOT NULL,
    unit TEXT NOT NULL,
    PRIMARY KEY (cik, fiscal_year, fiscal_period, metric)
);

-- The peer-rank batch groups by (period, metric); index that access path.
CREATE INDEX IF NOT EXISTS idx_metric_values_period_metric
    ON metric_values (fiscal_year, fiscal_period, metric);
"""

_UPSERT_SQL = """
INSERT INTO metric_values (cik, fiscal_year, fiscal_period, metric, value, status, unit)
VALUES (?, ?, ?, ?, ?, ?, ?)
ON CONFLICT (cik, fiscal_year, fiscal_period, metric) DO UPDATE SET
    value = excluded.value,
    status = excluded.status,
    unit = excluded.unit
"""


class SQLiteMetricValueRepository(MetricValueRepository):
    def __init__(self, db_path: str | Path) -> None:
        self._db_path = Path(db_path)
        self._db_path.parent.mkdir(parents=True, exist_ok=True)
        self._conn = sqlite3.connect(self._db_path, isolation_level=None)
        self._conn.execute("PRAGMA journal_mode=WAL")
        self._conn.execute("PRAGMA synchronous=NORMAL")
        self._conn.executescript(_SCHEMA)

    def bulk_upsert(self, rows: list[MetricValueRow]) -> None:
        if not rows:
            return
        self._conn.execute("BEGIN")
        try:
            self._conn.executemany(_UPSERT_SQL, [tuple(r) for r in rows])
            self._conn.execute("COMMIT")
        except BaseException:
            self._conn.execute("ROLLBACK")
            raise

    def get_for_cik(self, cik: int) -> list[MetricValueRow]:
        cur = self._conn.execute(
            "SELECT cik, fiscal_year, fiscal_period, metric, value, status, unit "
            "FROM metric_values WHERE cik = ? ORDER BY fiscal_year, fiscal_period, metric",
            (cik,),
        )
        return [MetricValueRow(*row) for row in cur.fetchall()]

    def count(self) -> int:
        return self._conn.execute("SELECT COUNT(*) FROM metric_values").fetchone()[0]

    def close(self) -> None:
        self._conn.close()

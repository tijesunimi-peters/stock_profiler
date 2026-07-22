"""SQLite implementation of the peer-distribution repository. See
metric_distribution_repository.py.

Own connection to the same db file (fine under WAL mode). The analytical batch writes here
through this repo (NOT via DuckDB) so the write path stays on the operational store.
"""

from __future__ import annotations

import sqlite3
from pathlib import Path

from secfin.storage.metric_distribution_repository import (
    MetricDistributionRepository,
    MetricDistributionRow,
)

_SCHEMA = """
CREATE TABLE IF NOT EXISTS metric_distributions (
    peer_group TEXT NOT NULL,
    fiscal_year INTEGER NOT NULL,
    fiscal_period TEXT NOT NULL,
    metric TEXT NOT NULL,
    peer_count INTEGER NOT NULL,
    min REAL NOT NULL,
    p25 REAL NOT NULL,
    median REAL NOT NULL,
    p75 REAL NOT NULL,
    max REAL NOT NULL,
    PRIMARY KEY (peer_group, fiscal_year, fiscal_period, metric)
);
"""

_UPSERT_SQL = """
INSERT INTO metric_distributions
    (peer_group, fiscal_year, fiscal_period, metric, peer_count, min, p25, median, p75, max)
VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
ON CONFLICT (peer_group, fiscal_year, fiscal_period, metric) DO UPDATE SET
    peer_count = excluded.peer_count,
    min = excluded.min,
    p25 = excluded.p25,
    median = excluded.median,
    p75 = excluded.p75,
    max = excluded.max
"""


class SQLiteMetricDistributionRepository(MetricDistributionRepository):
    def __init__(self, db_path: str | Path) -> None:
        self._db_path = Path(db_path)
        self._db_path.parent.mkdir(parents=True, exist_ok=True)
        self._conn = sqlite3.connect(self._db_path, isolation_level=None)
        self._conn.execute("PRAGMA journal_mode=WAL")
        self._conn.execute("PRAGMA synchronous=NORMAL")
        self._conn.executescript(_SCHEMA)

    def bulk_upsert(self, rows: list[MetricDistributionRow]) -> None:
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
        self._conn.execute("DELETE FROM metric_distributions")

    def get(
        self, peer_group: str, fiscal_year: int, fiscal_period: str, metric: str
    ) -> MetricDistributionRow | None:
        cur = self._conn.execute(
            "SELECT peer_group, fiscal_year, fiscal_period, metric, peer_count, "
            "min, p25, median, p75, max FROM metric_distributions "
            "WHERE peer_group = ? AND fiscal_year = ? AND fiscal_period = ? AND metric = ?",
            (peer_group, fiscal_year, fiscal_period, metric),
        )
        row = cur.fetchone()
        return None if row is None else MetricDistributionRow(*row)

    _SELECT_COLS = (
        "peer_group, fiscal_year, fiscal_period, metric, peer_count, min, p25, median, p75, max"
    )

    def list_for_metric(
        self, metric: str, fiscal_year: int, fiscal_period: str
    ) -> list[MetricDistributionRow]:
        cur = self._conn.execute(
            f"SELECT {self._SELECT_COLS} FROM metric_distributions "
            "WHERE metric = ? AND fiscal_year = ? AND fiscal_period = ? "
            "ORDER BY median DESC",
            (metric, fiscal_year, fiscal_period),
        )
        return [MetricDistributionRow(*r) for r in cur.fetchall()]

    def list_for_group(
        self, peer_group: str, fiscal_year: int, fiscal_period: str
    ) -> list[MetricDistributionRow]:
        cur = self._conn.execute(
            f"SELECT {self._SELECT_COLS} FROM metric_distributions "
            "WHERE peer_group = ? AND fiscal_year = ? AND fiscal_period = ?",
            (peer_group, fiscal_year, fiscal_period),
        )
        return [MetricDistributionRow(*r) for r in cur.fetchall()]

    def list_for_metric_all_periods(self, metric: str) -> list[MetricDistributionRow]:
        cur = self._conn.execute(
            f"SELECT {self._SELECT_COLS} FROM metric_distributions WHERE metric = ? "
            "ORDER BY fiscal_year, fiscal_period, peer_group",
            (metric,),
        )
        return [MetricDistributionRow(*r) for r in cur.fetchall()]

    def latest_fy_year(self, metric: str) -> int | None:
        row = self._conn.execute(
            "SELECT MAX(fiscal_year) FROM metric_distributions "
            "WHERE metric = ? AND fiscal_period = 'FY'",
            (metric,),
        ).fetchone()
        return None if row is None or row[0] is None else int(row[0])

    def count(self) -> int:
        return self._conn.execute("SELECT COUNT(*) FROM metric_distributions").fetchone()[0]

    def close(self) -> None:
        self._conn.close()

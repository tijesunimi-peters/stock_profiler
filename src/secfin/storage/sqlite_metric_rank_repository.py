"""SQLite implementation of the peer-rank repository. See metric_rank_repository.py.

Own connection to the same db file (fine under WAL mode). The analytical batch writes here
through this repo (NOT via DuckDB) so the write path stays on the operational store.
"""

from __future__ import annotations

import sqlite3
from pathlib import Path

from secfin.storage.metric_rank_repository import MetricRankRepository, MetricRankRow

_SCHEMA = """
CREATE TABLE IF NOT EXISTS metric_ranks (
    cik INTEGER NOT NULL,
    fiscal_year INTEGER NOT NULL,
    fiscal_period TEXT NOT NULL,
    metric TEXT NOT NULL,
    peer_group TEXT NOT NULL,
    peer_count INTEGER NOT NULL,
    percentile REAL NOT NULL,
    z_score REAL NOT NULL,
    PRIMARY KEY (cik, fiscal_year, fiscal_period, metric)
);

-- The serving endpoint reads one issuer's whole (period) rank set at once.
CREATE INDEX IF NOT EXISTS idx_metric_ranks_cik_period
    ON metric_ranks (cik, fiscal_year, fiscal_period);
"""

_UPSERT_SQL = """
INSERT INTO metric_ranks
    (cik, fiscal_year, fiscal_period, metric, peer_group, peer_count, percentile, z_score)
VALUES (?, ?, ?, ?, ?, ?, ?, ?)
ON CONFLICT (cik, fiscal_year, fiscal_period, metric) DO UPDATE SET
    peer_group = excluded.peer_group,
    peer_count = excluded.peer_count,
    percentile = excluded.percentile,
    z_score = excluded.z_score
"""


class SQLiteMetricRankRepository(MetricRankRepository):
    def __init__(self, db_path: str | Path) -> None:
        self._db_path = Path(db_path)
        self._db_path.parent.mkdir(parents=True, exist_ok=True)
        self._conn = sqlite3.connect(self._db_path, isolation_level=None)
        self._conn.execute("PRAGMA journal_mode=WAL")
        self._conn.execute("PRAGMA synchronous=NORMAL")
        self._conn.executescript(_SCHEMA)

    def bulk_upsert(self, rows: list[MetricRankRow]) -> None:
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
        self._conn.execute("DELETE FROM metric_ranks")

    def get_for_cik(self, cik: int, fiscal_year: int, fiscal_period: str) -> list[MetricRankRow]:
        cur = self._conn.execute(
            "SELECT cik, fiscal_year, fiscal_period, metric, peer_group, peer_count, "
            "percentile, z_score FROM metric_ranks "
            "WHERE cik = ? AND fiscal_year = ? AND fiscal_period = ? ORDER BY metric",
            (cik, fiscal_year, fiscal_period),
        )
        return [MetricRankRow(*row) for row in cur.fetchall()]

    def count(self) -> int:
        return self._conn.execute("SELECT COUNT(*) FROM metric_ranks").fetchone()[0]

    def close(self) -> None:
        self._conn.close()

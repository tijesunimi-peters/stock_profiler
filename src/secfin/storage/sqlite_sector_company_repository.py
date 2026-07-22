"""SQLite implementation of the sector-company value-list repository. See
sector_company_repository.py.

Own connection to the same db file (fine under WAL mode). A plain read over the operational store
(metric_values ⨝ company_profiles + metric_ranks) -- the serving endpoint calls this; there is no
DuckDB and no batch producer, the tables are materialized by ingest/metrics_backfill.py,
ingest/sic_backfill.py and analytical/peer_ranks.py respectively.
"""

from __future__ import annotations

import sqlite3
from pathlib import Path

from secfin.storage.sector_company_repository import (
    CompanyMetricValueRow,
    SectorCompanyRepository,
)

# metric_values (mv, the value + status/unit) JOIN company_profiles (cp, group membership + name),
# LEFT JOIN metric_ranks (mr, percentile) so a company with a value but no rank still appears.
# N/A · N/M rows are excluded here (value IS NULL / status not ok/approximate) -- never a 0 row.
_LIST_SQL = """
SELECT mv.cik, cp.name, mv.value, mr.percentile
FROM metric_values mv
JOIN company_profiles cp ON cp.cik = mv.cik
LEFT JOIN metric_ranks mr
    ON mr.cik = mv.cik AND mr.metric = mv.metric
    AND mr.fiscal_year = mv.fiscal_year AND mr.fiscal_period = mv.fiscal_period
WHERE mv.metric = ? AND mv.fiscal_year = ? AND mv.fiscal_period = ?
    AND mv.value IS NOT NULL AND mv.status IN ('ok', 'approximate')
    AND cp.sic IS NOT NULL AND length(cp.sic) >= ? AND substr(cp.sic, 1, ?) = ?
ORDER BY mv.value
"""


class SQLiteSectorCompanyRepository(SectorCompanyRepository):
    def __init__(self, db_path: str | Path) -> None:
        self._db_path = Path(db_path)
        self._db_path.parent.mkdir(parents=True, exist_ok=True)
        self._conn = sqlite3.connect(self._db_path, isolation_level=None)
        self._conn.execute("PRAGMA journal_mode=WAL")
        self._conn.execute("PRAGMA synchronous=NORMAL")
        # The tables are created by their own repositories; ensure they exist so a fresh db doesn't
        # error on a read before any write path has run.
        self._conn.execute(
            "CREATE TABLE IF NOT EXISTS metric_values ("
            "cik INTEGER NOT NULL, fiscal_year INTEGER NOT NULL, fiscal_period TEXT NOT NULL, "
            "metric TEXT NOT NULL, value REAL, status TEXT NOT NULL, unit TEXT NOT NULL, "
            "PRIMARY KEY (cik, fiscal_year, fiscal_period, metric))"
        )
        self._conn.execute(
            "CREATE TABLE IF NOT EXISTS company_profiles ("
            "cik INTEGER PRIMARY KEY, sic TEXT, sic_description TEXT, name TEXT)"
        )
        self._conn.execute(
            "CREATE TABLE IF NOT EXISTS metric_ranks ("
            "cik INTEGER NOT NULL, fiscal_year INTEGER NOT NULL, fiscal_period TEXT NOT NULL, "
            "metric TEXT NOT NULL, peer_group TEXT NOT NULL, peer_count INTEGER NOT NULL, "
            "percentile REAL NOT NULL, z_score REAL NOT NULL, "
            "PRIMARY KEY (cik, fiscal_year, fiscal_period, metric))"
        )

    def list_for_group_metric(
        self, sic_prefix: str, sic_digits: int, metric: str, fiscal_year: int, fiscal_period: str
    ) -> list[CompanyMetricValueRow]:
        cur = self._conn.execute(
            _LIST_SQL, (metric, fiscal_year, fiscal_period, sic_digits, sic_digits, sic_prefix)
        )
        return [
            CompanyMetricValueRow(cik=r[0], name=r[1], value=r[2], percentile=r[3])
            for r in cur.fetchall()
        ]

    def latest_fy(self, metric: str) -> int | None:
        row = self._conn.execute(
            "SELECT MAX(fiscal_year) FROM metric_values "
            "WHERE metric = ? AND fiscal_period = 'FY' AND value IS NOT NULL",
            (metric,),
        ).fetchone()
        return None if row is None or row[0] is None else int(row[0])

    def count(self) -> int:
        return self._conn.execute("SELECT COUNT(*) FROM metric_values").fetchone()[0]

    def close(self) -> None:
        self._conn.close()

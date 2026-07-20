"""SQLite implementation of the sector-aggregate DuPont repository. See
sector_dupont_repository.py.

Own connection to the same db file (fine under WAL mode). The analytical batch writes here
through this repo (NOT via DuckDB) so the write path stays on the operational store; the serving
endpoints read it as plain point lookups."""

from __future__ import annotations

import sqlite3
from pathlib import Path

from secfin.storage.sector_dupont_repository import SectorDupontRepository, SectorDupontRow

_COLUMNS = (
    "peer_group, fiscal_year, fiscal_period, period_end, peer_count, "
    "sum_net_income, sum_revenue, sum_avg_assets, sum_avg_equity, "
    "net_margin, asset_turnover, equity_multiplier, roe"
)

_SCHEMA = """
CREATE TABLE IF NOT EXISTS sector_dupont (
    peer_group TEXT NOT NULL,
    fiscal_year INTEGER NOT NULL,
    fiscal_period TEXT NOT NULL,
    period_end TEXT NOT NULL,
    peer_count INTEGER NOT NULL,
    sum_net_income REAL NOT NULL,
    sum_revenue REAL NOT NULL,
    sum_avg_assets REAL NOT NULL,
    sum_avg_equity REAL NOT NULL,
    net_margin REAL NOT NULL,
    asset_turnover REAL NOT NULL,
    equity_multiplier REAL NOT NULL,
    roe REAL NOT NULL,
    PRIMARY KEY (peer_group, fiscal_year, fiscal_period)
);

-- The grid reads every sector for one period; the trend reads one sector's whole series.
CREATE INDEX IF NOT EXISTS idx_sector_dupont_period
    ON sector_dupont (fiscal_year, fiscal_period);
CREATE INDEX IF NOT EXISTS idx_sector_dupont_group
    ON sector_dupont (peer_group);
"""

_UPSERT_SQL = f"""
INSERT INTO sector_dupont ({_COLUMNS})
VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
ON CONFLICT (peer_group, fiscal_year, fiscal_period) DO UPDATE SET
    period_end = excluded.period_end,
    peer_count = excluded.peer_count,
    sum_net_income = excluded.sum_net_income,
    sum_revenue = excluded.sum_revenue,
    sum_avg_assets = excluded.sum_avg_assets,
    sum_avg_equity = excluded.sum_avg_equity,
    net_margin = excluded.net_margin,
    asset_turnover = excluded.asset_turnover,
    equity_multiplier = excluded.equity_multiplier,
    roe = excluded.roe
"""


class SQLiteSectorDupontRepository(SectorDupontRepository):
    def __init__(self, db_path: str | Path) -> None:
        self._db_path = Path(db_path)
        self._db_path.parent.mkdir(parents=True, exist_ok=True)
        self._conn = sqlite3.connect(self._db_path, isolation_level=None)
        self._conn.execute("PRAGMA journal_mode=WAL")
        self._conn.execute("PRAGMA synchronous=NORMAL")
        self._conn.executescript(_SCHEMA)

    def bulk_upsert(self, rows: list[SectorDupontRow]) -> None:
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
        self._conn.execute("DELETE FROM sector_dupont")

    def list_for_period(self, fiscal_year: int, fiscal_period: str) -> list[SectorDupontRow]:
        cur = self._conn.execute(
            f"SELECT {_COLUMNS} FROM sector_dupont "
            "WHERE fiscal_year = ? AND fiscal_period = ? ORDER BY roe DESC",
            (fiscal_year, fiscal_period),
        )
        return [SectorDupontRow(*row) for row in cur.fetchall()]

    def get_series(self, peer_group: str) -> list[SectorDupontRow]:
        # FY-only: quarterly aggregates are sparse, and mixing frequencies would double-count.
        cur = self._conn.execute(
            f"SELECT {_COLUMNS} FROM sector_dupont "
            "WHERE peer_group = ? AND fiscal_period = 'FY' ORDER BY period_end ASC",
            (peer_group,),
        )
        return [SectorDupontRow(*row) for row in cur.fetchall()]

    def latest_fy_year(self) -> int | None:
        # Latest FY whose sector coverage is >= half the best-covered year's -- skips a
        # barely-filed newest year (see the interface docstring).
        row = self._conn.execute(
            """
            WITH per AS (
                SELECT fiscal_year, COUNT(*) AS c
                FROM sector_dupont WHERE fiscal_period = 'FY'
                GROUP BY fiscal_year
            )
            SELECT MAX(fiscal_year) FROM per
            WHERE c >= 0.5 * (SELECT MAX(c) FROM per)
            """
        ).fetchone()
        return row[0] if row and row[0] is not None else None

    def count(self) -> int:
        return self._conn.execute("SELECT COUNT(*) FROM sector_dupont").fetchone()[0]

    def close(self) -> None:
        self._conn.close()

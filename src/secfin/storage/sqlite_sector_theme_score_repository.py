"""SQLite implementation of the sector theme-score repository. See
sector_theme_score_repository.py.

Own connection to the same db file (fine under WAL mode). The offline batch writes here through
this repo (there is no DuckDB on this path -- the batch is pure Python over already-aggregated
metric_distributions); the serving endpoint reads it as plain point lookups.
"""

from __future__ import annotations

import sqlite3
from pathlib import Path

from secfin.storage.sector_theme_score_repository import (
    SectorThemeComponentRow,
    SectorThemeScoreRepository,
    SectorThemeScoreRow,
)

_SCORE_COLS = (
    "peer_group, fiscal_year, fiscal_period, theme, peer_count, constituent_count, "
    "composite_z, score, percentile, rank, rank_of, delta_vs_prior_fy"
)
_COMPONENT_COLS = (
    "peer_group, fiscal_year, fiscal_period, theme, metric, higher_is_better, "
    "median_value, oriented_z"
)

_SCHEMA = """
CREATE TABLE IF NOT EXISTS sector_theme_scores (
    peer_group TEXT NOT NULL,
    fiscal_year INTEGER NOT NULL,
    fiscal_period TEXT NOT NULL,
    theme TEXT NOT NULL,
    peer_count INTEGER NOT NULL,
    constituent_count INTEGER NOT NULL,
    composite_z REAL NOT NULL,
    score INTEGER NOT NULL,
    percentile REAL NOT NULL,
    rank INTEGER NOT NULL,
    rank_of INTEGER NOT NULL,
    delta_vs_prior_fy REAL,
    PRIMARY KEY (peer_group, fiscal_year, fiscal_period, theme)
);
CREATE INDEX IF NOT EXISTS idx_sts_period
    ON sector_theme_scores (fiscal_year, fiscal_period);

CREATE TABLE IF NOT EXISTS sector_theme_components (
    peer_group TEXT NOT NULL,
    fiscal_year INTEGER NOT NULL,
    fiscal_period TEXT NOT NULL,
    theme TEXT NOT NULL,
    metric TEXT NOT NULL,
    higher_is_better INTEGER NOT NULL,
    median_value REAL NOT NULL,
    oriented_z REAL NOT NULL,
    PRIMARY KEY (peer_group, fiscal_year, fiscal_period, theme, metric)
);
CREATE INDEX IF NOT EXISTS idx_stc_period
    ON sector_theme_components (fiscal_year, fiscal_period);
"""

_SCORE_UPSERT = f"""
INSERT INTO sector_theme_scores ({_SCORE_COLS})
VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
ON CONFLICT (peer_group, fiscal_year, fiscal_period, theme) DO UPDATE SET
    peer_count = excluded.peer_count,
    constituent_count = excluded.constituent_count,
    composite_z = excluded.composite_z,
    score = excluded.score,
    percentile = excluded.percentile,
    rank = excluded.rank,
    rank_of = excluded.rank_of,
    delta_vs_prior_fy = excluded.delta_vs_prior_fy
"""

_COMPONENT_UPSERT = f"""
INSERT INTO sector_theme_components ({_COMPONENT_COLS})
VALUES (?, ?, ?, ?, ?, ?, ?, ?)
ON CONFLICT (peer_group, fiscal_year, fiscal_period, theme, metric) DO UPDATE SET
    higher_is_better = excluded.higher_is_better,
    median_value = excluded.median_value,
    oriented_z = excluded.oriented_z
"""


def _score_params(r: SectorThemeScoreRow) -> tuple:
    return tuple(r)


def _component_params(r: SectorThemeComponentRow) -> tuple:
    # bool -> int for SQLite
    return (
        r.peer_group,
        r.fiscal_year,
        r.fiscal_period,
        r.theme,
        r.metric,
        int(r.higher_is_better),
        r.median_value,
        r.oriented_z,
    )


class SQLiteSectorThemeScoreRepository(SectorThemeScoreRepository):
    def __init__(self, db_path: str | Path) -> None:
        self._db_path = Path(db_path)
        self._db_path.parent.mkdir(parents=True, exist_ok=True)
        self._conn = sqlite3.connect(self._db_path, isolation_level=None)
        self._conn.execute("PRAGMA journal_mode=WAL")
        self._conn.execute("PRAGMA synchronous=NORMAL")
        self._conn.executescript(_SCHEMA)

    def bulk_upsert(
        self, parents: list[SectorThemeScoreRow], components: list[SectorThemeComponentRow]
    ) -> None:
        if not parents and not components:
            return
        self._conn.execute("BEGIN")
        try:
            if parents:
                self._conn.executemany(_SCORE_UPSERT, [_score_params(r) for r in parents])
            if components:
                self._conn.executemany(
                    _COMPONENT_UPSERT, [_component_params(r) for r in components]
                )
            self._conn.execute("COMMIT")
        except BaseException:
            self._conn.execute("ROLLBACK")
            raise

    def clear(self) -> None:
        self._conn.execute("DELETE FROM sector_theme_scores")
        self._conn.execute("DELETE FROM sector_theme_components")

    def list_for_period(self, fiscal_year: int, fiscal_period: str) -> list[SectorThemeScoreRow]:
        cur = self._conn.execute(
            f"SELECT {_SCORE_COLS} FROM sector_theme_scores "
            "WHERE fiscal_year = ? AND fiscal_period = ? ORDER BY peer_group, theme",
            (fiscal_year, fiscal_period),
        )
        return [SectorThemeScoreRow(*row) for row in cur.fetchall()]

    def components_for_period(
        self, fiscal_year: int, fiscal_period: str
    ) -> list[SectorThemeComponentRow]:
        cur = self._conn.execute(
            f"SELECT {_COMPONENT_COLS} FROM sector_theme_components "
            "WHERE fiscal_year = ? AND fiscal_period = ? ORDER BY peer_group, theme, metric",
            (fiscal_year, fiscal_period),
        )
        return [
            SectorThemeComponentRow(
                peer_group=row[0],
                fiscal_year=row[1],
                fiscal_period=row[2],
                theme=row[3],
                metric=row[4],
                higher_is_better=bool(row[5]),
                median_value=row[6],
                oriented_z=row[7],
            )
            for row in cur.fetchall()
        ]

    def latest_fy_year(self) -> int | None:
        # Latest FY whose sector coverage is >= half the best-covered year's -- skips a
        # barely-materialized newest year (mirrors sqlite_sector_dupont_repository).
        row = self._conn.execute(
            """
            WITH per AS (
                SELECT fiscal_year, COUNT(DISTINCT peer_group) AS c
                FROM sector_theme_scores WHERE fiscal_period = 'FY'
                GROUP BY fiscal_year
            )
            SELECT MAX(fiscal_year) FROM per
            WHERE c >= 0.5 * (SELECT MAX(c) FROM per)
            """
        ).fetchone()
        return row[0] if row and row[0] is not None else None

    def count(self) -> int:
        return self._conn.execute("SELECT COUNT(*) FROM sector_theme_scores").fetchone()[0]

    def close(self) -> None:
        self._conn.close()

"""SQLite implementation of the disclosure-stats store. See disclosure_stat_repository.py."""

from __future__ import annotations

import sqlite3
from pathlib import Path

from secfin.storage.disclosure_stat_repository import (
    DisclosureStatRepository,
    DisclosureStatRow,
)

_COLS = (
    "cik, peer_group, median_filing_lag_days, amended_share, late_notice_count, "
    "non_reliance_count, indexed_filings, indexed_from, indexed_to"
)

_SCHEMA = """
CREATE TABLE IF NOT EXISTS disclosure_stats (
    cik INTEGER PRIMARY KEY,
    peer_group TEXT NOT NULL,
    median_filing_lag_days REAL,
    amended_share REAL,
    late_notice_count INTEGER NOT NULL,
    non_reliance_count INTEGER NOT NULL,
    indexed_filings INTEGER NOT NULL,
    indexed_from TEXT,
    indexed_to TEXT
);
CREATE INDEX IF NOT EXISTS idx_ds_group ON disclosure_stats (peer_group);
"""

_UPSERT = f"""
INSERT INTO disclosure_stats ({_COLS})
VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
ON CONFLICT (cik) DO UPDATE SET
    peer_group = excluded.peer_group,
    median_filing_lag_days = excluded.median_filing_lag_days,
    amended_share = excluded.amended_share,
    late_notice_count = excluded.late_notice_count,
    non_reliance_count = excluded.non_reliance_count,
    indexed_filings = excluded.indexed_filings,
    indexed_from = excluded.indexed_from,
    indexed_to = excluded.indexed_to
"""


def _row(r: tuple) -> DisclosureStatRow:
    return DisclosureStatRow(
        cik=int(r[0]), peer_group=r[1],
        median_filing_lag_days=None if r[2] is None else float(r[2]),
        amended_share=None if r[3] is None else float(r[3]),
        late_notice_count=int(r[4]), non_reliance_count=int(r[5]),
        indexed_filings=int(r[6]), indexed_from=r[7], indexed_to=r[8],
    )


class SQLiteDisclosureStatRepository(DisclosureStatRepository):
    def __init__(self, db_path: str | Path) -> None:
        self._db_path = Path(db_path)
        self._db_path.parent.mkdir(parents=True, exist_ok=True)
        self._conn = sqlite3.connect(self._db_path, isolation_level=None)
        self._conn.execute("PRAGMA journal_mode=WAL")
        self._conn.execute("PRAGMA synchronous=NORMAL")
        self._conn.executescript(_SCHEMA)

    def bulk_upsert(self, rows: list[DisclosureStatRow]) -> None:
        if not rows:
            return
        self._conn.execute("BEGIN")
        try:
            self._conn.executemany(
                _UPSERT,
                [
                    (r.cik, r.peer_group, r.median_filing_lag_days, r.amended_share,
                     r.late_notice_count, r.non_reliance_count, r.indexed_filings,
                     r.indexed_from, r.indexed_to)
                    for r in rows
                ],
            )
            self._conn.execute("COMMIT")
        except Exception:
            self._conn.execute("ROLLBACK")
            raise

    def get_group(self, peer_group: str) -> list[DisclosureStatRow]:
        cur = self._conn.execute(
            f"SELECT {_COLS} FROM disclosure_stats WHERE peer_group = ? ORDER BY cik",
            (peer_group,),
        )
        return [_row(r) for r in cur.fetchall()]

    def get(self, cik: int) -> DisclosureStatRow | None:
        cur = self._conn.execute(f"SELECT {_COLS} FROM disclosure_stats WHERE cik = ?", (cik,))
        r = cur.fetchone()
        return _row(r) if r else None

    def close(self) -> None:
        self._conn.close()

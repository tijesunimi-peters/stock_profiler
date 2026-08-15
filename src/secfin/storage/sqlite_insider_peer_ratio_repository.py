"""SQLite implementation of the per-company insider peer-ratio store.
See insider_peer_ratio_repository.py.

Own connection to the same db file (fine under WAL mode). The offline batch writes through this
repo; the serving endpoint reads it as plain point lookups (no DuckDB on the request path).
"""

from __future__ import annotations

from pathlib import Path

from secfin.storage.connection import connect
from secfin.storage.insider_peer_ratio_repository import (
    InsiderPeerRatioRepository,
    InsiderPeerRatioRow,
)

_COLS = (
    "cik, peer_group, as_of, window_days, window_start, window_end, bought, sold, "
    "net_ratio, buy_count, sell_count, filer_count"
)

_SCHEMA = """
CREATE TABLE IF NOT EXISTS insider_peer_ratios (
    cik INTEGER NOT NULL,
    peer_group TEXT NOT NULL,
    as_of TEXT NOT NULL,
    window_days INTEGER NOT NULL,
    window_start TEXT NOT NULL,
    window_end TEXT NOT NULL,
    bought REAL NOT NULL,
    sold REAL NOT NULL,
    net_ratio REAL NOT NULL,
    buy_count INTEGER NOT NULL,
    sell_count INTEGER NOT NULL,
    filer_count INTEGER NOT NULL,
    PRIMARY KEY (cik, as_of, window_days)
);
-- The serving read is always "one group, one window", so that is the index.
CREATE INDEX IF NOT EXISTS idx_ipr_group ON insider_peer_ratios (peer_group, as_of, window_days);
"""

_UPSERT = f"""
INSERT INTO insider_peer_ratios ({_COLS})
VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
ON CONFLICT (cik, as_of, window_days) DO UPDATE SET
    peer_group = excluded.peer_group,
    window_start = excluded.window_start,
    window_end = excluded.window_end,
    bought = excluded.bought,
    sold = excluded.sold,
    net_ratio = excluded.net_ratio,
    buy_count = excluded.buy_count,
    sell_count = excluded.sell_count,
    filer_count = excluded.filer_count
"""


def _to_row(r: tuple) -> InsiderPeerRatioRow:
    return InsiderPeerRatioRow(
        cik=int(r[0]),
        peer_group=r[1],
        as_of=r[2],
        window_days=int(r[3]),
        window_start=r[4],
        window_end=r[5],
        bought=float(r[6]),
        sold=float(r[7]),
        net_ratio=float(r[8]),
        buy_count=int(r[9]),
        sell_count=int(r[10]),
        filer_count=int(r[11]),
    )


class SQLiteInsiderPeerRatioRepository(InsiderPeerRatioRepository):
    def __init__(self, db_path: str | Path) -> None:
        self._db_path = Path(db_path)
        self._conn = connect(self._db_path)
        self._conn.executescript(_SCHEMA)

    def bulk_upsert(self, rows: list[InsiderPeerRatioRow]) -> None:
        if not rows:
            return
        self._conn.execute("BEGIN")
        try:
            self._conn.executemany(
                _UPSERT,
                [
                    (
                        r.cik, r.peer_group, r.as_of, r.window_days, r.window_start,
                        r.window_end, r.bought, r.sold, r.net_ratio, r.buy_count,
                        r.sell_count, r.filer_count,
                    )
                    for r in rows
                ],
            )
            self._conn.execute("COMMIT")
        except Exception:
            self._conn.execute("ROLLBACK")
            raise

    def get_group(
        self, peer_group: str, as_of: str, window_days: int
    ) -> list[InsiderPeerRatioRow]:
        cur = self._conn.execute(
            f"SELECT {_COLS} FROM insider_peer_ratios "
            "WHERE peer_group = ? AND as_of = ? AND window_days = ? "
            "ORDER BY net_ratio DESC, cik ASC",
            (peer_group, as_of, window_days),
        )
        return [_to_row(r) for r in cur.fetchall()]

    def latest_as_of(self, window_days: int) -> str | None:
        cur = self._conn.execute(
            "SELECT MAX(as_of) FROM insider_peer_ratios WHERE window_days = ?", (window_days,)
        )
        row = cur.fetchone()
        return row[0] if row and row[0] else None

    def prune_snapshots(self, window_days: int, keep: int) -> int:
        if keep < 1:
            raise ValueError("keep must be at least 1 -- pruning every snapshot leaves nothing "
                             "to serve")
        cur = self._conn.execute(
            "SELECT DISTINCT as_of FROM insider_peer_ratios WHERE window_days = ? "
            "ORDER BY as_of DESC",
            (window_days,),
        )
        all_as_of = [r[0] for r in cur.fetchall()]
        doomed = all_as_of[keep:]
        if not doomed:
            return 0
        placeholders = ",".join("?" for _ in doomed)
        cur = self._conn.execute(
            f"DELETE FROM insider_peer_ratios WHERE window_days = ? AND as_of IN ({placeholders})",
            (window_days, *doomed),
        )
        return cur.rowcount or 0

    def close(self) -> None:
        self._conn.close()

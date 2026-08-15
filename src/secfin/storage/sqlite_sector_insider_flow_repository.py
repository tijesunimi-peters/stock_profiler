"""SQLite implementation of the sector insider-flow repository. See
sector_insider_flow_repository.py.

Own connection to the same db file (fine under WAL mode). The offline batch writes here through
this repo; the serving endpoint reads it as plain point lookups (no DuckDB on the request path).
"""

from __future__ import annotations

from pathlib import Path

from secfin.storage.connection import connect
from secfin.storage.sector_insider_flow_repository import (
    SectorInsiderFlowRepository,
    SectorInsiderFlowRow,
)

_COLS = (
    "peer_group, as_of, window_days, window_start, window_end, net, buys, sells, "
    "buy_count, sell_count, filer_count, company_count, excluded_no_price_count, unit"
)

_SCHEMA = """
CREATE TABLE IF NOT EXISTS sector_insider_flow (
    peer_group TEXT NOT NULL,
    as_of TEXT NOT NULL,
    window_days INTEGER NOT NULL,
    window_start TEXT NOT NULL,
    window_end TEXT NOT NULL,
    net REAL NOT NULL,
    buys REAL NOT NULL,
    sells REAL NOT NULL,
    buy_count INTEGER NOT NULL,
    sell_count INTEGER NOT NULL,
    filer_count INTEGER NOT NULL,
    company_count INTEGER NOT NULL,
    excluded_no_price_count INTEGER NOT NULL,
    unit TEXT NOT NULL DEFAULT 'USD',
    PRIMARY KEY (peer_group, as_of, window_days)
);
CREATE INDEX IF NOT EXISTS idx_sif_as_of ON sector_insider_flow (as_of);
"""

_UPSERT = f"""
INSERT INTO sector_insider_flow ({_COLS})
VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
ON CONFLICT (peer_group, as_of, window_days) DO UPDATE SET
    window_start = excluded.window_start,
    window_end = excluded.window_end,
    net = excluded.net,
    buys = excluded.buys,
    sells = excluded.sells,
    buy_count = excluded.buy_count,
    sell_count = excluded.sell_count,
    filer_count = excluded.filer_count,
    company_count = excluded.company_count,
    excluded_no_price_count = excluded.excluded_no_price_count,
    unit = excluded.unit
"""


class SQLiteSectorInsiderFlowRepository(SectorInsiderFlowRepository):
    def __init__(self, db_path: str | Path) -> None:
        self._db_path = Path(db_path)
        self._conn = connect(self._db_path)
        self._conn.executescript(_SCHEMA)

    def bulk_upsert(self, rows: list[SectorInsiderFlowRow]) -> None:
        if not rows:
            return
        self._conn.execute("BEGIN")
        try:
            self._conn.executemany(_UPSERT, [tuple(r) for r in rows])
            self._conn.execute("COMMIT")
        except BaseException:
            self._conn.execute("ROLLBACK")
            raise

    def clear(self) -> None:
        self._conn.execute("DELETE FROM sector_insider_flow")

    def get(self, peer_group: str, as_of: str | None = None) -> SectorInsiderFlowRow | None:
        if as_of is None:
            cur = self._conn.execute(
                f"SELECT {_COLS} FROM sector_insider_flow WHERE peer_group = ? "
                "ORDER BY as_of DESC LIMIT 1",
                (peer_group,),
            )
        else:
            cur = self._conn.execute(
                f"SELECT {_COLS} FROM sector_insider_flow WHERE peer_group = ? AND as_of = ? "
                "ORDER BY window_days DESC LIMIT 1",
                (peer_group, as_of),
            )
        row = cur.fetchone()
        return SectorInsiderFlowRow(*row) if row is not None else None

    def latest_as_of(self) -> str | None:
        row = self._conn.execute("SELECT MAX(as_of) FROM sector_insider_flow").fetchone()
        return row[0] if row and row[0] is not None else None

    def count(self) -> int:
        return self._conn.execute("SELECT COUNT(*) FROM sector_insider_flow").fetchone()[0]

    def close(self) -> None:
        self._conn.close()

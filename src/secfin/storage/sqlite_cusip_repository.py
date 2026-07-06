"""SQLite implementation of the CUSIP -> CIK repository. See cusip_repository.py.

Own connection to the same db file as SQLiteRawFactRepository -- fine under WAL mode
(the reason that mode was chosen: concurrent connections to one file), so this doesn't
need to share a connection object with the RawFact store.
"""

from __future__ import annotations

import sqlite3
from pathlib import Path

from secfin.storage.cusip_repository import CusipMapRepository

_SCHEMA = """
CREATE TABLE IF NOT EXISTS cusip_map (
    cusip TEXT PRIMARY KEY,
    cik INTEGER,
    issuer_name TEXT NOT NULL,
    attempts INTEGER NOT NULL DEFAULT 1,
    first_seen TEXT NOT NULL DEFAULT (datetime('now')),
    last_seen TEXT NOT NULL DEFAULT (datetime('now'))
);
"""

# Deliberately does not set `cik` on conflict -- record_unresolved must never clobber a
# previously resolved cik with NULL (see cusip_repository.py's docstring).
_UPSERT_UNRESOLVED_SQL = """
INSERT INTO cusip_map (cusip, cik, issuer_name)
VALUES (?, NULL, ?)
ON CONFLICT (cusip) DO UPDATE SET
    issuer_name = excluded.issuer_name,
    attempts = cusip_map.attempts + 1,
    last_seen = datetime('now')
"""

_UPSERT_RESOLVED_SQL = """
INSERT INTO cusip_map (cusip, cik, issuer_name)
VALUES (?, ?, ?)
ON CONFLICT (cusip) DO UPDATE SET
    cik = excluded.cik,
    issuer_name = excluded.issuer_name,
    attempts = cusip_map.attempts + 1,
    last_seen = datetime('now')
"""


class SQLiteCusipMapRepository(CusipMapRepository):
    def __init__(self, db_path: str | Path) -> None:
        self._db_path = Path(db_path)
        self._db_path.parent.mkdir(parents=True, exist_ok=True)
        self._conn = sqlite3.connect(self._db_path, isolation_level=None)
        self._conn.execute("PRAGMA journal_mode=WAL")
        self._conn.execute("PRAGMA synchronous=NORMAL")
        self._conn.executescript(_SCHEMA)

    def get_cik(self, cusip: str) -> int | None:
        cur = self._conn.execute("SELECT cik FROM cusip_map WHERE cusip = ?", (cusip,))
        row = cur.fetchone()
        return row[0] if row and row[0] is not None else None

    def record_resolved(self, cusip: str, cik: int, issuer_name: str) -> None:
        self._conn.execute(_UPSERT_RESOLVED_SQL, (cusip, cik, issuer_name))

    def record_unresolved(self, cusip: str, issuer_name: str) -> None:
        self._conn.execute(_UPSERT_UNRESOLVED_SQL, (cusip, issuer_name))

    def unresolved_cusips(self) -> list[dict]:
        cur = self._conn.execute(
            "SELECT cusip, issuer_name, attempts, first_seen, last_seen FROM cusip_map "
            "WHERE cik IS NULL ORDER BY attempts DESC"
        )
        cols = [d[0] for d in cur.description]
        return [dict(zip(cols, row, strict=True)) for row in cur.fetchall()]

    def resolution_counts(self) -> tuple[int, int]:
        # COUNT(cik) skips NULLs (unresolved rows); COUNT(*) is every row -- no need to
        # materialize unresolved_cusips()'s full rows just to count them.
        cur = self._conn.execute("SELECT COUNT(cik), COUNT(*) FROM cusip_map")
        resolved, total = cur.fetchone()
        return resolved, total - resolved

    def close(self) -> None:
        self._conn.close()

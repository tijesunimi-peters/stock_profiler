"""SQLite implementation of the API key repository. See api_key_repository.py.

Own connection to the same db file as the other SQLite repositories -- fine under WAL
mode, same reasoning as sqlite_cusip_repository.py.
"""

from __future__ import annotations

import sqlite3
from pathlib import Path

from secfin.auth.models import ApiKeyRecord
from secfin.storage.api_key_repository import ApiKeyRepository

_SCHEMA = """
CREATE TABLE IF NOT EXISTS api_keys (
    id INTEGER PRIMARY KEY,
    key_hash TEXT NOT NULL UNIQUE,
    email TEXT NOT NULL UNIQUE,
    tier TEXT NOT NULL,
    rate_limit_per_sec INTEGER NOT NULL,
    daily_quota INTEGER NOT NULL,
    active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS api_key_usage (
    api_key_id INTEGER NOT NULL,
    usage_date TEXT NOT NULL,
    request_count INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (api_key_id, usage_date)
);
"""

_UPSERT_USAGE_SQL = """
INSERT INTO api_key_usage (api_key_id, usage_date, request_count)
VALUES (?, ?, 1)
ON CONFLICT(api_key_id, usage_date) DO UPDATE SET request_count = request_count + 1
"""


class SQLiteApiKeyRepository(ApiKeyRepository):
    def __init__(self, db_path: str | Path) -> None:
        self._db_path = Path(db_path)
        self._db_path.parent.mkdir(parents=True, exist_ok=True)
        self._conn = sqlite3.connect(self._db_path, isolation_level=None)
        self._conn.execute("PRAGMA journal_mode=WAL")
        self._conn.execute("PRAGMA synchronous=NORMAL")
        self._conn.executescript(_SCHEMA)

    def create_key(
        self,
        key_hash: str,
        email: str,
        tier: str,
        rate_limit_per_sec: int,
        daily_quota: int,
    ) -> ApiKeyRecord:
        try:
            cur = self._conn.execute(
                "INSERT INTO api_keys (key_hash, email, tier, rate_limit_per_sec, daily_quota) "
                "VALUES (?, ?, ?, ?, ?)",
                (key_hash, email, tier, rate_limit_per_sec, daily_quota),
            )
        except sqlite3.IntegrityError as e:
            raise ValueError(f"email already registered: {email}") from e
        record = self.get_by_hash(key_hash)
        assert record is not None and record.id == cur.lastrowid
        return record

    def get_by_hash(self, key_hash: str) -> ApiKeyRecord | None:
        cur = self._conn.execute(
            "SELECT id, email, tier, rate_limit_per_sec, daily_quota, active, created_at "
            "FROM api_keys WHERE key_hash = ?",
            (key_hash,),
        )
        row = cur.fetchone()
        if row is None:
            return None
        return ApiKeyRecord(
            id=row[0],
            email=row[1],
            tier=row[2],
            rate_limit_per_sec=row[3],
            daily_quota=row[4],
            active=bool(row[5]),
            created_at=row[6],
        )

    def record_usage_and_get_count(self, api_key_id: int, day: str) -> int:
        self._conn.execute("BEGIN")
        try:
            self._conn.execute(_UPSERT_USAGE_SQL, (api_key_id, day))
            count = self._conn.execute(
                "SELECT request_count FROM api_key_usage WHERE api_key_id = ? AND usage_date = ?",
                (api_key_id, day),
            ).fetchone()[0]
            self._conn.execute("COMMIT")
        except BaseException:
            self._conn.execute("ROLLBACK")
            raise
        return count

    def close(self) -> None:
        self._conn.close()

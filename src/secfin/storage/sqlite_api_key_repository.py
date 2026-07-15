"""SQLite implementation of the API key repository. See api_key_repository.py.

Own connection to the same db file as the other SQLite repositories -- fine under WAL
mode, same reasoning as sqlite_cusip_repository.py.
"""

from __future__ import annotations

import sqlite3
from pathlib import Path

from secfin.auth.models import ApiKeyRecord, DailyCount, DailyTraffic, DailyUsage, OpsOverview
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
        return self._get_by(("key_hash", key_hash))

    def get_by_email(self, email: str) -> ApiKeyRecord | None:
        return self._get_by(("email", email))

    def _get_by(self, column_value: tuple[str, str]) -> ApiKeyRecord | None:
        column, value = column_value
        cur = self._conn.execute(
            "SELECT id, email, tier, rate_limit_per_sec, daily_quota, active, created_at "
            f"FROM api_keys WHERE {column} = ?",
            (value,),
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

    def update_tier(
        self, email: str, tier: str, rate_limit_per_sec: int, daily_quota: int
    ) -> ApiKeyRecord | None:
        cur = self._conn.execute(
            "UPDATE api_keys SET tier = ?, rate_limit_per_sec = ?, daily_quota = ? "
            "WHERE email = ?",
            (tier, rate_limit_per_sec, daily_quota, email),
        )
        if cur.rowcount == 0:
            return None
        return self.get_by_email(email)

    def revoke_key(self, email: str) -> ApiKeyRecord | None:
        cur = self._conn.execute(
            "UPDATE api_keys SET active = 0 WHERE email = ?",
            (email,),
        )
        if cur.rowcount == 0:
            return None
        return self.get_by_email(email)

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

    def usage_by_day(self, api_key_id: int, since_day: str) -> list[DailyUsage]:
        cur = self._conn.execute(
            "SELECT usage_date, request_count FROM api_key_usage "
            "WHERE api_key_id = ? AND usage_date >= ? ORDER BY usage_date",
            (api_key_id, since_day),
        )
        return [DailyUsage(date=row[0], request_count=row[1]) for row in cur.fetchall()]

    def ops_overview(self, since_day: str) -> OpsOverview:
        total, active = self._conn.execute(
            "SELECT COUNT(*), COALESCE(SUM(active), 0) FROM api_keys"
        ).fetchone()
        by_tier = self._conn.execute(
            "SELECT tier, COUNT(*) FROM api_keys WHERE active = 1 GROUP BY tier"
        ).fetchall()
        traffic = self._conn.execute(
            "SELECT usage_date, SUM(request_count), COUNT(DISTINCT api_key_id) "
            "FROM api_key_usage WHERE usage_date >= ? "
            "GROUP BY usage_date ORDER BY usage_date",
            (since_day,),
        ).fetchall()
        # created_at is "YYYY-MM-DD HH:MM:SS" (UTC), so the lexicographic >= against a
        # bare "YYYY-MM-DD" boundary is a correct date comparison.
        signups = self._conn.execute(
            "SELECT substr(created_at, 1, 10) AS day, COUNT(*) FROM api_keys "
            "WHERE created_at >= ? GROUP BY day ORDER BY day",
            (since_day,),
        ).fetchall()
        return OpsOverview(
            keys_total=total,
            keys_active=active,
            keys_by_tier={tier: count for tier, count in by_tier},
            traffic_by_day=[
                DailyTraffic(date=row[0], request_count=row[1], active_keys=row[2])
                for row in traffic
            ],
            signups_by_day=[DailyCount(date=row[0], count=row[1]) for row in signups],
        )

    def close(self) -> None:
        self._conn.close()

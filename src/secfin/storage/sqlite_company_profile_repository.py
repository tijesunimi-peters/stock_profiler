"""SQLite implementation of the company-profile repository. See company_profile_repository.py.

Own connection to the same db file as the other repositories (fine under WAL mode).
"""

from __future__ import annotations

import sqlite3
from pathlib import Path

from secfin.storage.company_profile_repository import CompanyProfile, CompanyProfileRepository

_SCHEMA = """
CREATE TABLE IF NOT EXISTS company_profiles (
    cik INTEGER PRIMARY KEY,
    sic TEXT,
    sic_description TEXT,
    name TEXT
);
"""

_UPSERT_SQL = """
INSERT INTO company_profiles (cik, sic, sic_description, name)
VALUES (?, ?, ?, ?)
ON CONFLICT (cik) DO UPDATE SET
    sic = excluded.sic,
    sic_description = excluded.sic_description,
    name = excluded.name
"""


class SQLiteCompanyProfileRepository(CompanyProfileRepository):
    def __init__(self, db_path: str | Path) -> None:
        self._db_path = Path(db_path)
        self._db_path.parent.mkdir(parents=True, exist_ok=True)
        self._conn = sqlite3.connect(self._db_path, isolation_level=None)
        self._conn.execute("PRAGMA journal_mode=WAL")
        self._conn.execute("PRAGMA synchronous=NORMAL")
        self._conn.executescript(_SCHEMA)

    def upsert(self, profile: CompanyProfile) -> None:
        self._conn.execute(
            _UPSERT_SQL, (profile.cik, profile.sic, profile.sic_description, profile.name)
        )

    def get(self, cik: int) -> CompanyProfile | None:
        cur = self._conn.execute(
            "SELECT cik, sic, sic_description, name FROM company_profiles WHERE cik = ?", (cik,)
        )
        row = cur.fetchone()
        if row is None:
            return None
        return CompanyProfile(cik=row[0], sic=row[1], sic_description=row[2], name=row[3])

    def close(self) -> None:
        self._conn.close()

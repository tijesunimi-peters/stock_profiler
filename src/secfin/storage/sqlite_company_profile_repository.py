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

_EXTRA_COLUMNS = (
    ("state_of_incorporation", "TEXT"),
    ("hq_city", "TEXT"),
    ("hq_state", "TEXT"),
    ("fiscal_year_end", "TEXT"),
    ("filer_category", "TEXT"),
    ("ein", "TEXT"),
    ("exchanges", "TEXT"),
    ("first_filing_date", "TEXT"),
)

_ALL_COLUMNS = ("cik", "sic", "sic_description", "name", *(c for c, _ in _EXTRA_COLUMNS))

_UPSERT_SQL = f"""
INSERT INTO company_profiles ({", ".join(_ALL_COLUMNS)})
VALUES ({", ".join("?" * len(_ALL_COLUMNS))})
ON CONFLICT (cik) DO UPDATE SET
    {", ".join(f"{c} = excluded.{c}" for c in _ALL_COLUMNS if c != "cik")}
"""


class SQLiteCompanyProfileRepository(CompanyProfileRepository):
    def __init__(self, db_path: str | Path) -> None:
        self._db_path = Path(db_path)
        self._db_path.parent.mkdir(parents=True, exist_ok=True)
        self._conn = sqlite3.connect(self._db_path, isolation_level=None)
        self._conn.execute("PRAGMA journal_mode=WAL")
        self._conn.execute("PRAGMA synchronous=NORMAL")
        self._conn.executescript(_SCHEMA)
        self._ensure_columns()

    def _ensure_columns(self) -> None:
        """Additive migration for DBs created before the cover-page columns existed.

        Same idiom as the insider store: `CREATE TABLE IF NOT EXISTS` will not add a column and
        SQLite has no `ADD COLUMN IF NOT EXISTS`, so each is added guarded by PRAGMA table_info.
        Rows written before this keep NULL, which reads as "not ingested yet" -- correct, and
        exactly what a re-run of `sic_backfill` fills in.
        """
        have = {row[1] for row in self._conn.execute("PRAGMA table_info(company_profiles)")}
        for column, decl in _EXTRA_COLUMNS:
            if column not in have:
                self._conn.execute(f"ALTER TABLE company_profiles ADD COLUMN {column} {decl}")

    def upsert(self, profile: CompanyProfile) -> None:
        self._conn.execute(_UPSERT_SQL, tuple(getattr(profile, c) for c in _ALL_COLUMNS))

    def get(self, cik: int) -> CompanyProfile | None:
        cur = self._conn.execute(
            f"SELECT {', '.join(_ALL_COLUMNS)} FROM company_profiles WHERE cik = ?", (cik,)
        )
        row = cur.fetchone()
        if row is None:
            return None
        return CompanyProfile(**dict(zip(_ALL_COLUMNS, row, strict=True)))

    def sic_group_peers(self, cik: int, sic_digits: int, limit: int) -> list[CompanyProfile]:
        own = self.get(cik)
        if own is None or not own.sic:
            return []
        prefix = own.sic.strip()[:sic_digits]
        if not prefix:
            return []
        # Selects EVERY column, not just the four this method needs. A partially-populated
        # `CompanyProfile` would report `state_of_incorporation=None` for a peer whose row has
        # one -- a missing value that is an artefact of the query, not of the filing.
        cur = self._conn.execute(
            f"SELECT {', '.join(_ALL_COLUMNS)} FROM company_profiles "
            "WHERE sic LIKE ? AND cik != ? ORDER BY cik LIMIT ?",
            (prefix + "%", cik, limit),
        )
        return [CompanyProfile(**dict(zip(_ALL_COLUMNS, r, strict=True))) for r in cur.fetchall()]

    def close(self) -> None:
        self._conn.close()

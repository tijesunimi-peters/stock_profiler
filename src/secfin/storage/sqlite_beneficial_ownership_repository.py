"""SQLite implementation of the beneficial-ownership repository. See
beneficial_ownership_repository.py.

Own connection to the same db file as SQLiteRawFactRepository -- fine under WAL mode,
same reasoning as sqlite_insider_repository.py.
"""

from __future__ import annotations

import sqlite3
from collections.abc import Iterable, Sequence
from pathlib import Path

from secfin.normalize.schema import BeneficialOwnership, BeneficialOwnershipFilingMeta
from secfin.storage.beneficial_ownership_repository import BeneficialOwnershipRepository

_SCHEMA = """
CREATE TABLE IF NOT EXISTS beneficial_ownership_filings (
    issuer_cik INTEGER NOT NULL,
    accession TEXT NOT NULL,
    filed TEXT NOT NULL DEFAULT '',
    form_type TEXT NOT NULL DEFAULT '',
    fetched_at TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (issuer_cik, accession)
);

CREATE TABLE IF NOT EXISTS beneficial_ownership (
    id INTEGER PRIMARY KEY,
    issuer_cik INTEGER NOT NULL,
    accession TEXT NOT NULL DEFAULT '',
    issuer_name TEXT,
    owner_name TEXT,
    form_type TEXT,
    filed TEXT,
    percent_of_class REAL,
    shares_beneficially_owned REAL,
    type_of_reporting_person TEXT,
    event_date TEXT
);

CREATE INDEX IF NOT EXISTS idx_beneficial_ownership_issuer_accession
    ON beneficial_ownership (issuer_cik, accession);
"""

_INSERT_ROW_SQL = """
INSERT INTO beneficial_ownership (
    issuer_cik, accession, issuer_name, owner_name, form_type, filed,
    percent_of_class, shares_beneficially_owned, type_of_reporting_person, event_date
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
"""

# Volumes seeded before the cover-page "TYPE OF REPORTING PERSON" box was captured have the
# table without this column. ADD COLUMN is cheap and non-rewriting in SQLite; existing rows read
# back NULL, which is the honest answer for a filing we parsed before we looked at the field.
_MIGRATIONS = (("beneficial_ownership", "type_of_reporting_person", "TEXT"),)

_INSERT_FILING_SQL = """
INSERT OR IGNORE INTO beneficial_ownership_filings (issuer_cik, accession, filed, form_type)
VALUES (?, ?, ?, ?)
"""


class SQLiteBeneficialOwnershipRepository(BeneficialOwnershipRepository):
    def __init__(self, db_path: str | Path) -> None:
        self._db_path = Path(db_path)
        self._db_path.parent.mkdir(parents=True, exist_ok=True)
        self._conn = sqlite3.connect(self._db_path, isolation_level=None)
        self._conn.execute("PRAGMA journal_mode=WAL")
        self._conn.execute("PRAGMA synchronous=NORMAL")
        self._conn.executescript(_SCHEMA)
        self._migrate()

    def _migrate(self) -> None:
        """Add columns that post-date a volume's first write. Idempotent."""
        for table, column, decl in _MIGRATIONS:
            cur = self._conn.execute(f"PRAGMA table_info({table})")
            if column not in {row[1] for row in cur.fetchall()}:
                self._conn.execute(f"ALTER TABLE {table} ADD COLUMN {column} {decl}")

    def upsert_beneficial_ownership(
        self,
        issuer_cik: int,
        filings: Sequence[BeneficialOwnershipFilingMeta],
        owners: Iterable[BeneficialOwnership],
    ) -> int:
        if not filings:
            return 0
        cur = self._conn.execute(
            "SELECT accession FROM beneficial_ownership_filings WHERE issuer_cik = ?",
            (issuer_cik,),
        )
        already_cached = {row[0] for row in cur.fetchall()}
        new_filings = [f for f in filings if f.accession not in already_cached]
        if not new_filings:
            return 0
        new_accessions = {f.accession for f in new_filings}
        # `issuer_cik` here is the CIK whose /submissions/ we walked -- NOT necessarily the
        # subject of the filing. A company files 13G/13D about companies IT invests in, and those
        # appear in its own feed: NVIDIA's list carries its 9.3% of Nebius and 11.5% of CoreWeave.
        # Writing the walked CIK onto those rows made them read as holders OF NVIDIA. The parser
        # already captures the true subject from the XML's `issuerCik`, so use it.
        rows = [self._owner_to_row(issuer_cik, o) for o in owners if o.accession in new_accessions]

        self._conn.execute("BEGIN")
        try:
            self._conn.executemany(
                _INSERT_FILING_SQL,
                [(issuer_cik, f.accession, f.filed or "", f.form_type) for f in new_filings],
            )
            if rows:
                self._conn.executemany(_INSERT_ROW_SQL, rows)
            self._conn.execute("COMMIT")
        except BaseException:
            self._conn.execute("ROLLBACK")
            raise
        return len(rows)

    def cached_filing_count(self, issuer_cik: int) -> int:
        cur = self._conn.execute(
            "SELECT COUNT(*) FROM beneficial_ownership_filings WHERE issuer_cik = ?",
            (issuer_cik,),
        )
        return cur.fetchone()[0]

    def get_beneficial_ownership(self, issuer_cik: int, limit: int) -> list[BeneficialOwnership]:
        cur = self._conn.execute(
            """
            -- `o.issuer_cik` is the SUBJECT of the filing; the inner query's is the feed we
            -- walked. They differ whenever a company files a 13G about someone else, and the
            -- outer filter is what keeps those off the subject company's own card.
            SELECT o.* FROM beneficial_ownership o
            WHERE o.issuer_cik = ?
              AND o.accession IN (
                  SELECT accession FROM beneficial_ownership_filings
                  WHERE issuer_cik = ?
                  ORDER BY filed DESC, accession DESC
                  LIMIT ?
              )
            ORDER BY o.filed DESC, o.accession DESC, o.id ASC
            """,
            (issuer_cik, issuer_cik, limit),
        )
        cols = [d[0] for d in cur.description]
        return [self._row_to_owner(dict(zip(cols, row, strict=True))) for row in cur.fetchall()]

    def filings_since(self, issuer_cik: int, since: str) -> list[BeneficialOwnership]:
        cur = self._conn.execute(
            """
            SELECT * FROM beneficial_ownership
            WHERE issuer_cik = ? AND filed > ?
            ORDER BY filed DESC, accession DESC, id ASC
            """,
            (issuer_cik, since),
        )
        cols = [d[0] for d in cur.description]
        return [self._row_to_owner(dict(zip(cols, row, strict=True))) for row in cur.fetchall()]

    def close(self) -> None:
        self._conn.close()

    @staticmethod
    def _owner_to_row(walked_cik: int, o: BeneficialOwnership) -> tuple:
        # The SUBJECT of the filing, from the XML, falling back to the walked CIK only when the
        # filing did not carry one. See upsert_beneficial_ownership for why these differ.
        return (
            o.issuer_cik or walked_cik,
            o.accession or "",
            o.issuer_name,
            o.owner_name,
            o.form_type,
            o.filed,
            o.percent_of_class,
            o.shares_beneficially_owned,
            o.type_of_reporting_person,
            o.event_date,
        )

    @staticmethod
    def _row_to_owner(row: dict) -> BeneficialOwnership:
        return BeneficialOwnership(
            issuer_cik=row["issuer_cik"],
            issuer_name=row["issuer_name"],
            owner_name=row["owner_name"],
            form_type=row["form_type"],
            filed=row["filed"],
            accession=row["accession"] or None,
            percent_of_class=row["percent_of_class"],
            shares_beneficially_owned=row["shares_beneficially_owned"],
            type_of_reporting_person=row.get("type_of_reporting_person"),
            event_date=row["event_date"],
        )

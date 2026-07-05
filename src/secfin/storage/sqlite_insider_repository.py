"""SQLite implementation of the insider-transaction repository. See insider_repository.py.

Own connection to the same db file as SQLiteRawFactRepository -- fine under WAL mode,
same reasoning as sqlite_cusip_repository.py.
"""

from __future__ import annotations

import sqlite3
from collections.abc import Iterable, Sequence
from pathlib import Path

from secfin.normalize.schema import InsiderFilingMeta, InsiderTransaction
from secfin.storage.insider_repository import InsiderTransactionRepository

_SCHEMA = """
CREATE TABLE IF NOT EXISTS insider_filings (
    issuer_cik INTEGER NOT NULL,
    accession TEXT NOT NULL,
    filed TEXT NOT NULL DEFAULT '',
    form_type TEXT NOT NULL DEFAULT '',
    fetched_at TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (issuer_cik, accession)
);

CREATE TABLE IF NOT EXISTS insider_transactions (
    id INTEGER PRIMARY KEY,
    issuer_cik INTEGER NOT NULL,
    accession TEXT NOT NULL DEFAULT '',
    issuer_name TEXT,
    owner_name TEXT,
    owner_relationship TEXT,
    form_type TEXT,
    filed TEXT,
    transaction_date TEXT,
    security_title TEXT,
    shares REAL,
    price_per_share REAL,
    acquired_disposed TEXT,
    ownership_type TEXT,
    shares_owned_after REAL,
    is_holding INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_insider_transactions_issuer_accession
    ON insider_transactions (issuer_cik, accession);
"""

_INSERT_TXN_SQL = """
INSERT INTO insider_transactions (
    issuer_cik, accession, issuer_name, owner_name, owner_relationship, form_type, filed,
    transaction_date, security_title, shares, price_per_share, acquired_disposed,
    ownership_type, shares_owned_after, is_holding
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
"""

_INSERT_FILING_SQL = """
INSERT OR IGNORE INTO insider_filings (issuer_cik, accession, filed, form_type)
VALUES (?, ?, ?, ?)
"""


class SQLiteInsiderTransactionRepository(InsiderTransactionRepository):
    def __init__(self, db_path: str | Path) -> None:
        self._db_path = Path(db_path)
        self._db_path.parent.mkdir(parents=True, exist_ok=True)
        self._conn = sqlite3.connect(self._db_path, isolation_level=None)
        self._conn.execute("PRAGMA journal_mode=WAL")
        self._conn.execute("PRAGMA synchronous=NORMAL")
        self._conn.executescript(_SCHEMA)

    def upsert_insider_transactions(
        self,
        issuer_cik: int,
        filings: Sequence[InsiderFilingMeta],
        transactions: Iterable[InsiderTransaction],
    ) -> int:
        if not filings:
            return 0
        cur = self._conn.execute(
            "SELECT accession FROM insider_filings WHERE issuer_cik = ?", (issuer_cik,)
        )
        already_cached = {row[0] for row in cur.fetchall()}
        new_filings = [f for f in filings if f.accession not in already_cached]
        if not new_filings:
            return 0
        new_accessions = {f.accession for f in new_filings}
        rows = [
            self._txn_to_row(issuer_cik, t) for t in transactions if t.accession in new_accessions
        ]

        self._conn.execute("BEGIN")
        try:
            self._conn.executemany(
                _INSERT_FILING_SQL,
                [(issuer_cik, f.accession, f.filed or "", f.form_type) for f in new_filings],
            )
            if rows:
                self._conn.executemany(_INSERT_TXN_SQL, rows)
            self._conn.execute("COMMIT")
        except BaseException:
            self._conn.execute("ROLLBACK")
            raise
        return len(rows)

    def cached_filing_count(self, issuer_cik: int) -> int:
        cur = self._conn.execute(
            "SELECT COUNT(*) FROM insider_filings WHERE issuer_cik = ?", (issuer_cik,)
        )
        return cur.fetchone()[0]

    def get_insider_transactions(self, issuer_cik: int, limit: int) -> list[InsiderTransaction]:
        cur = self._conn.execute(
            """
            SELECT t.* FROM insider_transactions t
            WHERE t.issuer_cik = ?
              AND t.accession IN (
                  SELECT accession FROM insider_filings
                  WHERE issuer_cik = ?
                  ORDER BY filed DESC, accession DESC
                  LIMIT ?
              )
            ORDER BY t.filed DESC, t.accession DESC, t.id ASC
            """,
            (issuer_cik, issuer_cik, limit),
        )
        cols = [d[0] for d in cur.description]
        return [self._row_to_txn(dict(zip(cols, row, strict=True))) for row in cur.fetchall()]

    def close(self) -> None:
        self._conn.close()

    @staticmethod
    def _txn_to_row(issuer_cik: int, t: InsiderTransaction) -> tuple:
        return (
            issuer_cik,
            t.accession or "",
            t.issuer_name,
            t.owner_name,
            t.owner_relationship,
            t.form_type,
            t.filed,
            t.transaction_date,
            t.security_title,
            t.shares,
            t.price_per_share,
            t.acquired_disposed,
            t.ownership_type,
            t.shares_owned_after,
            1 if t.is_holding else 0,
        )

    @staticmethod
    def _row_to_txn(row: dict) -> InsiderTransaction:
        return InsiderTransaction(
            issuer_cik=row["issuer_cik"],
            issuer_name=row["issuer_name"],
            owner_name=row["owner_name"],
            owner_relationship=row["owner_relationship"],
            form_type=row["form_type"],
            filed=row["filed"],
            accession=row["accession"] or None,
            transaction_date=row["transaction_date"],
            security_title=row["security_title"],
            shares=row["shares"],
            price_per_share=row["price_per_share"],
            acquired_disposed=row["acquired_disposed"],
            ownership_type=row["ownership_type"],
            shares_owned_after=row["shares_owned_after"],
            is_holding=bool(row["is_holding"]),
        )

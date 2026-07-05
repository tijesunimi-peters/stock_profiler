"""SQLite implementation of the 13F holdings-snapshot repository. See holdings_repository.py.

Own connection to the same db file as the other repositories (fine under WAL mode).
"""

from __future__ import annotations

import sqlite3
from pathlib import Path

from secfin.normalize.schema import HoldingsSnapshot, InstitutionalHolding
from secfin.storage.holdings_repository import HoldingsSnapshotRepository

_SCHEMA = """
CREATE TABLE IF NOT EXISTS holdings_snapshots (
    manager_cik INTEGER NOT NULL,
    report_period TEXT NOT NULL,
    manager_name TEXT,
    filed TEXT,
    accession TEXT NOT NULL DEFAULT '',
    is_amendment INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (manager_cik, report_period)
);

CREATE TABLE IF NOT EXISTS holdings (
    id INTEGER PRIMARY KEY,
    manager_cik INTEGER NOT NULL,
    report_period TEXT NOT NULL,
    cusip TEXT NOT NULL,
    issuer_name TEXT,
    title_of_class TEXT,
    value REAL,
    shares REAL,
    shares_or_principal TEXT,
    put_call TEXT,
    investment_discretion TEXT
);

CREATE INDEX IF NOT EXISTS idx_holdings_manager_period
    ON holdings (manager_cik, report_period);
"""

_UPSERT_SNAPSHOT_SQL = """
INSERT INTO holdings_snapshots (
    manager_cik, report_period, manager_name, filed, accession, is_amendment
) VALUES (?, ?, ?, ?, ?, ?)
ON CONFLICT (manager_cik, report_period) DO UPDATE SET
    manager_name = excluded.manager_name,
    filed = excluded.filed,
    accession = excluded.accession,
    is_amendment = excluded.is_amendment
"""

_INSERT_HOLDING_SQL = """
INSERT INTO holdings (
    manager_cik, report_period, cusip, issuer_name, title_of_class, value, shares,
    shares_or_principal, put_call, investment_discretion
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
"""


class SQLiteHoldingsSnapshotRepository(HoldingsSnapshotRepository):
    def __init__(self, db_path: str | Path) -> None:
        self._db_path = Path(db_path)
        self._db_path.parent.mkdir(parents=True, exist_ok=True)
        self._conn = sqlite3.connect(self._db_path, isolation_level=None)
        self._conn.execute("PRAGMA journal_mode=WAL")
        self._conn.execute("PRAGMA synchronous=NORMAL")
        self._conn.executescript(_SCHEMA)

    def upsert_snapshot(self, snapshot: HoldingsSnapshot) -> None:
        self._conn.execute("BEGIN")
        try:
            self._conn.execute(
                _UPSERT_SNAPSHOT_SQL,
                (
                    snapshot.manager_cik,
                    snapshot.report_period,
                    snapshot.manager_name,
                    snapshot.filed,
                    snapshot.accession or "",
                    1 if snapshot.is_amendment else 0,
                ),
            )
            # Replacing an existing snapshot's holdings wholesale (rather than
            # diffing/upserting individual rows) is correct here: a snapshot is a
            # complete point-in-time picture, so a re-store means "this quarter's
            # holdings are now exactly this list."
            self._conn.execute(
                "DELETE FROM holdings WHERE manager_cik = ? AND report_period = ?",
                (snapshot.manager_cik, snapshot.report_period),
            )
            if snapshot.holdings:
                self._conn.executemany(
                    _INSERT_HOLDING_SQL,
                    [
                        (
                            snapshot.manager_cik,
                            snapshot.report_period,
                            h.cusip,
                            h.issuer_name,
                            h.title_of_class,
                            h.value,
                            h.shares,
                            h.shares_or_principal,
                            h.put_call,
                            h.investment_discretion,
                        )
                        for h in snapshot.holdings
                    ],
                )
            self._conn.execute("COMMIT")
        except BaseException:
            self._conn.execute("ROLLBACK")
            raise

    def get_snapshot(self, manager_cik: int, report_period: str) -> HoldingsSnapshot | None:
        cur = self._conn.execute(
            "SELECT manager_name, filed, accession, is_amendment FROM holdings_snapshots "
            "WHERE manager_cik = ? AND report_period = ?",
            (manager_cik, report_period),
        )
        row = cur.fetchone()
        if row is None:
            return None
        manager_name, filed, accession, is_amendment = row

        cur = self._conn.execute(
            "SELECT cusip, issuer_name, title_of_class, value, shares, shares_or_principal, "
            "put_call, investment_discretion FROM holdings "
            "WHERE manager_cik = ? AND report_period = ? ORDER BY id ASC",
            (manager_cik, report_period),
        )
        cols = [d[0] for d in cur.description]
        holdings = [
            InstitutionalHolding(**dict(zip(cols, row, strict=True))) for row in cur.fetchall()
        ]

        return HoldingsSnapshot(
            manager_cik=manager_cik,
            manager_name=manager_name,
            report_period=report_period,
            filed=filed,
            accession=accession or None,
            is_amendment=bool(is_amendment),
            holdings=holdings,
        )

    def close(self) -> None:
        self._conn.close()

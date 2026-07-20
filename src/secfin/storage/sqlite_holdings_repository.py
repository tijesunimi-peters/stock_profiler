"""SQLite implementation of the 13F holdings-snapshot repository. See holdings_repository.py.

Own connection to the same db file as the other repositories (fine under WAL mode).
"""

from __future__ import annotations

import sqlite3
from pathlib import Path

from secfin.normalize.schema import (
    HoldingsSnapshot,
    InstitutionalHolding,
    IssuerHolder,
    OtherManager13F,
)
from secfin.storage.holdings_repository import HoldingsSnapshotRepository

_SCHEMA = """
CREATE TABLE IF NOT EXISTS holdings_snapshots (
    manager_cik INTEGER NOT NULL,
    report_period TEXT NOT NULL,
    manager_name TEXT,
    filed TEXT,
    accession TEXT NOT NULL DEFAULT '',
    is_amendment INTEGER NOT NULL DEFAULT 0,
    -- The filing manager's reported business stateOrCountry (raw code). NULL for snapshots
    -- ingested before this column existed -- surfaced as an honest "Location unknown"
    -- bucket by the holder-geography endpoint, not backfilled here. See the migration in
    -- __init__ and sec/institutional.parse_filing_manager_location.
    filing_manager_location TEXT,
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
    investment_discretion TEXT,
    other_managers TEXT NOT NULL DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_holdings_manager_period
    ON holdings (manager_cik, report_period);

-- Issuer-centric reads (holders_of) look up by cusip within a quarter, the opposite
-- axis from the manager-centric index above -- a live point lookup, not the
-- whole-quarter aggregate scan benchmarked with DuckDB (see docs/ARCHITECTURE.md 3b).
CREATE INDEX IF NOT EXISTS idx_holdings_cusip_period
    ON holdings (cusip, report_period);

-- The cover page's otherManagers2Info roster: co-filing managers, numbered by
-- sequenceNumber. `holdings.other_managers` references these numbers per-position.
CREATE TABLE IF NOT EXISTS holdings_other_managers (
    manager_cik INTEGER NOT NULL,
    report_period TEXT NOT NULL,
    sequence_number INTEGER NOT NULL,
    name TEXT,
    file_number TEXT,
    PRIMARY KEY (manager_cik, report_period, sequence_number)
);
"""

_UPSERT_SNAPSHOT_SQL = """
INSERT INTO holdings_snapshots (
    manager_cik, report_period, manager_name, filed, accession, is_amendment,
    filing_manager_location
) VALUES (?, ?, ?, ?, ?, ?, ?)
ON CONFLICT (manager_cik, report_period) DO UPDATE SET
    manager_name = excluded.manager_name,
    filed = excluded.filed,
    accession = excluded.accession,
    is_amendment = excluded.is_amendment,
    filing_manager_location = excluded.filing_manager_location
"""

_INSERT_HOLDING_SQL = """
INSERT INTO holdings (
    manager_cik, report_period, cusip, issuer_name, title_of_class, value, shares,
    shares_or_principal, put_call, investment_discretion, other_managers
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
"""

_INSERT_OTHER_MANAGER_SQL = """
INSERT INTO holdings_other_managers (
    manager_cik, report_period, sequence_number, name, file_number
) VALUES (?, ?, ?, ?, ?)
"""


def _join_refs(refs: list[int]) -> str:
    return ",".join(str(n) for n in refs)


def _split_refs(s: str | None) -> list[int]:
    if not s:
        return []
    return [int(part) for part in s.split(",") if part]


class SQLiteHoldingsSnapshotRepository(HoldingsSnapshotRepository):
    def __init__(self, db_path: str | Path) -> None:
        self._db_path = Path(db_path)
        self._db_path.parent.mkdir(parents=True, exist_ok=True)
        self._conn = sqlite3.connect(self._db_path, isolation_level=None)
        self._conn.execute("PRAGMA journal_mode=WAL")
        self._conn.execute("PRAGMA synchronous=NORMAL")
        self._conn.executescript(_SCHEMA)
        self._migrate()

    def _migrate(self) -> None:
        """Idempotently bring an existing DB up to the current schema. SQLite's
        `CREATE TABLE IF NOT EXISTS` never alters an existing table, so a column added
        after a DB was first created has to be `ALTER TABLE ... ADD COLUMN`'d in here.
        Guarded on `PRAGMA table_info` so a re-open (or a brand-new DB that already has
        the column from `_SCHEMA`) is a no-op."""
        cols = {row[1] for row in self._conn.execute("PRAGMA table_info(holdings_snapshots)")}
        if "filing_manager_location" not in cols:
            self._conn.execute(
                "ALTER TABLE holdings_snapshots ADD COLUMN filing_manager_location TEXT"
            )

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
                    snapshot.filing_manager_location,
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
            self._conn.execute(
                "DELETE FROM holdings_other_managers WHERE manager_cik = ? AND report_period = ?",
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
                            _join_refs(h.other_managers),
                        )
                        for h in snapshot.holdings
                    ],
                )
            if snapshot.other_managers:
                self._conn.executemany(
                    _INSERT_OTHER_MANAGER_SQL,
                    [
                        (
                            snapshot.manager_cik,
                            snapshot.report_period,
                            m.sequence_number,
                            m.name,
                            m.file_number,
                        )
                        for m in snapshot.other_managers
                    ],
                )
            self._conn.execute("COMMIT")
        except BaseException:
            self._conn.execute("ROLLBACK")
            raise

    def get_snapshot(self, manager_cik: int, report_period: str) -> HoldingsSnapshot | None:
        cur = self._conn.execute(
            "SELECT manager_name, filed, accession, is_amendment, filing_manager_location "
            "FROM holdings_snapshots WHERE manager_cik = ? AND report_period = ?",
            (manager_cik, report_period),
        )
        row = cur.fetchone()
        if row is None:
            return None
        manager_name, filed, accession, is_amendment, filing_manager_location = row

        cur = self._conn.execute(
            "SELECT cusip, issuer_name, title_of_class, value, shares, shares_or_principal, "
            "put_call, investment_discretion, other_managers FROM holdings "
            "WHERE manager_cik = ? AND report_period = ? ORDER BY id ASC",
            (manager_cik, report_period),
        )
        cols = [d[0] for d in cur.description]
        holdings = []
        for row in cur.fetchall():
            fields = dict(zip(cols, row, strict=True))
            fields["other_managers"] = _split_refs(fields.pop("other_managers"))
            holdings.append(InstitutionalHolding(**fields))

        cur = self._conn.execute(
            "SELECT sequence_number, name, file_number FROM holdings_other_managers "
            "WHERE manager_cik = ? AND report_period = ? ORDER BY sequence_number ASC",
            (manager_cik, report_period),
        )
        other_managers = [
            OtherManager13F(sequence_number=seq, name=name, file_number=file_number)
            for seq, name, file_number in cur.fetchall()
        ]

        return HoldingsSnapshot(
            manager_cik=manager_cik,
            manager_name=manager_name,
            report_period=report_period,
            filed=filed,
            accession=accession or None,
            is_amendment=bool(is_amendment),
            holdings=holdings,
            other_managers=other_managers,
            filing_manager_location=filing_manager_location,
        )

    def cached_accession(self, manager_cik: int, report_period: str) -> str | None:
        cur = self._conn.execute(
            "SELECT accession FROM holdings_snapshots WHERE manager_cik = ? AND report_period = ?",
            (manager_cik, report_period),
        )
        row = cur.fetchone()
        if row is None:
            return None
        return row[0] or None

    def manager_periods(self, manager_cik: int) -> list[str]:
        cur = self._conn.execute(
            "SELECT report_period FROM holdings_snapshots WHERE manager_cik = ? "
            "ORDER BY report_period DESC",
            (manager_cik,),
        )
        return [row[0] for row in cur.fetchall()]

    def issuer_periods(self, cusips: list[str]) -> list[str]:
        if not cusips:
            return []
        placeholders = ",".join("?" for _ in cusips)
        cur = self._conn.execute(
            f"SELECT DISTINCT report_period FROM holdings WHERE cusip IN ({placeholders}) "
            f"ORDER BY report_period DESC",
            tuple(cusips),
        )
        return [row[0] for row in cur.fetchall()]

    def holders_of(self, cusips: list[str], report_period: str) -> list[IssuerHolder]:
        if not cusips:
            return []
        placeholders = ",".join("?" for _ in cusips)
        cur = self._conn.execute(
            f"SELECT h.manager_cik, hs.manager_name, h.cusip, h.issuer_name, h.shares, "
            f"h.value, h.other_managers, hs.filing_manager_location, h.put_call, "
            f"h.shares_or_principal "
            f"FROM holdings h "
            f"JOIN holdings_snapshots hs "
            f"  ON h.manager_cik = hs.manager_cik AND h.report_period = hs.report_period "
            f"WHERE h.report_period = ? AND h.cusip IN ({placeholders}) "
            f"ORDER BY h.shares DESC",
            (report_period, *cusips),
        )
        return [
            IssuerHolder(
                manager_cik=row[0],
                manager_name=row[1],
                cusip=row[2],
                issuer_name=row[3],
                shares=row[4],
                value=row[5],
                other_managers=_split_refs(row[6]),
                location=row[7],
                put_call=row[8],
                shares_or_principal=row[9],
            )
            for row in cur.fetchall()
        ]

    def manager_cusip_sets(
        self, manager_ciks: list[int], report_period: str
    ) -> dict[int, set[str]]:
        if not manager_ciks:
            return {}
        placeholders = ",".join("?" for _ in manager_ciks)
        # Bounded to the K managers passed in, served by idx_holdings_manager_period -- a
        # per-manager read (same character as book_values), NOT the whole-quarter cross-manager
        # scan reserved for DuckDB (guardrail 6). Every position type, keyed by CUSIP.
        cur = self._conn.execute(
            f"SELECT manager_cik, cusip FROM holdings "
            f"WHERE report_period = ? AND manager_cik IN ({placeholders})",
            (report_period, *manager_ciks),
        )
        out: dict[int, set[str]] = {}
        for manager_cik, cusip in cur.fetchall():
            out.setdefault(manager_cik, set()).add(cusip)
        return out

    def snapshots_missing_location(self, report_period: str) -> list[tuple[int, str]]:
        cur = self._conn.execute(
            "SELECT manager_cik, accession FROM holdings_snapshots "
            "WHERE report_period = ? AND filing_manager_location IS NULL AND accession != ''",
            (report_period,),
        )
        return [(row[0], row[1]) for row in cur.fetchall()]

    def set_filing_manager_location(
        self, manager_cik: int, report_period: str, location: str
    ) -> None:
        self._conn.execute(
            "UPDATE holdings_snapshots SET filing_manager_location = ? "
            "WHERE manager_cik = ? AND report_period = ?",
            (location, manager_cik, report_period),
        )

    def close(self) -> None:
        self._conn.close()

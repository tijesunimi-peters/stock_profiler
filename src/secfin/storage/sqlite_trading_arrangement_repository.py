"""SQLite implementation of the trading-arrangement repository. See its interface.

Own connection to the same db file as the other stores -- fine under WAL mode, same reasoning as
sqlite_cusip_repository.py.
"""

from __future__ import annotations

from collections.abc import Sequence
from pathlib import Path

from secfin.storage.connection import connect
from secfin.sec.trading_arrangements import TradingArrangement
from secfin.storage.trading_arrangement_repository import TradingArrangementRepository

_SCHEMA = """
CREATE TABLE IF NOT EXISTS trading_arrangements (
    cik INTEGER NOT NULL,
    accession TEXT NOT NULL,
    -- The IndividualAxis member, which is the identity WITHIN a filing. Names repeat across
    -- companies and can be re-spelled between filings; the member is what the filer keyed on.
    member TEXT NOT NULL,
    person TEXT,
    title TEXT,
    rule_10b5_1_adopted INTEGER,
    rule_10b5_1_terminated INTEGER,
    non_rule_10b5_1_adopted INTEGER,
    non_rule_10b5_1_terminated INTEGER,
    -- The filer's own strings. These elements are named `...Date` but typed as TEXT, and the
    -- format varies by filer, so the raw value is stored beside the parsed one as the evidence.
    adoption_date_raw TEXT,
    termination_date_raw TEXT,
    expiration_date_raw TEXT,
    adoption_date TEXT,
    termination_date TEXT,
    expiration_date TEXT,
    duration TEXT,
    securities_amount REAL,
    securities_unit TEXT,
    PRIMARY KEY (cik, accession, member)
);

CREATE INDEX IF NOT EXISTS idx_trading_arrangements_cik
    ON trading_arrangements (cik, accession);
"""

_COLUMNS = (
    "cik, accession, member, person, title, rule_10b5_1_adopted, rule_10b5_1_terminated, "
    "non_rule_10b5_1_adopted, non_rule_10b5_1_terminated, adoption_date_raw, "
    "termination_date_raw, expiration_date_raw, adoption_date, termination_date, "
    "expiration_date, duration, securities_amount, securities_unit"
)


def _int(flag: bool | None) -> int | None:
    return None if flag is None else int(flag)


class SQLiteTradingArrangementRepository(TradingArrangementRepository):
    def __init__(self, db_path: str | Path) -> None:
        self._db_path = Path(db_path)
        self._conn = connect(self._db_path)
        self._conn.executescript(_SCHEMA)

    def replace_for_filing(
        self, cik: int, accession: str, arrangements: Sequence[TradingArrangement]
    ) -> int:
        rows = [
            (
                cik,
                accession,
                a.member,
                a.person,
                a.title,
                _int(a.rule_10b5_1_adopted),
                _int(a.rule_10b5_1_terminated),
                _int(a.non_rule_10b5_1_adopted),
                _int(a.non_rule_10b5_1_terminated),
                a.adoption_date_raw,
                a.termination_date_raw,
                a.expiration_date_raw,
                a.adoption_date,
                a.termination_date,
                a.expiration_date,
                a.duration,
                a.securities_amount,
                a.securities_unit,
            )
            for a in arrangements
        ]
        self._conn.execute("BEGIN")
        try:
            self._conn.execute(
                "DELETE FROM trading_arrangements WHERE cik = ? AND accession = ?",
                (cik, accession),
            )
            if rows:
                placeholders = ",".join("?" * 18)
                self._conn.executemany(
                    f"INSERT INTO trading_arrangements ({_COLUMNS}) VALUES ({placeholders})", rows
                )
            self._conn.execute("COMMIT")
        except BaseException:
            self._conn.execute("ROLLBACK")
            raise
        return len(rows)

    def get_for_filing(self, cik: int, accession: str) -> list[TradingArrangement]:
        cur = self._conn.execute(
            f"SELECT {_COLUMNS} FROM trading_arrangements WHERE cik = ? AND accession = ? "
            "ORDER BY COALESCE(adoption_date, adoption_date_raw, ''), person",
            (cik, accession),
        )
        return [
            TradingArrangement(
                member=r[2],
                person=r[3],
                title=r[4],
                rule_10b5_1_adopted=None if r[5] is None else bool(r[5]),
                rule_10b5_1_terminated=None if r[6] is None else bool(r[6]),
                non_rule_10b5_1_adopted=None if r[7] is None else bool(r[7]),
                non_rule_10b5_1_terminated=None if r[8] is None else bool(r[8]),
                adoption_date_raw=r[9],
                termination_date_raw=r[10],
                expiration_date_raw=r[11],
                adoption_date=r[12],
                termination_date=r[13],
                expiration_date=r[14],
                duration=r[15],
                securities_amount=r[16],
                securities_unit=r[17],
            )
            for r in cur.fetchall()
        ]

    def close(self) -> None:
        self._conn.close()

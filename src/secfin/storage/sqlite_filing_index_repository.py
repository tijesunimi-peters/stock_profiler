"""SQLite implementation of the filing index. See filing_index_repository.py.

Own connection to the same db file as the other repositories (fine under WAL mode).
"""

from __future__ import annotations

from pathlib import Path

from secfin.storage.connection import connect
from secfin.sec.filing_index import FilingIndexEntry
from secfin.storage.filing_index_repository import FilingIndexRepository

_SCHEMA = """
CREATE TABLE IF NOT EXISTS filing_index (
    cik INTEGER NOT NULL,
    accession TEXT NOT NULL,
    form TEXT NOT NULL,
    filing_date TEXT,
    -- When EDGAR ACCEPTED the submission, distinct from the date it assigns. Both are kept so a
    -- lag statistic can say which one it measured.
    acceptance_datetime TEXT,
    -- The period the filing REPORTS on (a 13F's quarter end), not when it was filed.
    report_date TEXT,
    -- 8-K item codes as EDGAR serves them ("5.02,9.01"); NULL for other forms.
    items TEXT,
    primary_document TEXT,
    size INTEGER,
    PRIMARY KEY (cik, accession)
);

CREATE INDEX IF NOT EXISTS idx_filing_index_cik_form_date
    ON filing_index (cik, form, filing_date DESC);
CREATE INDEX IF NOT EXISTS idx_filing_index_cik_date
    ON filing_index (cik, filing_date DESC);
"""

_UPSERT_SQL = """
INSERT INTO filing_index (
    cik, accession, form, filing_date, acceptance_datetime, report_date, items,
    primary_document, size
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
ON CONFLICT (cik, accession) DO UPDATE SET
    form = excluded.form,
    filing_date = excluded.filing_date,
    acceptance_datetime = excluded.acceptance_datetime,
    report_date = excluded.report_date,
    items = excluded.items,
    primary_document = excluded.primary_document,
    size = excluded.size
"""

_COLUMNS = (
    "cik, accession, form, filing_date, acceptance_datetime, report_date, items, "
    "primary_document, size"
)


class SQLiteFilingIndexRepository(FilingIndexRepository):
    def __init__(self, db_path: str | Path) -> None:
        self._db_path = Path(db_path)
        self._conn = connect(self._db_path)
        self._conn.executescript(_SCHEMA)

    def upsert_filings(self, cik: int, entries: list[FilingIndexEntry]) -> int:
        rows = [
            (
                cik,
                e.accession,
                e.form,
                e.filing_date,
                e.acceptance_datetime,
                e.report_date,
                e.items,
                e.primary_document,
                e.size,
            )
            for e in entries
            if e.accession
        ]
        if not rows:
            return 0
        self._conn.executemany(_UPSERT_SQL, rows)
        return len(rows)

    def get_filings(self, cik: int, forms: list[str] | None, limit: int) -> list[FilingIndexEntry]:
        params: list = [cik]
        where = "cik = ?"
        if forms:
            where += " AND form IN ({})".format(",".join("?" * len(forms)))
            params.extend(forms)
        params.append(limit)
        cur = self._conn.execute(
            f"SELECT {_COLUMNS} FROM filing_index WHERE {where} "
            "ORDER BY filing_date DESC, accession DESC LIMIT ?",
            tuple(params),
        )
        return [self._row(r) for r in cur.fetchall()]

    def filings_for_ciks(
        self, ciks: list[int], forms: list[str], report_date: str | None
    ) -> list[FilingIndexEntry]:
        if not ciks or not forms:
            return []
        params: list = list(ciks) + list(forms)
        where = "cik IN ({}) AND form IN ({})".format(
            ",".join("?" * len(ciks)),
            ",".join("?" * len(forms)),
        )
        if report_date:
            where += " AND report_date = ?"
            params.append(report_date)
        cur = self._conn.execute(
            f"SELECT {_COLUMNS} FROM filing_index WHERE {where} ORDER BY filing_date DESC",
            tuple(params),
        )
        return [self._row(r) for r in cur.fetchall()]

    def indexed_count(self, cik: int) -> int:
        cur = self._conn.execute("SELECT COUNT(*) FROM filing_index WHERE cik = ?", (cik,))
        return int(cur.fetchone()[0])

    def indexed_window(self, cik: int) -> tuple[str | None, str | None]:
        cur = self._conn.execute(
            "SELECT MIN(filing_date), MAX(filing_date) FROM filing_index "
            "WHERE cik = ? AND filing_date IS NOT NULL",
            (cik,),
        )
        row = cur.fetchone()
        return (row[0], row[1]) if row else (None, None)

    @staticmethod
    def _row(r: tuple) -> FilingIndexEntry:
        return FilingIndexEntry(
            cik=r[0],
            accession=r[1],
            form=r[2],
            filing_date=r[3],
            acceptance_datetime=r[4],
            report_date=r[5],
            items=r[6],
            primary_document=r[7],
            size=r[8],
        )

    def close(self) -> None:
        self._conn.close()

"""SQLite implementation of the tone-shift-alert store. See tone_shift_alert_repository.py."""

from __future__ import annotations

from pathlib import Path

from secfin.storage.connection import connect
from secfin.storage.tone_shift_alert_repository import (
    ToneShiftAlertRepository,
    ToneShiftAlertRow,
)

_COLS = (
    "cik, peer_group, company_name, item_code, accession, prior_accession, filing_date, "
    "cosine_similarity, jaccard_similarity"
)

_SCHEMA = """
CREATE TABLE IF NOT EXISTS tone_shift_alerts (
    cik INTEGER NOT NULL,
    peer_group TEXT NOT NULL,
    company_name TEXT,
    item_code TEXT NOT NULL,
    accession TEXT NOT NULL,
    prior_accession TEXT NOT NULL,
    filing_date TEXT,
    cosine_similarity REAL NOT NULL,
    jaccard_similarity REAL NOT NULL,
    PRIMARY KEY (cik, accession, item_code)
);
CREATE INDEX IF NOT EXISTS idx_tsa_group ON tone_shift_alerts (peer_group);
"""

_UPSERT = f"""
INSERT INTO tone_shift_alerts ({_COLS})
VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
ON CONFLICT (cik, accession, item_code) DO UPDATE SET
    peer_group = excluded.peer_group,
    company_name = excluded.company_name,
    prior_accession = excluded.prior_accession,
    filing_date = excluded.filing_date,
    cosine_similarity = excluded.cosine_similarity,
    jaccard_similarity = excluded.jaccard_similarity
"""


def _row(r: tuple) -> ToneShiftAlertRow:
    return ToneShiftAlertRow(
        cik=int(r[0]), peer_group=r[1], company_name=r[2], item_code=r[3],
        accession=r[4], prior_accession=r[5], filing_date=r[6],
        cosine_similarity=float(r[7]), jaccard_similarity=float(r[8]),
    )


class SQLiteToneShiftAlertRepository(ToneShiftAlertRepository):
    def __init__(self, db_path: str | Path) -> None:
        self._db_path = Path(db_path)
        self._conn = connect(self._db_path)
        self._conn.executescript(_SCHEMA)

    def bulk_upsert(self, rows: list[ToneShiftAlertRow]) -> None:
        if not rows:
            return
        self._conn.execute("BEGIN")
        try:
            self._conn.executemany(
                _UPSERT,
                [
                    (
                        r.cik, r.peer_group, r.company_name, r.item_code, r.accession,
                        r.prior_accession, r.filing_date, r.cosine_similarity,
                        r.jaccard_similarity,
                    )
                    for r in rows
                ],
            )
            self._conn.execute("COMMIT")
        except Exception:
            self._conn.execute("ROLLBACK")
            raise

    def get_group(self, peer_group: str) -> list[ToneShiftAlertRow]:
        cur = self._conn.execute(
            f"SELECT {_COLS} FROM tone_shift_alerts WHERE peer_group = ? ORDER BY cik",
            (peer_group,),
        )
        return [_row(r) for r in cur.fetchall()]

    def close(self) -> None:
        self._conn.close()

"""SQLite implementation of the governance-stats store. See sector_governance_stat_repository.py."""

from __future__ import annotations

from pathlib import Path

from secfin.storage.connection import connect
from secfin.storage.sector_governance_stat_repository import (
    SectorGovernanceStatRepository,
    SectorGovernanceStatRow,
)

_COLS = (
    "cik, peer_group, company_name, cyber_processes_integrated, cyber_reports_to_board, "
    "cyber_positions_responsible, cyber_incident_8k_count, auditor_name, tenure_since, "
    "tenure_since_is_change, tenure_years, tenure_status, tenure_reason, late_notice_count, "
    "non_reliance_count, indexed_filings, indexed_from, indexed_to"
)

_SCHEMA = """
CREATE TABLE IF NOT EXISTS sector_governance_stats (
    cik INTEGER PRIMARY KEY,
    peer_group TEXT NOT NULL,
    company_name TEXT,
    cyber_processes_integrated INTEGER,
    cyber_reports_to_board INTEGER,
    cyber_positions_responsible INTEGER,
    cyber_incident_8k_count INTEGER NOT NULL,
    auditor_name TEXT,
    tenure_since TEXT,
    tenure_since_is_change INTEGER NOT NULL,
    tenure_years REAL,
    tenure_status TEXT NOT NULL,
    tenure_reason TEXT,
    late_notice_count INTEGER NOT NULL,
    non_reliance_count INTEGER NOT NULL,
    indexed_filings INTEGER NOT NULL,
    indexed_from TEXT,
    indexed_to TEXT
);
CREATE INDEX IF NOT EXISTS idx_sgs_group ON sector_governance_stats (peer_group);
"""

_UPSERT = f"""
INSERT INTO sector_governance_stats ({_COLS})
VALUES ({",".join("?" * 18)})
ON CONFLICT (cik) DO UPDATE SET
    peer_group = excluded.peer_group,
    company_name = excluded.company_name,
    cyber_processes_integrated = excluded.cyber_processes_integrated,
    cyber_reports_to_board = excluded.cyber_reports_to_board,
    cyber_positions_responsible = excluded.cyber_positions_responsible,
    cyber_incident_8k_count = excluded.cyber_incident_8k_count,
    auditor_name = excluded.auditor_name,
    tenure_since = excluded.tenure_since,
    tenure_since_is_change = excluded.tenure_since_is_change,
    tenure_years = excluded.tenure_years,
    tenure_status = excluded.tenure_status,
    tenure_reason = excluded.tenure_reason,
    late_notice_count = excluded.late_notice_count,
    non_reliance_count = excluded.non_reliance_count,
    indexed_filings = excluded.indexed_filings,
    indexed_from = excluded.indexed_from,
    indexed_to = excluded.indexed_to
"""


def _bool(v: int | None) -> bool | None:
    return None if v is None else bool(v)


def _row(r: tuple) -> SectorGovernanceStatRow:
    return SectorGovernanceStatRow(
        cik=int(r[0]),
        peer_group=r[1],
        company_name=r[2],
        cyber_processes_integrated=_bool(r[3]),
        cyber_reports_to_board=_bool(r[4]),
        cyber_positions_responsible=_bool(r[5]),
        cyber_incident_8k_count=int(r[6]),
        auditor_name=r[7],
        tenure_since=r[8],
        tenure_since_is_change=bool(r[9]),
        tenure_years=None if r[10] is None else float(r[10]),
        tenure_status=r[11],
        tenure_reason=r[12],
        late_notice_count=int(r[13]),
        non_reliance_count=int(r[14]),
        indexed_filings=int(r[15]),
        indexed_from=r[16],
        indexed_to=r[17],
    )


class SQLiteSectorGovernanceStatRepository(SectorGovernanceStatRepository):
    def __init__(self, db_path: str | Path) -> None:
        self._db_path = Path(db_path)
        self._conn = connect(self._db_path)
        self._conn.executescript(_SCHEMA)

    def bulk_upsert(self, rows: list[SectorGovernanceStatRow]) -> None:
        if not rows:
            return
        self._conn.execute("BEGIN")
        try:
            self._conn.executemany(
                _UPSERT,
                [
                    (
                        r.cik, r.peer_group, r.company_name,
                        None if r.cyber_processes_integrated is None else int(r.cyber_processes_integrated),
                        None if r.cyber_reports_to_board is None else int(r.cyber_reports_to_board),
                        None if r.cyber_positions_responsible is None else int(r.cyber_positions_responsible),
                        r.cyber_incident_8k_count, r.auditor_name, r.tenure_since,
                        int(r.tenure_since_is_change), r.tenure_years, r.tenure_status,
                        r.tenure_reason, r.late_notice_count, r.non_reliance_count,
                        r.indexed_filings, r.indexed_from, r.indexed_to,
                    )
                    for r in rows
                ],
            )
            self._conn.execute("COMMIT")
        except Exception:
            self._conn.execute("ROLLBACK")
            raise

    def get_group(self, peer_group: str) -> list[SectorGovernanceStatRow]:
        cur = self._conn.execute(
            f"SELECT {_COLS} FROM sector_governance_stats WHERE peer_group = ? ORDER BY cik",
            (peer_group,),
        )
        return [_row(r) for r in cur.fetchall()]

    def get(self, cik: int) -> SectorGovernanceStatRow | None:
        cur = self._conn.execute(
            f"SELECT {_COLS} FROM sector_governance_stats WHERE cik = ?", (cik,)
        )
        r = cur.fetchone()
        return _row(r) if r else None

    def close(self) -> None:
        self._conn.close()

"""SQLite implementation of the section-metrics store. See section_metric_repository.py."""

from __future__ import annotations

from pathlib import Path

from secfin.normalize.section_metrics import METRICS_SCHEMA_VERSION, TextMetrics
from secfin.storage.connection import connect
from secfin.storage.section_metric_repository import SectionMetricRepository

_COLS = (
    "cik, accession, item_code, tone_positive, tone_negative, weak_modal, strong_modal, "
    "fog_index, flesch_kincaid, schema_version"
)

_SCHEMA = """
CREATE TABLE IF NOT EXISTS section_metrics (
    cik INTEGER NOT NULL,
    accession TEXT NOT NULL,
    item_code TEXT NOT NULL,
    tone_positive REAL,
    tone_negative REAL,
    weak_modal REAL,
    strong_modal REAL,
    fog_index REAL,
    flesch_kincaid REAL,
    schema_version INTEGER,
    PRIMARY KEY (cik, accession, item_code)
);
"""

_UPSERT = f"""
INSERT INTO section_metrics ({_COLS})
VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
ON CONFLICT (cik, accession, item_code) DO UPDATE SET
    tone_positive = excluded.tone_positive,
    tone_negative = excluded.tone_negative,
    weak_modal = excluded.weak_modal,
    strong_modal = excluded.strong_modal,
    fog_index = excluded.fog_index,
    flesch_kincaid = excluded.flesch_kincaid,
    schema_version = excluded.schema_version
"""


class SQLiteSectionMetricRepository(SectionMetricRepository):
    def __init__(self, db_path: str | Path) -> None:
        self._db_path = Path(db_path)
        self._conn = connect(self._db_path)
        self._conn.executescript(_SCHEMA)

    def upsert_metrics(
        self, cik: int, accession: str, item_code: str, metrics: TextMetrics
    ) -> None:
        self._conn.execute(
            _UPSERT,
            (
                cik, accession, item_code, metrics.tone_positive, metrics.tone_negative,
                metrics.weak_modal, metrics.strong_modal, metrics.fog_index,
                metrics.flesch_kincaid, METRICS_SCHEMA_VERSION,
            ),
        )
        self._conn.commit()

    def get_metrics(self, cik: int, accession: str, item_code: str) -> TextMetrics | None:
        cur = self._conn.execute(
            "SELECT tone_positive, tone_negative, weak_modal, strong_modal, fog_index, "
            "flesch_kincaid, schema_version FROM section_metrics "
            "WHERE cik = ? AND accession = ? AND item_code = ?",
            (cik, accession, item_code),
        )
        r = cur.fetchone()
        if not r or (r[6] or 0) < METRICS_SCHEMA_VERSION:
            return None
        return TextMetrics(
            tone_positive=r[0], tone_negative=r[1], weak_modal=r[2], strong_modal=r[3],
            fog_index=r[4], flesch_kincaid=r[5],
        )

    def close(self) -> None:
        self._conn.close()

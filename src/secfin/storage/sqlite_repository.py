"""SQLite implementation of the RawFact repository.

WAL mode + synchronous=NORMAL so the API's concurrent point reads don't block on the
backfill/incremental writer, and vice versa. Per CLAUDE.md and ingest/backfill.py:
exactly ONE process should hold a writer connection at a time -- parsers never touch
the DB directly, they hand parsed facts to the single writer.
"""

from __future__ import annotations

import sqlite3
from collections.abc import Iterable, Sequence
from pathlib import Path

from secfin.normalize.schema import RawFact
from secfin.storage.repository import Checkpoint, RawFactRepository

# period_start/period_end/instant/accession are stored NOT NULL DEFAULT '' rather than
# nullable. Reason: SQLite's UNIQUE index treats every NULL as distinct from every other
# NULL, so two genuinely-identical instant facts (which always have period_start/
# period_end absent) would never collide on conflict and idempotent upsert would
# silently duplicate rows. Coalescing "absent" to '' at the storage boundary keeps
# RawFact's public None-based API intact (see _none_to_empty/_empty_to_none below).
_SCHEMA = """
CREATE TABLE IF NOT EXISTS raw_facts (
    id INTEGER PRIMARY KEY,
    cik INTEGER NOT NULL,
    taxonomy TEXT NOT NULL,
    gaap_tag TEXT NOT NULL,
    label TEXT NOT NULL,
    unit TEXT NOT NULL,
    value NUMERIC,
    period_start TEXT NOT NULL DEFAULT '',
    period_end TEXT NOT NULL DEFAULT '',
    instant TEXT NOT NULL DEFAULT '',
    fiscal_year INTEGER,
    fiscal_period TEXT,
    form TEXT,
    filed TEXT,
    accession TEXT NOT NULL DEFAULT '',
    frame TEXT,
    UNIQUE (cik, gaap_tag, unit, period_start, period_end, instant, accession)
);

CREATE INDEX IF NOT EXISTS idx_raw_facts_period
    ON raw_facts (cik, fiscal_year, fiscal_period);

-- Cross-company screening (Milestone 4): screen() filters by (gaap_tag, frame) across
-- ALL companies, the transpose of idx_raw_facts_period's per-company access pattern.
CREATE INDEX IF NOT EXISTS idx_raw_facts_frame
    ON raw_facts (gaap_tag, frame);

CREATE TABLE IF NOT EXISTS ingest_checkpoint (
    cik INTEGER NOT NULL,
    source TEXT NOT NULL,
    zip_entry TEXT,
    fact_count INTEGER NOT NULL,
    completed_at TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (cik, source)
);
"""

_UPSERT_FACT_SQL = """
INSERT INTO raw_facts (
    cik, taxonomy, gaap_tag, label, unit, value,
    period_start, period_end, instant, fiscal_year, fiscal_period,
    form, filed, accession, frame
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
ON CONFLICT (cik, gaap_tag, unit, period_start, period_end, instant, accession) DO UPDATE SET
    label = excluded.label,
    value = excluded.value,
    fiscal_year = COALESCE(excluded.fiscal_year, fiscal_year),
    fiscal_period = COALESCE(excluded.fiscal_period, fiscal_period),
    form = COALESCE(excluded.form, form),
    filed = COALESCE(excluded.filed, filed),
    frame = COALESCE(excluded.frame, frame)
"""
# ^ COALESCE, not plain excluded.*: the same physical fact arrives from two sources
# that each know only half the metadata. Companyfacts rows carry fy/fp/form/filed but
# no frame; SEC frames rows carry the frame but none of the fiscal fields (confirmed
# live -- see docs/DATA_MODEL.md's screening section). They collide on this key (frames
# rows include the accession), and before 2026-07-16 each ingest NULLed the other
# source's metadata: the frames backfill erased fiscal_year on statement facts (68 CIKs
# damaged, statements lost their revenue/net_income lines), and any cache-aside
# companyfacts fetch erased `frame`, silently dropping the company from screening.
# Merging with COALESCE keeps both halves; value/label still take the newest write.

_UPSERT_CHECKPOINT_SQL = """
INSERT INTO ingest_checkpoint (cik, source, zip_entry, fact_count)
VALUES (?, ?, ?, ?)
ON CONFLICT (cik, source) DO UPDATE SET
    zip_entry = excluded.zip_entry,
    fact_count = excluded.fact_count,
    completed_at = datetime('now')
"""


def _none_to_empty(v: str | None) -> str:
    return v if v is not None else ""


def _empty_to_none(v: str) -> str | None:
    return v if v else None


# sqlite3's C binding rejects a Python int outside signed 64-bit range with a raw
# OverflowError (it does not fall back to REAL the way it does for column affinity).
# Some real XBRL filings report facts this large (data-quality outliers, not a unit
# bug on our side) -- rather than let one poison value crash an entire batch, downcast
# out-of-range ints to float, which SQLite stores as REAL without raising.
_SQLITE_INT_MIN = -(2**63)
_SQLITE_INT_MAX = 2**63 - 1


def _sqlite_safe_value(v: float | int | None) -> float | int | None:
    if isinstance(v, int) and not (_SQLITE_INT_MIN <= v <= _SQLITE_INT_MAX):
        return float(v)
    return v


class SQLiteRawFactRepository(RawFactRepository):
    def __init__(self, db_path: str | Path) -> None:
        self._db_path = Path(db_path)
        self._db_path.parent.mkdir(parents=True, exist_ok=True)
        self._conn = sqlite3.connect(self._db_path, isolation_level=None)
        self._conn.execute("PRAGMA journal_mode=WAL")
        self._conn.execute("PRAGMA synchronous=NORMAL")
        self._conn.executescript(_SCHEMA)

    def upsert_raw_facts(self, facts: Iterable[RawFact]) -> int:
        rows = [self._fact_to_row(f) for f in facts]
        if not rows:
            return 0
        self._conn.execute("BEGIN")
        try:
            self._conn.executemany(_UPSERT_FACT_SQL, rows)
            self._conn.execute("COMMIT")
        except BaseException:
            self._conn.execute("ROLLBACK")
            raise
        return len(rows)

    def upsert_raw_facts_and_checkpoint(
        self,
        facts: Iterable[RawFact],
        checkpoints: Sequence[Checkpoint],
        source: str,
    ) -> int:
        fact_rows = [self._fact_to_row(f) for f in facts]
        checkpoint_rows = [(cik, source, entry, count) for cik, entry, count in checkpoints]
        self._conn.execute("BEGIN")
        try:
            if fact_rows:
                self._conn.executemany(_UPSERT_FACT_SQL, fact_rows)
            if checkpoint_rows:
                self._conn.executemany(_UPSERT_CHECKPOINT_SQL, checkpoint_rows)
            self._conn.execute("COMMIT")
        except BaseException:
            self._conn.execute("ROLLBACK")
            raise
        return len(fact_rows)

    def get_raw_facts(self, cik: int) -> list[RawFact]:
        cur = self._conn.execute("SELECT * FROM raw_facts WHERE cik = ?", (cik,))
        cols = [d[0] for d in cur.description]
        return [self._row_to_fact(dict(zip(cols, row, strict=True))) for row in cur.fetchall()]

    def get_raw_facts_for_period(
        self, cik: int, fiscal_year: int, fiscal_period: str
    ) -> list[RawFact]:
        cur = self._conn.execute(
            "SELECT * FROM raw_facts WHERE cik = ? AND fiscal_year = ? AND fiscal_period = ?",
            (cik, fiscal_year, fiscal_period),
        )
        cols = [d[0] for d in cur.description]
        return [self._row_to_fact(dict(zip(cols, row, strict=True))) for row in cur.fetchall()]

    def has_any_facts(self, cik: int) -> bool:
        # fiscal_year IS NOT NULL scopes this to a real companyfacts ingestion (bulk,
        # incremental, or a ticker-resolved cache-aside fetch -- all three flatten a
        # real SEC companyfacts payload, which always carries fy/fp per data point).
        # Frame-derived rows (ingest/frames_backfill.py) deliberately leave fiscal_year
        # unset -- see normalize/screening.py -- so they never satisfy this check. See
        # this method's docstring in repository.py for why that distinction matters.
        cur = self._conn.execute(
            "SELECT 1 FROM raw_facts WHERE cik = ? AND fiscal_year IS NOT NULL LIMIT 1",
            (cik,),
        )
        return cur.fetchone() is not None

    def get_ingested_ciks(self, source: str) -> set[int]:
        cur = self._conn.execute("SELECT cik FROM ingest_checkpoint WHERE source = ?", (source,))
        return {row[0] for row in cur.fetchall()}

    def all_ciks(self) -> set[int]:
        cur = self._conn.execute("SELECT DISTINCT cik FROM raw_facts")
        return {row[0] for row in cur.fetchall()}

    def screen(self, gaap_tags: Sequence[str], frame: str) -> list[tuple[int, str, float]]:
        if not gaap_tags:
            return []
        placeholders = ",".join("?" for _ in gaap_tags)
        sql = (
            f"SELECT cik, gaap_tag, value FROM raw_facts "
            f"WHERE gaap_tag IN ({placeholders}) AND frame = ? AND value IS NOT NULL"
        )
        cur = self._conn.execute(sql, (*gaap_tags, frame))
        return [(row[0], row[1], row[2]) for row in cur.fetchall()]

    def close(self) -> None:
        self._conn.close()

    @staticmethod
    def _fact_to_row(f: RawFact) -> tuple:
        return (
            f.cik,
            f.taxonomy,
            f.gaap_tag,
            f.label,
            f.unit,
            _sqlite_safe_value(f.value),
            _none_to_empty(f.period_start),
            _none_to_empty(f.period_end),
            _none_to_empty(f.instant),
            f.fiscal_year,
            f.fiscal_period,
            f.form,
            f.filed,
            _none_to_empty(f.accession),
            f.frame,
        )

    @staticmethod
    def _row_to_fact(row: dict) -> RawFact:
        return RawFact(
            cik=row["cik"],
            taxonomy=row["taxonomy"],
            gaap_tag=row["gaap_tag"],
            label=row["label"],
            unit=row["unit"],
            value=row["value"],
            period_start=_empty_to_none(row["period_start"]),
            period_end=_empty_to_none(row["period_end"]),
            instant=_empty_to_none(row["instant"]),
            fiscal_year=row["fiscal_year"],
            fiscal_period=row["fiscal_period"],
            form=row["form"],
            filed=row["filed"],
            accession=_empty_to_none(row["accession"]),
            frame=row["frame"],
        )

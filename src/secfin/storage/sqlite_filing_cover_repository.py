"""SQLite implementation of the filing cover-facts store. See filing_cover_repository.py.

Own connection to the same db file as the other repositories (fine under WAL mode).
"""

from __future__ import annotations

import json
import sqlite3
from pathlib import Path

from secfin.sec.cover import COVER_SCHEMA_VERSION, CoverFacts, ExtensionCensus
from secfin.storage.filing_cover_repository import FilingCoverRepository

_SCHEMA = """
CREATE TABLE IF NOT EXISTS filing_cover_facts (
    cik INTEGER NOT NULL,
    accession TEXT NOT NULL,
    form TEXT,
    filed TEXT,
    period_end TEXT,
    auditor_name TEXT,
    auditor_firm_id TEXT,
    auditor_location TEXT,
    registrant_name TEXT,
    incorporation_state TEXT,
    filer_category TEXT,
    fiscal_year_end TEXT,
    fiscal_year_focus TEXT,
    -- Subject to auditor ATTESTATION. NOT "ICFR was effective", NOT "no material weakness" --
    -- both of those are the Item 9A prose conclusion and are Track 2. Stored as 1/0/NULL, and
    -- NULL means the filer did not tag it, which is a different answer from `false`.
    icfr_auditor_attestation INTEGER,
    error_correction INTEGER,
    clawback_recovery_analysis INTEGER,
    -- Item 1C cybersecurity flags. NULL is UNTAGGED, never "no".
    cyber_materially_affected INTEGER,
    cyber_processes_integrated INTEGER,
    cyber_third_party_engaged INTEGER,
    cyber_positions_responsible INTEGER,
    cyber_reports_to_board INTEGER,
    cyber_third_party_oversight INTEGER,
    -- Which version of sec/cover.py's field set wrote this row. An older one is
    -- treated as a cache MISS, so adding a field heals the cache instead of
    -- silently serving NULL for every filer already in it.
    schema_version INTEGER,
    -- The registrant's OWN taxonomy: how many distinct elements, how many facts, out of how many.
    -- A census of element NAMES; no element's content is stored.
    extension_namespace TEXT,
    extension_distinct INTEGER,
    extension_facts INTEGER,
    total_facts INTEGER,
    extension_top TEXT,
    -- What the fetch actually cost, so the next capacity estimate is measured, not guessed.
    instance_bytes INTEGER,
    PRIMARY KEY (cik, accession)
);

CREATE INDEX IF NOT EXISTS idx_filing_cover_cik_filed
    ON filing_cover_facts (cik, filed DESC);
"""

_COLUMNS = (
    "cik, accession, form, filed, period_end, auditor_name, auditor_firm_id, auditor_location, "
    "registrant_name, incorporation_state, filer_category, fiscal_year_end, fiscal_year_focus, "
    "icfr_auditor_attestation, error_correction, clawback_recovery_analysis, "
    "cyber_materially_affected, cyber_processes_integrated, cyber_third_party_engaged, "
    "cyber_positions_responsible, cyber_reports_to_board, cyber_third_party_oversight, "
    "extension_namespace, extension_distinct, extension_facts, "
    "total_facts, extension_top, instance_bytes, schema_version"
)

_UPSERT_SQL = f"""
INSERT INTO filing_cover_facts ({_COLUMNS})
VALUES ({",".join("?" * 29)})
ON CONFLICT (cik, accession) DO UPDATE SET
    form = excluded.form,
    filed = excluded.filed,
    period_end = excluded.period_end,
    auditor_name = excluded.auditor_name,
    auditor_firm_id = excluded.auditor_firm_id,
    auditor_location = excluded.auditor_location,
    registrant_name = excluded.registrant_name,
    incorporation_state = excluded.incorporation_state,
    filer_category = excluded.filer_category,
    fiscal_year_end = excluded.fiscal_year_end,
    fiscal_year_focus = excluded.fiscal_year_focus,
    icfr_auditor_attestation = excluded.icfr_auditor_attestation,
    error_correction = excluded.error_correction,
    clawback_recovery_analysis = excluded.clawback_recovery_analysis,
    cyber_materially_affected = excluded.cyber_materially_affected,
    cyber_processes_integrated = excluded.cyber_processes_integrated,
    cyber_third_party_engaged = excluded.cyber_third_party_engaged,
    cyber_positions_responsible = excluded.cyber_positions_responsible,
    cyber_reports_to_board = excluded.cyber_reports_to_board,
    cyber_third_party_oversight = excluded.cyber_third_party_oversight,
    extension_namespace = excluded.extension_namespace,
    extension_distinct = excluded.extension_distinct,
    extension_facts = excluded.extension_facts,
    total_facts = excluded.total_facts,
    extension_top = excluded.extension_top,
    instance_bytes = excluded.instance_bytes,
    schema_version = excluded.schema_version
"""


def _flag(value: bool | None) -> int | None:
    """1/0/NULL. NULL is UNTAGGED and is a different answer from `false`."""
    return None if value is None else int(value)


class SQLiteFilingCoverRepository(FilingCoverRepository):
    def __init__(self, db_path: str | Path) -> None:
        self._db_path = Path(db_path)
        self._db_path.parent.mkdir(parents=True, exist_ok=True)
        self._conn = sqlite3.connect(self._db_path, isolation_level=None)
        self._conn.execute("PRAGMA journal_mode=WAL")
        self._conn.execute("PRAGMA synchronous=NORMAL")
        self._conn.executescript(_SCHEMA)
        self._ensure_columns()

    def _ensure_columns(self) -> None:
        """Additive migration for a table created before a column existed.

        Same shape as the insider store's: `CREATE TABLE IF NOT EXISTS` will not add a column,
        and SQLite has no `ADD COLUMN IF NOT EXISTS`. Rows written before the Rule 10D-1 flags
        were read keep NULL, which reads as "we have not looked", not as "false".
        """
        have = {row[1] for row in self._conn.execute("PRAGMA table_info(filing_cover_facts)")}
        for column in (
            "error_correction",
            "clawback_recovery_analysis",
            "cyber_materially_affected",
            "cyber_processes_integrated",
            "cyber_third_party_engaged",
            "cyber_positions_responsible",
            "cyber_reports_to_board",
            "cyber_third_party_oversight",
            "schema_version",
        ):
            if column not in have:
                self._conn.execute(
                    f"ALTER TABLE filing_cover_facts ADD COLUMN {column} INTEGER"
                )

    def upsert_cover(self, cik: int, facts: CoverFacts) -> None:
        if not facts.accession:
            return
        ext = facts.extensions
        self._conn.execute(
            _UPSERT_SQL,
            (
                cik,
                facts.accession,
                facts.form,
                facts.filed,
                facts.period_end,
                facts.auditor_name,
                facts.auditor_firm_id,
                facts.auditor_location,
                facts.registrant_name,
                facts.incorporation_state,
                facts.filer_category,
                facts.fiscal_year_end,
                facts.fiscal_year_focus,
                None
                if facts.icfr_auditor_attestation is None
                else int(facts.icfr_auditor_attestation),
                None if facts.error_correction is None else int(facts.error_correction),
                None
                if facts.clawback_recovery_analysis is None
                else int(facts.clawback_recovery_analysis),
                _flag(facts.cyber_materially_affected),
                _flag(facts.cyber_processes_integrated),
                _flag(facts.cyber_third_party_engaged),
                _flag(facts.cyber_positions_responsible),
                _flag(facts.cyber_reports_to_board),
                _flag(facts.cyber_third_party_oversight),
                ext.namespace,
                ext.distinct,
                ext.facts,
                ext.total_facts,
                json.dumps(ext.top),
                facts.instance_bytes,
                COVER_SCHEMA_VERSION,
            ),
        )

    def get_cover(self, cik: int, accession: str | None = None) -> CoverFacts | None:
        params: list = [cik]
        where = "cik = ?"
        if accession:
            where += " AND accession = ?"
            params.append(accession)
        cur = self._conn.execute(
            f"SELECT {_COLUMNS} FROM filing_cover_facts WHERE {where} "
            "ORDER BY filed DESC, accession DESC LIMIT 1",
            tuple(params),
        )
        row = cur.fetchone()
        if not row:
            return None
        # A row written before the current field set is a miss, not an answer -- see
        # COVER_SCHEMA_VERSION. The caller re-reads the instance once and upserts over it.
        if (row[28] or 0) < COVER_SCHEMA_VERSION:
            return None
        return self._row(row)

    def close(self) -> None:
        self._conn.close()

    @staticmethod
    def _row(r: tuple) -> CoverFacts:
        try:
            top = [(str(name), int(count)) for name, count in json.loads(r[26] or "[]")]
        except (ValueError, TypeError):
            top = []
        return CoverFacts(
            accession=r[1],
            form=r[2],
            filed=r[3],
            period_end=r[4],
            auditor_name=r[5],
            auditor_firm_id=r[6],
            auditor_location=r[7],
            registrant_name=r[8],
            incorporation_state=r[9],
            filer_category=r[10],
            fiscal_year_end=r[11],
            fiscal_year_focus=r[12],
            icfr_auditor_attestation=None if r[13] is None else bool(r[13]),
            error_correction=None if r[14] is None else bool(r[14]),
            clawback_recovery_analysis=None if r[15] is None else bool(r[15]),
            cyber_materially_affected=None if r[16] is None else bool(r[16]),
            cyber_processes_integrated=None if r[17] is None else bool(r[17]),
            cyber_third_party_engaged=None if r[18] is None else bool(r[18]),
            cyber_positions_responsible=None if r[19] is None else bool(r[19]),
            cyber_reports_to_board=None if r[20] is None else bool(r[20]),
            cyber_third_party_oversight=None if r[21] is None else bool(r[21]),
            extensions=ExtensionCensus(
                namespace=r[22],
                distinct=r[23] or 0,
                facts=r[24] or 0,
                total_facts=r[25] or 0,
                top=top,
            ),
            instance_bytes=r[27],
        )

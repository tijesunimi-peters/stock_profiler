"""SQLite implementation of the filing cover-facts store. See filing_cover_repository.py.

Own connection to the same db file as the other repositories (fine under WAL mode).
"""

from __future__ import annotations

import json
import sqlite3
from pathlib import Path

from secfin.sec.cover import CoverFacts, ExtensionCensus
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
    "icfr_auditor_attestation, extension_namespace, extension_distinct, extension_facts, "
    "total_facts, extension_top, instance_bytes"
)

_UPSERT_SQL = f"""
INSERT INTO filing_cover_facts ({_COLUMNS})
VALUES ({",".join("?" * 20)})
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
    extension_namespace = excluded.extension_namespace,
    extension_distinct = excluded.extension_distinct,
    extension_facts = excluded.extension_facts,
    total_facts = excluded.total_facts,
    extension_top = excluded.extension_top,
    instance_bytes = excluded.instance_bytes
"""


class SQLiteFilingCoverRepository(FilingCoverRepository):
    def __init__(self, db_path: str | Path) -> None:
        self._db_path = Path(db_path)
        self._db_path.parent.mkdir(parents=True, exist_ok=True)
        self._conn = sqlite3.connect(self._db_path, isolation_level=None)
        self._conn.execute("PRAGMA journal_mode=WAL")
        self._conn.execute("PRAGMA synchronous=NORMAL")
        self._conn.executescript(_SCHEMA)

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
                ext.namespace,
                ext.distinct,
                ext.facts,
                ext.total_facts,
                json.dumps(ext.top),
                facts.instance_bytes,
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
        return self._row(row) if row else None

    def close(self) -> None:
        self._conn.close()

    @staticmethod
    def _row(r: tuple) -> CoverFacts:
        try:
            top = [(str(name), int(count)) for name, count in json.loads(r[18] or "[]")]
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
            extensions=ExtensionCensus(
                namespace=r[14],
                distinct=r[15] or 0,
                facts=r[16] or 0,
                total_facts=r[17] or 0,
                top=top,
            ),
            instance_bytes=r[19],
        )

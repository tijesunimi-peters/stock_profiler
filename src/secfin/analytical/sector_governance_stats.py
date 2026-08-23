"""Per-COMPANY governance/disclosure statistics, rolled up per SIC sector (Track 2 Wave 0 --
see docs/ROADMAP_TRACK2.md). Feeds `GET /v1/sectors/{group}/disclosure-mix`.

Cybersecurity Item 1C flags (`sec/cover.py`, latest annual report), auditor identity, an
auditor-tenure FLOOR (the exact method `normalize/auditor_continuity.py` already uses for the
per-company `/audit` endpoint), and late-filing/restatement counts off the filing INDEX. All of
it is Track 1 -- tagged facts and filing existence/dates, no document read, no narrative parsed.

Analytical, batch, offline -- NEVER the live request path (CLAUDE.md guardrail 6/7), same
reasoning as `disclosure_stats.py`: placing one sector's picture together means reading every
company in the group.

**Deliberately self-contained, not a read of `disclosure_stats`.** `late_notice_count` and
`non_reliance_count` below duplicate ~4 lines of SQL that `disclosure_stats.py` also computes.
That duplication is intentional: every analytical batch job in this repo computes straight off
`filing_index`/`company_profiles`/its own source table, never off another job's output, so no
endpoint's correctness depends on a second job's schedule having run recently. `docs/TASKS.md`
OPS-5/OPS-6 already record that this repo's batch-scheduling story has unresolved staleness gaps;
this module does not add a second one on top.

Honesty / method:
  * **Cyber flags are UNTAGGED-vs-tagged, never yes-vs-no.** `None` means the filer's latest
    annual report did not carry the flag; it is excluded from that percentage's denominator, not
    counted as "no" (see sec/cover.py's own docstring on this point).
  * **`filing_cover_facts` rows below the current `COVER_SCHEMA_VERSION` are excluded**, same as
    `SQLiteFilingCoverRepository.get_cover()` treats them as a cache miss rather than an answer --
    a stale-schema row is "not yet re-read", not "no cyber disclosure".
  * **Auditor tenure is a FLOOR, not a start date**, computed by the same pure function the
    per-company `/companies/{symbol}/audit` endpoint uses (`build_auditor_continuity`) -- see that
    module's docstring for the full reasoning (rolling-window floor, `MIN_WINDOW_YEARS` gate). A
    company below the window minimum gets `tenure_status="na"` and is excluded from the sector's
    median, never averaged in as 0.
  * **Late filings and restatements are existence + dates**, matching `disclosure_stats.py`'s own
    definitions -- the more precise `_LATE_FILING_FORMS` list (not that module's looser
    `LIKE 'NT %'`) is used here since this module has no reason to keep the looser match.
  * A company with no computable value for a field is excluded from that field, not zeroed.

Run: `python -m secfin.analytical.sector_governance_stats`
"""

from __future__ import annotations

import argparse
import logging

from secfin.config import settings
from secfin.normalize.auditor_continuity import build_auditor_continuity
from secfin.sec.cover import COVER_SCHEMA_VERSION
from secfin.storage.sector_governance_stat_repository import SectorGovernanceStatRow
from secfin.storage.sqlite_sector_governance_stat_repository import (
    SQLiteSectorGovernanceStatRepository,
)

logger = logging.getLogger(__name__)

# The precise list (matches routes.py's `_LATE_FILING_FORMS`), not disclosure_stats.py's looser
# `form LIKE 'NT %'` -- this module has no reason to keep that looser match.
_LATE_FILING_FORMS = ("NT 10-K", "NT 10-K/A", "NT 10-Q", "NT 10-Q/A", "NT 20-F")

_STATS_SQL = """
WITH scoped AS (
    SELECT f.cik, f.form, f.filing_date, f.items,
           substr(cp.sic, 1, ?) AS peer_group, cp.name AS company_name
    FROM sq.filing_index f
    JOIN sq.company_profiles cp ON cp.cik = f.cik
    WHERE cp.sic IS NOT NULL AND length(cp.sic) >= ?
),
cover_ranked AS (
    SELECT cik, cyber_processes_integrated, cyber_reports_to_board, cyber_positions_responsible,
           auditor_name,
           ROW_NUMBER() OVER (PARTITION BY cik ORDER BY filed DESC, accession DESC) AS rn
    FROM sq.filing_cover_facts
    WHERE schema_version >= ?
),
cover_latest AS (
    SELECT cik, cyber_processes_integrated, cyber_reports_to_board, cyber_positions_responsible,
           auditor_name
    FROM cover_ranked
    WHERE rn = 1
)
SELECT s.cik,
       ANY_VALUE(s.peer_group) AS peer_group,
       ANY_VALUE(s.company_name) AS company_name,
       ANY_VALUE(cl.cyber_processes_integrated) AS cyber_processes_integrated,
       ANY_VALUE(cl.cyber_reports_to_board) AS cyber_reports_to_board,
       ANY_VALUE(cl.cyber_positions_responsible) AS cyber_positions_responsible,
       ANY_VALUE(cl.auditor_name) AS auditor_name,
       SUM(CASE WHEN s.items LIKE '%1.05%' THEN 1 ELSE 0 END) AS incident_count,
       MAX(CASE WHEN s.items LIKE '%4.01%' THEN s.filing_date END) AS last_401,
       SUM(CASE WHEN s.form IN ({late_forms}) THEN 1 ELSE 0 END) AS late_notices,
       SUM(CASE WHEN s.items LIKE '%4.02%' THEN 1 ELSE 0 END) AS non_reliance,
       COUNT(*) AS indexed_filings,
       MIN(s.filing_date) AS indexed_from,
       MAX(s.filing_date) AS indexed_to
FROM scoped s
LEFT JOIN cover_latest cl ON cl.cik = s.cik
GROUP BY s.cik
""".format(late_forms=",".join(f"'{f}'" for f in _LATE_FILING_FORMS))


def compute_sector_governance_stats(db_path: str, sic_digits: int) -> list[SectorGovernanceStatRow]:
    """Run the DuckDB pass, then the auditor-continuity post-pass, and return per-company rows.

    Pure -- no writes. `build_auditor_continuity` only ever reads the most-recently-filed Item
    4.01 event (confirmed by reading normalize/auditor_continuity.py), so passing the single
    SQL-extracted MAX date as a one-element event list is faithful to its actual behaviour.
    """
    import duckdb  # analytical extra; imported lazily so the base install/API never needs it

    con = duckdb.connect()
    try:
        con.execute(f"ATTACH '{db_path}' AS sq (TYPE sqlite)")
        raw = con.execute(_STATS_SQL, [sic_digits, sic_digits, COVER_SCHEMA_VERSION]).fetchall()
    finally:
        con.close()

    rows: list[SectorGovernanceStatRow] = []
    for r in raw:
        (
            cik, peer_group, company_name,
            cyber_processes_integrated, cyber_reports_to_board, cyber_positions_responsible,
            auditor_name, incident_count, last_401, late_notices, non_reliance,
            indexed_filings, indexed_from, indexed_to,
        ) = r

        events = [{"item": "4.01", "filed": last_401}] if last_401 else []
        continuity = build_auditor_continuity(
            auditor_name,
            events,
            covered_from=indexed_from,
            covered_to=indexed_to,
            indexed_filings=int(indexed_filings),
        )

        rows.append(
            SectorGovernanceStatRow(
                cik=int(cik),
                peer_group=peer_group,
                company_name=company_name,
                cyber_processes_integrated=(
                    None if cyber_processes_integrated is None else bool(cyber_processes_integrated)
                ),
                cyber_reports_to_board=(
                    None if cyber_reports_to_board is None else bool(cyber_reports_to_board)
                ),
                cyber_positions_responsible=(
                    None if cyber_positions_responsible is None else bool(cyber_positions_responsible)
                ),
                cyber_incident_8k_count=int(incident_count or 0),
                auditor_name=auditor_name,
                tenure_since=continuity.since,
                tenure_since_is_change=continuity.since_is_a_change,
                tenure_years=continuity.years,
                tenure_status=continuity.status,
                tenure_reason=continuity.reason,
                late_notice_count=int(late_notices or 0),
                non_reliance_count=int(non_reliance or 0),
                indexed_filings=int(indexed_filings),
                indexed_from=indexed_from,
                indexed_to=indexed_to,
            )
        )
    return rows


def run_sector_governance_stats(db_path: str, sic_digits: int) -> int:
    rows = compute_sector_governance_stats(db_path, sic_digits)
    repo = SQLiteSectorGovernanceStatRepository(db_path)
    try:
        repo.bulk_upsert(rows)
    finally:
        repo.close()
    logger.info("sector governance stats done: %d company rows (SIC %d-digit)", len(rows), sic_digits)
    return len(rows)


def build_arg_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(
        description=(
            "Per-company cyber/auditor/deficient-filing stats from filing_cover_facts + the "
            "filing index, for the sector Qualitative page's Wave 0 real fields. Analytical "
            "batch -- never the live path."
        )
    )
    p.add_argument("--db-path", default=settings.secfin_db_path)
    return p


def main(argv: list[str] | None = None) -> None:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    args = build_arg_parser().parse_args(argv)
    run_sector_governance_stats(args.db_path, settings.secfin_peer_sic_digits)


if __name__ == "__main__":
    main()

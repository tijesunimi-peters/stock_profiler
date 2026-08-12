"""Per-COMPANY filing-behaviour statistics (Peer-relative "Beyond the financials").

How a company files, not what it filed: the lag from period end to EDGAR acceptance, the share
of its output that is amendments, and how often it has filed a 12b-25 late notice or an 8-K
Item 4.02 non-reliance. Everything comes from the filing INDEX -- form, dates, acceptance stamp
and item codes -- and nothing from a document, so this stays inside Track 1 (existence and dates,
never contents).

Analytical, batch, offline -- NEVER the live request path (CLAUDE.md guardrail 6/7). Placing one
filer among peers means computing these for every company in its group: Apple's SIC-2 group is
231 companies holding ~447 indexed filings each, so the live version is a ~100k-row scan per
request. DuckDB over the SQLite file does it once; the endpoint point-reads the result.

Honesty / method:
  * **The window is EDGAR's rolling recent list, and it differs enormously.** Apple's index
    reaches 2015; JPMorgan's covers about a year at 25,529 filings. Every row therefore carries
    `indexed_from`/`indexed_to`, and the endpoint reports them, because an amendment count over
    a decade and one over a year are not the same number.
  * **Lag is measured on PERIODIC reports only** (10-K/10-Q and their amendments). Their
    deadlines are what a lag means; an 8-K is due four business days after an event and a 424B2
    has no period at all, so including them would measure filing mix rather than timeliness.
  * **Median, not mean.** One late filing after a restatement drags a mean for years.
  * **An amendment is a RATE, never a verdict** -- the index cannot tell a correction from a
    routine refiling.
  * A company with no computable value gets NULL for that field, not 0. Zero amendments is a
    real finding; "we could not measure" is not.

Run: `python -m secfin.analytical.disclosure_stats`
"""

from __future__ import annotations

import argparse
import logging

from secfin.config import settings
from secfin.storage.disclosure_stat_repository import DisclosureStatRow
from secfin.storage.sqlite_disclosure_stat_repository import SQLiteDisclosureStatRepository

logger = logging.getLogger(__name__)

# Periodic reports only -- see the module docstring on why lag is not measured over every form.
_PERIODIC = ("10-K", "10-Q", "10-K/A", "10-Q/A")

_STATS_SQL = """
WITH scoped AS (
    SELECT f.cik, f.form, f.filing_date, f.acceptance_datetime, f.report_date, f.items,
           substr(cp.sic, 1, ?) AS peer_group
    FROM sq.filing_index f
    JOIN sq.company_profiles cp ON cp.cik = f.cik
    WHERE cp.sic IS NOT NULL AND length(cp.sic) >= ?
),
lags AS (
    SELECT cik,
           date_diff('day', CAST(report_date AS DATE),
                     CAST(substr(acceptance_datetime, 1, 10) AS DATE)) AS lag_days
    FROM scoped
    WHERE form IN ('10-K', '10-Q', '10-K/A', '10-Q/A')
      AND report_date IS NOT NULL AND report_date <> ''
      AND acceptance_datetime IS NOT NULL AND acceptance_datetime <> ''
)
SELECT s.cik,
       ANY_VALUE(s.peer_group) AS peer_group,
       (SELECT median(lag_days) FROM lags l WHERE l.cik = s.cik AND l.lag_days >= 0)
           AS median_lag,
       CAST(SUM(CASE WHEN s.form LIKE '%/A' THEN 1 ELSE 0 END) AS DOUBLE) / COUNT(*)
           AS amended_share,
       SUM(CASE WHEN s.form LIKE 'NT %' THEN 1 ELSE 0 END) AS late_notices,
       SUM(CASE WHEN s.items LIKE '%4.02%' THEN 1 ELSE 0 END) AS non_reliance,
       COUNT(*) AS indexed_filings,
       MIN(s.filing_date) AS indexed_from,
       MAX(s.filing_date) AS indexed_to
FROM scoped s
GROUP BY s.cik
"""


def compute_disclosure_stats(db_path: str, sic_digits: int) -> list[DisclosureStatRow]:
    """Run the DuckDB aggregation over the SQLite file and return per-company rows (no writes)."""
    import duckdb  # analytical extra; imported lazily so the base install/API never needs it

    con = duckdb.connect()
    try:
        con.execute(f"ATTACH '{db_path}' AS sq (TYPE sqlite)")
        rows = con.execute(_STATS_SQL, [sic_digits, sic_digits]).fetchall()
    finally:
        con.close()

    return [
        DisclosureStatRow(
            cik=int(r[0]),
            peer_group=r[1],
            median_filing_lag_days=None if r[2] is None else float(r[2]),
            amended_share=None if r[3] is None else float(r[3]),
            late_notice_count=int(r[4] or 0),
            non_reliance_count=int(r[5] or 0),
            indexed_filings=int(r[6]),
            indexed_from=r[7],
            indexed_to=r[8],
        )
        for r in rows
    ]


def run_disclosure_stats(db_path: str, sic_digits: int) -> int:
    rows = compute_disclosure_stats(db_path, sic_digits)
    repo = SQLiteDisclosureStatRepository(db_path)
    try:
        repo.bulk_upsert(rows)
    finally:
        repo.close()
    logger.info("disclosure stats done: %d company rows (SIC %d-digit)", len(rows), sic_digits)
    return len(rows)


def build_arg_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(
        description=(
            "Per-company filing-behaviour stats from the filing index, for the Peer-relative "
            "view's disclosure rows. Analytical batch -- never the live path."
        )
    )
    p.add_argument("--db-path", default=settings.secfin_db_path)
    return p


def main(argv: list[str] | None = None) -> None:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    args = build_arg_parser().parse_args(argv)
    run_disclosure_stats(args.db_path, settings.secfin_peer_sic_digits)


if __name__ == "__main__":
    main()

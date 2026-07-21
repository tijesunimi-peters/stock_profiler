"""Sector-aggregate asset-lifecycle batch job (Sector Analytics, Deliverable 5).

Computes, per (SIC group, period), the aggregate DIO/DSO/DPO/CCC and writes it to
`sector_lifecycle` for the `/v1/sectors/{group}/lifecycle` endpoint to read. The honest aggregation
of days-metrics across companies is a RATIO OF SUMMED DOLLARS, not a median of company ratios:

    dio = Sigma_inventory / Sigma_cost_of_revenue x 365
    dpo = Sigma_accounts_payable / Sigma_cost_of_revenue x 365
    dso = Sigma_accounts_receivable / Sigma_revenue x 365
    ccc = dio + dso - dpo

labelled everywhere "sector aggregate -- not a median". A company enters a (group, period) sum only
if it contributed all five legs (enforced upstream in `ingest/lifecycle_backfill.py` via
`lifecycle_components`), so the sums share one company set and CCC = DIO + DSO - DPO holds by
construction. A group needs at least `settings.secfin_peer_min_size` such companies.

These describe a sector's WORKING-CAPITAL STRUCTURE (how long cash sits in inventory + receivables
vs. how long suppliers finance it). Descriptive -- NOT a timing signal, edge, or alpha claim.

Analytical, batch, offline -- NEVER on the live request path (CLAUDE.md). It reads the materialized
`lifecycle_components` + `company_profiles` tables straight out of the SQLite file via DuckDB's
`ATTACH ... (TYPE sqlite)` (same mechanism as `analytical/sector_dupont.py`), does the cross-company
aggregation in DuckDB, then writes the results back through the ordinary SQLite repository (the
write path stays on the operational store). `duckdb` is the `analytical` extra --
`pip install -e ".[analytical]"`.

Run: `python -m secfin.analytical.sector_lifecycle`
"""

from __future__ import annotations

import argparse
import logging

from secfin.config import settings
from secfin.storage.sector_lifecycle_repository import SectorLifecycleRow
from secfin.storage.sqlite_sector_lifecycle_repository import SQLiteSectorLifecycleRepository

logger = logging.getLogger(__name__)

_NEAR_ZERO = 1e-9  # a summed denominator below this is degenerate -> skip (no bogus ratio)

# Group lifecycle components by SIC prefix + fiscal period and sum each leg. period_end is the
# representative (max) end in the group -- fiscal periods are not calendar-aligned across companies
# (a carried caveat), so this is a sortable anchor, not a precise shared date. approx_count counts
# the contributing companies that used a period-end balance (flagged approximate upstream).
_AGG_SQL = """
WITH base AS (
    SELECT lc.inventory, lc.accounts_payable, lc.accounts_receivable,
           lc.cost_of_revenue, lc.revenue, lc.approximate,
           lc.fiscal_year, lc.fiscal_period, lc.period_end,
           substr(cp.sic, 1, ?) AS peer_group
    FROM sq.lifecycle_components lc
    JOIN sq.company_profiles cp ON cp.cik = lc.cik
    WHERE cp.sic IS NOT NULL AND length(cp.sic) >= ?
)
SELECT peer_group, fiscal_year, fiscal_period,
       max(period_end) AS period_end,
       count(*) AS peer_count,
       sum(CASE WHEN approximate THEN 1 ELSE 0 END) AS approx_count,
       sum(inventory) AS s_inv,
       sum(accounts_payable) AS s_ap,
       sum(accounts_receivable) AS s_ar,
       sum(cost_of_revenue) AS s_cogs,
       sum(revenue) AS s_rev
FROM base
GROUP BY peer_group, fiscal_year, fiscal_period
HAVING count(*) >= ?
"""


def aggregate_row(
    peer_group: str,
    fiscal_year: int,
    fiscal_period: str,
    period_end: str,
    peer_count: int,
    approx_count: int,
    s_inv: float,
    s_ap: float,
    s_ar: float,
    s_cogs: float,
    s_rev: float,
) -> SectorLifecycleRow | None:
    """Turn one group's summed legs into an aggregate row, or None if a summed denominator is
    degenerate (guarded, though sums over >=min_size companies won't realistically be zero)."""
    if abs(s_cogs) < _NEAR_ZERO or abs(s_rev) < _NEAR_ZERO:
        return None
    dio = s_inv / s_cogs * 365.0
    dpo = s_ap / s_cogs * 365.0
    dso = s_ar / s_rev * 365.0
    return SectorLifecycleRow(
        peer_group=peer_group,
        fiscal_year=fiscal_year,
        fiscal_period=fiscal_period,
        period_end=period_end,
        peer_count=peer_count,
        approx_count=approx_count,
        sum_inventory=s_inv,
        sum_accounts_payable=s_ap,
        sum_accounts_receivable=s_ar,
        sum_cost_of_revenue=s_cogs,
        sum_revenue=s_rev,
        dio=dio,
        dpo=dpo,
        dso=dso,
        ccc=dio + dso - dpo,
    )


def compute_sector_lifecycle(
    db_path: str, sic_digits: int, min_size: int
) -> list[SectorLifecycleRow]:
    """Run the DuckDB aggregation over the SQLite file and return the sector rows (no writes)."""
    import duckdb  # analytical extra; imported lazily so the base install/API never needs it

    con = duckdb.connect()
    try:
        con.execute(f"ATTACH '{db_path}' AS sq (TYPE sqlite)")
        raw = con.execute(_AGG_SQL, [sic_digits, sic_digits, min_size]).fetchall()
    finally:
        con.close()
    rows: list[SectorLifecycleRow] = []
    for r in raw:
        row = aggregate_row(
            peer_group=r[0],
            fiscal_year=r[1],
            fiscal_period=r[2],
            period_end=r[3],
            peer_count=r[4],
            approx_count=r[5],
            s_inv=r[6],
            s_ap=r[7],
            s_ar=r[8],
            s_cogs=r[9],
            s_rev=r[10],
        )
        if row is not None:
            rows.append(row)
    return rows


def run_sector_lifecycle(db_path: str, sic_digits: int, min_size: int) -> int:
    """Compute the aggregates (DuckDB) then replace `sector_lifecycle` wholesale (SQLite). Returns
    the row count."""
    rows = compute_sector_lifecycle(db_path, sic_digits, min_size)
    repo = SQLiteSectorLifecycleRepository(db_path)
    try:
        repo.clear()  # full recompute -- drop stale aggregates first
        repo.bulk_upsert(rows)
    finally:
        repo.close()
    logger.info(
        "sector lifecycle done: %d rows (SIC %d-digit, min group size %d)",
        len(rows),
        sic_digits,
        min_size,
    )
    return len(rows)


def build_arg_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(
        description="Compute per-SIC-group aggregate DIO/DSO/DPO/CCC (DuckDB batch job)."
    )
    p.add_argument("--sic-digits", type=int, default=None, help="Override SIC grouping granularity")
    p.add_argument("--min-size", type=int, default=None, help="Override minimum group size")
    return p


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    args = build_arg_parser().parse_args()
    run_sector_lifecycle(
        settings.secfin_db_path,
        sic_digits=args.sic_digits or settings.secfin_peer_sic_digits,
        min_size=args.min_size or settings.secfin_peer_min_size,
    )


if __name__ == "__main__":
    main()

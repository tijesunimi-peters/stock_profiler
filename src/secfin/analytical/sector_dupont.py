"""Sector-aggregate DuPont batch job (Sector Analytics, Deliverable 1).

Computes, per (SIC group, period), the **asset-weighted** DuPont decomposition and writes it to
`sector_dupont` for the `/v1/sectors` endpoints to read. The one honest aggregation of a DuPont
tree across companies (a median of ROE is NOT median(margin) x median(turnover) x median(leverage)
-- the identity only holds per company). We instead sum the dollar components and take ratios of
the sums:

    net_margin        = SigmaNI / SigmaRev
    asset_turnover    = SigmaRev / SigmaAssets
    equity_multiplier = SigmaAssets / SigmaEquity
    roe (aggregate)   = SigmaNI / SigmaEquity   ( == the product of the three, by construction )

labelled everywhere "sector aggregate -- not a median". A company enters a (group, period) sum only
if it contributed every leg (enforced upstream in `ingest/dupont_backfill.py` via
`dupont_components`), so the three sums share one company set and the identity cannot be broken by
mismatched membership. A group needs at least `settings.secfin_peer_min_size` such companies.

Analytical, batch, offline -- NEVER on the live request path (CLAUDE.md). It reads the materialized
`dupont_components` + `company_profiles` tables straight out of the SQLite file via DuckDB's
`ATTACH ... (TYPE sqlite)` (same mechanism as `analytical/peer_ranks.py`), does the cross-company
aggregation in DuckDB, then writes the results back through the ordinary SQLite repository (the
write path stays on the operational store). `duckdb` is the `analytical` extra --
`pip install -e ".[analytical]"`.

Run: `python -m secfin.analytical.sector_dupont`
"""

from __future__ import annotations

import argparse
import logging

from secfin.config import settings
from secfin.storage.sector_dupont_repository import SectorDupontRow
from secfin.storage.sqlite_sector_dupont_repository import SQLiteSectorDupontRepository

logger = logging.getLogger(__name__)

_NEAR_ZERO = 1e-9  # a summed denominator below this is degenerate -> skip (no bogus ratio)

# Group DuPont components by SIC prefix + fiscal period and sum each leg. period_end is the
# representative (max) end in the group -- fiscal periods are not calendar-aligned across
# companies (a carried caveat), so this is a sortable anchor, not a precise shared date.
_AGG_SQL = """
WITH base AS (
    SELECT dc.net_income, dc.revenue, dc.avg_assets, dc.avg_equity,
           dc.fiscal_year, dc.fiscal_period, dc.period_end,
           substr(cp.sic, 1, ?) AS peer_group
    FROM sq.dupont_components dc
    JOIN sq.company_profiles cp ON cp.cik = dc.cik
    WHERE cp.sic IS NOT NULL AND length(cp.sic) >= ?
)
SELECT peer_group, fiscal_year, fiscal_period,
       max(period_end) AS period_end,
       count(*) AS peer_count,
       sum(net_income) AS s_ni,
       sum(revenue) AS s_rev,
       sum(avg_assets) AS s_assets,
       sum(avg_equity) AS s_eq
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
    s_ni: float,
    s_rev: float,
    s_assets: float,
    s_eq: float,
) -> SectorDupontRow | None:
    """Turn one group's summed legs into an identity-preserving aggregate row, or None if a
    summed denominator is degenerate (guarded, though sums over >=min_size companies won't
    realistically be zero)."""
    if abs(s_rev) < _NEAR_ZERO or abs(s_assets) < _NEAR_ZERO or abs(s_eq) < _NEAR_ZERO:
        return None
    return SectorDupontRow(
        peer_group=peer_group,
        fiscal_year=fiscal_year,
        fiscal_period=fiscal_period,
        period_end=period_end,
        peer_count=peer_count,
        sum_net_income=s_ni,
        sum_revenue=s_rev,
        sum_avg_assets=s_assets,
        sum_avg_equity=s_eq,
        net_margin=s_ni / s_rev,
        asset_turnover=s_rev / s_assets,
        equity_multiplier=s_assets / s_eq,
        roe=s_ni / s_eq,
    )


def compute_sector_dupont(db_path: str, sic_digits: int, min_size: int) -> list[SectorDupontRow]:
    """Run the DuckDB aggregation over the SQLite file and return the sector rows (no writes)."""
    import duckdb  # analytical extra; imported lazily so the base install/API never needs it

    con = duckdb.connect()
    try:
        con.execute(f"ATTACH '{db_path}' AS sq (TYPE sqlite)")
        raw = con.execute(_AGG_SQL, [sic_digits, sic_digits, min_size]).fetchall()
    finally:
        con.close()
    rows: list[SectorDupontRow] = []
    for r in raw:
        row = aggregate_row(
            peer_group=r[0],
            fiscal_year=r[1],
            fiscal_period=r[2],
            period_end=r[3],
            peer_count=r[4],
            s_ni=r[5],
            s_rev=r[6],
            s_assets=r[7],
            s_eq=r[8],
        )
        if row is not None:
            rows.append(row)
    return rows


def run_sector_dupont(db_path: str, sic_digits: int, min_size: int) -> int:
    """Compute the aggregates (DuckDB) then replace `sector_dupont` wholesale (SQLite). Returns
    the row count."""
    rows = compute_sector_dupont(db_path, sic_digits, min_size)
    repo = SQLiteSectorDupontRepository(db_path)
    try:
        repo.clear()  # full recompute -- drop stale aggregates first
        repo.bulk_upsert(rows)
    finally:
        repo.close()
    logger.info(
        "sector dupont done: %d rows (SIC %d-digit, min group size %d)",
        len(rows),
        sic_digits,
        min_size,
    )
    return len(rows)


def build_arg_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(
        description="Compute per-SIC-group asset-weighted DuPont aggregates (DuckDB batch job)."
    )
    p.add_argument("--sic-digits", type=int, default=None, help="Override SIC grouping granularity")
    p.add_argument("--min-size", type=int, default=None, help="Override minimum group size")
    return p


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    args = build_arg_parser().parse_args()
    run_sector_dupont(
        settings.secfin_db_path,
        sic_digits=args.sic_digits or settings.secfin_peer_sic_digits,
        min_size=args.min_size or settings.secfin_peer_min_size,
    )


if __name__ == "__main__":
    main()

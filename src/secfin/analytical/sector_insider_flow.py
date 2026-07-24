"""Sector INSIDER-FLOW batch (Sector Analytics v2, P6a).

Computes, per SIC group, the trailing-window **open-market** insider net buy/sell by summing
individual companies' REPORTED Forms 3/4/5 transactions, and writes it to `sector_insider_flow` for
`GET /v1/sectors/{group}/insider-flow` to read.

Analytical, batch, offline -- NEVER on the live request path (CLAUDE.md guardrail 6). Like
`analytical/peer_ranks.py`, it reads the materialized `insider_transactions` + `company_profiles`
tables straight out of the SQLite file via DuckDB's `ATTACH ... (TYPE sqlite)`, does the
cross-company aggregation in DuckDB, then writes the results back through the ordinary SQLite
repository (the write path stays on the operational store). `duckdb` is the `analytical` extra --
`pip install -e ".[analytical]"`.

Honesty / method:
  * **Open-market only:** count ONLY `transaction_code IN ('P','S')` -- open-market purchases (P)
    and sales (S). Grants (A), option exercises (M), gifts (G), and tax-withholding (F) are
    EXCLUDED. This is the defensible "insider conviction" signal, not "all acquired vs disposed".
  * **Value = shares x price_per_share** in reported USD (raw units; never rescaled). A P/S row with
    a missing share count or price is EXCLUDED from the sums and surfaced as
    `excluded_no_price_count` -- never silently treated as $0.
  * **Trailing window** anchored on `transaction_date` in `[as_of - window_days, as_of]`.
  * A group with no in-window open-market value rows produces NO row (the endpoint renders that as
    an honest N/A, never a zero net-flow).
  * This is a DERIVED aggregate of REPORTED transactions -- NOT a 13F snapshot diff. The endpoint
    carries the reporting-lag + coverage caveats, never the 13F long-only/45-day caveat.

Run: `python -m secfin.analytical.sector_insider_flow [--window-days 90] [--as-of YYYY-MM-DD]`
"""

from __future__ import annotations

import argparse
import logging
from datetime import date, timedelta

from secfin.config import settings
from secfin.storage.sector_insider_flow_repository import SectorInsiderFlowRow
from secfin.storage.sqlite_sector_insider_flow_repository import (
    SQLiteSectorInsiderFlowRepository,
)

logger = logging.getLogger(__name__)

# One pass over the cached insider transactions joined to SIC profiles. Only open-market P/S rows in
# the trailing window count; value is shares*price (NULL when either is missing -> excluded from the
# sums but counted). A group with zero computable P/S value rows is dropped by the HAVING (it
# becomes an honest N/A at the endpoint, not a zero).
_FLOW_SQL = """
WITH base AS (
    SELECT t.issuer_cik, t.owner_name, t.transaction_code,
           substr(cp.sic, 1, ?) AS peer_group,
           CASE WHEN t.shares IS NOT NULL AND t.price_per_share IS NOT NULL
                THEN t.shares * t.price_per_share END AS value
    FROM sq.insider_transactions t
    JOIN sq.company_profiles cp ON cp.cik = t.issuer_cik
    WHERE t.is_holding = 0
      AND t.transaction_code IN ('P', 'S')
      AND cp.sic IS NOT NULL
      AND length(cp.sic) >= ?
      AND t.transaction_date IS NOT NULL
      AND t.transaction_date >= ?
      AND t.transaction_date <= ?
)
SELECT peer_group,
       COALESCE(SUM(CASE WHEN transaction_code = 'P' THEN value END), 0) AS buys,
       COALESCE(SUM(CASE WHEN transaction_code = 'S' THEN value END), 0) AS sells,
       SUM(CASE WHEN transaction_code = 'P' AND value IS NOT NULL THEN 1 ELSE 0 END) AS buy_count,
       SUM(CASE WHEN transaction_code = 'S' AND value IS NOT NULL THEN 1 ELSE 0 END) AS sell_count,
       COUNT(DISTINCT CASE WHEN value IS NOT NULL THEN owner_name END) AS filer_count,
       COUNT(DISTINCT CASE WHEN value IS NOT NULL THEN issuer_cik END) AS company_count,
       SUM(CASE WHEN value IS NULL THEN 1 ELSE 0 END) AS excluded_no_price_count
FROM base
GROUP BY peer_group
HAVING buy_count + sell_count > 0
"""


def compute_sector_insider_flow(
    db_path: str, sic_digits: int, window_days: int, as_of: str
) -> list[SectorInsiderFlowRow]:
    """Run the DuckDB aggregation over the SQLite file and return the flow rows (no writes)."""
    import duckdb  # analytical extra; imported lazily so the base install/API never needs it

    window_start = (date.fromisoformat(as_of) - timedelta(days=window_days)).isoformat()
    con = duckdb.connect()
    try:
        con.execute(f"ATTACH '{db_path}' AS sq (TYPE sqlite)")
        rows = con.execute(
            _FLOW_SQL, [sic_digits, sic_digits, window_start, as_of]
        ).fetchall()
    finally:
        con.close()
    out: list[SectorInsiderFlowRow] = []
    for r in rows:
        buys, sells = float(r[1]), float(r[2])
        out.append(
            SectorInsiderFlowRow(
                peer_group=r[0],
                as_of=as_of,
                window_days=window_days,
                window_start=window_start,
                window_end=as_of,
                net=buys - sells,
                buys=buys,
                sells=sells,
                buy_count=int(r[3]),
                sell_count=int(r[4]),
                filer_count=int(r[5]),
                company_count=int(r[6]),
                excluded_no_price_count=int(r[7]),
                unit="USD",
            )
        )
    return out


def run_sector_insider_flow(
    db_path: str, sic_digits: int, window_days: int, as_of: str
) -> int:
    """Compute flow (DuckDB) then replace `sector_insider_flow` wholesale (SQLite). Returns the
    row count."""
    rows = compute_sector_insider_flow(db_path, sic_digits, window_days, as_of)
    repo = SQLiteSectorInsiderFlowRepository(db_path)
    try:
        repo.clear()  # full recompute -- drop stale rows (a group that left the window)
        repo.bulk_upsert(rows)
    finally:
        repo.close()
    logger.info(
        "sector insider flow done: %d group rows (SIC %d-digit, %d-day window ending %s)",
        len(rows),
        sic_digits,
        window_days,
        as_of,
    )
    return len(rows)


def build_arg_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(
        description="Aggregate per-SIC-group open-market insider net buy/sell over a trailing "
        "window (DuckDB batch job)."
    )
    p.add_argument("--sic-digits", type=int, default=None, help="Override SIC grouping granularity")
    p.add_argument(
        "--window-days", type=int, default=None, help="Trailing window length in days"
    )
    p.add_argument(
        "--as-of",
        type=str,
        default=None,
        help="Window end date YYYY-MM-DD (default: today)",
    )
    return p


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    args = build_arg_parser().parse_args()
    run_sector_insider_flow(
        settings.secfin_db_path,
        sic_digits=args.sic_digits or settings.secfin_peer_sic_digits,
        window_days=args.window_days or settings.secfin_insider_flow_window_days,
        as_of=args.as_of or date.today().isoformat(),
    )


if __name__ == "__main__":
    main()

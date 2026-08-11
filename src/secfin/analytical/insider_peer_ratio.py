"""Per-COMPANY open-market insider ratio, for the Insider view's peer strip.

Sibling of `analytical/sector_insider_flow.py` and deliberately not a variant of it: that one
produces ONE aggregate per SIC group ("is this sector buying?"), while a strip needs every
company's own value so each peer is a dot. A group total cannot be decomposed back into its
members, so this is a different row grain, not a different formatting of the same query.

Analytical, batch, offline -- NEVER on the live request path (CLAUDE.md guardrail 6). Reads the
materialized `insider_transactions` + `company_profiles` tables out of the SQLite file via
DuckDB's `ATTACH ... (TYPE sqlite)`, aggregates in DuckDB, writes back through the ordinary
SQLite repository. `duckdb` is the `analytical` extra -- `pip install -e ".[analytical]"`.

Honesty / method:
  * **Open-market only:** `transaction_code IN ('P','S')`. Grants (A), exercises (M), gifts (G)
    and tax withholding (F) are EXCLUDED, on the same reasoning `sector_insider_flow` records:
    only P and S are decisions. A ratio over all codes would mostly measure how a company pays
    its officers, and would be well-populated precisely because it is uninformative.
  * **SHARES, not dollars.** `sector_insider_flow` values rows at shares x price because a
    sector's net flow is a money figure; here the quantity is a per-company RATIO, so the price
    cancels out of the thing being measured while its absence would silently drop rows -- many
    P/S rows carry no price. Counting shares keeps those companies on the strip.
  * **Bounded ratio:** `(bought - sold) / (bought + sold)`, in [-1, +1]. NOT `bought / sold` --
    that is unbounded and undefined for a company whose insiders only sold, which is the single
    most common case in the corpus (in SIC 367, 96 of 122 companies have sell rows and 8 have
    buys). Dropping them would empty the strip of exactly the companies it should show.
  * **Derivative rows excluded** for the same reason the view excludes them: an exercise files
    two rows and counting both doubles one event.
  * A company with no in-window open-market row produces NO row -- the endpoint renders that as
    an absence it checked, never as a 0.0 ratio, which would read as "balanced buying and
    selling" when the truth is "no open-market activity at all".

Run: `python -m secfin.analytical.insider_peer_ratio [--window-days 365] [--as-of YYYY-MM-DD]`
"""

from __future__ import annotations

import argparse
import logging
from datetime import date, timedelta

from secfin.config import settings
from secfin.storage.insider_peer_ratio_repository import InsiderPeerRatioRow
from secfin.storage.sqlite_insider_peer_ratio_repository import (
    SQLiteInsiderPeerRatioRepository,
)

logger = logging.getLogger(__name__)

# One pass over cached insider transactions joined to SIC profiles, grouped by COMPANY (not by
# sector). Only open-market P/S rows in the trailing window count, and only rows carrying a share
# count -- a P/S row with no shares cannot contribute to a share ratio and is excluded rather than
# read as zero. A company with no computable row is dropped by the HAVING and becomes an honest
# absence at the endpoint.
_RATIO_SQL = """
WITH base AS (
    SELECT t.issuer_cik, t.owner_name, t.transaction_code, t.shares,
           substr(cp.sic, 1, ?) AS peer_group
    FROM sq.insider_transactions t
    JOIN sq.company_profiles cp ON cp.cik = t.issuer_cik
    WHERE t.is_holding = 0
      AND t.is_derivative = 0
      AND t.transaction_code IN ('P', 'S')
      AND t.shares IS NOT NULL
      AND cp.sic IS NOT NULL
      AND length(cp.sic) >= ?
      AND t.transaction_date IS NOT NULL
      AND t.transaction_date >= ?
      AND t.transaction_date <= ?
)
SELECT issuer_cik,
       peer_group,
       COALESCE(SUM(CASE WHEN transaction_code = 'P' THEN shares END), 0) AS bought,
       COALESCE(SUM(CASE WHEN transaction_code = 'S' THEN shares END), 0) AS sold,
       SUM(CASE WHEN transaction_code = 'P' THEN 1 ELSE 0 END) AS buy_count,
       SUM(CASE WHEN transaction_code = 'S' THEN 1 ELSE 0 END) AS sell_count,
       COUNT(DISTINCT owner_name) AS filer_count
FROM base
GROUP BY issuer_cik, peer_group
HAVING bought + sold > 0
"""


def compute_insider_peer_ratios(
    db_path: str, sic_digits: int, window_days: int, as_of: str
) -> list[InsiderPeerRatioRow]:
    """Run the DuckDB aggregation over the SQLite file and return per-company rows (no writes)."""
    import duckdb  # analytical extra; imported lazily so the base install/API never needs it

    window_start = (date.fromisoformat(as_of) - timedelta(days=window_days)).isoformat()
    con = duckdb.connect()
    try:
        con.execute(f"ATTACH '{db_path}' AS sq (TYPE sqlite)")
        rows = con.execute(_RATIO_SQL, [sic_digits, sic_digits, window_start, as_of]).fetchall()
    finally:
        con.close()

    out: list[InsiderPeerRatioRow] = []
    for r in rows:
        bought, sold = float(r[2]), float(r[3])
        total = bought + sold
        out.append(
            InsiderPeerRatioRow(
                cik=int(r[0]),
                peer_group=r[1],
                as_of=as_of,
                window_days=window_days,
                window_start=window_start,
                window_end=as_of,
                bought=bought,
                sold=sold,
                # `total` cannot be 0 here -- the HAVING guarantees it -- but the guard stays so a
                # future change to that clause cannot turn into a silent ZeroDivisionError.
                net_ratio=((bought - sold) / total) if total else 0.0,
                buy_count=int(r[4]),
                sell_count=int(r[5]),
                filer_count=int(r[6]),
            )
        )
    return out


def run_insider_peer_ratio(
    db_path: str, sic_digits: int, window_days: int, as_of: str, keep_snapshots: int = 8
) -> int:
    """Compute ratios (DuckDB) then upsert them (SQLite). Returns the row count.

    Unlike `sector_insider_flow`, this does NOT clear the table first: rows are keyed by
    (cik, as_of, window_days), so successive runs accumulate dated snapshots rather than
    overwriting one another, and the endpoint anchors on `latest_as_of`.
    """
    rows = compute_insider_peer_ratios(db_path, sic_digits, window_days, as_of)
    repo = SQLiteInsiderPeerRatioRepository(db_path)
    try:
        repo.bulk_upsert(rows)
        pruned = repo.prune_snapshots(window_days, keep_snapshots)
    finally:
        repo.close()
    if pruned:
        logger.info("insider peer ratios: pruned %d rows from old snapshots", pruned)
    logger.info(
        "insider peer ratios done: %d company rows (SIC %d-digit, %d-day window ending %s)",
        len(rows),
        sic_digits,
        window_days,
        as_of,
    )
    return len(rows)


def build_arg_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(
        description=(
            "Per-company open-market (P/S) insider net-acquisition ratio over a trailing "
            "window, for the Insider view's peer strip. Analytical batch -- never the live path."
        )
    )
    p.add_argument(
        "--window-days",
        type=int,
        default=365,
        help=(
            "Trailing window in days (default: 365). Longer than the sector flow's 90 because a "
            "ratio needs enough open-market rows per COMPANY to mean anything, and most "
            "companies file only a handful a year."
        ),
    )
    p.add_argument(
        "--as-of",
        default=None,
        metavar="YYYY-MM-DD",
        help="Window end (default: today).",
    )
    p.add_argument(
        "--keep-snapshots",
        type=int,
        default=8,
        help=(
            "Dated snapshots to retain for this window (default: 8). Only the newest is ever "
            "served; the rest exist so an operator can see whether a run collapsed."
        ),
    )
    p.add_argument("--db-path", default=settings.secfin_db_path)
    return p


def main(argv: list[str] | None = None) -> None:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    args = build_arg_parser().parse_args(argv)
    run_insider_peer_ratio(
        args.db_path,
        settings.secfin_peer_sic_digits,
        args.window_days,
        args.as_of or date.today().isoformat(),
        keep_snapshots=args.keep_snapshots,
    )


if __name__ == "__main__":
    main()

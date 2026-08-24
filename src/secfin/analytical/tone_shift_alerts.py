"""Per-SIC-group tone-shift leaderboard from YoY section similarity (Track 2 Wave A, Stage 6).

"Biggest risk-factor rewrites this quarter" -- Risk Factors and Legal Proceedings only (the two
`normalize/section_similarity.py` scores; `docs/ROADMAP_TRACK2.md`'s Stage 4 reasoning: a big jump
there is the actionable signal). A materialized JOIN of `section_similarity` +
`filing_index` + `company_profiles`, one row per (cik, accession, item_code) -- NOT a
pre-aggregated top-N. The route sorts ascending by `cosine_similarity` live over `get_group()`'s
rows, mirroring `sector_governance_stats.py` (Wave 0)'s own live-aggregation-over-precomputed-rows
shape, not `sector_geographic_mix.py`'s pre-aggregated pattern (wrong fit -- this is a ranking,
not a dollar reconciliation).

Analytical, batch, offline -- NEVER the live request path (CLAUDE.md guardrail 6/7).

**Honesty carried from Stage 4**: a low `cosine_similarity` is a raw signal, not a confirmed
"meaningful rewrite" -- `normalize/section_similarity.py`'s docstring explains why no threshold
is applied anywhere in this pipeline yet. The serving route's caveats repeat this.

Run: `python -m secfin.analytical.tone_shift_alerts`
"""

from __future__ import annotations

import argparse
import logging

from secfin.config import settings
from secfin.storage.sqlite_tone_shift_alert_repository import SQLiteToneShiftAlertRepository
from secfin.storage.tone_shift_alert_repository import ToneShiftAlertRow

logger = logging.getLogger(__name__)

_ITEM_CODES = ("RF", "LEGAL")

_ALERTS_SQL = """
SELECT ss.cik,
       substr(cp.sic, 1, ?) AS peer_group,
       cp.name AS company_name,
       ss.item_code,
       ss.accession,
       ss.prior_accession,
       fi.filing_date,
       ss.cosine_similarity,
       ss.jaccard_similarity
FROM sq.section_similarity ss
JOIN sq.company_profiles cp ON cp.cik = ss.cik
JOIN sq.filing_index fi ON fi.cik = ss.cik AND fi.accession = ss.accession
WHERE cp.sic IS NOT NULL AND length(cp.sic) >= ?
  AND ss.item_code IN ({item_codes})
""".format(item_codes=",".join(f"'{c}'" for c in _ITEM_CODES))


def compute_tone_shift_alerts(db_path: str, sic_digits: int) -> list[ToneShiftAlertRow]:
    """Run the DuckDB join over the SQLite file and return per-(company, filing, item) rows."""
    import duckdb  # analytical extra; imported lazily so the base install/API never needs it

    con = duckdb.connect()
    try:
        con.execute(f"ATTACH '{db_path}' AS sq (TYPE sqlite)")
        rows = con.execute(_ALERTS_SQL, [sic_digits, sic_digits]).fetchall()
    finally:
        con.close()

    return [
        ToneShiftAlertRow(
            cik=int(r[0]), peer_group=r[1], company_name=r[2], item_code=r[3],
            accession=r[4], prior_accession=r[5], filing_date=r[6],
            cosine_similarity=float(r[7]), jaccard_similarity=float(r[8]),
        )
        for r in rows
    ]


def run_tone_shift_alerts(db_path: str, sic_digits: int) -> int:
    rows = compute_tone_shift_alerts(db_path, sic_digits)
    repo = SQLiteToneShiftAlertRepository(db_path)
    try:
        repo.bulk_upsert(rows)
    finally:
        repo.close()
    logger.info("tone shift alerts done: %d rows (SIC %d-digit)", len(rows), sic_digits)
    return len(rows)


def build_arg_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(
        description=(
            "Per-SIC-group YoY Risk Factors / Legal Proceedings similarity roll-up, for the "
            "sector 'biggest rewrites' leaderboard. Analytical batch -- never the live path."
        )
    )
    p.add_argument("--db-path", default=settings.secfin_db_path)
    return p


def main(argv: list[str] | None = None) -> None:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    args = build_arg_parser().parse_args(argv)
    run_tone_shift_alerts(args.db_path, settings.secfin_peer_sic_digits)


if __name__ == "__main__":
    main()

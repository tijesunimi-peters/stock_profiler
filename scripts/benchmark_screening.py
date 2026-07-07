"""Benchmark: plain indexed SQLite vs. DuckDB-over-SQLite for cross-company screening.

Milestone 4's own "evaluate before building" step (docs/ARCHITECTURE.md 3b), same
methodology as the M2.5 13F cross-manager-inversion benchmark -- but unlike that one,
this script is committed and reusable rather than a one-off, undocumented run (a gap
the M4 roadmap item explicitly flagged and asked to be fixed this time).

Generates synthetic `raw_facts`-shaped data at realistic SEC frames scale (~8,000
companies per concept per frame period -- see sec/frames.py's live-verified `pts`
counts this models: Revenues CY2023 ~2,669 real filers, Assets CY2023Q4I ~6,428) across
several screenable concepts, then times a representative multi-concept AND screening
query (the same shape api/routes.py's `_run_screen` issues: one `screen()`-equivalent
lookup per concept, intersected) against:

  1. Plain SQLite, using the same `idx_raw_facts_frame (gaap_tag, frame)` index
     production uses (storage/sqlite_repository.py).
  2. DuckDB, via `ATTACH '<path>' (TYPE sqlite)` against that same file -- no ETL, no
     Parquet landing, mirroring the M2.5 "DuckDB reads SQLite directly" decision.

Run: `python scripts/benchmark_screening.py` (the DuckDB half needs the `analytical`
extra: `pip install -e ".[analytical]"` -- the script degrades to SQLite-only without
it, since DuckDB must never be a base/API dependency, see CLAUDE.md guardrail 6).
"""

from __future__ import annotations

import random
import sqlite3
import statistics
import tempfile
import time
from pathlib import Path

from secfin.normalize.schema import RawFact
from secfin.storage.sqlite_repository import SQLiteRawFactRepository

N_COMPANIES = 8_000
FRAME = "CY2023"
N_RUNS = 7

# tag choice mirrors normalize/screening.py's SCREENABLE_CONCEPTS -- primary candidate
# tag only, since the benchmark cares about query shape/scale, not tag-priority merging.
TAGS = {
    "revenue": "Revenues",
    "net_income": "NetIncomeLoss",
    "total_assets": "Assets",
    "total_liabilities": "Liabilities",
    "stockholders_equity": "StockholdersEquity",
    "cash_and_equivalents": "CashAndCashEquivalentsAtCarryingValue",
}

# A representative 3-concept AND screen, e.g. "large, profitable companies":
# revenue > $100B AND net_income > $0 AND total_assets > $50B.
_QUERY_FILTERS = {
    "revenue": 100_000_000_000,
    "net_income": 0,
    "total_assets": 50_000_000_000,
}


def _seed_data(db_path: Path) -> int:
    repo = SQLiteRawFactRepository(db_path)
    rng = random.Random(42)
    facts: list[RawFact] = []
    for concept, tag in TAGS.items():
        for cik in range(1, N_COMPANIES + 1):
            # Not every company reports every concept -- ~85% coverage, in the
            # ballpark of real mapping-coverage gaps (docs/DATA_MODEL.md).
            if rng.random() > 0.85:
                continue
            facts.append(
                RawFact(
                    cik=cik,
                    taxonomy="us-gaap",
                    gaap_tag=tag,
                    label=concept,
                    unit="USD",
                    value=rng.uniform(1_000_000, 500_000_000_000),
                    period_start="2023-01-01",
                    period_end="2023-12-31",
                    accession=f"acc-{cik}-{tag}",
                    frame=FRAME,
                )
            )
    repo.upsert_raw_facts(facts)
    repo.close()
    return len(facts)


def _time_sqlite(db_path: Path) -> tuple[float, int]:
    conn = sqlite3.connect(db_path)

    def _screen(tag: str) -> list[tuple[int, float]]:
        cur = conn.execute(
            "SELECT cik, value FROM raw_facts WHERE gaap_tag = ? AND frame = ? "
            "AND value IS NOT NULL",
            (tag, FRAME),
        )
        return cur.fetchall()

    def _query() -> set[int]:
        matching: set[int] | None = None
        for concept, threshold in _QUERY_FILTERS.items():
            rows = _screen(TAGS[concept])
            concept_matches = {cik for cik, val in rows if val > threshold}
            matching = concept_matches if matching is None else (matching & concept_matches)
        return matching or set()

    times = []
    result: set[int] = set()
    for _ in range(N_RUNS):
        start = time.perf_counter()
        result = _query()
        times.append(time.perf_counter() - start)
    conn.close()
    return statistics.median(times), len(result)


def _time_duckdb(db_path: Path) -> tuple[float, int]:
    import duckdb

    con = duckdb.connect()
    con.execute(f"ATTACH '{db_path}' AS sq (TYPE sqlite)")

    ctes = []
    params: list[object] = []
    for i, (concept, threshold) in enumerate(_QUERY_FILTERS.items()):
        ctes.append(f"c{i} AS (SELECT cik FROM sq.raw_facts WHERE gaap_tag = ? AND frame = ? AND value > ?)")
        params.extend([TAGS[concept], FRAME, threshold])
    intersect = " INTERSECT ".join(f"SELECT cik FROM c{i}" for i in range(len(_QUERY_FILTERS)))
    sql = f"WITH {', '.join(ctes)} {intersect}"

    def _query() -> list[tuple]:
        return con.execute(sql, params).fetchall()

    times = []
    result: list[tuple] = []
    for _ in range(N_RUNS):
        start = time.perf_counter()
        result = _query()
        times.append(time.perf_counter() - start)
    con.close()
    return statistics.median(times), len(result)


def main() -> None:
    with tempfile.TemporaryDirectory() as tmp:
        db_path = Path(tmp) / "benchmark.db"
        n = _seed_data(db_path)
        print(
            f"Seeded {n} synthetic frames-shaped rows across {len(TAGS)} concepts, "
            f"{N_COMPANIES} companies (~85% coverage each)."
        )

        sqlite_median, sqlite_count = _time_sqlite(db_path)
        print(
            f"Plain SQLite  (indexed, {len(_QUERY_FILTERS)}-concept AND, {N_RUNS} runs): "
            f"median {sqlite_median * 1000:.2f}ms, {sqlite_count} matches"
        )

        try:
            duckdb_median, duckdb_count = _time_duckdb(db_path)
        except ImportError:
            print(
                "duckdb not installed -- run `pip install -e '.[analytical]'` to "
                "include the DuckDB comparison."
            )
            return

        print(
            f"DuckDB-over-SQLite ({len(_QUERY_FILTERS)}-concept AND, {N_RUNS} runs): "
            f"median {duckdb_median * 1000:.2f}ms, {duckdb_count} matches"
        )
        assert sqlite_count == duckdb_count, "result mismatch between engines -- investigate"
        if sqlite_median <= duckdb_median:
            print(f"-> Plain SQLite wins/ties: {duckdb_median / sqlite_median:.2f}x faster.")
        else:
            print(f"-> DuckDB wins: {sqlite_median / duckdb_median:.2f}x faster.")


if __name__ == "__main__":
    main()

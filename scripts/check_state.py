"""Assert the operational state of a secfin database, instead of documenting it.

`verify_deployment.py` proves the API SERVES. This proves it is serving the RIGHT, CURRENT data --
which is a different question, and the one nothing was asking.

## Why this exists

Three incidents, none of which any amount of documentation could have caught, because in every one
the docs were correct and the state was not:

  * **2026-08-12** -- 23 of 30 metrics had no peer distribution. Nothing was broken; the chain had
    simply never been re-run, and a stale derived table looks exactly like a working one.
  * **2026-08-16** -- `dupont_components` held 3,282 companies for FY2025 where the metrics
    pipeline held 5,976, and FY2023 had 189 against a neighbouring year's 3,980. The sector roster
    served fine, just 59 groups instead of 62.
  * **2026-08-17** -- production ran for ~50 minutes on the PRE-MIGRATION database. `/health` was
    200, `verify_deployment.py` was 11/11, the browser rendered correctly. The stale copy is a real
    database, just a 13x-smaller one. The tell was `filing_index`: 1,000 rows against 4,684,555 --
    and `GET /companies/AAPL/filings` reported `indexed_filings: 1000`, which LOOKS exactly right
    because Apple really does have about a thousand filings. A per-company number and a
    whole-database number were indistinguishable.

Each of those is a state question with a cheap answer, asked by nobody. This asks them.

## The four kinds of check

  * **FLOOR** -- is this table implausibly small? Catches a wrong database outright.
  * **NONEMPTY** -- has this producer ever run? A zero here is a batch that does not exist yet, not
    a market with nothing in it.
  * **FRESH** -- how old is the wall-clock stamp a batch wrote? Catches a timer that stopped firing.
  * **COVERAGE** -- does a derived table still cover as much of its upstream as it used to? This is
    the one that catches SILENT staleness, where the table is present, non-empty, recently touched
    and quietly describing a third of the market.
  * **ALL-NULL** -- is a column every consumer filters on entirely empty? A table can be large,
    current and complete-looking while being useless for the one question asked of it.

## On speed, and the one honest approximation

`SELECT count(*) FROM raw_facts` exceeds two minutes on the production volume (64.6M rows), so a
check nobody can afford to run is a check nobody runs. FLOOR therefore uses `max(rowid)`, which is
an index lookup and instant.

`max(rowid)` is an UPPER BOUND on the row count, not the count -- a rowid is never reused, so any
table written by delete-then-insert inflates without bound. That is a real approximation, it is
stated in the output, and it is NOT uniformly safe:

    api_keys       56          max(rowid)         56    1.00x   <- FLOOR uses these
    filing_index    7,577,506  max(rowid)  7,577,506    1.00x
    metric_values  17,702,852  max(rowid) 17,702,852    1.00x
    company_profiles    8,935  max(rowid)  2,131,882     239x   <- NOT floored, for this reason
    disclosure_stats    8,727  max(rowid)  2,131,882     244x

The FLOOR tables are upserted in place (`ON CONFLICT DO UPDATE`), so their rowids are stable and
measured at exactly 1.00x. `company_profiles` and `disclosure_stats` are REPLACED wholesale by
their batches, which burns rowids every run -- they are deliberately absent from FLOORS and only
ever tested for existence, where inflation cannot mislead.

Verified 2026-08-18, not assumed. Before adding a table to FLOORS, measure its inflation: a
replace-written table would pass a floor it should fail.

Run it inside the container that serves, so it reads through the same mount the API does -- that is
half the point:

    docker compose -f docker-compose.prod.yml exec -T api python - < scripts/check_state.py
    python3 scripts/check_state.py --db ./data/secfin.db          # local, direct
    python3 scripts/check_state.py --json                          # for a cron wrapper

Exit 0 when every check passes, 1 on any FAIL. WARN never fails the run: a warning is "look at
this", a failure is "this is wrong".
"""

from __future__ import annotations

import argparse
import json
import os
import sqlite3
import sys
from dataclasses import dataclass, field
from datetime import date, datetime
from pathlib import Path

# --------------------------------------------------------------------------------------- checks
#
# FLOORS are set an order of magnitude below what production actually holds, not just under it.
# The failure being caught is a WRONG DATABASE -- 4.8M facts where there should be 64.6M -- so a
# floor tight enough to trip on ordinary growth would be re-tuned until someone silenced it.
# The values in the comments are the observed production counts on 2026-08-17.

FLOORS: dict[str, int] = {
    "raw_facts": 20_000_000,       # prod 64,657,414 · the stale copy had 4,805,056
    "filing_index": 500_000,       # prod  4,684,555 · the stale copy had 1,000
    "metric_values": 1_000_000,    # prod  2,719,004
    "api_keys": 1,                 # never regenerable from SEC -- an empty one is an emergency
}

# Tables a batch WRITES. Zero means the producer has never run here, which is a real and common
# state -- four of these have no scheduled producer in production at all (DEPLOYMENT_DO.md 5c) --
# so it is reported as WARN, not FAIL. The point is that it is reported at all.
PRODUCERS: dict[str, str] = {
    "dupont_components": "ingest.dupont_backfill",
    "sector_dupont": "analytical.sector_dupont  (gates /v1/sectors -- empty means NO sector page)",
    "metric_distributions": "analytical.peer_distribution",
    "metric_ranks": "analytical.peer_ranks",
    "sector_theme_scores": "analytical.sector_theme_scores",
    "lifecycle_components": "ingest.lifecycle_backfill",
    "sector_lifecycle": "analytical.sector_lifecycle",
    "dimensional_geo_facts": "ingest.dimensional_backfill",
    "sector_geographic_mix": "analytical.sector_geographic_mix",
    "sector_insider_flow": "analytical.sector_insider_flow",
    "insider_peer_ratios": "analytical.insider_peer_ratio",
    "disclosure_stats": "analytical.disclosure_stats",
}

# Wall-clock stamps a batch wrote. Only these four tables carry one; the rest are keyed by fiscal
# year, which says what they DESCRIBE and nothing about when they were computed -- which is exactly
# why COVERAGE below exists.
FRESHNESS: dict[str, tuple[str, int]] = {
    #  table                      (column,       warn after N days)
    "insider_peer_ratios": ("as_of", 14),
    "sector_insider_flow": ("as_of", 14),
    "sector_geographic_mix": ("as_of", 120),   # annual basis; a quarter is not stale
    "disclosure_stats": ("indexed_to", 30),
}

# A derived table against the upstream it is built from, PER FISCAL YEAR.
#
# Per year, not all-time, and that distinction is the whole check. On 2026-08-16 `dupont_components`
# held 189 companies for FY2023 where neighbouring years held ~4,900 -- a hole in one year. An
# all-time distinct-company count would have shown ~69% and looked perfectly healthy, because the
# companies missing from FY2023 are present in FY2022. The hole only exists year by year.
#
# NO HAND-SET RATIO. The first cut of this check floored `dupont_components/metric_values` at 75%
# and immediately raised a FALSE ALARM: the healthy ratio is a stable 70-75%, because DuPont needs
# all four legs present and is therefore ALWAYS a subset. A floor picked by intuition is how a
# state check earns the right to be ignored.
#
# So each year is compared against the MEDIAN of the window instead. That self-calibrates to
# whatever the structural ratio happens to be, and a year at 3% of a 72% median is unmissable
# regardless of what the ratio "should" be.
COVERAGE: list[tuple[str, str, str]] = [
    #  derived,               upstream,        key
    ("dupont_components", "metric_values", "cik"),
    ("metric_ranks", "metric_values", "cik"),
    ("lifecycle_components", "metric_values", "cik"),
]

#: A year whose coverage falls below this SHARE OF THE WINDOW MEDIAN is a hole, not a trend.
COVERAGE_OF_MEDIAN = 0.60
#: Years to compare. Enough to establish a median, few enough to stay fast.
COVERAGE_YEARS = 6
#: Skip a year whose upstream is this thin -- the newest fiscal year is a leading edge of
#: early-FYE filers, and a ratio over a handful of companies is noise, not a signal.
COVERAGE_MIN_UPSTREAM = 200

# Columns a consumer FILTERS ON, which a table can hold in bulk and still be useless for.
#
# The shape: `sec/insider.py` learned `transaction_code` / `is_derivative` / `rule_10b5_1` after
# the corpus was first ingested, and the cache skips an accession it already holds -- so a
# re-run wrote nothing and the columns stayed NULL. Production on 2026-08-17 held 163,102 insider
# transactions with **100% NULL** on all three. Everything downstream that filters on open-market
# codes (P/S) therefore saw an empty table: `insider_peer_ratio` wrote 0 rows three days running
# while its runner logged OK, and `/peers/insider-net-ratio` returned `na` for every company.
#
# A row count cannot see this. The table is large, recent and completely populated -- just not in
# the column anyone reads. The repair is `ingest.insider_backfill --stale-only`.
NOT_ALL_NULL: dict[str, tuple[list[str], str]] = {
    "insider_transactions": (
        ["transaction_code", "is_derivative"],
        "ingest.insider_backfill --stale-only",
    ),
}

FAIL, WARN, PASS, INFO = "FAIL", "WARN", "PASS", "INFO"


@dataclass
class Result:
    status: str
    check: str
    detail: str
    data: dict = field(default_factory=dict)


def _tables(conn: sqlite3.Connection) -> set[str]:
    return {r[0] for r in conn.execute("SELECT name FROM sqlite_master WHERE type='table'")}


def _max_rowid(conn: sqlite3.Connection, table: str) -> int:
    """Upper bound on the row count, via the rowid index. See the module docstring."""
    row = conn.execute(f"SELECT max(rowid) FROM {table}").fetchone()
    return int(row[0]) if row and row[0] is not None else 0


def _has_any(conn: sqlite3.Connection, table: str) -> bool:
    return conn.execute(f"SELECT EXISTS(SELECT 1 FROM {table})").fetchone()[0] == 1


def _days_since(stamp: str) -> int | None:
    """`stamp` is an ISO date or datetime the batch wrote. None when it does not parse -- reported
    rather than swallowed, because an unparseable stamp is itself worth seeing."""
    try:
        return (date.today() - datetime.fromisoformat(stamp[:19]).date()).days
    except (ValueError, TypeError):
        return None


def check_identity(conn: sqlite3.Connection, db_path: str) -> list[Result]:
    """WHICH database is this, and is it plausibly the real one.

    The path and size are INFO -- a human reading the output is the point, since the 2026-08-17
    failure was invisible in every automated signal but obvious the moment anyone compared
    `9.2 GB` with `34.2 GB`.
    """
    out: list[Result] = []
    try:
        size = os.path.getsize(db_path)
        out.append(Result(INFO, "database", f"{db_path} · {size / 1e9:.1f} GB", {"bytes": size}))
    except OSError:
        out.append(Result(INFO, "database", f"{db_path} · size unavailable"))

    present = _tables(conn)
    for table, floor in FLOORS.items():
        if table not in present:
            out.append(Result(FAIL, f"floor:{table}", "table is ABSENT from this database"))
            continue
        n = _max_rowid(conn, table)
        if n < floor:
            out.append(Result(
                FAIL, f"floor:{table}",
                f"~{n:,} rows, below the floor of {floor:,} — is this the right database?",
                {"rows": n, "floor": floor},
            ))
        else:
            out.append(Result(PASS, f"floor:{table}", f"~{n:,} rows (floor {floor:,})", {"rows": n}))
    return out


def check_producers(conn: sqlite3.Connection) -> list[Result]:
    out: list[Result] = []
    present = _tables(conn)
    for table, producer in PRODUCERS.items():
        if table not in present or not _has_any(conn, table):
            out.append(Result(WARN, f"never-run:{table}", f"empty — `python -m secfin.{producer}` has not run here"))
        else:
            out.append(Result(PASS, f"produced:{table}", f"has rows (from {producer.split()[0]})"))
    return out


def check_freshness(conn: sqlite3.Connection) -> list[Result]:
    out: list[Result] = []
    present = _tables(conn)
    for table, (col, warn_days) in FRESHNESS.items():
        if table not in present or not _has_any(conn, table):
            continue  # a never-run producer is already reported; not stale, absent
        stamp = conn.execute(f"SELECT max({col}) FROM {table}").fetchone()[0]
        age = _days_since(stamp) if stamp else None
        if age is None:
            out.append(Result(WARN, f"fresh:{table}", f"{col} is {stamp!r} — cannot read a date from it"))
        elif age > warn_days:
            out.append(Result(WARN, f"fresh:{table}", f"{col} is {age}d old (over {warn_days}d) — last {stamp}"))
        else:
            out.append(Result(PASS, f"fresh:{table}", f"{col} {age}d old — {stamp}"))
    return out


def check_not_all_null(conn: sqlite3.Connection) -> list[Result]:
    """A populated table whose consumers all filter on a column that is entirely NULL.

    Counted with a bounded scan, not `count(*)`: the question is "is ANY value present", so the
    first non-NULL row answers it and the query stops there.
    """
    out: list[Result] = []
    present = _tables(conn)
    for table, (cols, repair) in NOT_ALL_NULL.items():
        if table not in present or not _has_any(conn, table):
            continue
        for col in cols:
            any_set = conn.execute(
                f"SELECT EXISTS(SELECT 1 FROM {table} WHERE {col} IS NOT NULL)"
            ).fetchone()[0]
            if any_set:
                out.append(Result(PASS, f"populated:{table}.{col}", "has values"))
            else:
                out.append(Result(
                    FAIL, f"all-null:{table}.{col}",
                    f"every row is NULL — the corpus predates the parser. "
                    f"Repair: python -m secfin.{repair}",
                ))
    return out


def check_coverage(conn: sqlite3.Connection) -> list[Result]:
    """The silent-staleness check: does a derived table still cover its upstream, YEAR BY YEAR.

    Compares each fiscal year's distinct-company coverage against the MEDIAN of the window rather
    than a hand-set floor -- see the note on COVERAGE above for why the hand-set version was wrong
    twice over.

    Distinct-company counts over the MATERIALIZED tables only (millions of rows, seconds); never
    over `raw_facts`, which would make this too slow to run and therefore useless.
    """
    out: list[Result] = []
    present = _tables(conn)
    for derived, upstream, key in COVERAGE:
        if derived not in present or upstream not in present:
            continue
        # Thin years are excluded IN SQL, before the window is taken -- otherwise they eat it.
        # `metric_values` holds FY2027/2028/2029 with 4, 5 and 1 companies (filers whose stated
        # fiscal year is wrong), and taking "the 6 most recent years" swallowed three slots of
        # garbage and left a 3-year median to judge against.
        rows = conn.execute(
            f"SELECT fiscal_year, count(DISTINCT {key}) AS n FROM {upstream} "
            f"WHERE fiscal_period='FY' GROUP BY fiscal_year HAVING n >= ? "
            f"ORDER BY fiscal_year DESC LIMIT ?",
            (COVERAGE_MIN_UPSTREAM, COVERAGE_YEARS),
        ).fetchall()
        ratios: dict[int, float] = {}
        for y, u in rows:
            d = conn.execute(
                f"SELECT count(DISTINCT {key}) FROM {derived} WHERE fiscal_year=? AND fiscal_period='FY'",
                (y,),
            ).fetchone()[0]
            ratios[y] = d / u
        if not ratios:
            continue
        ordered = sorted(ratios.values())
        median = ordered[len(ordered) // 2]
        if median <= 0:
            out.append(Result(WARN, f"coverage:{derived}", "no year has any coverage — has its backfill run?"))
            continue
        holes = {y: r for y, r in ratios.items() if r < median * COVERAGE_OF_MEDIAN}
        span = f"FY{min(ratios)}–{max(ratios)}"
        if holes:
            worst = ", ".join(f"FY{y} at {r:.0%}" for y, r in sorted(holes.items()))
            out.append(Result(
                FAIL, f"coverage:{derived}",
                f"{worst} — against a {median:.0%} median across {span}. Re-run its backfill.",
                {"median": median, "holes": {str(y): r for y, r in holes.items()}},
            ))
        else:
            out.append(Result(
                PASS, f"coverage:{derived}",
                f"even across {span}, median {median:.0%} of {upstream}", {"median": median},
            ))
    return out


def run(db_path: str, *, skip_coverage: bool = False) -> list[Result]:
    # Read-only, and `immutable=0` so it still works while the API is writing through WAL.
    conn = sqlite3.connect(f"file:{db_path}?mode=ro", uri=True, timeout=30)
    try:
        results = check_identity(conn, db_path)
        results += check_producers(conn)
        results += check_freshness(conn)
        results += check_not_all_null(conn)
        if not skip_coverage:
            results += check_coverage(conn)
        return results
    finally:
        conn.close()


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--db", default=os.environ.get("SECFIN_DB_PATH", "/app/data/secfin.db"))
    ap.add_argument("--json", action="store_true", help="machine-readable, for a cron wrapper")
    ap.add_argument("--skip-coverage", action="store_true", help="skip the distinct-company scans")
    args = ap.parse_args(argv)

    if not Path(args.db).is_file():
        print(f"FAIL  database  {args.db} does not exist", file=sys.stderr)
        return 1

    results = run(args.db, skip_coverage=args.skip_coverage)
    failures = [r for r in results if r.status == FAIL]

    if args.json:
        print(json.dumps({
            "db": args.db,
            "ok": not failures,
            "results": [{"status": r.status, "check": r.check, "detail": r.detail, **r.data} for r in results],
        }, indent=1))
        return 1 if failures else 0

    for r in results:
        print(f"[{r.status:4}] {r.check:34} {r.detail}")
    warns = [r for r in results if r.status == WARN]
    print()
    print(f"{sum(1 for r in results if r.status == PASS)} passed · {len(warns)} warning(s) · {len(failures)} failure(s)")
    print("Row counts are max(rowid) upper bounds, not exact counts — see the module docstring.")
    if failures:
        print("\nFAILURES:")
        for r in failures:
            print(f"  {r.check}: {r.detail}")
    return 1 if failures else 0


if __name__ == "__main__":
    raise SystemExit(main())

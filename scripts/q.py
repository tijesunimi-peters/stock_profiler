"""Ad-hoc read-only SQL against the secfin database. A query tool, not a migration tool.

Neither the host nor the `api` image ships the `sqlite3` CLI, and the real database is root-owned
inside a Docker volume -- so the practical way in is Python, in the container that already mounts
it. This wraps that in something you would actually type.

    # from the repo root, against the local volume
    docker compose exec -T api python - "SELECT count(*) FROM api_keys" < scripts/q.py

    # against production (same shape, different compose file)
    ssh root@<droplet> 'cd /opt/secfin && docker compose -f docker-compose.prod.yml exec -T api python - \\
        "SELECT max(as_of) FROM insider_peer_ratios"' < scripts/q.py

    # multi-line SQL: put it in a variable
    SQL="SELECT fiscal_year, count(*) FROM sector_dupont GROUP BY 1 ORDER BY 1 DESC"
    docker compose exec -T api python - "$SQL" < scripts/q.py

**READ-ONLY, always.** Opened with `mode=ro`, so a typo cannot write to a live database and cannot
take the write lock the API and the batches are competing for. If you need to write, use a
repository -- that is what they are for.

⚠️ `SELECT count(*) FROM raw_facts` reads 121M rows and takes minutes. For "is this table
populated", `SELECT max(rowid)` is an index lookup and instant -- but it is an UPPER BOUND, not a
count, and on a replace-written table (`company_profiles`, `disclosure_stats`) it overstates by
~240x. See scripts/check_state.py for which is safe where.
"""

from __future__ import annotations

import os
import sqlite3
import sys


def main(argv: list[str]) -> int:
    sql = " ".join(argv[1:]).strip() or sys.stdin.read().strip()
    if not sql:
        print(__doc__)
        return 2
    db = os.environ.get("SECFIN_DB_PATH", "/app/data/secfin.db")
    # timeout so a query waits for the writer rather than dying on it -- same reasoning as
    # storage/connection.py's busy timeout.
    conn = sqlite3.connect(f"file:{db}?mode=ro", uri=True, timeout=60)
    try:
        cur = conn.execute(sql)
        cols = [d[0] for d in cur.description] if cur.description else []
        rows = cur.fetchall()
    except sqlite3.Error as e:
        print(f"SQL error: {e}", file=sys.stderr)
        return 1
    finally:
        conn.close()

    if not cols:
        print("(no rows returned)")
        return 0
    widths = [max(len(str(c)), *(len(str(r[i])) for r in rows)) if rows else len(str(c))
              for i, c in enumerate(cols)]
    print("  ".join(str(c).ljust(w) for c, w in zip(cols, widths)))
    print("  ".join("-" * w for w in widths))
    for r in rows:
        print("  ".join(str(v).ljust(w) for v, w in zip(r, widths)))
    print(f"\n{len(rows)} row(s) · {db}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))

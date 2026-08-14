"""The ONE way this project opens the operational SQLite database.

Every repository under `storage/` used to open its own connection with the same three lines:

    self._conn = sqlite3.connect(path, isolation_level=None)
    self._conn.execute("PRAGMA journal_mode=WAL")
    self._conn.execute("PRAGMA synchronous=NORMAL")

Twenty-five files, byte-identical, and that duplication is exactly why nobody noticed what was
missing from all of them: **a busy timeout long enough for this deployment.**

## What went wrong, concretely

`sqlite3.connect`'s `timeout` parameter IS the busy timeout, and it defaults to 5 seconds. WAL
mode gives many concurrent readers but still exactly one writer, so a second writer gets
`SQLITE_BUSY` and, after 5 seconds, raises `OperationalError: database is locked`.

This deployment has THREE independent writers against one file, by design:

  * the API, which writes cache-aside on a read miss (`_facts_for_cik` and friends),
  * `ingest/incremental.py`, daily,
  * the analytics chains -- `metrics_backfill`, `peer_distribution`, `peer_ranks`,
    `disclosure_stats`, `insider_peer_ratio` -- weekly, and hours long.

On 2026-08-14 `secfin-incremental.timer` fired at 06:02:13 while the peer-analytics chain was
materializing metric values. Twenty seconds later `metrics_backfill` raised `database is locked`
and the chain stopped, discarding 76 minutes of work at company 600 of 9,055. Nothing was
corrupted and nothing was misconfigured. The loser of a lock race was simply never told to wait.

## What this does and does not fix

A longer timeout does NOT make two writers concurrent -- they still serialize, and the second one
blocks. What it changes is the failure mode: a collision becomes a pause instead of a crash. That
is the right trade here because every writer in this system is either a batch that can afford to
wait or a cache-aside write whose result the reader already has in hand.

`journal_mode=WAL` is persistent -- it is a property of the DATABASE FILE, not the connection --
so setting it on every connect is redundant after the first. It is kept anyway: a fresh volume
(`storage/restore.py`, a test tmpdir, a new dev checkout) is created by whichever repository opens
it first, and that one has to be the one that sets it.

`synchronous=NORMAL` IS per-connection and must be set every time. Under WAL it is the documented
safe setting: a crash cannot corrupt the database, though the most recent commits may be lost --
acceptable for a store rebuildable from SEC, and the reason the ingest is idempotent.
"""

from __future__ import annotations

import sqlite3
from pathlib import Path

from secfin.config import settings


def connect(db_path: str | Path, *, create_parents: bool = True) -> sqlite3.Connection:
    """Open the operational database with this project's standard settings.

    `isolation_level=None` puts the connection in AUTOCOMMIT: repositories manage their own
    transactions with explicit `BEGIN`/`COMMIT`, which is what makes a multi-row upsert one
    atomic write rather than N of them.

    `create_parents` makes the containing directory, which is what lets a fresh volume or a test
    tmpdir be handed a path that does not exist yet. Pass `False` for a connection that must not
    bring a database into being by accident.
    """
    path = Path(db_path)
    if create_parents:
        path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(
        path,
        isolation_level=None,
        timeout=settings.secfin_sqlite_busy_timeout_seconds,
    )
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA synchronous=NORMAL")
    return conn

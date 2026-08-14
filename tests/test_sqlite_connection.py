"""The shared SQLite connection settings -- and the one that was missing.

`storage/connection.py` exists because 25 repositories each opened their own connection with the
same three lines, and every one of them inherited Python's 5-second default busy timeout. On
2026-08-14 that killed a 76-minute analytics chain when the daily incremental ingest fired
underneath it: `sqlite3.OperationalError: database is locked`, at company 600 of 9,055.

These tests are about the SETTINGS, not about SQL. The last one is the point of the change: a
second writer must WAIT for the first, not raise.
"""

from __future__ import annotations

import sqlite3
import threading
import time

import pytest

from secfin.config import settings
from secfin.storage.connection import connect
from secfin.storage.sqlite_metric_value_repository import SQLiteMetricValueRepository
from secfin.storage.metric_value_repository import MetricValueRow


def test_connect_sets_wal_and_normal_sync(tmp_path):
    conn = connect(tmp_path / "x.db")
    try:
        assert conn.execute("PRAGMA journal_mode").fetchone()[0].lower() == "wal"
        # synchronous=NORMAL is 1. It is per-CONNECTION, unlike journal_mode, so it has to be set
        # on every open -- which is the reason this helper exists rather than a one-time migration.
        assert conn.execute("PRAGMA synchronous").fetchone()[0] == 1
    finally:
        conn.close()


def test_connect_creates_the_parent_directory(tmp_path):
    """A fresh volume, a restored backup and a test tmpdir all hand over a path that does not
    exist yet. The repositories used to each mkdir before connecting; now the helper does."""
    conn = connect(tmp_path / "nested" / "deeper" / "x.db")
    conn.close()
    assert (tmp_path / "nested" / "deeper" / "x.db").exists()


def test_create_parents_can_be_refused(tmp_path):
    with pytest.raises(sqlite3.OperationalError):
        connect(tmp_path / "nope" / "x.db", create_parents=False)


def test_busy_timeout_is_the_configured_value_not_pythons_default(tmp_path):
    """The actual defect. `sqlite3.connect`'s `timeout=` IS the busy timeout and defaults to 5s,
    which is far too short for a file three independent writers share."""
    conn = connect(tmp_path / "x.db")
    try:
        got_ms = conn.execute("PRAGMA busy_timeout").fetchone()[0]
        assert got_ms == pytest.approx(settings.secfin_sqlite_busy_timeout_seconds * 1000, rel=0.01)
        assert got_ms > 5_000, "still on Python's default -- the whole point of the helper"
    finally:
        conn.close()


def test_a_second_writer_waits_for_the_first_instead_of_raising(tmp_path):
    """The behaviour the prod failure needed, end to end through a real repository.

    A writer holds an exclusive transaction for longer than Python's 5-second default; a second
    writer on its own connection must block and then succeed. Before this change it raised
    `database is locked` and, in `metrics_backfill`, took the whole chain down with it.

    The hold is 0.4s -- long enough that a 5s-default connection would still have survived it, so
    this is not a timing race. What it proves is that the second writer BLOCKED and then COMMITTED:
    the row is there, and the wait is measurable.
    """
    db = tmp_path / "x.db"
    repo = SQLiteMetricValueRepository(db)
    released = threading.Event()

    def hold_the_write_lock() -> None:
        # Opened INSIDE the thread: sqlite3 connections are thread-bound (`check_same_thread`
        # defaults to True), which is the correct setting for this project -- every repository
        # owns one connection in one process -- and means a cross-thread holder is not possible.
        holder = connect(db)
        try:
            holder.execute("BEGIN IMMEDIATE")
            released.set()
            time.sleep(0.4)
            holder.execute("COMMIT")
        finally:
            holder.close()

    t = threading.Thread(target=hold_the_write_lock)
    t.start()
    try:
        assert released.wait(timeout=5), "the holder never took the lock"
        started = time.monotonic()
        repo.bulk_upsert(
            [MetricValueRow(cik=320193, fiscal_year=2025, fiscal_period="FY",
                            metric="net_margin", value=0.25, status="ok", unit="ratio")]
        )
        waited = time.monotonic() - started
    finally:
        t.join()

    assert waited >= 0.2, f"the write did not block at all ({waited:.3f}s) -- lock never contended"
    rows = repo.get_for_cik(320193)
    assert [r.metric for r in rows] == ["net_margin"]
    repo.close()

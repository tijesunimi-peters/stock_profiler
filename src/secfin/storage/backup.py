"""Snapshot the live SQLite store to a timestamped file on disk.

Uses sqlite3's online backup API (`Connection.backup()`), not a raw file copy. A plain
`cp` of a WAL-mode database can grab an inconsistent snapshot (uncommitted pages still
sit in the `-wal` sidecar file); the backup API is built specifically to copy a live,
possibly-concurrently-written database safely, retrying pages that change mid-copy. The
source connection is opened read-only (`mode=ro`), matching the read-only pattern
docs/DEVELOPMENT.md already recommends for inspecting the DB without contending with an
active writer -- this script can never itself write to the live DB.

Writes into `secfin_backup_dir` (see config.py), which docker-compose.yml binds to a
host directory independent of the `secfin-data` volume the DB itself lives in, so a
backup survives even `docker compose down -v`. See storage/restore.py for hydrating a
fresh volume from one of these files.

Run:
    python -m secfin.storage.backup [--db-path PATH] [--backup-dir DIR]
"""

from __future__ import annotations

import argparse
import shutil
import sqlite3
from datetime import datetime, timezone
from pathlib import Path

from secfin.config import settings

LATEST_NAME = "secfin-latest.db"


def backup_db(db_path: str, backup_dir: str) -> Path:
    """Copy `db_path` into `backup_dir` as a timestamped file, and update `secfin-latest.db`.

    Returns the path to the timestamped copy.
    """
    if not Path(db_path).exists():
        raise FileNotFoundError(f"No database at {db_path} to back up")

    backup_dir_path = Path(backup_dir)
    backup_dir_path.mkdir(parents=True, exist_ok=True)
    timestamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    dest = backup_dir_path / f"secfin-{timestamp}.db"

    src_conn = sqlite3.connect(f"file:{db_path}?mode=ro", uri=True)
    try:
        dest_conn = sqlite3.connect(dest)
        try:
            src_conn.backup(dest_conn)
        finally:
            dest_conn.close()
    finally:
        src_conn.close()

    shutil.copyfile(dest, backup_dir_path / LATEST_NAME)
    return dest


def build_arg_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(
        description="Back up the live SQLite store to a timestamped file."
    )
    p.add_argument("--db-path", default=settings.secfin_db_path)
    p.add_argument("--backup-dir", default=settings.secfin_backup_dir)
    return p


def main(argv: list[str] | None = None) -> None:
    args = build_arg_parser().parse_args(argv)
    dest = backup_db(args.db_path, args.backup_dir)
    print(f"Backed up {args.db_path} -> {dest} (and {LATEST_NAME})")


if __name__ == "__main__":
    main()

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
import re
import shutil
import sqlite3
from datetime import datetime, timezone
from pathlib import Path

from secfin.config import settings

LATEST_NAME = "secfin-latest.db"

# A completed timestamped snapshot: secfin-YYYYmmddTHHMMSSZ.db (LATEST_NAME never matches, so it
# is never counted toward retention or pruned). Sidecar journals/WAL are cleaned up alongside.
_SNAPSHOT_RE = re.compile(r"^secfin-\d{8}T\d{6}Z\.db$")
_SIDECAR_SUFFIXES = ("-journal", "-wal", "-shm")


def prune_backups(backup_dir: str, keep: int) -> list[Path]:
    """Delete all but the newest `keep` timestamped snapshots in `backup_dir`.

    Each snapshot is a full multi-GB copy of the DB, so an uncapped daily backup fills the disk
    (prod incident 2026-07-21). Keeps `secfin-latest.db` untouched (it is the restore pointer, not
    a dated snapshot). `keep <= 0` prunes nothing. Removes each pruned snapshot's -journal/-wal/-shm
    sidecars too (a disk-full run can leave a corrupt partial with an orphaned journal). Returns the
    snapshot paths removed, newest-kept first excluded."""
    if keep <= 0:
        return []
    dir_path = Path(backup_dir)
    snapshots = sorted(
        (p for p in dir_path.glob("secfin-*.db") if _SNAPSHOT_RE.match(p.name)),
        key=lambda p: p.name,  # timestamp names sort lexicographically == chronologically
        reverse=True,
    )
    removed: list[Path] = []
    for stale in snapshots[keep:]:
        for suffix in _SIDECAR_SUFFIXES:
            sidecar = stale.with_name(stale.name + suffix)
            if sidecar.exists():
                sidecar.unlink()
        stale.unlink()
        removed.append(stale)
    return removed


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
    p.add_argument(
        "--keep",
        type=int,
        default=settings.secfin_backup_retention,
        help="Retain only the newest N timestamped snapshots (0 = keep all). "
        f"Default {settings.secfin_backup_retention}. secfin-latest.db is never pruned.",
    )
    return p


def main(argv: list[str] | None = None) -> None:
    args = build_arg_parser().parse_args(argv)
    dest = backup_db(args.db_path, args.backup_dir)
    print(f"Backed up {args.db_path} -> {dest} (and {LATEST_NAME})")
    removed = prune_backups(args.backup_dir, args.keep)
    if removed:
        print(f"Pruned {len(removed)} old snapshot(s), kept newest {args.keep}: "
              + ", ".join(p.name for p in removed))


if __name__ == "__main__":
    main()

"""Hydrate the SQLite store from a backup file (see storage/backup.py).

Run this BEFORE the api service is started against the target volume -- restoring
into a file another process already has open is not supported here. If you're
recreating the app (e.g. after `docker compose down -v`), the order is:

    docker compose run --rm api python -m secfin.storage.restore --latest
    docker compose up api

Run:
    python -m secfin.storage.restore <backup-file> [--db-path PATH]
    python -m secfin.storage.restore --latest [--backup-dir DIR] [--db-path PATH]
"""

from __future__ import annotations

import argparse
import shutil
from pathlib import Path

from secfin.config import settings
from secfin.storage.backup import LATEST_NAME


def restore_db(backup_path: str, db_path: str) -> None:
    src = Path(backup_path)
    if not src.exists():
        raise FileNotFoundError(f"Backup file not found: {src}")

    dest = Path(db_path)
    dest.parent.mkdir(parents=True, exist_ok=True)

    # Drop any stale WAL/SHM sidecars left at the destination -- if left in place, SQLite
    # would replay them against the restored file's (unrelated) page contents on next open.
    for suffix in ("-wal", "-shm"):
        Path(str(dest) + suffix).unlink(missing_ok=True)

    shutil.copyfile(src, dest)


def build_arg_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(description="Restore the SQLite store from a backup file.")
    p.add_argument("backup_file", nargs="?", help="Path to a specific backup file")
    p.add_argument(
        "--latest", action="store_true", help=f"Restore {LATEST_NAME} from --backup-dir"
    )
    p.add_argument("--backup-dir", default=settings.secfin_backup_dir)
    p.add_argument("--db-path", default=settings.secfin_db_path)
    return p


def main(argv: list[str] | None = None) -> None:
    args = build_arg_parser().parse_args(argv)
    if args.latest:
        backup_file = str(Path(args.backup_dir) / LATEST_NAME)
    elif args.backup_file:
        backup_file = args.backup_file
    else:
        raise SystemExit("Provide a backup file path, or pass --latest.")
    restore_db(backup_file, args.db_path)
    print(f"Restored {backup_file} -> {args.db_path}")


if __name__ == "__main__":
    main()

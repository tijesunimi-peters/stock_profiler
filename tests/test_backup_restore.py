"""Tests for storage/backup.py and storage/restore.py (real SQLite files, tmp_path only)."""

from __future__ import annotations

import pytest

from secfin.normalize.schema import RawFact
from secfin.storage.backup import LATEST_NAME, backup_db
from secfin.storage.restore import restore_db
from secfin.storage.sqlite_repository import SQLiteRawFactRepository


def _fact(cik: int) -> RawFact:
    return RawFact(
        cik=cik,
        taxonomy="us-gaap",
        gaap_tag="Assets",
        label="Assets",
        unit="USD",
        value=100,
        instant="2024-09-28",
        fiscal_year=2024,
        fiscal_period="FY",
        accession="0000320193-24-000123",
    )


def test_backup_db_raises_if_source_missing(tmp_path):
    with pytest.raises(FileNotFoundError):
        backup_db(str(tmp_path / "does-not-exist.db"), str(tmp_path / "backups"))


def test_backup_db_copies_data_and_writes_latest(tmp_path):
    db_path = tmp_path / "secfin.db"
    repo = SQLiteRawFactRepository(db_path)
    repo.upsert_raw_facts([_fact(320193)])
    repo.close()

    backup_dir = tmp_path / "backups"
    dest = backup_db(str(db_path), str(backup_dir))

    assert dest.exists()
    assert (backup_dir / LATEST_NAME).exists()

    restored_repo = SQLiteRawFactRepository(dest)
    facts = restored_repo.get_raw_facts(320193)
    restored_repo.close()
    assert len(facts) == 1
    assert facts[0].gaap_tag == "Assets"


def test_restore_db_raises_if_backup_missing(tmp_path):
    with pytest.raises(FileNotFoundError):
        restore_db(str(tmp_path / "nope.db"), str(tmp_path / "secfin.db"))


def test_restore_db_hydrates_a_fresh_path(tmp_path):
    source_db = tmp_path / "source.db"
    repo = SQLiteRawFactRepository(source_db)
    repo.upsert_raw_facts([_fact(789019)])
    repo.close()

    backup_dir = tmp_path / "backups"
    dest = backup_db(str(source_db), str(backup_dir))

    fresh_db = tmp_path / "fresh" / "secfin.db"
    restore_db(str(dest), str(fresh_db))

    repo = SQLiteRawFactRepository(fresh_db)
    facts = repo.get_raw_facts(789019)
    repo.close()
    assert len(facts) == 1


def test_restore_db_clears_stale_wal_sidecars(tmp_path):
    db_path = tmp_path / "secfin.db"
    repo = SQLiteRawFactRepository(db_path)
    repo.upsert_raw_facts([_fact(1)])
    repo.close()

    backup_dir = tmp_path / "backups"
    dest = backup_db(str(db_path), str(backup_dir))

    # Simulate a stale WAL/SHM left behind at the destination from a prior DB generation.
    (tmp_path / "secfin.db-wal").write_bytes(b"stale")
    (tmp_path / "secfin.db-shm").write_bytes(b"stale")

    restore_db(str(dest), str(db_path))

    assert not (tmp_path / "secfin.db-wal").exists()
    assert not (tmp_path / "secfin.db-shm").exists()

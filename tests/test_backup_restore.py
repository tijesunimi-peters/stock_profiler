"""Tests for storage/backup.py and storage/restore.py (real SQLite files, tmp_path only)."""

from __future__ import annotations

import pytest

from secfin.normalize.schema import RawFact
from secfin.storage.backup import LATEST_NAME, backup_db, prune_backups
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


def test_prune_backups_keeps_newest_n_and_spares_latest(tmp_path):
    d = tmp_path / "backups"
    d.mkdir()
    # Five dated snapshots (names sort chronologically) + the latest pointer + a stray journal.
    names = [
        "secfin-20260717T070000Z.db",
        "secfin-20260718T070000Z.db",
        "secfin-20260719T070000Z.db",
        "secfin-20260720T070000Z.db",
        "secfin-20260721T070000Z.db",
    ]
    for n in names:
        (d / n).write_text("x")
    (d / LATEST_NAME).write_text("latest")  # must never be pruned
    (d / "secfin-20260717T070000Z.db-journal").write_text("j")  # sidecar of the oldest

    removed = prune_backups(str(d), keep=2)

    kept = sorted(p.name for p in d.glob("secfin-*.db"))
    assert kept == ["secfin-20260720T070000Z.db", "secfin-20260721T070000Z.db", LATEST_NAME]
    assert {p.name for p in removed} == set(names[:3])
    # the pruned oldest snapshot's orphaned journal is cleaned up too
    assert not (d / "secfin-20260717T070000Z.db-journal").exists()


def test_prune_backups_keep_zero_prunes_nothing(tmp_path):
    d = tmp_path / "backups"
    d.mkdir()
    (d / "secfin-20260721T070000Z.db").write_text("x")
    assert prune_backups(str(d), keep=0) == []
    assert (d / "secfin-20260721T070000Z.db").exists()


def test_backup_db_then_prune_integration(tmp_path):
    db_path = tmp_path / "secfin.db"
    repo = SQLiteRawFactRepository(db_path)
    repo.upsert_raw_facts([_fact(320193)])
    repo.close()
    backup_dir = tmp_path / "backups"
    # Three real snapshots via the backup API (distinct timestamps guaranteed by the loop naming
    # would collide within a second, so write directly after one real backup for the latest check).
    real = backup_db(str(db_path), str(backup_dir))
    (backup_dir / "secfin-20260101T000000Z.db").write_text("old1")
    (backup_dir / "secfin-20260102T000000Z.db").write_text("old2")
    removed = prune_backups(str(backup_dir), keep=1)
    # keeps the newest by name (the real one, dated today > 2026-01-02) and the latest pointer
    assert real.exists()
    assert (backup_dir / LATEST_NAME).exists()
    assert {p.name for p in removed} == {"secfin-20260101T000000Z.db", "secfin-20260102T000000Z.db"}


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

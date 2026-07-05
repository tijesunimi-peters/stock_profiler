"""Tests for the SQLite CUSIP -> CIK repository (no network)."""

from __future__ import annotations

from secfin.storage.sqlite_cusip_repository import SQLiteCusipMapRepository


def test_unresolved_cusip_has_no_cik_and_is_listed(tmp_path):
    repo = SQLiteCusipMapRepository(tmp_path / "secfin.db")
    repo.record_unresolved("02005N100", "ALLY FINL INC")

    assert repo.get_cik("02005N100") is None
    unresolved = repo.unresolved_cusips()
    assert len(unresolved) == 1
    assert unresolved[0]["cusip"] == "02005N100"
    assert unresolved[0]["issuer_name"] == "ALLY FINL INC"
    assert unresolved[0]["attempts"] == 1
    repo.close()


def test_repeated_unresolved_attempts_increment_and_update_name(tmp_path):
    repo = SQLiteCusipMapRepository(tmp_path / "secfin.db")
    repo.record_unresolved("02005N100", "ALLY FINL INC")
    repo.record_unresolved("02005N100", "ALLY FINANCIAL INC")

    unresolved = repo.unresolved_cusips()
    assert len(unresolved) == 1
    assert unresolved[0]["attempts"] == 2
    assert unresolved[0]["issuer_name"] == "ALLY FINANCIAL INC"
    repo.close()


def test_resolved_cusip_is_retrievable_and_not_in_unresolved_list(tmp_path):
    repo = SQLiteCusipMapRepository(tmp_path / "secfin.db")
    repo.record_resolved("037833100", 320193, "APPLE INC")

    assert repo.get_cik("037833100") == 320193
    assert repo.unresolved_cusips() == []
    repo.close()


def test_resolving_a_previously_unresolved_cusip_upgrades_it(tmp_path):
    repo = SQLiteCusipMapRepository(tmp_path / "secfin.db")
    repo.record_unresolved("02079K107", "ALPHABET INC")
    assert repo.get_cik("02079K107") is None

    repo.record_resolved("02079K107", 1652044, "ALPHABET INC")

    assert repo.get_cik("02079K107") == 1652044
    assert repo.unresolved_cusips() == []
    repo.close()


def test_record_unresolved_never_clobbers_an_existing_resolution(tmp_path):
    """A later failed attempt (e.g. a stale name-index snapshot) must not erase a prior
    good resolution -- see cusip_repository.py's docstring."""
    repo = SQLiteCusipMapRepository(tmp_path / "secfin.db")
    repo.record_resolved("037833100", 320193, "APPLE INC")

    repo.record_unresolved("037833100", "APPLE INC")

    assert repo.get_cik("037833100") == 320193
    repo.close()

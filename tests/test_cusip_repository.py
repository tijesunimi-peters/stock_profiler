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


def test_resolution_counts_on_an_empty_repo(tmp_path):
    repo = SQLiteCusipMapRepository(tmp_path / "secfin.db")
    assert repo.resolution_counts() == (0, 0)
    repo.close()


def test_resolution_counts_reflects_resolved_and_unresolved_rows(tmp_path):
    repo = SQLiteCusipMapRepository(tmp_path / "secfin.db")
    repo.record_resolved("037833100", 320193, "APPLE INC")
    repo.record_resolved("02079K107", 1652044, "ALPHABET INC")
    repo.record_unresolved("02005N100", "ALLY FINL INC")

    assert repo.resolution_counts() == (2, 1)
    repo.close()


def test_resolution_counts_moves_a_cusip_from_unresolved_to_resolved(tmp_path):
    repo = SQLiteCusipMapRepository(tmp_path / "secfin.db")
    repo.record_unresolved("02005N100", "ALLY FINL INC")
    assert repo.resolution_counts() == (0, 1)

    repo.record_resolved("02005N100", 40729, "Ally Financial Inc.")

    assert repo.resolution_counts() == (1, 0)
    repo.close()


def test_cusips_for_cik_is_empty_when_nothing_resolved(tmp_path):
    repo = SQLiteCusipMapRepository(tmp_path / "secfin.db")
    assert repo.cusips_for_cik(320193) == []
    repo.close()


def test_cusips_for_cik_returns_the_reverse_of_get_cik(tmp_path):
    repo = SQLiteCusipMapRepository(tmp_path / "secfin.db")
    repo.record_resolved("037833100", 320193, "APPLE INC")

    assert repo.cusips_for_cik(320193) == ["037833100"]
    repo.close()


def test_cusips_for_cik_returns_multiple_cusips_for_a_multi_class_issuer(tmp_path):
    repo = SQLiteCusipMapRepository(tmp_path / "secfin.db")
    repo.record_resolved("02079K107", 1652044, "ALPHABET INC")  # Class C
    repo.record_resolved("02079K305", 1652044, "ALPHABET INC")  # Class A

    assert set(repo.cusips_for_cik(1652044)) == {"02079K107", "02079K305"}
    repo.close()


def test_cusips_for_cik_excludes_unresolved_cusips(tmp_path):
    repo = SQLiteCusipMapRepository(tmp_path / "secfin.db")
    repo.record_unresolved("02005N100", "ALLY FINL INC")

    assert repo.cusips_for_cik(40729) == []
    repo.close()


def test_record_unresolved_never_clobbers_an_existing_resolution(tmp_path):
    """A later failed attempt (e.g. a stale name-index snapshot) must not erase a prior
    good resolution -- see cusip_repository.py's docstring."""
    repo = SQLiteCusipMapRepository(tmp_path / "secfin.db")
    repo.record_resolved("037833100", 320193, "APPLE INC")

    repo.record_unresolved("037833100", "APPLE INC")

    assert repo.get_cik("037833100") == 320193
    repo.close()

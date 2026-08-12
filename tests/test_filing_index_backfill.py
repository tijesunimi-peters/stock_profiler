"""Tests for the filing-index backfill's candidate selection. No network.

`--all-issuers` was dead: it sliced the SET returned by `all_ciks()`, which raises
`TypeError: 'set' object is not subscriptable`. Nothing caught it because the only tests were
of the per-symbol path, and the failure needs the flag plus a populated `raw_facts`.
"""

from __future__ import annotations

import pytest

from secfin.ingest import filing_index_backfill as mod
from secfin.normalize.schema import RawFact
from secfin.storage.sqlite_repository import SQLiteRawFactRepository


def _seed(tmp_path, ciks) -> str:
    db = str(tmp_path / "fi.db")
    repo = SQLiteRawFactRepository(db)
    repo.upsert_raw_facts(
        [
            RawFact(
                cik=c, taxonomy="us-gaap", gaap_tag="Assets", label="Assets", unit="USD",
                value=1, instant="2024-09-28", fiscal_year=2024, fiscal_period="FY",
                form="10-K", filed="2024-11-01", accession=f"a-{c}",
            )
            for c in ciks
        ]
    )
    repo.close()
    return db


def test_all_issuers_selects_candidates_instead_of_raising(tmp_path, monkeypatch):
    """The regression: this raised TypeError before reaching the network."""
    db = _seed(tmp_path, [300, 100, 200])
    seen: list[int] = []

    async def _fake_run(ciks, db_path, **kw):
        seen.extend(ciks)
        return 0

    monkeypatch.setattr(mod, "run", _fake_run)
    monkeypatch.setattr(mod.settings, "secfin_db_path", db)

    try:
        mod.main(["--all-issuers", "--limit", "10"])
    except SystemExit:
        pass

    assert seen == [100, 200, 300]


def test_the_candidate_walk_is_sorted_so_limit_is_a_stable_set(tmp_path, monkeypatch):
    """`--limit N` must mean the same N companies across runs. A set's iteration order is not
    a promise, so "the first 500" would otherwise be a different 500 each time."""
    db = _seed(tmp_path, [900, 100, 500, 300])
    seen: list[int] = []

    async def _fake_run(ciks, db_path, **kw):
        seen.extend(ciks)
        return 0

    monkeypatch.setattr(mod, "run", _fake_run)
    monkeypatch.setattr(mod.settings, "secfin_db_path", db)
    try:
        mod.main(["--all-issuers", "--limit", "2"])
    except SystemExit:
        pass

    assert seen == [100, 300]


def test_no_candidates_is_an_error_not_a_silent_success(tmp_path, monkeypatch):
    monkeypatch.setattr(mod.settings, "secfin_db_path", str(tmp_path / "empty.db"))
    with pytest.raises(SystemExit):
        mod.main([])

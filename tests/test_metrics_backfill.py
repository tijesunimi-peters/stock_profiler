"""Tests for the metric materialization job (secfin.ingest.metrics_backfill). No network.

Covers `--start-after`, which is what makes a ~5.4-hour whole-market pass survivable. The job
has no "already done" state of its own: `metric_values` is written by earlier runs too, so
"this CIK has rows" cannot distinguish one this run finished from one it never reached. The
flag is only sound because the walk is SORTED, and that is what these protect.
"""

from __future__ import annotations

import pytest

from secfin.ingest import metrics_backfill as mod
from secfin.normalize.schema import RawFact
from secfin.storage.metric_value_repository import MetricValueRow
from secfin.storage.sqlite_metric_value_repository import SQLiteMetricValueRepository
from secfin.storage.sqlite_repository import SQLiteRawFactRepository


def _seed(tmp_path, ciks) -> str:
    """Seed REAL raw_facts rows, not just checkpoints.

    `run_metrics_backfill` walks `all_ciks()`, which reads `raw_facts` -- a checkpoint-only
    seed leaves it empty and every assertion below passes vacuously against an empty walk.
    """
    db = str(tmp_path / "m.db")
    repo = SQLiteRawFactRepository(db)
    repo.upsert_raw_facts(
        [
            RawFact(
                cik=c,
                taxonomy="us-gaap",
                gaap_tag="Assets",
                label="Assets",
                unit="USD",
                value=100,
                instant="2024-09-28",
                fiscal_year=2024,
                fiscal_period="FY",
                form="10-K",
                filed="2024-11-01",
                accession=f"acc-{c}",
            )
            for c in ciks
        ]
    )
    repo.close()
    return db


def _visited(monkeypatch, db, **kwargs) -> list[int]:
    """Run the job against a stubbed per-CIK compute and return the CIKs it walked."""
    seen: list[int] = []

    def _fake_rows(fact_repo, cik):
        seen.append(cik)
        return [
            MetricValueRow(
                cik=cik, fiscal_year=2024, fiscal_period="FY",
                metric="roe", value=1.0, status="ok", unit="ratio",
            )
        ]

    monkeypatch.setattr(mod, "_rows_for_cik", _fake_rows)
    mod.run_metrics_backfill(db, **kwargs)
    return seen


def test_walks_every_cik_by_default(tmp_path, monkeypatch):
    db = _seed(tmp_path, [500, 100, 300])
    assert _visited(monkeypatch, db) == [100, 300, 500]


def test_the_walk_is_ascending_which_is_what_makes_one_cik_sufficient(tmp_path, monkeypatch):
    """If the order were not sorted, "everything <= N is done" would be false and the flag
    would silently skip unprocessed companies."""
    db = _seed(tmp_path, [900, 100, 500, 300])
    seen = _visited(monkeypatch, db)
    assert seen == sorted(seen)


def test_start_after_skips_everything_at_or_below_it(tmp_path, monkeypatch):
    db = _seed(tmp_path, [100, 300, 500, 900])
    assert _visited(monkeypatch, db, start_after=300) == [500, 900]


def test_start_after_is_exclusive_so_the_named_cik_is_not_redone(tmp_path, monkeypatch):
    db = _seed(tmp_path, [100, 300, 500])
    assert 300 not in _visited(monkeypatch, db, start_after=300)


def test_start_after_past_the_end_walks_nothing_rather_than_wrapping(tmp_path, monkeypatch):
    db = _seed(tmp_path, [100, 300])
    assert _visited(monkeypatch, db, start_after=99999) == []


def test_limit_applies_before_start_after(tmp_path, monkeypatch):
    """`--limit N` means "the first N CIKs"; resuming inside that set must not silently widen
    it to companies the limited run would never have covered."""
    db = _seed(tmp_path, [100, 300, 500, 900])
    # First 3 are [100, 300, 500]; resuming after 300 leaves 500 only -- never 900.
    assert _visited(monkeypatch, db, limit=3, start_after=300) == [500]


def test_rerunning_a_cik_is_an_upsert_not_a_duplicate(tmp_path, monkeypatch):
    """Erring LOW on --start-after has to be free, or an operator cannot safely pick a
    conservative resume point."""
    db = _seed(tmp_path, [100])
    _visited(monkeypatch, db)
    _visited(monkeypatch, db)

    repo = SQLiteMetricValueRepository(db)
    rows = [v for v in repo.get_for_cik(100)]
    repo.close()
    assert len(rows) == 1


def test_cli_parses_start_after(tmp_path, monkeypatch):
    called = {}

    def _fake_run(db_path, limit=None, start_after=None):
        called.update(db_path=db_path, limit=limit, start_after=start_after)

    monkeypatch.setattr(mod, "run_metrics_backfill", _fake_run)
    mod.main(["--start-after", "913778", "--db-path", str(tmp_path / "x.db")])

    assert called["start_after"] == 913778


@pytest.mark.parametrize("bad", ["notanint", "-"])
def test_cli_rejects_a_non_integer_start_after(bad):
    with pytest.raises(SystemExit):
        mod.build_arg_parser().parse_args(["--start-after", bad])

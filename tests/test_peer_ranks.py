"""Tests for the Metrics Phase 2 pipeline (no network): the new repos, the metrics
materialization backfill, and the DuckDB peer-rank batch (skip-gated on the `analytical`
extra). See docs/ROADMAP_METRICS.md Phase 2.
"""

from __future__ import annotations

import importlib.util
import json
from pathlib import Path

import pytest

from secfin.analytical.peer_ranks import compute_peer_ranks, run_peer_ranks
from secfin.ingest.metrics_backfill import run_metrics_backfill
from secfin.sec.companyfacts import flatten_company_facts
from secfin.storage.company_profile_repository import CompanyProfile
from secfin.storage.metric_rank_repository import MetricRankRow
from secfin.storage.metric_value_repository import MetricValueRow
from secfin.storage.sqlite_company_profile_repository import SQLiteCompanyProfileRepository
from secfin.storage.sqlite_metric_rank_repository import SQLiteMetricRankRepository
from secfin.storage.sqlite_metric_value_repository import SQLiteMetricValueRepository
from secfin.storage.sqlite_repository import SQLiteRawFactRepository

FIXTURES_DIR = Path(__file__).parent / "fixtures"
_HAS_DUCKDB = importlib.util.find_spec("duckdb") is not None
_needs_duckdb = pytest.mark.skipif(not _HAS_DUCKDB, reason="requires the analytical extra (duckdb)")


def _aapl_facts():
    payload = json.loads((FIXTURES_DIR / "aapl_companyfacts.json").read_text())
    return flatten_company_facts(payload, 320193)


# --- repositories -------------------------------------------------------------------


def test_company_profile_round_trip():
    repo = SQLiteCompanyProfileRepository(":memory:")
    repo.upsert(CompanyProfile(cik=320193, sic="3571", sic_description="Computers", name="Apple"))
    got = repo.get(320193)
    assert got is not None and got.sic == "3571" and got.name == "Apple"
    assert repo.get(999) is None
    repo.close()


def test_metric_value_bulk_upsert_and_replace():
    repo = SQLiteMetricValueRepository(":memory:")
    repo.bulk_upsert([MetricValueRow(1, 2024, "FY", "net_margin", 0.25, "ok", "ratio")])
    repo.bulk_upsert([MetricValueRow(1, 2024, "FY", "net_margin", 0.30, "ok", "ratio")])  # replace
    rows = repo.get_for_cik(1)
    assert len(rows) == 1 and rows[0].value == 0.30
    assert repo.count() == 1
    repo.close()


def test_metric_rank_round_trip_and_clear():
    repo = SQLiteMetricRankRepository(":memory:")
    repo.bulk_upsert([MetricRankRow(1, 2024, "FY", "net_margin", "35", 6, 80.0, 1.2)])
    got = repo.get_for_cik(1, 2024, "FY")
    assert len(got) == 1 and got[0].percentile == 80.0 and got[0].peer_group == "35"
    repo.clear()
    assert repo.count() == 0
    repo.close()


def test_all_ciks_reflects_stored_facts_not_checkpoints(tmp_path):
    # Seed rows without a checkpoint (as the fixtures do) -> all_ciks must still see them.
    db = str(tmp_path / "t.db")
    repo = SQLiteRawFactRepository(db)
    repo.upsert_raw_facts(_aapl_facts())
    assert 320193 in repo.all_ciks()
    repo.close()


# --- metrics materialization --------------------------------------------------------


def test_metrics_backfill_materializes_engine_output(tmp_path):
    db = str(tmp_path / "t.db")
    repo = SQLiteRawFactRepository(db)
    repo.upsert_raw_facts(_aapl_facts())
    repo.close()

    run_metrics_backfill(db)

    vrepo = SQLiteMetricValueRepository(db)
    rows = vrepo.get_for_cik(320193)
    vrepo.close()
    assert rows, "AAPL metrics should be materialized"
    metrics = {r.metric for r in rows}
    assert "net_margin" in metrics and "gross_margin" in metrics
    # A materialized value equals the engine's own computation for that anchor.
    from secfin.normalize.metrics import compute_metrics

    nm = next(r for r in rows if r.metric == "net_margin" and r.fiscal_period == "FY")
    frepo = SQLiteRawFactRepository(db)
    facts = frepo.get_raw_facts(320193)
    frepo.close()
    single = {m.metric: m for m in compute_metrics(facts, 320193, nm.fiscal_year, "FY").metrics}
    assert nm.value == single["net_margin"].value


# --- peer-rank batch (DuckDB) -------------------------------------------------------


def _seed_peer_data(db: str) -> None:
    profiles = SQLiteCompanyProfileRepository(db)
    values = SQLiteMetricValueRepository(db)
    rows = []
    # Group "73": 6 companies with a monotone net_margin spread (ranks 0..100).
    for i in range(6):
        cik = 1000 + i
        profiles.upsert(CompanyProfile(cik=cik, sic="7372", sic_description="Software", name="S"))
        rows.append(MetricValueRow(cik, 2024, "FY", "net_margin", 0.05 + 0.03 * i, "ok", "ratio"))
    # A 7th company in group 73 whose net_margin is N/A -- must be excluded, not counted.
    profiles.upsert(CompanyProfile(cik=1099, sic="7379", sic_description="Svc", name="NA co"))
    rows.append(MetricValueRow(1099, 2024, "FY", "net_margin", None, "na", "ratio"))
    # A singleton group "99" -> below min size, gets no rank.
    profiles.upsert(CompanyProfile(cik=2000, sic="9995", sic_description="Nonclass", name="Solo"))
    rows.append(MetricValueRow(2000, 2024, "FY", "net_margin", 0.5, "ok", "ratio"))
    values.bulk_upsert(rows)
    profiles.close()
    values.close()


@_needs_duckdb
def test_peer_ranks_percentile_zscore_and_group(tmp_path):
    db = str(tmp_path / "t.db")
    _seed_peer_data(db)
    ranks = {r.cik: r for r in compute_peer_ranks(db, sic_digits=2, min_size=5)}

    # The 6-company group is ranked; peer_group is the 2-digit prefix; count excludes the N/A co.
    assert set(ranks) == {1000, 1001, 1002, 1003, 1004, 1005}
    assert all(r.peer_group == "73" and r.peer_count == 6 for r in ranks.values())
    assert ranks[1000].percentile == 0.0 and ranks[1005].percentile == 100.0
    assert ranks[1000].z_score < 0 < ranks[1005].z_score


@_needs_duckdb
def test_peer_ranks_excludes_na_and_undersized_groups(tmp_path):
    db = str(tmp_path / "t.db")
    _seed_peer_data(db)
    ranks = {r.cik for r in compute_peer_ranks(db, sic_digits=2, min_size=5)}
    assert 1099 not in ranks  # N/A company gets no rank
    assert 2000 not in ranks  # singleton group is below the min size


@_needs_duckdb
def test_run_peer_ranks_writes_and_replaces(tmp_path):
    db = str(tmp_path / "t.db")
    _seed_peer_data(db)
    n = run_peer_ranks(db, sic_digits=2, min_size=5)
    assert n == 6

    def _count() -> int:
        repo = SQLiteMetricRankRepository(db)
        try:
            return repo.count()
        finally:
            repo.close()

    assert _count() == 6
    # A second run replaces (clear + reinsert) rather than duplicating.
    run_peer_ranks(db, sic_digits=2, min_size=5)
    assert _count() == 6

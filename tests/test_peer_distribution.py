"""Tests for the peer-distribution batch (Metrics Phase 2 follow-on), sibling of
test_peer_ranks.py. Skip-gated on the `analytical` extra (duckdb). See
docs/ROADMAP_METRICS.md Phase 2.
"""

from __future__ import annotations

import importlib.util

import pytest

from secfin.analytical.peer_distribution import compute_peer_distributions, run_peer_distribution
from secfin.storage.company_profile_repository import CompanyProfile
from secfin.storage.metric_value_repository import MetricValueRow
from secfin.storage.sqlite_company_profile_repository import SQLiteCompanyProfileRepository
from secfin.storage.sqlite_metric_distribution_repository import (
    SQLiteMetricDistributionRepository,
)
from secfin.storage.sqlite_metric_value_repository import SQLiteMetricValueRepository

_HAS_DUCKDB = importlib.util.find_spec("duckdb") is not None
_needs_duckdb = pytest.mark.skipif(not _HAS_DUCKDB, reason="requires the analytical extra (duckdb)")


def _seed_peer_data(db: str) -> None:
    profiles = SQLiteCompanyProfileRepository(db)
    values = SQLiteMetricValueRepository(db)
    rows = []
    # Group "73": 6 companies with a monotone net_margin spread (0.05 .. 0.20).
    for i in range(6):
        cik = 1000 + i
        profiles.upsert(CompanyProfile(cik=cik, sic="7372", sic_description="Software", name="S"))
        rows.append(MetricValueRow(cik, 2024, "FY", "net_margin", 0.05 + 0.03 * i, "ok", "ratio"))
    # A 7th company in group 73 whose net_margin is N/A -- must be excluded, not counted as zero.
    profiles.upsert(CompanyProfile(cik=1099, sic="7379", sic_description="Svc", name="NA co"))
    rows.append(MetricValueRow(1099, 2024, "FY", "net_margin", None, "na", "ratio"))
    # A singleton group "99" -> below min size, gets no distribution.
    profiles.upsert(CompanyProfile(cik=2000, sic="9995", sic_description="Nonclass", name="Solo"))
    rows.append(MetricValueRow(2000, 2024, "FY", "net_margin", 0.5, "ok", "ratio"))
    values.bulk_upsert(rows)
    profiles.close()
    values.close()


@_needs_duckdb
def test_peer_distribution_five_number_summary(tmp_path):
    db = str(tmp_path / "t.db")
    _seed_peer_data(db)
    dists = {d.peer_group: d for d in compute_peer_distributions(db, sic_digits=2, min_size=5)}

    assert set(dists) == {"73"}  # only the 6-company group clears the min size
    d = dists["73"]
    assert d.fiscal_year == 2024 and d.fiscal_period == "FY" and d.metric == "net_margin"
    assert d.peer_count == 6  # excludes the N/A company
    assert d.min == pytest.approx(0.05)
    assert d.max == pytest.approx(0.20)
    assert d.min <= d.p25 <= d.median <= d.p75 <= d.max


@_needs_duckdb
def test_peer_distribution_excludes_na_and_undersized_groups(tmp_path):
    db = str(tmp_path / "t.db")
    _seed_peer_data(db)
    groups = {d.peer_group for d in compute_peer_distributions(db, sic_digits=2, min_size=5)}
    assert "99" not in groups  # singleton group is below the min size
    assert "37" not in groups  # the N/A-only company's group never reaches min size either


@_needs_duckdb
def test_run_peer_distribution_writes_and_replaces(tmp_path):
    db = str(tmp_path / "t.db")
    _seed_peer_data(db)
    n = run_peer_distribution(db, sic_digits=2, min_size=5)
    assert n == 1

    def _count() -> int:
        repo = SQLiteMetricDistributionRepository(db)
        try:
            return repo.count()
        finally:
            repo.close()

    assert _count() == 1
    # A second run replaces (clear + reinsert) rather than duplicating.
    run_peer_distribution(db, sic_digits=2, min_size=5)
    assert _count() == 1

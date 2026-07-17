"""Route test for GET /companies/{symbol}/peers/{metric}/distribution. No network, no DuckDB --
the endpoint only reads the precomputed `metric_distributions` table plus the company's own
profile/value via ordinary point reads. See test_peer_routes.py for the sibling endpoint.
"""

from __future__ import annotations

from fastapi.testclient import TestClient

from secfin.config import settings
from secfin.storage.company_profile_repository import CompanyProfile
from secfin.storage.metric_distribution_repository import MetricDistributionRow
from secfin.storage.metric_value_repository import MetricValueRow
from secfin.storage.sqlite_company_profile_repository import SQLiteCompanyProfileRepository
from secfin.storage.sqlite_metric_distribution_repository import (
    SQLiteMetricDistributionRepository,
)
from secfin.storage.sqlite_metric_value_repository import SQLiteMetricValueRepository

_BROWSER = {"Sec-Fetch-Site": "same-origin"}


def _configure(tmp_path, monkeypatch) -> str:
    db = str(tmp_path / "test.db")
    monkeypatch.setattr(settings, "secfin_db_path", db)
    monkeypatch.setattr(settings, "sec_user_agent", "clearyfi-test test@example.com")
    return db


def test_distribution_returns_precomputed_summary_and_company_value(tmp_path, monkeypatch):
    db = _configure(tmp_path, monkeypatch)

    profiles = SQLiteCompanyProfileRepository(db)
    profiles.upsert(
        CompanyProfile(cik=320193, sic="3571", sic_description="Computers", name="Apple")
    )
    profiles.close()

    values = SQLiteMetricValueRepository(db)
    values.bulk_upsert([MetricValueRow(320193, 2024, "FY", "net_margin", 0.25, "ok", "ratio")])
    values.close()

    dist_repo = SQLiteMetricDistributionRepository(db)
    dist_repo.bulk_upsert(
        [
            MetricDistributionRow("35", 2024, "FY", "net_margin", 6, 0.05, 0.10, 0.15, 0.20, 0.30),
        ]
    )
    dist_repo.close()

    from secfin.api.main import app

    with TestClient(app) as client:
        resp = client.get(
            "/v1/companies/320193/peers/net_margin/distribution?year=2024&period=FY",
            headers=_BROWSER,
        )

    assert resp.status_code == 200
    body = resp.json()
    assert body["cik"] == 320193
    assert body["peer_basis"] == "SIC 2-digit"
    assert body["caveats"]  # always present
    d = body["distribution"]
    assert d["metric"] == "net_margin"
    assert d["label"] == "Net Margin"
    assert d["peer_group"] == "35"
    assert d["peer_count"] == 6
    assert d["min"] == 0.05 and d["max"] == 0.30 and d["median"] == 0.15
    assert d["company_value"] == 0.25


def test_distribution_none_when_not_precomputed(tmp_path, monkeypatch):
    # A resolvable company with a profile but no precomputed distribution for this
    # metric/period -> 200 with distribution=None (insufficient peers), not a 404 or fabricated.
    db = _configure(tmp_path, monkeypatch)
    profiles = SQLiteCompanyProfileRepository(db)
    profiles.upsert(
        CompanyProfile(cik=320193, sic="3571", sic_description="Computers", name="Apple")
    )
    profiles.close()

    from secfin.api.main import app

    with TestClient(app) as client:
        resp = client.get(
            "/v1/companies/320193/peers/net_margin/distribution?year=2024&period=FY",
            headers=_BROWSER,
        )

    assert resp.status_code == 200
    body = resp.json()
    assert body["distribution"] is None
    assert body["caveats"]


def test_distribution_unknown_metric_is_404(tmp_path, monkeypatch):
    _configure(tmp_path, monkeypatch)

    from secfin.api.main import app

    with TestClient(app) as client:
        resp = client.get(
            "/v1/companies/320193/peers/not_a_real_metric/distribution?year=2024&period=FY",
            headers=_BROWSER,
        )

    assert resp.status_code == 404

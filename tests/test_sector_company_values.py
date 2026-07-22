"""Tests for the per-company sector value list (Sector Analytics app, Company view). No network.

Covers the AC -> check table:
  * the repo join (metric_values ⨝ company_profiles + metric_ranks), ordered by value, name +
    percentile attached, SIC-prefix membership;
  * N/A · N/M EXCLUDED (a value=None / status=na row is ABSENT, never a 0 row);
  * GET /v1/sectors/{group}/{metric}/companies -- populated list, below-min -> honest empty,
    unknown metric -> 404, caveats + higher_is_better carried.
"""

from __future__ import annotations

from fastapi.testclient import TestClient

from secfin.config import settings
from secfin.storage.company_profile_repository import CompanyProfile
from secfin.storage.metric_rank_repository import MetricRankRow
from secfin.storage.metric_value_repository import MetricValueRow
from secfin.storage.sqlite_company_profile_repository import SQLiteCompanyProfileRepository
from secfin.storage.sqlite_metric_rank_repository import SQLiteMetricRankRepository
from secfin.storage.sqlite_metric_value_repository import SQLiteMetricValueRepository
from secfin.storage.sqlite_sector_company_repository import SQLiteSectorCompanyRepository

_BROWSER = {"Sec-Fetch-Site": "same-origin"}


def _seed(db: str, group="35", n=8, metric="net_margin", year=2025):
    """n companies in SIC `group` with a net_margin value + rank, plus one N/A company (excluded)
    and one company in a DIFFERENT group (must not appear)."""
    profiles = SQLiteCompanyProfileRepository(db)
    values = SQLiteMetricValueRepository(db)
    ranks = SQLiteMetricRankRepository(db)
    vrows, rrows = [], []
    for i in range(n):
        cik = 1000 + i
        profiles.upsert(CompanyProfile(cik, group + "10", "x", f"Filer {i}"))
        vrows.append(MetricValueRow(cik, year, "FY", metric, 0.05 + i * 0.02, "ok", "ratio"))
        rrows.append(MetricRankRow(cik, year, "FY", metric, group, n, i / (n - 1) * 100, 0.0))
    # an N/A company in the same group -> must be EXCLUDED (value None / status na), never a 0 row
    profiles.upsert(CompanyProfile(2000, group + "10", "x", "NA Filer"))
    vrows.append(MetricValueRow(2000, year, "FY", metric, None, "na", "ratio"))
    # a company in a DIFFERENT SIC group -> must not appear
    profiles.upsert(CompanyProfile(3000, "9910", "y", "Other Sector"))
    vrows.append(MetricValueRow(3000, year, "FY", metric, 0.99, "ok", "ratio"))
    values.bulk_upsert(vrows)
    ranks.bulk_upsert(rrows)
    profiles.close()
    values.close()
    ranks.close()


# --------------------------------------------------------------------------------------
# repo
# --------------------------------------------------------------------------------------


def test_repo_join_excludes_na_and_other_groups(tmp_path):
    db = str(tmp_path / "c.db")
    _seed(db, group="35", n=8)
    repo = SQLiteSectorCompanyRepository(db)
    try:
        rows = repo.list_for_group_metric("35", 2, "net_margin", 2025, "FY")
        # 8 real companies; the N/A one and the other-group one are gone
        assert len(rows) == 8
        assert all(r.cik < 2000 for r in rows)  # 2000 (N/A) and 3000 (other group) excluded
        assert rows == sorted(rows, key=lambda r: r.value)  # ordered by value
        assert rows[0].name == "Filer 0" and rows[0].percentile == 0.0
        assert all(r.value is not None for r in rows)  # never a None/0 stand-in
        assert repo.latest_fy("net_margin") == 2025
        assert repo.latest_fy("roe") is None  # honest None when no rows
    finally:
        repo.close()


# --------------------------------------------------------------------------------------
# endpoint
# --------------------------------------------------------------------------------------


def _configure(tmp_path, monkeypatch) -> str:
    db = str(tmp_path / "api.db")
    monkeypatch.setattr(settings, "secfin_db_path", db)
    monkeypatch.setattr(settings, "sec_user_agent", "clearyfi-test test@example.com")
    return db


def test_endpoint_populated_list(tmp_path, monkeypatch):
    db = _configure(tmp_path, monkeypatch)
    _seed(db, group="35", n=8)
    from secfin.api.main import app

    with TestClient(app) as client:
        resp = client.get("/v1/sectors/35/net_margin/companies", headers=_BROWSER)

    assert resp.status_code == 200
    body = resp.json()
    assert body["metric"] == "net_margin"
    assert body["label"] and body["unit"]  # label + unit carried
    assert body["higher_is_better"] is True  # net_margin: higher better
    assert body["fiscal_year"] == 2025  # defaulted to latest FY
    assert body["caveats"]
    assert len(body["companies"]) == 8  # N/A + other-group excluded
    c0 = body["companies"][0]
    assert set(c0) >= {"cik", "name", "value", "percentile"}
    assert c0["value"] is not None
    assert all(c["cik"] < 2000 for c in body["companies"])


def test_endpoint_below_min_is_honest_empty(tmp_path, monkeypatch):
    db = _configure(tmp_path, monkeypatch)
    _seed(db, group="35", n=3)  # below secfin_peer_min_size (5)
    from secfin.api.main import app

    with TestClient(app) as client:
        resp = client.get("/v1/sectors/35/net_margin/companies", headers=_BROWSER)

    assert resp.status_code == 200
    assert resp.json()["companies"] == []  # below-min -> honest empty, not a few dots, not zeros


def test_endpoint_unknown_metric_404(tmp_path, monkeypatch):
    db = _configure(tmp_path, monkeypatch)
    _seed(db, group="35", n=8)
    from secfin.api.main import app

    with TestClient(app) as client:
        resp = client.get("/v1/sectors/35/not_a_metric/companies", headers=_BROWSER)

    assert resp.status_code == 404


def test_endpoint_lower_is_better_flag(tmp_path, monkeypatch):
    db = _configure(tmp_path, monkeypatch)
    _seed(db, group="35", n=8, metric="debt_to_equity")
    from secfin.api.main import app

    with TestClient(app) as client:
        resp = client.get("/v1/sectors/35/debt_to_equity/companies", headers=_BROWSER)

    assert resp.status_code == 200
    assert resp.json()["higher_is_better"] is False  # debt_to_equity: lower is better

"""Route test for GET /companies/{symbol}/peers (Metrics Phase 2). No network, no DuckDB --
the endpoint only reads the precomputed `metric_ranks` table. Numeric CIK as the symbol so
`_cik_from_symbol` short-circuits without a ticker lookup.
"""

from __future__ import annotations

from fastapi.testclient import TestClient

from secfin.config import settings
from secfin.storage.metric_rank_repository import MetricRankRow
from secfin.storage.sqlite_metric_rank_repository import SQLiteMetricRankRepository

_BROWSER = {"Sec-Fetch-Site": "same-origin"}


def _configure(tmp_path, monkeypatch) -> str:
    db = str(tmp_path / "test.db")
    monkeypatch.setattr(settings, "secfin_db_path", db)
    monkeypatch.setattr(settings, "sec_user_agent", "profin-test test@example.com")
    return db


def test_peers_returns_precomputed_ranks(tmp_path, monkeypatch):
    db = _configure(tmp_path, monkeypatch)
    repo = SQLiteMetricRankRepository(db)
    repo.bulk_upsert([
        MetricRankRow(320193, 2024, "FY", "net_margin", "35", 6, 80.0, 1.1),
        MetricRankRow(320193, 2024, "FY", "roe", "35", 6, 55.0, 0.2),
    ])
    repo.close()

    from secfin.api.main import app

    with TestClient(app) as client:
        resp = client.get("/v1/companies/320193/peers?year=2024&period=FY", headers=_BROWSER)

    assert resp.status_code == 200
    body = resp.json()
    assert body["cik"] == 320193
    assert body["peer_basis"] == "SIC 2-digit"
    assert body["caveats"]  # always present
    by_metric = {p["metric"]: p for p in body["peers"]}
    assert by_metric["net_margin"]["percentile"] == 80.0
    assert by_metric["net_margin"]["label"] == "Net Margin"  # label resolved server-side
    assert by_metric["net_margin"]["peer_group"] == "35"
    assert by_metric["net_margin"]["peer_count"] == 6


def test_peers_empty_when_no_ranks(tmp_path, monkeypatch):
    # A resolvable company with no precomputed ranks -> 200 with empty peers (insufficient peers),
    # not a 404 and not fabricated zeros.
    _configure(tmp_path, monkeypatch)

    from secfin.api.main import app

    with TestClient(app) as client:
        resp = client.get("/v1/companies/320193/peers?year=2024&period=FY", headers=_BROWSER)

    assert resp.status_code == 200
    body = resp.json()
    assert body["peers"] == []
    assert body["caveats"]

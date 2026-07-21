"""Tests for the sector liquidity/solvency SPREAD feature (Sector Analytics, Deliverable 3).
No network.

Covers, matching the rest of the suite's flavors:
  * the two new `MetricDistributionRepository` reads (`list_for_metric` cross-sector,
    `list_for_group` per-sector) + `latest_fy_year`, incl. honest empties;
  * `/v1/sectors/spreads` (cross-sector, a box per SIC group) -- metric validation, qualifying
    groups only, and the ROUTE-ORDERING regression (it must not be swallowed by /sectors/{group});
  * `/v1/sectors/{group}/spreads` (per-sector, a box per metric) -- absent metric never a 0 box,
    honest empties, caveats carried.

The DuckDB aggregation in `analytical/peer_distribution.py` is exercised on a hydrated volume at
build time; here the rows are written directly through the SQLite repo (the batch's write path),
so no DuckDB is needed.
"""

from __future__ import annotations

from fastapi.testclient import TestClient

from secfin.config import settings
from secfin.storage.metric_distribution_repository import MetricDistributionRow
from secfin.storage.sqlite_metric_distribution_repository import (
    SQLiteMetricDistributionRepository,
)

_BROWSER = {"Sec-Fetch-Site": "same-origin"}


def _row(group: str, metric: str, year: int, lo: float, med: float, hi: float, n: int = 8):
    """A plausible five-number summary with min<p25<median<p75<max around `med`."""
    return MetricDistributionRow(
        peer_group=group,
        fiscal_year=year,
        fiscal_period="FY",
        metric=metric,
        peer_count=n,
        min=lo,
        p25=(lo + med) / 2,
        median=med,
        p75=(med + hi) / 2,
        max=hi,
    )


# --------------------------------------------------------------------------------------
# repository reads (round-trips + honest empties)
# --------------------------------------------------------------------------------------


def test_repo_list_for_metric_and_group_and_latest(tmp_path):
    repo = SQLiteMetricDistributionRepository(str(tmp_path / "d.db"))
    try:
        repo.bulk_upsert(
            [
                _row("35", "current_ratio", 2024, 0.8, 1.6, 3.2),
                _row("60", "current_ratio", 2024, 0.5, 1.1, 2.0),
                _row("35", "current_ratio", 2025, 0.9, 1.7, 3.4),
                _row("35", "debt_to_equity", 2025, 0.1, 0.9, 4.0),
            ]
        )
        # cross-sector: every group for one metric+period
        cross = repo.list_for_metric("current_ratio", 2024, "FY")
        assert {r.peer_group for r in cross} == {"35", "60"}
        # ordered by median desc (35's 1.6 before 60's 1.1)
        assert [r.peer_group for r in cross] == ["35", "60"]
        # per-sector: every metric for one group+period
        per = repo.list_for_group("35", 2025, "FY")
        assert {r.metric for r in per} == {"current_ratio", "debt_to_equity"}
        # latest materialized FY for a metric
        assert repo.latest_fy_year("current_ratio") == 2025
        assert repo.latest_fy_year("quick_ratio") is None  # never materialized -> honest None
        # honest empties, not errors
        assert repo.list_for_metric("current_ratio", 1999, "FY") == []
        assert repo.list_for_group("99", 2025, "FY") == []
    finally:
        repo.close()


# --------------------------------------------------------------------------------------
# endpoints
# --------------------------------------------------------------------------------------


def _configure(tmp_path, monkeypatch) -> str:
    db = str(tmp_path / "api.db")
    monkeypatch.setattr(settings, "secfin_db_path", db)
    monkeypatch.setattr(settings, "sec_user_agent", "clearyfi-test test@example.com")
    return db


def _seed(db: str) -> None:
    repo = SQLiteMetricDistributionRepository(db)
    repo.bulk_upsert(
        [
            # a broadly-covered profitability metric -> the populated cross-sector view
            _row("35", "net_margin", 2024, 0.05, 0.14, 0.28, n=26),
            _row("60", "net_margin", 2024, 0.08, 0.22, 0.35, n=40),
            _row("52", "net_margin", 2024, 0.01, 0.05, 0.11, n=12),
            # liquidity/solvency: present for some groups, sparse for others (real-world shape)
            _row("35", "current_ratio", 2024, 0.8, 1.6, 3.2, n=26),
            _row("60", "current_ratio", 2024, 0.4, 1.0, 1.9, n=40),
            _row("52", "current_ratio", 2024, 0.6, 1.2, 2.4, n=12),
            _row("35", "debt_to_equity", 2024, 0.1, 0.9, 4.0, n=26),
            _row("60", "debt_to_equity", 2024, 2.0, 6.0, 12.0, n=40),
            # NOTE: group 35 has NO interest_coverage row -> the per-sector panel must omit it,
            # never render a 0 box (honesty).
            _row("60", "interest_coverage", 2024, 1.5, 4.0, 20.0, n=40),
        ]
    )
    repo.close()


def test_cross_sector_spreads_returns_box_per_group(tmp_path, monkeypatch):
    db = _configure(tmp_path, monkeypatch)
    _seed(db)
    from secfin.api.main import app

    with TestClient(app) as client:
        resp = client.get("/v1/sectors/spreads?metric=current_ratio", headers=_BROWSER)

    assert resp.status_code == 200
    body = resp.json()
    assert body["metric"] == "current_ratio"
    assert body["label"]  # human label carried
    assert body["fiscal_year"] == 2024  # defaulted to latest materialized FY
    assert body["caveats"]
    groups = {s["group"]: s for s in body["spreads"]}
    assert set(groups) == {"35", "60", "52"}  # qualifying groups only, no zero-fill
    machinery = groups["35"]
    assert machinery["group_label"].startswith("Industrial")
    assert machinery["peer_count"] == 26  # per-box transparency (AC-9)
    assert (
        machinery["min"]
        < machinery["p25"]
        < machinery["median"]
        < machinery["p75"]
        < machinery["max"]
    )


def test_cross_sector_spreads_accepts_covered_and_rejects_unoffered_metric(tmp_path, monkeypatch):
    db = _configure(tmp_path, monkeypatch)
    _seed(db)
    from secfin.api.main import app

    with TestClient(app) as client:
        # net_margin (a broadly-covered profitability metric) is a valid spread metric
        covered = client.get("/v1/sectors/spreads?metric=net_margin", headers=_BROWSER)
        # a nonexistent metric is refused
        bogus = client.get("/v1/sectors/spreads?metric=not_a_metric", headers=_BROWSER)
        # a real metric NOT offered as a spread (e.g. gross_margin) is refused
        unoffered = client.get("/v1/sectors/spreads?metric=gross_margin", headers=_BROWSER)

    assert covered.status_code == 200
    assert {s["group"] for s in covered.json()["spreads"]} == {"35", "60", "52"}
    assert bogus.status_code == 404
    assert unoffered.status_code == 404


def test_cross_sector_spreads_route_not_swallowed_by_group_param(tmp_path, monkeypatch):
    """Regression: /sectors/spreads must resolve to the spreads route, not /sectors/{group} with
    group='spreads'. A group series response has `points`; the spreads response has `spreads`."""
    db = _configure(tmp_path, monkeypatch)
    _seed(db)
    from secfin.api.main import app

    with TestClient(app) as client:
        resp = client.get("/v1/sectors/spreads?metric=current_ratio", headers=_BROWSER)

    assert resp.status_code == 200
    assert "spreads" in resp.json()
    assert "points" not in resp.json()


def test_per_sector_spreads_omits_absent_metric_never_zero(tmp_path, monkeypatch):
    db = _configure(tmp_path, monkeypatch)
    _seed(db)
    from secfin.api.main import app

    with TestClient(app) as client:
        resp = client.get("/v1/sectors/60/spreads?year=2024", headers=_BROWSER)
        machinery = client.get("/v1/sectors/35/spreads?year=2024", headers=_BROWSER)

    assert resp.status_code == 200
    body = resp.json()
    assert body["group"] == "60"
    assert body["caveats"]
    metrics = {m["metric"]: m for m in body["metrics"]}
    # banks (60) have all four seeded metrics
    assert set(metrics) == {"net_margin", "current_ratio", "debt_to_equity", "interest_coverage"}
    assert metrics["debt_to_equity"]["peer_count"] == 40
    # metrics come back in the offered order (profitability first, then liquidity/solvency)
    assert body["metrics"][0]["metric"] == "net_margin"

    # machinery (35) has NO interest_coverage row -> it is ABSENT, never a 0 box
    mbody = machinery.json()
    mmetrics = {m["metric"] for m in mbody["metrics"]}
    assert "interest_coverage" not in mmetrics
    assert mmetrics == {"net_margin", "current_ratio", "debt_to_equity"}


def test_spreads_empty_is_honest_not_error(tmp_path, monkeypatch):
    _configure(tmp_path, monkeypatch)  # empty db, nothing seeded
    from secfin.api.main import app

    with TestClient(app) as client:
        cross = client.get("/v1/sectors/spreads?metric=current_ratio", headers=_BROWSER)
        per = client.get("/v1/sectors/35/spreads?year=2024", headers=_BROWSER)

    assert cross.status_code == 200
    assert cross.json()["spreads"] == []
    assert per.status_code == 200
    assert per.json()["metrics"] == []

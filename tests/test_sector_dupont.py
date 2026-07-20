"""Tests for the sector-aggregate DuPont feature (Sector Analytics, Deliverable 1). No network.

Covers, matching the rest of the suite's flavors:
  * the new `equity_multiplier` metric + the per-company DuPont IDENTITY it makes close;
  * `dupont_components` shared-membership (None unless all four legs present);
  * the asset-weighted AGGREGATE identity + degenerate guard (`aggregate_row`);
  * the two repositories' round-trips;
  * the `/v1/sectors` + `/v1/sectors/{group}` endpoints (precomputed reads, honest empties).

The DuckDB grouping in `analytical/sector_dupont.py` is exercised on a hydrated volume at build
time; the pure sum->ratio math is unit-tested here via `aggregate_row` so no DuckDB is needed.
"""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from secfin.analytical.sector_dupont import aggregate_row
from secfin.config import settings
from secfin.normalize.metrics import compute_metrics, dupont_components
from secfin.normalize.schema import RawFact
from secfin.storage.dupont_component_repository import DupontComponentRow
from secfin.storage.sector_dupont_repository import SectorDupontRow
from secfin.storage.sqlite_dupont_component_repository import SQLiteDupontComponentRepository
from secfin.storage.sqlite_sector_dupont_repository import SQLiteSectorDupontRepository

_BROWSER = {"Sec-Fetch-Site": "same-origin"}


# --------------------------------------------------------------------------------------
# Synthetic fact builders
# --------------------------------------------------------------------------------------


def _dur(tag: str, value: float, start: str, end: str) -> RawFact:
    return RawFact(
        cik=1,
        taxonomy="us-gaap",
        gaap_tag=tag,
        label=tag,
        unit="USD",
        value=value,
        period_start=start,
        period_end=end,
        instant=None,
        filed="2025-02-01",
    )


def _inst(tag: str, value: float, instant: str) -> RawFact:
    return RawFact(
        cik=1,
        taxonomy="us-gaap",
        gaap_tag=tag,
        label=tag,
        unit="USD",
        value=value,
        period_start=None,
        period_end=None,
        instant=instant,
        filed="2025-02-01",
    )


def _company(
    *,
    ni2024: float,
    rev2024: float,
    assets_2024: float,
    assets_2023: float,
    equity_2024: float,
    equity_2023: float,
    ni2023: float = 50.0,
    rev2023: float = 500.0,
    assets_2022: float = 900.0,
    equity_2022: float = 400.0,
) -> list[RawFact]:
    """A two-fiscal-year company (FY2023, FY2024) with balances at three year-ends, so the
    FY2024 averages are EXACT (prior-year balance present)."""
    return [
        _dur("NetIncomeLoss", ni2023, "2023-01-01", "2023-12-31"),
        _dur("NetIncomeLoss", ni2024, "2024-01-01", "2024-12-31"),
        _dur(
            "RevenueFromContractWithCustomerExcludingAssessedTax",
            rev2023,
            "2023-01-01",
            "2023-12-31",
        ),
        _dur(
            "RevenueFromContractWithCustomerExcludingAssessedTax",
            rev2024,
            "2024-01-01",
            "2024-12-31",
        ),
        _inst("Assets", assets_2022, "2022-12-31"),
        _inst("Assets", assets_2023, "2023-12-31"),
        _inst("Assets", assets_2024, "2024-12-31"),
        _inst("StockholdersEquity", equity_2022, "2022-12-31"),
        _inst("StockholdersEquity", equity_2023, "2023-12-31"),
        _inst("StockholdersEquity", equity_2024, "2024-12-31"),
    ]


# --------------------------------------------------------------------------------------
# equity_multiplier metric + per-company DuPont identity (AC-1, AC-2)
# --------------------------------------------------------------------------------------


def test_equity_multiplier_value_and_registered():
    facts = _company(
        ni2024=100.0,
        rev2024=1000.0,
        assets_2024=2000.0,
        assets_2023=1800.0,
        equity_2024=800.0,
        equity_2023=700.0,
    )
    m = {x.metric: x for x in compute_metrics(facts, 1, 2024, "FY").metrics}
    assert "equity_multiplier" in m
    em = m["equity_multiplier"]
    assert em.status == "ok"
    # avg assets 1900 / avg equity 750
    assert em.value == pytest.approx(1900.0 / 750.0)


def test_equity_multiplier_na_when_equity_missing():
    facts = [
        _dur("NetIncomeLoss", 100.0, "2024-01-01", "2024-12-31"),
        _dur(
            "RevenueFromContractWithCustomerExcludingAssessedTax",
            1000.0,
            "2024-01-01",
            "2024-12-31",
        ),
        _inst("Assets", 2000.0, "2024-12-31"),
        _inst("Assets", 1800.0, "2023-12-31"),
        # no StockholdersEquity
    ]
    m = {x.metric: x for x in compute_metrics(facts, 1, 2024, "FY").metrics}
    em = m["equity_multiplier"]
    assert em.status == "na"
    assert em.value is None  # never 0


def test_equity_multiplier_approximate_without_prior_balance():
    facts = [
        _dur("NetIncomeLoss", 100.0, "2024-01-01", "2024-12-31"),
        _dur(
            "RevenueFromContractWithCustomerExcludingAssessedTax",
            1000.0,
            "2024-01-01",
            "2024-12-31",
        ),
        _inst("Assets", 2000.0, "2024-12-31"),
        _inst("StockholdersEquity", 800.0, "2024-12-31"),
        # no prior-year balances -> average falls back to period-end
    ]
    m = {x.metric: x for x in compute_metrics(facts, 1, 2024, "FY").metrics}
    em = m["equity_multiplier"]
    assert em.status == "approximate"
    assert em.value == pytest.approx(2000.0 / 800.0)


def test_per_company_dupont_identity_holds():
    facts = _company(
        ni2024=123.0,
        rev2024=987.0,
        assets_2024=2500.0,
        assets_2023=2100.0,
        equity_2024=900.0,
        equity_2023=750.0,
    )
    m = {x.metric: x for x in compute_metrics(facts, 1, 2024, "FY").metrics}
    for k in ("net_margin", "asset_turnover", "equity_multiplier", "roe"):
        assert m[k].status == "ok", k
    product = m["net_margin"].value * m["asset_turnover"].value * m["equity_multiplier"].value
    assert product == pytest.approx(m["roe"].value)


# --------------------------------------------------------------------------------------
# dupont_components shared-membership (AC-6)
# --------------------------------------------------------------------------------------


def test_dupont_components_present_when_all_legs_present():
    facts = _company(
        ni2024=100.0,
        rev2024=1000.0,
        assets_2024=2000.0,
        assets_2023=1800.0,
        equity_2024=800.0,
        equity_2023=700.0,
    )
    c = dupont_components(facts, 1, 2024, "FY")
    assert c is not None
    assert c.net_income == pytest.approx(100.0)
    assert c.revenue == pytest.approx(1000.0)
    assert c.avg_assets == pytest.approx(1900.0)
    assert c.avg_equity == pytest.approx(750.0)
    assert c.approximate is False


def test_dupont_components_none_when_a_leg_missing():
    facts = [
        _dur("NetIncomeLoss", 100.0, "2024-01-01", "2024-12-31"),
        _dur(
            "RevenueFromContractWithCustomerExcludingAssessedTax",
            1000.0,
            "2024-01-01",
            "2024-12-31",
        ),
        _inst("Assets", 2000.0, "2024-12-31"),
        _inst("Assets", 1800.0, "2023-12-31"),
        # no equity -> excluded from the aggregate
    ]
    assert dupont_components(facts, 1, 2024, "FY") is None


# --------------------------------------------------------------------------------------
# asset-weighted aggregate identity + degenerate guard (AC-4, AC-7 math)
# --------------------------------------------------------------------------------------


def test_aggregate_row_identity_holds():
    # Two companies summed: ni 100+50=150, rev 1000+400=1400, assets 1900+800=2700, eq 750+300=1050
    row = aggregate_row("35", 2024, "FY", "2024-12-31", 2, 150.0, 1400.0, 2700.0, 1050.0)
    assert row is not None
    assert row.net_margin == pytest.approx(150.0 / 1400.0)
    assert row.asset_turnover == pytest.approx(1400.0 / 2700.0)
    assert row.equity_multiplier == pytest.approx(2700.0 / 1050.0)
    assert row.roe == pytest.approx(150.0 / 1050.0)
    # identity: roe == product of the three drivers
    assert row.roe == pytest.approx(row.net_margin * row.asset_turnover * row.equity_multiplier)


def test_aggregate_row_degenerate_denominator_returns_none():
    assert aggregate_row("35", 2024, "FY", "2024-12-31", 5, 100.0, 0.0, 2700.0, 1050.0) is None
    assert aggregate_row("35", 2024, "FY", "2024-12-31", 5, 100.0, 1400.0, 2700.0, 0.0) is None


# --------------------------------------------------------------------------------------
# repositories
# --------------------------------------------------------------------------------------


def test_dupont_component_repo_roundtrip(tmp_path):
    db = str(tmp_path / "c.db")
    repo = SQLiteDupontComponentRepository(db)
    try:
        repo.bulk_upsert(
            [
                DupontComponentRow(
                    320193, 2024, "FY", "2024-09-28", 100.0, 1000.0, 1900.0, 750.0, False
                ),
            ]
        )
        assert repo.count() == 1
        # idempotent upsert (same key replaces)
        repo.bulk_upsert(
            [
                DupontComponentRow(
                    320193, 2024, "FY", "2024-09-28", 110.0, 1000.0, 1900.0, 750.0, True
                ),
            ]
        )
        assert repo.count() == 1
        repo.clear()
        assert repo.count() == 0
    finally:
        repo.close()


def test_sector_dupont_repo_reads(tmp_path):
    db = str(tmp_path / "s.db")
    repo = SQLiteSectorDupontRepository(db)
    try:
        rows = [
            SectorDupontRow(
                "35",
                2023,
                "FY",
                "2023-12-31",
                8,
                150,
                1400,
                2700,
                1050,
                150 / 1400,
                1400 / 2700,
                2700 / 1050,
                150 / 1050,
            ),
            SectorDupontRow(
                "35",
                2024,
                "FY",
                "2024-12-31",
                9,
                160,
                1500,
                2800,
                1100,
                160 / 1500,
                1500 / 2800,
                2800 / 1100,
                160 / 1100,
            ),
            SectorDupontRow(
                "60",
                2024,
                "FY",
                "2024-12-31",
                12,
                300,
                900,
                12000,
                1500,
                300 / 900,
                900 / 12000,
                12000 / 1500,
                300 / 1500,
            ),
        ]
        repo.bulk_upsert(rows)
        assert repo.count() == 3
        assert repo.latest_fy_year() == 2024
        period = repo.list_for_period(2024, "FY")
        assert {r.peer_group for r in period} == {"35", "60"}
        # banks (60) carry high leverage -> high equity_multiplier; sanity of ordering by roe desc
        series = repo.get_series("35")
        assert [r.fiscal_year for r in series] == [2023, 2024]  # oldest first
        assert repo.list_for_period(1999, "FY") == []  # honest empty, not an error
    finally:
        repo.close()


def _sd(group: str, fy: int) -> SectorDupontRow:
    return SectorDupontRow(
        group,
        fy,
        "FY",
        f"{fy}-12-31",
        5,
        150,
        1400,
        2700,
        1050,
        150 / 1400,
        1400 / 2700,
        2700 / 1050,
        150 / 1050,
    )


def test_latest_fy_year_skips_barely_filed_year(tmp_path):
    # FY2026 is barely filed (1 sector); FY2025/2024 are well-covered (4 each). The default
    # must land on the representative year, not the sparse newest one.
    db = str(tmp_path / "cov.db")
    repo = SQLiteSectorDupontRepository(db)
    try:
        rows = [_sd("35", 2026)]
        rows += [_sd(g, 2025) for g in ("35", "36", "37", "60")]
        rows += [_sd(g, 2024) for g in ("35", "36", "37", "60")]
        repo.bulk_upsert(rows)
        assert repo.latest_fy_year() == 2025  # 2026 (1 sector) is below half of 4 -> skipped
    finally:
        repo.close()


def test_get_series_is_fy_only(tmp_path):
    # A quarterly aggregate must not leak into the trend series (it would double-count).
    db = str(tmp_path / "q.db")
    repo = SQLiteSectorDupontRepository(db)
    try:
        repo.bulk_upsert(
            [
                _sd("35", 2024),
                SectorDupontRow(
                    "35",
                    2025,
                    "Q1",
                    "2025-03-31",
                    5,
                    40,
                    350,
                    2700,
                    1050,
                    40 / 350,
                    350 / 2700,
                    2700 / 1050,
                    40 / 1050,
                ),
            ]
        )
        series = repo.get_series("35")
        assert [r.fiscal_period for r in series] == ["FY"]
    finally:
        repo.close()


# --------------------------------------------------------------------------------------
# endpoints (precomputed reads, honest empties) (AC-5, AC-8, AC-12)
# --------------------------------------------------------------------------------------


def _configure(tmp_path, monkeypatch) -> str:
    db = str(tmp_path / "api.db")
    monkeypatch.setattr(settings, "secfin_db_path", db)
    monkeypatch.setattr(settings, "sec_user_agent", "clearyfi-test test@example.com")
    return db


def _seed(db: str) -> None:
    repo = SQLiteSectorDupontRepository(db)
    repo.bulk_upsert(
        [
            SectorDupontRow(
                "35",
                2024,
                "FY",
                "2024-12-31",
                9,
                160,
                1500,
                2800,
                1100,
                160 / 1500,
                1500 / 2800,
                2800 / 1100,
                160 / 1100,
            ),
            SectorDupontRow(
                "35",
                2023,
                "FY",
                "2023-12-31",
                8,
                150,
                1400,
                2700,
                1050,
                150 / 1400,
                1400 / 2700,
                2700 / 1050,
                150 / 1050,
            ),
            SectorDupontRow(
                "60",
                2024,
                "FY",
                "2024-12-31",
                12,
                300,
                900,
                12000,
                1500,
                300 / 900,
                900 / 12000,
                12000 / 1500,
                300 / 1500,
            ),
        ]
    )
    repo.close()


def test_sectors_endpoint_returns_aggregate_and_label(tmp_path, monkeypatch):
    db = _configure(tmp_path, monkeypatch)
    _seed(db)
    from secfin.api.main import app

    with TestClient(app) as client:
        resp = client.get("/v1/sectors", headers=_BROWSER)

    assert resp.status_code == 200
    body = resp.json()
    assert body["fiscal_year"] == 2024  # defaulted to latest FY
    assert body["fiscal_period"] == "FY"
    assert "not a median" in body["aggregation"]
    assert body["caveats"]
    groups = {s["group"]: s for s in body["sectors"]}
    assert set(groups) == {"35", "60"}
    machinery = groups["35"]
    assert machinery["group_label"].startswith("Industrial")
    # identity holds on the served aggregate
    assert machinery["roe"] == pytest.approx(
        machinery["net_margin"] * machinery["asset_turnover"] * machinery["equity_multiplier"]
    )


def test_sector_series_endpoint_orders_oldest_first(tmp_path, monkeypatch):
    db = _configure(tmp_path, monkeypatch)
    _seed(db)
    from secfin.api.main import app

    with TestClient(app) as client:
        resp = client.get("/v1/sectors/35", headers=_BROWSER)

    assert resp.status_code == 200
    body = resp.json()
    assert body["group"] == "35"
    assert body["group_label"].startswith("Industrial")
    assert [p["fiscal_year"] for p in body["points"]] == [2023, 2024]
    assert body["caveats"]


def test_sectors_empty_is_honest_not_error(tmp_path, monkeypatch):
    _configure(tmp_path, monkeypatch)  # empty db, nothing seeded
    from secfin.api.main import app

    with TestClient(app) as client:
        resp = client.get("/v1/sectors", headers=_BROWSER)
        series = client.get("/v1/sectors/99", headers=_BROWSER)

    assert resp.status_code == 200
    assert resp.json()["sectors"] == []
    assert series.status_code == 200
    assert series.json()["points"] == []

"""Tests for the sector-aggregate asset-lifecycle feature (Sector Analytics, Deliverable 5).
No network.

Covers, matching the rest of the suite's flavors:
  * the new `dio` / `dpo` metrics (ok / approximate / na), mirroring `dso`;
  * the derived `ccc` (= dio + dso - dpo) and its N/A propagation (a missing leg is never 0);
  * `lifecycle_components` shared-membership (None unless all five legs present);
  * the aggregate ratio-of-sums + CCC identity + degenerate guard + approx_count (`aggregate_row`);
  * the two repositories' round-trips (incl. FY-only series);
  * the `/v1/sectors/{group}/lifecycle` endpoint (precomputed read, honest empty).

The DuckDB grouping in `analytical/sector_lifecycle.py` is exercised on a hydrated volume at build
time; the pure sum->ratio math is unit-tested here via `aggregate_row` so no DuckDB is needed.
"""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from secfin.analytical.sector_lifecycle import aggregate_row
from secfin.config import settings
from secfin.normalize.metrics import compute_metrics, lifecycle_components
from secfin.normalize.schema import RawFact
from secfin.storage.lifecycle_component_repository import LifecycleComponentRow
from secfin.storage.sector_lifecycle_repository import SectorLifecycleRow
from secfin.storage.sqlite_lifecycle_component_repository import (
    SQLiteLifecycleComponentRepository,
)
from secfin.storage.sqlite_sector_lifecycle_repository import SQLiteSectorLifecycleRepository

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
    cogs2024: float = 1000.0,
    rev2024: float = 2000.0,
    inv_2024: float = 200.0,
    inv_2023: float = 180.0,
    ap_2024: float = 150.0,
    ap_2023: float = 130.0,
    ar_2024: float = 300.0,
    ar_2023: float = 260.0,
) -> list[RawFact]:
    """A two-fiscal-year company (FY2023, FY2024) with balances at three year-ends, so the FY2024
    averages are EXACT (prior-year balance present). Revenue/COGS present for both years."""
    return [
        _dur("CostOfRevenue", 800.0, "2023-01-01", "2023-12-31"),
        _dur("CostOfRevenue", cogs2024, "2024-01-01", "2024-12-31"),
        _dur(
            "RevenueFromContractWithCustomerExcludingAssessedTax",
            1600.0,
            "2023-01-01",
            "2023-12-31",
        ),
        _dur(
            "RevenueFromContractWithCustomerExcludingAssessedTax",
            rev2024,
            "2024-01-01",
            "2024-12-31",
        ),
        _inst("InventoryNet", 160.0, "2022-12-31"),
        _inst("InventoryNet", inv_2023, "2023-12-31"),
        _inst("InventoryNet", inv_2024, "2024-12-31"),
        _inst("AccountsPayableCurrent", 120.0, "2022-12-31"),
        _inst("AccountsPayableCurrent", ap_2023, "2023-12-31"),
        _inst("AccountsPayableCurrent", ap_2024, "2024-12-31"),
        _inst("AccountsReceivableNetCurrent", 240.0, "2022-12-31"),
        _inst("AccountsReceivableNetCurrent", ar_2023, "2023-12-31"),
        _inst("AccountsReceivableNetCurrent", ar_2024, "2024-12-31"),
    ]


# --------------------------------------------------------------------------------------
# dio / dpo metrics (AC-1, AC-2, AC-3)
# --------------------------------------------------------------------------------------


def test_dio_dpo_registered_and_value_ok():
    facts = _company()
    m = {x.metric: x for x in compute_metrics(facts, 1, 2024, "FY").metrics}
    assert "dio" in m and "dpo" in m
    dio, dpo = m["dio"], m["dpo"]
    assert dio.status == "ok" and dpo.status == "ok"
    assert dio.unit == "days" and dio.basis == "TTM"
    # avg inventory (200+180)/2 = 190; cogs 1000 -> 190/1000*365
    assert dio.value == pytest.approx(190.0 / 1000.0 * 365.0)
    # avg payables (150+130)/2 = 140; cogs 1000 -> 140/1000*365
    assert dpo.value == pytest.approx(140.0 / 1000.0 * 365.0)


def test_dio_dpo_approximate_without_prior_balance():
    facts = [
        _dur("CostOfRevenue", 1000.0, "2024-01-01", "2024-12-31"),
        _dur(
            "RevenueFromContractWithCustomerExcludingAssessedTax",
            2000.0,
            "2024-01-01",
            "2024-12-31",
        ),
        _inst("InventoryNet", 200.0, "2024-12-31"),
        _inst("AccountsPayableCurrent", 150.0, "2024-12-31"),
        _inst("AccountsReceivableNetCurrent", 300.0, "2024-12-31"),
        # no prior-year balances -> the average falls back to period-end (approximate)
    ]
    m = {x.metric: x for x in compute_metrics(facts, 1, 2024, "FY").metrics}
    assert m["dio"].status == "approximate"
    assert m["dio"].reason and "period-end" in m["dio"].reason
    assert m["dio"].value == pytest.approx(200.0 / 1000.0 * 365.0)  # value still shown
    assert m["dpo"].status == "approximate"


def test_dio_na_when_inventory_missing():
    facts = [
        _dur("CostOfRevenue", 1000.0, "2024-01-01", "2024-12-31"),
        # no inventory
    ]
    m = {x.metric: x for x in compute_metrics(facts, 1, 2024, "FY").metrics}
    assert m["dio"].status == "na"
    assert m["dio"].value is None  # never 0


def test_dio_na_when_cogs_zero():
    facts = [
        _dur("CostOfRevenue", 0.0, "2024-01-01", "2024-12-31"),
        _inst("InventoryNet", 200.0, "2024-12-31"),
        _inst("InventoryNet", 180.0, "2023-12-31"),
    ]
    m = {x.metric: x for x in compute_metrics(facts, 1, 2024, "FY").metrics}
    assert m["dio"].status == "na"
    assert m["dio"].value is None


# --------------------------------------------------------------------------------------
# ccc: derived, N/A propagation (AC-4)
# --------------------------------------------------------------------------------------


def test_ccc_equals_dio_plus_dso_minus_dpo():
    facts = _company()
    m = {x.metric: x for x in compute_metrics(facts, 1, 2024, "FY").metrics}
    ccc, dio, dso, dpo = m["ccc"], m["dio"], m["dso"], m["dpo"]
    assert ccc.status == "ok"
    assert ccc.unit == "days"
    assert ccc.value == pytest.approx(dio.value + dso.value - dpo.value)


def test_ccc_na_when_one_leg_missing_never_zero_filled():
    # Payables absent -> DPO is na -> CCC must be na, NOT dio+dso-0.
    facts = [
        _dur("CostOfRevenue", 1000.0, "2024-01-01", "2024-12-31"),
        _dur("CostOfRevenue", 800.0, "2023-01-01", "2023-12-31"),
        _dur(
            "RevenueFromContractWithCustomerExcludingAssessedTax",
            2000.0,
            "2024-01-01",
            "2024-12-31",
        ),
        _inst("InventoryNet", 200.0, "2024-12-31"),
        _inst("InventoryNet", 180.0, "2023-12-31"),
        _inst("AccountsReceivableNetCurrent", 300.0, "2024-12-31"),
        _inst("AccountsReceivableNetCurrent", 260.0, "2023-12-31"),
        # no AccountsPayable -> DPO na
    ]
    m = {x.metric: x for x in compute_metrics(facts, 1, 2024, "FY").metrics}
    assert m["dpo"].status == "na"
    assert m["ccc"].status == "na"
    assert m["ccc"].value is None  # never a leg-as-zero substitution


def test_ccc_approximate_when_a_leg_is_approximate():
    facts = [
        _dur("CostOfRevenue", 1000.0, "2024-01-01", "2024-12-31"),
        _dur(
            "RevenueFromContractWithCustomerExcludingAssessedTax",
            2000.0,
            "2024-01-01",
            "2024-12-31",
        ),
        _inst("InventoryNet", 200.0, "2024-12-31"),
        _inst("AccountsPayableCurrent", 150.0, "2024-12-31"),
        _inst("AccountsReceivableNetCurrent", 300.0, "2024-12-31"),
        # single year-end -> every balance leg is approximate
    ]
    m = {x.metric: x for x in compute_metrics(facts, 1, 2024, "FY").metrics}
    assert m["ccc"].status == "approximate"
    assert m["ccc"].value is not None


# --------------------------------------------------------------------------------------
# lifecycle_components shared-membership (AC-6)
# --------------------------------------------------------------------------------------


def test_lifecycle_components_present_when_all_legs_present():
    c = lifecycle_components(_company(), 1, 2024, "FY")
    assert c is not None
    assert c.inventory == pytest.approx(190.0)  # (200+180)/2
    assert c.accounts_payable == pytest.approx(140.0)  # (150+130)/2
    assert c.accounts_receivable == pytest.approx(280.0)  # (300+260)/2
    assert c.cost_of_revenue == pytest.approx(1000.0)
    assert c.revenue == pytest.approx(2000.0)
    assert c.approximate is False


def test_lifecycle_components_none_when_a_leg_missing():
    facts = [
        _dur("CostOfRevenue", 1000.0, "2024-01-01", "2024-12-31"),
        _inst("InventoryNet", 200.0, "2024-12-31"),
        _inst("AccountsReceivableNetCurrent", 300.0, "2024-12-31"),
        # no payables -> excluded from the aggregate
    ]
    assert lifecycle_components(facts, 1, 2024, "FY") is None


# --------------------------------------------------------------------------------------
# aggregate ratio-of-sums + CCC identity + degenerate guard (AC-6, AC-7 math)
# --------------------------------------------------------------------------------------


def test_aggregate_row_ratio_of_sums_and_ccc_identity():
    # Two companies summed: inv 190+100=290, ap 140+80=220, ar 280+120=400, cogs 1000+500=1500,
    # rev 2000+900=2900. approx_count 1 (one company used a period-end balance).
    row = aggregate_row("35", 2024, "FY", "2024-12-31", 2, 1, 290.0, 220.0, 400.0, 1500.0, 2900.0)
    assert row is not None
    assert row.dio == pytest.approx(290.0 / 1500.0 * 365.0)
    assert row.dpo == pytest.approx(220.0 / 1500.0 * 365.0)
    assert row.dso == pytest.approx(400.0 / 2900.0 * 365.0)
    # ccc == dio + dso - dpo, by construction
    assert row.ccc == pytest.approx(row.dio + row.dso - row.dpo)
    assert row.approx_count == 1


def test_aggregate_row_degenerate_denominator_returns_none():
    # zero summed COGS (DIO/DPO denominator)
    assert aggregate_row("35", 2024, "FY", "x", 5, 0, 290.0, 220.0, 400.0, 0.0, 2900.0) is None
    # zero summed revenue (DSO denominator)
    assert aggregate_row("35", 2024, "FY", "x", 5, 0, 290.0, 220.0, 400.0, 1500.0, 0.0) is None


# --------------------------------------------------------------------------------------
# repositories
# --------------------------------------------------------------------------------------


def test_lifecycle_component_repo_roundtrip(tmp_path):
    db = str(tmp_path / "c.db")
    repo = SQLiteLifecycleComponentRepository(db)
    try:
        repo.bulk_upsert(
            [LifecycleComponentRow(320193, 2024, "FY", "2024-09-28", 190, 140, 280, 1000, 2000, False)]
        )
        assert repo.count() == 1
        # idempotent upsert (same key replaces)
        repo.bulk_upsert(
            [LifecycleComponentRow(320193, 2024, "FY", "2024-09-28", 195, 140, 280, 1000, 2000, True)]
        )
        assert repo.count() == 1
        repo.clear()
        assert repo.count() == 0
    finally:
        repo.close()


def _sl(group: str, fy: int, period: str = "FY") -> SectorLifecycleRow:
    inv, ap, ar, cogs, rev = 290.0, 220.0, 400.0, 1500.0, 2900.0
    dio, dpo, dso = inv / cogs * 365, ap / cogs * 365, ar / rev * 365
    return SectorLifecycleRow(
        group, fy, period, f"{fy}-12-31", 5, 1, inv, ap, ar, cogs, rev, dio, dpo, dso, dio + dso - dpo
    )


def test_sector_lifecycle_repo_series_fy_only(tmp_path):
    db = str(tmp_path / "s.db")
    repo = SQLiteSectorLifecycleRepository(db)
    try:
        repo.bulk_upsert([_sl("35", 2023), _sl("35", 2024), _sl("35", 2025, "Q1")])
        assert repo.count() == 3
        series = repo.get_series("35")
        # FY-only, oldest first -- the Q1 aggregate must not leak into the trend
        assert [r.fiscal_year for r in series] == [2023, 2024]
        assert all(r.fiscal_period == "FY" for r in series)
        assert repo.get_series("99") == []  # honest empty
    finally:
        repo.close()


# --------------------------------------------------------------------------------------
# endpoint (precomputed read, honest empty) (AC-5, AC-6, AC-9)
# --------------------------------------------------------------------------------------


def _configure(tmp_path, monkeypatch) -> str:
    db = str(tmp_path / "api.db")
    monkeypatch.setattr(settings, "secfin_db_path", db)
    monkeypatch.setattr(settings, "sec_user_agent", "clearyfi-test test@example.com")
    return db


def test_lifecycle_endpoint_returns_series_and_identity(tmp_path, monkeypatch):
    db = _configure(tmp_path, monkeypatch)
    repo = SQLiteSectorLifecycleRepository(db)
    repo.bulk_upsert([_sl("35", 2023), _sl("35", 2024)])
    repo.close()
    from secfin.api.main import app

    with TestClient(app) as client:
        resp = client.get("/v1/sectors/35/lifecycle", headers=_BROWSER)

    assert resp.status_code == 200
    body = resp.json()
    assert body["group"] == "35"
    assert body["group_label"].startswith("Industrial")
    assert "not a median" in body["aggregation"]
    assert body["caveats"]
    assert [p["fiscal_year"] for p in body["points"]] == [2023, 2024]  # oldest first
    pt = body["points"][-1]
    assert pt["ccc"] == pytest.approx(pt["dio"] + pt["dso"] - pt["dpo"])
    assert pt["approximate"] is True  # approx_count 1 -> flagged


def test_lifecycle_endpoint_empty_is_honest_not_error(tmp_path, monkeypatch):
    _configure(tmp_path, monkeypatch)  # empty db, nothing seeded
    from secfin.api.main import app

    with TestClient(app) as client:
        resp = client.get("/v1/sectors/99/lifecycle", headers=_BROWSER)

    assert resp.status_code == 200
    assert resp.json()["points"] == []


def test_lifecycle_caveats_carry_no_alpha_language(tmp_path, monkeypatch):
    # Honesty guard: descriptive working-capital structure, never a timing/edge/alpha claim.
    _configure(tmp_path, monkeypatch)
    from secfin.api.main import app

    with TestClient(app) as client:
        body = client.get("/v1/sectors/35/lifecycle", headers=_BROWSER).json()

    blob = " ".join(body["caveats"]).lower() + " " + body["aggregation"].lower()
    for banned in ("alpha", "beat the market", "timing", "edge", "signal to trade"):
        assert banned not in blob

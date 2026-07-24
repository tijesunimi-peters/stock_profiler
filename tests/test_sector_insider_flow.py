"""Tests for the sector insider-flow feature (Sector Analytics v2, P6a). No network.

Covers:
  * the `sector_insider_flow` repository round-trip (upsert / get explicit + latest / clear);
  * the DuckDB aggregation batch (`analytical/sector_insider_flow.py`, skip-gated on the analytical
    extra): open-market P/S only, grants/exercises/gifts/tax excluded, missing-price excluded but
    counted, SIC-2 grouping from company_profiles (no-profile CIK excluded), trailing-window filter;
  * the `GET /v1/sectors/{group}/insider-flow` endpoint: full contract, honest N/A (never a zero),
    derived-rollup label, and the correct insider caveats (NOT the 13F long-only/45-day caveat).
"""

from __future__ import annotations

import importlib.util

import pytest
from fastapi.testclient import TestClient

from secfin.config import settings
from secfin.normalize.schema import InsiderFilingMeta, InsiderTransaction
from secfin.storage.company_profile_repository import CompanyProfile
from secfin.storage.sector_insider_flow_repository import SectorInsiderFlowRow
from secfin.storage.sqlite_company_profile_repository import SQLiteCompanyProfileRepository
from secfin.storage.sqlite_insider_repository import SQLiteInsiderTransactionRepository
from secfin.storage.sqlite_sector_insider_flow_repository import (
    SQLiteSectorInsiderFlowRepository,
)

_BROWSER = {"Sec-Fetch-Site": "same-origin"}
_HAS_DUCKDB = importlib.util.find_spec("duckdb") is not None
_needs_duckdb = pytest.mark.skipif(not _HAS_DUCKDB, reason="requires the analytical extra (duckdb)")


# --------------------------------------------------------------------------------------
# repository round-trip
# --------------------------------------------------------------------------------------


def _row(group: str, as_of: str, net: float = 1000.0) -> SectorInsiderFlowRow:
    return SectorInsiderFlowRow(
        peer_group=group,
        as_of=as_of,
        window_days=90,
        window_start="2026-04-01",
        window_end=as_of,
        net=net,
        buys=2000.0,
        sells=2000.0 - net,
        buy_count=2,
        sell_count=1,
        filer_count=2,
        company_count=2,
        excluded_no_price_count=1,
        unit="USD",
    )


def test_repo_roundtrip_get_explicit_and_latest(tmp_path):
    db = str(tmp_path / "s.db")
    repo = SQLiteSectorInsiderFlowRepository(db)
    try:
        repo.bulk_upsert(
            [_row("35", "2026-03-31", net=500.0), _row("35", "2026-06-30", net=1000.0)]
        )
        assert repo.count() == 2
        # explicit as_of
        assert repo.get("35", "2026-03-31").net == 500.0
        # latest as_of when None
        assert repo.get("35").net == 1000.0
        assert repo.get("35").as_of == "2026-06-30"
        assert repo.latest_as_of() == "2026-06-30"
        # absent group -> None (endpoint renders that as N/A, never a zero row)
        assert repo.get("99") is None
        # idempotent upsert (same key replaces, not duplicates)
        repo.bulk_upsert([_row("35", "2026-06-30", net=1234.0)])
        assert repo.count() == 2
        assert repo.get("35").net == 1234.0
        repo.clear()
        assert repo.count() == 0 and repo.latest_as_of() is None
    finally:
        repo.close()


# --------------------------------------------------------------------------------------
# aggregation batch (DuckDB) -- open-market only, exclusions, grouping, window
# --------------------------------------------------------------------------------------


def _txn(
    cik: int,
    code: str,
    *,
    shares: float | None,
    price: float | None,
    date: str,
    owner: str,
    accession: str,
) -> InsiderTransaction:
    return InsiderTransaction(
        issuer_cik=cik,
        owner_name=owner,
        transaction_date=date,
        shares=shares,
        price_per_share=price,
        acquired_disposed="A" if code == "P" else "D",
        transaction_code=code,
        form_type="4",
        accession=accession,
        filed=date,
    )


def _seed_batch_db(db: str) -> None:
    """A two-sector universe with the full spread of codes + edge cases."""
    profiles = SQLiteCompanyProfileRepository(db)
    profiles.upsert(CompanyProfile(cik=1, sic="3571", sic_description="Computers", name="Alpha"))
    profiles.upsert(CompanyProfile(cik=2, sic="3572", sic_description="Storage", name="Beta"))
    profiles.upsert(CompanyProfile(cik=3, sic="2834", sic_description="Pharma", name="Gamma"))
    # cik=4 deliberately has NO profile row -> its transactions must be excluded (AC-4).
    profiles.close()

    ins = SQLiteInsiderTransactionRepository(db)
    # -- SIC group "35": open-market buys/sells + a full set of non-open-market codes --
    ins.upsert_insider_transactions(
        1,
        [InsiderFilingMeta("A-1", "2026-06-01", "4")],
        [
            _txn(1, "P", shares=100, price=10, date="2026-06-01", owner="Alice", accession="A-1"),
            _txn(1, "S", shares=50, price=20, date="2026-06-01", owner="Alice", accession="A-1"),
            # open-market P but NO price -> excluded from sums, counted as excluded_no_price (AC-3)
            _txn(1, "P", shares=10, price=None, date="2026-06-02", owner="Alice", accession="A-1"),
            # dated BEFORE the trailing window -> excluded (AC-5)
            _txn(1, "P", shares=999, price=99, date="2026-01-01", owner="Alice", accession="A-1"),
        ],
    )
    ins.upsert_insider_transactions(
        2,
        [InsiderFilingMeta("B-1", "2026-06-03", "4")],
        [
            _txn(2, "P", shares=200, price=5, date="2026-06-03", owner="Bob", accession="B-1"),
            # non-open-market codes -> ALL excluded (AC-2)
            _txn(2, "M", shares=1000, price=1, date="2026-06-03", owner="Bob", accession="B-1"),
            _txn(2, "A", shares=500, price=2, date="2026-06-03", owner="Bob", accession="B-1"),
            _txn(2, "G", shares=300, price=3, date="2026-06-03", owner="Bob", accession="B-1"),
            _txn(2, "F", shares=40, price=4, date="2026-06-03", owner="Bob", accession="B-1"),
        ],
    )
    # -- SIC group "28": a lone open-market sale --
    ins.upsert_insider_transactions(
        3,
        [InsiderFilingMeta("C-1", "2026-06-04", "4")],
        [_txn(3, "S", shares=100, price=10, date="2026-06-04", owner="Carol", accession="C-1")],
    )
    # -- cik=4, no profile: an open-market buy that must NOT crash and must be excluded --
    ins.upsert_insider_transactions(
        4,
        [InsiderFilingMeta("D-1", "2026-06-05", "4")],
        [_txn(4, "P", shares=100, price=10, date="2026-06-05", owner="Dave", accession="D-1")],
    )
    ins.close()


@_needs_duckdb
def test_batch_open_market_only_grouping_window_and_exclusions(tmp_path):
    from secfin.analytical.sector_insider_flow import compute_sector_insider_flow

    db = str(tmp_path / "batch.db")
    _seed_batch_db(db)
    rows = {
        r.peer_group: r
        for r in compute_sector_insider_flow(db, sic_digits=2, window_days=90, as_of="2026-06-30")
    }

    # No-profile cik=4 (group would be absent anyway) did not crash and produced no group.
    assert set(rows) == {"35", "28"}

    g35 = rows["35"]
    # buys = A's P (100*10=1000) + B's P (200*5=1000) = 2000; the M/A/G/F rows contribute 0 (AC-2);
    # the null-price P is excluded from the sum (AC-3); the out-of-window P is excluded (AC-5).
    assert g35.buys == pytest.approx(2000.0)
    # sells = A's S (50*20 = 1000)
    assert g35.sells == pytest.approx(1000.0)
    assert g35.net == pytest.approx(1000.0)
    assert g35.buy_count == 2 and g35.sell_count == 1  # null-price P NOT counted as a buy
    assert g35.excluded_no_price_count == 1  # surfaced, never silently $0 (AC-3)
    assert g35.filer_count == 2  # Alice + Bob
    assert g35.company_count == 2  # cik 1 + 2
    assert g35.window_start == "2026-04-01" and g35.window_end == "2026-06-30"
    assert g35.unit == "USD"

    g28 = rows["28"]
    assert g28.buys == pytest.approx(0.0)
    assert g28.sells == pytest.approx(1000.0)
    assert g28.net == pytest.approx(-1000.0)


@_needs_duckdb
def test_batch_group_with_no_open_market_value_is_absent_not_zero(tmp_path):
    # A sector whose only insider rows are grants/exercises must yield NO row (an honest N/A at the
    # endpoint), not a zero-net row.
    db = str(tmp_path / "grants.db")
    profiles = SQLiteCompanyProfileRepository(db)
    profiles.upsert(CompanyProfile(cik=10, sic="7372", sic_description="Software", name="Zed"))
    profiles.close()
    ins = SQLiteInsiderTransactionRepository(db)
    ins.upsert_insider_transactions(
        10,
        [InsiderFilingMeta("Z-1", "2026-06-10", "4")],
        [
            _txn(10, "A", shares=500, price=2, date="2026-06-10", owner="Zoe", accession="Z-1"),
            _txn(10, "M", shares=100, price=1, date="2026-06-10", owner="Zoe", accession="Z-1"),
        ],
    )
    ins.close()
    from secfin.analytical.sector_insider_flow import compute_sector_insider_flow

    rows = compute_sector_insider_flow(db, sic_digits=2, window_days=90, as_of="2026-06-30")
    assert rows == []  # absent, not a zero row


@_needs_duckdb
def test_run_batch_recomputes_and_replaces(tmp_path):
    from secfin.analytical.sector_insider_flow import run_sector_insider_flow

    db = str(tmp_path / "run.db")
    _seed_batch_db(db)
    n = run_sector_insider_flow(db, sic_digits=2, window_days=90, as_of="2026-06-30")
    assert n == 2
    repo = SQLiteSectorInsiderFlowRepository(db)
    try:
        assert repo.get("35").net == pytest.approx(1000.0)
    finally:
        repo.close()


# --------------------------------------------------------------------------------------
# endpoint (precomputed read; honest N/A; correct caveats)
# --------------------------------------------------------------------------------------


def _configure(tmp_path, monkeypatch) -> str:
    db = str(tmp_path / "api.db")
    monkeypatch.setattr(settings, "secfin_db_path", db)
    monkeypatch.setattr(settings, "sec_user_agent", "clearyfi-test test@example.com")
    return db


def test_endpoint_returns_full_contract_when_seeded(tmp_path, monkeypatch):
    db = _configure(tmp_path, monkeypatch)
    repo = SQLiteSectorInsiderFlowRepository(db)
    repo.bulk_upsert([_row("35", "2026-06-30", net=1000.0)])
    repo.close()
    from secfin.api.main import app

    with TestClient(app) as client:
        resp = client.get("/v1/sectors/35/insider-flow", headers=_BROWSER)

    assert resp.status_code == 200
    body = resp.json()
    assert body["group"] == "35"
    assert body["group_label"].startswith("Industrial")
    assert body["has_data"] is True
    assert body["derived"] is True
    assert body["net"] == 1000.0 and body["buys"] == 2000.0 and body["sells"] == 1000.0
    assert body["transaction_count"] == body["buy_count"] + body["sell_count"] == 3
    assert body["filer_count"] == 2 and body["company_count"] == 2
    assert body["excluded_no_price_count"] == 1
    assert body["unit"] == "USD"
    assert body["as_of"] == "2026-06-30"
    assert body["window"]["days"] == 90 and body["window"]["label"] == "last 90 days"
    assert body["window"]["start"] == "2026-04-01" and body["window"]["end"] == "2026-06-30"
    assert body["peer_basis"] == "SIC 2-digit"

    # Honesty: the four correct caveats, and NONE of the 13F derived-trade language.
    blob = " ".join(body["caveats"]).lower()
    assert "derived aggregate" in blob
    assert "reporting lag" in blob or "filed after the transaction date" in blob
    assert "not every filer" in blob or "ingested so far" in blob
    assert "open-market" in blob and "excluded" in blob
    for banned in ("long-only", "45-day", "45 day", "snapshot", "quarter-end"):
        assert banned not in blob


def test_endpoint_empty_is_honest_na_never_zero(tmp_path, monkeypatch):
    _configure(tmp_path, monkeypatch)  # empty db, nothing seeded
    from secfin.api.main import app

    with TestClient(app) as client:
        resp = client.get("/v1/sectors/99/insider-flow", headers=_BROWSER)

    assert resp.status_code == 200
    body = resp.json()
    assert body["has_data"] is False
    # N/A, never a fabricated zero net-flow.
    assert body["net"] is None and body["buys"] is None and body["sells"] is None
    assert body["as_of"] is None
    assert body["window"]["start"] is None and body["window"]["end"] is None
    assert body["window"]["days"] == 90  # default window still reported
    assert body["derived"] is True
    assert body["caveats"]  # caveats still carried on the empty state

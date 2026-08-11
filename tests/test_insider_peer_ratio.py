"""Tests for the Insider view's peer strip. No network.

Covers the repository round-trip, the DuckDB batch (skip-gated on the analytical extra), and
`GET /v1/companies/{symbol}/peers/insider-net-ratio`.

The thing most of these protect is a single distinction: a peer with NO open-market activity has
no ratio, and must never be rendered as 0.0. Zero on this scale means "bought and sold in equal
size" — a real and rare posture — so filling an absence with it would invent balanced trading for
every company whose insiders did nothing at all. On the live corpus that is over half the group.
"""

from __future__ import annotations

import importlib.util

import pytest
from fastapi.testclient import TestClient

from secfin.config import settings
from secfin.normalize.schema import InsiderFilingMeta, InsiderTransaction
from secfin.storage.company_profile_repository import CompanyProfile
from secfin.storage.insider_peer_ratio_repository import InsiderPeerRatioRow
from secfin.storage.sqlite_company_profile_repository import SQLiteCompanyProfileRepository
from secfin.storage.sqlite_insider_peer_ratio_repository import (
    SQLiteInsiderPeerRatioRepository,
)
from secfin.storage.sqlite_insider_repository import SQLiteInsiderTransactionRepository

_BROWSER = {"Sec-Fetch-Site": "same-origin"}
_HAS_DUCKDB = importlib.util.find_spec("duckdb") is not None
_needs_duckdb = pytest.mark.skipif(not _HAS_DUCKDB, reason="requires the analytical extra (duckdb)")

_CIK = 320193
_PEER = 789019


def _row(
    cik: int, ratio: float, *, group: str = "35", as_of: str = "2026-08-11"
) -> InsiderPeerRatioRow:
    return InsiderPeerRatioRow(
        cik=cik,
        peer_group=group,
        as_of=as_of,
        window_days=365,
        window_start="2025-08-11",
        window_end=as_of,
        bought=100.0,
        sold=100.0,
        net_ratio=ratio,
        buy_count=1,
        sell_count=1,
        filer_count=1,
    )


# --------------------------------------------------------------------------------- repository


def test_repo_roundtrip_and_latest_as_of(tmp_path):
    repo = SQLiteInsiderPeerRatioRepository(str(tmp_path / "r.db"))
    repo.bulk_upsert([_row(_CIK, -1.0), _row(_PEER, 0.5, as_of="2026-07-01")])

    assert repo.latest_as_of(365) == "2026-08-11"
    got = repo.get_group("35", "2026-08-11", 365)
    assert [r.cik for r in got] == [_CIK]
    repo.close()


def test_latest_as_of_is_none_when_the_batch_never_ran(tmp_path):
    """Distinct from an empty group: nobody computed this, so the endpoint must not draw."""
    repo = SQLiteInsiderPeerRatioRepository(str(tmp_path / "r.db"))
    assert repo.latest_as_of(365) is None
    repo.close()


def test_group_is_ordered_by_ratio_descending(tmp_path):
    repo = SQLiteInsiderPeerRatioRepository(str(tmp_path / "r.db"))
    repo.bulk_upsert([_row(1, -1.0), _row(2, 1.0), _row(3, 0.0)])
    assert [r.net_ratio for r in repo.get_group("35", "2026-08-11", 365)] == [1.0, 0.0, -1.0]
    repo.close()


def test_count_in_group_includes_the_focal_company(tmp_path):
    """`sic_group_peers` excludes the focal cik and is limit-bounded, so it cannot be the
    denominator for "how many peers had no activity"."""
    repo = SQLiteCompanyProfileRepository(str(tmp_path / "p.db"))
    for cik in (1, 2, 3):
        repo.upsert(CompanyProfile(cik=cik, sic="3571", sic_description=None, name=None))
    repo.upsert(CompanyProfile(cik=4, sic="6021", sic_description=None, name=None))

    assert repo.count_in_group("35", 2) == 3
    assert repo.count_in_group("60", 2) == 1
    repo.close()


# --------------------------------------------------------------------------------- the batch


def _seed_trades(db: str, rows: list[InsiderTransaction]) -> None:
    repo = SQLiteInsiderTransactionRepository(db)
    by_acc: dict[str, list[InsiderTransaction]] = {}
    for r in rows:
        by_acc.setdefault(r.accession or "a", []).append(r)
    for acc, rs in by_acc.items():
        repo.upsert_insider_transactions(
            rs[0].issuer_cik,
            [InsiderFilingMeta(accession=acc, filed="2026-06-01", form_type="4")],
            rs,
        )
    repo.close()


def _txn(cik: int, code: str, shares: float, *, acc: str, deriv: bool = False,
         date: str = "2026-06-01") -> InsiderTransaction:
    return InsiderTransaction(
        issuer_cik=cik,
        accession=acc,
        form_type="4",
        filed=date,
        transaction_date=date,
        transaction_code=code,
        shares=shares,
        is_holding=False,
        is_derivative=deriv,
        acquired_disposed="A" if code in ("P", "A", "M") else "D",
    )


@_needs_duckdb
def test_batch_counts_open_market_only_and_bounds_the_ratio(tmp_path):
    from secfin.analytical.insider_peer_ratio import compute_insider_peer_ratios

    db = str(tmp_path / "b.db")
    prof = SQLiteCompanyProfileRepository(db)
    prof.upsert(CompanyProfile(cik=_CIK, sic="3571", sic_description=None, name=None))
    prof.close()
    _seed_trades(
        db,
        [
            _txn(_CIK, "P", 300, acc="a1"),
            _txn(_CIK, "S", 100, acc="a2"),
            # Excluded: a grant and a tax withholding are not decisions to trade.
            _txn(_CIK, "A", 9999, acc="a3"),
            _txn(_CIK, "F", 9999, acc="a4"),
        ],
    )

    rows = compute_insider_peer_ratios(db, 2, 365, "2026-08-11")

    assert len(rows) == 1
    r = rows[0]
    assert r.bought == 300 and r.sold == 100
    assert r.net_ratio == pytest.approx((300 - 100) / 400)  # +0.5, not 3.0
    assert r.peer_group == "35"


@_needs_duckdb
def test_batch_excludes_derivative_rows_so_one_exercise_is_not_counted_twice(tmp_path):
    from secfin.analytical.insider_peer_ratio import compute_insider_peer_ratios

    db = str(tmp_path / "b.db")
    prof = SQLiteCompanyProfileRepository(db)
    prof.upsert(CompanyProfile(cik=_CIK, sic="3571", sic_description=None, name=None))
    prof.close()
    _seed_trades(
        db,
        [_txn(_CIK, "S", 100, acc="a1"), _txn(_CIK, "S", 100, acc="a2", deriv=True)],
    )

    rows = compute_insider_peer_ratios(db, 2, 365, "2026-08-11")
    assert rows[0].sold == 100


@_needs_duckdb
def test_batch_produces_no_row_for_a_company_with_no_open_market_activity(tmp_path):
    """The company must be ABSENT, not present with 0.0 — see the module docstring."""
    from secfin.analytical.insider_peer_ratio import compute_insider_peer_ratios

    db = str(tmp_path / "b.db")
    prof = SQLiteCompanyProfileRepository(db)
    prof.upsert(CompanyProfile(cik=_CIK, sic="3571", sic_description=None, name=None))
    prof.close()
    _seed_trades(db, [_txn(_CIK, "A", 500, acc="a1"), _txn(_CIK, "F", 200, acc="a2")])

    assert compute_insider_peer_ratios(db, 2, 365, "2026-08-11") == []


@_needs_duckdb
def test_batch_honours_the_trailing_window(tmp_path):
    from secfin.analytical.insider_peer_ratio import compute_insider_peer_ratios

    db = str(tmp_path / "b.db")
    prof = SQLiteCompanyProfileRepository(db)
    prof.upsert(CompanyProfile(cik=_CIK, sic="3571", sic_description=None, name=None))
    prof.close()
    _seed_trades(db, [_txn(_CIK, "S", 100, acc="a1", date="2020-01-01")])

    assert compute_insider_peer_ratios(db, 2, 365, "2026-08-11") == []


# --------------------------------------------------------------------------------- endpoint


def _configure(tmp_path, monkeypatch) -> str:
    db = str(tmp_path / "api.db")
    monkeypatch.setattr(settings, "secfin_db_path", db)
    monkeypatch.setattr(settings, "sec_user_agent", "clearyfi-test test@example.com")
    return db


def _client():
    from secfin.api.main import app

    return TestClient(app)


def test_endpoint_reports_the_shape_and_the_peers_it_could_not_measure(tmp_path, monkeypatch):
    db = _configure(tmp_path, monkeypatch)
    prof = SQLiteCompanyProfileRepository(db)
    for cik in (_CIK, _PEER, 3, 4, 5):
        prof.upsert(CompanyProfile(cik=cik, sic="3571", sic_description=None, name=None))
    prof.close()
    ratios = SQLiteInsiderPeerRatioRepository(db)
    ratios.bulk_upsert([_row(_CIK, -1.0), _row(_PEER, -1.0), _row(3, 1.0)])
    ratios.close()

    with _client() as c:
        body = c.get(f"/v1/companies/{_CIK}/peers/insider-net-ratio", headers=_BROWSER).json()

    assert body["status"] == "ok"
    assert body["company_value"] == -1.0
    assert body["peer_count"] == 3
    assert body["shape"] == {"at_floor": 2, "at_ceiling": 1, "between": 0}
    # Five companies in the group, three with a computable ratio.
    assert body["group_company_count"] == 5
    assert body["peers_without_activity"] == 2


def test_endpoint_gives_a_reason_when_the_focal_company_has_no_ratio(tmp_path, monkeypatch):
    """The company is in the group but did not trade on the open market. `company_value` is
    None with a reason — never 0.0, which would claim balanced buying and selling."""
    db = _configure(tmp_path, monkeypatch)
    prof = SQLiteCompanyProfileRepository(db)
    for cik in (_CIK, _PEER):
        prof.upsert(CompanyProfile(cik=cik, sic="3571", sic_description=None, name=None))
    prof.close()
    ratios = SQLiteInsiderPeerRatioRepository(db)
    ratios.bulk_upsert([_row(_PEER, -1.0)])
    ratios.close()

    with _client() as c:
        body = c.get(f"/v1/companies/{_CIK}/peers/insider-net-ratio", headers=_BROWSER).json()

    assert body["status"] == "ok"
    assert body["company_value"] is None
    assert "no open-market" in (body["company_reason"] or "")


def test_endpoint_is_na_when_the_batch_never_ran(tmp_path, monkeypatch):
    """Not the same as a group with no activity, and must not render as an empty strip."""
    db = _configure(tmp_path, monkeypatch)
    prof = SQLiteCompanyProfileRepository(db)
    prof.upsert(CompanyProfile(cik=_CIK, sic="3571", sic_description=None, name=None))
    prof.close()

    with _client() as c:
        body = c.get(f"/v1/companies/{_CIK}/peers/insider-net-ratio", headers=_BROWSER).json()

    assert body["status"] == "na"
    assert "has not been run" in (body["reason"] or "")
    assert body["peers"] == []


def test_endpoint_is_na_when_the_company_has_no_sic(tmp_path, monkeypatch):
    db = _configure(tmp_path, monkeypatch)
    ratios = SQLiteInsiderPeerRatioRepository(db)
    ratios.bulk_upsert([_row(_PEER, -1.0)])
    ratios.close()

    with _client() as c:
        body = c.get(f"/v1/companies/{_CIK}/peers/insider-net-ratio", headers=_BROWSER).json()

    assert body["status"] == "na"
    assert "no SIC" in (body["reason"] or "")


def test_endpoint_carries_the_open_market_and_one_sided_caveats(tmp_path, monkeypatch):
    db = _configure(tmp_path, monkeypatch)
    prof = SQLiteCompanyProfileRepository(db)
    prof.upsert(CompanyProfile(cik=_CIK, sic="3571", sic_description=None, name=None))
    prof.close()
    ratios = SQLiteInsiderPeerRatioRepository(db)
    ratios.bulk_upsert([_row(_CIK, -1.0)])
    ratios.close()

    with _client() as c:
        body = c.get(f"/v1/companies/{_CIK}/peers/insider-net-ratio", headers=_BROWSER).json()

    joined = " ".join(body["caveats"])
    assert "DERIVED" in joined
    assert "P and S" in joined
    # The one-sidedness is a property of the data a reader must be told about up front.
    assert "near -1" in joined

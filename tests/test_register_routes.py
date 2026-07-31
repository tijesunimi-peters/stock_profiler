"""Route-level tests for the V3-P5a register endpoints (no network).

`institutional-register` (single-quarter concentration), `institutional-register-shape`
(multi-quarter turnover/tenure/stable-capital), `institutional-filed-since` (faster forms that
arrived after the register), and `period_meta` on `institutional-periods`.

Same offline pattern as `test_institutional_periods_routes.py`: gated routes carry the
first-party browser bypass header, a numeric CIK short-circuits the ticker lookup, and the
stores are seeded directly on the app's DB path.

These tests deliberately assert on the HONESTY fields, not just the numbers -- an endpoint that
returned the right figure without its caveat would be a regression here, because the caveat is
what stops a derived register statistic being read as a fact about the company.
"""

from __future__ import annotations

from fastapi.testclient import TestClient

from secfin.config import settings
from secfin.normalize.schema import (
    BeneficialOwnership,
    BeneficialOwnershipFilingMeta,
    HoldingsSnapshot,
    InsiderFilingMeta,
    InsiderTransaction,
    InstitutionalHolding,
)
from secfin.storage.sqlite_beneficial_ownership_repository import (
    SQLiteBeneficialOwnershipRepository,
)
from secfin.storage.sqlite_cusip_repository import SQLiteCusipMapRepository
from secfin.storage.sqlite_holdings_repository import SQLiteHoldingsSnapshotRepository
from secfin.storage.sqlite_insider_repository import SQLiteInsiderTransactionRepository

_BROWSER = {"Sec-Fetch-Site": "same-origin"}
_AAPL_CUSIP = "037833100"
_AAPL_CIK = 320193


def _configure(tmp_path, monkeypatch) -> str:
    db = str(tmp_path / "test.db")
    monkeypatch.setattr(settings, "secfin_db_path", db)
    monkeypatch.setattr(settings, "sec_user_agent", "clearyfi-test test@example.com")
    return db


def _seed(db: str, holders_by_period: dict[str, list[tuple[int, float]]], *, filed=None) -> None:
    """holders_by_period: quarter -> [(manager_cik, shares)]. `filed`: quarter -> {cik: date}."""
    cusip_repo = SQLiteCusipMapRepository(db)
    cusip_repo.record_resolved(_AAPL_CUSIP, _AAPL_CIK, "APPLE INC")
    cusip_repo.close()
    repo = SQLiteHoldingsSnapshotRepository(db)
    for period, holders in holders_by_period.items():
        for cik, shares in holders:
            repo.upsert_snapshot(
                HoldingsSnapshot(
                    manager_cik=cik,
                    manager_name=f"MANAGER {cik}",
                    report_period=period,
                    filed=(filed or {}).get(period, {}).get(cik),
                    holdings=[
                        InstitutionalHolding(
                            cusip=_AAPL_CUSIP, issuer_name="APPLE INC", shares=shares
                        )
                    ],
                )
            )
    repo.close()


def _client():
    from secfin.api.main import app

    return TestClient(app)


# --- period_meta on institutional-periods -------------------------------------------


def test_period_meta_reports_a_filed_RANGE_not_one_date(tmp_path, monkeypatch):
    """An issuer's register is assembled from managers filing on DIFFERENT days."""
    db = _configure(tmp_path, monkeypatch)
    _seed(
        db,
        {"2026-03-31": [(1, 100.0), (2, 200.0), (3, 300.0)]},
        filed={"2026-03-31": {1: "2026-05-04", 2: "2026-05-11", 3: "2026-05-15"}},
    )
    with _client() as c:
        body = c.get(f"/v1/companies/{_AAPL_CIK}/institutional-periods", headers=_BROWSER).json()

    m = body["period_meta"]
    assert m["as_of"] == "2026-03-31"
    assert m["filed_earliest"] == "2026-05-04"
    assert m["filed_latest"] == "2026-05-15"
    assert m["ingested_filer_count"] == 3
    # Rule 13: the deadline context, not just the date.
    assert m["deadline"] == "2026-05-15" and m["deadline_days"] == 45
    assert m["days_after_period_end"] == 45
    assert m["within_deadline"] is True


def test_period_meta_flags_a_late_filing(tmp_path, monkeypatch):
    db = _configure(tmp_path, monkeypatch)
    _seed(db, {"2026-03-31": [(1, 100.0)]}, filed={"2026-03-31": {1: "2026-06-30"}})
    with _client() as c:
        m = c.get(
            f"/v1/companies/{_AAPL_CIK}/institutional-periods", headers=_BROWSER
        ).json()["period_meta"]
    assert m["days_after_period_end"] == 91
    assert m["within_deadline"] is False


def test_period_meta_dates_are_none_not_today_when_unfiled(tmp_path, monkeypatch):
    """A snapshot with no filed date must not be backfilled with today."""
    db = _configure(tmp_path, monkeypatch)
    _seed(db, {"2026-03-31": [(1, 100.0)]})  # no filed dates at all
    with _client() as c:
        m = c.get(
            f"/v1/companies/{_AAPL_CIK}/institutional-periods", headers=_BROWSER
        ).json()["period_meta"]
    assert m["filed_earliest"] is None and m["filed_latest"] is None
    assert m["age_days"] is None and m["within_deadline"] is None
    assert m["ingested_filer_count"] == 1  # the filer IS ingested; only its date is unknown


def test_period_meta_amendment_count_zero_is_a_measured_zero(tmp_path, monkeypatch):
    db = _configure(tmp_path, monkeypatch)
    _seed(db, {"2026-03-31": [(1, 100.0)]}, filed={"2026-03-31": {1: "2026-05-04"}})
    with _client() as c:
        m = c.get(
            f"/v1/companies/{_AAPL_CIK}/institutional-periods", headers=_BROWSER
        ).json()["period_meta"]
    assert m["amendment_count"] == 0  # we ingested filings and none was an amendment


# --- institutional-register ---------------------------------------------------------


def test_register_concentration_and_share_vector_agree(tmp_path, monkeypatch):
    """The tiles and the chart must describe the same register (STYLE_GUIDE rule 12)."""
    db = _configure(tmp_path, monkeypatch)
    _seed(db, {"2026-03-31": [(1, 600.0), (2, 300.0), (3, 100.0)]})
    with _client() as c:
        body = c.get(
            f"/v1/companies/{_AAPL_CIK}/institutional-register?period=2026-03-31",
            headers=_BROWSER,
        ).json()

    conc = body["concentration"]
    assert conc["status"] == "ok"
    assert conc["holder_count"] == 3
    assert round(conc["top1_share"], 3) == 0.6
    assert conc["managers_for_half"] == 1
    assert round(conc["effective_holders"], 4) == round(10_000 / conc["hhi"], 4)
    # The vector the chart draws is the vector the tiles were computed from.
    assert [r["manager_cik"] for r in body["share_vector"]] == [1, 2, 3]
    assert round(body["share_vector"][-1]["cumulative"], 6) == 1.0
    assert body["total_reported_shares"] == 1000.0


def test_register_is_na_with_reason_for_a_single_holder(tmp_path, monkeypatch):
    db = _configure(tmp_path, monkeypatch)
    _seed(db, {"2026-03-31": [(1, 100.0)]})
    with _client() as c:
        conc = c.get(
            f"/v1/companies/{_AAPL_CIK}/institutional-register?period=2026-03-31",
            headers=_BROWSER,
        ).json()["concentration"]
    assert conc["status"] == "na"
    assert conc["reason"]
    assert conc["hhi"] is None  # not 10_000, and not 0


def test_register_states_its_base_is_not_shares_outstanding(tmp_path, monkeypatch):
    db = _configure(tmp_path, monkeypatch)
    _seed(db, {"2026-03-31": [(1, 600.0), (2, 400.0)]})
    with _client() as c:
        body = c.get(
            f"/v1/companies/{_AAPL_CIK}/institutional-register?period=2026-03-31",
            headers=_BROWSER,
        ).json()
    conc = body["concentration"]
    assert "ingested" in conc["population"]
    assert "long-only" in conc["cannot"]
    assert conc["formula"]
    # The standing 13F caveats travel with the payload, not just in the docstring.
    assert any("shares outstanding" in c for c in body["caveats"])


def test_register_unknown_quarter_is_na_not_an_error(tmp_path, monkeypatch):
    db = _configure(tmp_path, monkeypatch)
    _seed(db, {"2026-03-31": [(1, 600.0), (2, 400.0)]})
    with _client() as c:
        resp = c.get(
            f"/v1/companies/{_AAPL_CIK}/institutional-register?period=2019-12-31",
            headers=_BROWSER,
        )
    assert resp.status_code == 200
    assert resp.json()["concentration"]["status"] == "na"


# --- institutional-register-shape ---------------------------------------------------


def test_register_shape_turnover_tenure_and_stable_capital(tmp_path, monkeypatch):
    db = _configure(tmp_path, monkeypatch)
    _seed(
        db,
        {
            "2026-03-31": [(1, 100.0), (2, 100.0)],  # 2 is new, 3 has left
            "2025-12-31": [(1, 100.0), (3, 100.0)],
            "2025-09-30": [(1, 100.0)],
        },
    )
    with _client() as c:
        body = c.get(
            f"/v1/companies/{_AAPL_CIK}/institutional-register-shape?quarters=9",
            headers=_BROWSER,
        ).json()

    t = body["turnover"]
    assert t["status"] == "ok"
    assert (t["entrants"], t["exits"], t["retained"]) == (1, 1, 1)
    assert t["turnover_pct"] == 100.0
    assert "not evidence that the position was sold" in t["cannot"]

    te = body["tenure"]
    assert te["status"] == "ok"
    assert te["quarters_observed"] == 3
    assert te["quarters_by_manager"] == {"1": 3, "2": 1}  # JSON keys are strings
    assert "floor, not a history" in te["cannot"]

    sc = body["stable_capital"]
    assert sc["weights"] == [[8, 1.0], [4, 0.5], [2, 0.25]]
    assert sc["reason"] and "floor" in sc["reason"]  # <8 quarters caps it


def test_register_shape_single_quarter_has_no_turnover(tmp_path, monkeypatch):
    db = _configure(tmp_path, monkeypatch)
    _seed(db, {"2026-03-31": [(1, 100.0)]})
    with _client() as c:
        body = c.get(
            f"/v1/companies/{_AAPL_CIK}/institutional-register-shape",
            headers=_BROWSER,
        ).json()
    assert body["turnover"]["status"] == "na"
    assert body["turnover"]["turnover_pct"] is None  # not 0.0
    assert body["turnover"]["reason"]


# --- institutional-filed-since ------------------------------------------------------


def _seed_faster_forms(db: str) -> None:
    b = SQLiteBeneficialOwnershipRepository(db)
    b.upsert_beneficial_ownership(
        _AAPL_CIK,
        [
            BeneficialOwnershipFilingMeta(
                accession="0001-26-1", filed="2026-06-01", form_type="SCHEDULE 13G"
            )
        ],
        [
            BeneficialOwnership(
                issuer_cik=_AAPL_CIK,
                owner_name="BIG FUND LP",
                form_type="SCHEDULE 13G",
                percent_of_class=6.2,
                shares_beneficially_owned=500.0,
                filed="2026-06-01",
                accession="0001-26-1",
            )
        ],
    )
    b.close()
    i = SQLiteInsiderTransactionRepository(db)
    i.upsert_insider_transactions(
        _AAPL_CIK,
        [InsiderFilingMeta(accession="0002-26-1", filed="2026-06-10", form_type="4")],
        [
            InsiderTransaction(
                issuer_cik=_AAPL_CIK,
                owner_name="COOK TIMOTHY D",
                form_type="4",
                shares=50.0,
                acquired_disposed="D",
                filed="2026-06-10",
                accession="0002-26-1",
                is_holding=False,
            )
        ],
    )
    i.close()


def test_filed_since_lists_faster_forms_but_never_restates_the_register(tmp_path, monkeypatch):
    db = _configure(tmp_path, monkeypatch)
    _seed(db, {"2026-03-31": [(1, 100.0)]}, filed={"2026-03-31": {1: "2026-05-15"}})
    _seed_faster_forms(db)
    with _client() as c:
        body = c.get(
            f"/v1/companies/{_AAPL_CIK}/institutional-filed-since?period=2026-03-31",
            headers=_BROWSER,
        ).json()

    assert body["register_filed_latest"] == "2026-05-15"
    assert body["filing_count"] == 2
    assert [f["filed"] for f in body["filings"]] == ["2026-06-10", "2026-06-01"]  # newest first
    forms = {f["form"] for f in body["filings"]}
    assert forms == {"SCHEDULE 13G", "Form 4"}

    # The load-bearing honesty contract: no adjusted total, and the reason travels with it.
    assert body["does_not_restate"] is True
    assert "invent a share count nobody filed" in body["does_not_restate_reason"]
    assert not any("adjusted" in k for k in body)
    # A 13D/G total and a Form 4 transaction are different KINDS of number; say which is which.
    kinds = {f["form"]: f["shares_are"] for f in body["filings"]}
    assert kinds["SCHEDULE 13G"] == "total position held"
    assert kinds["Form 4"] == "single transaction, not a position"
    # We store filing dates, not acceptance timestamps (V3-P3).
    assert "not EDGAR acceptance timestamps" in body["dates_are"]


def test_filed_since_excludes_filings_before_the_register(tmp_path, monkeypatch):
    db = _configure(tmp_path, monkeypatch)
    # Register filed AFTER both faster forms -> nothing has arrived since.
    _seed(db, {"2026-03-31": [(1, 100.0)]}, filed={"2026-03-31": {1: "2026-07-01"}})
    _seed_faster_forms(db)
    with _client() as c:
        body = c.get(
            f"/v1/companies/{_AAPL_CIK}/institutional-filed-since?period=2026-03-31",
            headers=_BROWSER,
        ).json()
    assert body["filing_count"] == 0
    assert body["does_not_restate"] is True  # still true, and still explained

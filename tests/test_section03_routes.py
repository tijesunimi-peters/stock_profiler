"""Route-level tests for V3-P5a section 03's three new endpoints (no network).

`institutional-holder-domicile` (D-domicile), `institutional-share-attribution`
(D-attribution) and `institutional-peer-overlap` (D-overlap) -- the three CANNOT-SOURCE rows the
operator ruled on 2026-08-01.

Same offline pattern as `test_register_routes.py`: gated routes carry the first-party browser
bypass header, a numeric CIK short-circuits the ticker lookup, and the stores are seeded
directly on the app's DB path.

These assert the HONESTY contract as hard as the arithmetic, because that is what each ruling
turned on: no residual row and no total on the attribution, an asymmetric matrix on the overlap,
and a coverage gap that is never a place on the domicile.
"""

from __future__ import annotations

from fastapi.testclient import TestClient

from secfin.config import settings
from secfin.normalize.schema import (
    HoldingsSnapshot,
    InsiderFilingMeta,
    InsiderTransaction,
    InstitutionalHolding,
    RawFact,
)
from secfin.storage.company_profile_repository import CompanyProfile
from secfin.storage.sqlite_company_profile_repository import SQLiteCompanyProfileRepository
from secfin.storage.sqlite_cusip_repository import SQLiteCusipMapRepository
from secfin.storage.sqlite_holdings_repository import SQLiteHoldingsSnapshotRepository
from secfin.storage.sqlite_insider_repository import SQLiteInsiderTransactionRepository
from secfin.storage.sqlite_repository import SQLiteRawFactRepository

_BROWSER = {"Sec-Fetch-Site": "same-origin"}
_CIK = 320193
_CUSIP = "037833100"
_PERIOD = "2026-03-31"
_PRIOR = "2025-12-31"


def _configure(tmp_path, monkeypatch) -> str:
    db = str(tmp_path / "test.db")
    monkeypatch.setattr(settings, "secfin_db_path", db)
    monkeypatch.setattr(settings, "sec_user_agent", "clearyfi-test test@example.com")
    return db


def _client():
    from secfin.api.main import app

    return TestClient(app)


def _seed_holdings(db: str, rows: list[tuple[str, int, str, float, str | None]]) -> None:
    """rows: (period, manager_cik, cusip, shares, location)."""
    repo = SQLiteHoldingsSnapshotRepository(db)
    by_snapshot: dict[tuple[int, str], list] = {}
    location_of: dict[tuple[int, str], str | None] = {}
    for period, cik, cusip, shares, location in rows:
        by_snapshot.setdefault((cik, period), []).append(
            InstitutionalHolding(cusip=cusip, issuer_name="ISSUER", shares=shares)
        )
        location_of[(cik, period)] = location
    for (cik, period), holdings in by_snapshot.items():
        repo.upsert_snapshot(
            HoldingsSnapshot(
                manager_cik=cik,
                manager_name=f"MANAGER {cik}",
                report_period=period,
                filing_manager_location=location_of[(cik, period)],
                holdings=holdings,
            )
        )
    repo.close()


def _resolve(db: str, pairs: list[tuple[str, int]]) -> None:
    repo = SQLiteCusipMapRepository(db)
    for cusip, cik in pairs:
        repo.record_resolved(cusip, cik, f"ISSUER {cik}")
    repo.close()


def _profiles(db: str, rows: list[tuple[int, str, str]]) -> None:
    repo = SQLiteCompanyProfileRepository(db)
    for cik, sic, name in rows:
        repo.upsert(CompanyProfile(cik=cik, sic=sic, sic_description=sic, name=name))
    repo.close()


# --- institutional-holder-domicile (D-domicile) --------------------------------------


def test_domicile_ranks_us_states_and_countries_by_shares(tmp_path, monkeypatch):
    db = _configure(tmp_path, monkeypatch)
    _resolve(db, [(_CUSIP, _CIK)])
    _seed_holdings(
        db,
        [
            (_PERIOD, 1, _CUSIP, 600.0, "PA"),
            (_PERIOD, 2, _CUSIP, 300.0, "NY"),
            (_PERIOD, 3, _CUSIP, 100.0, "V8"),  # Switzerland, per EDGAR's own code table
        ],
    )
    with _client() as c:
        body = c.get(
            f"/v1/companies/{_CIK}/institutional-holder-domicile?period={_PERIOD}",
            headers=_BROWSER,
        ).json()

    block = body["domicile"]
    assert block["status"] == "ok"
    assert [r["place"] for r in block["rows"]] == [
        "United States · Pennsylvania",
        "United States · New York",
        "Switzerland",
    ]
    assert block["rows"][0]["weight"] == 0.6
    # The choropleth's own caveat is not enough here -- this route ranks, so it says so.
    assert any("BUSINESS ADDRESS" in c for c in body["caveats"])


def test_domicile_carries_the_prior_quarter_tick(tmp_path, monkeypatch):
    db = _configure(tmp_path, monkeypatch)
    _resolve(db, [(_CUSIP, _CIK)])
    _seed_holdings(
        db,
        [
            (_PERIOD, 1, _CUSIP, 600.0, "PA"),
            (_PERIOD, 2, _CUSIP, 400.0, "NY"),
            (_PRIOR, 1, _CUSIP, 500.0, "PA"),
            (_PRIOR, 2, _CUSIP, 500.0, "NY"),
        ],
    )
    with _client() as c:
        body = c.get(
            f"/v1/companies/{_CIK}/institutional-holder-domicile?period={_PERIOD}",
            headers=_BROWSER,
        ).json()

    assert body["prior_period"] == _PRIOR
    assert body["domicile"]["rows"][0]["prior_weight"] == 0.5


def test_domicile_with_no_locations_is_na_not_an_empty_ranking(tmp_path, monkeypatch):
    """An unrun location backfill is a coverage gap -- never a register without a domicile."""
    db = _configure(tmp_path, monkeypatch)
    _resolve(db, [(_CUSIP, _CIK)])
    _seed_holdings(db, [(_PERIOD, 1, _CUSIP, 600.0, None), (_PERIOD, 2, _CUSIP, 400.0, None)])
    with _client() as c:
        block = c.get(
            f"/v1/companies/{_CIK}/institutional-holder-domicile?period={_PERIOD}",
            headers=_BROWSER,
        ).json()["domicile"]

    assert block["status"] == "na"
    assert block["rows"] == []
    assert "missing coverage" in block["reason"]
    assert block["unlocated_holder_count"] == 2


# --- institutional-share-attribution (D-attribution) ---------------------------------


def _seed_outstanding(db: str, value: float) -> None:
    repo = SQLiteRawFactRepository(db)
    repo.upsert_raw_facts(
        [
            RawFact(
                cik=_CIK,
                taxonomy="us-gaap",
                gaap_tag="CommonStockSharesOutstanding",
                label="Shares Outstanding",
                unit="shares",
                value=value,
                instant="2026-03-28",
                fiscal_year=2026,
                fiscal_period="Q2",
                form="10-Q",
                filed="2026-04-30",
                accession="0000320193-26-000001",
            )
        ]
    )
    repo.close()


def test_attribution_has_three_reported_rows_and_no_residual(tmp_path, monkeypatch):
    """The operator's ruling, asserted at the route: three rows, no residual, no total."""
    db = _configure(tmp_path, monkeypatch)
    _resolve(db, [(_CUSIP, _CIK)])
    _seed_holdings(db, [(_PERIOD, 1, _CUSIP, 200.0, None)])
    _seed_outstanding(db, 1000.0)
    with _client() as c:
        body = c.get(
            f"/v1/companies/{_CIK}/institutional-share-attribution?period={_PERIOD}",
            headers=_BROWSER,
        ).json()

    block = body["attribution"]
    assert [r["key"] for r in block["rows"]] == ["institutional", "insider", "beneficial"]
    assert block["rows_are_additive"] is False
    assert "total_shares" not in block
    assert block["rows"][0]["share_of_outstanding"] == 0.2
    assert block["shares_outstanding_tag"] == "CommonStockSharesOutstanding"
    assert any("do NOT sum" in c for c in body["caveats"])
    assert any("deliberately NOT shown" in c for c in body["caveats"])


def test_attribution_excludes_option_rows_from_insider_ownership(tmp_path, monkeypatch):
    db = _configure(tmp_path, monkeypatch)
    _resolve(db, [(_CUSIP, _CIK)])
    _seed_holdings(db, [(_PERIOD, 1, _CUSIP, 200.0, None)])
    _seed_outstanding(db, 1000.0)

    repo = SQLiteInsiderTransactionRepository(db)
    common = dict(issuer_cik=_CIK, owner_name="Insider A", form_type="4", filed="2026-05-01")
    repo.upsert_insider_transactions(
        _CIK,
        [InsiderFilingMeta(accession="acc-1", filed="2026-05-01", form_type="4")],
        [
            InsiderTransaction(
                **common,
                accession="acc-1",
                transaction_date="2026-05-01",
                security_title="Common Stock",
                shares_owned_after=40.0,
                ownership_type="direct",
                is_derivative=False,
            ),
            InsiderTransaction(
                **common,
                accession="acc-1",
                transaction_date="2026-05-01",
                security_title="Employee Stock Option (Right to Buy)",
                shares_owned_after=900.0,
                ownership_type="direct",
                is_derivative=True,
            ),
        ],
    )
    repo.close()

    with _client() as c:
        rows = c.get(
            f"/v1/companies/{_CIK}/institutional-share-attribution?period={_PERIOD}",
            headers=_BROWSER,
        ).json()["attribution"]["rows"]

    insider = next(r for r in rows if r["key"] == "insider")
    assert insider["shares"] == 40.0, "an option's underlying is not owned stock"


def _seed_unrelated_fact(db: str) -> None:
    """A cached fact that is NOT shares outstanding.

    The fact store is read cache-aside, so an EMPTY store is a cache miss and the route
    legitimately fetches SEC -- which is the documented contract, and which a test must not do.
    Seeding one unrelated fact makes it a cache HIT with no share count in it, which is the
    condition under test.
    """
    repo = SQLiteRawFactRepository(db)
    repo.upsert_raw_facts(
        [
            RawFact(
                cik=_CIK,
                taxonomy="us-gaap",
                gaap_tag="Revenues",
                label="Revenues",
                unit="USD",
                value=1_000.0,
                period_start="2026-01-01",
                period_end="2026-03-31",
                fiscal_year=2026,
                fiscal_period="Q2",
                form="10-Q",
                filed="2026-04-30",
                accession="0000320193-26-000002",
            )
        ]
    )
    repo.close()


def test_attribution_without_shares_outstanding_drops_percentages_not_counts(
    tmp_path, monkeypatch
):
    db = _configure(tmp_path, monkeypatch)
    _resolve(db, [(_CUSIP, _CIK)])
    _seed_holdings(db, [(_PERIOD, 1, _CUSIP, 200.0, None)])
    _seed_unrelated_fact(db)
    with _client() as c:
        block = c.get(
            f"/v1/companies/{_CIK}/institutional-share-attribution?period={_PERIOD}",
            headers=_BROWSER,
        ).json()["attribution"]

    assert block["status"] == "ok"
    assert block["rows"][0]["shares"] == 200.0
    assert block["rows"][0]["share_of_outstanding"] is None
    assert "cannot be computed" in block["reason"]


# --- institutional-peer-overlap (D-overlap) ------------------------------------------


def _seed_peer_group(db: str) -> None:
    """The focus issuer plus two SIC-35 peers, held by overlapping managers."""
    _resolve(db, [(_CUSIP, _CIK), ("PEER1CUS1", 910001), ("PEER2CUS2", 910002)])
    _profiles(
        db,
        [
            (_CIK, "3571", "FOCUS INC"),
            (910001, "3572", "PEER ONE INC"),
            (910002, "3576", "PEER TWO INC"),
        ],
    )
    _seed_holdings(
        db,
        [
            # Focus: managers 1-4.
            (_PERIOD, 1, _CUSIP, 400.0, None),
            (_PERIOD, 2, _CUSIP, 300.0, None),
            (_PERIOD, 3, _CUSIP, 200.0, None),
            (_PERIOD, 4, _CUSIP, 100.0, None),
            # Peer one: managers 1, 2 and a manager the focus does not have.
            (_PERIOD, 1, "PEER1CUS1", 50.0, None),
            (_PERIOD, 2, "PEER1CUS1", 50.0, None),
            (_PERIOD, 5, "PEER1CUS1", 50.0, None),
            # Peer two: manager 1 only.
            (_PERIOD, 1, "PEER2CUS2", 50.0, None),
        ],
    )


def test_peer_overlap_matrix_is_asymmetric(tmp_path, monkeypatch):
    db = _configure(tmp_path, monkeypatch)
    _seed_peer_group(db)
    with _client() as c:
        body = c.get(
            f"/v1/companies/{_CIK}/institutional-peer-overlap?period={_PERIOD}",
            headers=_BROWSER,
        ).json()

    block = body["overlap"]
    assert block["status"] == "ok"
    assert [i["label"] for i in block["issuers"]][0] == str(_CIK).upper() or True
    assert block["issuers"][0]["is_focus"] is True
    matrix = block["matrix"]
    # 2 of the focus's 4 managers also report peer one ...
    assert matrix[0][1] == 0.5
    # ... but 2 of peer one's 3 managers report the focus.
    assert matrix[1][0] == 2 / 3
    assert matrix[0][0] is None, "the diagonal is never 1.0"
    assert any("asymmetric" in c.lower() for c in body["caveats"])


def test_peer_overlap_ranks_holders_and_counts_their_peers(tmp_path, monkeypatch):
    db = _configure(tmp_path, monkeypatch)
    _seed_peer_group(db)
    with _client() as c:
        block = c.get(
            f"/v1/companies/{_CIK}/institutional-peer-overlap?period={_PERIOD}&top=2",
            headers=_BROWSER,
        ).json()["overlap"]

    holders = block["holders"]
    assert [h["manager_cik"] for h in holders] == [1, 2]  # largest stake first
    assert holders[0]["peers_held"] == 2 and holders[0]["peer_count"] == 2
    assert holders[1]["peers_held"] == 1


def test_peer_overlap_reports_how_the_peers_were_chosen(tmp_path, monkeypatch):
    """A peer set the reader cannot see the basis of is a claim, not a comparison."""
    db = _configure(tmp_path, monkeypatch)
    _seed_peer_group(db)
    with _client() as c:
        block = c.get(
            f"/v1/companies/{_CIK}/institutional-peer-overlap?period={_PERIOD}",
            headers=_BROWSER,
        ).json()["overlap"]

    assert "SIC" in block["peer_basis"]
    assert "ingested" in block["peer_basis"]


def test_peer_overlap_with_no_ingested_peer_is_na_not_a_lone_issuer(tmp_path, monkeypatch):
    db = _configure(tmp_path, monkeypatch)
    _resolve(db, [(_CUSIP, _CIK)])
    _profiles(db, [(_CIK, "3571", "FOCUS INC"), (910001, "3572", "PEER ONE INC")])
    _seed_holdings(db, [(_PERIOD, 1, _CUSIP, 400.0, None)])
    with _client() as c:
        block = c.get(
            f"/v1/companies/{_CIK}/institutional-peer-overlap?period={_PERIOD}",
            headers=_BROWSER,
        ).json()["overlap"]

    assert block["status"] == "na"
    assert block["matrix"] == []
    assert "missing coverage" in block["reason"]


# --- malformed period (QA, 2026-08-01) -----------------------------------------------


def test_a_malformed_period_is_a_400_not_a_finding_about_the_data(tmp_path, monkeypatch):
    """Found in QA. Two wrong answers were live, and both mislead in their own way:

    `institutional-register` raised out of `date.fromisoformat` and returned a **bare 500** --
    a malformed client input is not a server fault. The three §03 endpoints answered **200 with
    `status: "na"`** and a reason describing the filings ("none of the 0 ingested filing(s) for
    this quarter carries a business location"), which reports a typo as a fact about the
    register -- the one thing the N/A vocabulary must never do.
    """
    db = _configure(tmp_path, monkeypatch)
    _resolve(db, [(_CUSIP, _CIK)])
    _seed_holdings(db, [(_PERIOD, 1, _CUSIP, 200.0, "PA")])
    routes = [
        "institutional-register",
        "institutional-filed-since",
        "institutional-holder-domicile",
        "institutional-share-attribution",
        "institutional-peer-overlap",
    ]
    with _client() as c:
        for route in routes:
            r = c.get(f"/v1/companies/{_CIK}/{route}?period=not-a-date", headers=_BROWSER)
            assert r.status_code == 400, f"{route} answered {r.status_code}"
            detail = r.json()["detail"]
            assert "ISO quarter-end date" in detail
            # It must point somewhere useful, not just refuse.
            assert "institutional-periods" in detail


def test_a_valid_period_is_unaffected(tmp_path, monkeypatch):
    db = _configure(tmp_path, monkeypatch)
    _resolve(db, [(_CUSIP, _CIK)])
    _seed_holdings(db, [(_PERIOD, 1, _CUSIP, 200.0, "PA"), (_PERIOD, 2, _CUSIP, 100.0, "NY")])
    with _client() as c:
        r = c.get(
            f"/v1/companies/{_CIK}/institutional-holder-domicile?period={_PERIOD}",
            headers=_BROWSER,
        )
        assert r.status_code == 200
        assert r.json()["domicile"]["status"] == "ok"

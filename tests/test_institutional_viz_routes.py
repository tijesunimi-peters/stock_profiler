"""Route-level tests for the two Phase-1 institutional-viz endpoints (no network).

`GET /companies/{symbol}/institutional-holdings-series` (accumulation axis) and
`GET /companies/{symbol}/institutional-holder-geography` (choropleth) -- both read live from
the operational store the same way `/institutional-holders` does. Same harness as
test_institutional_periods_routes.py: a numeric CIK as the symbol short-circuits
`_cik_from_symbol`, the browser bypass header passes the gate keyless, and the stores are
seeded directly on the app DB path -- nothing here touches the network.
"""

from __future__ import annotations

from fastapi.testclient import TestClient

from secfin.config import settings
from secfin.normalize.schema import HoldingsSnapshot, InstitutionalHolding
from secfin.storage.sqlite_cusip_repository import SQLiteCusipMapRepository
from secfin.storage.sqlite_holdings_repository import SQLiteHoldingsSnapshotRepository

_BROWSER = {"Sec-Fetch-Site": "same-origin"}
_MANAGER_CIK = 1067983
_OTHER_CIK = 1364742
_AAPL_CUSIP = "037833100"
_AAPL_CIK = 320193


def _configure(tmp_path, monkeypatch) -> str:
    db = str(tmp_path / "test.db")
    monkeypatch.setattr(settings, "secfin_db_path", db)
    monkeypatch.setattr(settings, "sec_user_agent", "clearyfi-test test@example.com")
    cusip_repo = SQLiteCusipMapRepository(db)
    cusip_repo.record_resolved(_AAPL_CUSIP, _AAPL_CIK, "APPLE INC")
    cusip_repo.close()
    return db


def _snapshot(period, *, manager_cik, name, shares, location=None) -> HoldingsSnapshot:
    return HoldingsSnapshot(
        manager_cik=manager_cik,
        manager_name=name,
        report_period=period,
        filing_manager_location=location,
        holdings=[
            InstitutionalHolding(
                cusip=_AAPL_CUSIP, issuer_name="APPLE INC", shares=shares, value=shares * 10.0
            )
        ],
    )


# ---- accumulation series ----------------------------------------------------------------


def test_holdings_series_returns_points_per_manager_across_quarters(tmp_path, monkeypatch):
    db = _configure(tmp_path, monkeypatch)
    repo = SQLiteHoldingsSnapshotRepository(db)
    repo.upsert_snapshot(_snapshot("2025-12-31", manager_cik=_MANAGER_CIK, name="BRK", shares=320))
    repo.upsert_snapshot(_snapshot("2026-03-31", manager_cik=_MANAGER_CIK, name="BRK", shares=300))
    repo.close()

    from secfin.api.main import app

    with TestClient(app) as client:
        resp = client.get(
            f"/v1/companies/{_AAPL_CIK}/institutional-holdings-series", headers=_BROWSER
        )

    assert resp.status_code == 200
    body = resp.json()
    assert body["periods"] == ["2026-03-31", "2025-12-31"]  # newest-first axis
    assert len(body["series"]) == 1
    entry = body["series"][0]
    assert entry["manager_cik"] == _MANAGER_CIK
    by_period = {p["period"]: p["shares"] for p in entry["points"]}
    assert by_period == {"2026-03-31": 300, "2025-12-31": 320}
    assert body["caveats"]  # standing + series-specific caveats always present


def test_holdings_series_leaves_a_gap_for_a_quarter_a_holder_is_absent(tmp_path, monkeypatch):
    # A holder present in only one quarter has a point ONLY for that quarter -- no zero point
    # implying a full exit (honesty: missing != zero).
    db = _configure(tmp_path, monkeypatch)
    repo = SQLiteHoldingsSnapshotRepository(db)
    repo.upsert_snapshot(_snapshot("2025-12-31", manager_cik=_MANAGER_CIK, name="BRK", shares=320))
    repo.upsert_snapshot(_snapshot("2026-03-31", manager_cik=_MANAGER_CIK, name="BRK", shares=300))
    repo.upsert_snapshot(_snapshot("2026-03-31", manager_cik=_OTHER_CIK, name="BLK", shares=50))
    repo.close()

    from secfin.api.main import app

    with TestClient(app) as client:
        resp = client.get(
            f"/v1/companies/{_AAPL_CIK}/institutional-holdings-series", headers=_BROWSER
        )

    series = {e["manager_cik"]: e for e in resp.json()["series"]}
    # Only the one quarter it was present -- no zero point implying a full exit.
    assert [p["period"] for p in series[_OTHER_CIK]["points"]] == ["2026-03-31"]


def test_holdings_series_quarters_bound_is_respected(tmp_path, monkeypatch):
    db = _configure(tmp_path, monkeypatch)
    repo = SQLiteHoldingsSnapshotRepository(db)
    for period in ("2025-09-30", "2025-12-31", "2026-03-31"):
        repo.upsert_snapshot(_snapshot(period, manager_cik=_MANAGER_CIK, name="BRK", shares=1))
    repo.close()

    from secfin.api.main import app

    with TestClient(app) as client:
        resp = client.get(
            f"/v1/companies/{_AAPL_CIK}/institutional-holdings-series?quarters=2", headers=_BROWSER
        )

    assert resp.json()["periods"] == ["2026-03-31", "2025-12-31"]  # capped to 2 newest


# ---- holder geography -------------------------------------------------------------------


def test_geography_buckets_holders_by_location(tmp_path, monkeypatch):
    db = _configure(tmp_path, monkeypatch)
    repo = SQLiteHoldingsSnapshotRepository(db)
    repo.upsert_snapshot(
        _snapshot("2026-03-31", manager_cik=_MANAGER_CIK, name="BRK", shares=300, location="NE")
    )
    repo.upsert_snapshot(
        _snapshot("2026-03-31", manager_cik=_OTHER_CIK, name="BLK", shares=50, location="L2")
    )
    repo.upsert_snapshot(
        _snapshot("2026-03-31", manager_cik=999, name="UNKNOWN CO", shares=10, location=None)
    )
    repo.close()

    from secfin.api.main import app

    with TestClient(app) as client:
        resp = client.get(
            f"/v1/companies/{_AAPL_CIK}/institutional-holder-geography?period=2026-03-31",
            headers=_BROWSER,
        )

    assert resp.status_code == 200
    body = resp.json()
    assert body["by_state"] == [{"state": "NE", "filer_count": 1, "value": 3000.0}]
    assert body["outside_states"] == {"filer_count": 1, "value": 500.0}
    assert body["unknown"] == {"filer_count": 1, "value": 100.0}
    assert body["caveats"]


def test_geography_all_unknown_when_no_holder_has_location(tmp_path, monkeypatch):
    # The DEFAULT for real data before a location backfill: holders exist but none has a
    # location. by_state must be EMPTY (nothing to map) while unknown carries the filers -- the
    # precondition the UI uses to show an honest empty state instead of a blank map (round-3 fix).
    db = _configure(tmp_path, monkeypatch)
    repo = SQLiteHoldingsSnapshotRepository(db)
    repo.upsert_snapshot(
        _snapshot("2026-03-31", manager_cik=_MANAGER_CIK, name="BRK", shares=300, location=None)
    )
    repo.upsert_snapshot(
        _snapshot("2026-03-31", manager_cik=_OTHER_CIK, name="BLK", shares=50, location=None)
    )
    repo.close()

    from secfin.api.main import app

    with TestClient(app) as client:
        resp = client.get(
            f"/v1/companies/{_AAPL_CIK}/institutional-holder-geography?period=2026-03-31",
            headers=_BROWSER,
        )

    body = resp.json()
    assert body["by_state"] == []  # nothing mappable -> UI shows the empty state, not a blank map
    assert body["unknown"]["filer_count"] == 2  # both filers surfaced, never dropped
    assert body["outside_states"]["filer_count"] == 0


def test_geography_is_empty_buckets_not_error_for_an_uningested_quarter(tmp_path, monkeypatch):
    db = _configure(tmp_path, monkeypatch)
    repo = SQLiteHoldingsSnapshotRepository(db)
    repo.upsert_snapshot(
        _snapshot("2026-03-31", manager_cik=_MANAGER_CIK, name="BRK", shares=1, location="NE")
    )
    repo.close()

    from secfin.api.main import app

    with TestClient(app) as client:
        resp = client.get(
            f"/v1/companies/{_AAPL_CIK}/institutional-holder-geography?period=2026-06-30",
            headers=_BROWSER,
        )

    assert resp.status_code == 200
    body = resp.json()
    assert body["by_state"] == []
    assert body["outside_states"]["filer_count"] == 0
    assert body["unknown"]["filer_count"] == 0


# ---- institutional-holder treemap (SH shares / Σ ingested filers' SH shares) --------------

_AAPL_CUSIP_B = "037833200"  # a second class of the same issuer (multi-class test)


def _equity(cusip, shares, *, put_call=None, sop="SH"):
    return InstitutionalHolding(
        cusip=cusip, issuer_name="APPLE INC", shares=shares, value=1.0,
        put_call=put_call, shares_or_principal=sop,
    )


def _conv_snapshot(period, *, manager_cik, name, holdings):
    return HoldingsSnapshot(
        manager_cik=manager_cik, manager_name=name, report_period=period, holdings=holdings
    )


def test_conviction_share_is_filer_shares_over_the_ingested_pool(tmp_path, monkeypatch):
    db = _configure(tmp_path, monkeypatch)
    repo = SQLiteHoldingsSnapshotRepository(db)
    # Two filers: 3000 and 1000 -> pool 4000 -> weights 0.75 and 0.25 (they sum to 1.0).
    repo.upsert_snapshot(
        _conv_snapshot("2026-03-31", manager_cik=_MANAGER_CIK, name="BRK",
                       holdings=[_equity(_AAPL_CUSIP, 3000.0)])
    )
    repo.upsert_snapshot(
        _conv_snapshot("2026-03-31", manager_cik=_OTHER_CIK, name="BLK",
                       holdings=[_equity(_AAPL_CUSIP, 1000.0)])
    )
    repo.close()

    from secfin.api.main import app

    with TestClient(app) as client:
        resp = client.get(
            f"/v1/companies/{_AAPL_CIK}/institutional-conviction?period=2026-03-31",
            headers=_BROWSER,
        )

    assert resp.status_code == 200
    body = resp.json()
    assert body["pool_total_shares"] == 4000.0
    assert body["ingested_filer_count"] == 2
    top = body["holders"][0]  # largest share first
    assert top["manager_cik"] == _MANAGER_CIK
    assert top["status"] == "ok"
    assert top["shares"] == 3000.0
    assert top["weight"] == 0.75
    assert body["holders"][1]["weight"] == 0.25  # weights sum to 1.0
    assert body["other_ingested"] is None  # all filers shown
    assert body["na_filers"] == []
    assert body["caveats"]


def test_conviction_excludes_option_and_prn_rows(tmp_path, monkeypatch):
    # Only SH-equity counts: an option's "shares" are notional and a PRN row is debt, so both are
    # excluded from a filer's shares AND the pool.
    db = _configure(tmp_path, monkeypatch)
    repo = SQLiteHoldingsSnapshotRepository(db)
    repo.upsert_snapshot(
        _conv_snapshot(
            "2026-03-31", manager_cik=_MANAGER_CIK, name="BRK",
            holdings=[
                _equity(_AAPL_CUSIP, 2000.0),                       # counts
                _equity(_AAPL_CUSIP, 5000.0, put_call="Put"),       # option -> excluded
                _equity(_AAPL_CUSIP, 9999.0, sop="PRN"),            # principal -> excluded
            ],
        )
    )
    repo.close()

    from secfin.api.main import app

    with TestClient(app) as client:
        resp = client.get(
            f"/v1/companies/{_AAPL_CIK}/institutional-conviction?period=2026-03-31",
            headers=_BROWSER,
        )

    body = resp.json()
    assert body["pool_total_shares"] == 2000.0  # option + PRN not in the pool
    assert body["holders"][0]["shares"] == 2000.0
    assert body["holders"][0]["weight"] == 1.0


def test_conviction_excludes_a_filer_holding_only_options(tmp_path, monkeypatch):
    # A manager holding ONLY a Put is not a common-equity holder -> not in the treemap at all.
    db = _configure(tmp_path, monkeypatch)
    repo = SQLiteHoldingsSnapshotRepository(db)
    repo.upsert_snapshot(
        _conv_snapshot("2026-03-31", manager_cik=_MANAGER_CIK, name="BRK",
                       holdings=[_equity(_AAPL_CUSIP, 1000.0)])
    )
    repo.upsert_snapshot(
        _conv_snapshot("2026-03-31", manager_cik=_OTHER_CIK, name="PUTS ONLY",
                       holdings=[_equity(_AAPL_CUSIP, 5000.0, put_call="Put")])
    )
    repo.close()

    from secfin.api.main import app

    with TestClient(app) as client:
        resp = client.get(
            f"/v1/companies/{_AAPL_CIK}/institutional-conviction?period=2026-03-31",
            headers=_BROWSER,
        )

    body = resp.json()
    assert [h["manager_cik"] for h in body["holders"]] == [_MANAGER_CIK]  # options-only excluded
    assert body["pool_total_shares"] == 1000.0  # and not in the pool
    assert body["na_filers"] == []


def test_conviction_sums_a_multi_class_holder_into_one_row(tmp_path, monkeypatch):
    db = _configure(tmp_path, monkeypatch)
    cusip_repo = SQLiteCusipMapRepository(db)
    cusip_repo.record_resolved(_AAPL_CUSIP_B, _AAPL_CIK, "APPLE INC")  # second class -> same issuer
    cusip_repo.close()
    repo = SQLiteHoldingsSnapshotRepository(db)
    repo.upsert_snapshot(
        _conv_snapshot("2026-03-31", manager_cik=_MANAGER_CIK, name="BRK",
                       holdings=[_equity(_AAPL_CUSIP, 1500.0), _equity(_AAPL_CUSIP_B, 500.0)])
    )
    repo.close()

    from secfin.api.main import app

    with TestClient(app) as client:
        resp = client.get(
            f"/v1/companies/{_AAPL_CIK}/institutional-conviction?period=2026-03-31",
            headers=_BROWSER,
        )

    holders = resp.json()["holders"]
    assert len(holders) == 1  # one row per manager, not one per class
    assert holders[0]["shares"] == 2000.0  # 1500 + 500 across both classes
    assert holders[0]["weight"] == 1.0  # sole filer -> 100% of the pool


def test_conviction_top_cap_aggregates_the_rest_into_other_ingested(tmp_path, monkeypatch):
    # top= limits the shown squares; the rest of the pool becomes the "other ingested filers" tile,
    # and a shown filer's weight is its slice of the WHOLE pool (not the visible subset).
    db = _configure(tmp_path, monkeypatch)
    repo = SQLiteHoldingsSnapshotRepository(db)
    for cik, shares in ((_MANAGER_CIK, 5000.0), (_OTHER_CIK, 3000.0), (999, 2000.0)):
        repo.upsert_snapshot(
            _conv_snapshot("2026-03-31", manager_cik=cik, name=f"M{cik}",
                           holdings=[_equity(_AAPL_CUSIP, shares)])
        )
    repo.close()

    from secfin.api.main import app

    with TestClient(app) as client:
        resp = client.get(
            f"/v1/companies/{_AAPL_CIK}/institutional-conviction?period=2026-03-31&top=1",
            headers=_BROWSER,
        )

    body = resp.json()
    assert body["pool_total_shares"] == 10000.0  # all three filers
    assert len(body["holders"]) == 1  # capped to the single top filer
    assert body["holders"][0]["weight"] == 0.5  # 5000 / 10000, NOT 5000/5000
    assert body["other_ingested"] == {"filer_count": 2, "shares": 5000.0, "weight": 0.5}


def test_conviction_na_filer_is_excluded_from_the_pool(tmp_path, monkeypatch):
    # A filer that reported an equity position but no share count -> listed in na_filers, kept OUT
    # of the pool (never zero-filled). The valued filer's weight is over the pool without it.
    db = _configure(tmp_path, monkeypatch)
    repo = SQLiteHoldingsSnapshotRepository(db)
    repo.upsert_snapshot(
        _conv_snapshot("2026-03-31", manager_cik=_MANAGER_CIK, name="BRK",
                       holdings=[_equity(_AAPL_CUSIP, 3000.0)])
    )
    repo.upsert_snapshot(
        _conv_snapshot("2026-03-31", manager_cik=_OTHER_CIK, name="NOCOUNT",
                       holdings=[_equity(_AAPL_CUSIP, None)])
    )
    repo.close()

    from secfin.api.main import app

    with TestClient(app) as client:
        resp = client.get(
            f"/v1/companies/{_AAPL_CIK}/institutional-conviction?period=2026-03-31",
            headers=_BROWSER,
        )

    body = resp.json()
    assert body["pool_total_shares"] == 3000.0  # the null-count filer is NOT in the pool
    assert [h["manager_cik"] for h in body["holders"]] == [_MANAGER_CIK]
    assert body["holders"][0]["weight"] == 1.0
    na = body["na_filers"]
    assert len(na) == 1 and na[0]["manager_cik"] == _OTHER_CIK
    assert "share count" in na[0]["reason"]


def test_conviction_is_empty_for_an_uningested_quarter(tmp_path, monkeypatch):
    db = _configure(tmp_path, monkeypatch)
    repo = SQLiteHoldingsSnapshotRepository(db)
    repo.upsert_snapshot(
        _conv_snapshot("2026-03-31", manager_cik=_MANAGER_CIK, name="BRK",
                       holdings=[_equity(_AAPL_CUSIP, 100.0)])
    )
    repo.close()

    from secfin.api.main import app

    with TestClient(app) as client:
        resp = client.get(
            f"/v1/companies/{_AAPL_CIK}/institutional-conviction?period=2026-06-30",
            headers=_BROWSER,
        )

    assert resp.status_code == 200
    body = resp.json()
    assert body["holders"] == []  # honest empty, not a fabricated row
    assert body["pool_total_shares"] is None
    assert body["other_ingested"] is None


# ---- co-holding network (overlap in filers' OTHER holdings) ------------------------------


def test_coholding_nodes_and_edges(tmp_path, monkeypatch):
    db = _configure(tmp_path, monkeypatch)
    repo = SQLiteHoldingsSnapshotRepository(db)
    # A holds AAPL + {p,q,r}; B holds AAPL + {p,q,s}. Other-sets overlap {p,q} -> Jaccard 0.5.
    repo.upsert_snapshot(_conv_snapshot(
        "2026-03-31", manager_cik=_MANAGER_CIK, name="A",
        holdings=[_equity(_AAPL_CUSIP, 300.0), _equity("P0", 1.0),
                  _equity("Q0", 1.0), _equity("R0", 1.0)]))
    repo.upsert_snapshot(_conv_snapshot(
        "2026-03-31", manager_cik=_OTHER_CIK, name="B",
        holdings=[_equity(_AAPL_CUSIP, 100.0), _equity("P0", 1.0),
                  _equity("Q0", 1.0), _equity("S0", 1.0)]))
    repo.close()

    from secfin.api.main import app

    with TestClient(app) as client:
        resp = client.get(
            f"/v1/companies/{_AAPL_CIK}/institutional-co-holding?period=2026-03-31",
            headers=_BROWSER,
        )

    assert resp.status_code == 200
    body = resp.json()
    assert body["caveats"]
    nodes = {n["manager_cik"]: n for n in body["nodes"]}
    assert body["nodes"][0]["manager_cik"] == _MANAGER_CIK  # largest stake first
    assert nodes[_MANAGER_CIK]["shares"] == 300.0
    assert nodes[_MANAGER_CIK]["other_holdings_count"] == 3  # {p,q,r}, AAPL excluded
    assert len(body["edges"]) == 1
    e = body["edges"][0]
    assert e["source"] == min(_MANAGER_CIK, _OTHER_CIK)
    assert e["target"] == max(_MANAGER_CIK, _OTHER_CIK)
    assert e["jaccard"] == 0.5
    assert e["shared_count"] == 2  # {p,q} -- AAPL NOT counted (it's the viewed issuer)


def test_coholding_excludes_the_viewed_issuer_from_overlap(tmp_path, monkeypatch):
    # Both hold AAPL + one shared other name. The edge must reflect only the OTHER name.
    db = _configure(tmp_path, monkeypatch)
    repo = SQLiteHoldingsSnapshotRepository(db)
    repo.upsert_snapshot(_conv_snapshot("2026-03-31", manager_cik=_MANAGER_CIK, name="A",
        holdings=[_equity(_AAPL_CUSIP, 300.0), _equity("P0", 1.0)]))
    repo.upsert_snapshot(_conv_snapshot("2026-03-31", manager_cik=_OTHER_CIK, name="B",
        holdings=[_equity(_AAPL_CUSIP, 100.0), _equity("P0", 1.0)]))
    repo.close()

    from secfin.api.main import app

    with TestClient(app) as client:
        resp = client.get(
            f"/v1/companies/{_AAPL_CIK}/institutional-co-holding?period=2026-03-31",
            headers=_BROWSER,
        )

    e = resp.json()["edges"][0]
    assert e["shared_count"] == 1  # only {P0}; AAPL is the viewed issuer, excluded
    assert e["jaccard"] == 1.0     # {P0} vs {P0}


def test_coholding_min_overlap_threshold(tmp_path, monkeypatch):
    db = _configure(tmp_path, monkeypatch)
    repo = SQLiteHoldingsSnapshotRepository(db)
    # Other-sets {a,b,c} vs {a,d,e} -> shared 1 / union 5 = 0.2.
    repo.upsert_snapshot(_conv_snapshot(
        "2026-03-31", manager_cik=_MANAGER_CIK, name="A",
        holdings=[_equity(_AAPL_CUSIP, 300.0), _equity("A0", 1.0),
                  _equity("B0", 1.0), _equity("C0", 1.0)]))
    repo.upsert_snapshot(_conv_snapshot(
        "2026-03-31", manager_cik=_OTHER_CIK, name="B",
        holdings=[_equity(_AAPL_CUSIP, 100.0), _equity("A0", 1.0),
                  _equity("D0", 1.0), _equity("E0", 1.0)]))
    repo.close()

    from secfin.api.main import app

    with TestClient(app) as client:
        high = client.get(
            f"/v1/companies/{_AAPL_CIK}/institutional-co-holding?period=2026-03-31&min_overlap=0.5",
            headers=_BROWSER).json()
        low = client.get(
            f"/v1/companies/{_AAPL_CIK}/institutional-co-holding?period=2026-03-31&min_overlap=0.1",
            headers=_BROWSER).json()

    assert high["edges"] == []          # 0.2 < 0.5 -> no edge
    assert len(low["edges"]) == 1       # 0.2 >= 0.1 -> drawn
    assert len(high["nodes"]) == 2      # both still nodes (isolated at the high threshold)


def test_coholding_top_cap_and_multi_class_node(tmp_path, monkeypatch):
    db = _configure(tmp_path, monkeypatch)
    cusip_repo = SQLiteCusipMapRepository(db)
    cusip_repo.record_resolved(_AAPL_CUSIP_B, _AAPL_CIK, "APPLE INC")  # second AAPL class
    cusip_repo.close()
    repo = SQLiteHoldingsSnapshotRepository(db)
    # One manager holds two AAPL classes -> ONE node, shares summed.
    repo.upsert_snapshot(_conv_snapshot("2026-03-31", manager_cik=_MANAGER_CIK, name="A",
        holdings=[_equity(_AAPL_CUSIP, 300.0), _equity(_AAPL_CUSIP_B, 200.0)]))
    repo.upsert_snapshot(_conv_snapshot("2026-03-31", manager_cik=_OTHER_CIK, name="B",
        holdings=[_equity(_AAPL_CUSIP, 100.0)]))
    repo.upsert_snapshot(_conv_snapshot("2026-03-31", manager_cik=999, name="C",
        holdings=[_equity(_AAPL_CUSIP, 50.0)]))
    repo.close()

    from secfin.api.main import app

    with TestClient(app) as client:
        body = client.get(
            f"/v1/companies/{_AAPL_CIK}/institutional-co-holding?period=2026-03-31&top=2",
            headers=_BROWSER).json()

    assert len(body["nodes"]) == 2  # 3 managers capped to the top 2
    assert body["nodes"][0]["manager_cik"] == _MANAGER_CIK  # largest stake first
    assert body["nodes"][0]["shares"] == 500.0  # 300 + 200 across both AAPL classes (one node)


def test_coholding_thin_when_one_holder_or_no_overlap(tmp_path, monkeypatch):
    db = _configure(tmp_path, monkeypatch)
    repo = SQLiteHoldingsSnapshotRepository(db)
    # Single holder -> one node, no edges.
    repo.upsert_snapshot(_conv_snapshot("2026-03-31", manager_cik=_MANAGER_CIK, name="A",
        holdings=[_equity(_AAPL_CUSIP, 300.0), _equity("A0", 1.0)]))
    repo.close()

    from secfin.api.main import app

    with TestClient(app) as client:
        body = client.get(
            f"/v1/companies/{_AAPL_CIK}/institutional-co-holding?period=2026-03-31",
            headers=_BROWSER,
        ).json()

    assert len(body["nodes"]) == 1
    assert body["edges"] == []  # nothing to connect -> honest thin (UI renders the empty state)

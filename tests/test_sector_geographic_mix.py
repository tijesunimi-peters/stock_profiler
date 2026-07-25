"""Tests for the sector geographic-mix feature (Sector Analytics v2, P6b). No network.

Covers:
  * the geography member classifier (`normalize/segment_geography`): US->domestic, foreign->
    international, ambiguous/unmappable->other, and suffix/case/punctuation normalization;
  * the raw `dimensional_geo_facts` repository round-trip (upsert/idempotency/read-by-year);
  * the bounded DERA ingest (`ingest/dimensional_backfill`) over a synthetic fixture ZIP: geography
    rows + consolidated total kept, reconciling/elimination + cross-axis + prior-year + non-revenue
    rows dropped, one revenue tag chosen per filing (no tag mixing);
  * the pure-Python rollup batch (`analytical/sector_geographic_mix`): revenue-weighted dollar sums,
    reconcile-or-exclude, coverage, no-SIC-profile company excluded, no-coverage group -> no row;
  * `GET /v1/sectors/{group}/geographic-mix`: full contract, shares summing to ~1, honest N/A (never
    a fabricated 0%), derived label + the geographic caveats.
"""

from __future__ import annotations

import zipfile

import pytest
from fastapi.testclient import TestClient

from secfin.config import settings
from secfin.normalize.segment_geography import classify_geography_member
from secfin.storage.company_profile_repository import CompanyProfile
from secfin.storage.dimensional_geo_repository import DimensionalGeoRow
from secfin.storage.sector_geographic_mix_repository import SectorGeographicMixRow
from secfin.storage.sqlite_company_profile_repository import SQLiteCompanyProfileRepository
from secfin.storage.sqlite_dimensional_geo_repository import SQLiteDimensionalGeoRepository
from secfin.storage.sqlite_sector_geographic_mix_repository import (
    SQLiteSectorGeographicMixRepository,
)

_BROWSER = {"Sec-Fetch-Site": "same-origin"}


# --------------------------------------------------------------------------------------
# geography member classifier (the moat) -- AC-4
# --------------------------------------------------------------------------------------


@pytest.mark.parametrize(
    "member,expected",
    [
        ("US", "domestic"),
        ("UnitedStates", "domestic"),
        ("UnitedStatesMember", "domestic"),
        ("U.S.", "domestic"),
        ("Domestic", "domestic"),
        ("NonUs", "international"),
        ("International", "international"),
        ("InternationalMarkets", "international"),
        ("China", "international"),
        ("CN", "international"),
        ("Germany", "international"),
        ("EuropeMiddleEastAfrica", "international"),
        ("A.Pacific", "international"),
        ("OtherCountries", "international"),
        # ambiguous rollups that INCLUDE the US -> other (never leak into international)
        ("Americas", "other"),
        ("NorthAmerica", "other"),
        ("Worldwide", "other"),
        ("Corporate", "other"),
        # genuinely unmappable -> other, shown not dropped
        ("Zzxq", "other"),
        ("", "other"),
        (None, "other"),
    ],
)
def test_classify_geography_member(member, expected):
    assert classify_geography_member(member) == expected


def test_australia_not_misread_as_domestic():
    # "AUSTRALIA" contains the substring "US" -- the classifier must use EXACT US matching, not a
    # substring test, so Australia is international, never domestic.
    assert classify_geography_member("Australia") == "international"


# --------------------------------------------------------------------------------------
# raw dimensional_geo repository round-trip -- AC-1
# --------------------------------------------------------------------------------------


def _geo(cik, member, value, *, accession="a", consolidated=False, fy=2025):
    return DimensionalGeoRow(
        cik=cik, accession=accession, tag="Revenues", ddate="20251231", qtrs="4",
        member="" if consolidated else member, value=value, unit="USD",
        is_consolidated=consolidated, fiscal_year=fy, form="10-K",
    )


def test_dimensional_geo_repo_roundtrip(tmp_path):
    db = str(tmp_path / "d.db")
    repo = SQLiteDimensionalGeoRepository(db)
    try:
        repo.bulk_upsert([
            _geo(101, "", 1000, consolidated=True),
            _geo(101, "US", 600),
            _geo(101, "NonUs", 400),
            _geo(202, "US", 50, fy=2024),
        ])
        assert repo.count() == 4
        rows2025 = repo.rows_for_fiscal_year(2025)
        assert len(rows2025) == 3
        assert {r.member for r in rows2025} == {"", "US", "NonUs"}
        assert any(r.is_consolidated and r.value == 1000 for r in rows2025)
        assert repo.fiscal_years() == [2025, 2024]
        # idempotent upsert (same PK replaces, not duplicates)
        repo.bulk_upsert([_geo(101, "US", 650)])
        assert repo.count() == 4
        assert [r.value for r in repo.rows_for_fiscal_year(2025) if r.member == "US"] == [650]
        repo.clear()
        assert repo.count() == 0
    finally:
        repo.close()


# --------------------------------------------------------------------------------------
# bounded DERA ingest over a synthetic fixture ZIP -- AC-1, AC-2
# --------------------------------------------------------------------------------------

# sub.txt / num.txt are DERA's tab-separated tables; we build a tiny one in-memory. Only the columns
# the ingest reads need to be present + correctly named.
_SUB_HEADER = "adsh\tcik\tname\tform\tperiod\tfy\tfp"
_NUM_HEADER = "adsh\ttag\tversion\tcoreg\tddate\tqtrs\tuom\tsegments\tvalue\tfootnote"


def _sub(adsh, cik, form, period, fy):
    return f"{adsh}\t{cik}\tCo{cik}\t{form}\t{period}\t{fy}\tFY"


def _num(adsh, tag, ddate, qtrs, segments, value):
    return f"{adsh}\t{tag}\tus-gaap/2025\t\t{ddate}\t{qtrs}\tUSD\t{segments}\t{value}\t"


def _build_fixture_zip(path) -> None:
    subs = [
        _SUB_HEADER,
        _sub("acc-A", 101, "10-K", "20251231", "2025"),
        _sub("acc-B", 102, "10-K", "20251231", "2025"),
        _sub("acc-C", 103, "10-K", "20251231", "2025"),
        _sub("acc-D", 104, "10-K", "20251231", "2025"),  # cik 104 has NO profile
        # a non-annual form is ignored entirely
        _sub("acc-Q", 199, "10-Q", "20250930", "2025"),
    ]
    nums = [
        _NUM_HEADER,
        # -- Company A: Revenues 1000 = US 600 + NonUs 400 (reconciles) --
        _num("acc-A", "Revenues", "20251231", "4", "", "1000"),
        _num("acc-A", "Revenues", "20251231", "4", "Geographical=US;", "600"),
        _num("acc-A", "Revenues", "20251231", "4", "Geographical=NonUs;", "400"),
        # elimination reconciling row -> DROPPED (AC-2)
        _num("acc-A", "Revenues", "20251231", "4",
             "Geographical=US;ConsolidationItems=IntersegmentEliminations;", "50"),
        # prior-year comparative (wrong ddate) -> DROPPED
        _num("acc-A", "Revenues", "20241231", "4", "Geographical=US;", "500"),
        # a different axis (business segment) -> DROPPED (geography only)
        _num("acc-A", "Revenues", "20251231", "4", "BusinessSegments=Cloud;", "700"),
        # a non-revenue tag -> IGNORED
        _num("acc-A", "Assets", "20251231", "4", "", "9999"),
        # a lower-preference revenue tag also present w/ its own consolidated -> the filing must
        # pick ONE tag (Revenues, higher preference) and IGNORE these, never double-count
        _num("acc-A", "SalesRevenueNet", "20251231", "4", "", "999"),
        _num("acc-A", "SalesRevenueNet", "20251231", "4", "Geographical=US;", "999"),
        # -- Company B: RevenueFromContract... 500 = US 300 + China 150 + Corporate 50(->other) --
        _num("acc-B", "RevenueFromContractWithCustomerExcludingAssessedTax",
             "20251231", "4", "", "500"),
        _num("acc-B", "RevenueFromContractWithCustomerExcludingAssessedTax",
             "20251231", "4", "Geographical=US;", "300"),
        _num("acc-B", "RevenueFromContractWithCustomerExcludingAssessedTax",
             "20251231", "4", "Geographical=China;", "150"),
        _num("acc-B", "RevenueFromContractWithCustomerExcludingAssessedTax",
             "20251231", "4", "Geographical=Corporate;", "50"),
        # -- Company C: Revenues 1000 but geo only US 600 (off by 40%) -> UNRECONCILED/excluded --
        _num("acc-C", "Revenues", "20251231", "4", "", "1000"),
        _num("acc-C", "Revenues", "20251231", "4", "Geographical=US;", "600"),
        # -- Company D (no profile): reconciles, but must be excluded by the batch (no SIC) --
        _num("acc-D", "Revenues", "20251231", "4", "", "800"),
        _num("acc-D", "Revenues", "20251231", "4", "Geographical=US;", "800"),
    ]
    with zipfile.ZipFile(path, "w") as z:
        z.writestr("sub.txt", "\n".join(subs) + "\n")
        z.writestr("num.txt", "\n".join(nums) + "\n")


def test_ingest_from_fixture_zip(tmp_path):
    from secfin.ingest.dimensional_backfill import extract_geo_rows_from_zip

    zpath = tmp_path / "2025q4.zip"
    _build_fixture_zip(zpath)
    rows = extract_geo_rows_from_zip(zpath)
    by_cik: dict[int, list[DimensionalGeoRow]] = {}
    for r in rows:
        by_cik.setdefault(r.cik, []).append(r)

    # Company A: exactly the consolidated + US + NonUs on the chosen "Revenues" tag; elimination,
    # comparative, business-segment, non-revenue, and the SalesRevenueNet variant are all gone.
    a = by_cik[101]
    assert {(r.member, r.value) for r in a} == {("", 1000.0), ("US", 600.0), ("NonUs", 400.0)}
    assert all(r.tag == "Revenues" for r in a)  # single tag chosen, no mixing
    assert all(r.ddate == "20251231" for r in a)  # current-year only

    # Company B: consolidated + three geo members on the RevenueFromContract... tag.
    b = by_cik[102]
    assert {(r.member, r.value) for r in b} == {
        ("", 500.0), ("US", 300.0), ("China", 150.0), ("Corporate", 50.0)
    }
    # The 10-Q filer (199) was never annual -> no rows.
    assert 199 not in by_cik


def test_ingest_writes_through_repo_idempotently(tmp_path):
    from secfin.ingest.dimensional_backfill import run_dimensional_backfill

    db = str(tmp_path / "ingest.db")
    zpath = tmp_path / "2025q4.zip"
    _build_fixture_zip(zpath)
    n1 = run_dimensional_backfill(db, [zpath])
    repo = SQLiteDimensionalGeoRepository(db)
    try:
        first = repo.count()
        assert first == n1 > 0
        # re-ingest the same ZIP -> idempotent, count unchanged
        run_dimensional_backfill(db, [zpath])
        assert repo.count() == first
    finally:
        repo.close()


# --------------------------------------------------------------------------------------
# rollup batch -- AC-5, AC-6, AC-7
# --------------------------------------------------------------------------------------


def _seed_batch_db(db: str) -> None:
    """Ingest the fixture ZIP + seed SIC profiles for the rollup."""
    from secfin.ingest.dimensional_backfill import run_dimensional_backfill

    # profiles: A/B/C all SIC group "35"; D has NO profile (must be excluded, no crash).
    profiles = SQLiteCompanyProfileRepository(db)
    profiles.upsert(CompanyProfile(cik=101, sic="3571", sic_description="Computers", name="Alpha"))
    profiles.upsert(CompanyProfile(cik=102, sic="3579", sic_description="Office", name="Beta"))
    profiles.upsert(CompanyProfile(cik=103, sic="3577", sic_description="Peripherals", name="Gam"))
    profiles.close()

    import tempfile
    from pathlib import Path

    zpath = Path(tempfile.mkdtemp()) / "2025q4.zip"
    _build_fixture_zip(zpath)
    run_dimensional_backfill(db, [zpath])


def test_batch_revenue_weighted_reconcile_and_coverage(tmp_path):
    from secfin.analytical.sector_geographic_mix import compute_sector_geographic_mix

    db = str(tmp_path / "batch.db")
    _seed_batch_db(db)
    rows = {
        r.peer_group: r
        for r in compute_sector_geographic_mix(
            db, fiscal_year=2025, sic_digits=2, reconcile_tolerance=0.01, as_of="2026-07-24"
        )
    }
    assert set(rows) == {"35"}  # D (no profile) excluded; no crash

    g = rows["35"]
    # Covered = A (US600/NonUs400) + B (US300/China150/Corp50->other). C is unreconciled, excluded.
    assert g.domestic == pytest.approx(900.0)  # 600 + 300
    assert g.international == pytest.approx(550.0)  # 400 + 150
    assert g.other == pytest.approx(50.0)  # B's Corporate -> other, SHOWN not hidden
    assert g.company_count == 2  # A + B covered
    assert g.excluded_unreconciled_count == 1  # C excluded and COUNTED (AC-5)
    assert g.companies_in_scope == 3  # A + B + C all had a consolidated total
    # coverage = covered consolidated (1000 + 500) / in-scope consolidated (1000 + 500 + 1000)
    assert g.revenue_covered_share == pytest.approx(1500.0 / 2500.0)
    assert g.fiscal_year == 2025 and g.unit == "USD"


def test_batch_group_with_no_coverage_is_absent_not_zero(tmp_path):
    # A group whose only company fails reconciliation must yield NO row (honest N/A), not zero.
    from secfin.analytical.sector_geographic_mix import compute_sector_geographic_mix
    from secfin.ingest.dimensional_backfill import run_dimensional_backfill

    db = str(tmp_path / "nocov.db")
    profiles = SQLiteCompanyProfileRepository(db)
    profiles.upsert(CompanyProfile(cik=103, sic="7372", sic_description="Software", name="Gam"))
    profiles.close()
    # Reuse company C from the fixture (unreconciled): build a zip with only its rows.
    zpath = tmp_path / "q.zip"
    sub_line = _sub("acc-C", 103, "10-K", "20251231", "2025")
    with zipfile.ZipFile(zpath, "w") as z:
        z.writestr("sub.txt", _SUB_HEADER + "\n" + sub_line + "\n")
        z.writestr(
            "num.txt",
            _NUM_HEADER + "\n"
            + _num("acc-C", "Revenues", "20251231", "4", "", "1000") + "\n"
            + _num("acc-C", "Revenues", "20251231", "4", "Geographical=US;", "600") + "\n",
        )
    run_dimensional_backfill(db, [zpath])
    rows = compute_sector_geographic_mix(
        db, fiscal_year=2025, sic_digits=2, reconcile_tolerance=0.01, as_of="2026-07-24"
    )
    assert rows == []  # absent, not a zero row


def test_run_batch_recomputes_and_replaces(tmp_path):
    from secfin.analytical.sector_geographic_mix import run_sector_geographic_mix

    db = str(tmp_path / "run.db")
    _seed_batch_db(db)
    n = run_sector_geographic_mix(
        db, fiscal_year=2025, sic_digits=2, reconcile_tolerance=0.01, as_of="2026-07-24"
    )
    assert n == 1
    repo = SQLiteSectorGeographicMixRepository(db)
    try:
        assert repo.get("35").domestic == pytest.approx(900.0)
        assert repo.latest_fiscal_year() == 2025
    finally:
        repo.close()


# --------------------------------------------------------------------------------------
# endpoint (precomputed read; contract; honest N/A) -- AC-8, AC-9, AC-10
# --------------------------------------------------------------------------------------


def _row(group="35", fy=2025):
    return SectorGeographicMixRow(
        peer_group=group, fiscal_year=fy, domestic=900.0, international=550.0, other=50.0,
        unit="USD", company_count=2, companies_in_scope=3, excluded_unreconciled_count=1,
        revenue_covered_share=0.6, as_of="2026-07-24",
    )


def _configure(tmp_path, monkeypatch) -> str:
    db = str(tmp_path / "api.db")
    monkeypatch.setattr(settings, "secfin_db_path", db)
    monkeypatch.setattr(settings, "sec_user_agent", "clearyfi-test test@example.com")
    return db


def test_endpoint_returns_full_contract_when_seeded(tmp_path, monkeypatch):
    db = _configure(tmp_path, monkeypatch)
    repo = SQLiteSectorGeographicMixRepository(db)
    repo.bulk_upsert([_row()])
    repo.close()
    from secfin.api.main import app

    with TestClient(app) as client:
        resp = client.get("/v1/sectors/35/geographic-mix", headers=_BROWSER)

    assert resp.status_code == 200
    body = resp.json()
    assert body["group"] == "35"
    assert body["group_label"].startswith("Industrial")
    assert body["has_data"] is True
    assert body["derived"] is True
    assert body["fiscal_year"] == 2025 and body["unit"] == "USD"
    assert body["as_of"] == "2026-07-24"
    assert body["peer_basis"] == "SIC 2-digit"
    m = body["mix"]
    assert m["domestic"] == 900.0 and m["international"] == 550.0 and m["other"] == 50.0
    # shares sum to ~1 (other is shown, not hidden)
    assert m["domestic_share"] + m["international_share"] + m["other_share"] == pytest.approx(1.0)
    assert m["domestic_share"] == pytest.approx(900.0 / 1500.0)
    assert body["company_count"] == 2 and body["companies_in_scope"] == 3
    assert body["excluded_unreconciled_count"] == 1
    assert body["revenue_covered_share"] == pytest.approx(0.6)

    blob = " ".join(body["caveats"]).lower()
    assert "derived" in blob and "revenue-weighted" in blob
    assert "coverage varies" in blob or "not every company" in blob
    assert "normalization" in blob or "documented normalization" in blob
    assert "reconcile" in blob or "excluded and counted" in blob


def test_endpoint_empty_is_honest_na_never_zero(tmp_path, monkeypatch):
    _configure(tmp_path, monkeypatch)  # empty db, nothing seeded
    from secfin.api.main import app

    with TestClient(app) as client:
        resp = client.get("/v1/sectors/99/geographic-mix", headers=_BROWSER)

    assert resp.status_code == 200
    body = resp.json()
    assert body["has_data"] is False
    # N/A, never a fabricated 0%/100% split.
    assert body["mix"] is None
    assert body["fiscal_year"] is None and body["as_of"] is None
    assert body["revenue_covered_share"] is None
    assert body["derived"] is True
    assert body["caveats"]  # caveats still carried on the empty state

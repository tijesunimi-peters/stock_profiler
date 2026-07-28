"""Route test for GET /companies/{symbol}/profile -- the company Overview's identity header
(V3-P4). A pure operational-store read: no facts fetch, no DuckDB, no network.

The contract worth pinning: a company we have no ingested profile row for is a **200 with
null fields**, not a 404 and not invented values. The frontend omits a null field rather than
rendering it as a permanent blank cell, so "null" here is a real, load-bearing answer.
"""

from __future__ import annotations

from fastapi.testclient import TestClient

from secfin.config import settings
from secfin.storage.company_profile_repository import CompanyProfile
from secfin.storage.sqlite_company_profile_repository import SQLiteCompanyProfileRepository

_BROWSER = {"Sec-Fetch-Site": "same-origin"}


def _configure(tmp_path, monkeypatch) -> str:
    db = str(tmp_path / "test.db")
    monkeypatch.setattr(settings, "secfin_db_path", db)
    monkeypatch.setattr(settings, "sec_user_agent", "clearyfi-test test@example.com")
    return db


def test_profile_returns_name_and_sic_for_an_ingested_company(tmp_path, monkeypatch):
    db = _configure(tmp_path, monkeypatch)
    profiles = SQLiteCompanyProfileRepository(db)
    profiles.upsert(
        CompanyProfile(
            cik=320193, sic="3571", sic_description="Electronic Computers", name="Apple Inc."
        )
    )
    profiles.close()

    from secfin.api.main import app

    with TestClient(app) as client:
        resp = client.get("/v1/companies/320193/profile", headers=_BROWSER)

    assert resp.status_code == 200
    body = resp.json()
    assert body["cik"] == 320193
    assert body["name"] == "Apple Inc."
    assert body["sic"] == "3571"
    assert body["sic_description"] == "Electronic Computers"
    assert body["source"]  # always states where the assignment comes from


def test_profile_without_an_ingested_row_is_200_with_nulls_not_404(tmp_path, monkeypatch):
    """Null is the honest answer: we know the CIK, we have not ingested its SIC profile.
    A 404 would wrongly imply the company itself is unknown."""
    _configure(tmp_path, monkeypatch)

    from secfin.api.main import app

    with TestClient(app) as client:
        resp = client.get("/v1/companies/320193/profile", headers=_BROWSER)

    assert resp.status_code == 200
    body = resp.json()
    assert body["cik"] == 320193
    assert body["name"] is None
    assert body["sic"] is None
    assert body["sic_description"] is None


def test_profile_null_fields_are_not_empty_strings(tmp_path, monkeypatch):
    """An empty string would render as a blank cell; null lets the UI omit the field."""
    db = _configure(tmp_path, monkeypatch)
    profiles = SQLiteCompanyProfileRepository(db)
    profiles.upsert(CompanyProfile(cik=320193, sic=None, sic_description=None, name="Apple Inc."))
    profiles.close()

    from secfin.api.main import app

    with TestClient(app) as client:
        resp = client.get("/v1/companies/320193/profile", headers=_BROWSER)

    body = resp.json()
    assert body["name"] == "Apple Inc."
    assert body["sic"] is None and body["sic_description"] is None

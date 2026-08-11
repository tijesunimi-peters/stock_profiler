"""Route tests for `GET /companies/{symbol}/proposed-sale-notices` (Form 144). No network.

The Form 144 panel on the Insider activity view is the reason this endpoint exists, and the
constraint it lives under is that we index these filings but never parse them. So the payload
must carry dates and nothing else -- and must not let "none in the window we hold" render as
"this insider has never announced a sale".
"""

from __future__ import annotations

from fastapi.testclient import TestClient

from secfin.config import settings
from secfin.sec.filing_index import FilingIndexEntry
from secfin.storage.sqlite_filing_index_repository import SQLiteFilingIndexRepository

_BROWSER = {"Sec-Fetch-Site": "same-origin"}
_CIK = 320193


def _configure(tmp_path, monkeypatch) -> str:
    db = str(tmp_path / "test.db")
    monkeypatch.setattr(settings, "secfin_db_path", db)
    monkeypatch.setattr(settings, "sec_user_agent", "clearyfi-test test@example.com")
    return db


def _seed(db: str, rows: list[tuple[str, str, str]]) -> None:
    """rows: (accession, form, filing_date)."""
    repo = SQLiteFilingIndexRepository(db)
    repo.upsert_filings(
        _CIK,
        [
            FilingIndexEntry(cik=_CIK, accession=a, form=f, filing_date=d)
            for a, f, d in rows
        ],
    )
    repo.close()


def _client():
    from secfin.api.main import app

    return TestClient(app)


def test_returns_each_notice_with_its_date_newest_first(tmp_path, monkeypatch):
    db = _configure(tmp_path, monkeypatch)
    _seed(
        db,
        [
            ("n-1", "144", "2026-01-05"),
            ("n-2", "144", "2026-03-10"),
            ("n-3", "144/A", "2026-02-01"),
            ("f-1", "4", "2026-03-11"),
        ],
    )
    with _client() as c:
        body = c.get(f"/v1/companies/{_CIK}/proposed-sale-notices", headers=_BROWSER).json()

    assert body["status"] == "ok"
    assert body["count"] == 3
    assert [n["filed"] for n in body["notices"]] == ["2026-03-10", "2026-02-01", "2026-01-05"]


def test_carries_no_shares_broker_or_person_because_we_do_not_parse_the_notice(
    tmp_path, monkeypatch
):
    """The panel this feeds used to draw share sizes and broker names off synthetic data. The
    endpoint must make that impossible to do accidentally."""
    db = _configure(tmp_path, monkeypatch)
    _seed(db, [("n-1", "144", "2026-01-05")])
    with _client() as c:
        body = c.get(f"/v1/companies/{_CIK}/proposed-sale-notices", headers=_BROWSER).json()

    assert set(body["notices"][0]) == {"filed", "form", "accession"}
    assert "not parse" in body["cannot"]


def test_no_notices_is_scoped_to_the_indexed_window(tmp_path, monkeypatch):
    db = _configure(tmp_path, monkeypatch)
    _seed(db, [("f-1", "4", "2026-03-11"), ("f-2", "10-K", "2025-11-01")])
    with _client() as c:
        body = c.get(f"/v1/companies/{_CIK}/proposed-sale-notices", headers=_BROWSER).json()

    assert body["status"] == "ok"
    assert body["count"] == 0
    # A zero without its window is a claim about history, which we cannot make.
    assert body["covered_from"] == "2025-11-01"
    assert body["covered_to"] == "2026-03-11"


def test_truncation_is_disclosed_rather_than_silently_shortening_the_calendar(
    tmp_path, monkeypatch
):
    db = _configure(tmp_path, monkeypatch)
    _seed(db, [(f"n-{i}", "144", f"2026-01-{i:02d}") for i in range(1, 6)])
    with _client() as c:
        body = c.get(
            f"/v1/companies/{_CIK}/proposed-sale-notices?limit=2", headers=_BROWSER
        ).json()

    assert body["limit"] == 2
    assert body["truncated"] is True
    assert len(body["notices"]) == 2

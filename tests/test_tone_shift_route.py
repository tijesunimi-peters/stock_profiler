"""Route tests for `GET /sectors/{group}/tone-shift` (Track 2 Wave A, Stage 6). No network.

The load-bearing behaviour: an uncovered SIC group returns `has_data:false` with no fabricated
leaderboard, and a covered one is sorted ascending by cosine_similarity (biggest apparent rewrite
first).
"""

from __future__ import annotations

from fastapi.testclient import TestClient

from secfin.config import settings
from secfin.storage.sqlite_tone_shift_alert_repository import SQLiteToneShiftAlertRepository
from secfin.storage.tone_shift_alert_repository import ToneShiftAlertRow

_BROWSER = {"Sec-Fetch-Site": "same-origin"}


def _configure(tmp_path, monkeypatch) -> str:
    db = str(tmp_path / "test.db")
    monkeypatch.setattr(settings, "secfin_db_path", db)
    monkeypatch.setattr(settings, "sec_user_agent", "clearyfi-test test@example.com")
    return db


def _row(cik: int, **kw) -> ToneShiftAlertRow:
    base = dict(
        cik=cik, peer_group="35", company_name=f"CO {cik}", item_code="RF",
        accession="a-2026", prior_accession="a-2025", filing_date="2026-01-01",
        cosine_similarity=0.9, jaccard_similarity=0.8,
    )
    base.update(kw)
    return ToneShiftAlertRow(**base)


def _client():
    from secfin.api.main import app

    return TestClient(app)


def test_uncovered_group_returns_honest_empty_state(tmp_path, monkeypatch):
    _configure(tmp_path, monkeypatch)
    with _client() as c:
        body = c.get("/v1/sectors/99/tone-shift", headers=_BROWSER).json()

    assert body["has_data"] is False
    assert body["alerts"] == []
    assert body["companies_covered"] == 0
    assert body["caveats"]


def test_covered_group_sorts_ascending_by_similarity(tmp_path, monkeypatch):
    db = _configure(tmp_path, monkeypatch)
    repo = SQLiteToneShiftAlertRepository(db)
    repo.bulk_upsert([
        _row(1, cosine_similarity=0.95),
        _row(2, cosine_similarity=0.40, item_code="LEGAL"),  # the biggest apparent rewrite
        _row(3, cosine_similarity=0.70),
    ])
    repo.close()

    with _client() as c:
        body = c.get("/v1/sectors/35/tone-shift", headers=_BROWSER).json()

    assert body["has_data"] is True
    assert body["companies_covered"] == 3
    assert [a["cik"] for a in body["alerts"]] == [2, 3, 1]
    assert body["alerts"][0]["cosine_similarity"] == 0.40

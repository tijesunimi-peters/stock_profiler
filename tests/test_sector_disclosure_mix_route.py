"""Route tests for `GET /sectors/{group}/disclosure-mix` (Track 2 Wave 0). No network.

The load-bearing behaviour: a SIC group the batch hasn't covered returns `has_data: false` with
no fabricated numbers, never a 404 and never a zeroed-out real-looking payload.
"""

from __future__ import annotations

from fastapi.testclient import TestClient

from secfin.config import settings
from secfin.storage.sector_governance_stat_repository import SectorGovernanceStatRow
from secfin.storage.sqlite_sector_governance_stat_repository import (
    SQLiteSectorGovernanceStatRepository,
)

_BROWSER = {"Sec-Fetch-Site": "same-origin"}


def _configure(tmp_path, monkeypatch) -> str:
    db = str(tmp_path / "test.db")
    monkeypatch.setattr(settings, "secfin_db_path", db)
    monkeypatch.setattr(settings, "sec_user_agent", "clearyfi-test test@example.com")
    return db


def _seed(db: str, rows: list[SectorGovernanceStatRow]) -> None:
    repo = SQLiteSectorGovernanceStatRepository(db)
    repo.bulk_upsert(rows)
    repo.close()


def _row(cik: int, **kw) -> SectorGovernanceStatRow:
    base = dict(
        cik=cik, peer_group="35", company_name=f"CO {cik}",
        cyber_processes_integrated=True, cyber_reports_to_board=True,
        cyber_positions_responsible=None, cyber_incident_8k_count=0,
        auditor_name="Example LLP", tenure_since="2020-01-01", tenure_since_is_change=False,
        tenure_years=5.0, tenure_status="ok", tenure_reason=None,
        late_notice_count=0, non_reliance_count=0, indexed_filings=100,
        indexed_from="2015-01-01", indexed_to="2026-01-01",
    )
    base.update(kw)
    return SectorGovernanceStatRow(**base)


def _client():
    from secfin.api.main import app

    return TestClient(app)


def test_uncovered_group_returns_honest_empty_state(tmp_path, monkeypatch):
    _configure(tmp_path, monkeypatch)
    with _client() as c:
        body = c.get("/v1/sectors/99/disclosure-mix", headers=_BROWSER).json()

    assert body["has_data"] is False
    assert body["cyber"] is None
    assert body["auditors"] == []
    assert body["deficient"] == []
    assert body["companies_covered"] == 0
    assert body["caveats"]


def test_covered_group_aggregates_live_and_never_shows_material_weakness(tmp_path, monkeypatch):
    db = _configure(tmp_path, monkeypatch)
    _seed(db, [
        _row(1, auditor_name="Big LLP", late_notice_count=1),
        _row(2, auditor_name="Big LLP", cyber_incident_8k_count=2, tenure_since_is_change=True),
        _row(3, auditor_name="Small LLP", cyber_processes_integrated=None, non_reliance_count=1),
    ])
    with _client() as c:
        body = c.get("/v1/sectors/35/disclosure-mix", headers=_BROWSER).json()

    assert body["has_data"] is True
    assert body["companies_covered"] == 3
    # Two of three tagged the flag (one is None -- excluded from the denominator, not "no").
    assert body["cyber"]["adopted"] == 100
    assert body["cyber"]["incidents_8k"] == 2
    assert {a["name"] for a in body["auditors"]} == {"Big LLP", "Small LLP"}
    assert body["auditor_changes"] == 1
    assert [f["cik"] for f in body["auditor_change_filers"]] == [2]
    assert [d["label"] for d in body["deficient"]] == [
        "NT 10-K / 10-Q (late)",
        "Restatement (Item 4.02)",
    ]
    assert not any("material weakness" in d["label"].lower() for d in body["deficient"])

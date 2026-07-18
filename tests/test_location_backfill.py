"""Tests for the targeted 13F location backfill (ingest/location_backfill.py, no network).

A fake SECClient serves cover-page bytes by URL (same pattern as test_institutional.py), so the
backfill's fetch->parse->UPDATE loop is exercised end to end against a real SQLite repo without
touching SEC. Covers the three per-snapshot outcomes: filled, no_location, failed.
"""

from __future__ import annotations

from pathlib import Path

from secfin.ingest.location_backfill import run_location_backfill
from secfin.normalize.schema import HoldingsSnapshot, InstitutionalHolding
from secfin.sec.client import SECClient
from secfin.storage.sqlite_holdings_repository import SQLiteHoldingsSnapshotRepository

FIXTURES = Path(__file__).parent / "fixtures" / "institutional"
_PERIOD = "2026-03-31"
# A cover page with a filingManager/address/stateOrCountry of "NE" (real Berkshire fixture).
_COVER_WITH_NE = (FIXTURES / "brk13f_2026q1_coverpage.xml").read_bytes()
# A cover page with no filingManager address at all -> parse yields None -> "no_location".
_COVER_NO_ADDR = b"<edgarSubmission><formData><coverPage></coverPage></formData></edgarSubmission>"


class _FakeClient:
    """Serves fixed cover-page bytes by URL; real (static) URL-building so the URLs match
    what location_backfill actually requests. Missing URL -> raises (the "failed" path)."""

    def __init__(self, bytes_by_url: dict[str, bytes]) -> None:
        self._bytes = bytes_by_url

    async def __aenter__(self) -> _FakeClient:
        return self

    async def __aexit__(self, *exc) -> bool:
        return False

    def filing_document_url(self, cik: int, accession: str, document: str) -> str:
        return SECClient.filing_document_url(cik, accession, document)

    async def get_bytes(self, url: str) -> bytes:
        if url not in self._bytes:
            raise FileNotFoundError(url)
        return self._bytes[url]


def _seed(db: str, rows: list[tuple[int, str, str | None]]) -> None:
    repo = SQLiteHoldingsSnapshotRepository(db)
    for cik, accession, location in rows:
        repo.upsert_snapshot(
            HoldingsSnapshot(
                manager_cik=cik,
                manager_name=f"MGR {cik}",
                report_period=_PERIOD,
                accession=accession,
                filing_manager_location=location,
                holdings=[InstitutionalHolding(cusip="037833100", shares=1.0)],
            )
        )
    repo.close()


def _url(cik: int, accession: str) -> str:
    return SECClient.filing_document_url(cik, accession, "primary_doc.xml")


def test_backfill_fills_no_location_and_failed_outcomes(tmp_path, monkeypatch):
    db = str(tmp_path / "loc.db")
    # cik 1: cover has NE -> filled;  cik 2: cover has no address -> no_location;
    # cik 3: no URL served -> failed;  cik 4: already has a location -> not a candidate at all.
    _seed(db, [(1, "A-1", None), (2, "A-2", None), (3, "A-3", None), (4, "A-4", "CA")])
    served = {_url(1, "A-1"): _COVER_WITH_NE, _url(2, "A-2"): _COVER_NO_ADDR}
    monkeypatch.setattr(
        "secfin.ingest.location_backfill.SECClient", lambda: _FakeClient(served)
    )

    import asyncio

    tally = asyncio.run(run_location_backfill([_PERIOD], db))

    assert tally == {"filled": 1, "no_location": 1, "failed": 1}
    repo = SQLiteHoldingsSnapshotRepository(db)
    assert repo.get_snapshot(1, _PERIOD).filing_manager_location == "NE"  # written
    assert repo.get_snapshot(2, _PERIOD).filing_manager_location is None  # left NULL, honest
    assert repo.get_snapshot(3, _PERIOD).filing_manager_location is None  # fetch failed, left NULL
    assert repo.get_snapshot(4, _PERIOD).filing_manager_location == "CA"  # untouched
    # Re-run is idempotent: cik 1 no longer a candidate; only the still-NULL ones remain.
    assert {c for c, _ in repo.snapshots_missing_location(_PERIOD)} == {2, 3}
    repo.close()

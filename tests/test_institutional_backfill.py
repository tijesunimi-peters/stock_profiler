"""Tests for the bulk 13F ingest job (secfin.ingest.institutional_backfill).

Covers the local, network-free candidate-discovery piece (`find_13f_candidates`) -- the
fetch step reuses `sec.institutional.fetch_13f_snapshot_for_filing`, already covered in
test_institutional.py -- plus `_process_candidate`'s CUSIP-resolution wiring (monkeypatched,
same style as tests/test_manager_routes.py).
"""

from __future__ import annotations

import json
import zipfile
from pathlib import Path

from secfin.ingest import institutional_backfill as backfill_module
from secfin.ingest.institutional_backfill import find_13f_candidates
from secfin.normalize.schema import HoldingsSnapshot, InstitutionalHolding, OtherManager13F
from secfin.storage.sqlite_holdings_repository import SQLiteHoldingsSnapshotRepository

BERKSHIRE_CIK = 1067983
BLACKROCK_CIK = 1364742


def _submissions_payload(name: str, filings: list[dict]) -> dict:
    """Build a submissions.json-shaped payload with a `filings.recent` block.

    `filings` must already be newest-filed-first, same order the real SEC
    zip/API serves them in.
    """
    return {
        "name": name,
        "filings": {
            "recent": {
                "form": [f["form"] for f in filings],
                "accessionNumber": [f["accessionNumber"] for f in filings],
                "filingDate": [f["filingDate"] for f in filings],
                "reportDate": [f["reportDate"] for f in filings],
                "primaryDocument": [f["primaryDocument"] for f in filings],
            }
        },
    }


def _write_submissions_zip(zip_path: Path, entries: dict[int, dict]) -> None:
    with zipfile.ZipFile(zip_path, "w") as zf:
        for cik, payload in entries.items():
            zf.writestr(f"CIK{cik:010d}.json", json.dumps(payload))


def test_find_13f_candidates_matches_report_date(tmp_path):
    zip_path = tmp_path / "submissions.zip"
    _write_submissions_zip(
        zip_path,
        {
            BERKSHIRE_CIK: _submissions_payload(
                "BERKSHIRE HATHAWAY INC",
                [
                    {
                        "form": "13F-HR",
                        "accessionNumber": "0001-1",
                        "filingDate": "2026-05-14",
                        "reportDate": "2026-03-31",
                        "primaryDocument": "xslForm13F_X02/primary_doc.xml",
                    }
                ],
            )
        },
    )

    candidates = find_13f_candidates(zip_path, "2026-03-31")

    assert len(candidates) == 1
    assert candidates[0]["manager_cik"] == BERKSHIRE_CIK
    assert candidates[0]["manager_name"] == "BERKSHIRE HATHAWAY INC"
    assert candidates[0]["filing"]["accessionNumber"] == "0001-1"


def test_find_13f_candidates_excludes_non_matching_quarter_and_ciks(tmp_path):
    zip_path = tmp_path / "submissions.zip"
    _write_submissions_zip(
        zip_path,
        {
            BERKSHIRE_CIK: _submissions_payload(
                "BERKSHIRE HATHAWAY INC",
                [
                    {
                        "form": "13F-HR",
                        "accessionNumber": "0001-1",
                        "filingDate": "2026-02-14",
                        "reportDate": "2025-12-31",  # different quarter
                        "primaryDocument": "xslForm13F_X02/primary_doc.xml",
                    }
                ],
            ),
            BLACKROCK_CIK: _submissions_payload(
                "BLACKROCK INC",
                [
                    {
                        "form": "10-K",  # not a 13F at all
                        "accessionNumber": "0002-1",
                        "filingDate": "2026-02-01",
                        "reportDate": "2025-12-31",
                        "primaryDocument": "form10k.htm",
                    }
                ],
            ),
        },
    )

    assert find_13f_candidates(zip_path, "2026-03-31") == []


def test_find_13f_candidates_amendment_wins_over_original(tmp_path):
    zip_path = tmp_path / "submissions.zip"
    # Newest-filed-first, same order the SEC serves filings.recent in -- the amendment
    # was filed later, so it appears first.
    _write_submissions_zip(
        zip_path,
        {
            BERKSHIRE_CIK: _submissions_payload(
                "BERKSHIRE HATHAWAY INC",
                [
                    {
                        "form": "13F-HR/A",
                        "accessionNumber": "0002-1",
                        "filingDate": "2026-06-01",
                        "reportDate": "2026-03-31",
                        "primaryDocument": "xslForm13F_X02/primary_doc.xml",
                    },
                    {
                        "form": "13F-HR",
                        "accessionNumber": "0001-1",
                        "filingDate": "2026-05-14",
                        "reportDate": "2026-03-31",
                        "primaryDocument": "xslForm13F_X02/primary_doc.xml",
                    },
                ],
            )
        },
    )

    candidates = find_13f_candidates(zip_path, "2026-03-31")

    assert len(candidates) == 1
    assert candidates[0]["filing"]["accessionNumber"] == "0002-1"
    assert candidates[0]["filing"]["form"] == "13F-HR/A"


def test_find_13f_candidates_skips_malformed_entry(tmp_path):
    zip_path = tmp_path / "submissions.zip"
    with zipfile.ZipFile(zip_path, "w") as zf:
        zf.writestr(f"CIK{BERKSHIRE_CIK:010d}.json", "{not valid json")
        zf.writestr(
            f"CIK{BLACKROCK_CIK:010d}.json",
            json.dumps(
                _submissions_payload(
                    "BLACKROCK INC",
                    [
                        {
                            "form": "13F-HR",
                            "accessionNumber": "0003-1",
                            "filingDate": "2026-05-10",
                            "reportDate": "2026-03-31",
                            "primaryDocument": "xslForm13F_X02/primary_doc.xml",
                        }
                    ],
                )
            ),
        )

    candidates = find_13f_candidates(zip_path, "2026-03-31")

    assert len(candidates) == 1
    assert candidates[0]["manager_cik"] == BLACKROCK_CIK


def _candidate(accession: str) -> dict:
    return {
        "manager_cik": BERKSHIRE_CIK,
        "manager_name": "BERKSHIRE HATHAWAY INC",
        "filing": {
            "form": "13F-HR",
            "accessionNumber": accession,
            "filingDate": "2026-05-15",
            "reportDate": "2026-03-31",
            "primaryDocument": "xslForm13F_X02/primary_doc.xml",
        },
    }


async def test_process_candidate_resolves_cusips_before_upserting(monkeypatch):
    """The bulk job must resolve CUSIPs (durable side effect: cusip_map rows) before
    upserting -- otherwise the issuer-centric endpoints' reverse CIK->CUSIP lookup would
    never find anything for a manager only ever ingested via this job."""
    snapshot = HoldingsSnapshot(
        manager_cik=BERKSHIRE_CIK,
        manager_name="BERKSHIRE HATHAWAY INC",
        report_period="2026-03-31",
        accession="0001-1",
        holdings=[InstitutionalHolding(cusip="037833100", issuer_name="APPLE INC")],
    )

    async def _fake_fetch(client, cik, manager_name, report_period, filing):
        return snapshot

    resolve_calls = []

    async def _fake_resolve(client, resolver, snap):
        resolve_calls.append(snap)

    monkeypatch.setattr(backfill_module, "fetch_13f_snapshot_for_filing", _fake_fetch)
    monkeypatch.setattr(backfill_module, "resolve_snapshot_cusips", _fake_resolve)

    repo = SQLiteHoldingsSnapshotRepository(":memory:")
    outcome = await backfill_module._process_candidate(
        None, repo, object(), "2026-03-31", _candidate("0001-1")
    )

    assert outcome == "fetched"
    assert resolve_calls == [snapshot]
    assert repo.get_snapshot(BERKSHIRE_CIK, "2026-03-31") is not None
    repo.close()


async def test_process_candidate_skips_without_resolving_when_already_current(monkeypatch):
    async def _boom_fetch(*args, **kwargs):
        raise AssertionError("should not fetch when the cache is already current")

    async def _boom_resolve(*args, **kwargs):
        raise AssertionError("should not resolve when nothing was fetched")

    monkeypatch.setattr(backfill_module, "fetch_13f_snapshot_for_filing", _boom_fetch)
    monkeypatch.setattr(backfill_module, "resolve_snapshot_cusips", _boom_resolve)

    repo = SQLiteHoldingsSnapshotRepository(":memory:")
    repo.upsert_snapshot(
        HoldingsSnapshot(
            manager_cik=BERKSHIRE_CIK,
            report_period="2026-03-31",
            accession="0001-1",
        )
    )

    outcome = await backfill_module._process_candidate(
        None, repo, object(), "2026-03-31", _candidate("0001-1")
    )

    assert outcome == "skipped"
    repo.close()


async def test_process_candidate_isolates_a_storage_failure_and_keeps_going(monkeypatch):
    """Regression test for the real 2026-07-11 bug (docs/product/tracks/data.md): one
    manager's `repo.upsert_snapshot` raising (here, reproduced via the REAL
    SQLiteHoldingsSnapshotRepository and the actual UNIQUE-constraint mechanism that
    crashed the real Q1 2026 bulk run -- two `other_managers` entries sharing a
    `sequence_number`) must be caught and tallied "failed", not propagate and kill the
    whole job. Before this fix, `repo.upsert_snapshot(snapshot)` sat outside
    `_process_candidate`'s try/except entirely.
    """
    snapshot = HoldingsSnapshot(
        manager_cik=BERKSHIRE_CIK,
        manager_name="BERKSHIRE HATHAWAY INC",
        report_period="2026-03-31",
        accession="0001-1",
        other_managers=[
            OtherManager13F(sequence_number=1, name="Manager A"),
            OtherManager13F(sequence_number=1, name="Manager B"),  # duplicate -- real bug
        ],
    )

    async def _fake_fetch(client, cik, manager_name, report_period, filing):
        return snapshot

    async def _fake_resolve(client, resolver, snap):
        return None

    monkeypatch.setattr(backfill_module, "fetch_13f_snapshot_for_filing", _fake_fetch)
    monkeypatch.setattr(backfill_module, "resolve_snapshot_cusips", _fake_resolve)

    repo = SQLiteHoldingsSnapshotRepository(":memory:")
    outcome = await backfill_module._process_candidate(
        None, repo, object(), "2026-03-31", _candidate("0001-1")
    )

    assert outcome == "failed"
    # The failed candidate's transaction rolled back cleanly -- no partial row, and the
    # DB is left usable for the NEXT candidate (confirmed by not crashing here at all).
    assert repo.get_snapshot(BERKSHIRE_CIK, "2026-03-31") is None
    repo.close()

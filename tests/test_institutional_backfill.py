"""Tests for the bulk 13F ingest job (secfin.ingest.institutional_backfill).

Covers only the local, network-free candidate-discovery piece
(`find_13f_candidates`) -- the fetch step reuses `sec.institutional
.fetch_13f_snapshot_for_filing`, already covered in test_institutional.py.
"""

from __future__ import annotations

import json
import zipfile
from pathlib import Path

from secfin.ingest.institutional_backfill import find_13f_candidates

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

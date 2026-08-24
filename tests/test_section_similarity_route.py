"""Route tests for `GET /companies/{symbol}/section-similarity` (Track 2 Wave A, Stage 4). No
network.

The load-bearing behaviour: three distinct honest-absence shapes (no filing indexed at all; a
filing indexed but not yet parsed; a section parsed but with no prior filing to compare against)
never collapse into a fabricated score, and a fully-populated item reports both similarity scores.
"""

from __future__ import annotations

from fastapi.testclient import TestClient

from secfin.config import settings
from secfin.sec.filing_index import FilingIndexEntry
from secfin.sec.filing_sections import SectionResult
from secfin.storage.section_similarity_repository import SectionSimilarityRow
from secfin.storage.sqlite_filing_index_repository import SQLiteFilingIndexRepository
from secfin.storage.sqlite_filing_section_repository import SQLiteFilingSectionRepository
from secfin.storage.sqlite_section_similarity_repository import (
    SQLiteSectionSimilarityRepository,
)

_BROWSER = {"Sec-Fetch-Site": "same-origin"}
_CIK = 320193


def _configure(tmp_path, monkeypatch) -> str:
    db = str(tmp_path / "test.db")
    monkeypatch.setattr(settings, "secfin_db_path", db)
    monkeypatch.setattr(settings, "sec_user_agent", "clearyfi-test test@example.com")
    return db


def _client():
    from secfin.api.main import app

    return TestClient(app)


def test_no_filing_indexed_returns_honest_empty_state(tmp_path, monkeypatch):
    _configure(tmp_path, monkeypatch)
    with _client() as c:
        body = c.get(f"/v1/companies/{_CIK}/section-similarity", headers=_BROWSER).json()

    assert body["has_data"] is False
    assert body["accession"] is None
    assert body["items"] == []


def test_filing_indexed_but_not_parsed_reports_the_accession(tmp_path, monkeypatch):
    db = _configure(tmp_path, monkeypatch)
    fi = SQLiteFilingIndexRepository(db)
    fi.upsert_filings(_CIK, [
        FilingIndexEntry(cik=_CIK, accession="a-2026", form="10-K", filing_date="2026-01-01"),
    ])
    fi.close()

    with _client() as c:
        body = c.get(f"/v1/companies/{_CIK}/section-similarity", headers=_BROWSER).json()

    # A filing WAS found -- distinct from "nothing indexed" -- but Wave A hasn't parsed it yet.
    assert body["has_data"] is False
    assert body["accession"] == "a-2026"
    assert body["items"] == []


def test_section_parsed_but_not_found_reports_not_parsed(tmp_path, monkeypatch):
    db = _configure(tmp_path, monkeypatch)
    fi = SQLiteFilingIndexRepository(db)
    fi.upsert_filings(_CIK, [
        FilingIndexEntry(cik=_CIK, accession="a-2026", form="10-K", filing_date="2026-01-01"),
    ])
    fi.close()

    sec = SQLiteFilingSectionRepository(db)
    sec.upsert_sections(_CIK, "a-2026", [
        SectionResult(
            item_code="RF", section_name="Risk Factors", cleaned_text="", word_count=0,
            sentence_count=0, status="na", reason="No recognizable heading found.",
        ),
    ])
    sec.close()

    with _client() as c:
        body = c.get(f"/v1/companies/{_CIK}/section-similarity", headers=_BROWSER).json()

    assert body["has_data"] is True
    rf = next(i for i in body["items"] if i["item_code"] == "RF")
    assert rf["status"] == "not_parsed"
    assert rf["reason"] == "No recognizable heading found."
    assert rf["cosine_similarity"] is None


def test_ok_section_with_no_prior_reports_no_prior(tmp_path, monkeypatch):
    db = _configure(tmp_path, monkeypatch)
    fi = SQLiteFilingIndexRepository(db)
    fi.upsert_filings(_CIK, [
        FilingIndexEntry(cik=_CIK, accession="a-2026", form="10-K", filing_date="2026-01-01"),
    ])
    fi.close()

    sec = SQLiteFilingSectionRepository(db)
    sec.upsert_sections(_CIK, "a-2026", [
        SectionResult(
            item_code="RF", section_name="Risk Factors", cleaned_text="some real risk text",
            word_count=4, sentence_count=1,
        ),
    ])
    sec.close()

    with _client() as c:
        body = c.get(f"/v1/companies/{_CIK}/section-similarity", headers=_BROWSER).json()

    rf = next(i for i in body["items"] if i["item_code"] == "RF")
    assert rf["status"] == "no_prior"
    assert rf["word_count"] == 4
    assert rf["cosine_similarity"] is None


def test_ok_section_with_prior_reports_real_scores(tmp_path, monkeypatch):
    db = _configure(tmp_path, monkeypatch)
    fi = SQLiteFilingIndexRepository(db)
    fi.upsert_filings(_CIK, [
        FilingIndexEntry(cik=_CIK, accession="a-2026", form="10-K", filing_date="2026-01-01"),
        FilingIndexEntry(cik=_CIK, accession="a-2025", form="10-K", filing_date="2025-01-01"),
    ])
    fi.close()

    sec = SQLiteFilingSectionRepository(db)
    sec.upsert_sections(_CIK, "a-2026", [
        SectionResult(
            item_code="RF", section_name="Risk Factors", cleaned_text="some real risk text",
            word_count=4, sentence_count=1,
        ),
    ])
    sec.close()

    sim = SQLiteSectionSimilarityRepository(db)
    sim.upsert(SectionSimilarityRow(
        cik=_CIK, accession="a-2026", item_code="RF", prior_accession="a-2025",
        cosine_similarity=0.87, jaccard_similarity=0.72,
    ))
    sim.close()

    with _client() as c:
        body = c.get(f"/v1/companies/{_CIK}/section-similarity", headers=_BROWSER).json()

    assert body["has_data"] is True
    rf = next(i for i in body["items"] if i["item_code"] == "RF")
    assert rf["status"] == "ok"
    assert rf["cosine_similarity"] == 0.87
    assert rf["jaccard_similarity"] == 0.72
    assert rf["prior_accession"] == "a-2025"

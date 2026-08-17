"""Route tests for `GET /companies/{symbol}/filings`. No network.

The endpoint exists because nothing exposed the per-filing rows. The store has had them since
`ingest/filing_index_backfill.py`, and both `/filing-index` and `/filing-activity` read them --
but only in aggregate. So the company hub's "filing timeline" rail was drawing nine INVENTED
filings, captioned "every form as filed", for a filer with 1,001 real indexed ones. It showed
Apple filing 10-Ks in April against a 26 September fiscal year end.

That is the failure these tests are written against: a fabricated filing history is worse than an
absent one, because it is a checkable claim about a real company and it was wrong.
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


def _seed(db: str, entries: list[FilingIndexEntry]) -> None:
    repo = SQLiteFilingIndexRepository(db)
    repo.upsert_filings(_CIK, entries)
    repo.close()


def _entry(accession, form, filed, **kw) -> FilingIndexEntry:
    return FilingIndexEntry(cik=_CIK, accession=accession, form=form, filing_date=filed, **kw)


def _client():
    from secfin.api.main import app

    return TestClient(app)


def test_returns_one_row_per_filing_newest_first(tmp_path, monkeypatch):
    db = _configure(tmp_path, monkeypatch)
    _seed(db, [
        _entry("a-1", "10-Q", "2026-07-31"),
        _entry("a-2", "8-K", "2026-07-30"),
        _entry("a-3", "144", "2026-08-11"),
    ])
    with _client() as c:
        body = c.get(f"/v1/companies/{_CIK}/filings", headers=_BROWSER).json()

    assert body["status"] == "ok"
    assert [f["filed"] for f in body["filings"]] == ["2026-08-11", "2026-07-31", "2026-07-30"]
    assert [f["form"] for f in body["filings"]] == ["144", "10-Q", "8-K"]


def test_carries_the_dates_apart_because_they_are_different_facts(tmp_path, monkeypatch):
    """`filed`, `accepted` and `report_date` are three different things and the rail conflated
    them. A 10-Q filed on the 31st, accepted at 10:01 UTC, reporting on a quarter that ended the
    27th of the prior month."""
    db = _configure(tmp_path, monkeypatch)
    _seed(db, [
        _entry("a-1", "10-Q", "2026-07-31",
               acceptance_datetime="2026-07-31T10:01:02.000Z", report_date="2026-06-27"),
    ])
    with _client() as c:
        f = c.get(f"/v1/companies/{_CIK}/filings", headers=_BROWSER).json()["filings"][0]

    assert f["filed"] == "2026-07-31"
    assert f["accepted"] == "2026-07-31T10:01:02.000Z"
    assert f["report_date"] == "2026-06-27"


def test_an_event_driven_form_has_a_null_report_date_not_a_guess(tmp_path, monkeypatch):
    """An 8-K reports on an EVENT, not a period. Null is the honest answer; filling it with the
    filing date would invent a reporting period the filing does not have."""
    db = _configure(tmp_path, monkeypatch)
    _seed(db, [_entry("a-1", "144", "2026-08-11")])
    with _client() as c:
        f = c.get(f"/v1/companies/{_CIK}/filings", headers=_BROWSER).json()["filings"][0]

    assert f["report_date"] is None


def test_eight_k_items_are_codes_plus_labels_for_the_ones_we_name(tmp_path, monkeypatch):
    db = _configure(tmp_path, monkeypatch)
    _seed(db, [_entry("a-1", "8-K", "2026-07-30", items="2.02,9.01")])
    with _client() as c:
        f = c.get(f"/v1/companies/{_CIK}/filings", headers=_BROWSER).json()["filings"][0]

    assert f["items"] == ["2.02", "9.01"]
    assert f["item_labels"] == ["Results of operations", "Financial statements and exhibits"]


def test_an_unnamed_item_code_survives_in_items_rather_than_being_dropped(tmp_path, monkeypatch):
    """We label about a dozen of EDGAR's thirty-odd codes. Dropping the rest would understate a
    company's disclosure activity by whatever we happen not to have named -- so the CODE is always
    carried and only the label is missing. The two lists legitimately differ in length."""
    db = _configure(tmp_path, monkeypatch)
    _seed(db, [_entry("a-1", "8-K", "2026-07-30", items="2.02,3.03")])
    with _client() as c:
        f = c.get(f"/v1/companies/{_CIK}/filings", headers=_BROWSER).json()["filings"][0]

    assert f["items"] == ["2.02", "3.03"]
    assert f["item_labels"] == ["Results of operations"]


def test_a_non_eight_k_has_empty_items_never_a_fabricated_one(tmp_path, monkeypatch):
    db = _configure(tmp_path, monkeypatch)
    _seed(db, [_entry("a-1", "4", "2026-06-17")])
    with _client() as c:
        f = c.get(f"/v1/companies/{_CIK}/filings", headers=_BROWSER).json()["filings"][0]

    assert f["items"] == [] and f["item_labels"] == []


def test_the_page_reports_the_slice_it_is_of_the_indexed_window(tmp_path, monkeypatch):
    """The rail said "9 of 9 filings shown" for a company with 1,001. A page has to say what it is
    a page OF, or a reader reads the slice as the whole."""
    db = _configure(tmp_path, monkeypatch)
    _seed(db, [_entry(f"a-{i}", "4", f"2026-01-{i:02d}") for i in range(1, 21)])
    with _client() as c:
        body = c.get(f"/v1/companies/{_CIK}/filings?limit=5", headers=_BROWSER).json()

    assert body["returned"] == 5
    assert body["indexed_filings"] == 20
    assert body["covered_from"] == "2026-01-01" and body["covered_to"] == "2026-01-20"


def test_form_filter_restricts_without_changing_the_window(tmp_path, monkeypatch):
    """The rail's form tabs filter client-side today. Filtering server-side must not make the
    window describe the FILTERED set -- "covered_from" is a property of the index, not the slice."""
    db = _configure(tmp_path, monkeypatch)
    _seed(db, [
        _entry("a-1", "4", "2026-01-05"),
        _entry("a-2", "8-K", "2026-02-05"),
        _entry("a-3", "8-K", "2026-03-05"),
    ])
    with _client() as c:
        body = c.get(f"/v1/companies/{_CIK}/filings?form=8-K", headers=_BROWSER).json()

    assert [f["accession"] for f in body["filings"]] == ["a-3", "a-2"]
    assert body["indexed_filings"] == 3          # the INDEX, not the filtered count
    assert body["covered_from"] == "2026-01-05"  # window unchanged by the filter


def test_an_unindexed_company_is_na_never_an_empty_filing_history(tmp_path, monkeypatch):
    """The distinction the whole filing-index family exists for: "we have not looked" is not
    "this company files nothing"."""
    _configure(tmp_path, monkeypatch)

    async def _no_index(repo, client, cik):
        return 0

    monkeypatch.setattr("secfin.api.routes._ensure_filing_index", _no_index)
    with _client() as c:
        body = c.get(f"/v1/companies/{_CIK}/filings", headers=_BROWSER).json()

    assert body["status"] == "na"
    assert body["filings"] == [] and body["indexed_filings"] == 0
    assert "not the same as finding nothing" in body["reason"]


def test_limit_is_capped_so_a_caller_cannot_pull_the_whole_index(tmp_path, monkeypatch):
    _configure(tmp_path, monkeypatch)
    with _client() as c:
        assert c.get(f"/v1/companies/{_CIK}/filings?limit=5000", headers=_BROWSER).status_code == 422


def test_metadata_only_no_document_field_can_leak_in(tmp_path, monkeypatch):
    """Guardrail: this endpoint must never grow a field carrying what a filing SAID. Pinning the
    row's shape is what makes that a test failure rather than a review comment."""
    db = _configure(tmp_path, monkeypatch)
    _seed(db, [_entry("a-1", "8-K", "2026-07-30", items="2.02")])
    with _client() as c:
        f = c.get(f"/v1/companies/{_CIK}/filings", headers=_BROWSER).json()["filings"][0]

    assert set(f) == {"accession", "form", "filed", "accepted", "report_date", "items", "item_labels"}

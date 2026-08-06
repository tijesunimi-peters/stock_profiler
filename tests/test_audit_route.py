"""Tests for §06's audit events and the cover-facts store. No network.

The subject here is ABSENCE, again, and specifically the difference between two absences that
look identical in a payload:

* "we read this company's filing index and found no auditor change" -- a checked absence,
* "we have never indexed this company" -- not a finding at all.

The second must never render as the first, and the window of the first must travel with it.
"""

from __future__ import annotations

from pathlib import Path

import pytest

from secfin.api.routes import _audit_events, preferred_annual_report
from secfin.sec.cover import CoverFacts, ExtensionCensus
from secfin.sec.filing_index import FilingIndexEntry
from secfin.storage.sqlite_filing_cover_repository import SQLiteFilingCoverRepository
from secfin.storage.sqlite_filing_index_repository import SQLiteFilingIndexRepository

CIK = 320193


@pytest.fixture()
def filing_repo(tmp_path: Path):
    repo = SQLiteFilingIndexRepository(tmp_path / "t.db")
    yield repo
    repo.close()


@pytest.fixture()
def cover_repo(tmp_path: Path):
    repo = SQLiteFilingCoverRepository(tmp_path / "t.db")
    yield repo
    repo.close()


def _entry(accession: str, form: str, date: str, items: str | None = None) -> FilingIndexEntry:
    return FilingIndexEntry(
        cik=CIK, accession=accession, form=form, filing_date=date, items=items
    )


class TestAnUncheckedAbsenceIsNotAFinding:
    def test_an_unindexed_company_is_na_not_an_empty_event_list(self, filing_repo):
        result = _audit_events(filing_repo, CIK)
        assert result["status"] == "na"
        reason = result["reason"] or ""
        assert "not looked" in reason or "not been built" in reason

    def test_an_indexed_company_with_no_audit_events_reports_the_window_it_read(self, filing_repo):
        """Apple genuinely has no 4.01 or 4.02 in its indexed window. The honest sentence is
        'none among the filings we hold, which run from X to Y' -- not 'never happened'."""
        filing_repo.upsert_filings(
            CIK,
            [
                _entry("a-1", "8-K", "2015-06-01", "2.02,9.01"),
                _entry("a-2", "8-K", "2026-07-30", "5.02"),
            ],
        )
        result = _audit_events(filing_repo, CIK)
        assert result["status"] == "ok"
        assert result["events"] == []
        assert result["covered_from"] == "2015-06-01"
        assert result["covered_to"] == "2026-07-30"
        assert result["indexed_filings"] == 2


class TestEventsAreFoundByItemCode:
    def test_an_auditor_change_and_a_non_reliance_restatement_are_distinguished(self, filing_repo):
        filing_repo.upsert_filings(
            CIK,
            [
                _entry("c-1", "8-K", "2024-03-01", "4.01,9.01"),
                _entry("c-2", "8-K", "2023-11-02", "4.02"),
                _entry("c-3", "8-K", "2022-01-05", "2.02,9.01"),
            ],
        )
        events = _audit_events(filing_repo, CIK)["events"]
        assert [e["kind"] for e in events] == ["auditor_change", "non_reliance_restatement"]
        assert events[0]["filed"] == "2024-03-01"
        assert events[0]["accession"] == "c-1"

    def test_an_item_code_is_matched_whole_not_as_a_substring(self, filing_repo):
        """`items` is a comma-joined list. A substring match on '4.01' would be wrong the moment
        a code like '14.01' existed, and matching loosely here means inventing an audit event."""
        filing_repo.upsert_filings(CIK, [_entry("s-1", "8-K", "2024-01-01", "8.01,9.01")])
        assert _audit_events(filing_repo, CIK)["events"] == []

    def test_a_late_filing_notification_is_found_by_form(self, filing_repo):
        filing_repo.upsert_filings(
            CIK,
            [_entry("l-1", "NT 10-Q", "2023-08-10"), _entry("l-2", "10-K", "2024-10-30")],
        )
        late = _audit_events(filing_repo, CIK)["late_filings"]
        assert [f["form"] for f in late] == ["NT 10-Q"]


class TestTheCoverStoreFetchesOnce:
    def _facts(self, **kw) -> CoverFacts:
        base = dict(
            accession="0000320193-25-000079",
            form="10-K",
            filed="2025-10-31",
            auditor_name="Ernst & Young LLP",
            auditor_firm_id="42",
            auditor_location="San Jose, California",
            icfr_auditor_attestation=True,
            extensions=ExtensionCensus(
                namespace="http://www.apple.com/20250927",
                distinct=38,
                facts=75,
                total_facts=1081,
                top=[("CashCashEquivalentsAndMarketableSecuritiesCost", 4)],
            ),
            instance_bytes=1_420_000,
        )
        base.update(kw)
        return CoverFacts(**base)

    def test_a_stored_filing_round_trips_including_the_census(self, cover_repo):
        cover_repo.upsert_cover(CIK, self._facts())
        got = cover_repo.get_cover(CIK)
        assert got is not None
        assert got.auditor_name == "Ernst & Young LLP"
        assert got.auditor_firm_id == "42"
        assert got.icfr_auditor_attestation is True
        assert got.extensions.distinct == 38
        assert got.extensions.share == pytest.approx(75 / 1081)
        assert got.extensions.top == [("CashCashEquivalentsAndMarketableSecuritiesCost", 4)]

    def test_an_unstored_company_is_none_not_an_empty_auditor(self, cover_repo):
        """`None` means we never fetched. An empty CoverFacts would read as 'this registrant has
        no auditor', which is false of every operating company."""
        assert cover_repo.get_cover(999_999) is None

    def test_the_latest_filed_annual_report_wins_and_the_older_one_survives(self, cover_repo):
        """A 10-K/A carries its own accession. Neither overwrites the other -- same rule as
        restatements in raw_facts."""
        cover_repo.upsert_cover(CIK, self._facts(accession="old", filed="2024-11-01"))
        cover_repo.upsert_cover(
            CIK, self._facts(accession="new", filed="2025-10-31", auditor_name="PwC LLP")
        )
        assert cover_repo.get_cover(CIK).auditor_name == "PwC LLP"
        assert cover_repo.get_cover(CIK, "old").auditor_name == "Ernst & Young LLP"

    def test_re_parsing_the_same_accession_updates_rather_than_duplicates(self, cover_repo):
        cover_repo.upsert_cover(CIK, self._facts())
        cover_repo.upsert_cover(CIK, self._facts(auditor_location="Cupertino, California"))
        assert cover_repo.get_cover(CIK).auditor_location == "Cupertino, California"

    def test_an_untagged_flag_survives_the_round_trip_as_none(self, cover_repo):
        cover_repo.upsert_cover(CIK, self._facts(icfr_auditor_attestation=None))
        assert cover_repo.get_cover(CIK).icfr_auditor_attestation is None


class TestWhichAnnualReportIsRead:
    """The newest annual FILING is not always the annual REPORT.

    Tesla's newest is a 10-K/A filed 2026-04-30 -- a 5,986-byte Part III amendment that
    incorporates proxy information and carries almost none of the cover page. Reading it stored a
    shell: no Item 1C tagging, and zero Item 408(a) arrangements where the real 10-K discloses two
    named officers. §05.5 reported "no plans adopted" about a company that had adopted two.
    """

    @staticmethod
    def _f(form: str, date: str) -> FilingIndexEntry:
        return FilingIndexEntry(cik=CIK, accession=f"a-{date}", form=form, filing_date=date)

    def test_an_original_beats_a_newer_amendment(self):
        chosen = preferred_annual_report(
            [self._f("10-K/A", "2026-04-30"), self._f("10-K", "2026-01-29")]
        )
        assert chosen.form == "10-K"
        assert chosen.filing_date == "2026-01-29"

    def test_the_newest_original_wins_among_originals(self):
        chosen = preferred_annual_report(
            [self._f("10-K", "2026-01-29"), self._f("10-K", "2025-01-30")]
        )
        assert chosen.filing_date == "2026-01-29"

    def test_an_amendment_is_used_when_no_original_is_indexed(self):
        # EDGAR's rolling window can move past the original; an amendment is then all there is.
        chosen = preferred_annual_report([self._f("10-K/A", "2026-04-30")])
        assert chosen.form == "10-K/A"

    def test_a_20f_is_treated_the_same_way(self):
        chosen = preferred_annual_report(
            [self._f("20-F/A", "2026-05-01"), self._f("20-F", "2026-02-01")]
        )
        assert chosen.form == "20-F"

    def test_nothing_indexed_is_none_not_an_error(self):
        assert preferred_annual_report([]) is None

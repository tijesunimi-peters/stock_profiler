"""Pure unit tests for normalize/supply.py and sec/filing_index.py -- no DB, no network.

The rule these exist to protect: **an absence over a WINDOW is not an absence over HISTORY**, and
"we have not looked" is not "we looked and found none". The prototype asserted three absences
having never read a filing index; every test below is about not doing that again.
"""

from __future__ import annotations

from secfin.normalize.supply import SUPPLY_ORDER, acceptance_lag, supply_events
from secfin.sec.filing_index import FilingIndexEntry, parse_filing_index


def _e(form: str, filed: str, *, accession: str | None = None, accepted: str | None = None,
       report: str | None = None) -> FilingIndexEntry:
    return FilingIndexEntry(
        cik=320193,
        accession=accession or f"acc-{form}-{filed}",
        form=form,
        filing_date=filed,
        acceptance_datetime=accepted,
        report_date=report,
    )


class TestParseFilingIndex:
    def test_flattens_the_parallel_arrays(self):
        payload = {"filings": {"recent": {
            "form": ["4", "S-3ASR", "8-K"],
            "accessionNumber": ["a1", "a2", "a3"],
            "filingDate": ["2026-01-02", "2026-02-03", "2026-03-04"],
            "acceptanceDateTime": ["2026-01-02T10:00:00.000Z", "", "2026-03-04T18:40:00.000Z"],
            "reportDate": ["2025-12-31", "", "2026-03-04"],
            "items": ["", "", "5.02,9.01"],
            "primaryDocument": ["f4.xml", "s3.htm", "8k.htm"],
            "size": [1000, 2000, 3000],
        }}}
        rows = parse_filing_index(payload, 320193)
        assert [r.form for r in rows] == ["4", "S-3ASR", "8-K"]
        assert rows[2].items == "5.02,9.01"
        assert rows[0].acceptance_datetime == "2026-01-02T10:00:00.000Z"

    def test_empty_strings_become_none_not_empty_strings(self):
        """EDGAR writes "" for not-applicable; a consumer must not have to tell them apart."""
        payload = {"filings": {"recent": {
            "form": ["S-3ASR"], "accessionNumber": ["a2"], "filingDate": ["2026-02-03"],
            "acceptanceDateTime": [""], "reportDate": [""], "items": [""],
        }}}
        row = parse_filing_index(payload, 320193)[0]
        assert row.acceptance_datetime is None
        assert row.report_date is None
        assert row.items is None

    def test_a_missing_column_does_not_crash(self):
        """Not every company's payload carries every field."""
        payload = {"filings": {"recent": {
            "form": ["4"], "accessionNumber": ["a1"], "filingDate": ["2026-01-02"],
        }}}
        row = parse_filing_index(payload, 320193)[0]
        assert row.acceptance_datetime is None and row.size is None

    def test_forms_filter_is_exact(self):
        """S-3 and S-3ASR are different EDGAR tokens; a caller wanting both must ask for both."""
        payload = {"filings": {"recent": {
            "form": ["S-3", "S-3ASR"], "accessionNumber": ["a1", "a2"],
            "filingDate": ["2026-01-02", "2026-02-03"],
        }}}
        assert [r.form for r in parse_filing_index(payload, 1, forms={"S-3"})] == ["S-3"]

    def test_a_row_with_no_accession_is_skipped(self):
        payload = {"filings": {"recent": {
            "form": ["4", "4"], "accessionNumber": ["", "a2"],
            "filingDate": ["2026-01-02", "2026-02-03"],
        }}}
        assert [r.accession for r in parse_filing_index(payload, 1)] == ["a2"]


class TestSupplyEvents:
    def test_nothing_indexed_is_na_never_a_confident_zero(self):
        """The whole point: a count of nothing over nothing is not a finding."""
        r = supply_events([], indexed_count=0)
        assert r.status == "na"
        assert r.categories == []
        assert "we have not looked" in (r.reason or "")

    def test_indexed_with_no_match_is_a_CHECKED_absence(self):
        r = supply_events(
            [_e("4", "2026-01-02")], indexed_count=1,
            covered_from="2026-01-02", covered_to="2026-01-02",
        )
        assert r.status == "ok"
        tender = next(c for c in r.categories if c.key == "tender_offer")
        assert tender.count == 0
        assert tender.latest_filed is None
        # The window is what makes the zero honest.
        assert r.covered_from == "2026-01-02" and r.covered_to == "2026-01-02"

    def test_categories_group_by_form_and_report_the_newest(self):
        r = supply_events(
            [
                _e("S-3ASR", "2024-11-01"),
                _e("S-8", "2025-09-26"),
                _e("424B2", "2025-05-06"),
                _e("25-NSE", "2025-11-14"),
            ],
            indexed_count=4,
        )
        by = {c.key: c for c in r.categories}
        assert by["registration"].count == 2
        assert by["registration"].latest_filed == "2025-09-26"
        assert by["registration"].latest_form == "S-8"
        assert by["prospectus"].count == 1
        assert by["delisting"].count == 1

    def test_every_category_appears_even_when_empty(self):
        """A missing row would read as 'not applicable' rather than 'none found'."""
        r = supply_events([_e("4", "2026-01-02")], indexed_count=1)
        assert [c.key for c in r.categories] == list(SUPPLY_ORDER)

    def test_the_terms_boundary_is_stated_not_implied(self):
        cannot = supply_events([_e("S-3", "2026-01-02")], indexed_count=1).cannot
        assert "never their contents" in cannot
        assert "lock-up" in cannot.lower()
        assert "window we indexed" in cannot


class TestAcceptanceLag:
    def test_measures_acceptance_against_the_reported_period(self):
        r = acceptance_lag([
            _e("13F-HR", "2026-05-15", accepted="2026-05-15T14:00:00Z", report="2026-03-31"),
            _e("13F-HR", "2026-05-10", accepted="2026-05-10T14:00:00Z", report="2026-03-31"),
        ])
        assert r.status == "ok"
        assert r.filing_count == 2
        # 40 and 45 days after 2026-03-31; an even count, so the median is the midpoint.
        assert r.median_days == 42.5
        assert r.all_from_acceptance is True

    def test_falls_back_to_the_filing_date_and_SAYS_so(self):
        """The two are different quantities; substituting silently would misreport the measure."""
        r = acceptance_lag([
            _e("13F-HR", "2026-05-15", report="2026-03-31"),  # no acceptance timestamp
            _e("13F-HR", "2026-05-10", accepted="2026-05-10T14:00:00Z", report="2026-03-31"),
        ])
        assert r.all_from_acceptance is False
        assert r.fell_back_to_filing_date == 1
        assert "no acceptance timestamp" in (r.reason or "")

    def test_buckets_are_one_per_day_and_contiguous(self):
        r = acceptance_lag([
            _e("13F-HR", "2026-04-01", accepted="2026-04-01T00:00:00Z", report="2026-03-31"),
            _e("13F-HR", "2026-04-03", accepted="2026-04-03T00:00:00Z", report="2026-03-31"),
        ])
        assert r.days == [1, 2, 3]
        assert r.counts == [1, 0, 1]  # the empty middle day is kept, not collapsed

    def test_period_end_restricts_to_that_quarter(self):
        rows = [
            _e("13F-HR", "2026-05-15", accepted="2026-05-15T00:00:00Z", report="2026-03-31"),
            _e("13F-HR", "2026-02-14", accepted="2026-02-14T00:00:00Z", report="2025-12-31"),
        ]
        assert acceptance_lag(rows, period_end="2026-03-31").filing_count == 1

    def test_nothing_measurable_is_na_with_a_reason(self):
        r = acceptance_lag([_e("13F-HR", "2026-05-15")])  # no report date
        assert r.status == "na"
        assert r.counts == []
        assert "missing coverage" in (r.reason or "")

    def test_a_negative_lag_is_dropped_as_a_bad_row_not_charted(self):
        """Acceptance before the period it reports on is impossible, so it is data, not speed."""
        r = acceptance_lag([
            _e("13F-HR", "2026-03-01", accepted="2026-03-01T00:00:00Z", report="2026-03-31"),
            _e("13F-HR", "2026-05-15", accepted="2026-05-15T00:00:00Z", report="2026-03-31"),
        ])
        assert r.filing_count == 1
        assert r.days == [45]

    def test_the_deadline_caveat_travels_with_the_numbers(self):
        r = acceptance_lag([
            _e("13F-HR", "2026-05-15", accepted="2026-05-15T00:00:00Z", report="2026-03-31"),
        ])
        assert "45 days" in r.cannot
        assert "never complete before then" in r.cannot

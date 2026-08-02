"""Pure tests for `ingest/sic_backfill.py`'s payload shaping -- no DB, no network.

The one these exist to protect: **first-filing date must come from the FULL history**. EDGAR's
`filings.recent` is a rolling window, so reading it alone understates how long a prolific filer
has been filing -- by two decades, in Apple's case.
"""

from __future__ import annotations

from secfin.ingest.sic_backfill import extract_profile

class TestExtractProfile:
    """The cover-page identity, shaped from one `/submissions/` payload.

    Field names verified against Apple's live payload 2026-08-02 — typed from the real thing
    rather than from memory, which is how `stateOfIncorporation` and `fiscalYearEnd` get their
    exact spelling.
    """

    def _payload(self, **over):
        base = {
            "cik": "0000320193", "name": "Apple Inc.", "sic": "3571",
            "sicDescription": "Electronic Computers", "stateOfIncorporation": "CA",
            "fiscalYearEnd": "0926", "category": "Large accelerated filer",
            "ein": "942404110", "exchanges": ["Nasdaq"],
            "addresses": {"business": {"city": "CUPERTINO", "stateOrCountry": "CA"}},
            "filings": {
                "recent": {"filingDate": ["2026-07-31", "2015-06-01"]},
                "files": [{"filingFrom": "1994-01-26", "filingTo": "2015-05-30"}],
            },
        }
        base.update(over)
        return base

    def test_maps_every_cover_page_field(self):
        p = extract_profile(self._payload(), 320193)
        assert (p.cik, p.name, p.sic) == (320193, "Apple Inc.", "3571")
        assert p.state_of_incorporation == "CA"
        assert (p.hq_city, p.hq_state) == ("CUPERTINO", "CA")
        assert p.fiscal_year_end == "0926"
        assert p.filer_category == "Large accelerated filer"
        assert p.exchanges == "Nasdaq"

    def test_first_filing_reads_the_FULL_history_not_the_recent_window(self):
        """The load-bearing one: `filings.recent` is a rolling window.

        Reading it alone would date Apple's first filing to 2015 when EDGAR holds it from 1994.
        An absence over a window is not an absence over history.
        """
        assert extract_profile(self._payload(), 320193).first_filing_date == "1994-01-26"

    def test_falls_back_to_the_recent_window_when_there_is_no_older_history(self):
        p = extract_profile(self._payload(filings={"recent": {"filingDate": ["2021-04-02"]}}), 1)
        assert p.first_filing_date == "2021-04-02"

    def test_empty_strings_become_none_not_empty_values(self):
        """EDGAR writes "" for not-applicable. Stored as-is it would render as a blank FACT."""
        p = extract_profile(self._payload(stateOfIncorporation="", category="", ein=""), 1)
        assert p.state_of_incorporation is None
        assert p.filer_category is None
        assert p.ein is None

    def test_exchanges_are_deduplicated(self):
        """EDGAR lists one entry per REGISTERED SECURITY, not per venue.

        JPMorgan has nine registered classes and so reports "NYSE" nine times. Found by looking at
        a real response, not by reading the schema — the naive join rendered
        "NYSE, NYSE, NYSE, ..." on the cover-page card.
        """
        p = extract_profile(self._payload(exchanges=["NYSE"] * 9), 19617)
        assert p.exchanges == "NYSE"

    def test_exchanges_keep_order_when_genuinely_multiple(self):
        p = extract_profile(self._payload(exchanges=["Nasdaq", "NYSE", "Nasdaq"]), 1)
        assert p.exchanges == "Nasdaq, NYSE"

    def test_a_payload_missing_everything_does_not_raise(self):
        p = extract_profile({}, 42)
        assert p.cik == 42
        assert p.sic is None and p.hq_city is None and p.first_filing_date is None

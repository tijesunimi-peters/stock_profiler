"""Tests for §05.4's Section 16 tally -- `summarize_insider_transactions`.

The counts look trivial and are not. Each test below pins one way a naive tally reads a real
Apple/Coca-Cola filing wrong:

* an option exercise files TWO rows, so counting both reports one event as two dispositions,
* a Form 3 (and a Form 4's "shares owned following") is a balance, not a trade,
* `is_derivative is None` means nobody classified the row -- treating it as "not a derivative"
  readmits exactly what the exclusion exists to keep out,
* the A/D flag counts vesting and tax withholding as acquisitions and dispositions,
* the window is bounded by FILINGS, so its date span is a finding, never an assumption,
* pre-2022 filings predate the 10b5-1 box, so the flag needs a denominator.
"""

from __future__ import annotations

from secfin.normalize.insider_summary import (
    OPEN_MARKET_CODES,
    TRANSACTION_CODES,
    summarize_insider_transactions,
)
from secfin.normalize.schema import InsiderTransaction

CIK = 320193


def _row(
    *,
    code: str | None = "S",
    ad: str | None = "D",
    shares: float = 1_000.0,
    date: str = "2026-06-15",
    filed: str = "2026-06-17",
    holding: bool = False,
    derivative: bool | None = False,
    plan: bool | None = False,
    owner: str = "Newstead Jennifer",
    accession: str = "0001140361-26-025620",
    form: str = "4",
) -> InsiderTransaction:
    return InsiderTransaction(
        issuer_cik=CIK,
        owner_name=owner,
        owner_relationship="officer (SVP, GC and Secretary)",
        transaction_date=date,
        security_title="Common Stock",
        shares=shares,
        acquired_disposed=ad,
        transaction_code=code,
        form_type=form,
        accession=accession,
        filed=filed,
        is_holding=holding,
        is_derivative=derivative,
        rule_10b5_1=plan,
    )


class TestExclusions:
    """The three row kinds that must not be counted, and why."""

    def test_an_option_exercise_counts_once_not_twice(self):
        # The shape a real Form 4 files for one exercise: the RSU leaves (derivative, D) and
        # the common stock arrives (non-derivative, A). Counting both would report a
        # disposition that never happened.
        summary = summarize_insider_transactions(
            CIK,
            [
                _row(code="M", ad="A", derivative=False, shares=30_104),
                _row(code="M", ad="D", derivative=True, shares=30_104),
            ],
        )
        assert summary.transactions == 1
        assert (summary.acquisitions, summary.dispositions) == (1, 0)
        assert summary.derivative_excluded == 1

    def test_holdings_are_balances_not_trades(self):
        summary = summarize_insider_transactions(
            CIK,
            [
                _row(code="S", ad="D"),
                _row(code=None, ad=None, holding=True, form="3"),
                _row(code=None, ad=None, holding=True, form="3"),
            ],
        )
        assert summary.transactions == 1
        assert summary.holdings_excluded == 2

    def test_an_unknown_derivative_flag_is_excluded_and_reported(self):
        # `None` is "nobody classified this row" -- rows cached before the column existed.
        # Defaulting it to False would count option rows as stock.
        summary = summarize_insider_transactions(
            CIK, [_row(derivative=None), _row(derivative=None), _row(derivative=False)]
        )
        assert summary.transactions == 1
        assert summary.derivative_unknown == 2
        assert summary.derivative_excluded == 0  # unknown is not the same as known-derivative


class TestWhatTheCountsMean:
    def test_ad_counts_include_vesting_and_tax_withholding(self):
        # This is the point of reporting the open-market subset separately: all four rows are
        # real A/D events, and only the P/S pair is a decision to trade.
        summary = summarize_insider_transactions(
            CIK,
            [
                _row(code="M", ad="A"),  # option exercise
                _row(code="F", ad="D"),  # shares withheld for tax
                _row(code="P", ad="A"),  # open-market purchase
                _row(code="S", ad="D"),  # open-market sale
            ],
        )
        assert (summary.acquisitions, summary.dispositions) == (2, 2)
        assert summary.net == 0
        assert summary.direction == "balanced"
        assert (summary.open_market_purchases, summary.open_market_sales) == (1, 1)

    def test_open_market_is_exactly_p_and_s(self):
        # Pinned because analytical/sector_insider_flow filters on the same two codes -- the
        # company card and the sector strip must not disagree about the word "open-market".
        assert OPEN_MARKET_CODES == {"P", "S"}

    def test_direction_names_the_sign(self):
        buys = summarize_insider_transactions(CIK, [_row(code="P", ad="A")])
        sells = summarize_insider_transactions(CIK, [_row(code="S", ad="D")])
        assert (buys.net, buys.direction) == (1, "net acquisitions")
        assert (sells.net, sells.direction) == (-1, "net dispositions")


class TestWindow:
    def test_the_window_is_reported_not_assumed(self):
        # Ten filings spanning 2022 is a real filer (AAME) -- the span is a finding.
        summary = summarize_insider_transactions(
            CIK,
            [
                _row(date="2022-05-01", filed="2022-09-08", accession="a"),
                _row(date="2022-12-30", filed="2023-02-13", accession="b"),
            ],
        )
        assert (summary.window_start, summary.window_end) == ("2022-05-01", "2022-12-30")
        assert summary.filings == 2

    def test_recent_rows_are_newest_first(self):
        summary = summarize_insider_transactions(
            CIK,
            [
                _row(date="2026-04-01", accession="a"),
                _row(date="2026-06-16", accession="b"),
                _row(date="2026-05-07", accession="c"),
            ],
        )
        assert [r.transaction_date for r in summary.recent] == [
            "2026-06-16",
            "2026-05-07",
            "2026-04-01",
        ]

    def test_recent_is_capped_but_the_counts_are_not(self):
        rows = [_row(date=f"2026-06-{d:02d}", accession=str(d)) for d in range(1, 26)]
        summary = summarize_insider_transactions(CIK, rows)
        assert summary.transactions == 25
        assert len(summary.recent) == 10


class TestPlanFlag:
    def test_plan_flag_carries_its_denominator(self):
        # Pre-2022 filings predate the Form 4 cover box. "1 under a plan" out of 3 rows would
        # imply the other two were discretionary when only one of them was classified at all.
        summary = summarize_insider_transactions(
            CIK, [_row(plan=True), _row(plan=False), _row(plan=None)]
        )
        assert (summary.plan_flagged, summary.plan_known) == (1, 2)

    def test_a_filer_predating_the_box_reports_nothing_known(self):
        summary = summarize_insider_transactions(CIK, [_row(plan=None), _row(plan=None)])
        assert (summary.plan_flagged, summary.plan_known) == (0, 0)


class TestEmptyStates:
    def test_no_filings_is_na_with_a_reason(self):
        # A real case: SEC's ticker map moved XOM to a new holdco registrant with no Section 16
        # filings yet. Zero is not the answer -- "we have none" is.
        summary = summarize_insider_transactions(2115436, [])
        assert summary.status == "na"
        assert summary.reason
        assert summary.transactions == 0
        assert summary.recent == []

    def test_filings_that_are_all_holdings_are_na_not_zero(self):
        summary = summarize_insider_transactions(
            CIK, [_row(code=None, ad=None, holding=True, form="3")]
        )
        assert summary.status == "na"
        assert summary.filings == 1
        assert summary.holdings_excluded == 1
        assert "opening-balance" in (summary.reason or "")

    def test_a_populated_summary_is_ok(self):
        assert summarize_insider_transactions(CIK, [_row()]).status == "ok"


class TestCodeLabels:
    def test_every_counted_row_carries_both_readings_of_its_code(self):
        row = summarize_insider_transactions(CIK, [_row(code="F", ad="D")]).recent[0]
        assert row.code_short == "tax withholding"
        assert row.code_label == "shares withheld for exercise price or tax"

    def test_an_unknown_code_is_carried_not_dropped(self):
        # The code set is open-ended; a row with a code we don't recognise still happened.
        summary = summarize_insider_transactions(CIK, [_row(code="Q", ad="D")])
        assert summary.transactions == 1
        assert summary.recent[0].transaction_code == "Q"
        assert summary.recent[0].code_short is None
        assert summary.recent[0].code_label is None

    def test_the_legend_covers_the_codes_real_filings_use(self):
        # Observed across AAPL/MSFT/KO/JPM/NVDA/AAME/T, 2026-08-04.
        for code in ("P", "S", "A", "D", "F", "M", "G", "J"):
            assert TRANSACTION_CODES[code].short
            assert TRANSACTION_CODES[code].full


class TestMalformedDates:
    """1,838 rows across 188 issuers carry a UTC offset on a date-only field (measured
    2026-08-04). `sec/insider.py` strips it on parse now; these pin that already-cached rows
    still read and sort correctly without migrating the store."""

    def test_a_utc_offset_is_dropped_from_a_date_only_field(self):
        summary = summarize_insider_transactions(
            CIK, [_row(date="2019-11-04-07:00", accession="a")]
        )
        assert summary.window_start == "2019-11-04"
        assert summary.recent[0].transaction_date == "2019-11-04"

    def test_offset_dates_still_sort_against_clean_ones(self):
        summary = summarize_insider_transactions(
            CIK,
            [
                _row(date="2019-11-04-07:00", accession="a"),
                _row(date="2020-03-29", accession="b"),
                _row(date="2019-06-01-05:00", accession="c"),
            ],
        )
        assert [r.transaction_date for r in summary.recent] == [
            "2020-03-29",
            "2019-11-04",
            "2019-06-01",
        ]
        assert (summary.window_start, summary.window_end) == ("2019-06-01", "2020-03-29")

    def test_an_unrecognisable_date_is_passed_through_not_guessed_at(self):
        summary = summarize_insider_transactions(CIK, [_row(date="not a date")])
        assert summary.recent[0].transaction_date == "not a date"

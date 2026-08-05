"""Summarise Section 16 activity from Form 3/4/5 rows.

`/insider-trades` returns rows; a summary card needs counts. Doing that tally in a client is
how an option exercise becomes two dispositions and a tax withholding becomes a decision to
sell -- so it lives here, once, with the exclusions and the coverage it has to report.

**What the counts are not.** `acquisitions` / `dispositions` are the SEC's A/D flag, which
marks direction of share movement and nothing about intent: an RSU vesting is an acquisition
and the shares withheld to pay its tax are a disposition. The subset that is a decision to
trade is codes P and S, reported separately. Neither number is a signal, and the module
deliberately computes no ratio between them.

The code legend is the one printed on Form 4 itself. Unknown codes are carried through with a
null label rather than dropped -- the code set is open-ended (see InsiderTransaction).
"""

from __future__ import annotations

import re
from collections.abc import Iterable, Sequence
from typing import NamedTuple

from secfin.normalize.schema import InsiderSummary, InsiderSummaryRow, InsiderTransaction


class CodeLabel(NamedTuple):
    """Two readings of one transaction code.

    Both live here rather than half here and half in a client, so the short form a table cell
    shows and the full form its tooltip shows cannot drift apart.
    """

    short: str  # fits a table cell beside a share count
    full: str  # the Form 4 legend's own meaning


# The Form 3/4/5 transaction-code legend, verbatim in meaning. Table I and Table II share it.
TRANSACTION_CODES: dict[str, CodeLabel] = {
    # General transaction codes
    "P": CodeLabel("purchase", "open-market or private purchase"),
    "S": CodeLabel("sale", "open-market or private sale"),
    "V": CodeLabel("voluntary report", "voluntarily reported early"),
    # Rule 16b-3 transaction codes
    "A": CodeLabel("grant or award", "grant, award or other acquisition"),
    "D": CodeLabel("returned to issuer", "disposition to the issuer"),
    "F": CodeLabel("tax withholding", "shares withheld for exercise price or tax"),
    "I": CodeLabel("discretionary", "discretionary transaction"),
    "M": CodeLabel("exercise", "exercise or conversion of a derivative"),
    # Derivative securities codes
    "C": CodeLabel("conversion", "conversion of a derivative"),
    "E": CodeLabel("short expired", "expiration of a short derivative position"),
    "H": CodeLabel("long expired", "expiration of a long derivative position, value received"),
    "O": CodeLabel("exercise, out of the money", "exercise of an out-of-the-money derivative"),
    "X": CodeLabel("exercise, in the money", "exercise of an in- or at-the-money derivative"),
    # Other section 16(b) exempt transaction and small acquisition codes
    "G": CodeLabel("gift", "bona fide gift"),
    "L": CodeLabel("small acquisition", "small acquisition under Rule 16a-6"),
    "W": CodeLabel("will or descent", "acquisition or disposition by will or descent"),
    "Z": CodeLabel("voting trust", "deposit into or withdrawal from a voting trust"),
    # Other transaction codes
    "J": CodeLabel("other, footnoted", "other acquisition or disposition (footnoted)"),
    "K": CodeLabel("equity swap", "equity swap or similar instrument"),
    "U": CodeLabel("change-of-control tender", "tender of shares in a change-of-control"),
}

# The two codes that record a decision to trade in the market rather than a mechanical
# consequence of a compensation plan. Same filter as analytical/sector_insider_flow, so the
# company card and the sector strip cannot disagree about what "open-market" means.
OPEN_MARKET_CODES = frozenset({"P", "S"})

_DATE_PREFIX = re.compile(r"^\d{4}-\d{2}-\d{2}")

# How many counted rows to carry for display. A cap, not a layout decision -- callers render
# as few as they like from the newest end.
_RECENT_CAP = 10


def _date_only(value: str | None) -> str | None:
    """The calendar date, dropping a trailing UTC offset some filers tag on a date-only field.

    `sec/insider.py` now strips this on parse, but rows cached before it did still carry values
    like `2019-11-04-07:00` -- 1,838 of them across 188 issuers when measured on 2026-08-04. The
    offset is meaningless on a date and it breaks both parsing and ordering, so it is dropped
    here too rather than migrating the store. Anything that is not a leading `YYYY-MM-DD` passes
    through untouched.
    """
    if value and len(value) > 10 and _DATE_PREFIX.match(value):
        return value[:10]
    return value


def _sort_key(row: InsiderTransaction) -> tuple[str, str]:
    """Newest first, by transaction date then filing date. Missing dates sort last."""
    return (_date_only(row.transaction_date) or "", row.filed or "")


def _countable(rows: Iterable[InsiderTransaction]) -> list[InsiderTransaction]:
    """Rows that represent one distinct transaction in owned stock.

    Excludes holdings (a balance, not an event) and derivative rows (the other half of an
    exercise, whose share count is the underlying, not stock). A row whose `is_derivative`
    is None is UNKNOWN and is excluded as well -- see InsiderSummary.
    """
    return [r for r in rows if not r.is_holding and r.is_derivative is False]


def summarize_insider_transactions(
    cik: int, rows: Sequence[InsiderTransaction]
) -> InsiderSummary:
    """Tally Form 3/4/5 rows into the counts a summary card can render.

    `rows` is whatever the caller read -- this function makes no claim about how far back
    that reaches, and reports the window it found rather than the one it was asked for.
    """
    if not rows:
        return InsiderSummary(
            cik=cik,
            status="na",
            reason=(
                "No Form 3/4/5 filings are on file for this company, which is not the same as "
                "no insider trading. Foreign private issuers are exempt from Section 16 "
                "entirely, and a company whose ticker has just moved to a new registrant has "
                "no filings under it yet."
            ),
        )

    filings = len({r.accession for r in rows if r.accession})
    holdings = sum(1 for r in rows if r.is_holding)
    derivative = sum(1 for r in rows if not r.is_holding and r.is_derivative is True)
    derivative_unknown = sum(1 for r in rows if not r.is_holding and r.is_derivative is None)

    counted = sorted(_countable(rows), key=_sort_key, reverse=True)
    if not counted:
        return InsiderSummary(
            cik=cik,
            filings=filings,
            holdings_excluded=holdings,
            derivative_excluded=derivative,
            derivative_unknown=derivative_unknown,
            status="na",
            reason=(
                f"The {filings} Form 3/4/5 filing(s) read carry no transaction in owned stock "
                "-- they are opening-balance statements, derivative rows, or both."
            ),
        )

    acquisitions = sum(1 for r in counted if r.acquired_disposed == "A")
    dispositions = sum(1 for r in counted if r.acquired_disposed == "D")
    net = acquisitions - dispositions
    dates = sorted(_date_only(r.transaction_date) for r in counted if r.transaction_date)

    return InsiderSummary(
        cik=cik,
        filings=filings,
        transactions=len(counted),
        window_start=dates[0] if dates else None,
        window_end=dates[-1] if dates else None,
        acquisitions=acquisitions,
        dispositions=dispositions,
        net=net,
        direction=(
            "net acquisitions" if net > 0 else "net dispositions" if net < 0 else "balanced"
        ),
        open_market_purchases=sum(1 for r in counted if r.transaction_code == "P"),
        open_market_sales=sum(1 for r in counted if r.transaction_code == "S"),
        plan_flagged=sum(1 for r in counted if r.rule_10b5_1 is True),
        plan_known=sum(1 for r in counted if r.rule_10b5_1 is not None),
        holdings_excluded=holdings,
        derivative_excluded=derivative,
        derivative_unknown=derivative_unknown,
        recent=[_display_row(r) for r in counted[:_RECENT_CAP]],
    )


def _display_row(row: InsiderTransaction) -> InsiderSummaryRow:
    label = TRANSACTION_CODES.get(row.transaction_code or "")
    return InsiderSummaryRow(
        owner_name=row.owner_name,
        owner_relationship=row.owner_relationship,
        transaction_date=_date_only(row.transaction_date),
        security_title=row.security_title,
        shares=row.shares,
        acquired_disposed=row.acquired_disposed,
        transaction_code=row.transaction_code,
        code_short=label.short if label else None,
        code_label=label.full if label else None,
        rule_10b5_1=row.rule_10b5_1,
        form_type=row.form_type,
        accession=row.accession,
    )

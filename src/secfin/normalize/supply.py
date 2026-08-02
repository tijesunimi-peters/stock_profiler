"""Supply-side events: which share-supply filings exist, and when -- never what they say.

§06's "Supply-side events" card. The prototype asserted three absences outright ("No lock-up
restrictions currently on file", "No tender offer on file", "No Form 25 or Form 15 filed") having
never looked at a filing index. This module is what makes the same statement *earned*: every
answer is scoped to the window we actually hold, and says so.

## The rule this module exists to enforce

**An absence over a WINDOW is not an absence over HISTORY.** `filings.recent` is EDGAR's rolling
window, so "none on file" can only ever mean "none among the filings we indexed, which run from X
to Y". Every result carries that window, and `status` is `"na"` -- never a confident "none" --
when we have indexed nothing at all for the company.

## The boundary that does not move

**Existence and date. Never terms.** A registration statement establishes that shares *may* be
resold; it does not say a sale occurred, how many shares it covers, or how long a lock-up runs.
Lock-up length in particular lives in an underwriting-agreement exhibit -- prose, Track 2 -- so
the lock-up question stays unanswerable no matter how complete the index gets. `cannot` says so,
and a caller must not soften it.

Pure: no DB, no network, no clock.
"""

from __future__ import annotations

from dataclasses import dataclass, field

from secfin.sec.filing_index import FilingIndexEntry

# Each supply category and the EDGAR form tokens that constitute it. Tokens are EXACT -- "S-3"
# and "S-3ASR" are different forms, and a category wanting both must list both.
SUPPLY_CATEGORIES: dict[str, tuple[str, tuple[str, ...]]] = {
    "registration": (
        "Registration statements",
        ("S-1", "S-1/A", "S-3", "S-3/A", "S-3ASR", "S-8", "S-8 POS", "F-1", "F-3"),
    ),
    "prospectus": ("Prospectus supplements", ("424B2", "424B3", "424B4", "424B5", "424B7")),
    "tender_offer": (
        "Tender offers",
        ("SC TO-I", "SC TO-T", "SC TO-I/A", "SC TO-T/A", "SC 14D9", "SC 14D9/A"),
    ),
    "delisting": ("Delisting or deregistration", ("25", "25-NSE", "15-12B", "15-12G", "15-15D")),
    "insider_notice": ("Proposed-sale notices", ("144", "144/A")),
}

# Rendered in this order; registration first because it is the one that actually bears on share
# supply, and the proposed-sale notices last because they are the most numerous and least
# structural.
SUPPLY_ORDER: tuple[str, ...] = (
    "registration",
    "prospectus",
    "tender_offer",
    "delisting",
    "insider_notice",
)

_SUPPLY_CANNOT = (
    "This is the EXISTENCE and DATE of filings, never their contents. A registration statement "
    "establishes which shares MAY be resold; it does not say a sale occurred, how many shares it "
    "covers, or on what terms. Lock-up length in particular lives in an underwriting-agreement "
    "exhibit -- free text this product does not parse -- so no count here answers whether a "
    "lock-up is in force. And an absence is only ever an absence over the window we indexed."
)


@dataclass
class SupplyCategory:
    key: str
    label: str
    forms: list[str]
    count: int
    latest_filed: str | None = None
    latest_form: str | None = None
    latest_accession: str | None = None


@dataclass
class SupplyEvents:
    status: str  # "ok" | "na"
    reason: str | None
    formula: str
    cannot: str
    population: str
    categories: list[SupplyCategory] = field(default_factory=list)
    indexed_count: int = 0
    # The window every "none" above is scoped to. Without it a zero is a claim about history.
    covered_from: str | None = None
    covered_to: str | None = None


def supply_events(
    entries: list[FilingIndexEntry],
    *,
    indexed_count: int,
    covered_from: str | None = None,
    covered_to: str | None = None,
) -> SupplyEvents:
    """Group indexed filings into share-supply categories.

    `indexed_count` is how many filings we hold for this company IN TOTAL -- not how many matched.
    It is what separates "we looked and found none" from "we have not looked", and with zero the
    result is `status="na"`, because a count of nothing over nothing is not a finding.
    """
    formula = (
        "filings grouped by EDGAR form token into share-supply categories, counted over the "
        "indexed window; a category with no filing is a checked absence over that window"
    )
    population = (
        "filings in this company's indexed submissions window"
        + (f", {covered_from} to {covered_to}" if covered_from and covered_to else "")
    )

    if indexed_count <= 0:
        return SupplyEvents(
            status="na",
            reason=(
                "no filing index has been ingested for this company, so we have not looked -- "
                "which is different from having looked and found nothing, and only the second "
                "would justify saying a form is not on file"
            ),
            formula=formula,
            cannot=_SUPPLY_CANNOT,
            population=population,
            indexed_count=0,
            covered_from=covered_from,
            covered_to=covered_to,
        )

    by_form: dict[str, list[FilingIndexEntry]] = {}
    for e in entries:
        by_form.setdefault(e.form, []).append(e)

    categories: list[SupplyCategory] = []
    for key in SUPPLY_ORDER:
        label, forms = SUPPLY_CATEGORIES[key]
        matched: list[FilingIndexEntry] = []
        for form in forms:
            matched.extend(by_form.get(form, []))
        matched.sort(key=lambda e: (e.filing_date or "", e.accession), reverse=True)
        newest = matched[0] if matched else None
        categories.append(
            SupplyCategory(
                key=key,
                label=label,
                forms=list(forms),
                count=len(matched),
                latest_filed=newest.filing_date if newest else None,
                latest_form=newest.form if newest else None,
                latest_accession=newest.accession if newest else None,
            )
        )

    return SupplyEvents(
        status="ok",
        reason=None,
        formula=formula,
        cannot=_SUPPLY_CANNOT,
        population=population,
        categories=categories,
        indexed_count=indexed_count,
        covered_from=covered_from,
        covered_to=covered_to,
    )


@dataclass
class AcceptanceLag:
    """How long after a period ended its filings were ACCEPTED by EDGAR."""

    status: str
    reason: str | None
    formula: str
    cannot: str
    population: str
    # One bucket per day of lag, so a caller can draw a histogram without re-binning.
    days: list[int] = field(default_factory=list)  # the day value of each bucket
    counts: list[int] = field(default_factory=list)  # filings in each bucket
    filing_count: int = 0
    median_days: float | None = None
    # Whether every measured filing had a real acceptance timestamp. False means some rows fell
    # back to the filing date, which is a DIFFERENT measurement and must be disclosed.
    all_from_acceptance: bool = True
    fell_back_to_filing_date: int = 0


_LAG_CANNOT = (
    "This measures when EDGAR ACCEPTED a filing relative to the period it reports on -- not when "
    "the manager decided anything, and not how current the holdings are. The statutory 13F "
    "deadline is 45 days, so a register is never complete before then and a short lag on the "
    "filings we hold does not mean the register was complete. It covers only the filings we have "
    "indexed."
)


def acceptance_lag(
    entries: list[FilingIndexEntry], *, period_end: str | None = None
) -> AcceptanceLag:
    """Distribution of acceptance lag, in days after the period each filing reports on.

    Uses `acceptance_datetime` where present and falls back to `filing_date` where it is not --
    reporting how often it had to, because the two are different measurements. (They agree for
    anything accepted in business hours; EDGAR rolls the filing date to the next business day for
    after-hours submissions.)

    `period_end` restricts to filings reporting on that period; without it every indexed filing
    with a report date is measured against its own.
    """
    formula = (
        "acceptance timestamp (or filing date where none is recorded) minus the period the "
        "filing reports on, in days; one bucket per day"
    )
    population = "indexed filings carrying both a reported period and an acceptance timestamp"

    lags: list[int] = []
    fell_back = 0
    for e in entries:
        report = e.report_date
        if period_end and report != period_end:
            continue
        if not report:
            continue
        stamp = e.acceptance_datetime or e.filing_date
        if not stamp:
            continue
        if not e.acceptance_datetime:
            fell_back += 1
        try:
            import datetime as dt

            accepted = dt.date.fromisoformat(str(stamp)[:10])
            lag = (accepted - dt.date.fromisoformat(report)).days
        except ValueError:
            continue
        # A negative lag would mean acceptance before the period it reports on -- impossible, so
        # it is a bad row rather than a fast filer. Drop it rather than charting it.
        if lag < 0:
            continue
        lags.append(lag)

    if not lags:
        return AcceptanceLag(
            status="na",
            reason=(
                "no indexed filing for this issuer carries both a reported period and an "
                "acceptance timestamp, so there is no lag to measure -- read as missing "
                "coverage, not as filings that arrived instantly"
            ),
            formula=formula,
            cannot=_LAG_CANNOT,
            population=population,
        )

    lo, hi = min(lags), max(lags)
    days = list(range(lo, hi + 1))
    counts = [lags.count(d) for d in days]
    ordered = sorted(lags)
    mid = len(ordered) // 2
    median = (
        float(ordered[mid]) if len(ordered) % 2 else (ordered[mid - 1] + ordered[mid]) / 2.0
    )
    return AcceptanceLag(
        status="ok",
        reason=(
            f"{fell_back} of {len(lags)} filing(s) have no acceptance timestamp and were measured "
            "from their filing date instead, which is a different quantity"
            if fell_back
            else None
        ),
        formula=formula,
        cannot=_LAG_CANNOT,
        population=population,
        days=days,
        counts=counts,
        filing_count=len(lags),
        median_days=median,
        all_from_acceptance=fell_back == 0,
        fell_back_to_filing_date=fell_back,
    )

"""Attribute a company's shares outstanding to the filing families that report holding them.

§03's "where every share sits". Three ownership families file structured share counts with the
SEC, and each is measured against the same denominator -- the company's own reported shares
outstanding:

* **13F-reported institutional** -- a quarter-end holdings snapshot, aggregated across the
  managers we have ingested (`register.share_vector`).
* **Insider & affiliate** -- each insider's most recently reported post-transaction holding
  from Forms 3/4/5.
* **Schedule 13D/G stakes** -- each 5%-plus reporting person's most recently reported total
  beneficial position.

## What this deliberately does NOT do, and why

**There is no residual row and no total.** *(Operator ruling, 2026-08-01.)* An earlier design
had a fourth "unreported residual" row -- shares outstanding minus the other three. That row is
the only one that is a *subtraction* rather than a measurement, and subtracting three quantities
measured on three different dates from a fourth measured on a fifth produces a number nobody
filed. It is the same reasoning that keeps an "adjusted register" off the Institutional view.

**The rows do not sum, and they are not disjoint.** A 5%-plus institutional holder files a 13F
*and* a Schedule 13D/G, so it appears in two rows; a 10% owner is also an insider. Adding them
would double-count real holders. Each row is a standalone statement -- "this family reports
holding this many shares" -- and the caller must render them that way: no total, no stacked bar
summing to 100%, no "everything else" wedge.

**Each row has its OWN as-of date, and they do not line up.** A 13F is ~45 days stale by the
time it lands; a Form 4 is filed within two business days of a trade; a 13D/G lands ten days
after crossing 5%. The dates travel on the rows because the comparison is only as good as the
reader's awareness of them.

Pure: no DB, no network, no clock -- takes already-read rows, returns a model. Same posture as
`register.py`.
"""

from __future__ import annotations

from dataclasses import dataclass, field

from secfin.normalize.schema import BeneficialOwnership, InsiderTransaction

# Only these two forms report a TOTAL beneficial position. An amendment restates the position it
# amends, so it supersedes rather than adds -- which the "latest row per owner" rule below
# handles without needing to know which is which.
_BENEFICIAL_FORMS = ("SCHEDULE 13D", "SCHEDULE 13G", "SCHEDULE 13D/A", "SCHEDULE 13G/A")


@dataclass
class AttributionRow:
    """One filing family's reported holdings, against shares outstanding."""

    key: str  # "institutional" | "insider" | "beneficial"
    label: str
    source: str  # the form(s) the number comes from, for the provenance column
    shares: float | None
    as_of: str | None  # the date THIS row is measured at -- not shared with the others
    holder_count: int | None
    share_of_outstanding: float | None  # 0-1, or None when we have no denominator
    reason: str | None = None  # why `shares` is None, when it is


@dataclass
class ShareAttribution:
    status: str  # "ok" | "na"
    reason: str | None
    formula: str
    cannot: str
    population: str
    rows: list[AttributionRow] = field(default_factory=list)
    shares_outstanding: float | None = None
    shares_outstanding_as_of: str | None = None
    shares_outstanding_tag: str | None = None  # provenance: which XBRL tag it came from
    # Load-bearing, and the reason there is no total: see the module docstring.
    rows_are_additive: bool = False


_ATTRIBUTION_CANNOT = (
    "These rows do NOT add up and are NOT exhaustive. A holder above 5% files both a 13F and a "
    "Schedule 13D/G, and a 10% owner is also an insider, so the same shares appear in more than "
    "one row -- there is no total here for that reason. Each row is measured on its own date "
    "(13F at quarter-end and ~45 days stale; Forms 3/4/5 within two business days of a trade; "
    "13D/G ten days after crossing 5%), and shares outstanding on a cover date of its own. What "
    "no filing accounts for is deliberately NOT shown: it would be a remainder of five "
    "differently-dated numbers, not a measurement of anything."
)
_ATTRIBUTION_POPULATION = (
    "structured ownership filings we have ingested for this issuer, against the company's own "
    "most recently reported shares outstanding"
)


def _latest_by(rows: list, key, date_of, value_of) -> tuple[float, int, str | None]:
    """Sum the most recent reported value per holder. Returns (shares, holders, latest date).

    A position is a *state*, not an event: a filer's newest filing restates its holding, so
    stacking every historical row would multiply one position by how often its owner filed.
    Rows with no usable value or no date are skipped entirely -- never counted as zero.
    """
    newest: dict[object, tuple[str, float]] = {}
    for row in rows:
        identity = key(row)
        when = date_of(row)
        value = value_of(row)
        if identity is None or when is None or value is None or value < 0:
            continue
        seen = newest.get(identity)
        if seen is None or when >= seen[0]:
            newest[identity] = (when, float(value))
    if not newest:
        return 0.0, 0, None
    return (
        sum(v for _, v in newest.values()),
        len(newest),
        max(when for when, _ in newest.values()),
    )


def share_attribution(
    *,
    institutional_shares: float | None,
    institutional_holder_count: int | None,
    institutional_as_of: str | None,
    insider_rows: list[InsiderTransaction],
    beneficial_rows: list[BeneficialOwnership],
    shares_outstanding: float | None,
    shares_outstanding_as_of: str | None = None,
    shares_outstanding_tag: str | None = None,
) -> ShareAttribution:
    """Build the three reported-holdings rows against shares outstanding.

    Every row can independently come back with `shares=None` and a `reason`; that is the honest
    result when a family has filed nothing we have ingested, and it is never a zero. `status`
    is "na" only when NOTHING can be shown at all.
    """
    formula = (
        "each filing family's most recently reported holdings, summed once per holder, divided "
        "by the company's own most recently reported shares outstanding"
    )

    def pct(shares: float | None) -> float | None:
        if shares is None or not shares_outstanding or shares_outstanding <= 0:
            return None
        return shares / shares_outstanding

    rows: list[AttributionRow] = []

    rows.append(
        AttributionRow(
            key="institutional",
            label="13F-reported institutional",
            source="13F-HR",
            shares=institutional_shares if institutional_shares else None,
            as_of=institutional_as_of,
            holder_count=institutional_holder_count,
            share_of_outstanding=pct(institutional_shares if institutional_shares else None),
            reason=(
                None
                if institutional_shares
                else "no ingested 13F filer reports a share count for this quarter"
            ),
        )
    )

    # Insider & affiliate. Derivative rows (options, RSUs, warrants) are EXCLUDED: their
    # `shares_owned_after` counts underlying shares of an instrument that is not owned stock.
    # `is_derivative is None` means the row predates the flag, so it is unknown -- also excluded,
    # because admitting it would readmit exactly the option rows the filter exists to remove.
    equity_rows = [r for r in insider_rows if r.is_derivative is False]
    unknown_kind = sum(1 for r in insider_rows if r.is_derivative is None)
    insider_shares, insider_holders, insider_as_of = _latest_by(
        equity_rows,
        key=lambda r: (r.owner_name, r.security_title, r.ownership_type),
        date_of=lambda r: r.transaction_date or r.filed,
        value_of=lambda r: r.shares_owned_after,
    )
    insider_reason = None
    if not insider_shares:
        insider_reason = (
            "no ingested Form 3/4/5 reports a post-transaction common-stock holding"
            if not unknown_kind
            else (
                f"{unknown_kind} ingested insider row(s) predate the derivative flag, so we "
                "cannot tell owned stock from options and none can be counted"
            )
        )
    elif unknown_kind:
        insider_reason = (
            f"{unknown_kind} ingested insider row(s) predate the derivative flag and are "
            "excluded, so this is a floor"
        )
    rows.append(
        AttributionRow(
            key="insider",
            label="Insider & affiliate",
            source="Forms 3/4/5",
            shares=insider_shares or None,
            as_of=insider_as_of,
            holder_count=insider_holders or None,
            share_of_outstanding=pct(insider_shares or None),
            reason=insider_reason,
        )
    )

    # 13D/G. One row per reporting person, newest filing wins -- an amendment restates the
    # position rather than adding to it.
    beneficial = [r for r in beneficial_rows if r.form_type in _BENEFICIAL_FORMS]
    bo_shares, bo_holders, bo_as_of = _latest_by(
        beneficial,
        key=lambda r: r.owner_name,
        date_of=lambda r: r.filed or r.event_date,
        value_of=lambda r: r.shares_beneficially_owned,
    )
    rows.append(
        AttributionRow(
            key="beneficial",
            label="5%-plus beneficial stakes",
            source="Schedules 13D / 13G",
            shares=bo_shares or None,
            as_of=bo_as_of,
            holder_count=bo_holders or None,
            share_of_outstanding=pct(bo_shares or None),
            reason=(
                None
                if bo_shares
                else (
                    "no structured Schedule 13D/G ingested for this issuer -- which can mean "
                    "nobody crossed 5%, or that the filings predate the structured-XML floor"
                )
            ),
        )
    )

    if not any(r.shares for r in rows):
        return ShareAttribution(
            status="na",
            reason=(
                "no ownership filing we have ingested reports a share count for this issuer, so "
                "there is nothing to attribute -- read as missing coverage, not as a company "
                "nobody holds"
            ),
            formula=formula,
            cannot=_ATTRIBUTION_CANNOT,
            population=_ATTRIBUTION_POPULATION,
            rows=rows,
            shares_outstanding=shares_outstanding,
            shares_outstanding_as_of=shares_outstanding_as_of,
            shares_outstanding_tag=shares_outstanding_tag,
        )

    return ShareAttribution(
        # A row with shares but no denominator is still a real share count -- it just cannot be
        # expressed as a percentage, which each row says for itself via a null percentage.
        status="ok",
        reason=(
            None
            if shares_outstanding
            else (
                "no shares-outstanding fact is ingested for this company, so these are share "
                "counts only -- the percentages cannot be computed"
            )
        ),
        formula=formula,
        cannot=_ATTRIBUTION_CANNOT,
        population=_ATTRIBUTION_POPULATION,
        rows=rows,
        shares_outstanding=shares_outstanding,
        shares_outstanding_as_of=shares_outstanding_as_of,
        shares_outstanding_tag=shares_outstanding_tag,
    )

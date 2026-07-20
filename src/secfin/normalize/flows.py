"""Derive institutional buy/sell activity by diffing 13F snapshots.

13F reports holdings, not trades. The only way to get "added / reduced / new / exited"
is to compare a manager's positions across two consecutive quarter-end snapshots. That
derivation lives here so the rest of the system treats it as a first-class, clearly
*computed* result (HoldingDelta) rather than pretending it's reported data.
"""

from __future__ import annotations

from collections.abc import Iterable
from dataclasses import dataclass

from secfin.normalize.schema import HoldingDelta, HoldingsSnapshot, IssuerHolder

# 13F report periods are always a calendar quarter-end. (month, day) -> the prior
# quarter-end's (month, day) plus a year offset (-1 only for Q1, whose prior quarter
# is Q4 of the previous year).
_PRIOR_QUARTER_END = {
    (3, 31): (12, 31, -1),
    (6, 30): (3, 31, 0),
    (9, 30): (6, 30, 0),
    (12, 31): (9, 30, 0),
}


def prior_quarter_end(period: str) -> str:
    """Return the quarter-end (YYYY-MM-DD) immediately before `period`.

    Pure date arithmetic -- no knowledge of whether a filing actually exists for either
    quarter. Raises ValueError if `period` isn't one of the four calendar quarter-ends.
    """
    year_s, month_s, day_s = period.split("-")
    key = (int(month_s), int(day_s))
    if key not in _PRIOR_QUARTER_END:
        raise ValueError(f"not a 13F quarter-end date: {period!r}")
    prior_month, prior_day, year_offset = _PRIOR_QUARTER_END[key]
    return f"{int(year_s) + year_offset:04d}-{prior_month:02d}-{prior_day:02d}"


def _by_cusip(snapshot: HoldingsSnapshot | None) -> dict[str, float]:
    """Sum shares per CUSIP within a snapshot (a manager may list a CUSIP more than once)."""
    out: dict[str, float] = {}
    if snapshot is None:
        return out
    for h in snapshot.holdings:
        if not h.cusip:
            continue
        out[h.cusip] = out.get(h.cusip, 0.0) + (h.shares or 0.0)
    return out


def _classify(before: float, after: float) -> str:
    if before == 0 and after > 0:
        return "new"
    if before > 0 and after == 0:
        return "exited"
    if after > before:
        return "added"
    if after < before:
        return "reduced"
    return "unchanged"


def diff_snapshots(
    current: HoldingsSnapshot,
    prior: HoldingsSnapshot | None,
    *,
    include_unchanged: bool = False,
) -> list[HoldingDelta]:
    """Return per-security HoldingDeltas for one manager between two quarters.

    `prior` may be None (e.g. the manager's first available filing); every position is
    then treated as "new". Positions in `prior` but absent from `current` are "exited".
    """
    cur = _by_cusip(current)
    prev = _by_cusip(prior)

    # names for reporting (prefer current snapshot's naming)
    names: dict[str, str | None] = {}
    ciks: dict[str, int | None] = {}
    for snap in (prior, current):
        if snap is None:
            continue
        for h in snap.holdings:
            if h.cusip:
                names[h.cusip] = h.issuer_name or names.get(h.cusip)
                ciks[h.cusip] = h.cik or ciks.get(h.cusip)

    deltas: list[HoldingDelta] = []
    for cusip in sorted(set(cur) | set(prev)):
        before = prev.get(cusip, 0.0)
        after = cur.get(cusip, 0.0)
        action = _classify(before, after)
        if action == "unchanged" and not include_unchanged:
            continue
        deltas.append(
            HoldingDelta(
                manager_cik=current.manager_cik,
                manager_name=current.manager_name,
                cusip=cusip,
                issuer_name=names.get(cusip),
                cik=ciks.get(cusip),
                from_period=None if prior is None else prior.report_period,
                to_period=current.report_period,
                shares_before=before or None,
                shares_after=after or None,
                shares_change=after - before,
                action=action,  # type: ignore[arg-type]
            )
        )
    return deltas


@dataclass(frozen=True)
class ActivitySummary:
    """Aggregate of one quarter-over-quarter DERIVED diff (a list of HoldingDeltas).

    Counts are how many (manager, position) pairs fell into each action bucket; the flows
    are SHARES, never dollar value -- the 13F `value` unit changed (thousands -> whole
    dollars, ~2023), so only counts and shares are unit-stable across quarters. Like
    everything in this module it is a *computed* result, not reported trade data.
    """

    new: int
    added: int
    reduced: int
    exited: int
    inflow_shares: float  # sum of shares_change over new+added positions (>= 0)
    outflow_shares: float  # sum of |shares_change| over reduced+exited positions (>= 0)
    net_shares: float  # inflow_shares - outflow_shares (== sum of all shares_change)


def summarize_activity(deltas: Iterable[HoldingDelta]) -> ActivitySummary:
    """Roll a quarter's HoldingDeltas up into per-action counts and share inflow/outflow.

    Consumes the rows `diff_snapshots`/`diff_holders` already produce -- it never
    re-classifies (`action` is taken as given). `new`/`added` have shares_change > 0 and
    feed the inflow; `reduced`/`exited` have shares_change < 0 and feed the outflow as a
    positive magnitude. `unchanged` rows (only present if a caller asked to include them)
    contribute to no bucket and to neither flow. An empty iterable yields an all-zero
    summary -- the honest "no derivable activity" result, not a fabricated one.
    """
    counts = {"new": 0, "added": 0, "reduced": 0, "exited": 0}
    inflow = 0.0
    outflow = 0.0
    for d in deltas:
        change = d.shares_change or 0.0
        if d.action in ("new", "added"):
            counts[d.action] += 1
            inflow += change
        elif d.action in ("reduced", "exited"):
            counts[d.action] += 1
            outflow += -change
    return ActivitySummary(
        new=counts["new"],
        added=counts["added"],
        reduced=counts["reduced"],
        exited=counts["exited"],
        inflow_shares=inflow,
        outflow_shares=outflow,
        net_shares=inflow - outflow,
    )


def diff_holders(
    current: list[IssuerHolder],
    prior: list[IssuerHolder] | None,
    *,
    to_period: str,
    from_period: str | None,
    include_unchanged: bool = False,
) -> list[HoldingDelta]:
    """Issuer-centric DERIVED buy/sell -- the transpose of `diff_snapshots`.

    `diff_snapshots` is one manager, many securities; this is one issuer's CUSIP(s),
    many managers. Each **(manager_cik, cusip)** pair is classified independently via
    the same `_classify` used above -- deliberately NOT summing a multi-class issuer's
    several CUSIPs (e.g. Alphabet's Class A/C) into one manager-level position the way
    `_by_cusip` sums same-cusip duplicate rows *within* one manager's snapshot;
    collapsing distinct share classes together would conflate different instruments.
    `prior=[]` or `None` (e.g. the issuer's first-ever reported quarter) means every
    current holder comes back "new", same convention `diff_snapshots` uses for
    `prior=None`.
    """
    cur = {(h.manager_cik, h.cusip): h.shares or 0.0 for h in current}
    prev = {(h.manager_cik, h.cusip): h.shares or 0.0 for h in (prior or [])}
    all_holders = current + (prior or [])
    manager_names = {h.manager_cik: h.manager_name for h in all_holders}
    issuer_names = {h.cusip: h.issuer_name for h in all_holders}

    deltas: list[HoldingDelta] = []
    for manager_cik, cusip in sorted(set(cur) | set(prev)):
        before = prev.get((manager_cik, cusip), 0.0)
        after = cur.get((manager_cik, cusip), 0.0)
        action = _classify(before, after)
        if action == "unchanged" and not include_unchanged:
            continue
        deltas.append(
            HoldingDelta(
                manager_cik=manager_cik,
                manager_name=manager_names.get(manager_cik),
                cusip=cusip,
                issuer_name=issuer_names.get(cusip),
                cik=None,
                from_period=from_period,
                to_period=to_period,
                shares_before=before or None,
                shares_after=after or None,
                shares_change=after - before,
                action=action,  # type: ignore[arg-type]
            )
        )
    return deltas

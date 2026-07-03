"""Derive institutional buy/sell activity by diffing 13F snapshots.

13F reports holdings, not trades. The only way to get "added / reduced / new / exited"
is to compare a manager's positions across two consecutive quarter-end snapshots. That
derivation lives here so the rest of the system treats it as a first-class, clearly
*computed* result (HoldingDelta) rather than pretending it's reported data.
"""

from __future__ import annotations

from secfin.normalize.schema import HoldingDelta, HoldingsSnapshot


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

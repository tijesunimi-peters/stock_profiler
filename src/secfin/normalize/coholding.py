"""Derive the co-holding overlap between a company's 13F filers.

Two managers "overlap" to the extent they hold the same *other* securities -- a structural
similarity of their reported books, NOT any claim of coordinated or timed trading (13F is a
quarter-end snapshot; this is a derived set-intersection over it). That derivation lives here so
the rest of the system treats it as a first-class, clearly *computed* result (`CoHoldingEdge`)
rather than pretending it's reported data -- same spirit as `flows.py`'s `HoldingDelta`.

Overlap is measured on **CUSIPs** (the raw holding identity), so it covers every reported position
regardless of CUSIP->CIK resolution, and on each manager's holdings **excluding the company being
viewed** -- otherwise every pair would trivially share the fact of holding that company and the
edge would say nothing. The metric is the Jaccard index (|A n B| / |A u B|), which normalizes for
book size so a huge book sharing a few names with a tiny one isn't reported as "similar".
"""

from __future__ import annotations

from typing import NamedTuple


class CoHoldingEdge(NamedTuple):
    """One edge of the co-holding network: the overlap between two managers' *other* holdings.

    `source` < `target` (manager CIKs) so each unordered pair appears once. `jaccard` is the
    overlap fraction in [0, 1]; `shared_count` is |A n B| (the number of shared CUSIPs), carried
    for the tooltip. A DERIVED structural overlap -- never presented as coordinated trading.
    """

    source: int
    target: int
    jaccard: float
    shared_count: int


def co_holding_edges(
    cusip_sets: dict[int, set[str]],
    exclude: set[str],
    min_overlap: float,
    max_edges: int = 200,
) -> list[CoHoldingEdge]:
    """Pairwise Jaccard overlap of each manager's OTHER-holdings CUSIP set, for pairs clearing
    `min_overlap`.

    `cusip_sets` maps manager_cik -> its full set of reported CUSIPs for the quarter; `exclude` is
    the viewed company's CUSIP(s), removed from each set first (see the module docstring).
    Symmetric, with `source < target`. Returns the top `max_edges` by descending `jaccard` (a
    payload bound for mega-cap holder counts). A manager whose set is empty after `exclude` (it
    holds only this company) produces no edges -- honestly an isolated node, sharing nothing else.
    """
    # Strip the viewed company's CUSIPs once per manager; the overlap is over the *other* names.
    others = {cik: (cusips - exclude) for cik, cusips in cusip_sets.items()}
    ciks = sorted(others)

    edges: list[CoHoldingEdge] = []
    for i in range(len(ciks)):
        a = others[ciks[i]]
        if not a:
            continue
        for j in range(i + 1, len(ciks)):
            b = others[ciks[j]]
            if not b:
                continue
            shared = len(a & b)
            if shared == 0:
                continue
            jaccard = shared / len(a | b)
            if jaccard >= min_overlap:
                edges.append(CoHoldingEdge(ciks[i], ciks[j], jaccard, shared))

    edges.sort(key=lambda e: -e.jaccard)
    return edges[:max_edges]

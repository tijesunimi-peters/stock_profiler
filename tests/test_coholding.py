"""Tests for the pure co-holding overlap logic (normalize/coholding.py, no I/O)."""

from __future__ import annotations

from secfin.normalize.coholding import CoHoldingEdge, co_holding_edges


def test_jaccard_over_other_holdings():
    sets = {1: {"x", "y", "z"}, 2: {"x", "y", "w"}}
    edges = co_holding_edges(sets, exclude=set(), min_overlap=0.0)
    assert edges == [CoHoldingEdge(1, 2, 0.5, 2)]  # shared {x,y}=2 / union {x,y,z,w}=4


def test_excludes_the_viewed_issuer_from_each_set():
    # Both hold the issuer's CUSIP "ISS"; the edge must reflect only the OTHER names.
    sets = {1: {"ISS", "x", "y"}, 2: {"ISS", "x"}}
    edges = co_holding_edges(sets, exclude={"ISS"}, min_overlap=0.0)
    # After exclude: {x,y} vs {x} -> shared 1 / union 2 = 0.5 (NOT 0.667 with ISS counted).
    assert edges == [CoHoldingEdge(1, 2, 0.5, 1)]


def test_below_threshold_pairs_are_dropped():
    sets = {1: {"a", "b", "c"}, 2: {"a", "d", "e"}}  # shared 1 / union 5 = 0.2
    assert co_holding_edges(sets, exclude=set(), min_overlap=0.5) == []
    assert len(co_holding_edges(sets, exclude=set(), min_overlap=0.1)) == 1


def test_isolated_node_when_other_set_is_empty():
    # Manager 2 holds only the issuer -> empty after exclude -> shares nothing -> no edges.
    sets = {1: {"ISS", "x"}, 2: {"ISS"}}
    assert co_holding_edges(sets, exclude={"ISS"}, min_overlap=0.0) == []


def test_disjoint_books_have_no_edge():
    sets = {1: {"a", "b"}, 2: {"c", "d"}}
    assert co_holding_edges(sets, exclude=set(), min_overlap=0.0) == []


def test_edges_are_symmetric_source_less_than_target():
    sets = {5: {"a", "b"}, 3: {"a", "b"}}
    edges = co_holding_edges(sets, exclude=set(), min_overlap=0.0)
    assert edges == [CoHoldingEdge(3, 5, 1.0, 2)]  # source < target regardless of dict order


def test_sorted_by_jaccard_desc_and_capped():
    # 1&2 fully overlap (1.0); 1&3 overlap half (0.5); cap to 1 edge -> the strongest.
    sets = {1: {"a", "b"}, 2: {"a", "b"}, 3: {"a", "c"}}
    edges = co_holding_edges(sets, exclude=set(), min_overlap=0.0, max_edges=1)
    assert len(edges) == 1
    assert edges[0].source == 1 and edges[0].target == 2 and edges[0].jaccard == 1.0

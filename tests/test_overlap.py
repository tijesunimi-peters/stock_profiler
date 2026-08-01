"""Pure unit tests for normalize/overlap.py -- no DB, no network, no clock.

Two properties carry this module and both are easy to break by "tidying" the code:

* **The matrix is ASYMMETRIC.** Each cell divides by the ROW issuer's manager count, so
  `matrix[i][j] != matrix[j][i]` whenever the two registers differ in size. Making it symmetric
  would be a different -- and false -- claim.
* **An unknowable cell is `None`, never `0`.** "No manager reports this issuer" and "we cannot
  compute a share of an empty register" are different answers.
"""

from __future__ import annotations

from secfin.normalize.overlap import peer_overlap

# One focus issuer (100) and two peers. Manager 1 holds all three, manager 2 holds the focus and
# the first peer, managers 3-4 hold only the focus. Chosen so every assertion below is a
# different number.
_MANAGERS = {
    100: {1, 2, 3, 4},
    200: {1, 2, 5},
    300: {1, 6},
}
_LABELS = {100: "FOCUS", 200: "PEER1", 300: "PEER2"}
_NAMES = {100: "Focus Inc", 200: "Peer One Inc", 300: "Peer Two Inc"}


def _overlap(**kw):
    return peer_overlap(100, _MANAGERS, labels=_LABELS, names=_NAMES, **kw)


class TestMatrix:
    def test_the_focus_issuer_leads_and_peers_follow(self):
        result = _overlap()
        assert result.status == "ok"
        assert [i.label for i in result.issuers] == ["FOCUS", "PEER1", "PEER2"]
        assert result.issuers[0].is_focus is True
        assert [i.is_focus for i in result.issuers[1:]] == [False, False]
        assert [i.holder_count for i in result.issuers] == [4, 3, 2]

    def test_cells_divide_by_the_ROW_issuer(self):
        m = _overlap().matrix
        # 2 of the focus's 4 managers also report PEER1 ...
        assert m[0][1] == 0.5
        # ... but 2 of PEER1's 3 managers report the focus. Same pair, different number.
        assert m[1][0] == 2 / 3

    def test_the_matrix_is_deliberately_asymmetric(self):
        m = _overlap().matrix
        assert m[0][2] != m[2][0], "a symmetric matrix would be a different, wrong claim"
        assert m[0][2] == 0.25  # 1 of the focus's 4
        assert m[2][0] == 0.5  # 1 of PEER2's 2

    def test_the_diagonal_is_none_not_one(self):
        """An issuer overlapping itself completely is not a finding, and 1.0 would set the scale."""
        m = _overlap().matrix
        assert [m[i][i] for i in range(3)] == [None, None, None]

    def test_an_issuer_with_no_managers_gives_none_not_zero(self):
        result = peer_overlap(
            100,
            {100: {1, 2}, 200: set()},
            labels={100: "FOCUS", 200: "EMPTY"},
            names={},
        )
        # The empty issuer has no denominator, so its whole ROW is unknowable ...
        assert result.matrix[1] == [None, None]
        # ... while the focus's row can honestly say none of its managers report it.
        assert result.matrix[0][1] == 0.0


class TestCombinations:
    def test_combinations_are_exclusive_and_ranked(self):
        combos = _overlap().combinations
        by_labels = {tuple(c.labels): c.manager_count for c in combos}
        assert by_labels[("FOCUS", "PEER1", "PEER2")] == 1  # manager 1
        assert by_labels[("FOCUS", "PEER1")] == 1  # manager 2
        assert by_labels[("FOCUS",)] == 2  # managers 3 and 4
        assert by_labels[("PEER1",)] == 1  # manager 5
        # Exclusive, not cumulative: manager 1 is counted ONCE, in the widest set it belongs to.
        assert sum(by_labels.values()) == 6  # the six distinct managers, each counted once
        assert [c.manager_count for c in combos] == sorted(
            (c.manager_count for c in combos), reverse=True
        )

    def test_truncation_is_reported_not_silent(self):
        many = {i: {1, 2} for i in range(100, 109)}
        result = peer_overlap(
            100, many, labels={i: str(i) for i in many}, names={}
        )
        assert result.combinations_truncated is True
        assert result.matrix, "the matrix still renders when combinations are capped"


class TestHolders:
    def test_holders_rank_by_stake_and_count_their_peers(self):
        result = _overlap(focus_weights={1: 0.1, 2: 0.4, 3: 0.3, 4: 0.2}, top_holders=3)
        assert [h.manager_cik for h in result.holders] == [2, 3, 4]
        top = result.holders[0]
        assert top.peers_held == 1 and top.peer_count == 2
        assert top.peer_labels == ["PEER1"]

    def test_peer_count_is_carried_so_the_ratio_is_readable(self):
        """'4 peers' is meaningless without 'of how many' -- the design prints '4 of 5'."""
        assert all(h.peer_count == 2 for h in _overlap().holders)


class TestHonesty:
    def test_no_peers_is_na_with_a_reason_not_an_empty_matrix(self):
        result = peer_overlap(100, {100: {1, 2}}, labels=_LABELS, names={})
        assert result.status == "na"
        assert result.matrix == []
        assert "missing coverage" in (result.reason or "")

    def test_a_focus_with_no_register_is_na_not_a_zero_row(self):
        result = peer_overlap(
            100, {100: set(), 200: {1}}, labels=_LABELS, names={}
        )
        assert result.status == "na"
        assert "no register to compare" in (result.reason or "")

    def test_the_index_construction_caveat_travels_with_the_numbers(self):
        """The honest reading of a high cell. A result without it would be misread."""
        cannot = _overlap().cannot
        assert "index construction" in cannot
        assert "not a shared view" in cannot

    def test_peer_basis_is_carried_so_the_selection_is_visible(self):
        result = _overlap(peer_basis="same SIC prefix, ranked by ingested register size")
        assert "SIC" in (result.peer_basis or "")

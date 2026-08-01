"""Cross-issuer manager overlap: which managers report holding which of a set of issuers.

§03's peer-overlap block -- the asymmetric matrix, the exclusive-combination (UpSet) counts, and
"largest holders, and how many peers they also hold".

## Why this one is unusually solid

Most of the Institutional view is DERIVED and says so. This is not: that a manager reported
holding two issuers in the same quarter is stated outright by that manager's own 13F. We are
intersecting sets of filers, not inferring a relationship. What remains derived is the framing
(which issuers count as peers, and that a shared holder means anything at all), which is why
`cannot` is still carried and still shown.

## The matrix is asymmetric ON PURPOSE

`matrix[i][j]` is the share of issuer *i*'s reporting managers that also report issuer *j*. That
is a different quantity from `matrix[j][i]`: a 200-filer register overlapping a 2,000-filer one
reads high in one direction and low in the other. Rendering it as a symmetric similarity would
be a different -- and wrong -- claim.

Pure: no DB, no network, no clock. Takes already-read manager-CIK sets, returns a model.
"""

from __future__ import annotations

from dataclasses import dataclass, field

# The UpSet plot is unreadable past a handful of bars, and the combination space is 2^n. Cap the
# number of issuers whose exclusive combinations we enumerate; above it the block still renders
# its matrix, and `combinations_truncated` says the combinations were dropped rather than empty.
_MAX_COMBINATION_ISSUERS = 6

# How many exclusive combinations to return, largest first. A long tail of one-manager
# combinations is noise, not signal.
_MAX_COMBINATIONS = 12


@dataclass
class OverlapIssuer:
    """One issuer in the comparison, with the size of its own ingested register."""

    cik: int
    label: str  # ticker where we have one, else the company name
    name: str | None
    holder_count: int
    is_focus: bool = False  # the issuer whose page this is


@dataclass
class OverlapCombination:
    """Managers reporting EXACTLY this set of issuers and no other in the comparison."""

    ciks: list[int]  # the issuers in this combination, in the issuer-list's order
    labels: list[str]
    manager_count: int


@dataclass
class OverlapHolder:
    """One of the focus issuer's largest holders, and how many peers it also reports."""

    manager_cik: int
    manager_name: str | None
    weight: float | None  # its share of the FOCUS issuer's register (0-1)
    peers_held: int
    peer_count: int  # how many peers there were to hold, so "3 of 5" is readable
    peer_labels: list[str] = field(default_factory=list)


@dataclass
class PeerOverlap:
    status: str  # "ok" | "na"
    reason: str | None
    formula: str
    cannot: str
    population: str
    peer_basis: str | None = None  # how the peer set was chosen, in words
    issuers: list[OverlapIssuer] = field(default_factory=list)
    # matrix[i][j] = share (0-1) of issuer i's managers that also report issuer j. The diagonal
    # is None, never 1.0: "an issuer overlaps itself completely" is not a finding, and drawing it
    # as a full-strength cell would dominate the scale.
    matrix: list[list[float | None]] = field(default_factory=list)
    combinations: list[OverlapCombination] = field(default_factory=list)
    combinations_truncated: bool = False
    holders: list[OverlapHolder] = field(default_factory=list)


_OVERLAP_CANNOT = (
    "A shared holder is not a shared view. Overlap this high is usually index construction -- a "
    "broad-market fund reports nearly every large issuer, so it appears in every set -- and it "
    "says nothing about conviction, timing or correlation. Both sides are limited to the filers "
    "we have INGESTED for the quarter, so a low cell can be our coverage rather than the "
    "register's. 13F is long-only and quarter-end: shorts and sub-$100M managers are absent "
    "from every set here."
)
_OVERLAP_POPULATION = (
    "managers with an ingested 13F reporting each issuer for this quarter; a manager is counted "
    "once per issuer however many share classes it reports"
)

_MIN_ISSUERS = 2  # a comparison needs something to compare against


def peer_overlap(
    focus_cik: int,
    managers_by_issuer: dict[int, set[int]],
    *,
    labels: dict[int, str],
    names: dict[int, str | None],
    focus_weights: dict[int, float] | None = None,
    focus_names: dict[int, str | None] | None = None,
    top_holders: int = 5,
    peer_basis: str | None = None,
) -> PeerOverlap:
    """Build the matrix, the exclusive combinations and the per-holder peer counts.

    `managers_by_issuer` maps issuer CIK -> the set of manager CIKs reporting it this quarter.
    The focus issuer must be a key; peers are every other key, in the caller's insertion order
    (the caller owns peer SELECTION -- this module only compares what it is given).

    `focus_weights` maps manager CIK -> that manager's share of the FOCUS issuer's register, so
    the holder list can be ranked by stake rather than alphabetically; without it the holders
    come back ranked by peers held.
    """
    formula = (
        "cell = |managers of row issuer INTERSECT managers of column issuer| / |managers of row "
        "issuer|; combinations count managers reporting exactly one subset of the issuers"
    )
    focus_managers = managers_by_issuer.get(focus_cik, set())
    peer_ciks = [c for c in managers_by_issuer if c != focus_cik]

    if len(managers_by_issuer) < _MIN_ISSUERS or not peer_ciks:
        return PeerOverlap(
            status="na",
            reason=(
                "no peer issuer has an ingested 13F register for this quarter, so there is "
                "nothing to overlap against -- read as missing coverage, not as a company whose "
                "holders hold nothing else"
            ),
            formula=formula,
            cannot=_OVERLAP_CANNOT,
            population=_OVERLAP_POPULATION,
            peer_basis=peer_basis,
        )
    if not focus_managers:
        return PeerOverlap(
            status="na",
            reason=(
                "no ingested 13F filer reports this company for this quarter, so it has no "
                "register to compare against its peers"
            ),
            formula=formula,
            cannot=_OVERLAP_CANNOT,
            population=_OVERLAP_POPULATION,
            peer_basis=peer_basis,
        )

    order = [focus_cik, *peer_ciks]
    issuers = [
        OverlapIssuer(
            cik=cik,
            label=labels.get(cik) or str(cik),
            name=names.get(cik),
            holder_count=len(managers_by_issuer.get(cik, set())),
            is_focus=cik == focus_cik,
        )
        for cik in order
    ]

    matrix: list[list[float | None]] = []
    for row_cik in order:
        row_managers = managers_by_issuer.get(row_cik, set())
        row: list[float | None] = []
        for col_cik in order:
            if row_cik == col_cik or not row_managers:
                # An empty row register gives no denominator; None, never 0 -- "we cannot say"
                # and "none of them overlap" are different answers.
                row.append(None)
                continue
            shared = row_managers & managers_by_issuer.get(col_cik, set())
            row.append(len(shared) / len(row_managers))
        matrix.append(row)

    # Exclusive combinations: for each manager, the exact set of these issuers it reports.
    combination_issuers = order[:_MAX_COMBINATION_ISSUERS]
    truncated = len(order) > _MAX_COMBINATION_ISSUERS
    tally: dict[tuple[int, ...], int] = {}
    for manager in {m for cik in combination_issuers for m in managers_by_issuer.get(cik, set())}:
        member = tuple(
            cik for cik in combination_issuers if manager in managers_by_issuer.get(cik, set())
        )
        if member:
            tally[member] = tally.get(member, 0) + 1
    label_of = {i.cik: i.label for i in issuers}
    combinations = [
        OverlapCombination(
            ciks=list(member),
            labels=[label_of[c] for c in member],
            manager_count=count,
        )
        # Largest first, then the wider combination, then a stable key -- so the same data always
        # renders in the same order.
        for member, count in sorted(
            tally.items(), key=lambda kv: (-kv[1], -len(kv[0]), kv[0])
        )[:_MAX_COMBINATIONS]
    ]

    # The focus issuer's largest holders, and which peers each also reports.
    weights = focus_weights or {}
    holder_names = focus_names or {}
    ranked = sorted(
        focus_managers,
        key=lambda m: (
            -(weights.get(m) or 0.0),
            -sum(1 for c in peer_ciks if m in managers_by_issuer.get(c, set())),
            m,
        ),
    )[:top_holders]
    holders = [
        OverlapHolder(
            manager_cik=manager,
            manager_name=holder_names.get(manager),
            weight=weights.get(manager),
            peers_held=sum(1 for c in peer_ciks if manager in managers_by_issuer.get(c, set())),
            peer_count=len(peer_ciks),
            peer_labels=[
                label_of[c] for c in peer_ciks if manager in managers_by_issuer.get(c, set())
            ],
        )
        for manager in ranked
    ]

    return PeerOverlap(
        status="ok",
        reason=None,
        formula=formula,
        cannot=_OVERLAP_CANNOT,
        population=_OVERLAP_POPULATION,
        peer_basis=peer_basis,
        issuers=issuers,
        matrix=matrix,
        combinations=combinations,
        combinations_truncated=truncated,
        holders=holders,
    )

"""Derive the SHAPE of an issuer's 13F register: concentration, turnover, tenure.

`flows.py` answers "who moved, and which way" by diffing two snapshots. This module answers
the questions the prototype's Institutional view asks *about the register itself* -- how
concentrated it is, how many managers hold half of it, how long they stay, and how much of it
is long-tenured capital.

Three properties hold for everything here, and they are the point:

* **Pure.** No database, no network, no clock. Every function takes already-read
  `IssuerHolder` rows and returns a model. That makes the moat unit-testable without a
  fixture DB, the same way `flows.py` is.
* **Derived, and labelled as such.** None of these numbers is reported by anyone. A 13F is a
  quarter-end holdings snapshot; concentration and tenure are computations we perform over
  the subset of filers we have ingested. Every model therefore carries `status`, `reason`,
  `formula` and `cannot` -- the last being what the figure does NOT tell you, which for a
  register statistic is the half that stops it being read as a fact about the company.
* **Based on the INGESTED register, never on shares outstanding.** Every share figure here is
  a share of "13F shares reported by the managers we have", which is not the same as a share
  of the company. Saying so is not a disclaimer, it is the definition of the number.

Status vocabulary follows `metrics.py` (R1-R8): "ok" | "na", with a `reason` whenever it is
anything but a clean number. A missing input is never a zero.
"""

from __future__ import annotations

from dataclasses import dataclass, field

from secfin.normalize.edgar_locations import describe_location
from secfin.normalize.manager_category import (
    CATEGORY_LABELS,
    CATEGORY_ORDER,
    classify_manager_sic,
)
from secfin.normalize.schema import IssuerHolder

# Tenure weights for stable_capital_share, as the prototype defines them (:2276). Exposed on
# the result so a reader can see the weighting rather than just its output -- a weighted number
# whose weights are hidden in code is not auditable.
STABLE_CAPITAL_WEIGHTS: list[tuple[int, float]] = [(8, 1.0), (4, 0.5), (2, 0.25)]

# A register needs at least this many share-reporting holders before a concentration statistic
# means anything. Below it we return status="na" WITH a reason rather than a number: an HHI
# computed over one holder is 10,000 (perfect concentration) which is arithmetically true and
# analytically worthless.
_MIN_HOLDERS_FOR_CONCENTRATION = 2

# Points on the Lorenz curve, including both endpoints -- one per percent of the manager
# population. A fixed resolution rather than one point per holder, so the payload does not grow
# with the register (a whole-market issuer has thousands of filers) and the chart is drawn on
# the same axis every time.
_LORENZ_POINTS = 101


def _reported_shares(holders: list[IssuerHolder]) -> list[tuple[int, str | None, float]]:
    """(manager_cik, manager_name, shares) for holders whose share count is usable.

    Excludes rows with no reported share count and non-share rows -- an option position's
    "shares" are notional and a PRN row is a principal amount, so neither is share
    ownership (the same rule the ownership treemap applies). Excluded rows are NOT counted
    as zero; they simply are not part of the population, and callers report the population
    size so the exclusion is visible.
    """
    out: list[tuple[int, str | None, float]] = []
    for h in holders:
        if h.shares is None or h.shares <= 0:
            continue
        if h.put_call:  # an option row, not share ownership
            continue
        if h.shares_or_principal == "PRN":  # a debt principal amount, not shares
            continue
        out.append((h.manager_cik, h.manager_name, float(h.shares)))
    return out


@dataclass
class ShareVectorRow:
    manager_cik: int
    manager_name: str | None
    shares: float
    weight: float  # this manager's share of the ingested register (0-1)
    cumulative: float  # running total of `weight`, ranked desc (0-1)


@dataclass
class ShareVector:
    """Managers ranked by reported shares, with each one's weight and the running total.

    The single input to `concentration()` AND to the cumulative-share chart, deliberately:
    the tiles and the chart must never disagree about the register they describe
    (STYLE_GUIDE rule 12, "one fact, one source"). Compute once, render twice.
    """

    rows: list[ShareVectorRow] = field(default_factory=list)
    total_shares: float = 0.0
    holder_count: int = 0  # holders with a usable share count (the population)
    excluded_count: int = 0  # holders present but with no usable share count


def share_vector(holders: list[IssuerHolder]) -> ShareVector:
    """Rank the register's holders and compute each one's weight in it.

    Multiple CUSIPs for one manager (a multi-class issuer) are summed into that manager's
    single position here -- unlike `flows.diff_holders`, which deliberately keeps share
    classes apart. The difference is intentional and follows the question: a *delta* per
    instrument is meaningful, whereas "how concentrated is the register" is about who holds
    the company, so a manager holding Class A and Class C is one holder.
    """
    usable = _reported_shares(holders)
    by_manager: dict[int, tuple[str | None, float]] = {}
    for cik, name, shares in usable:
        prev_name, prev_shares = by_manager.get(cik, (name, 0.0))
        by_manager[cik] = (prev_name or name, prev_shares + shares)

    distinct_present = {h.manager_cik for h in holders}
    total = sum(s for _, s in by_manager.values())
    if not by_manager or total <= 0:
        return ShareVector(
            rows=[],
            total_shares=0.0,
            holder_count=0,
            excluded_count=len(distinct_present),
        )

    ranked = sorted(by_manager.items(), key=lambda kv: kv[1][1], reverse=True)
    rows: list[ShareVectorRow] = []
    running = 0.0
    for cik, (name, shares) in ranked:
        weight = shares / total
        running += weight
        rows.append(
            ShareVectorRow(
                manager_cik=cik,
                manager_name=name,
                shares=shares,
                weight=weight,
                # Guard the float drift so the last row reads exactly 1.0 rather than
                # 0.9999999 -- a cumulative-share axis that stops just short of 100% looks
                # like missing data.
                cumulative=min(running, 1.0),
            )
        )
    return ShareVector(
        rows=rows,
        total_shares=total,
        holder_count=len(rows),
        excluded_count=len(distinct_present) - len(rows),
    )


@dataclass
class RegisterConcentration:
    status: str  # "ok" | "na"
    reason: str | None
    formula: str
    cannot: str
    population: str  # what the figures are computed OVER, in words
    holder_count: int | None = None
    hhi: float | None = None  # 0-10,000 over the ingested register
    effective_holders: float | None = None  # 10,000 / HHI
    gini: float | None = None  # 0-1
    top1_share: float | None = None
    top5_share: float | None = None
    top10_share: float | None = None
    managers_for_half: int | None = None  # "N managers hold 50%"
    # Lorenz curve: `lorenz[i]` is the share of the register (0-1) held by the SMALLEST i% of
    # managers, at 1-point-per-percent. Fixed length whatever the holder count, so the chart is
    # the same size for a 4-holder register and a 4,000-holder one -- and computed from the same
    # ascending weights `gini` is, so the curve and the coefficient can never disagree.
    lorenz: list[float] | None = None


_CONCENTRATION_CANNOT = (
    "This describes only the filers we have ingested for this quarter -- not every holder, "
    "and not the company's shareholder register. 13F is long-only and quarter-end, so shorts, "
    "sub-threshold managers ($100M) and non-13F holders are absent. Affiliated managers that "
    "file separately count separately."
)
_CONCENTRATION_POPULATION = "13F shares reported by the ingested filers for this quarter"


@dataclass
class CategoryShare:
    """One registration-category slice of the register."""

    key: str
    label: str
    holder_count: int
    shares: float
    weight: float  # of total ingested shares that carry a category


@dataclass
class RegisterComposition:
    status: str  # "ok" | "na"
    reason: str | None
    formula: str
    cannot: str
    population: str
    categories: list[CategoryShare]
    classified_holder_count: int = 0
    unclassified_holder_count: int = 0
    unclassified_shares: float = 0.0
    # Share of the register's shares whose holder we could classify at all. The honest headline
    # for this block: a mix over 30% of the register is a statement about 30% of the register.
    coverage: float | None = None


_COMPOSITION_CANNOT = (
    "SIC is a REGISTRATION category, not a strategy: an index fund, a stock-picker and a quant "
    "shop all register as investment advice (6282). It is self-assigned, rarely revisited, and "
    "describes the filing entity rather than the fund complex behind it. This is what KIND OF "
    "INSTITUTION holds the shares, not how it invests."
)
_COMPOSITION_POPULATION = (
    "ingested filers for this quarter whose own SEC registration carries an SIC code"
)


def composition(vector: ShareVector, sic_by_cik: dict[int, str | None]) -> RegisterComposition:
    """Group the register by each filer's own registered SIC category.

    Computed over the WHOLE vector (like `concentration`), so a chart drawn from it can never
    disagree with the tiles beside it.

    Holders with no SIC on file are counted separately and are NEVER folded into "other" --
    "we have no code" and "the code is not a named institution type" are different statements,
    and merging them would turn a coverage gap into a finding. `coverage` says what share of
    the register the mix actually describes.

    Pure: no DB, no network, no clock.
    """
    formula = (
        "each filer's SIC code from its own SEC registration, grouped into institution types; "
        "weight = category shares / shares held by filers that carry a code"
    )
    totals: dict[str, list[float]] = {}
    classified_shares = 0.0
    classified_holders = 0
    unclassified_shares = 0.0
    unclassified_holders = 0

    for row in vector.rows:
        category = classify_manager_sic(sic_by_cik.get(row.manager_cik))
        if category is None:
            unclassified_holders += 1
            unclassified_shares += row.shares
            continue
        classified_holders += 1
        classified_shares += row.shares
        bucket = totals.setdefault(category, [0.0, 0.0])
        bucket[0] += row.shares
        bucket[1] += 1

    total_shares = classified_shares + unclassified_shares
    coverage = (classified_shares / total_shares) if total_shares > 0 else None

    if not classified_holders:
        return RegisterComposition(
            status="na",
            reason=(
                f"none of the {vector.holder_count} ingested filer(s) for this quarter has an "
                "SIC code on file, so there is no registration category to group by -- read as "
                "missing coverage, not as a register without institutions in it"
            ),
            formula=formula,
            cannot=_COMPOSITION_CANNOT,
            population=_COMPOSITION_POPULATION,
            categories=[],
            unclassified_holder_count=unclassified_holders,
            unclassified_shares=unclassified_shares,
            coverage=coverage,
        )

    categories = [
        CategoryShare(
            key=key,
            label=CATEGORY_LABELS[key],
            holder_count=int(totals[key][1]),
            shares=totals[key][0],
            weight=totals[key][0] / classified_shares if classified_shares else 0.0,
        )
        for key in CATEGORY_ORDER
        if key in totals
    ]
    return RegisterComposition(
        status="ok",
        reason=None,
        formula=formula,
        cannot=_COMPOSITION_CANNOT,
        population=_COMPOSITION_POPULATION,
        categories=categories,
        classified_holder_count=classified_holders,
        unclassified_holder_count=unclassified_holders,
        unclassified_shares=unclassified_shares,
        coverage=coverage,
    )


def concentration(vector: ShareVector) -> RegisterConcentration:
    """Herfindahl, effective holder count, Gini and top-N shares over the ingested register.

    Returns status="na" WITH a reason -- never a zero, never a fabricated number -- when
    fewer than two holders report a usable share count. `managers_for_half` is the smallest
    number of managers whose combined weight reaches 50%.
    """
    formula = (
        "HHI = sum of squared percentage weights; effective holders = 10,000 / HHI; "
        "Gini over the same weights; weights = manager shares / total ingested shares"
    )
    if vector.holder_count < _MIN_HOLDERS_FOR_CONCENTRATION:
        return RegisterConcentration(
            status="na",
            reason=(
                f"only {vector.holder_count} ingested filer(s) report a share count for this "
                "quarter, so a concentration measure would describe our coverage rather than "
                "the register -- read as coverage, not as a concentrated register"
            ),
            formula=formula,
            cannot=_CONCENTRATION_CANNOT,
            population=_CONCENTRATION_POPULATION,
            holder_count=vector.holder_count,
        )

    weights = [r.weight for r in vector.rows]
    hhi = sum((w * 100.0) ** 2 for w in weights)

    # Gini over the weight distribution, computed on the ascending order (the standard
    # formulation): G = (2*sum(i*w_i) - (n+1)*sum(w_i)) / (n*sum(w_i)), i 1-based.
    asc = sorted(weights)
    n = len(asc)
    total_w = sum(asc)
    gini = (2.0 * sum((i + 1) * w for i, w in enumerate(asc)) - (n + 1) * total_w) / (n * total_w)

    def top(k: int) -> float:
        return sum(weights[:k])

    # Lorenz: cumulative share of the ascending weights, sampled at even population fractions.
    # `asc` is already sorted smallest-first, which is the order the curve is defined on.
    running: list[float] = []
    acc = 0.0
    for w in asc:
        acc += w
        running.append(acc)
    lorenz: list[float] = []
    for i in range(_LORENZ_POINTS):
        fraction = i / (_LORENZ_POINTS - 1)
        # How many managers the smallest `fraction` of the population covers. Rounding down
        # keeps every point a REAL cumulative total rather than an interpolation between two.
        take = int(fraction * n)
        lorenz.append(0.0 if take <= 0 else min(running[take - 1], 1.0))
    lorenz[-1] = 1.0  # the whole population holds the whole register, float drift aside

    managers_for_half = next(
        (i + 1 for i, r in enumerate(vector.rows) if r.cumulative >= 0.5),
        vector.holder_count,
    )

    return RegisterConcentration(
        status="ok",
        reason=None,
        formula=formula,
        cannot=_CONCENTRATION_CANNOT,
        population=_CONCENTRATION_POPULATION,
        holder_count=vector.holder_count,
        hhi=hhi,
        effective_holders=(10_000.0 / hhi) if hhi > 0 else None,
        gini=max(0.0, gini),
        top1_share=top(1),
        top5_share=top(5),
        top10_share=top(10),
        managers_for_half=managers_for_half,
        lorenz=lorenz,
    )


@dataclass
class RegisterTurnover:
    status: str
    reason: str | None
    formula: str
    cannot: str
    to_period: str
    from_period: str | None = None
    entrants: int | None = None
    exits: int | None = None
    retained: int | None = None
    prior_holder_count: int | None = None
    turnover_pct: float | None = None  # (entrants + exits) / prior register, as a percentage


_TURNOVER_CANNOT = (
    "An 'exit' here means the manager no longer appears in the ingested register -- which also "
    "happens when a manager falls under the $100M 13F threshold, stops filing, or simply has "
    "not been ingested for this quarter. It is not evidence that the position was sold."
)


def turnover(
    current: list[IssuerHolder],
    prior: list[IssuerHolder] | None,
    *,
    to_period: str,
    from_period: str | None,
) -> RegisterTurnover:
    """Managers entering and exiting, as a share of the PRIOR quarter's ingested register."""
    formula = "turnover = (entrants + exits) / prior-quarter ingested holder count"
    if not prior:
        return RegisterTurnover(
            status="na",
            reason=(
                "no prior ingested quarter to compare against -- the earliest ingested quarter "
                "has nothing before it, so entrants and exits cannot be derived"
            ),
            formula=formula,
            cannot=_TURNOVER_CANNOT,
            to_period=to_period,
            from_period=from_period,
        )

    cur_ciks = {c for c, _, _ in _reported_shares(current)}
    prev_ciks = {c for c, _, _ in _reported_shares(prior)}
    entrants = len(cur_ciks - prev_ciks)
    exits = len(prev_ciks - cur_ciks)
    retained = len(cur_ciks & prev_ciks)
    if not prev_ciks:
        return RegisterTurnover(
            status="na",
            reason=(
                "the prior ingested quarter has no filer reporting a share count, so there is "
                "no base register to measure turnover against"
            ),
            formula=formula,
            cannot=_TURNOVER_CANNOT,
            to_period=to_period,
            from_period=from_period,
            entrants=entrants,
            exits=exits,
            retained=retained,
            prior_holder_count=0,
        )

    return RegisterTurnover(
        status="ok",
        reason=None,
        formula=formula,
        cannot=_TURNOVER_CANNOT,
        to_period=to_period,
        from_period=from_period,
        entrants=entrants,
        exits=exits,
        retained=retained,
        prior_holder_count=len(prev_ciks),
        turnover_pct=(entrants + exits) / len(prev_ciks) * 100.0,
    )


@dataclass
class TenureCohort:
    label: str  # e.g. "8+ quarters"
    min_quarters: int
    holder_count: int
    share_of_register: float | None  # by reported shares in the newest quarter, 0-1


@dataclass
class TenureProfile:
    status: str
    reason: str | None
    formula: str
    cannot: str
    quarters_observed: int
    newest_period: str | None = None
    median_quarters_held: float | None = None
    cohorts: list[TenureCohort] = field(default_factory=list)
    # manager_cik -> consecutive quarters held, counting back from the newest quarter
    quarters_by_manager: dict[int, int] = field(default_factory=dict)


_TENURE_CANNOT = (
    "Tenure is measured over the quarters we have INGESTED, so it is a floor, not a history: a "
    "manager who has held for 20 quarters reads as the number of quarters we hold. A gap in the "
    "middle ends the streak, and a gap can be a coverage gap rather than a sale."
)


def tenure(by_period: dict[str, list[IssuerHolder]]) -> TenureProfile:
    """Consecutive quarters each manager has held, counting back from the newest quarter.

    `by_period` maps quarter-end -> that quarter's holders. Order is derived here (descending
    by date) rather than trusted from the caller. A manager present in the newest quarter and
    the two before it, but absent in the third, has a streak of 3.
    """
    formula = (
        "consecutive quarters a manager appears in the ingested register, counting back from "
        "the newest ingested quarter; cohort share is by reported shares in that quarter"
    )
    periods = sorted(by_period.keys(), reverse=True)
    if not periods:
        return TenureProfile(
            status="na",
            reason="no ingested quarter for this issuer, so tenure cannot be measured",
            formula=formula,
            cannot=_TENURE_CANNOT,
            quarters_observed=0,
        )

    newest = periods[0]
    present: list[set[int]] = [
        {c for c, _, _ in _reported_shares(by_period.get(p, []))} for p in periods
    ]
    streaks: dict[int, int] = {}
    for cik in present[0]:
        run = 0
        for quarter_set in present:
            if cik in quarter_set:
                run += 1
            else:
                break
        streaks[cik] = run

    if not streaks:
        return TenureProfile(
            status="na",
            reason=(
                "no filer reports a share count in the newest ingested quarter, so there is no "
                "register to measure tenure over"
            ),
            formula=formula,
            cannot=_TENURE_CANNOT,
            quarters_observed=len(periods),
            newest_period=newest,
        )

    newest_vector = share_vector(by_period.get(newest, []))
    weight_by_manager = {r.manager_cik: r.weight for r in newest_vector.rows}

    cohorts: list[TenureCohort] = []
    bands = ((8, "8+ quarters"), (4, "4-7 quarters"), (2, "2-3 quarters"), (1, "1 quarter"))
    for min_q, label in bands:
        upper = {8: None, 4: 7, 2: 3, 1: 1}[min_q]
        members = [
            cik
            for cik, run in streaks.items()
            if run >= min_q and (upper is None or run <= upper)
        ]
        cohorts.append(
            TenureCohort(
                label=label,
                min_quarters=min_q,
                holder_count=len(members),
                share_of_register=(
                    sum(weight_by_manager.get(c, 0.0) for c in members) if members else 0.0
                ),
            )
        )

    runs = sorted(streaks.values())
    mid = len(runs) // 2
    median = float(runs[mid]) if len(runs) % 2 else (runs[mid - 1] + runs[mid]) / 2.0

    return TenureProfile(
        status="ok",
        reason=(
            # Not a failure -- but a ceiling the reader must see, because every tenure figure
            # here is capped by how many quarters we hold.
            f"tenure is capped by the {len(periods)} ingested quarter(s) available"
            if len(periods) < 8
            else None
        ),
        formula=formula,
        cannot=_TENURE_CANNOT,
        quarters_observed=len(periods),
        newest_period=newest,
        median_quarters_held=median,
        cohorts=cohorts,
        quarters_by_manager=streaks,
    )


@dataclass
class StableCapital:
    status: str
    reason: str | None
    formula: str
    cannot: str
    weights: list[tuple[int, float]]
    stable_share: float | None = None  # 0-1
    quarters_observed: int = 0


def stable_capital_share(by_period: dict[str, list[IssuerHolder]]) -> StableCapital:
    """Register weighted by how long each manager has held it.

    8+ quarters count fully, 4-7 at half, 2-3 at a quarter, a single quarter not at all --
    the prototype's weighting (:2276), carried on the result so it is visible to the reader
    rather than buried here.
    """
    formula = (
        "sum(manager weight x tenure weight) over the newest ingested quarter; tenure weights: "
        "8+ quarters 1.0, 4-7 0.5, 2-3 0.25, 1 quarter 0.0"
    )
    cannot = (
        "Weighted by INGESTED tenure, so it understates managers who held for longer than we "
        "have data. With few ingested quarters, no manager can reach the top weight at all."
    )
    profile = tenure(by_period)
    if profile.status != "ok" or profile.newest_period is None:
        return StableCapital(
            status="na",
            reason=profile.reason,
            formula=formula,
            cannot=cannot,
            weights=STABLE_CAPITAL_WEIGHTS,
            quarters_observed=profile.quarters_observed,
        )

    vector = share_vector(by_period.get(profile.newest_period, []))
    stable = 0.0
    for row in vector.rows:
        held = profile.quarters_by_manager.get(row.manager_cik, 0)
        weight = next((w for min_q, w in STABLE_CAPITAL_WEIGHTS if held >= min_q), 0.0)
        stable += row.weight * weight

    return StableCapital(
        status="ok",
        # Below 8 ingested quarters the top weight is unreachable, which caps this figure. That
        # is a real constraint on the number, so it travels WITH the number.
        reason=(
            f"only {profile.quarters_observed} ingested quarter(s) available, so the 8-quarter "
            "full weight is unreachable and this share is a floor"
            if profile.quarters_observed < 8
            else None
        ),
        formula=formula,
        cannot=cannot,
        weights=STABLE_CAPITAL_WEIGHTS,
        stable_share=stable,
        quarters_observed=profile.quarters_observed,
    )


@dataclass
class DomicileRow:
    """One place the register files from."""

    place: str  # the reader-facing label, e.g. "United States - Pennsylvania" / "Switzerland"
    country: str  # the grouping key, so a caller can roll up further without re-parsing
    holder_count: int
    shares: float
    weight: float  # of the shares whose holder's location we know (0-1)
    prior_weight: float | None = None  # the same place one quarter earlier, if we have it


@dataclass
class RegisterDomicile:
    status: str  # "ok" | "na"
    reason: str | None
    formula: str
    cannot: str
    population: str
    rows: list[DomicileRow] = field(default_factory=list)
    located_holder_count: int = 0
    unlocated_holder_count: int = 0
    unlocated_shares: float = 0.0
    # Share of the register's shares whose filer we could place at all. The honest headline:
    # a domicile ranking over 40% of the register is a statement about 40% of the register.
    coverage: float | None = None


_DOMICILE_CANNOT = (
    "This is the BUSINESS ADDRESS each manager registered with the SEC -- where it files from, "
    "not where its capital originates, where its assets are managed, or where the company is. A "
    "fund domiciled offshore and run from Connecticut reports whichever address it registered. "
    "Inside the US the ranking is by state; everywhere else it is by country, so the rows are "
    "not the same kind of place."
)
_DOMICILE_POPULATION = (
    "ingested filers for this quarter whose 13F cover page carries a business location"
)


def domicile(
    holders: list[IssuerHolder],
    prior_holders: list[IssuerHolder] | None = None,
) -> RegisterDomicile:
    """Rank the register by where its managers file from, by reported shares.

    Weighted by SHARES, not by filer count: fifty small managers in one state are not a bigger
    presence than one large one, and the card sits next to share-weighted figures.

    Filers whose location we do not have -- a snapshot ingested before the location column
    existed, a code EDGAR does not publish -- are counted separately and NEVER folded into a
    "rest of world" row. That would turn our own coverage gap into a finding about the register.
    `coverage` says what share of the register the ranking actually describes.

    `prior_holders` supplies the same-place weight one quarter earlier (the tick on each bar).
    It is optional: without it every `prior_weight` is None, which a caller must render as "no
    prior quarter", never as a zero-length tick sitting at the axis.

    Pure: no DB, no network, no clock.
    """
    formula = (
        "each filer's 13F cover-page business location, grouped by US state or by country; "
        "weight = place shares / shares held by filers we could place"
    )

    def group(rows: list[IssuerHolder]) -> tuple[dict[str, list], float, int, float, int]:
        """(place -> [country, shares, ciks], located_shares, located_n, unlocated_shares, n)."""
        places: dict[str, list] = {}
        located_shares = 0.0
        unlocated_shares = 0.0
        located_ciks: set[int] = set()
        unlocated_ciks: set[int] = set()
        # A manager's location is on its cover page, so it is identical across that manager's
        # rows -- but a multi-class issuer gives it several rows, and only some may carry the
        # column. Take the first non-empty, in one pass (never a scan per manager: this runs on
        # the request path over a register that can hold thousands of filers).
        location_by_cik: dict[int, str] = {}
        for h in rows:
            if h.location and h.manager_cik not in location_by_cik:
                location_by_cik[h.manager_cik] = h.location
        # Sum per MANAGER (same reason `share_vector` does) so a holder is counted once per
        # place, not once per share class.
        by_manager: dict[int, tuple[str | None, float]] = {}
        for cik, _name, shares in _reported_shares(rows):
            _prev_loc, prev_shares = by_manager.get(cik, (None, 0.0))
            by_manager[cik] = (location_by_cik.get(cik), prev_shares + shares)
        for cik, (loc, shares) in by_manager.items():
            place = describe_location(loc)
            if place is None:
                unlocated_ciks.add(cik)
                unlocated_shares += shares
                continue
            located_ciks.add(cik)
            located_shares += shares
            bucket = places.setdefault(place.label, [place.country, 0.0, set()])
            bucket[1] += shares
            bucket[2].add(cik)
        return (
            places,
            located_shares,
            len(located_ciks),
            unlocated_shares,
            len(unlocated_ciks),
        )

    places, located_shares, located_n, unlocated_shares, unlocated_n = group(holders)
    total = located_shares + unlocated_shares
    coverage = (located_shares / total) if total > 0 else None

    if not places or located_shares <= 0:
        return RegisterDomicile(
            status="na",
            reason=(
                f"none of the {len(holders)} ingested filing(s) for this quarter carries a "
                "business location -- 13F cover-page locations are backfilled separately "
                "(ingest/location_backfill.py), so read this as missing coverage, not as a "
                "register with no domicile"
            ),
            formula=formula,
            cannot=_DOMICILE_CANNOT,
            population=_DOMICILE_POPULATION,
            unlocated_holder_count=unlocated_n,
            unlocated_shares=unlocated_shares,
            coverage=coverage,
        )

    prior_weights: dict[str, float] = {}
    if prior_holders:
        prior_places, prior_located, _, _, _ = group(prior_holders)
        if prior_located > 0:
            prior_weights = {
                label: bucket[1] / prior_located for label, bucket in prior_places.items()
            }

    rows = [
        DomicileRow(
            place=label,
            country=bucket[0],
            holder_count=len(bucket[2]),
            shares=bucket[1],
            weight=bucket[1] / located_shares,
            # A place absent from the prior quarter has no prior weight -- that is "it was not
            # there", which is not 0% of a register it was not part of.
            prior_weight=prior_weights.get(label),
        )
        for label, bucket in places.items()
    ]
    rows.sort(key=lambda r: (-r.shares, r.place))

    return RegisterDomicile(
        status="ok",
        reason=None,
        formula=formula,
        cannot=_DOMICILE_CANNOT,
        population=_DOMICILE_POPULATION,
        rows=rows,
        located_holder_count=located_n,
        unlocated_holder_count=unlocated_n,
        unlocated_shares=unlocated_shares,
        coverage=coverage,
    )

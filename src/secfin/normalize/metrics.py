"""Fundamental metrics computed from a company's RawFact history.

The analytical payoff of the normalized data: profitability, growth, financial-health,
cash-flow, efficiency, and per-share metrics. Pure (no I/O, no DB, no network) — the same
"clients-free-of-business-logic" spirit as the rest of normalize/. Callers supply the flat
RawFacts (from the repository) and get typed `MetricValue` results back.

Anchoring on period_end, NOT (fiscal_year, fiscal_period)
---------------------------------------------------------
The SEC's `fy`/`fp` fields on a data point reflect the *filing's* fiscal context, not the
point's own period: a 10-K stamps all its comparative years with the filing's `fy`, so three
distinct annual figures can all arrive labeled `fp="FY", fy=2025`. We therefore key every
metric off the ground truth — the fact's `period_end` (and, for durations, its length):
  * an annual (~12-month) duration ending in calendar year Y is fiscal year Y's flow;
  * a balance-sheet instant at that same fiscal-year-end date is the as-of stock;
  * discrete quarters are recovered by differencing the year-to-date durations that share a
    common `period_start` (so Q4 = annual − Q3-YTD falls out naturally).
This is deliberately more robust than normalize/statements.py's (fy, fp) keying.

Honesty (see docs/ROADMAP_METRICS.md R1–R8 and docs/STYLE_GUIDE.md §7): every result carries
a status — `ok` | `approximate` | `na` | `nm` — and never fabricates precision. A structurally
inapplicable metric (a bank has no current ratio) is `na`, a computable-but-misleading one
(growth off a negative base) is `nm`, and a flagged-imprecise one (R5 debt-split undercount)
is `approximate` with the value still shown.
"""

from __future__ import annotations

from collections import defaultdict
from datetime import date

from secfin.normalize.mapping import candidate_tags
from secfin.normalize.schema import (
    CompanyMetrics,
    FiscalPeriod,
    MetricBasis,
    MetricValue,
    RawFact,
)

# Duration-length bands (days) for classifying flow facts.
_ANNUAL_MIN, _ANNUAL_MAX = 350, 380
_QUARTER_MIN, _QUARTER_MAX = 80, 100

# R8 arithmetic guards.
_STATUTORY_TAX_RATE = 0.21  # US federal corporate rate; ROIC fallback when the effective
_TAX_RATE_LO, _TAX_RATE_HI = 0.0, 0.35  # effective-rate clamp band
_NEAR_ZERO = 1e-9  # any denominator with |x| below this → na (divide-by-~zero)


def _days(start: str | None, end: str | None) -> int | None:
    if start and end:
        return (date.fromisoformat(end) - date.fromisoformat(start)).days
    return None


# --------------------------------------------------------------------------------------
# Per-concept resolved data
# --------------------------------------------------------------------------------------


class _ConceptData:
    """Latest-filed values for one canonical concept, keyed by period.

    `durations` maps (period_start, period_end) → value for flow facts; `instants` maps
    instant date → value for stock facts. Restatements collapse via latest-filed wins.
    """

    __slots__ = ("tag", "unit", "is_extension", "durations", "instants", "_dur_filed", "_ins_filed")

    def __init__(self) -> None:
        self.tag: str | None = None
        self.unit: str | None = None
        self.is_extension: bool = False
        self.durations: dict[tuple[str, str], float] = {}
        self.instants: dict[str, float] = {}
        self._dur_filed: dict[tuple[str, str], str] = {}
        self._ins_filed: dict[str, str] = {}

    def _add_duration(self, key: tuple[str, str], value: float, filed: str) -> None:
        if key not in self._dur_filed or filed > self._dur_filed[key]:
            self.durations[key] = value
            self._dur_filed[key] = filed

    def _add_instant(self, key: str, value: float, filed: str) -> None:
        if key not in self._ins_filed or filed > self._ins_filed[key]:
            self.instants[key] = value
            self._ins_filed[key] = filed

    def discrete_quarters(self) -> dict[str, float]:
        """Discrete (~3-month) quarter values keyed by period_end.

        Built by differencing YTD durations that share a `period_start` — the standard way
        to recover a discrete quarter from cumulative XBRL flows, and the only way to get Q4
        (= full-year − 9-month-YTD), which filers rarely tag directly.
        """
        by_start: dict[str, list[tuple[str, float]]] = defaultdict(list)
        for (start, end), value in self.durations.items():
            by_start[start].append((end, value))
        out: dict[str, float] = {}
        for _start, points in by_start.items():
            points.sort()  # by end date
            prev = 0.0
            for end, cumulative in points:
                out[end] = cumulative - prev
                prev = cumulative
        return out


def _index_concepts(facts: list[RawFact]) -> dict[str, _ConceptData]:
    """Resolve every canonical concept to its latest-filed values across all periods."""
    by_tag: dict[str, list[RawFact]] = defaultdict(list)
    for f in facts:
        by_tag[f.gaap_tag].append(f)

    out: dict[str, _ConceptData] = {}
    # Every canonical concept the metrics might touch (mapping.CONCEPTS keys).
    from secfin.normalize.mapping import CONCEPTS

    for concept in CONCEPTS:
        data = _ConceptData()
        # First candidate tag that has any usable value wins (mirrors build_statement's
        # per-concept selection, applied once for the whole series so a metric doesn't mix
        # tags across periods).
        chosen_tag = next(
            (
                t
                for t in candidate_tags(concept)
                if any(f.value is not None for f in by_tag.get(t, []))
            ),
            None,
        )
        if chosen_tag is not None:
            data.tag = chosen_tag
            for f in by_tag[chosen_tag]:
                if f.value is None:
                    continue
                data.unit = f.unit
                data.is_extension = f.is_extension
                filed = f.filed or ""
                if f.instant:
                    data._add_instant(f.instant, float(f.value), filed)
                elif f.period_start and f.period_end:
                    data._add_duration((f.period_start, f.period_end), float(f.value), filed)
        out[concept] = data
    return out


def _raw_instant_tags_present(facts: list[RawFact], tags: list[str], instant: str) -> set[str]:
    """Which of `tags` have a fact at this instant date (for R5 debt-split detection)."""
    present = set()
    for f in facts:
        if f.gaap_tag in tags and f.instant == instant and f.value is not None:
            present.add(f.gaap_tag)
    return present


# --------------------------------------------------------------------------------------
# Period anchoring
# --------------------------------------------------------------------------------------


def _fiscal_year_ends(index: dict[str, _ConceptData]) -> dict[int, str]:
    """Map calendar year → fiscal-year-end date, from ~annual durations across all flows."""
    out: dict[int, str] = {}
    for data in index.values():
        for start, end in data.durations:
            d = _days(start, end)
            if d is not None and _ANNUAL_MIN <= d <= _ANNUAL_MAX:
                y = date.fromisoformat(end).year
                if y not in out or end > out[y]:
                    out[y] = end
    return out


def _all_quarter_ends(index: dict[str, _ConceptData]) -> list[str]:
    """Distinct discrete-quarter end dates across all flow concepts, sorted ascending."""
    ends: set[str] = set()
    for data in index.values():
        # Only concepts whose durations look like real sub-annual flows contribute.
        for end in data.discrete_quarters():
            ends.add(end)
    return sorted(ends)


class _Anchor:
    """The resolved period a metric is computed for: its end date and the prior-year end."""

    __slots__ = ("fiscal_year", "fiscal_period", "end", "prior_end", "prior2_end")

    def __init__(
        self,
        fiscal_year: int,
        fiscal_period: FiscalPeriod,
        end: str,
        prior_end: str | None,
        prior2_end: str | None,
    ) -> None:
        self.fiscal_year = fiscal_year
        self.fiscal_period = fiscal_period
        self.end = end
        self.prior_end = prior_end
        self.prior2_end = prior2_end


def _quarters_in_fy(all_q: list[str], fye: dict[int, str], year: int) -> list[str]:
    """Ordered discrete-quarter ends belonging to fiscal year `year`.

    A completed fiscal year is the window (prior FYE, this FYE] -- four quarters, Q4 ending at
    the FYE. An IN-PROGRESS fiscal year (no FYE for `year` yet, but the prior year closed) is
    open-ended: every quarter-end after the prior FYE, however many have been filed so far. This
    is what makes the latest quarter reachable before its 10-K lands.
    """
    lo = fye.get(year - 1)
    hi = fye.get(year)
    if hi is not None:
        return [e for e in all_q if (lo is None or e > lo) and e <= hi]
    if lo is not None:
        return [e for e in all_q if e > lo]  # in-progress fiscal year
    return []


def _quarter_end(
    all_q: list[str], fye: dict[int, str], year: int, period: FiscalPeriod
) -> str | None:
    ends = _quarters_in_fy(all_q, fye, year)
    idx = int(period[1]) - 1  # "Q3" -> 2
    return ends[idx] if 0 <= idx < len(ends) else None


def _resolve_anchor(
    index: dict[str, _ConceptData], fiscal_year: int, fiscal_period: FiscalPeriod
) -> _Anchor | None:
    """Resolve (year, period) to concrete period-end dates, or None if not in the data."""
    fye = _fiscal_year_ends(index)
    if fiscal_period == "FY":
        end = fye.get(fiscal_year)
        if end is None:
            return None
        return _Anchor(fiscal_year, "FY", end, fye.get(fiscal_year - 1), fye.get(fiscal_year - 2))

    all_q = _all_quarter_ends(index)
    end = _quarter_end(all_q, fye, fiscal_year, fiscal_period)
    if end is None:
        return None
    return _Anchor(
        fiscal_year,
        fiscal_period,
        end,
        _quarter_end(all_q, fye, fiscal_year - 1, fiscal_period),
        _quarter_end(all_q, fye, fiscal_year - 2, fiscal_period),
    )


# --------------------------------------------------------------------------------------
# Value accessors (TTM flows, as-of stocks, average balances)
# --------------------------------------------------------------------------------------


def _ttm_flow(data: _ConceptData, end: str | None, *, allow_sum: bool = True) -> float | None:
    """Trailing-twelve-month value of a flow concept ending at `end`.

    A directly-reported ~annual duration ending at `end` IS the TTM (the FY case). Otherwise,
    when `allow_sum`, sum the 4 discrete quarters ending at `end` (recovered by differencing
    YTD durations). `allow_sum=False` for non-summable per-period figures (EPS, weighted-avg
    share counts) — those return None off-annual rather than a bogus sum.
    """
    if end is None:
        return None
    # Direct annual duration ending here.
    for (start, e), value in data.durations.items():
        if e == end:
            d = _days(start, e)
            if d is not None and _ANNUAL_MIN <= d <= _ANNUAL_MAX:
                return value
    if not allow_sum:
        return None
    discretes = data.discrete_quarters()
    ends = sorted(e for e in discretes if e <= end)
    if len(ends) < 4:
        return None
    window = ends[-4:]
    # The 4 ends must be consecutive quarters (each ~90 days apart) so they tile a full year
    # with no missing quarter -- guards against summing across a gap in the history.
    gaps = [_days(window[i], window[i + 1]) for i in range(3)]
    if not all(g is not None and _QUARTER_MIN <= g <= _QUARTER_MAX for g in gaps):
        return None
    return sum(discretes[e] for e in window)


def _stock(data: _ConceptData, instant: str | None) -> float | None:
    """As-of (point-in-time) value of a stock concept at `instant`."""
    return data.instants.get(instant) if instant else None


def _avg_balance(
    data: _ConceptData, end: str | None, prior_end: str | None
) -> tuple[float | None, bool]:
    """Average of the begin/end stock across the TTM window (R3).

    Returns (value, exact): `exact` is False when the prior-period balance is missing and we
    fall back to the ending balance alone — the caller flags that as `approximate`.
    """
    cur = _stock(data, end)
    if cur is None:
        return None, False
    prev = _stock(data, prior_end)
    if prev is None:
        return cur, False
    return (cur + prev) / 2.0, True


# --------------------------------------------------------------------------------------
# Result construction
# --------------------------------------------------------------------------------------


class _Ctx:
    """Everything a metric function needs for one (company, period)."""

    __slots__ = ("index", "facts", "anchor", "as_of")

    def __init__(
        self, index: dict[str, _ConceptData], facts: list[RawFact], anchor: _Anchor
    ) -> None:
        self.index = index
        self.facts = facts
        self.anchor = anchor
        # as_of = latest filing that reported anything at this period end (provenance / R1).
        filed_dates: list[str] = []
        for data in index.values():
            for (start, end), _v in data.durations.items():
                if end == anchor.end and (start, end) in data._dur_filed:
                    filed_dates.append(data._dur_filed[(start, end)])
            if anchor.end in data._ins_filed:
                filed_dates.append(data._ins_filed[anchor.end])
        self.as_of: str | None = max(filed_dates) if filed_dates else None

    def _base(self, metric: str, label: str, unit: str, basis: MetricBasis) -> dict:
        return {
            "metric": metric,
            "label": label,
            "unit": unit,
            "fiscal_year": self.anchor.fiscal_year,
            "fiscal_period": self.anchor.fiscal_period,
            "period_end": self.anchor.end,
            "basis": basis,
            "as_of": self.as_of,
        }

    def ok(self, metric, label, value, unit, basis) -> MetricValue:
        return MetricValue(**self._base(metric, label, unit, basis), value=value, status="ok")

    def approx(self, metric, label, value, unit, basis, reason) -> MetricValue:
        return MetricValue(
            **self._base(metric, label, unit, basis),
            value=value,
            status="approximate",
            reason=reason,
        )

    def na(self, metric, label, unit, basis, reason) -> MetricValue:
        return MetricValue(
            **self._base(metric, label, unit, basis), value=None, status="na", reason=reason
        )

    def nm(self, metric, label, unit, basis, reason) -> MetricValue:
        return MetricValue(
            **self._base(metric, label, unit, basis), value=None, status="nm", reason=reason
        )

    # convenience accessors over the resolved index
    def ttm(self, concept: str, *, allow_sum: bool = True) -> float | None:
        return _ttm_flow(self.index[concept], self.anchor.end, allow_sum=allow_sum)

    def ttm_prior(self, concept: str, k: int = 1, *, allow_sum: bool = True) -> float | None:
        end = self.anchor.prior_end if k == 1 else self.anchor.prior2_end
        return _ttm_flow(self.index[concept], end, allow_sum=allow_sum)

    def stock(self, concept: str) -> float | None:
        return _stock(self.index[concept], self.anchor.end)

    def avg(self, concept: str) -> tuple[float | None, bool]:
        return _avg_balance(self.index[concept], self.anchor.end, self.anchor.prior_end)


def _ratio(ctx: _Ctx, metric, label, num, den, basis: MetricBasis = "TTM") -> MetricValue:
    """A simple numerator/denominator ratio with the standard na guards."""
    if num is None or den is None:
        return ctx.na(metric, label, "ratio", basis, "required input not reported for this period")
    if abs(den) < _NEAR_ZERO:
        return ctx.na(metric, label, "ratio", basis, "denominator is zero/near-zero")
    return ctx.ok(metric, label, num / den, "ratio", basis)


def _growth(ctx: _Ctx, metric, label, concept) -> MetricValue:
    """YoY growth of a flow concept, with R8 sign/base guards."""
    cur = ctx.ttm(concept)
    prior = ctx.ttm_prior(concept)
    if cur is None or prior is None:
        return ctx.na(
            metric, label, "ratio", "TTM", "insufficient history for a year-ago comparison"
        )
    if prior <= 0:
        # Negative/zero base or a loss→profit sign flip makes a percentage meaningless.
        return ctx.nm(metric, label, "ratio", "TTM", "prior-period base is negative or zero")
    return ctx.ok(metric, label, cur / prior - 1.0, "ratio", "TTM")


_INEXACT_AVG_REASON = "average balance uses period-end only (no prior-period balance)"


def _ttm_over_avg(ctx: _Ctx, metric, label, flow_concept, stock_concept) -> MetricValue:
    """A TTM-flow / average-balance ratio (R3), flagged `approximate` if the average had to
    fall back to the ending balance because no prior-period balance was available."""
    num = ctx.ttm(flow_concept)
    avg, exact = ctx.avg(stock_concept)
    result = _ratio(ctx, metric, label, num, avg)
    if result.status == "ok" and not exact:
        return ctx.approx(metric, label, result.value, "ratio", "TTM", _INEXACT_AVG_REASON)
    return result


# --------------------------------------------------------------------------------------
# Metric functions (one per metric; registered below)
# --------------------------------------------------------------------------------------


def _gross_margin(ctx: _Ctx) -> MetricValue:
    rev = ctx.ttm("revenue")
    gp = ctx.ttm("gross_profit")
    if gp is None:  # R8: fall back to revenue − cost_of_revenue when gross_profit is untagged
        cor = ctx.ttm("cost_of_revenue")
        if rev is not None and cor is not None:
            return _ratio(ctx, "gross_margin", "Gross Margin", rev - cor, rev)
    return _ratio(ctx, "gross_margin", "Gross Margin", gp, rev)


def _operating_margin(ctx: _Ctx) -> MetricValue:
    return _ratio(
        ctx, "operating_margin", "Operating Margin", ctx.ttm("operating_income"), ctx.ttm("revenue")
    )


def _net_margin(ctx: _Ctx) -> MetricValue:
    return _ratio(ctx, "net_margin", "Net Margin", ctx.ttm("net_income"), ctx.ttm("revenue"))


def _roa(ctx: _Ctx) -> MetricValue:
    return _ttm_over_avg(ctx, "roa", "Return on Assets", "net_income", "total_assets")


def _roe(ctx: _Ctx) -> MetricValue:
    return _ttm_over_avg(ctx, "roe", "Return on Equity", "net_income", "stockholders_equity")


def _roic(ctx: _Ctx) -> MetricValue:
    label, unit, basis = "Return on Invested Capital", "ratio", "TTM"
    op = ctx.ttm("operating_income")
    ltd = ctx.stock("long_term_debt")
    dc = ctx.stock("debt_current")
    eq = ctx.stock("stockholders_equity")
    cash = ctx.stock("cash_and_equivalents")
    if op is None or eq is None:
        return ctx.na("roic", label, unit, basis, "operating income or equity not reported")
    # invested capital = long-term debt + current debt + equity − cash
    invested = eq + (ltd or 0.0) + (dc or 0.0) - (cash or 0.0)
    if abs(invested) < _NEAR_ZERO:
        return ctx.na("roic", label, unit, basis, "invested capital is zero/near-zero")
    # NOPAT = operating income × (1 − effective tax rate); clamp the rate (R8).
    ibt = ctx.ttm("income_before_tax")
    tax = ctx.ttm("income_tax_expense")
    rate = _STATUTORY_TAX_RATE
    if ibt is not None and tax is not None and ibt > 0:
        eff = tax / ibt
        if _TAX_RATE_LO <= eff <= _TAX_RATE_HI:
            rate = eff
    nopat = op * (1.0 - rate)
    value = nopat / invested
    reason = _debt_split_reason(ctx)
    if reason:
        return ctx.approx("roic", label, value, unit, basis, reason)
    return ctx.ok("roic", label, value, unit, basis)


def _revenue_growth(ctx: _Ctx) -> MetricValue:
    return _growth(ctx, "revenue_growth_yoy", "Revenue Growth (YoY)", "revenue")


def _earnings_growth(ctx: _Ctx) -> MetricValue:
    return _growth(ctx, "earnings_growth_yoy", "Earnings Growth (YoY)", "net_income")


def _ocf_growth(ctx: _Ctx) -> MetricValue:
    return _growth(
        ctx, "ocf_growth_yoy", "Operating Cash Flow Growth (YoY)", "cash_from_operations"
    )


def _growth_acceleration(ctx: _Ctx) -> MetricValue:
    label, unit, basis = "Revenue Growth Acceleration", "ratio", "TTM"
    cur = ctx.ttm("revenue")
    p1 = ctx.ttm_prior("revenue", 1)
    p2 = ctx.ttm_prior("revenue", 2)
    if cur is None or p1 is None or p2 is None:
        return ctx.na("growth_acceleration", label, unit, basis, "needs three years of revenue")
    if p1 <= 0 or p2 <= 0:
        return ctx.nm(
            "growth_acceleration", label, unit, basis, "a prior-period base is negative or zero"
        )
    return ctx.ok("growth_acceleration", label, (cur / p1 - 1.0) - (p1 / p2 - 1.0), unit, basis)


def _current_ratio(ctx: _Ctx) -> MetricValue:
    return _ratio(
        ctx,
        "current_ratio",
        "Current Ratio",
        ctx.stock("total_current_assets"),
        ctx.stock("total_current_liabilities"),
        basis="as-of",
    )


def _quick_ratio(ctx: _Ctx) -> MetricValue:
    tca = ctx.stock("total_current_assets")
    tcl = ctx.stock("total_current_liabilities")
    inv = ctx.stock("inventory") or 0.0
    num = None if tca is None else tca - inv
    return _ratio(ctx, "quick_ratio", "Quick Ratio", num, tcl, basis="as-of")


def _debt_to_equity(ctx: _Ctx) -> MetricValue:
    label, unit, basis = "Debt to Equity", "ratio", "as-of"
    ltd = ctx.stock("long_term_debt")
    dc = ctx.stock("debt_current")
    eq = ctx.stock("stockholders_equity")
    if eq is None or (ltd is None and dc is None):
        return ctx.na("debt_to_equity", label, unit, basis, "debt or equity not reported")
    if abs(eq) < _NEAR_ZERO:
        return ctx.na("debt_to_equity", label, unit, basis, "equity is zero/near-zero")
    value = ((ltd or 0.0) + (dc or 0.0)) / eq
    reason = _debt_split_reason(ctx)
    if reason:
        return ctx.approx("debt_to_equity", label, value, unit, basis, reason)
    return ctx.ok("debt_to_equity", label, value, unit, basis)


def _net_debt(ctx: _Ctx) -> MetricValue:
    label, unit, basis = "Net Debt", "USD", "as-of"
    ltd = ctx.stock("long_term_debt")
    dc = ctx.stock("debt_current")
    cash = ctx.stock("cash_and_equivalents")
    if ltd is None and dc is None:
        return ctx.na("net_debt", label, unit, basis, "no debt reported")
    value = (ltd or 0.0) + (dc or 0.0) - (cash or 0.0)
    reason = _debt_split_reason(ctx)
    if reason:
        return ctx.approx("net_debt", label, value, unit, basis, reason)
    return ctx.ok("net_debt", label, value, unit, basis)


def _interest_coverage(ctx: _Ctx) -> MetricValue:
    return _ratio(
        ctx,
        "interest_coverage",
        "Interest Coverage",
        ctx.ttm("operating_income"),
        ctx.ttm("interest_expense"),
    )


def _fcf(ctx: _Ctx) -> MetricValue:
    label, unit, basis = "Free Cash Flow", "USD", "TTM"
    ocf = ctx.ttm("cash_from_operations")
    capex = ctx.ttm("capital_expenditures")
    if ocf is None:
        return ctx.na("fcf", label, unit, basis, "operating cash flow not reported")
    # capex is a positive outflow — subtract as-is (R8), don't double-negate.
    return ctx.ok("fcf", label, ocf - (capex or 0.0), unit, basis)


def _fcf_margin(ctx: _Ctx) -> MetricValue:
    ocf = ctx.ttm("cash_from_operations")
    capex = ctx.ttm("capital_expenditures")
    rev = ctx.ttm("revenue")
    fcf = None if ocf is None else ocf - (capex or 0.0)
    return _ratio(ctx, "fcf_margin", "FCF Margin", fcf, rev)


def _accruals(ctx: _Ctx) -> MetricValue:
    label, unit, basis = "Accruals (Earnings Quality)", "ratio", "TTM"
    ni = ctx.ttm("net_income")
    ocf = ctx.ttm("cash_from_operations")
    avg, exact = ctx.avg("total_assets")
    if ni is None or ocf is None or avg is None:
        return ctx.na("accruals", label, unit, basis, "net income, OCF, or assets not reported")
    if abs(avg) < _NEAR_ZERO:
        return ctx.na("accruals", label, unit, basis, "average assets is zero/near-zero")
    value = (ni - ocf) / avg
    if not exact:
        return ctx.approx("accruals", label, value, unit, basis, _INEXACT_AVG_REASON)
    return ctx.ok("accruals", label, value, unit, basis)


def _asset_turnover(ctx: _Ctx) -> MetricValue:
    return _ttm_over_avg(ctx, "asset_turnover", "Asset Turnover", "revenue", "total_assets")


def _inventory_turnover(ctx: _Ctx) -> MetricValue:
    return _ttm_over_avg(
        ctx, "inventory_turnover", "Inventory Turnover", "cost_of_revenue", "inventory"
    )


def _dso(ctx: _Ctx) -> MetricValue:
    label, unit, basis = "Days Sales Outstanding", "days", "TTM"
    avg, exact = ctx.avg("accounts_receivable")
    rev = ctx.ttm("revenue")
    if avg is None or rev is None:
        return ctx.na("dso", label, unit, basis, "receivables or revenue not reported")
    if abs(rev) < _NEAR_ZERO:
        return ctx.na("dso", label, unit, basis, "revenue is zero/near-zero")
    value = avg / rev * 365.0
    if not exact:
        return ctx.approx("dso", label, value, unit, basis, _INEXACT_AVG_REASON)
    return ctx.ok("dso", label, value, unit, basis)


def _eps_basic(ctx: _Ctx) -> MetricValue:
    return _reported_per_share(ctx, "eps_basic", "EPS (Basic)")


def _eps_diluted(ctx: _Ctx) -> MetricValue:
    return _reported_per_share(ctx, "eps_diluted", "EPS (Diluted)")


def _reported_per_share(ctx: _Ctx, concept: str, label: str) -> MetricValue:
    # EPS is reported per period; it is not summable across quarters, so off-annual → nm.
    value = ctx.ttm(concept, allow_sum=False)
    if value is None:
        if ctx.anchor.fiscal_period != "FY":
            return ctx.nm(
                concept, label, "USD/shares", "TTM", "EPS is not summable across quarters"
            )
        return ctx.na(concept, label, "USD/shares", "TTM", "not reported for this period")
    return ctx.ok(concept, label, value, "USD/shares", "TTM")


def _book_value_per_share(ctx: _Ctx) -> MetricValue:
    label, unit, basis = "Book Value per Share", "USD/shares", "as-of"
    eq = ctx.stock("stockholders_equity")
    sh = ctx.stock("shares_outstanding")
    if eq is None:
        return ctx.na("book_value_per_share", label, unit, basis, "equity not reported")
    if sh is None:
        # R6: shares_outstanding may be absent if the filer only tags it in dei (now ingested)
        # or reports per-class counts only.
        return ctx.na("book_value_per_share", label, unit, basis, "shares outstanding not reported")
    if abs(sh) < _NEAR_ZERO:
        return ctx.na("book_value_per_share", label, unit, basis, "shares outstanding is zero")
    return ctx.ok("book_value_per_share", label, eq / sh, unit, basis)


def _fcf_per_share(ctx: _Ctx) -> MetricValue:
    label, unit, basis = "FCF per Share", "USD/shares", "TTM"
    ocf = ctx.ttm("cash_from_operations")
    capex = ctx.ttm("capital_expenditures")
    sh = ctx.ttm("shares_diluted", allow_sum=False)
    if ocf is None or sh is None:
        return ctx.na(
            "fcf_per_share", label, unit, basis, "OCF or diluted share count not reported"
        )
    if abs(sh) < _NEAR_ZERO:
        return ctx.na("fcf_per_share", label, unit, basis, "diluted share count is zero")
    return ctx.ok("fcf_per_share", label, (ocf - (capex or 0.0)) / sh, unit, basis)


def _share_count(ctx: _Ctx) -> MetricValue:
    label, unit, basis = "Diluted Share Count", "shares", "TTM"
    sh = ctx.ttm("shares_diluted", allow_sum=False)
    if sh is None:
        return ctx.na("share_count", label, unit, basis, "diluted share count not reported")
    return ctx.ok("share_count", label, sh, unit, basis)


def _debt_split_reason(ctx: _Ctx) -> str | None:
    """R5: detect the debt-split undercount case, where leverage is reported low.

    True when the filer tags a current-debt component (LongTermDebtCurrent / ShortTermBorrowings)
    but no aggregate DebtCurrent at this period end — the pick-one selector then misses part of
    current debt, so any metric using debt_current is flagged `approximate`.
    """
    present = _raw_instant_tags_present(
        ctx.facts, ["DebtCurrent", "LongTermDebtCurrent", "ShortTermBorrowings"], ctx.anchor.end
    )
    if "DebtCurrent" in present:
        return None
    if present & {"LongTermDebtCurrent", "ShortTermBorrowings"}:
        return (
            "current debt split across component tags with no aggregate; total may be understated"
        )
    return None


# Registry — ordered for display (profitability → per-share), one entry per metric.
_METRICS = [
    _gross_margin,
    _operating_margin,
    _net_margin,
    _roa,
    _roe,
    _roic,
    _revenue_growth,
    _earnings_growth,
    _ocf_growth,
    _growth_acceleration,
    _current_ratio,
    _quick_ratio,
    _debt_to_equity,
    _net_debt,
    _interest_coverage,
    _fcf,
    _fcf_margin,
    _accruals,
    _asset_turnover,
    _inventory_turnover,
    _dso,
    _eps_basic,
    _eps_diluted,
    _book_value_per_share,
    _fcf_per_share,
    _share_count,
]


def compute_metrics(
    facts: list[RawFact], cik: int, fiscal_year: int, fiscal_period: FiscalPeriod
) -> CompanyMetrics:
    """Compute the full metric set for one company + fiscal period.

    Returns an empty `metrics` list when the requested period isn't present in the facts at
    all (the caller distinguishes that from "present but every metric is N/A").
    """
    index = _index_concepts(facts)
    anchor = _resolve_anchor(index, fiscal_year, fiscal_period)
    if anchor is None:
        return CompanyMetrics(
            cik=cik, fiscal_year=fiscal_year, fiscal_period=fiscal_period, metrics=[]
        )
    ctx = _Ctx(index, facts, anchor)
    return CompanyMetrics(
        cik=cik,
        fiscal_year=fiscal_year,
        fiscal_period=fiscal_period,
        metrics=[fn(ctx) for fn in _METRICS],
    )


def available_metric_periods(facts: list[RawFact]) -> list[tuple[int, str]]:
    """Fiscal years for which an annual metric set can be computed, newest first."""
    index = _index_concepts(facts)
    return [(y, "FY") for y in sorted(_fiscal_year_ends(index), reverse=True)]


def metric_periods(facts: list[RawFact]) -> list[dict]:
    """Every (year, period) the engine can actually compute, newest period-end first.

    Each entry is {"year", "period", "period_end"} for an annual (FY) or quarterly (Q1-Q4)
    metric set -- including quarters of an in-progress fiscal year. This is the authoritative
    axis for a UI period selector: it reflects what `compute_metrics` will resolve, unlike the
    statement-layer `(fy, fp)` labels (which the metric engine deliberately doesn't key on).
    """
    index = _index_concepts(facts)
    fye = _fiscal_year_ends(index)
    all_q = _all_quarter_ends(index)
    out: list[dict] = []
    for year, end in fye.items():
        out.append({"year": year, "period": "FY", "period_end": end})
    # Quarters for every fiscal year that has quarter data -- completed years plus the one
    # in-progress year (the year after the latest FYE), so the freshest quarters appear.
    candidate_years = set(fye)
    if fye:
        candidate_years.add(max(fye) + 1)
    for year in candidate_years:
        for i, end in enumerate(_quarters_in_fy(all_q, fye, year), start=1):
            if i <= 4:
                out.append({"year": year, "period": "Q" + str(i), "period_end": end})
    out.sort(key=lambda p: p["period_end"], reverse=True)
    return out

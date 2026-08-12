"""Composite sector-health THEMES (sector-overview redesign, Phase 0).

The single source of truth for which materialized metrics roll into each health theme, in the
guide's scorecard order (`docs/layout_guides/01-sector-overview.md`). Both the offline scoring
batch (`analytical/sector_theme_scores.py`) and the serving endpoint import from here so the two
never drift.

Only **scale-free** metrics (ratios, margins, growth rates, turnovers, days) are constituents:
a composite score z-scores per-sector *medians* across sectors, which is only meaningful for a
scale-free quantity -- a raw dollar level (fcf, net_debt) conflates sector *size* with health, so
it is excluded (it is not in `METRIC_DIRECTION` either). Every constituent must have a favorability
direction (`normalize/metrics.higher_is_better`), which orients its z-score.

Two of the guide's seven themes -- **Accounting quality** and **Structure & activity** -- are NOT
scored yet: they need restatement / material-weakness / late-filing signals and S-1 / Form 15 /
8-K / insider / institutional flow that are not ingested or not sector-aggregated (largely Track 2).
They are surfaced by the endpoint as explicit `scored: false` markers (never a fabricated 0), not
materialized as empty rows. See `DEFERRED_THEMES`.
"""

from __future__ import annotations

from collections.abc import Mapping
from dataclasses import dataclass

from secfin.normalize.metrics import METRIC_DIRECTION

# theme key -> (label, ordered constituent metric keys). Order matches the guide's scorecard.
THEMES: dict[str, tuple[str, tuple[str, ...]]] = {
    "profitability": (
        "Profitability & returns",
        ("gross_margin", "operating_margin", "net_margin", "roa", "roe", "roic"),
    ),
    "growth": (
        "Growth",
        ("revenue_growth_yoy", "earnings_growth_yoy", "ocf_growth_yoy", "growth_acceleration"),
    ),
    "financial_health": (
        "Financial health",
        # net_debt (a $ level) is deliberately excluded -- see the scale-free rule above.
        ("debt_to_equity", "interest_coverage", "current_ratio", "quick_ratio"),
    ),
    "cash_investment": (
        "Cash & investment",
        # thin but honest: fcf is a $ level and is excluded, leaving the two ratios.
        ("fcf_margin", "ocf_growth_yoy"),
    ),
    "operating_efficiency": (
        "Operating efficiency",
        ("inventory_turnover", "dso", "dio", "dpo", "ccc", "asset_turnover"),
    ),
}

# Guide themes we cannot honestly score yet. key -> (label, reason). Emitted by the endpoint as
# scored:false markers so the UI can render "not yet scored" tiles; never materialized as rows.
DEFERRED_THEMES: dict[str, tuple[str, str]] = {
    "accounting_quality": (
        "Accounting quality",
        "Needs restatement / material-weakness / late-filing signals not yet ingested "
        "(Track-2 / filing-metadata).",
    ),
    "structure_activity": (
        "Structure & activity",
        "Needs S-1 / Form 15 / 8-K / insider / institutional flow not yet sector-aggregated.",
    ),
}

THEME_LABELS: dict[str, str] = {
    k: v[0] for k, v in {**THEMES, **DEFERRED_THEMES}.items()  # type: ignore[dict-item]
}

# A metric's cross-sector z-score needs at least this many sectors reporting a median for the
# period (below it -- or with ~zero dispersion -- the constituent is excluded, never zero-scored).
MIN_SECTORS_FOR_ZSCORE = 3

# A metric summary median below this in magnitude is treated as usable; dispersion below this is
# "no spread" and yields all-zero z's rather than a divide-by-tiny blow-up.
NEAR_ZERO = 1e-9


def min_constituents(n: int) -> int:
    """How many of a theme's `n` constituents a sector must have (present + z-scoreable) before the
    theme is scored for it -- at least half, and never fewer than 2. Below this the sector's theme
    is omitted entirely (not a low score, not a zero)."""
    return max(2, (n + 1) // 2)


# Fail loudly at import if a constituent lacks a favorability direction (guards guide §5 / AC-12).
_missing = sorted(
    {m for _label, metrics in THEMES.values() for m in metrics if m not in METRIC_DIRECTION}
)
if _missing:  # pragma: no cover - a wiring error, surfaced immediately
    raise RuntimeError(f"themes.py: constituents missing a METRIC_DIRECTION entry: {_missing}")


@dataclass
class CompanyThemeScore:
    """One theme's percentile for ONE company within its SIC peer group."""

    key: str
    label: str
    scored: bool
    #: 0-100, favorability-ORIENTED: 90 means "better than 90% of peers", never "high value".
    percentile: float | None
    #: Which constituents actually had a rank, and how many the theme defines.
    covered: int
    total: int
    #: The constituent metrics that contributed, with their oriented percentiles.
    components: list[tuple[str, float]]
    reason: str | None = None


def company_theme_scores(
    ranks: Mapping[str, float], *, min_covered: int = 2
) -> list[CompanyThemeScore]:
    """Roll a company's per-metric peer percentiles up into per-theme percentiles.

    `ranks` is metric key -> RAW percentile (0-100) from `metric_ranks`, which is a position, not
    a judgement: `percent_rank` of the value, so a highly-levered filer scores 99 on
    `debt_to_equity`. Every constituent is therefore ORIENTED here through
    `metrics.higher_is_better` -- a lower-is-better metric contributes `100 - percentile` -- and
    only after that is the mean meaningful. Averaging raw percentiles would score debt and
    liquidity in opposite directions inside one "Financial health" number.

    **Mean of the constituents that exist, with the coverage reported.** A theme is NOT rescaled
    to pretend the missing ones were average: a company ranked on 2 of 6 profitability metrics
    gets a percentile over those 2 and says so, and below `min_covered` it is `scored=False` with
    a reason rather than a number built from one metric.

    **The two DEFERRED_THEMES are returned unscored**, exactly as the sector endpoint returns
    them -- never a fabricated value. That is the whole reason this function returns a list of
    all seven rather than a dict of whatever it could compute: a caller iterating the result
    cannot accidentally omit the two it cannot answer, and a reader sees that they were asked.

    Pure: no DB, no network, no clock.
    """
    out: list[CompanyThemeScore] = []
    for key, (label, metrics) in THEMES.items():
        components: list[tuple[str, float]] = []
        for m in metrics:
            p = ranks.get(m)
            if p is None:
                continue
            components.append((m, p if METRIC_DIRECTION[m] else 100.0 - p))
        if len(components) < min_covered:
            out.append(
                CompanyThemeScore(
                    key=key,
                    label=label,
                    scored=False,
                    percentile=None,
                    covered=len(components),
                    total=len(metrics),
                    components=components,
                    reason=(
                        f"Ranked on {len(components)} of this theme's {len(metrics)} metrics; "
                        f"at least {min_covered} are needed before a percentile means anything."
                    ),
                )
            )
            continue
        out.append(
            CompanyThemeScore(
                key=key,
                label=label,
                scored=True,
                percentile=round(sum(v for _, v in components) / len(components), 1),
                covered=len(components),
                total=len(metrics),
                components=components,
            )
        )

    for key, (label, reason) in DEFERRED_THEMES.items():
        out.append(
            CompanyThemeScore(
                key=key, label=label, scored=False, percentile=None,
                covered=0, total=0, components=[], reason=reason,
            )
        )
    return out

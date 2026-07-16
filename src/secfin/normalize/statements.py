"""Build canonical statements from RawFacts using the concept mapping.

Given the flat RawFacts for a company, select the facts for a requested
(fiscal_year, fiscal_period), then for each canonical concept on the statement pick the
best available source tag (first candidate that has a value) and emit a StatementLine.

THE COMPARATIVE-COLUMN TRAP (the bug class this module must defend against): in SEC
companyfacts, a fact's `fy`/`fp` describe the FILING's fiscal period, not the fact's own
duration. A FY2023 10-K tags all three of its income columns (FY2021, FY2022, FY2023)
as fy=2023/fp=FY, and a Q3 10-Q tags both the discrete quarter and the 9-month YTD (and
the prior-year comparatives) as fy/fp of the filing. Selecting facts by (fy, fp) alone
therefore mixes several real-world periods. Found live 2026-07-16: statements served the
*oldest comparative* column (AAPL "FY2023" returned FY2021's revenue), with the winner
decided by dict insertion order.

Defense: within the (fy, fp) facts we first find the filing's PRIMARY column — the
latest `period_end` (durations) / `instant` (balance sheet) present — and build the
statement only from facts in that column. Ties between durations sharing that end date
(discrete quarter vs YTD) are broken by which span matches the requested fiscal period.
A concept reported only in a comparative column is DROPPED, not borrowed: one statement
never mixes periods (same honesty rule as the rest of the product — a missing line is a
documented gap, a silently wrong-period line is a lie).

Restatement handling: if the same concept+period appears in multiple filings, the fact
with the latest `filed` date wins. We never drop the others upstream (they live in the
store); this builder just chooses "current".
"""

from __future__ import annotations

import datetime as dt
from collections import defaultdict

from secfin.normalize.mapping import STATEMENT_CONCEPTS, candidate_tags, label_for_concept
from secfin.normalize.schema import (
    FiscalPeriod,
    NormalizedFactLine,
    NormalizedView,
    RawFact,
    Statement,
    StatementLine,
    StatementType,
)


def _period_key(fact: RawFact) -> tuple[int | None, str | None]:
    return (fact.fiscal_year, fact.fiscal_period)


def _column_end(fact: RawFact) -> str:
    """The date identifying which column of the filing a fact belongs to."""
    return fact.period_end or fact.instant or ""


def _span_matches(fact: RawFact, fiscal_period: FiscalPeriod) -> bool:
    """Does a duration fact's span plausibly match the requested fiscal period?

    Instants (and open-ended facts) trivially match. Bands are generous enough for
    52/53-week fiscal calendars; this is a tie-break preference, not a filter.
    """
    if not (fact.period_start and fact.period_end):
        return True
    try:
        days = (
            dt.date.fromisoformat(fact.period_end) - dt.date.fromisoformat(fact.period_start)
        ).days
    except ValueError:
        return True
    if fiscal_period == "FY":
        return 330 <= days <= 400
    return 75 <= days <= 105  # a discrete quarter, not the cumulative YTD duration


def _rank(fact: RawFact, fiscal_period: FiscalPeriod) -> tuple[bool, str]:
    """Order facts within one filing column: span match first, then latest filed
    (restatements/amendments win)."""
    return (_span_matches(fact, fiscal_period), fact.filed or "")


def build_statement(
    facts: list[RawFact],
    cik: int,
    statement: StatementType,
    fiscal_year: int,
    fiscal_period: FiscalPeriod,
) -> Statement:
    """Assemble one canonical statement for the given company + period."""
    period = (fiscal_year, fiscal_period)
    in_period = [f for f in facts if _period_key(f) == period]

    # Pass 1: identify the filing's primary column — the latest period_end/instant
    # among this period's facts FOR THIS STATEMENT'S OWN TAGS. Everything earlier is a
    # comparative column re-tagged with the filing's fy/fp (see module docstring).
    # Restricting to the statement's candidate tags matters: the same (fy, fp) also
    # carries dei cover-page instants dated AFTER fiscal period end (e.g. the
    # shares-outstanding-as-of-filing-date count, ~3 weeks past FY-end) — chasing those
    # would put the "primary column" on a date where no statement concept exists.
    stmt_tags = {
        tag
        for concept in STATEMENT_CONCEPTS[statement]
        for tag in candidate_tags(concept)
    }
    # dei facts never anchor the primary column: they're cover-page metadata dated as
    # of the FILING (e.g. shares outstanding ~3 weeks after fiscal year-end), and some
    # dei tags (EntityCommonStockSharesOutstanding) are legitimate concept candidates —
    # anchoring on them would put the "primary column" past every real statement fact
    # and empty the statement (this exact failure shipped briefly for balance sheets).
    primary_end = max(
        (
            _column_end(f)
            for f in in_period
            if f.gaap_tag in stmt_tags and f.taxonomy != "dei"
        ),
        default="",
    ) or max((_column_end(f) for f in in_period), default="")
    # ^ fallback to any fact's date so the "filing on record, mapping gap" metadata
    # path below still works for filings where nothing mapped.

    # Pass 2: index the best fact per gaap_tag WITHIN the primary column. dei facts are
    # exempt from the column check for the symmetric reason: a cover page is
    # single-dated, so a dei fact is never a comparative column — there is no
    # wrong-period risk in serving it alongside the primary column.
    best_by_tag: dict[str, RawFact] = {}
    for f in in_period:
        if f.taxonomy != "dei" and _column_end(f) != primary_end:
            continue
        existing = best_by_tag.get(f.gaap_tag)
        if existing is None or _rank(f, fiscal_period) > _rank(existing, fiscal_period):
            best_by_tag[f.gaap_tag] = f

    lines: list[StatementLine] = []
    meta: RawFact | None = None

    for concept in STATEMENT_CONCEPTS[statement]:
        chosen: RawFact | None = None
        for tag in candidate_tags(concept):
            fact = best_by_tag.get(tag)
            if fact is not None and fact.value is not None:
                chosen = fact
                break
        if chosen is None:
            continue
        # Statement-level period metadata comes from a primary-column fact, never a
        # dei cover-page fact (whose as-of date is the filing date, not the period).
        if chosen.taxonomy != "dei":
            meta = meta or chosen
        lines.append(
            StatementLine(
                canonical_concept=concept,
                label=label_for_concept(concept),
                value=chosen.value,
                unit=chosen.unit,
                source_tag=chosen.gaap_tag,
                is_extension=chosen.is_extension,
            )
        )

    if meta is None and best_by_tag:
        # A filing exists for this period (it has facts) even though none of them mapped
        # to a concept on this statement. Still surface its metadata so callers can tell
        # "filing on record, mapping gap" apart from "no filing for this period at all".
        meta = max(best_by_tag.values(), key=lambda f: f.filed or "")

    return Statement(
        cik=cik,
        statement=statement,
        fiscal_year=fiscal_year,
        fiscal_period=fiscal_period,
        period_start=meta.period_start if meta else None,
        period_end=meta.period_end or (meta.instant if meta else None) if meta else None,
        form=meta.form if meta else None,
        filed=meta.filed if meta else None,
        accession=meta.accession if meta else None,
        lines=lines,
    )


def build_normalized_view(
    facts: list[RawFact],
    cik: int,
    fiscal_year: int,
    fiscal_period: FiscalPeriod,
) -> NormalizedView:
    """The statement builder's mechanical normalizations applied to EVERY tag.

    Same defenses as `build_statement` -- primary-column selection (the comparative-
    column trap), discrete-quarter-vs-YTD tie-break, latest-`filed` restatement pick,
    dei cover-page handling -- but with no concept mapping: one row per (tag, unit)
    present in the filing's primary column. This is the tag-level normalized layer
    (ROADMAP_DATA_DEPTH): cross-company consistent only to the extent FASB's shared
    vocabulary makes it so; variant unification remains the canonical layer's job.

    Two deliberate differences from `build_statement`:
    - The primary column is anchored by ALL non-dei facts (there is no statement tag
      set to anchor on). dei facts are still served without anchoring, same rationale.
    - Rows are keyed by (tag, unit), not tag alone, so a tag reported in two units
      keeps both rows -- nothing dropped.
    """
    period = (fiscal_year, fiscal_period)
    in_period = [f for f in facts if _period_key(f) == period]

    primary_end = max(
        (_column_end(f) for f in in_period if f.taxonomy != "dei"),
        default="",
    ) or max((_column_end(f) for f in in_period), default="")

    best_by_key: dict[tuple[str, str, str], RawFact] = {}
    for f in in_period:
        if f.taxonomy != "dei" and _column_end(f) != primary_end:
            continue
        key = (f.taxonomy, f.gaap_tag, f.unit)
        existing = best_by_key.get(key)
        if existing is None or _rank(f, fiscal_period) > _rank(existing, fiscal_period):
            best_by_key[key] = f

    from secfin.normalize.mapping import concept_for_tag

    rows = [
        NormalizedFactLine(
            taxonomy=f.taxonomy,
            gaap_tag=f.gaap_tag,
            label=f.label,
            unit=f.unit,
            value=f.value,
            period_start=f.period_start,
            period_end=f.period_end,
            instant=f.instant,
            is_extension=f.is_extension,
            canonical_concept=concept_for_tag(f.gaap_tag),
        )
        for f in sorted(best_by_key.values(), key=lambda f: (f.taxonomy, f.gaap_tag, f.unit))
        if f.value is not None
    ]

    # Statement-level metadata from a primary-column, non-dei fact. Prefer a duration
    # fact whose span matches the requested period, so the header carries the fiscal
    # span (an instant winning the tie leaves period_start empty, and in a Q filing
    # the YTD duration shares the column with the discrete quarter); then latest
    # filed so amendments set the header.
    def _meta_rank(f: RawFact) -> tuple[bool, bool, str]:
        return (bool(f.period_start), _span_matches(f, fiscal_period), f.filed or "")

    meta: RawFact | None = None
    for f in best_by_key.values():
        if f.taxonomy == "dei":
            continue
        if meta is None or _meta_rank(f) > _meta_rank(meta):
            meta = f
    if meta is None and best_by_key:
        meta = max(best_by_key.values(), key=lambda f: f.filed or "")

    return NormalizedView(
        cik=cik,
        fiscal_year=fiscal_year,
        fiscal_period=fiscal_period,
        period_start=meta.period_start if meta else None,
        period_end=(meta.period_end or meta.instant) if meta else None,
        form=meta.form if meta else None,
        filed=meta.filed if meta else None,
        accession=meta.accession if meta else None,
        rows=rows,
    )


def available_periods(facts: list[RawFact]) -> list[tuple[int, str]]:
    """List distinct (fiscal_year, fiscal_period) pairs present in the facts, sorted."""
    seen: set[tuple[int, str]] = set()
    for f in facts:
        if f.fiscal_year is not None and f.fiscal_period:
            seen.add((f.fiscal_year, f.fiscal_period))
    return sorted(seen, reverse=True)


def coverage_report(facts: list[RawFact]) -> dict[str, int]:
    """Diagnostic: how many facts map to a canonical concept vs. don't.

    Useful for spotting mapping gaps — unmapped high-frequency tags are candidates to add.
    """
    from secfin.normalize.mapping import concept_for_tag

    counts: dict[str, int] = defaultdict(int)
    for f in facts:
        counts["mapped" if concept_for_tag(f.gaap_tag) else "unmapped"] += 1
    return dict(counts)

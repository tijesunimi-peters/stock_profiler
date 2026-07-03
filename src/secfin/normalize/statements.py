"""Build canonical statements from RawFacts using the concept mapping.

Given the flat RawFacts for a company, select the facts for a requested
(fiscal_year, fiscal_period), then for each canonical concept on the statement pick the
best available source tag (first candidate that has a value) and emit a StatementLine.

Restatement handling: if the same concept+period appears in multiple filings, the fact
with the latest `filed` date wins. We never drop the others upstream (they live in the
store); this builder just chooses "current".
"""

from __future__ import annotations

from collections import defaultdict

from secfin.normalize.mapping import STATEMENT_CONCEPTS, candidate_tags, label_for_concept
from secfin.normalize.schema import (
    FiscalPeriod,
    RawFact,
    Statement,
    StatementLine,
    StatementType,
)


def _period_key(fact: RawFact) -> tuple[int | None, str | None]:
    return (fact.fiscal_year, fact.fiscal_period)


def _latest(a: RawFact, b: RawFact) -> RawFact:
    """Pick the more recently filed fact (restatements win)."""
    return b if (b.filed or "") > (a.filed or "") else a


def build_statement(
    facts: list[RawFact],
    cik: int,
    statement: StatementType,
    fiscal_year: int,
    fiscal_period: FiscalPeriod,
) -> Statement:
    """Assemble one canonical statement for the given company + period."""
    # index best (latest-filed) fact per gaap_tag for this exact period
    best_by_tag: dict[str, RawFact] = {}
    period = (fiscal_year, fiscal_period)
    for f in facts:
        if _period_key(f) != period:
            continue
        existing = best_by_tag.get(f.gaap_tag)
        best_by_tag[f.gaap_tag] = f if existing is None else _latest(existing, f)

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

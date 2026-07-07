"""Cross-company screening (Milestone 4): filter companies by canonical-concept
thresholds for one SEC "frame" period.

Frames data is NOT a new canonical model -- it reuses `RawFact`/`RawFactRepository`
exactly as docs/DATA_MODEL.md's Milestone 2.5 write-up anticipated.
`ingest/frames_backfill.py` writes frames-sourced points into the same `raw_facts`
table ordinary per-company ingestion uses, tagged with the exact SEC frame string
(`RawFact.frame`, e.g. "CY2023Q4"). `RawFactRepository.screen()` filters on that exact
string rather than `fiscal_year`/`fiscal_period` -- frame periods are CALENDAR-aligned,
while a company's own fiscal period may not line up with the calendar (a company with a
March fiscal year-end reports "FY2023" for Apr-2022..Mar-2023, not the same window as
frame "CY2023"). Keying on the frame string sidesteps that mismatch entirely rather than
attempting to reconcile it, and also means frames-sourced rows are never silently
conflated with ordinary per-company companyfacts rows for a nominally-same period.
"""

from __future__ import annotations

from secfin.normalize.mapping import STATEMENT_CONCEPTS, candidate_tags, label_for_concept
from secfin.normalize.schema import FiscalPeriod, RawFact
from secfin.sec.frames import FrameFact, duration_frame_period, instant_frame_period

# Deliberately a small, curated starter subset of mapping.CONCEPTS: concepts with a
# small number of candidate tags and near-universal coverage across filers on the
# frames endpoint. Grow this list deliberately, same "table grows over time" convention
# as mapping.py itself -- see docs/DATA_MODEL.md.
SCREENABLE_CONCEPTS: list[str] = [
    "revenue",
    "net_income",
    "total_assets",
    "total_liabilities",
    "stockholders_equity",
    "cash_and_equivalents",
]

_INSTANT_CONCEPTS = frozenset(STATEMENT_CONCEPTS["balance"])


def is_instant_concept(concept: str) -> bool:
    """True for balance-sheet concepts (point-in-time), False for income/cashflow
    concepts (a duration over the period)."""
    return concept in _INSTANT_CONCEPTS


def frame_period_for_concept(concept: str, year: int, period: FiscalPeriod) -> str:
    """The SEC frame period string appropriate for a concept's duration/instant shape."""
    if is_instant_concept(concept):
        return instant_frame_period(year, period)
    return duration_frame_period(year, period)


def facts_from_frame(
    concept: str, tag: str, frame_period: str, frame_facts: list[FrameFact]
) -> list[RawFact]:
    """Map one frame fetch's results to RawFacts, ready for `upsert_raw_facts`.

    `fiscal_year`/`fiscal_period` are deliberately left unset -- frames are calendar-
    aligned, not fiscal-aligned, and the SEC's frame payload carries no fy/fp/filed/form
    per row at all (verified live against the real endpoint; see sec/frames.py).
    `frame` is the sole key `screen()` filters on, so it must be exact and unambiguous.
    """
    label = label_for_concept(concept)
    instant = is_instant_concept(concept)
    facts: list[RawFact] = []
    for f in frame_facts:
        facts.append(
            RawFact(
                cik=f.cik,
                taxonomy="us-gaap",
                gaap_tag=tag,
                label=label,
                unit="USD",
                value=f.value,
                period_start=None if instant else f.period_start,
                period_end=None if instant else f.period_end,
                instant=f.period_end if instant else None,
                accession=f.accession,
                frame=frame_period,
            )
        )
    return facts


def resolve_concept_values(rows: list[tuple[int, str, float]], concept: str) -> dict[int, float]:
    """Reconcile `screen()` rows for one concept's candidate tags into one value per CIK.

    A concept can have several candidate tags (mapping.candidate_tags); frames is
    single-tag-per-call, so `ingest/frames_backfill.py` fetches each candidate tag
    separately and all land in the same frame. This picks the highest-priority tag's
    value per company if more than one candidate tag happens to be present for the same
    company+frame -- mirrors normalize/statements.build_statement's "first candidate
    with a value wins" rule, just across companies instead of within one company.
    """
    priority = {tag: i for i, tag in enumerate(candidate_tags(concept))}
    best: dict[int, tuple[int, float]] = {}  # cik -> (priority_rank, value)
    for cik, tag, value in rows:
        rank = priority.get(tag)
        if rank is None:
            continue
        existing = best.get(cik)
        if existing is None or rank < existing[0]:
            best[cik] = (rank, value)
    return {cik: value for cik, (_, value) in best.items()}

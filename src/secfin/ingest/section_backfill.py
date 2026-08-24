"""Fetch, segment, score and YoY-diff 10-K/10-Q filing sections (Track 2 Wave A).

Chains Stages 1-4 for one (cik, accession) at a time: `sec/filing_document.py` (fetch) ->
`sec/filing_sections.py` (segment) -> `normalize/section_metrics.py` (tone/readability) ->
`normalize/section_similarity.py` (YoY diff against the prior same-form filing). Feeds
`analytical/tone_shift_alerts.py` (Stage 6).

**A per-filing network-fetch job, like `insider_backfill.py` -- not a bulk-download-and-parse job
like `ingest/backfill.py`.** Does not hook into that pipeline's multiprocessing/single-writer
queue; each repository here owns its own WAL-mode connection (the same shape
`sqlite_filing_cover_repository.py` and Wave 0's `sector_governance_stats.py` ingest path already
use), and this orchestration function never opens a raw connection itself (guardrail 8).

**Candidate universe**: the same `known_issuer_ciks` this codebase's `insider_backfill.py` already
established as the trustworthy-issuer set (every CIK with a real `raw_facts` row, so a
reporting-owner-only filer entity is never walked as if it were an operating company) -- reused
directly rather than re-derived, since the same safety reasoning applies here.

Run: `python -m secfin.ingest.section_backfill [--forms 10-K,10-Q] [--limit 1] [--refresh]`
"""

from __future__ import annotations

import argparse
import asyncio
import logging

from secfin.config import settings
from secfin.ingest.insider_backfill import known_issuer_ciks
from secfin.normalize.section_metrics import compute_text_metrics
from secfin.normalize.section_similarity import compute_similarity, find_prior_accession
from secfin.sec.client import SECClient
from secfin.sec.filing_document import fetch_primary_document
from secfin.sec.filing_sections import segment_filing
from secfin.storage.filing_index_repository import FilingIndexRepository
from secfin.storage.filing_section_repository import FilingSectionRepository
from secfin.storage.section_metric_repository import SectionMetricRepository
from secfin.storage.section_similarity_repository import (
    SectionSimilarityRepository,
    SectionSimilarityRow,
)
from secfin.storage.sqlite_filing_index_repository import SQLiteFilingIndexRepository
from secfin.storage.sqlite_filing_section_repository import SQLiteFilingSectionRepository
from secfin.storage.sqlite_repository import SQLiteRawFactRepository
from secfin.storage.sqlite_section_metric_repository import SQLiteSectionMetricRepository
from secfin.storage.sqlite_section_similarity_repository import (
    SQLiteSectionSimilarityRepository,
)

logger = logging.getLogger(__name__)

_PROGRESS_EVERY = 100
_DEFAULT_FORMS = ("10-K", "10-Q")


async def ingest_filing_sections(
    client: SECClient,
    cik: int,
    filing,  # FilingIndexEntry
    filing_repo: FilingIndexRepository,
    section_repo: FilingSectionRepository,
    metric_repo: SectionMetricRepository,
    similarity_repo: SectionSimilarityRepository,
    *,
    refresh: bool = False,
) -> str:
    """Stages 1-4 for one filing. Returns "processed", "skipped", or "failed" for the caller's
    tally.

    `refresh=False` skips a filing already parsed under the current `SECTIONS_SCHEMA_VERSION` --
    `get_sections` returning anything at all means the schema is current (an older-schema row
    reads as empty, see `SQLiteFilingSectionRepository.get_sections`), so a non-empty result IS
    the "already done" signal, with no separate bookkeeping needed.
    """
    if not refresh and section_repo.get_sections(cik, filing.accession):
        return "skipped"

    try:
        fetched = await fetch_primary_document(client, cik, filing)
    except Exception:
        logger.exception(
            "failed to fetch primary document for CIK %d accession %s", cik, filing.accession
        )
        return "failed"
    if fetched is None:
        logger.warning(
            "no <TYPE>%s block found in index-headers for CIK %d accession %s -- skipping",
            filing.form, cik, filing.accession,
        )
        return "failed"
    _filename, document_html = fetched

    sections = segment_filing(document_html, filing.form)
    if not sections:
        return "skipped"  # form not applicable (neither 10-K nor 10-Q)
    section_repo.upsert_sections(cik, filing.accession, sections)

    prior_accession = find_prior_accession(filing_repo, cik, filing.form, filing.accession)
    prior_sections = (
        section_repo.get_sections(cik, prior_accession) if prior_accession else {}
    )

    for section in sections:
        if section.status != "ok":
            continue
        metrics = compute_text_metrics(section.cleaned_text)
        metric_repo.upsert_metrics(cik, filing.accession, section.item_code, metrics)

        prior = prior_sections.get(section.item_code)
        if prior is None or prior.status != "ok":
            continue
        similarity = compute_similarity(section.cleaned_text, prior.cleaned_text)
        if similarity is None:
            continue
        similarity_repo.upsert(
            SectionSimilarityRow(
                cik=cik,
                accession=filing.accession,
                item_code=section.item_code,
                prior_accession=prior_accession,
                cosine_similarity=similarity.cosine_similarity,
                jaccard_similarity=similarity.jaccard_similarity,
            )
        )

    return "processed"


async def run_section_backfill(
    db_path: str, forms: list[str], limit: int, refresh: bool = False
) -> dict[str, int]:
    fact_repo = SQLiteRawFactRepository(db_path)
    try:
        ciks = sorted(known_issuer_ciks(fact_repo))
    finally:
        fact_repo.close()
    logger.info(
        "section backfill: %d known issuer CIKs, forms=%s, limit=%d, refresh=%s",
        len(ciks), forms, limit, refresh,
    )

    filing_repo = SQLiteFilingIndexRepository(db_path)
    section_repo = SQLiteFilingSectionRepository(db_path)
    metric_repo = SQLiteSectionMetricRepository(db_path)
    similarity_repo = SQLiteSectionSimilarityRepository(db_path)
    tally = {"processed": 0, "skipped": 0, "failed": 0}
    try:
        async with SECClient() as client:
            i = 0
            for cik in ciks:
                # OLDEST first within a company's batch: get_filings returns newest-first, and
                # Stage 4 needs a filing's prior already ingested to diff against it. Processing
                # newest-to-oldest in one run meant every filing's "prior" was still unwritten --
                # found via a real end-to-end test against Apple's last two 10-Ks (2026-08-23),
                # where similarity came back None for both despite both being ingested this run.
                filings = list(reversed(filing_repo.get_filings(cik, forms, limit)))
                for filing in filings:
                    i += 1
                    outcome = await ingest_filing_sections(
                        client, cik, filing, filing_repo, section_repo, metric_repo,
                        similarity_repo, refresh=refresh,
                    )
                    tally[outcome] += 1
                    if i % _PROGRESS_EVERY == 0:
                        logger.info(
                            "section backfill progress: %d filings seen (%d processed, %d "
                            "skipped, %d failed)",
                            i, tally["processed"], tally["skipped"], tally["failed"],
                        )
        logger.info(
            "section backfill done: %d processed, %d skipped (already parsed), %d failed",
            tally["processed"], tally["skipped"], tally["failed"],
        )
        return tally
    finally:
        filing_repo.close()
        section_repo.close()
        metric_repo.close()
        similarity_repo.close()


def build_arg_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(
        description=(
            "Fetch, segment, score and YoY-diff 10-K/10-Q filing sections (Track 2 Wave A)."
        )
    )
    p.add_argument(
        "--forms", default=",".join(_DEFAULT_FORMS),
        help="Comma-separated form list, e.g. 10-K,10-Q (default: both).",
    )
    p.add_argument(
        "--limit", type=int, default=1,
        help="Most recent filings per form per company to process (default: 1).",
    )
    p.add_argument(
        "--refresh", action="store_true",
        help="Re-fetch and re-parse filings already processed under the current schema version.",
    )
    p.add_argument("--db-path", default=settings.secfin_db_path)
    return p


def main(argv: list[str] | None = None) -> None:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    args = build_arg_parser().parse_args(argv)
    forms = [f.strip() for f in args.forms.split(",") if f.strip()]
    asyncio.run(run_section_backfill(args.db_path, forms, args.limit, refresh=args.refresh))


if __name__ == "__main__":
    main()

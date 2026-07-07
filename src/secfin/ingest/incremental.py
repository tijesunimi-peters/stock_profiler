"""Daily incremental ingest: find companies that filed recently via the SEC daily
index, fetch each via the existing throttled SECClient, and feed the same
parse -> store path the bulk backfill uses (flatten_company_facts -> RawFactRepository).

Volume is small (hundreds/day), so this runs as a single process -- no pool. ALL SEC
access goes through the existing rate-limited SECClient; do not add processes here "to
go faster" -- the fair-access limit is per-IP, not per-process (see sec/client.py).

Run: `python -m secfin.ingest.incremental [--date YYYY-MM-DD] [--forms 10-K 10-Q ...]`
"""

from __future__ import annotations

import argparse
import asyncio
import datetime as dt
import logging
import re

from secfin.config import settings
from secfin.sec.client import SECClient
from secfin.sec.companyfacts import fetch_raw_facts_all
from secfin.storage.sqlite_repository import SQLiteRawFactRepository

logger = logging.getLogger(__name__)

SOURCE = "daily_incremental"
DEFAULT_FORMS = frozenset({"10-K", "10-K/A", "10-Q", "10-Q/A"})

# form.YYYYMMDD.idx is fixed-width-ish, but column widths shift across years, so we
# split on runs of 2+ spaces (verified 2026-07-03 against a live 2026 QTR3 sample --
# https://www.sec.gov/Archives/edgar/daily-index/2026/QTR3/form.20260702.idx -- which
# has exactly 5 space-delimited fields per data row: form, company, CIK, date, filename).
_FIELD_SPLIT_RE = re.compile(r"\s{2,}")


def daily_index_url(date: dt.date) -> str:
    """URL of the SEC daily form index for one calendar date.

    Verified 2026-07-03 against https://www.sec.gov/Archives/edgar/daily-index/ ; the
    index is recompiled once per filing day (not real-time), so `date` should usually
    be "yesterday" relative to when this job runs.
    """
    quarter = (date.month - 1) // 3 + 1
    return (
        f"https://www.sec.gov/Archives/edgar/daily-index/"
        f"{date.year}/QTR{quarter}/form.{date:%Y%m%d}.idx"
    )


def parse_form_index(text: str, forms: frozenset[str] = DEFAULT_FORMS) -> list[int]:
    """Extract distinct CIKs that filed one of `forms`, in first-seen order. Pure, for testing."""
    ciks: list[int] = []
    seen: set[int] = set()
    for line in text.splitlines():
        parts = _FIELD_SPLIT_RE.split(line.strip())
        if len(parts) != 5:
            continue
        form_type, _company, cik_str, _date_filed, _filename = parts
        if form_type not in forms or not cik_str.isdigit():
            continue
        cik = int(cik_str)
        if cik not in seen:
            seen.add(cik)
            ciks.append(cik)
    return ciks


async def fetch_recent_ciks(
    client: SECClient, date: dt.date, forms: frozenset[str] = DEFAULT_FORMS
) -> list[int]:
    raw = await client.get_bytes(daily_index_url(date))
    return parse_form_index(raw.decode("utf-8", errors="replace"), forms)


async def run_incremental(
    date: dt.date, db_path: str, forms: frozenset[str] = DEFAULT_FORMS
) -> None:
    repo = SQLiteRawFactRepository(db_path)
    try:
        async with SECClient() as client:
            ciks = await fetch_recent_ciks(client, date, forms)
            logger.info("incremental %s: %d companies filed %s", date, len(ciks), sorted(forms))
            for i, cik in enumerate(ciks, start=1):
                try:
                    facts = await fetch_raw_facts_all(client, cik)
                except Exception:
                    logger.exception("failed to fetch companyfacts for CIK %d", cik)
                    continue
                repo.upsert_raw_facts_and_checkpoint(
                    facts, [(cik, None, len(facts))], source=SOURCE
                )
                if i % 25 == 0:
                    logger.info("incremental progress: %d/%d companies", i, len(ciks))
        logger.info("incremental %s done: %d companies", date, len(ciks))
    finally:
        repo.close()


def build_arg_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(
        description="Ingest companies that filed recently, per the SEC daily index."
    )
    p.add_argument(
        "--date",
        type=dt.date.fromisoformat,
        default=dt.date.today() - dt.timedelta(days=1),
        help="Calendar date the daily index covers (default: yesterday).",
    )
    p.add_argument("--db-path", default=settings.secfin_db_path)
    p.add_argument("--forms", nargs="*", default=sorted(DEFAULT_FORMS))
    return p


def main(argv: list[str] | None = None) -> None:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    args = build_arg_parser().parse_args(argv)
    asyncio.run(run_incremental(args.date, args.db_path, frozenset(args.forms)))


if __name__ == "__main__":
    main()

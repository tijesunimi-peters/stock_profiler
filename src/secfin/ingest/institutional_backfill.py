"""Bulk-ingest a quarter's 13F filings from every manager, not just ones fetched on demand.

    submissions.zip (local, already downloaded)  ->  candidate managers for one quarter
                                                              |
                        1 async process, sequential  <--------'
                        (throttled SECClient; skip managers already current)
                                                              |
                        HoldingsSnapshotRepository.upsert_snapshot

This is the "missing heart" of Milestone 2.5 (docs/ROADMAP.md): the existing per-manager
cache (`storage/holdings_repository.py`) only grows via live requests to
`GET /managers/{cik}/holdings`, one manager at a time. Cross-manager aggregation ("who
holds this issuer, across all managers, this quarter?") needs *every* manager's 13F for a
quarter, which is what this job produces.

- **Candidate discovery is local, no network:** `find_13f_candidates` scans
  `submissions.zip` (downloaded by `ingest/backfill.py` for exactly this future use, per
  its module docstring; here fetched standalone via `download_submissions_file` so this
  job doesn't force an unrelated companyfacts.zip download). It reuses
  `sec/institutional.py`'s existing pure `recent_13f_filings` to filter each manager's
  filing history down to 13F-HR/13F-HR/A, then keeps whichever filing matches the target
  quarter -- newest-filed first (submissions.json's own array order), so an
  original+amendment pair for the same quarter already resolves to the amendment.
- **Skip-or-refresh, not a checkpoint table:** for each candidate, compare the winning
  filing's accession against `HoldingsSnapshotRepository.cached_accession` (a cheap
  indexed lookup, no full snapshot deserialization). A match means the cache is already
  current -- skip (this is what makes a crashed/resumed run cheap, AND what resolves
  "amendment freshness across the aggregate": a later-filed amendment has a different
  accession, so it's never mistaken for already-current). A mismatch (including "nothing
  cached yet") means fetch + upsert.
- **Single async process, sequential, no producer/consumer pool:** unlike
  `ingest/backfill.py` (parallel because parsing huge local companyfacts JSON is
  CPU-bound), this job's cost is network I/O against the same rate-limited `SECClient`
  every other module uses. Per manager: 1 directory listing + 2 document fetches (info
  table, cover page) via `sec.institutional.fetch_13f_snapshot_for_filing` -- which skips
  the redundant live `submissions.json` lookup `fetch_13f_snapshot` would otherwise repeat
  per manager, since this job already knows the winning filing from the local zip scan.
  Same reasoning as `ingest/incremental.py`: "do not add processes here to go faster --
  the fair-access limit is per-IP, not per-process."
- **Also resolves CUSIPs as it goes.** `normalize/cusip.resolve_snapshot_cusips` used to
  run only on the live per-manager read path (`GET /managers/{cik}/holdings`); a snapshot
  that only ever arrived via this bulk job left its CUSIPs unresolved in `cusip_map`. The
  issuer-centric endpoints (`GET /companies/{symbol}/institutional-holders` /
  `.../institutional-activity`) start from an issuer's CIK and need the *reverse* lookup
  (`CusipMapRepository.cusips_for_cik`), so this job now calls `resolve_snapshot_cusips`
  on every fetched snapshot before upserting it -- the durable effect is
  `cusip_map` gaining rows via the resolver's own `record_resolved`/`record_unresolved`;
  the per-row `cik` the resolver sets on the snapshot itself is still never persisted to
  `holdings` (unchanged, see `storage/holdings_repository.py`).

Run: `python -m secfin.ingest.institutional_backfill --period 2026-03-31`
"""

from __future__ import annotations

import argparse
import asyncio
import json
import logging
import re
import zipfile
from pathlib import Path

from secfin.config import settings
from secfin.ingest.downloader import download_submissions_file
from secfin.normalize.cusip import CusipResolver, resolve_snapshot_cusips
from secfin.sec.client import SECClient
from secfin.sec.institutional import fetch_13f_snapshot_for_filing, recent_13f_filings
from secfin.storage.holdings_repository import HoldingsSnapshotRepository
from secfin.storage.sqlite_cusip_repository import SQLiteCusipMapRepository
from secfin.storage.sqlite_holdings_repository import SQLiteHoldingsSnapshotRepository

logger = logging.getLogger(__name__)

_ENTRY_RE = re.compile(r"^CIK(\d{10})\.json$")

_PROGRESS_EVERY = 100


def find_13f_candidates(zip_path: Path, report_period: str) -> list[dict]:
    """Scan submissions.zip for managers with a 13F-HR/13F-HR/A at `report_period`.

    Local zip I/O only, no network. Returns one dict per candidate manager:
    `{"manager_cik": int, "manager_name": str | None, "filing": dict}`, where `filing`
    has the same shape `recent_13f_filings` returns -- ready to pass straight to
    `sec.institutional.fetch_13f_snapshot_for_filing`. A malformed entry is logged and
    skipped, not fatal to the scan.
    """
    candidates: list[dict] = []
    with zipfile.ZipFile(zip_path) as zf:
        for name in zf.namelist():
            m = _ENTRY_RE.match(name)
            if not m:
                continue
            cik = int(m.group(1))
            try:
                payload = json.loads(zf.read(name))
            except Exception:
                logger.exception("failed to parse %s (CIK %d)", name, cik)
                continue
            filings = [f for f in recent_13f_filings(payload) if f["reportDate"] == report_period]
            if not filings:
                continue
            candidates.append(
                {
                    "manager_cik": cik,
                    "manager_name": payload.get("name"),
                    "filing": filings[0],
                }
            )
    return candidates


async def _process_candidate(
    client: SECClient,
    repo: HoldingsSnapshotRepository,
    cusip_resolver: CusipResolver,
    report_period: str,
    candidate: dict,
) -> str:
    """Fetch + resolve + upsert one candidate unless it's already current. Returns
    "fetched", "skipped", or "failed" for the caller's tally."""
    cik = candidate["manager_cik"]
    filing = candidate["filing"]
    if repo.cached_accession(cik, report_period) == filing["accessionNumber"]:
        return "skipped"
    try:
        snapshot = await fetch_13f_snapshot_for_filing(
            client, cik, candidate["manager_name"], report_period, filing
        )
    except Exception:
        logger.exception("failed to fetch 13F for CIK %d at %s", cik, report_period)
        return "failed"
    await resolve_snapshot_cusips(client, cusip_resolver, snapshot)
    repo.upsert_snapshot(snapshot)
    return "fetched"


async def run_institutional_backfill(
    report_period: str, data_dir: Path, db_path: str
) -> None:
    submissions_zip = download_submissions_file(data_dir)
    candidates = find_13f_candidates(submissions_zip, report_period)
    logger.info(
        "institutional backfill %s: %d candidate managers", report_period, len(candidates)
    )
    if not candidates:
        return

    repo = SQLiteHoldingsSnapshotRepository(db_path)
    cusip_repo = SQLiteCusipMapRepository(db_path)
    cusip_resolver = CusipResolver(
        cusip_repo, ttl_seconds=settings.secfin_ticker_cache_ttl_seconds
    )
    tally = {"fetched": 0, "skipped": 0, "failed": 0}
    try:
        async with SECClient() as client:
            for i, candidate in enumerate(candidates, start=1):
                outcome = await _process_candidate(
                    client, repo, cusip_resolver, report_period, candidate
                )
                tally[outcome] += 1
                if i % _PROGRESS_EVERY == 0:
                    logger.info(
                        "institutional backfill progress: %d/%d (%d fetched, %d skipped, "
                        "%d failed)",
                        i,
                        len(candidates),
                        tally["fetched"],
                        tally["skipped"],
                        tally["failed"],
                    )
        logger.info(
            "institutional backfill %s done: %d fetched, %d skipped (already current), "
            "%d failed",
            report_period,
            tally["fetched"],
            tally["skipped"],
            tally["failed"],
        )
    finally:
        repo.close()
        cusip_repo.close()


def build_arg_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(
        description=(
            "Bulk-ingest a quarter's 13F filings across all managers, via submissions.zip "
            "for candidate discovery and live SEC document fetches for the rest."
        )
    )
    p.add_argument(
        "--period", required=True, help="Quarter-end report period, e.g. 2026-03-31"
    )
    p.add_argument("--data-dir", default=settings.secfin_bulk_data_dir)
    p.add_argument("--db-path", default=settings.secfin_db_path)
    return p


def main(argv: list[str] | None = None) -> None:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    args = build_arg_parser().parse_args(argv)
    asyncio.run(run_institutional_backfill(args.period, Path(args.data_dir), args.db_path))


if __name__ == "__main__":
    main()

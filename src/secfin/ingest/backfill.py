"""Bulk backfill: SEC companyfacts.zip -> SQLite, as a bounded producer-consumer pipeline.

    main process (feeder)  ->  [bounded work queue]   ->  N parser processes
                                                                |
                            <-  [bounded result queue] <--------'
    1 DB writer (main process)

- The main process downloads the bulk zips (sequential, see ingest/downloader.py),
  enumerates the companyfacts.zip entries not yet checkpointed, and feeds
  (cik, entry_name) pairs into a bounded work queue -- this is the backpressure point
  on the producer side.
- N parser processes (default: cpu_count() - 1) each open the zip once, pull entries
  off the work queue, and flatten each company's JSON to RawFacts using the exact same
  pure function the live API path uses (secfin.sec.companyfacts.flatten_company_facts).
  Parsers NEVER touch the database.
- The main process is also the single DB writer: it drains the bounded result queue,
  batches ~batch_size facts across companies, and commits each batch's facts AND
  checkpoint rows in one transaction, so a crash can't leave one without the other.

Run: `python -m secfin.ingest.backfill [--workers N] [--batch-size N] [--data-dir DIR]`
"""

from __future__ import annotations

import argparse
import json
import logging
import multiprocessing as mp
import re
import time
import zipfile
from pathlib import Path

from secfin.config import settings
from secfin.ingest.downloader import download_bulk_files
from secfin.normalize.schema import RawFact
from secfin.sec.companyfacts import flatten_all_taxonomies
from secfin.storage.repository import RawFactRepository
from secfin.storage.sqlite_repository import SQLiteRawFactRepository

logger = logging.getLogger(__name__)

SOURCE = "bulk_companyfacts"
_ENTRY_RE = re.compile(r"^CIK(\d{10})\.json$")
_STOP = None  # sentinel: tells a queue consumer there's no more work


def parse_companyfacts_entries(names: list[str]) -> list[tuple[int, str]]:
    """Extract (cik, entry_name) pairs for companyfacts.zip entries. Pure, for testing."""
    out = []
    for name in names:
        m = _ENTRY_RE.match(name)
        if m:
            out.append((int(m.group(1)), name))
    return out


def pending_entries(entries: list[tuple[int, str]], done: set[int]) -> list[tuple[int, str]]:
    """Entries not already checkpointed as ingested. Pure, for testing."""
    return [(cik, name) for cik, name in entries if cik not in done]


def _parser_worker(zip_path: Path, work_queue: mp.Queue, result_queue: mp.Queue) -> None:
    with zipfile.ZipFile(zip_path) as zf:
        while (item := work_queue.get()) is not _STOP:
            cik, entry_name = item
            try:
                payload = json.loads(zf.read(entry_name))
                facts = flatten_all_taxonomies(payload, cik)
            except Exception:
                logger.exception("failed to parse %s (CIK %d)", entry_name, cik)
                continue
            result_queue.put((cik, entry_name, facts))
    result_queue.put(_STOP)


def _flush(
    repo: RawFactRepository,
    pending_facts: list[RawFact],
    pending_checkpoints: list[tuple[int, str | None, int]],
) -> tuple[int, int]:
    """Write one batch (facts + checkpoints) in a single transaction. Pure enough to test."""
    if not pending_facts and not pending_checkpoints:
        return 0, 0
    repo.upsert_raw_facts_and_checkpoint(pending_facts, pending_checkpoints, source=SOURCE)
    return len(pending_checkpoints), len(pending_facts)


def _flush_batch_safely(
    repo: RawFactRepository,
    pending_facts: list[RawFact],
    pending_checkpoints: list[tuple[int, str | None, int]],
) -> tuple[int, int]:
    """`_flush`, but a bad batch (e.g. a data-quality outlier the repository can't
    store) is logged and dropped rather than killing the writer process. `_flush`
    rolls back its own transaction on error, so a dropped batch's CIKs are simply
    left un-checkpointed -- the next backfill run retries them, nothing is corrupted.
    """
    try:
        return _flush(repo, pending_facts, pending_checkpoints)
    except Exception:
        ciks = [cik for cik, _entry, _count in pending_checkpoints]
        logger.exception(
            "dropping a batch of %d companies after a write failure: %s", len(ciks), ciks
        )
        return 0, 0


def _writer_loop(db_path: str, result_queue: mp.Queue, num_workers: int, batch_size: int) -> None:
    repo = SQLiteRawFactRepository(db_path)
    pending_facts: list[RawFact] = []
    pending_checkpoints: list[tuple[int, str | None, int]] = []
    total_companies = total_facts = 0
    done_workers = 0
    start = time.monotonic()
    try:
        while done_workers < num_workers:
            item = result_queue.get()
            if item is _STOP:
                done_workers += 1
                continue
            cik, entry_name, facts = item
            pending_facts.extend(facts)
            pending_checkpoints.append((cik, entry_name, len(facts)))
            if len(pending_facts) >= batch_size:
                companies, count = _flush_batch_safely(repo, pending_facts, pending_checkpoints)
                total_companies += companies
                total_facts += count
                elapsed = time.monotonic() - start
                logger.info(
                    "writer: %d companies, %d facts (%.0f facts/sec)",
                    total_companies,
                    total_facts,
                    total_facts / elapsed if elapsed else 0,
                )
                pending_facts = []
                pending_checkpoints = []
        companies, count = _flush_batch_safely(repo, pending_facts, pending_checkpoints)
        total_companies += companies
        total_facts += count
        logger.info("writer done: %d companies, %d facts", total_companies, total_facts)
    finally:
        repo.close()


def run_backfill(
    data_dir: Path, db_path: str, workers: int, batch_size: int, queue_maxsize: int
) -> None:
    files = download_bulk_files(data_dir)
    companyfacts_zip = files["companyfacts"]
    # submissions.zip is downloaded now (per-CIK filing history) so future insider/13F
    # ingestion (sec/insider.py, sec/institutional.py -- both stubs, not implemented here)
    # can plug into this same pipeline without adding a new download step.

    repo = SQLiteRawFactRepository(db_path)
    already_done = repo.get_ingested_ciks(source=SOURCE)
    repo.close()

    with zipfile.ZipFile(companyfacts_zip) as zf:
        entries = parse_companyfacts_entries(zf.namelist())
    todo = pending_entries(entries, already_done)
    logger.info(
        "backfill: %d/%d companies pending (%d already checkpointed)",
        len(todo),
        len(entries),
        len(already_done),
    )
    if not todo:
        return

    work_queue: mp.Queue = mp.Queue(maxsize=queue_maxsize)
    result_queue: mp.Queue = mp.Queue(maxsize=queue_maxsize)

    parsers = [
        mp.Process(target=_parser_worker, args=(companyfacts_zip, work_queue, result_queue))
        for _ in range(workers)
    ]
    writer = mp.Process(target=_writer_loop, args=(db_path, result_queue, workers, batch_size))
    for p in parsers:
        p.start()
    writer.start()

    for entry in todo:
        work_queue.put(entry)  # blocks (backpressure) once the queue is full
    for _ in parsers:
        work_queue.put(_STOP)

    for p in parsers:
        p.join()
    writer.join()


def build_arg_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(
        description="Backfill the SQLite store from SEC bulk companyfacts.zip."
    )
    p.add_argument("--data-dir", default=settings.secfin_bulk_data_dir)
    p.add_argument("--db-path", default=settings.secfin_db_path)
    p.add_argument(
        "--workers",
        type=int,
        default=settings.secfin_backfill_workers or max(1, (mp.cpu_count() or 2) - 1),
    )
    p.add_argument("--batch-size", type=int, default=settings.secfin_backfill_batch_size)
    p.add_argument("--queue-maxsize", type=int, default=settings.secfin_backfill_queue_maxsize)
    return p


def main(argv: list[str] | None = None) -> None:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    args = build_arg_parser().parse_args(argv)
    run_backfill(
        Path(args.data_dir), args.db_path, args.workers, args.batch_size, args.queue_maxsize
    )


if __name__ == "__main__":
    main()

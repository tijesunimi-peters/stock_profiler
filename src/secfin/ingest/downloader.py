"""Resumable, streamed downloads of the SEC bulk XBRL data files.

A full backfill needs only these ~2-3 HTTP requests total (HEAD + GET per file), so
this deliberately does NOT go through SECClient's per-request rate limiter -- at this
volume the SEC fair-access limit is irrelevant, and the two files MUST be fetched
sequentially, never in parallel, never re-run speculatively "to go faster". The
required User-Agent is still sent on every request; that's non-negotiable regardless
of volume.

Verify, don't assume: URLs and the "recompiled nightly" cadence were confirmed
2026-07-03 against https://www.sec.gov/edgar/sec-api-documentation ("Bulk Data"
section), by fetching each URL's headers and by reading each zip's central directory
(entries are one JSON file per CIK: "CIK##########.json", matching the shape of the
live companyfacts/submissions APIs). Re-check before relying on these long-term --
the SEC has moved bulk-file paths before.
"""

from __future__ import annotations

import hashlib
import json
import logging
from pathlib import Path

import httpx

from secfin.config import settings

logger = logging.getLogger(__name__)

BULK_COMPANYFACTS_URL = "https://www.sec.gov/Archives/edgar/daily-index/xbrl/companyfacts.zip"
BULK_SUBMISSIONS_URL = "https://www.sec.gov/Archives/edgar/daily-index/bulkdata/submissions.zip"

_CHUNK_SIZE = 1024 * 1024  # 1 MiB


def _meta_path(dest: Path) -> Path:
    return dest.with_suffix(dest.suffix + ".meta.json")


def _sha256_of_existing(path: Path) -> hashlib._Hash:
    """Stream-hash a file already on disk (e.g. a partial download being resumed)
    instead of reading it into memory in one go -- these files run to ~1.5 GB.
    """
    h = hashlib.sha256()
    with path.open("rb") as f:
        while chunk := f.read(_CHUNK_SIZE):
            h.update(chunk)
    return h


def download_resumable(url: str, dest: Path, user_agent: str | None = None) -> Path:
    """Download `url` to `dest`, resuming a partial download and skipping entirely if
    `dest` is already complete.

    Completeness/resume state is tracked via a sidecar `<dest>.meta.json` (expected
    size + sha256), since the SEC bulk endpoints don't publish a checksum of their own
    to compare against.
    """
    ua = user_agent or settings.sec_user_agent
    dest.parent.mkdir(parents=True, exist_ok=True)
    meta_file = _meta_path(dest)

    with httpx.Client(headers={"User-Agent": ua}, timeout=60.0, follow_redirects=True) as client:
        head = client.head(url)
        head.raise_for_status()
        expected_size = int(head.headers.get("content-length", 0))

        meta = json.loads(meta_file.read_text()) if meta_file.exists() else {}
        if (
            dest.exists()
            and meta.get("size") == expected_size
            and dest.stat().st_size == expected_size
        ):
            logger.info("skip download, already complete: %s", dest)
            return dest

        existing_size = dest.stat().st_size if dest.exists() else 0
        # A stale partial for a *different* remote size/build can't be resumed byte-for-byte.
        if existing_size and meta.get("size") not in (None, expected_size):
            existing_size = 0

        headers: dict[str, str] = {}
        mode = "wb"
        hasher = hashlib.sha256()
        if existing_size and existing_size < expected_size:
            headers["Range"] = f"bytes={existing_size}-"
            mode = "ab"
            hasher = _sha256_of_existing(dest)

        logger.info("downloading %s -> %s (%.1f MB)", url, dest, expected_size / 1e6)
        with client.stream("GET", url, headers=headers) as resp:
            resp.raise_for_status()
            if headers.get("Range") and resp.status_code != 206:
                # Server ignored our Range request (e.g. no range support) -- restart
                # clean rather than risk appending a full body onto a partial file.
                mode = "wb"
                hasher = hashlib.sha256()
            with dest.open(mode) as f:
                for chunk in resp.iter_bytes(_CHUNK_SIZE):
                    f.write(chunk)
                    hasher.update(chunk)

        final_size = dest.stat().st_size
        if final_size != expected_size:
            raise RuntimeError(
                f"download incomplete: {dest} is {final_size} bytes, expected {expected_size}"
            )
        meta_file.write_text(json.dumps({"size": expected_size, "sha256": hasher.hexdigest()}))
        logger.info(
            "downloaded %s (%d bytes, sha256=%s)", dest, final_size, hasher.hexdigest()[:12]
        )
    return dest


def download_bulk_files(data_dir: Path | str) -> dict[str, Path]:
    """Fetch companyfacts.zip and submissions.zip into `data_dir`, sequentially.

    Do NOT parallelize this -- see module docstring.
    """
    data_dir = Path(data_dir)
    companyfacts_dest = data_dir / "companyfacts.zip"
    submissions_dest = data_dir / "submissions.zip"
    download_resumable(BULK_COMPANYFACTS_URL, companyfacts_dest)
    download_resumable(BULK_SUBMISSIONS_URL, submissions_dest)
    return {"companyfacts": companyfacts_dest, "submissions": submissions_dest}

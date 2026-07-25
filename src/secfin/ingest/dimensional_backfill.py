"""Bounded DIMENSIONAL geographic-revenue ingest (Sector Analytics v2, P6b).

Companyfacts carries no dimensional facts, so ASC 280 geographic revenue must come from a NEW
source: the SEC "Financial Statement Data Sets" (DERA) quarterly ZIPs, whose `num.txt` carries a
`segments` (`Axis=Member;`) column. This module is the productized, BOUNDED version of the Phase-3
spike (`scripts/spike_dimensional_extract.py`, `docs/SPIKE_DIMENSIONAL.md`): it streams a few recent
quarters' ZIPs, keeps only annual (10-K) GEOGRAPHIC revenue rows plus the consolidated total, and
writes them to `dimensional_geo_facts` for the offline rollup batch to aggregate by sector.

Deliberately narrow (operator decision 2026-07-24 -- "bounded, latest annual"): only the ASC 280
geography axis on a revenue tag, only the annual (qtrs=4) current-year column, only 10-K/10-K/A.
NOT the general dimensional store, NOT business-segment / product axes, NOT a whole-market/full-
history backfill (that stays a later ops decision). The coverage caveat carries the gaps honestly.

Honesty / method (mirrors the spike's proven filters):
  * **Revenue tag variance persists in dimensions** -- reuse the canonical `revenue` candidate list
    (normalize/mapping.py). One revenue tag is chosen per filing (the highest-preference candidate
    with a consolidated total), so variant tags are never mixed within a filing (spike blocker #3).
  * **Reconciling items filtered** -- keep only geography rows qualified `OperatingSegments` (or
    unqualified); drop eliminations/corporate, which would double-count (spike blocker #2).
  * **Single-axis geography only** -- a row carrying Geographical AND another axis (a cross-tab) is
    skipped; only the clean per-geography split is kept.
  * The geography member is stored RAW (identifier as filed) -- the domestic/international bucketing
    happens later, in normalize/segment_geography.py, so the raw provenance is preserved.

Values are stored in raw reported units; CIK is an int. SEC compliance: the download reuses
`ingest/downloader.download_dera_quarter` (User-Agent guard inside). Single writer (guardrail 8):
this process parses then writes; parsers never open the DB elsewhere.

Run:
    python -m secfin.ingest.dimensional_backfill --quarter 2025q4 --quarter 2026q1
    python -m secfin.ingest.dimensional_backfill --zip /path/to/2025q4.zip   # skip the download
"""

from __future__ import annotations

import argparse
import csv
import io
import logging
import zipfile
from pathlib import Path

from secfin.config import settings
from secfin.ingest.downloader import download_dera_quarter
from secfin.normalize.mapping import CONCEPTS
from secfin.storage.dimensional_geo_repository import DimensionalGeoRow
from secfin.storage.sqlite_dimensional_geo_repository import SQLiteDimensionalGeoRepository

logger = logging.getLogger(__name__)

# Reuse the canonical revenue candidate tags, in PREFERENCE ORDER (the moat; never hardcode a copy).
REVENUE_TAGS: list[str] = CONCEPTS["revenue"][1]
_REVENUE_TAG_SET = frozenset(REVENUE_TAGS)

_ANNUAL_FORMS = frozenset({"10-K", "10-K/A"})
_GEO_AXIS = "Geographical"


def _tsv_rows(f) -> csv.DictReader:
    """A tab-separated DictReader over a DERA table stream (bytes -> text, tolerant decode)."""
    return csv.DictReader(io.TextIOWrapper(f, encoding="utf-8", errors="replace"), delimiter="\t")


def parse_axes(segments: str) -> dict[str, str]:
    """`Axis=Member;Axis2=Member2;` -> {Axis: Member}. (Same parse as the spike.)"""
    out: dict[str, str] = {}
    for pair in segments.rstrip(";").split(";"):
        if "=" in pair:
            k, v = pair.split("=", 1)
            out[k] = v
    return out


def _row_kind(segments: str) -> tuple[str, str | None]:
    """Classify a num.txt row by its `segments`: ('consolidated', None), ('geo', member), or
    ('skip', None).

    Consolidated == no dimensions. Geo == exactly the Geographical axis (a tolerated
    ConsolidationItems qualifier must be OperatingSegments or absent -- drops eliminations).
    Anything else (other axes, cross-tabs, non-operating reconciling items) is skipped.
    """
    if not segments:
        return ("consolidated", None)
    axes = parse_axes(segments)
    if _GEO_AXIS not in axes:
        return ("skip", None)
    if set(axes) - {_GEO_AXIS, "ConsolidationItems"}:
        return ("skip", None)  # cross-tab with another axis -- not a clean per-geography split
    if axes.get("ConsolidationItems") not in (None, "OperatingSegments"):
        return ("skip", None)  # eliminations / corporate reconciling row
    return ("geo", axes[_GEO_AXIS])


def _read_annual_submissions(z: zipfile.ZipFile) -> dict[str, tuple[int, str, int]]:
    """adsh -> (cik, period_ddate, fiscal_year) for 10-K / 10-K/A filings in this ZIP."""
    meta: dict[str, tuple[int, str, int]] = {}
    with z.open("sub.txt") as f:
        for row in _tsv_rows(f):
            if row.get("form") not in _ANNUAL_FORMS:
                continue
            period = (row.get("period") or "").strip()
            if len(period) != 8 or not period.isdigit():
                continue
            try:
                cik = int(row["cik"])
            except (KeyError, ValueError):
                continue
            fy_raw = (row.get("fy") or "").strip()
            fiscal_year = int(fy_raw) if fy_raw.isdigit() else int(period[:4])
            meta[row["adsh"]] = (cik, period, fiscal_year)
    return meta


def _buffered_num_rows(
    z: zipfile.ZipFile, sub_meta: dict[str, tuple[int, str, int]]
) -> dict[str, list[tuple]]:
    """Stream num.txt once; buffer only the candidate rows (annual current-year revenue rows for a
    known 10-K adsh). Returns adsh -> [(tag, kind, member, value, uom, ddate, qtrs)].
    """
    buf: dict[str, list[tuple]] = {}
    with z.open("num.txt") as f:
        for row in _tsv_rows(f):
            adsh = row.get("adsh")
            m = sub_meta.get(adsh)
            if m is None:
                continue
            _cik, period, _fy = m
            if row.get("tag") not in _REVENUE_TAG_SET or row.get("qtrs") != "4":
                continue
            if row.get("ddate") != period:  # current-year annual column only (drop comparatives)
                continue
            kind, member = _row_kind(row.get("segments") or "")
            if kind == "skip":
                continue
            try:
                value = float(row["value"])
            except (KeyError, ValueError):
                continue  # blank / non-numeric value -- skip, never coerce to 0
            buf.setdefault(adsh, []).append(
                (row["tag"], kind, member, value, row.get("uom") or "USD",
                 row["ddate"], row["qtrs"])
            )
    return buf


def _resolve_filing_rows(
    adsh: str, sub_meta: dict[str, tuple[int, str, int]], candidates: list[tuple]
) -> list[DimensionalGeoRow]:
    """Pick ONE revenue tag for the filing (highest-preference candidate with a consolidated total,
    else the highest-preference candidate present) and emit its consolidated + geo rows.
    """
    cik, _period, fiscal_year = sub_meta[adsh]
    # Which candidate tags appear, and which have a consolidated total?
    have_consolidated = {c[0] for c in candidates if c[1] == "consolidated"}
    have_any = {c[0] for c in candidates}
    chosen: str | None = None
    for tag in REVENUE_TAGS:  # preference order
        if tag in have_consolidated:
            chosen = tag
            break
    if chosen is None:
        for tag in REVENUE_TAGS:
            if tag in have_any:
                chosen = tag
                break
    if chosen is None:
        return []
    # form: default 10-K (sub_meta doesn't carry it separately here; both map to the annual basis).
    out: list[DimensionalGeoRow] = []
    for tag, kind, member, value, uom, ddate, qtrs in candidates:
        if tag != chosen:
            continue
        out.append(
            DimensionalGeoRow(
                cik=cik,
                accession=adsh,
                tag=tag,
                ddate=ddate,
                qtrs=qtrs,
                member="" if kind == "consolidated" else (member or ""),
                value=value,
                unit=uom,
                is_consolidated=(kind == "consolidated"),
                fiscal_year=fiscal_year,
                form="10-K",
            )
        )
    return out


def extract_geo_rows_from_zip(zip_path: str | Path) -> list[DimensionalGeoRow]:
    """Parse one DERA quarterly ZIP into geographic-revenue rows (+ the consolidated total). No
    DB access -- pure parse, so it's unit-testable against a fixture ZIP."""
    rows: list[DimensionalGeoRow] = []
    with zipfile.ZipFile(zip_path) as z:
        sub_meta = _read_annual_submissions(z)
        if not sub_meta:
            return rows
        buffered = _buffered_num_rows(z, sub_meta)
    for adsh, candidates in buffered.items():
        rows.extend(_resolve_filing_rows(adsh, sub_meta, candidates))
    return rows


def run_dimensional_backfill(
    db_path: str, zip_paths: list[Path]
) -> int:
    """Parse each ZIP and write the geo rows through the single-writer repository. Returns the total
    row count written."""
    repo = SQLiteDimensionalGeoRepository(db_path)
    total = 0
    try:
        for zp in zip_paths:
            rows = extract_geo_rows_from_zip(zp)
            repo.bulk_upsert(rows)  # single writer owns the connection
            total += len(rows)
            logger.info("ingested %d geo rows from %s", len(rows), zp.name)
    finally:
        repo.close()
    logger.info("dimensional geo backfill done: %d rows across %d ZIP(s)", total, len(zip_paths))
    return total


def build_arg_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(
        description="Bounded ingest of ASC 280 geographic revenue from DERA quarterly ZIPs."
    )
    p.add_argument(
        "--quarter",
        action="append",
        default=[],
        help="DERA quarter to download+ingest, e.g. 2025q4 (repeatable).",
    )
    p.add_argument(
        "--zip",
        action="append",
        default=[],
        dest="zips",
        help="Path to an already-downloaded DERA ZIP to ingest (repeatable; skips the download).",
    )
    p.add_argument("--data-dir", default=None, help="Where to store downloaded ZIPs")
    return p


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    args = build_arg_parser().parse_args()
    data_dir = Path(args.data_dir or settings.secfin_bulk_data_dir)
    zip_paths: list[Path] = [Path(z) for z in args.zips]
    for quarter in args.quarter:
        zip_paths.append(download_dera_quarter(data_dir, quarter))
    if not zip_paths:
        raise SystemExit("nothing to do: pass at least one --quarter or --zip")
    run_dimensional_backfill(settings.secfin_db_path, zip_paths)


if __name__ == "__main__":
    main()

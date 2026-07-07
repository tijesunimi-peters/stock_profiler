"""Fetch + parse the SEC "frames" API: one GAAP tag across ALL filers for one period.

Pure fetch + parse only -- no DB access (sec/ stays free of business logic; see
sec/client.py's module docstring). Frames use the SEC's own CALENDAR-quarter alignment
("CY2023Q4"), which is not guaranteed to match an individual company's own fiscal
calendar -- see normalize/screening.py for how that's surfaced as a caveat.

Confirmed live against the real endpoint (2026-07-06): a frame's `data[]` rows carry
only `accn`, `cik`, `entityName`, `loc`, `start` (duration only), `end`, `val` -- NO
`fy`/`fp`/`form`/`filed` fields, unlike the shape the companyconcept API returns. Also
confirmed: a bare annual instant period ("CY2023I") 404s -- instant frames always
require an explicit quarter suffix ("CY2023Q4I").
"""

from __future__ import annotations

from typing import NamedTuple

from secfin.normalize.schema import FiscalPeriod
from secfin.sec.client import SECClient


class FrameFact(NamedTuple):
    """One company's reported value for one GAAP tag in one SEC frame period."""

    cik: int
    entity_name: str | None
    value: float
    accession: str | None
    period_start: str | None  # None for instant facts
    period_end: str | None  # duration end, or the instant date


def duration_frame_period(year: int, period: FiscalPeriod) -> str:
    """Frame period string for a duration concept (income statement, cash flow)."""
    if period == "FY":
        return f"CY{year}"
    return f"CY{year}Q{period[1]}"


def instant_frame_period(year: int, period: FiscalPeriod) -> str:
    """Frame period string for an instant concept (balance sheet).

    "FY" maps to that calendar year's Q4-end instant -- there is no bare annual instant
    frame (verified live: "CY2023I" 404s).
    """
    q = "4" if period == "FY" else period[1]
    return f"CY{year}Q{q}I"


async def fetch_frame(
    client: SECClient, tag: str, period: str, unit: str = "USD"
) -> list[FrameFact]:
    """Fetch one (tag, period) frame -- one HTTP call, one FrameFact per reporting company.

    Raises on a genuine HTTP error (e.g. an unrecognized tag); callers iterating many
    (concept, candidate tag) combinations should catch per-call, same convention as
    ingest/institutional_backfill.py's per-candidate exception handling.
    """
    url = client.frames_url(tag, period, unit=unit)
    payload = await client.get_json(url)
    facts: list[FrameFact] = []
    for row in payload.get("data", []):
        val = row.get("val")
        if val is None:
            continue
        facts.append(
            FrameFact(
                cik=row["cik"],
                entity_name=row.get("entityName"),
                value=val,
                accession=row.get("accn"),
                period_start=row.get("start"),
                period_end=row.get("end"),
            )
        )
    return facts

"""Current 5%+ blockholders, from the Schedule 13D/G filings we hold.

The raw filings are a HISTORY, not a position list, and rendering them directly gets three things
wrong. Each rule below came from reading real filings on 2026-08-06.

**One row per owner, latest filing wins.** Apple's cache holds The Vanguard Group at 9.47%
(Jul 2025) and again at 0% (Mar 2026). Showing both lists one holder twice at two contradictory
stakes; showing the older one reports a stake that has since been amended away. A 13D/G amendment
supersedes its predecessor, so the newest filing per owner is the current position.

**Below the 5% threshold is an EXIT, not a small blockholder.** Rule 13d-2 requires an amendment
when a holder's position changes materially, including on dropping through 5% -- so a 13G/A
reporting 0.83% is the filer saying "we are no longer a 5% holder". Alphabet's cache holds seven
such rows, down to 0.01%; listing them under "reported blockholders" contradicts the threshold the
card is named for. Anything under 5% is returned as an exit, with the residual stake it reported.

A filing carrying NO percentage stays among the holders with an N/A: unknown is not below.

**The subject of the filing is not the feed it came from.** Handled upstream, in the repository:
a company's own submissions carry the 13Gs it files about OTHER issuers, and NVIDIA's 9.3% of
Nebius Group was being stored as a holding of NVIDIA. See
`storage/sqlite_beneficial_ownership_repository.py`.

## What this can never be

A list of 5%+ REPORTED holders, not a share register and not an institutional-ownership ranking.
Only holders crossing 5% file at all, passive institutions file annually on a 45-day lag, and the
cache holds whatever has been fetched. A short list is normal and means little.
"""

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass, field

from secfin.normalize.schema import BeneficialOwnership


@dataclass
class Blockholder:
    owner: str
    form: str | None = None
    percent_of_class: float | None = None
    shares: float | None = None
    filed: str | None = None
    accession: str | None = None
    #: The filer's own "TYPE OF REPORTING PERSON" code, where the cover page carried one.
    reporting_person_type: str | None = None


#: The reporting threshold the card is named for. A holder at or above it is a blockholder; one
#: whose newest filing reports less has told the SEC it no longer is.
BLOCK_THRESHOLD_PCT = 5.0


@dataclass
class Blockholders:
    holders: list[Blockholder] = field(default_factory=list)
    #: Owners whose newest filing reports a stake below 5% -- including exactly 0.
    exited: list[Blockholder] = field(default_factory=list)
    #: Distinct 13D/G filings read, so a short list can be attributed to the filings rather than
    #: to us having looked at only a few.
    filings_read: int = 0
    status: str = "ok"  # "ok" | "na"
    reason: str | None = None


def _sort_key(row: BeneficialOwnership) -> tuple[str, str]:
    return (row.filed or "", row.accession or "")


def build_blockholders(rows: Sequence[BeneficialOwnership]) -> Blockholders:
    """Collapse a 13D/G filing history into the current 5%+ holders, plus the exits."""
    if not rows:
        return Blockholders(
            status="na",
            reason=(
                "No Schedule 13D or 13G is on file for this company. Only a holder crossing 5% "
                "files one at all, so an empty list is common and is not evidence of dispersed "
                "ownership."
            ),
        )

    latest: dict[str, BeneficialOwnership] = {}
    for row in rows:
        name = (row.owner_name or "").strip()
        if not name:
            continue
        seen = latest.get(name)
        if seen is None or _sort_key(row) > _sort_key(seen):
            latest[name] = row

    holders: list[Blockholder] = []
    exited: list[Blockholder] = []
    for row in latest.values():
        entry = Blockholder(
            owner=(row.owner_name or "").strip(),
            form=row.form_type,
            percent_of_class=row.percent_of_class,
            shares=row.shares_beneficially_owned,
            filed=row.filed,
            accession=row.accession,
            reporting_person_type=row.type_of_reporting_person,
        )
        # Below the threshold is an exit, 0 included. `None` is a filing that carried no
        # percentage at all -- unknown is not below, so it stays among the holders with an N/A.
        if entry.percent_of_class is not None and entry.percent_of_class < BLOCK_THRESHOLD_PCT:
            exited.append(entry)
        else:
            holders.append(entry)

    holders.sort(key=lambda h: (h.percent_of_class is None, -(h.percent_of_class or 0)))
    exited.sort(key=lambda h: h.filed or "", reverse=True)
    filings_read = len({r.accession for r in rows if r.accession})

    if not holders:
        return Blockholders(
            exited=exited,
            filings_read=filings_read,
            status="na",
            reason=(
                f"Every one of the {filings_read} Schedule 13D/G filing(s) read for this company "
                "reports a position below the 5% threshold. Nobody currently reports a 5%+ stake."
            ),
        )
    return Blockholders(holders=holders, exited=exited, filings_read=filings_read)

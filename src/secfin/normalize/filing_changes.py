"""What changed since the prior annual report -- a notification, not a status board.

The distinction is the whole design (operator direction, 2026-08-05). A status board answers "did
the auditor change?" with `no`; a notification stays silent unless something happened. So **every
row here is an event that occurred**, and a company with a quiet year produces no rows at all --
which the caller renders as one honest line naming what was checked, rather than four rows of
"unchanged".

That also settles a duplication question. §06 and §08 answer the same questions *including* their
negatives, because an absence there is a finding scoped to an indexed window. This band shows only
the positives, so the same underlying filings appear twice without the page saying the same thing
twice.

## The signals, and the one that was rejected

**Tag-set change** -- concepts a filer started or stopped tagging between its two most recent
annual reports. A disclosure choice, readable without a word of narrative, and the only row here
that is genuinely a *diff of this filing against the prior one*.

**8-K item events** -- auditor change (4.01), non-reliance restatement (4.02), material agreement
(1.01), cybersecurity incident (1.05), late filing (12b-25). Existence and date; an 8-K's body is
prose and is never read.

**Rejected: a value-level restatement diff over `raw_facts`.** It was proposed and measured on
2026-08-05, and it does not survive. Keyed on the exact period with differing accessions there are
289-876 per company, but they are dominated by `Other...` aggregation lines -- NVIDIA's
`OtherAssetsNoncurrent` moves 3,038M -> 6,425M (53%) between two filings because what a filing
lumps into "Other" depends on which components it breaks out separately. That is a presentation
difference, not a restatement, and it is the COMMON case. The trustworthy restatement signal is the
filer's own: 8-K Item 4.02 and `dei:DocumentFinStmtErrorCorrectionFlag`, both used here.
"""

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass, field

from secfin.sec.filing_index import FilingIndexEntry

#: 8-K items that are a CHANGE worth notifying, and how the band names each one.
_EVENT_ITEMS: dict[str, tuple[str, str]] = {
    "4.02": ("RESTATED", "Prior financial statements should no longer be relied on"),
    "4.01": ("AUDIT", "Auditor changed"),
    "1.05": ("CYBER", "Material cybersecurity incident reported"),
    "5.02": ("OFFICERS", "Officer or director change reported"),
    "1.01": ("DEBT", "Material agreement entered"),
}
#: Forms that are themselves the event.
_LATE_FORMS = ("NT 10-K", "NT 10-K/A", "NT 10-Q", "NT 10-Q/A", "NT 20-F")

#: Most-significant first when two events share a date. A restatement outranks an agreement.
_TAG_ORDER = {
    "RESTATED": 0, "AUDIT": 1, "LATE": 2, "CYBER": 3, "TAGS": 4, "OFFICERS": 5, "DEBT": 6
}


@dataclass
class FilingChange:
    """One thing that happened. Never a statement that something did not."""

    tag: str
    text: str
    source: str
    date: str | None = None


@dataclass
class FilingChanges:
    changes: list[FilingChange] = field(default_factory=list)
    #: The prior annual report this is measured against, and when it was filed.
    since: str | None = None
    prior_accession: str | None = None
    latest_accession: str | None = None
    #: What was examined, so "nothing changed" is a checked absence rather than a shrug.
    checked: list[str] = field(default_factory=list)
    status: str = "ok"  # "ok" | "na"
    reason: str | None = None


def _tag_change(
    annuals: Sequence[tuple[str, str | None, set[str]]],
) -> tuple[FilingChange | None, str | None, str | None, str | None]:
    """The concepts a filer started or stopped tagging between its two newest annual reports.

    Returns `(change, since, prior_accession, latest_accession)`. `change` is None when there is
    only one annual filing to look at, or when the tag set is identical -- an identical set is a
    real finding, but it is not a change, so it produces no row.
    """
    if len(annuals) < 2:
        return None, None, None, (annuals[0][0] if annuals else None)
    (new_acc, new_filed, new_tags), (old_acc, old_filed, old_tags) = annuals[0], annuals[1]
    added, removed = new_tags - old_tags, old_tags - new_tags
    if not added and not removed:
        return None, old_filed, old_acc, new_acc

    parts = []
    if added:
        parts.append(f"{len(added)} concept{'s' if len(added) != 1 else ''} newly tagged")
    if removed:
        parts.append(f"{len(removed)} no longer tagged")
    return (
        FilingChange(
            tag="TAGS",
            text=", ".join(parts),
            source=f"10-K tag set vs the one filed {old_filed}",
            date=new_filed,
        ),
        old_filed,
        old_acc,
        new_acc,
    )


def build_filing_changes(
    *,
    annuals: Sequence[tuple[str, str | None, set[str]]],
    filings: Sequence[FilingIndexEntry],
    index_built: bool,
    error_correction: bool | None = None,
    limit: int = 5,
) -> FilingChanges:
    """Events since the prior annual report, newest first. Only things that happened.

    `filings` is the company's indexed filing list; only those filed after the prior annual report
    are considered, so the window is stated rather than implied.
    """
    tag_row, since, prior_acc, latest_acc = _tag_change(annuals)

    checked = ["the tag set of the two most recent annual reports"]
    if index_built:
        checked.append(
            "8-K Items 4.01, 4.02, 5.02, 1.01 and 1.05, and Form 12b-25, filed since then"
        )
    if error_correction is not None:
        checked.append("the annual report's own accounting-error-correction check mark")

    changes: list[FilingChange] = []
    if tag_row:
        changes.append(tag_row)

    # A filer stating on its own cover page that these statements correct a prior error. Distinct
    # from the 8-K: the 8-K announces non-reliance, this one is the correction itself.
    if error_correction is True:
        changes.append(
            FilingChange(
                tag="RESTATED",
                text="These statements correct an error in previously issued ones",
                source="10-K cover, Rule 10D-1 check mark",
                date=annuals[0][1] if annuals else None,
            )
        )

    if index_built:
        # Two item types are ROUTINE for some filers -- Tesla files eighteen Item 1.01s and
        # Coca-Cola twenty-eight Item 5.02s. One row saying how many beats twenty-eight rows
        # saying the same thing, and a notification band that scrolls is not a notification.
        rollups: dict[str, list[str | None]] = {"DEBT": [], "OFFICERS": []}
        for entry in filings:
            filed = entry.filing_date or ""
            if since and filed <= since:
                continue
            if entry.form in _LATE_FORMS:
                changes.append(
                    FilingChange(
                        tag="LATE",
                        text=f"{entry.form} late-filing notification",
                        source=entry.form,
                        date=entry.filing_date,
                    )
                )
                continue
            codes = {c.strip() for c in (entry.items or "").split(",") if c.strip()}
            for code in sorted(codes & _EVENT_ITEMS.keys()):
                tag, text = _EVENT_ITEMS[code]
                # Material agreements are routine for some filers -- Tesla files eighteen. One
                # row saying how many beats eighteen rows saying the same thing.
                if tag in rollups:
                    rollups[tag].append(entry.filing_date)
                    continue
                changes.append(
                    FilingChange(
                        tag=tag, text=text, source=f"8-K Item {code}", date=entry.filing_date
                    )
                )
        for tag, dates in rollups.items():
            if not dates:
                continue
            n = len(dates)
            noun = "material agreement" if tag == "DEBT" else "officer or director change"
            code = "1.01" if tag == "DEBT" else "5.02"
            verb = "entered" if tag == "DEBT" else "reported"
            changes.append(
                FilingChange(
                    tag=tag,
                    text=f"{n} {noun}{'s' if n != 1 else ''} {verb}",
                    source=f"8-K Item {code}",
                    date=max(d for d in dates if d) if any(dates) else None,
                )
            )

    changes.sort(key=lambda c: (c.date or "", -_TAG_ORDER.get(c.tag, 9)), reverse=True)
    return FilingChanges(
        changes=changes[:limit],
        since=since,
        prior_accession=prior_acc,
        latest_accession=latest_acc,
        checked=checked,
        status="ok" if annuals else "na",
        reason=None
        if annuals
        else (
            "No annual report has been ingested for this company, so there is nothing to compare "
            "this filing against."
        ),
    )

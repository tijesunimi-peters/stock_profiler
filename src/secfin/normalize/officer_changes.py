"""Officer and director changes, from the two structured sources that carry any of it.

Neither source carries the whole event, and the gap between them is the point of this module.

**Form 3 gives the person and the role, and only for arrivals.** Section 16 requires an initial
statement of beneficial ownership within 10 days of becoming an officer, director or 10% owner --
so a Form 3 is a structural arrival signal, not an inference. It requires nothing on ceasing to be
one, so a departing CFO files nothing and is invisible here.

**8-K Item 5.02 gives the event and its date, and nothing else.** Item 5.02 covers departure,
election, appointment and compensatory arrangements, and **EDGAR's item code carries no sub-item
letter** -- every one of the 129 indexed 5.02 filings we measured reads `5.02`, never `5.02(b)` or
`5.02(c)`. Which of the five it reports is in the 8-K's narrative, which is Track 2. So the action
verb the design asked for (appointed / resigned / retired) is not recoverable from either source,
and this module does not invent one.

**The two are interleaved by date, never joined** (operator ruling 2026-08-04). Apple filed a
Form 3 for Ben Borders and an Item 5.02 8-K on the same day, 2026-01-02, and again for Sabih Khan
on 2025-07-25. Those are almost certainly the same appointment -- but "almost certainly" is an
inference about two filings that never reference each other, so the rows sit adjacent in date
order and a reader draws the link. We do not assert it.

**Only officers and directors count** (operator ruling 2026-08-04). A Form 3 is also filed by 10%
owners crossing a threshold -- 6,357 of our 22,732 arrivals, including NVIDIA Corp filing against
itself -- which is an ownership event, not personnel turnover, on a card named for personnel. The
`other` box is excluded too: it holds 665 arrivals dominated by Trustee, Portfolio Manager and
Investment Adviser, so admitting it to catch Coca-Cola's regional presidents (whom KO tags `other`)
would admit far more fund-world roles than executives. **That exclusion is reported, not silent.**
"""

from __future__ import annotations

from collections.abc import Iterable, Sequence

from secfin.normalize.schema import (
    InsiderTransaction,
    OfficerChange,
    OfficerChanges,
)
from secfin.sec.filing_index import FilingIndexEntry

# The 8-K item that reports a departure, election, appointment or compensatory arrangement for a
# director or principal officer. EDGAR serves the item without its sub-item letter.
OFFICER_CHANGE_ITEM = "5.02"

# EDGAR's convention for "the role is stated in the filing's remarks, not here". 9,303 rows in our
# store carry it. Printing it as a job title would present a pointer as an answer.
_UNSTATED_TITLE = "see remarks"
_UNSTATED_ROLE = "role stated in the filing's remarks, not in the role box"


def _roles_from_label(relationship: str | None) -> tuple[bool, bool]:
    """`(is_director, is_officer)` read from the display string's LEFT PREFIX.

    The fallback for rows cached before the structured columns existed -- 438,628 of them.

    V4 established that extracting the TITLE from `owner_relationship` is wrong on 35% of
    paren-bearing values, because a title contains the same ", " used as the separator. **The
    filter needs something strictly weaker**, and it is decidable: `_relationship_label` joins in
    a fixed order -- director, officer(...), 10% owner, other(...) -- so both boxes sit in the
    prefix, before any free text can begin. Testing the prefix never enters a paren.

    Measured over every distinct value in the store (2026-08-04): **12,630 values, 0 violating the
    fixed order and 0 beginning with anything other than one of the four boxes.** This does NOT
    extend to reading the title back out, which stays impossible and is not attempted.
    """
    rest = (relationship or "").strip()
    if not rest:
        return (False, False)
    is_director = rest == "director" or rest.startswith("director, ")
    if is_director:
        rest = rest[len("director, ") :] if rest.startswith("director, ") else ""
    is_officer = rest == "officer" or rest.startswith(("officer (", "officer, "))
    return (is_director, is_officer)


def _roles(row: InsiderTransaction) -> tuple[bool, bool]:
    """`(is_director, is_officer)`, structured columns first, display-string prefix second.

    The columns are authoritative where they exist -- they come straight from the XML boxes. Rows
    cached before they existed fall back to the prefix rule above rather than being dropped: a
    None there means "nobody wrote this column", and treating 8,373 issuers' arrivals as
    unclassifiable would be a gap of our own making, not the filings'.
    """
    if row.is_officer is not None or row.is_director is not None:
        return (bool(row.is_director), bool(row.is_officer))
    return _roles_from_label(row.owner_relationship)


def _is_personnel(row: InsiderTransaction) -> bool:
    is_director, is_officer = _roles(row)
    return is_director or is_officer


def _role_label(row: InsiderTransaction) -> tuple[str, bool]:
    """The role to show, and whether the filer actually stated a title.

    Shows the filer's OWN relationship string whole -- "director, officer (Chief Executive
    Officer)" -- rather than a title extracted from it. That is the one rendering that is right
    for every row: complete, in the filer's words, and requiring no split of a field that cannot
    be split. `officer_title` is used only to confirm a title was stated, never to rebuild the
    label from parts.
    """
    relationship = (row.owner_relationship or "").strip()
    title = (row.officer_title or "").strip()
    is_director, is_officer = _roles(row)

    stated = bool(title) and title.lower() != _UNSTATED_TITLE
    if row.officer_title is None:
        # Legacy row: the title is in the string somewhere, we just cannot say where it ends.
        stated = "(" in relationship and _UNSTATED_TITLE not in relationship.lower()

    if is_officer and not stated:
        return (_UNSTATED_ROLE if _UNSTATED_TITLE in relationship.lower() else relationship, False)
    return (relationship or ("director" if is_director else "officer"), stated)


def _arrivals(rows: Iterable[InsiderTransaction]) -> list[OfficerChange]:
    """One row per person per Form 3 -- a filing lists every security held, not every person.

    Apple's Form 3 for Ben Borders produced four rows (one per security); they are one arrival.
    Deduped on (accession, owner_name) so the count is of people, not of holdings.
    """
    seen: set[tuple[str, str]] = set()
    out: list[OfficerChange] = []
    for row in rows:
        key = (row.accession or "", row.owner_name or "")
        if key in seen or not _is_personnel(row):
            continue
        seen.add(key)
        role, title_stated = _role_label(row)
        out.append(
            OfficerChange(
                kind="arrival",
                person=row.owner_name,
                role=role,
                role_is_stated_title=title_stated,
                source=f"Form {row.form_type}" if row.form_type else "Form 3",
                date=row.filed,
                accession=row.accession,
                relationship=row.owner_relationship,
            )
        )
    return out


def _events(filings: Iterable[FilingIndexEntry]) -> list[OfficerChange]:
    """One row per 8-K carrying Item 5.02. No person and no role -- the 8-K index has neither."""
    out: list[OfficerChange] = []
    for filing in filings:
        codes = {c.strip() for c in (filing.items or "").split(",") if c.strip()}
        if OFFICER_CHANGE_ITEM not in codes:
            continue
        out.append(
            OfficerChange(
                kind="event",
                person=None,
                role=None,
                source=f"{filing.form} Item {OFFICER_CHANGE_ITEM}",
                date=filing.filing_date,
                accession=filing.accession,
            )
        )
    return out


def build_officer_changes(
    cik: int,
    *,
    initial_statements: Sequence[InsiderTransaction],
    filings: Sequence[FilingIndexEntry],
    index_built: bool,
    indexed_filings: int = 0,
    covered_from: str | None = None,
    covered_to: str | None = None,
    limit: int = 8,
) -> OfficerChanges:
    """Interleave Form 3 arrivals and 8-K Item 5.02 events into one date-ordered list.

    `index_built` distinguishes the two absences that look identical in a payload: "we read this
    company's 8-K index and found no Item 5.02" is a finding; "we have never indexed it" is not.
    """
    arrivals = _arrivals(initial_statements)
    events = _events(filings) if index_built else []

    excluded = len(
        {
            (r.accession or "", r.owner_name or "")
            for r in initial_statements
            if not _is_personnel(r)
        }
    )
    # Rows the prefix fallback could not read either -- an empty or missing relationship string.
    # Distinct from `arrivals_excluded`, which is a filer we DID classify and chose to leave out.
    unclassified = len(
        {
            (r.accession or "", r.owner_name or "")
            for r in initial_statements
            if r.is_officer is None
            and r.is_director is None
            and not (r.owner_relationship or "").strip()
        }
    )

    rows = sorted(arrivals + events, key=lambda c: c.date or "", reverse=True)[:limit]
    if not rows:
        return OfficerChanges(
            cik=cik,
            status="na",
            reason=(
                "No Form 3 from an officer or director, and no 8-K Item 5.02, among the filings "
                "read for this company."
                if index_built
                else "No Form 3 from an officer or director is cached for this company, and its "
                "8-K index has not been built -- so the event half has not been looked at."
            ),
            index_built=index_built,
            indexed_filings=indexed_filings,
            covered_from=covered_from,
            covered_to=covered_to,
            arrivals_excluded=excluded,
            arrivals_unclassified=unclassified,
        )

    return OfficerChanges(
        cik=cik,
        status="ok",
        changes=rows,
        arrival_count=len(arrivals),
        event_count=len(events),
        index_built=index_built,
        indexed_filings=indexed_filings,
        covered_from=covered_from,
        covered_to=covered_to,
        arrivals_excluded=excluded,
        arrivals_unclassified=unclassified,
    )

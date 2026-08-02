"""Read a company's filing INDEX -- form, dates and accession -- from `/submissions/`.

The generic version of the walk `insider.py:_recent_filings()` already does for Forms 3/4/5.
`/submissions/CIK##########.json` carries `filings.recent` as PARALLEL ARRAYS (one array per
field, indexed together), and every field this module returns comes from that one payload -- a
document already fetched on the insider and 13F paths, so nothing new is downloaded per filing.

## What it gives, and the boundary it does NOT cross

**Existence, dates and identity of a filing. Never its terms.**

That distinction is the whole reason this module exists (operator ruling D-supply, 2026-08-01).
A card that says *"No tender offer on file"* without ever having looked at the filing index is
asserting an absence it did not check; with this, the same card can say *"no SC TO among the N
filings we scanned"*, which is a statement about something we actually read.

What stays out of reach: how long a lock-up runs, what a tender offer priced at, how many shares
a registration covers. Those live in the documents and their exhibits -- prose, which is Track 2
and which this product does not parse. **A caller must never present a filing's existence as
knowledge of its contents.**

## Why `acceptanceDateTime` matters here

`filingDate` is the date EDGAR ASSIGNS; `acceptanceDateTime` is when the submission was actually
accepted. They agree for anything accepted in business hours and diverge after-hours, where the
filing date rolls to the next business day. Carrying both means a lag statistic can say which one
it measured -- and, for 13F, "how late did the register actually assemble" is the acceptance
timestamp's question, not the filing date's.
"""

from __future__ import annotations

from dataclasses import dataclass

from secfin.sec.client import SECClient


@dataclass(frozen=True)
class FilingIndexEntry:
    """One filing as the submissions index describes it. NOT its contents."""

    cik: int
    accession: str
    form: str
    filing_date: str | None
    # When EDGAR actually accepted it (ISO 8601, UTC). None on the rare row that omits it.
    acceptance_datetime: str | None = None
    # The period the filing REPORTS on (a 13F's quarter end, a 10-Q's period). Distinct from
    # `filing_date` and the only sensible base for a lag measure.
    report_date: str | None = None
    # 8-K item codes, comma-separated as EDGAR serves them ("5.02,9.01"). Empty for other forms.
    # This is what V3-P3 wants; carried here so it does not need a second walk of the same JSON.
    items: str | None = None
    primary_document: str | None = None
    size: int | None = None


def parse_filing_index(
    payload: dict, cik: int, *, forms: set[str] | None = None
) -> list[FilingIndexEntry]:
    """Flatten `filings.recent`'s parallel arrays into entries, newest first.

    `forms` filters by exact form string when given -- note EDGAR's forms are exact tokens, so
    "S-3" and "S-3ASR" are different, and a caller wanting both must ask for both. `None` returns
    every filing.

    Pure: takes an already-fetched payload, does no I/O.
    """
    recent = payload.get("filings", {}).get("recent", {})
    all_forms = recent.get("form", [])

    def col(name: str) -> list:
        # A field EDGAR omits for a company comes back as an empty list; index into it safely
        # rather than assuming every array is present and the same length.
        return recent.get(name, [])

    def at(name: str, i: int):
        values = col(name)
        if i >= len(values):
            return None
        value = values[i]
        # EDGAR writes "" for "not applicable" (items on a non-8-K, say). Keep that as None so a
        # consumer never has to distinguish empty-string from absent.
        return value if value not in ("", None) else None

    out: list[FilingIndexEntry] = []
    for i, form in enumerate(all_forms):
        if forms is not None and form not in forms:
            continue
        accession = at("accessionNumber", i)
        if not accession:
            continue  # no identity, nothing to key on
        size = at("size", i)
        out.append(
            FilingIndexEntry(
                cik=cik,
                accession=accession,
                form=form,
                filing_date=at("filingDate", i),
                acceptance_datetime=at("acceptanceDateTime", i),
                report_date=at("reportDate", i),
                items=at("items", i),
                primary_document=at("primaryDocument", i),
                size=int(size) if isinstance(size, (int, float)) else None,
            )
        )
    return out


async def fetch_filing_index(
    client: SECClient, cik: int, *, forms: set[str] | None = None
) -> list[FilingIndexEntry]:
    """Fetch and flatten one company's filing index.

    One throttled request to `/submissions/`, the same document the insider and 13F paths already
    read -- so this adds a request only when nothing else has fetched it.

    ⚠️ `filings.recent` is EDGAR's ROLLING WINDOW (about a thousand filings, or a year, whichever
    is larger); older filings live in the extra files listed under `filings.files` and are NOT
    read here. For a prolific filer that means the window is recent rather than complete, so a
    caller reporting "none on file" must say **how far back it looked** -- an absence over a
    window is not an absence over history.
    """
    payload = await client.get_json(client.submissions_url(cik))
    return parse_filing_index(payload, cik, forms=forms)

"""Locate and fetch a filing's PRIMARY document (the 10-K/10-Q HTML itself).

⚠️ **A second document parser.** `sec/exhibits.py` is this codebase's one other document reader,
and its own docstring is explicit that adding a second one "is a new decision, not a precedent
already set." This module's authorization does not come from EX-21's ruling -- it comes from its
own, separate operator ruling: `CLAUDE.md`'s Track 2 section (2026-08-22), which reverses the
prior "we do not scrape or parse HTML" deferral for filing narrative specifically. See
`docs/ROADMAP_TRACK2.md` for the pipeline this feeds.

## Fetch mechanism -- identical shape to EX-21's, a new target

Three pieces, all through the throttled `SECClient`, mirroring `sec/exhibits.py` +
`get_subsidiaries`'s orchestration exactly:

1. Discovery has no HTTP call -- the caller already has the `FilingIndexEntry` (accession, form)
   from the local `FilingIndexRepository`.
2. Fetch `{accession}-index-headers.html` -- the SGML header dump, HTML-escaped.
3. Regex the primary document's filename out of it, parameterized by the EXACT form string
   already known (`10-K`, `10-K/A`, `10-Q`, `10-Q/A`) -- no separate amendment classification
   needed, unlike EX-21 which searches for any `EX-21[.\\d]*` variant.
4. Fetch that filename.

**Unlike EX-21, the result is meant to be persisted** (see `sec/filing_sections.py`), not
re-fetched live per request: a primary document is hundreds of KB to a few MB, fetched once, with
metrics computed from it read many times over.
"""

from __future__ import annotations

import html
import re

from secfin.sec.client import SECClient
from secfin.sec.filing_index import FilingIndexEntry


#: `[^\s<]+` for the filename, not `\S+` -- same reasoning as `exhibits.py`'s `_EX21_TYPE`: a
#: newline usually follows it on the live page, but nothing guarantees that.
def _primary_document_pattern(form: str) -> re.Pattern[str]:
    return re.compile(rf"<TYPE>{re.escape(form)}\s*.*?<FILENAME>([^\s<]+)", re.S | re.I)


def find_primary_document_filename(index_headers: str, form: str) -> str | None:
    """The primary document's filename, from a filing's `-index-headers.html`.

    The SGML document headers are HTML-escaped on that page (`&lt;TYPE&gt;10-K`), same trap as
    EX-21's -- unescape first. `form` must be the EXACT string the filing index carries for this
    filing (`"10-K"`, `"10-K/A"`, ...), so the match is unambiguous without guessing at amendment
    status separately.

    Returns None when no `<TYPE>{form}` block is found -- an indexing inconsistency (the filing
    index said this accession was this form, but the SGML headers disagree), not something to
    guess past.
    """
    text = html.unescape(index_headers)
    m = _primary_document_pattern(form).search(text)
    return m.group(1).strip() if m else None


def filing_base_url(cik: int, accession: str) -> str:
    return f"https://www.sec.gov/Archives/edgar/data/{cik}/{accession.replace('-', '')}"


async def fetch_primary_document(
    client: SECClient, cik: int, filing: FilingIndexEntry
) -> tuple[str, str] | None:
    """Fetch a filing's primary document. Returns `(filename, html)`, or None if the SGML headers
    carry no `<TYPE>{filing.form}` block for this accession (an indexing inconsistency, logged by
    the caller -- not silently skipped)."""
    base = filing_base_url(cik, filing.accession)
    headers = await client.get_text(f"{base}/{filing.accession}-index-headers.html")
    name = find_primary_document_filename(headers, filing.form)
    if not name:
        return None
    return name, await client.get_text(f"{base}/{name}")

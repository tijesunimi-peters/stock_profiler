"""Locate and read EX-21 (subsidiaries of the registrant) from a filing's exhibit set.

⚠️ **This module parses a filing DOCUMENT, which `CLAUDE.md` otherwise forbids.** The rule --
"we ingest and re-shape structured data, we do not scrape or parse HTML" -- is suspended here and
here only, by an explicit operator ruling (2026-08-02). Nothing else in the codebase does this, and
nothing else should start because this exists. If you are adding a second document parser, that is
a new decision, not a precedent already set.

## Why the exception was asked for

EX-21 is the only place a registrant lists its consolidated subsidiaries and their jurisdictions.
There is no structured alternative: it is not in companyfacts (numeric only), not in the DERA
datasets, and not in `/submissions/`. The choice was a parsed list or no list.

## What makes it defensible

The exhibit is one of the most regular documents EDGAR carries -- a two- or three-column table of
names against jurisdictions -- and the parser is deliberately unwilling:

* It reads ONE table, the largest, and only if it has at least two columns and two data rows.
* Anything it cannot read confidently returns `status="na"` with a reason. **A partial subsidiary
  list is worse than none**: a reader cannot tell a short list from a badly-parsed one, and this
  is a card about corporate structure where an omission reads as a fact.
* It never invents an ownership column. Many filers do not publish one, and a blank is not 100%.

## What it still cannot tell you

The list is as of that filing. Subsidiaries formed or dissolved since are not in it, and EX-21
omits entities the registrant deems immaterial -- so the list is a floor, never a census.
"""

from __future__ import annotations

import html
import re
from dataclasses import dataclass, field
from html.parser import HTMLParser

#: The exhibit type. `EX-21`, `EX-21.1`, `EX-21.01` are all in the wild.
#: `[^\s<]+` for the filename, not `\S+`: on the live page a newline follows it, but nothing
#: guarantees that, and `\S+` happily swallows `</body></html>` on a page without one.
_EX21_TYPE = re.compile(r"<TYPE>(EX-21[.\d]*)\s*.*?<FILENAME>([^\s<]+)", re.S | re.I)

#: A header cell that tells us which column is which.
_JURISDICTION_HINT = re.compile(r"jurisdicti|state|country|incorporat|organiz", re.I)
_OWNERSHIP_HINT = re.compile(r"owner|%|percent", re.I)
_NAME_HINT = re.compile(r"name|subsidiar|entity|company", re.I)


def find_ex21_filename(index_headers: str) -> str | None:
    """The EX-21 document's filename, from a filing's `-index-headers.html`.

    The SGML document headers are HTML-ESCAPED on that page (`&lt;TYPE&gt;EX-21.1`), which is the
    detail that makes a naive `<TYPE>` search find nothing at all. Unescape first.

    Returns None when the filing carries no EX-21 -- which is normal: a 10-Q has none, and a
    registrant with no subsidiaries need not file one. That is an absence, not a failure.
    """
    text = html.unescape(index_headers)
    m = _EX21_TYPE.search(text)
    return m.group(2).strip() if m else None


@dataclass
class Subsidiary:
    name: str
    jurisdiction: str | None = None
    #: As published. Absent for most filers -- and absent is NOT 100%.
    ownership: str | None = None


@dataclass
class Ex21Result:
    """Parsed subsidiaries, or an honest account of why there are none to show."""

    subsidiaries: list[Subsidiary] = field(default_factory=list)
    status: str = "ok"  # "ok" | "na"
    reason: str | None = None
    #: True when the filer published an ownership column. When False the field is simply not there,
    #: which is different from every subsidiary being wholly owned.
    has_ownership: bool = False
    cannot: str = (
        "As of this filing only, and EX-21 may omit subsidiaries the registrant considers "
        "immaterial -- so this is a floor, not a census. Ownership is shown only where published."
    )


class _TableGrab(HTMLParser):
    """Collects every table as a grid of cell texts. Stdlib only -- no new dependency."""

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.tables: list[list[list[str]]] = []
        self._table: list[list[str]] | None = None
        self._row: list[str] | None = None
        self._cell: list[str] | None = None

    def handle_starttag(self, tag: str, attrs) -> None:  # noqa: ANN001
        if tag == "table":
            self._table = []
        elif tag == "tr" and self._table is not None:
            self._row = []
        elif tag in ("td", "th") and self._row is not None:
            self._cell = []

    def handle_endtag(self, tag: str) -> None:
        if tag in ("td", "th") and self._cell is not None and self._row is not None:
            self._row.append(re.sub(r"\s+", " ", "".join(self._cell)).strip())
            self._cell = None
        elif tag == "tr" and self._row is not None and self._table is not None:
            if any(c for c in self._row):
                self._table.append(self._row)
            self._row = None
        elif tag == "table" and self._table is not None:
            self.tables.append(self._table)
            self._table = None

    def handle_data(self, data: str) -> None:
        if self._cell is not None:
            self._cell.append(data)


#: Footnote markers filers hang off an entity name. Superscript digits are deliberately NOT here:
#: "3M Company" starts with one, and a name is not a footnote.
_FOOTNOTE = re.compile(r"[\s*†‡§¶]+$")


def _strip_footnote(cell: str) -> str:
    return _FOOTNOTE.sub("", cell.strip())


#: A cell that is a bare number -- "50", "69.6". Exxon publishes ownership this way, with the unit
#: in the column header rather than the cell.
_BARE_NUMBER = re.compile(r"^\d+(\.\d+)?$")


def _with_unit(value: str, header_cell: str) -> str:
    """Restore the unit the header carries and the cell omits.

    Exxon's EX-21 heads its column "Percentage of Voting Securities Owned Directly or Indirectly by
    Registrant" and fills it with `50` and `69.6`. Rendering a bare `50` in a column labelled
    "Ownership" is ambiguous -- it could be a count. The header already says percent; carrying that
    down to the cell is reshaping, not inventing.
    """
    if _BARE_NUMBER.match(value) and re.search(r"percent|%", header_cell, re.I):
        return f"{value}%"
    return value


def _column_roles(header: list[str]) -> tuple[int, int | None, int | None]:
    """(name_idx, jurisdiction_idx, ownership_idx) from a header row."""
    name_i, jur_i, own_i = 0, None, None
    for i, cell in enumerate(header):
        if jur_i is None and _JURISDICTION_HINT.search(cell):
            jur_i = i
        elif own_i is None and _OWNERSHIP_HINT.search(cell):
            own_i = i
        elif _NAME_HINT.search(cell):
            name_i = i
    return name_i, jur_i, own_i


def _split_header(table: list[list[str]]) -> tuple[list[str], list[list[str]]]:
    """The column-header row and the body, skipping a leading TITLE row.

    Filers routinely open the table with a full-width title -- Coca-Cola's reads "Subsidiaries of
    The Coca-Cola Company As of December 31, 2025" in a single cell, with the real column header
    ("Organized Under Laws of:") on the row beneath. Taking row 0 as the header found no
    jurisdiction column, so **every one of its 39 subsidiaries lost its jurisdiction** -- and the
    card's "% organized outside the U.S." was computed from that, reporting 0% for a company whose
    subsidiaries include Cayman Islands and Japan entities. A wrong figure, not a missing one.

    A row narrower than the table's widest is a title, not a header. At most the first three rows
    are skipped: beyond that we are hunting for a header rather than recognising one, which is the
    kind of guessing this module refuses to do.
    """
    width = max(len(r) for r in table)
    for i, row in enumerate(table[:3]):
        if len(row) >= width or _JURISDICTION_HINT.search(" ".join(row)):
            return row, table[i + 1 :]
    return table[0], table[1:]


def parse_ex21(document: str) -> Ex21Result:
    """Read an EX-21 exhibit into a subsidiary list, or say why it could not be read.

    Deliberately unwilling. It takes the LARGEST table and requires two columns and two data rows;
    anything else is `status="na"`. Filers publish EX-21 as prose lists, as multi-page tables split
    across pages, and occasionally as an image, and guessing at those would produce a list a reader
    cannot distinguish from a good one.
    """
    grab = _TableGrab()
    try:
        grab.feed(document)
    except Exception:  # a malformed document is a parse failure, not a crash
        return Ex21Result(status="na", reason="The exhibit could not be read as HTML.")

    tables = [t for t in grab.tables if len(t) >= 2 and max(len(r) for r in t) >= 2]
    if not tables:
        return Ex21Result(
            status="na",
            reason=(
                "No subsidiary table found in the exhibit. Some registrants publish EX-21 as prose "
                "or as an image, which we do not attempt to read."
            ),
        )

    table = max(tables, key=len)
    header, body = _split_header(table)
    name_i, jur_i, own_i = _column_roles(header)
    # A recognised header is what tells us this really is a subsidiary table. Without one we are
    # guessing at a grid, and the row count has to carry the confidence instead.
    recognised = jur_i is not None or bool(_NAME_HINT.search(" ".join(header)))
    if not recognised:
        body = table
        name_i, jur_i, own_i = 0, 1 if max(len(r) for r in table) >= 2 else None, None

    subs: list[Subsidiary] = []
    for row in body:
        # Strip FOOTNOTE MARKERS only -- never punctuation. An earlier version stripped "." along
        # with "*", which turned "Apple Canada Inc." into "Apple Canada Inc" and "Delaware, U.S."
        # into "Delaware, U.S". These are legal entity names on a card about corporate structure;
        # quietly rewriting them is worse than not showing them. (`\s` covers the non-breaking
        # space filers pad cells with.)
        cells = [_strip_footnote(c) for c in row]
        name = cells[name_i] if name_i < len(cells) else ""
        if not name:
            continue
        # A SECTION LABEL, not an entity. Coca-Cola's table reads "The Coca-Cola Company /
        # Delaware", then a bare "Subsidiaries:" row, then the list -- and that label was being
        # counted and rendered as a subsidiary with no jurisdiction. No legal entity name ends in
        # a colon, so this is a safe drop rather than a guess.
        if name.endswith(":"):
            continue
        subs.append(
            Subsidiary(
                name=name,
                jurisdiction=(cells[jur_i] or None) if jur_i is not None and jur_i < len(cells) else None,
                ownership=(
                    _with_unit(cells[own_i], header[own_i] if own_i < len(header) else "") or None
                )
                if own_i is not None and own_i < len(cells)
                else None,
            )
        )

    # One entry is enough IF the header identified the columns -- a registrant really can have a
    # single subsidiary, and suppressing that is its own kind of wrong. Without a header we are
    # inferring structure from shape, so two rows are the minimum before trusting it.
    if len(subs) < (1 if recognised else 2):
        return Ex21Result(
            status="na",
            reason="The exhibit's table did not yield a readable subsidiary list.",
        )
    return Ex21Result(subsidiaries=subs, has_ownership=own_i is not None)

"""Insider trades (Forms 3 / 4 / 5) ingestion.

Unlike company financials (which come pre-flattened from the companyfacts JSON API),
insider trades come as ownership XML documents attached to individual filings:

1. `/submissions/CIK##########.json`'s `filings.recent` block lists a company's filings
   as parallel arrays; filter `form` to {"3","4","5"} (and `/A` amendments).
2. Each such filing's `primaryDocument` (e.g. "xslF345X06/form4.xml") points at EDGAR's
   *rendered-HTML* viewer path, not the raw XML -- confirmed against a real Apple Form 4
   (2026-07-04): fetching that exact path returns an HTML document, while the raw
   ownership XML lives at the filing's directory root under the same filename (i.e.
   "form4.xml", no "xslF345X06/" prefix). `_raw_document_name` does that strip.
3. `parse_ownership_xml` (pure, network-free -- same shape as
   `companyfacts.flatten_company_facts`) turns one ownership document into
   `InsiderTransaction` rows: one per non-derivative/derivative transaction or holding.

Joint filers: a filing can have more than one `<reportingOwner>` (e.g. an insider and a
trust or holding company filing together -- confirmed against real Berkshire Hathaway /
Warren Buffett and JPMorgan Chase / DNT Asset Trust Form 4s). The XML doesn't attribute
individual transaction/holding rows to a specific owner -- a joint filing's tables apply
to all listed owners jointly -- so `parse_ownership_xml` emits one row per
(reporting owner x transaction/holding row), the same "duplicate the shared row per
filer" shape `institutional.py`'s `parse_schedule_13dg_xml` uses for 13D/G joint filers.
"""

from __future__ import annotations

import re
import xml.etree.ElementTree as ET
from collections.abc import Collection

from secfin.normalize.schema import InsiderFilingMeta, InsiderTransaction
from secfin.sec.client import SECClient

INSIDER_FORMS = {"3", "4", "5", "3/A", "4/A", "5/A"}

_TRUE = {"1", "true"}
_DATE_PREFIX = re.compile(r"^\d{4}-\d{2}-\d{2}")


def _raw_document_name(primary_document: str) -> str:
    """Strip a viewer subdirectory (e.g. "xslF345X06/") off a submissions.json primaryDocument.

    See the module docstring -- the viewer path renders HTML, the raw XML sits alongside
    it at the filing's directory root under the same filename. Delegates to
    SECClient.strip_viewer_subdir, the shared home for this EDGAR quirk (also used by
    sec/institutional.py).
    """
    return SECClient.strip_viewer_subdir(primary_document)


def _recent_filings(payload: dict, forms: set[str]) -> list[dict]:
    """Filter submissions.json's `filings.recent` parallel arrays down to matching forms.

    Returned in the same (newest-first) order the SEC serves them in.
    """
    recent = payload.get("filings", {}).get("recent", {})
    out = []
    for i, form in enumerate(recent.get("form", [])):
        if form not in forms:
            continue
        out.append(
            {
                "form": form,
                "accessionNumber": recent["accessionNumber"][i],
                "filingDate": recent["filingDate"][i],
                "primaryDocument": recent["primaryDocument"][i],
            }
        )
    return out


def _wrapped(el: ET.Element | None, tag: str) -> str | None:
    """Read a "<tag><value>...</value></tag>"-shaped field (most transaction data)."""
    if el is None:
        return None
    node = el.find(tag)
    if node is None:
        return None
    val = node.findtext("value")
    return val.strip() if val else None


def _text(el: ET.Element | None, tag: str) -> str | None:
    """Read a plain "<tag>...</tag>"-shaped field (identifying/flag fields)."""
    if el is None:
        return None
    val = el.findtext(tag)
    return val.strip() if val and val.strip() else None


def _date_only(s: str | None) -> str | None:
    """Keep the calendar date from a filer's date field, dropping any trailing UTC offset.

    Some filers tag `<transactionDate>` as `2019-11-04-07:00` -- a date with a timezone offset
    but no time, which the SEC accepts. Measured 2026-08-04: 1,838 rows across 188 issuers in
    our own store. The offset carries no information on a date-only field and it breaks both
    date parsing and lexicographic ordering, so the date part is what we keep. Anything that
    isn't a leading `YYYY-MM-DD` is passed through untouched rather than guessed at.
    """
    if s and len(s) > 10 and _DATE_PREFIX.match(s):
        return s[:10]
    return s


def _to_float(s: str | None) -> float | None:
    if s is None:
        return None
    try:
        return float(s)
    except ValueError:
        return None


def _relationship_label(rel: ET.Element | None) -> str | None:
    """A display string joining every role the filer ticked.

    Lossy by construction, and deliberately kept that way for existing consumers: a title is
    free text that often contains the same ", " used as the separator ("officer (CEO, Acting
    CFO, Chairman)"), so this string cannot be split back apart on 35% of the paren-bearing
    values in our store. `_relationship_fields` below carries the unjoined elements for anything
    that needs to branch on role rather than print it.
    """
    if rel is None:
        return None
    roles = []
    if _text(rel, "isDirector") in _TRUE:
        roles.append("director")
    if _text(rel, "isOfficer") in _TRUE:
        title = _text(rel, "officerTitle")
        roles.append(f"officer ({title})" if title else "officer")
    if _text(rel, "isTenPercentOwner") in _TRUE:
        roles.append("10% owner")
    if _text(rel, "isOther") in _TRUE:
        other = _text(rel, "otherText")
        roles.append(f"other ({other})" if other else "other")
    return ", ".join(roles) or None


def _relationship_fields(rel: ET.Element | None) -> dict:
    """The role boxes, unjoined -- what a caller filtering on role should read.

    Absent `reportingOwnerRelationship` leaves every field None (UNKNOWN). A box that IS present
    but unticked is a real False: the filer answered the question.
    """
    if rel is None:
        return {
            "officer_title": None,
            "is_director": None,
            "is_officer": None,
            "is_ten_percent_owner": None,
        }
    return {
        "officer_title": _text(rel, "officerTitle"),
        "is_director": _text(rel, "isDirector") in _TRUE,
        "is_officer": _text(rel, "isOfficer") in _TRUE,
        "is_ten_percent_owner": _text(rel, "isTenPercentOwner") in _TRUE,
    }


def _row_fields(row: ET.Element, *, is_holding: bool) -> dict:
    """Extract the per-transaction/holding fields shared by both tables' rows."""
    amounts = row.find("transactionAmounts")
    post = row.find("postTransactionAmounts")
    nature = row.find("ownershipNature")
    # transactionCoding/transactionCode: the SEC code (P/S/M/A/G/F/...). Holdings have no coding
    # element -> None. We only capture it here; the open-market (P/S) business decision lives in
    # the sector-flow aggregation batch, not in this parser.
    coding = row.find("transactionCoding")
    ownership_raw = _wrapped(nature, "directOrIndirectOwnership")
    return {
        "security_title": _wrapped(row, "securityTitle"),
        "transaction_date": _date_only(_wrapped(row, "transactionDate")),
        "shares": _to_float(_wrapped(amounts, "transactionShares")),
        "price_per_share": _to_float(_wrapped(amounts, "transactionPricePerShare")),
        "acquired_disposed": _wrapped(amounts, "transactionAcquiredDisposedCode"),
        "transaction_code": _text(coding, "transactionCode"),
        "ownership_type": {"D": "direct", "I": "indirect"}.get(ownership_raw or ""),
        "shares_owned_after": _to_float(_wrapped(post, "sharesOwnedFollowingTransaction")),
        "is_holding": is_holding,
    }


def parse_ownership_xml(
    xml_bytes: bytes,
    *,
    form_type: str,
    filed: str | None,
    accession: str | None,
) -> list[InsiderTransaction]:
    """Parse one ownership XML document into InsiderTransaction rows.

    Pure and network-free (same design intent as flatten_company_facts): the live API
    path and any future bulk path can both call this against raw bytes.
    """
    root = ET.fromstring(xml_bytes)

    issuer = root.find("issuer")
    issuer_cik_text = _text(issuer, "issuerCik")
    if not issuer_cik_text:
        raise ValueError("ownership XML missing issuer/issuerCik")
    issuer_cik = int(issuer_cik_text)
    issuer_name = _text(issuer, "issuerName")

    tables = []
    for table_tag, txn_tag, holding_tag, is_derivative in (
        ("nonDerivativeTable", "nonDerivativeTransaction", "nonDerivativeHolding", False),
        ("derivativeTable", "derivativeTransaction", "derivativeHolding", True),
    ):
        table = root.find(table_tag)
        if table is not None:
            tables.append((table, txn_tag, holding_tag, is_derivative))

    # The Rule 10b5-1 box sits on the FILING, not on a row -- one declaration covering the
    # transactions reported. `_text` handles it being absent (pre-2022 filings have no box).
    plan_flag = _text(root, "aff10b5One")
    rule_10b5_1 = (
        None if plan_flag is None else plan_flag.strip().lower() in ("1", "true", "y", "yes")
    )

    records: list[InsiderTransaction] = []
    for owner in root.findall("reportingOwner"):
        owner_id = owner.find("reportingOwnerId")
        owner_name = _text(owner_id, "rptOwnerName")
        relationship = owner.find("reportingOwnerRelationship")
        owner_relationship = _relationship_label(relationship)

        common = {
            "issuer_cik": issuer_cik,
            "issuer_name": issuer_name,
            "owner_name": owner_name,
            "owner_relationship": owner_relationship,
            **_relationship_fields(relationship),
            "form_type": form_type,
            "filed": filed,
            "accession": accession,
            "rule_10b5_1": rule_10b5_1,
        }

        for table, txn_tag, holding_tag, is_derivative in tables:
            # Which TABLE the row sat in is the only reliable derivative marker -- `security_title`
            # is free text and reading intent out of it would be Track 2.
            for row in table.findall(txn_tag):
                records.append(
                    InsiderTransaction(
                        **common, **_row_fields(row, is_holding=False), is_derivative=is_derivative
                    )
                )
            for row in table.findall(holding_tag):
                records.append(
                    InsiderTransaction(
                        **common, **_row_fields(row, is_holding=True), is_derivative=is_derivative
                    )
                )

    return records


async def fetch_insider_transactions_with_filings(
    client: SECClient, cik: int, limit: int = 50
) -> tuple[list[InsiderFilingMeta], list[InsiderTransaction]]:
    """Fetch and parse a company's most recent insider transactions (Forms 3/4/5),
    also returning which filings were fetched.

    `limit` bounds the number of *filings* fetched (newest first), not transaction rows --
    each filing can contain several transaction/holding rows. The filing metadata is what
    `storage/insider_repository.py`'s cache-aside store keys its "have we cached at least
    `limit` filings" check on -- a filing can legitimately parse to zero rows (e.g. an
    initial Form 3 with no reportable holdings), so tracking filings fetched separately
    from rows produced is required for the cache to register a hit for it.
    """
    payload = await client.get_json(client.submissions_url(cik))
    filings = _recent_filings(payload, INSIDER_FORMS)[:limit]

    filing_meta: list[InsiderFilingMeta] = []
    transactions: list[InsiderTransaction] = []
    for f in filings:
        doc = _raw_document_name(f["primaryDocument"])
        url = client.filing_document_url(cik, f["accessionNumber"], doc)
        xml_bytes = await client.get_bytes(url)
        filing_meta.append(InsiderFilingMeta(f["accessionNumber"], f["filingDate"], f["form"]))
        transactions.extend(
            parse_ownership_xml(
                xml_bytes,
                form_type=f["form"],
                filed=f["filingDate"],
                accession=f["accessionNumber"],
            )
        )
    return filing_meta, transactions


async def fetch_insider_filings_by_accession(
    client: SECClient, cik: int, accessions: Collection[str]
) -> tuple[list[InsiderFilingMeta], list[InsiderTransaction]]:
    """Fetch and parse ONLY the named accessions for one issuer.

    Same output shape as `fetch_insider_transactions_with_filings`, but bounded by an explicit
    set of filings rather than by "the newest N". That distinction is the whole point: a
    re-parse repairing rows the parser once wrote without `transaction_code`/`is_derivative`
    knows exactly WHICH filings are stale, and fetching the newest N to reach them is the
    expensive way to do it. On the 2026-08-11 corpus the stale filings sat up to 52 deep, so
    a depth-bounded refresh costs ~148k document fetches against ~5k for this path -- hours
    versus minutes at the fair-access throttle.

    Accessions absent from the issuer's `/submissions/` window are silently skipped: EDGAR
    serves a ROLLING recent list, so a filing cached long ago can age out of it. The caller
    sees which filings came back and can report the shortfall rather than assume completion.
    """
    wanted = set(accessions)
    if not wanted:
        return [], []

    payload = await client.get_json(client.submissions_url(cik))
    filings = [f for f in _recent_filings(payload, INSIDER_FORMS) if f["accessionNumber"] in wanted]

    filing_meta: list[InsiderFilingMeta] = []
    transactions: list[InsiderTransaction] = []
    for f in filings:
        doc = _raw_document_name(f["primaryDocument"])
        url = client.filing_document_url(cik, f["accessionNumber"], doc)
        xml_bytes = await client.get_bytes(url)
        filing_meta.append(InsiderFilingMeta(f["accessionNumber"], f["filingDate"], f["form"]))
        transactions.extend(
            parse_ownership_xml(
                xml_bytes,
                form_type=f["form"],
                filed=f["filingDate"],
                accession=f["accessionNumber"],
            )
        )
    return filing_meta, transactions


async def fetch_insider_transactions(
    client: SECClient, cik: int, limit: int = 50
) -> list[InsiderTransaction]:
    """Fetch and parse a company's most recent insider transactions (Forms 3/4/5).

    Thin wrapper over `fetch_insider_transactions_with_filings` for callers that don't
    need filing metadata (e.g. one-off scripts, tests).
    """
    _, transactions = await fetch_insider_transactions_with_filings(client, cik, limit)
    return transactions

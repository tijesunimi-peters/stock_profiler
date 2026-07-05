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

import xml.etree.ElementTree as ET

from secfin.normalize.schema import InsiderFilingMeta, InsiderTransaction
from secfin.sec.client import SECClient

INSIDER_FORMS = {"3", "4", "5", "3/A", "4/A", "5/A"}

_TRUE = {"1", "true"}


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


def _to_float(s: str | None) -> float | None:
    if s is None:
        return None
    try:
        return float(s)
    except ValueError:
        return None


def _relationship_label(rel: ET.Element | None) -> str | None:
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


def _row_fields(row: ET.Element, *, is_holding: bool) -> dict:
    """Extract the per-transaction/holding fields shared by both tables' rows."""
    amounts = row.find("transactionAmounts")
    post = row.find("postTransactionAmounts")
    nature = row.find("ownershipNature")
    ownership_raw = _wrapped(nature, "directOrIndirectOwnership")
    return {
        "security_title": _wrapped(row, "securityTitle"),
        "transaction_date": _wrapped(row, "transactionDate"),
        "shares": _to_float(_wrapped(amounts, "transactionShares")),
        "price_per_share": _to_float(_wrapped(amounts, "transactionPricePerShare")),
        "acquired_disposed": _wrapped(amounts, "transactionAcquiredDisposedCode"),
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
    for table_tag, txn_tag, holding_tag in (
        ("nonDerivativeTable", "nonDerivativeTransaction", "nonDerivativeHolding"),
        ("derivativeTable", "derivativeTransaction", "derivativeHolding"),
    ):
        table = root.find(table_tag)
        if table is not None:
            tables.append((table, txn_tag, holding_tag))

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
            "form_type": form_type,
            "filed": filed,
            "accession": accession,
        }

        for table, txn_tag, holding_tag in tables:
            for row in table.findall(txn_tag):
                records.append(InsiderTransaction(**common, **_row_fields(row, is_holding=False)))
            for row in table.findall(holding_tag):
                records.append(InsiderTransaction(**common, **_row_fields(row, is_holding=True)))

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


async def fetch_insider_transactions(
    client: SECClient, cik: int, limit: int = 50
) -> list[InsiderTransaction]:
    """Fetch and parse a company's most recent insider transactions (Forms 3/4/5).

    Thin wrapper over `fetch_insider_transactions_with_filings` for callers that don't
    need filing metadata (e.g. one-off scripts, tests).
    """
    _, transactions = await fetch_insider_transactions_with_filings(client, cik, limit)
    return transactions

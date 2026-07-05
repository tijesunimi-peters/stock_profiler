"""Institutional ownership ingestion: Form 13F and Schedules 13D / 13G.

Key modeling fact (repeated because it drives everything):
    13F is a QUARTER-END HOLDINGS SNAPSHOT, not transactions. We derive buy/sell by
    diffing consecutive snapshots (normalize/flows.py). Do not present trade-level data.

--------------------------------------------------------------------------------------
Form 13F  (institutional managers, quarterly holdings) -- implemented
--------------------------------------------------------------------------------------
1. `/submissions/CIK##########.json`'s `filings.recent` block lists a manager's filings;
   filter `form` to {"13F-HR", "13F-HR/A"} and match on `reportDate` (the quarter-end).
2. Unlike Forms 3/4/5, a 13F's `primaryDocument` is the *cover page* (filer info,
   signature -- no holdings), not the information table. The information table's
   filename isn't standardized across filer software -- confirmed against real
   Berkshire Hathaway 13Fs: one quarter names it an arbitrary digit string
   ("53405.xml"), an older one names it "form13fInfoTable.xml". The one constant is
   that it's the filing's *other* top-level XML document, so `_find_info_table_document`
   lists the directory (`SECClient.filing_index_json_url`) and picks whichever `.xml`
   isn't the cover page.
3. `parse_info_table_xml` (pure, network-free -- same design as
   `companyfacts.flatten_company_facts` / `insider.parse_ownership_xml`) turns the
   info table into `InstitutionalHolding` rows.
4. `fetch_13f_snapshot` assembles those into a `HoldingsSnapshot`.
5. CUSIP -> issuer CIK resolution is NOT done here (`InstitutionalHolding.cik` is always
   None) -- that's its own roadmap item (a maintained mapping table + backfill), tracked
   separately rather than half-implemented inline.

Honest limitations to surface in the API (do NOT hide these):
  * long positions in 13(f) securities only -- no shorts, no cash, no non-US.
  * ~45-day reporting lag after quarter-end -> inherently stale.
  * amendments (13F-HR/A) can restate a quarter; keep both, latest filed is current.
  * UNIT CAVEAT, confirmed against real filings: the SEC's convention for `value`
    changed from thousands of dollars to whole dollars at some point in/around 2023.
    A 2016 Berkshire info table reports $488,930 (thousands) for 13.36M shares of
    American Airlines (~$36.60/share); a 2026 one reports $498,992,850 (whole dollars,
    no scaling) for 12.72M shares of Ally Financial (~$39.23/share). `value` is stored
    exactly as reported -- callers comparing `value` across quarters spanning that
    changeover must account for the unit shift themselves; this module does not detect
    or normalize it.

--------------------------------------------------------------------------------------
Schedules 13D / 13G  (5%+ beneficial ownership) -- still a stub
--------------------------------------------------------------------------------------
Filed against an issuer when someone crosses 5% ownership. 13D = activist intent,
13G = passive. These are event-driven, not periodic, and their cover pages are far
less uniformly structured than 13F's XML info table (older filings are HTML/text, not
a fixed schema) -- deliberately left unimplemented here rather than rushed; it's its
own roadmap line.

Implementation plan:
  1. Discover via the issuer's filings or full-text index: form in
     {"SC 13D","SC 13G","SC 13D/A","SC 13G/A"}.
  2. Parse cover-page fields -> BeneficialOwnership (owner, percent_of_class,
     shares_beneficially_owned, event_date). Start with the clearest fields and expand.
"""

from __future__ import annotations

import xml.etree.ElementTree as ET

from secfin.normalize.schema import BeneficialOwnership, HoldingsSnapshot, InstitutionalHolding
from secfin.sec.client import SECClient

FORM_13F = {"13F-HR", "13F-HR/A"}
FORM_13DG = {"SC 13D", "SC 13G", "SC 13D/A", "SC 13G/A"}


def _recent_13f_filings(payload: dict) -> list[dict]:
    """Filter submissions.json's `filings.recent` parallel arrays down to Form 13F.

    Returned in the same (newest-first) order the SEC serves them in.
    """
    recent = payload.get("filings", {}).get("recent", {})
    out = []
    for i, form in enumerate(recent.get("form", [])):
        if form not in FORM_13F:
            continue
        out.append(
            {
                "form": form,
                "accessionNumber": recent["accessionNumber"][i],
                "filingDate": recent["filingDate"][i],
                "reportDate": recent["reportDate"][i],
                "primaryDocument": recent["primaryDocument"][i],
            }
        )
    return out


async def _find_info_table_document(
    client: SECClient, cik: int, accession: str, primary_document: str
) -> str:
    """Locate the information-table XML filename within a 13F filing's directory.

    See the module docstring -- the cover page (submissions.json's `primaryDocument`)
    is a known, fixed name; the info table is whichever other top-level `.xml` document
    is in the filing.
    """
    cover_doc = client.strip_viewer_subdir(primary_document)
    index = await client.get_json(client.filing_index_json_url(cik, accession))
    items = index.get("directory", {}).get("item", [])
    candidates = [
        item["name"]
        for item in items
        if item["name"].lower().endswith(".xml") and item["name"].lower() != cover_doc.lower()
    ]
    if len(candidates) != 1:
        raise ValueError(
            f"expected exactly one information-table XML in filing {accession}, "
            f"found {candidates!r}"
        )
    return candidates[0]


def _strip_namespaces(root: ET.Element) -> None:
    """13F info tables declare a default XML namespace; ownership XML (Forms 3/4/5)
    does not. Stripping it lets both this module and insider.py use plain tag names."""
    for el in root.iter():
        if "}" in el.tag:
            el.tag = el.tag.split("}", 1)[1]


def _clean(s: str | None) -> str | None:
    return s.strip() if s and s.strip() else None


def _to_float(s: str | None) -> float | None:
    if s is None:
        return None
    try:
        return float(s)
    except ValueError:
        return None


def parse_info_table_xml(xml_bytes: bytes) -> list[InstitutionalHolding]:
    """Parse a 13F information-table XML document into InstitutionalHolding rows.

    Pure and network-free. See the module docstring's UNIT CAVEAT -- `value` is stored
    exactly as reported, not normalized across the thousands/whole-dollars convention
    change.
    """
    root = ET.fromstring(xml_bytes)
    _strip_namespaces(root)

    holdings: list[InstitutionalHolding] = []
    for row in root.findall("infoTable"):
        shares_block = row.find("shrsOrPrnAmt")
        shares = _to_float(shares_block.findtext("sshPrnamt")) if shares_block is not None else None
        shares_type = shares_block.findtext("sshPrnamtType") if shares_block is not None else None
        put_call = row.findtext("putCall")
        holdings.append(
            InstitutionalHolding(
                cusip=(row.findtext("cusip") or "").strip(),
                issuer_name=_clean(row.findtext("nameOfIssuer")),
                title_of_class=_clean(row.findtext("titleOfClass")),
                value=_to_float(row.findtext("value")),
                shares=shares,
                shares_or_principal=shares_type,  # type: ignore[arg-type]
                put_call=put_call if put_call in ("Put", "Call") else None,
                investment_discretion=_clean(row.findtext("investmentDiscretion")),
            )
        )
    return holdings


async def fetch_13f_snapshot(
    client: SECClient, manager_cik: int, report_period: str
) -> HoldingsSnapshot:
    """Fetch and parse one manager's 13F for a given quarter-end.

    `report_period` is the quarter-end date as the SEC reports it, e.g. "2026-03-31".
    If both an original and an amendment exist for that quarter, the newest-filed one
    wins (submissions.json's arrays are already newest-filed-first).
    """
    payload = await client.get_json(client.submissions_url(manager_cik))
    manager_name = payload.get("name")

    filings = [f for f in _recent_13f_filings(payload) if f["reportDate"] == report_period]
    if not filings:
        raise ValueError(
            f"no 13F-HR filing found for CIK {manager_cik} at report_period {report_period!r}"
        )
    filing = filings[0]

    info_doc = await _find_info_table_document(
        client, manager_cik, filing["accessionNumber"], filing["primaryDocument"]
    )
    url = client.filing_document_url(manager_cik, filing["accessionNumber"], info_doc)
    xml_bytes = await client.get_bytes(url)

    return HoldingsSnapshot(
        manager_cik=manager_cik,
        manager_name=manager_name,
        report_period=report_period,
        filed=filing["filingDate"],
        accession=filing["accessionNumber"],
        is_amendment=filing["form"].endswith("/A"),
        holdings=parse_info_table_xml(xml_bytes),
    )


async def fetch_beneficial_ownership(
    client: SECClient, issuer_cik: int, limit: int = 50
) -> list[BeneficialOwnership]:
    """Fetch recent 13D/13G beneficial-ownership filings against an issuer.

    TODO: implement per the plan in this module's docstring.
    """
    raise NotImplementedError("13D/G ingestion not yet implemented (see docstring).")

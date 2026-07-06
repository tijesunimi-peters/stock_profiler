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
4. `fetch_13f_snapshot` fetches BOTH top-level XML documents -- the info table (via
   `parse_info_table_xml`) and the cover page (via `parse_cover_page_xml`, for the
   `otherManagers2Info` co-filer roster, see point 6) -- and assembles them into one
   `HoldingsSnapshot`.
5. CUSIP -> issuer CIK resolution is NOT done here (`InstitutionalHolding.cik` is always
   None) -- that's its own roadmap item (a maintained mapping table + backfill), tracked
   separately rather than half-implemented inline.
6. **Joint filers ARE attributed** (confirmed against a real Berkshire Hathaway 13F-HR
   with 14 co-filing insurance-subsidiary managers, accession `0001193125-26-226661`):
   the cover page's `otherManagers2Info` numbers each co-filer (`sequenceNumber`), and
   each infoTable row's `<otherManager>` tag lists which of those numbers exercised
   discretion for THAT specific position (e.g. `"2,4,11"`). `parse_cover_page_xml`
   returns the numbered roster as `HoldingsSnapshot.other_managers`;
   `InstitutionalHolding.other_managers` carries the per-row reference list -- empty
   means the filing manager alone had discretion. Some older filings (confirmed 2016)
   also carry a separate, unnumbered `<otherManagersInfo>` block that nothing can
   reference positionally -- deliberately not modeled, see `parse_cover_page_xml`'s
   docstring.

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
Schedules 13D / 13G  (5%+ beneficial ownership) -- implemented for structured filings only
--------------------------------------------------------------------------------------
Filed against an issuer when someone crosses 5% ownership. 13D = activist intent
(more disclosure, e.g. purpose of the transaction); 13G = passive/institutional (a
short cover-page form). Event-driven, not periodic.

**The SEC transitioned Schedule 13D/G to structured XML filings** -- confirmed against
real data (2026-07-05): Apple's filing history shows legacy form types ("SC 13G/A",
plain HTML/text documents) as recently as 2024-02-14, and new structured-XML form types
("SCHEDULE 13G", "SCHEDULE 13G/A") from 2025-07-29 onward. This mirrors Forms 3/4/5 and
13F's `xslVIEWER_PATH/primary_doc.xml`-is-rendered-HTML /
plain-`primary_doc.xml`-is-raw-XML quirk (`SECClient.strip_viewer_subdir`) -- except here
the raw XML *is* the filing's only document (no separate info-table file to locate, per
13F).

**Deliberate scope decision:** this module ONLY parses the modern structured-XML form
types (`FORM_13DG` below). The legacy "SC 13D"/"SC 13G"/"SC 13D/A"/"SC 13G/A" form types
are plain HTML or .txt documents with no fixed schema -- parsing those would mean HTML
scraping, which CLAUDE.md rules out ("we ingest and re-shape structured data — we do not
scrape or parse HTML"). `_recent_13dg_filings` filters them out silently rather than
raising; a company whose only beneficial-ownership history predates the XML transition
will come back with an empty list, not an error.

**13D and 13G are two DIFFERENT XML schemas** (different XML namespaces, different tag
names for the same concepts -- e.g. 13G's cover page has `issuerCik`/`issuerCusips`/
`eventDateRequiresFilingThisStatement` and ONE `coverPageHeaderReportingPersonDetails`
block, while 13D has `issuerCIK`/`issuerCUSIP`/`dateOfEvent` and a `reportingPersons`
list that can hold SEVERAL `reportingPersonInfo` blocks for joint filers -- confirmed
against a real 6-reporting-person Schedule 13D/A). `parse_schedule_13dg_xml` dispatches
on the caller-supplied `form_type` (already known from `filings.recent`) to the matching
parser, and returns one `BeneficialOwnership` per reporting person -- 1 row for a typical
13G, N rows for a jointly-filed 13D.

**Not modeled (kept out of the canonical schema for now):** `typeOfReportingPerson`
(e.g. "IA"/"OO"/"CO"), citizenship, sole/shared voting vs. dispositive power breakdown,
and free-text comments/items are all present in the raw XML but not carried onto
`BeneficialOwnership` -- that model already answers "who crossed 5%, how much, when";
richer fields are a deliberate future addition, not an oversight.
"""

from __future__ import annotations

import xml.etree.ElementTree as ET

from secfin.normalize.schema import (
    BeneficialOwnership,
    BeneficialOwnershipFilingMeta,
    HoldingsSnapshot,
    InstitutionalHolding,
    OtherManager13F,
)
from secfin.sec.client import SECClient

FORM_13F = {"13F-HR", "13F-HR/A"}
# Structured-XML form types only -- see the module docstring for why the legacy
# "SC 13D"/"SC 13G"/"SC 13D/A"/"SC 13G/A" (HTML/text) form types are deliberately absent.
FORM_13DG = {"SCHEDULE 13D", "SCHEDULE 13G", "SCHEDULE 13D/A", "SCHEDULE 13G/A"}


def recent_13f_filings(payload: dict) -> list[dict]:
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


def _recent_13dg_filings(payload: dict) -> list[dict]:
    """Filter submissions.json's `filings.recent` down to structured-XML Schedule 13D/G
    filings only -- see the module docstring. Legacy HTML/text form types are silently
    excluded, not raised as errors. Newest-first, same order the SEC serves them in.
    """
    recent = payload.get("filings", {}).get("recent", {})
    out = []
    for i, form in enumerate(recent.get("form", [])):
        if form not in FORM_13DG:
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


def _to_int(s: str | None) -> int | None:
    if s is None:
        return None
    try:
        return int(s)
    except ValueError:
        return None


def _parse_other_manager_refs(s: str | None) -> list[int]:
    """Parse an infoTable row's `<otherManager>` tag, e.g. "2,4,11" -> [2, 4, 11].

    These are sequenceNumber references into the cover page's `otherManagers2Info`
    roster (see `parse_cover_page_xml`) -- empty when the tag is absent or blank, i.e.
    only the filing manager itself exercises discretion for that row.
    """
    if not s or not s.strip():
        return []
    return [int(part) for part in s.split(",") if part.strip().isdigit()]


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
                other_managers=_parse_other_manager_refs(row.findtext("otherManager")),
            )
        )
    return holdings


def parse_cover_page_xml(xml_bytes: bytes) -> list[OtherManager13F]:
    """Parse a 13F cover page's `otherManagers2Info` roster of co-filing managers.

    Pure and network-free. Each entry's `sequenceNumber` is what individual infoTable
    rows reference via their own `<otherManager>` tag (see `parse_info_table_xml` /
    `_parse_other_manager_refs`) to attribute a specific holding to one or more of
    these managers. Returns `[]` for a filing with no co-filers (the common case).

    NOTE: some older filings (confirmed against a real 2016 Berkshire Hathaway 13F-HR)
    also carry a separate, unnumbered `<otherManagersInfo>` block -- a flat list with no
    `sequenceNumber`, so nothing in the info table can reference it positionally.
    Deliberately not modeled here: only the numbered `otherManagers2Info` roster
    supports per-holding attribution, which is the gap this function closes.
    """
    root = ET.fromstring(xml_bytes)
    _strip_namespaces(root)

    roster: list[OtherManager13F] = []
    for entry in root.findall("formData/summaryPage/otherManagers2Info/otherManager2"):
        manager = entry.find("otherManager")
        roster.append(
            OtherManager13F(
                sequence_number=_to_int(entry.findtext("sequenceNumber")) or 0,
                name=_clean(manager.findtext("name")) if manager is not None else None,
                file_number=(
                    _clean(manager.findtext("form13FFileNumber")) if manager is not None else None
                ),
            )
        )
    return roster


def _mmddyyyy_to_iso(s: str | None) -> str | None:
    """Schedule 13D/G XML dates are MM/DD/YYYY; the rest of this app uses ISO YYYY-MM-DD."""
    if not s:
        return None
    parts = s.strip().split("/")
    if len(parts) != 3:
        return None
    month, day, year = parts
    try:
        return f"{int(year):04d}-{int(month):02d}-{int(day):02d}"
    except ValueError:
        return None


def _parse_13g(
    root: ET.Element, *, form_type: str, filed: str | None, accession: str | None
) -> list[BeneficialOwnership]:
    """Schedule 13G's cover page: ONE reporting person block per filing."""
    cover = root.find("formData/coverPageHeader")
    issuer = cover.find("issuerInfo") if cover is not None else None
    issuer_cik = _to_int(issuer.findtext("issuerCik")) if issuer is not None else None
    issuer_name = _clean(issuer.findtext("issuerName")) if issuer is not None else None
    event_date = (
        _mmddyyyy_to_iso(cover.findtext("eventDateRequiresFilingThisStatement"))
        if cover is not None
        else None
    )

    out = []
    for details in root.findall("formData/coverPageHeaderReportingPersonDetails"):
        out.append(
            BeneficialOwnership(
                issuer_cik=issuer_cik,
                issuer_name=issuer_name,
                owner_name=_clean(details.findtext("reportingPersonName")),
                form_type=form_type,  # type: ignore[arg-type]
                percent_of_class=_to_float(details.findtext("classPercent")),
                shares_beneficially_owned=_to_float(
                    details.findtext("reportingPersonBeneficiallyOwnedAggregateNumberOfShares")
                ),
                event_date=event_date,
                filed=filed,
                accession=accession,
            )
        )
    return out


def _parse_13d(
    root: ET.Element, *, form_type: str, filed: str | None, accession: str | None
) -> list[BeneficialOwnership]:
    """Schedule 13D's cover page: one `reportingPersonInfo` per joint filer."""
    cover = root.find("formData/coverPageHeader")
    issuer = cover.find("issuerInfo") if cover is not None else None
    issuer_cik = _to_int(issuer.findtext("issuerCIK")) if issuer is not None else None
    issuer_name = _clean(issuer.findtext("issuerName")) if issuer is not None else None
    event_date = _mmddyyyy_to_iso(cover.findtext("dateOfEvent")) if cover is not None else None

    out = []
    for person in root.findall("formData/reportingPersons/reportingPersonInfo"):
        out.append(
            BeneficialOwnership(
                issuer_cik=issuer_cik,
                issuer_name=issuer_name,
                owner_name=_clean(person.findtext("reportingPersonName")),
                form_type=form_type,  # type: ignore[arg-type]
                percent_of_class=_to_float(person.findtext("percentOfClass")),
                shares_beneficially_owned=_to_float(person.findtext("aggregateAmountOwned")),
                event_date=event_date,
                filed=filed,
                accession=accession,
            )
        )
    return out


def parse_schedule_13dg_xml(
    xml_bytes: bytes, *, form_type: str, filed: str | None, accession: str | None
) -> list[BeneficialOwnership]:
    """Parse one structured Schedule 13D or 13G XML document into BeneficialOwnership rows.

    Pure and network-free (same design intent as flatten_company_facts /
    parse_ownership_xml / parse_info_table_xml). Dispatches on `form_type` (already known
    from filings.recent) since 13D and 13G are different XML schemas -- see the module
    docstring. One row per reporting person: 1 for a typical 13G, N for a jointly-filed
    13D.
    """
    root = ET.fromstring(xml_bytes)
    _strip_namespaces(root)
    if "13D" in form_type:
        return _parse_13d(root, form_type=form_type, filed=filed, accession=accession)
    if "13G" in form_type:
        return _parse_13g(root, form_type=form_type, filed=filed, accession=accession)
    raise ValueError(f"unrecognized Schedule 13D/G form type: {form_type!r}")


async def fetch_13f_snapshot_for_filing(
    client: SECClient,
    manager_cik: int,
    manager_name: str | None,
    report_period: str,
    filing: dict,
) -> HoldingsSnapshot:
    """Fetch and parse one manager's 13F given an already-known filing record.

    `filing` has the same shape `recent_13f_filings` returns (`form`,
    `accessionNumber`, `filingDate`, `reportDate`, `primaryDocument`) -- callers that
    already know which filing wins for a manager+quarter (e.g.
    `ingest/institutional_backfill.py`, which resolves this locally from a bulk
    submissions.zip scan instead of a live `submissions.json` fetch) can skip straight
    to this and save one network round-trip per manager. `fetch_13f_snapshot` below is
    a thin wrapper over this for the single-manager, live-lookup case.
    """
    info_doc = await _find_info_table_document(
        client, manager_cik, filing["accessionNumber"], filing["primaryDocument"]
    )
    info_url = client.filing_document_url(manager_cik, filing["accessionNumber"], info_doc)
    info_bytes = await client.get_bytes(info_url)

    # The cover page (submissions.json's primaryDocument) is also where the
    # otherManagers2Info roster lives -- a second document fetch per snapshot, but the
    # only place co-filing managers are named (see parse_cover_page_xml).
    cover_doc = client.strip_viewer_subdir(filing["primaryDocument"])
    cover_url = client.filing_document_url(manager_cik, filing["accessionNumber"], cover_doc)
    cover_bytes = await client.get_bytes(cover_url)

    return HoldingsSnapshot(
        manager_cik=manager_cik,
        manager_name=manager_name,
        report_period=report_period,
        filed=filing["filingDate"],
        accession=filing["accessionNumber"],
        is_amendment=filing["form"].endswith("/A"),
        holdings=parse_info_table_xml(info_bytes),
        other_managers=parse_cover_page_xml(cover_bytes),
    )


async def fetch_13f_snapshot(
    client: SECClient, manager_cik: int, report_period: str
) -> HoldingsSnapshot:
    """Fetch and parse one manager's 13F for a given quarter-end.

    `report_period` is the quarter-end date as the SEC reports it, e.g. "2026-03-31".
    If both an original and an amendment exist for that quarter, the newest-filed one
    wins (submissions.json's arrays are already newest-filed-first). Live single-manager
    lookup -- fetches submissions.json to find the winning filing, then delegates to
    `fetch_13f_snapshot_for_filing`.
    """
    payload = await client.get_json(client.submissions_url(manager_cik))
    manager_name = payload.get("name")

    filings = [f for f in recent_13f_filings(payload) if f["reportDate"] == report_period]
    if not filings:
        raise ValueError(
            f"no 13F-HR filing found for CIK {manager_cik} at report_period {report_period!r}"
        )
    return await fetch_13f_snapshot_for_filing(
        client, manager_cik, manager_name, report_period, filings[0]
    )


async def fetch_beneficial_ownership_with_filings(
    client: SECClient, issuer_cik: int, limit: int = 50
) -> tuple[list[BeneficialOwnershipFilingMeta], list[BeneficialOwnership]]:
    """Fetch and parse an issuer's recent structured-XML Schedule 13D/13G filings, also
    returning which filings were fetched.

    Only the modern structured-XML form types are fetched -- legacy "SC 13D"/"SC 13G"
    HTML/text filings are excluded by `_recent_13dg_filings`, not attempted (see the
    module docstring). `limit` bounds the number of *filings* fetched, not
    BeneficialOwnership rows -- a jointly-filed Schedule 13D can produce several. Filing
    metadata is returned separately so
    `storage/beneficial_ownership_repository.py`'s cache-aside store can track "have we
    cached at least `limit` filings", the same way `storage/insider_repository.py` does
    for Forms 3/4/5.
    """
    payload = await client.get_json(client.submissions_url(issuer_cik))
    filings = _recent_13dg_filings(payload)[:limit]

    filing_meta: list[BeneficialOwnershipFilingMeta] = []
    owners: list[BeneficialOwnership] = []
    for f in filings:
        doc = client.strip_viewer_subdir(f["primaryDocument"])
        url = client.filing_document_url(issuer_cik, f["accessionNumber"], doc)
        xml_bytes = await client.get_bytes(url)
        filing_meta.append(
            BeneficialOwnershipFilingMeta(f["accessionNumber"], f["filingDate"], f["form"])
        )
        owners.extend(
            parse_schedule_13dg_xml(
                xml_bytes,
                form_type=f["form"],
                filed=f["filingDate"],
                accession=f["accessionNumber"],
            )
        )
    return filing_meta, owners


async def fetch_beneficial_ownership(
    client: SECClient, issuer_cik: int, limit: int = 50
) -> list[BeneficialOwnership]:
    """Fetch and parse an issuer's recent structured-XML Schedule 13D/13G filings.

    Thin wrapper over `fetch_beneficial_ownership_with_filings` for callers that don't
    need filing metadata (e.g. one-off scripts, tests).
    """
    _, owners = await fetch_beneficial_ownership_with_filings(client, issuer_cik, limit)
    return owners

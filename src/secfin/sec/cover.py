"""Read a 10-K's cover-page facts and tag census from its extracted XBRL instance.

## Not a document parser, for the same reason `sec/proxy.py` is not

EDGAR generates an EXTRACTED XBRL INSTANCE (`*_htm.xml`) beside every inline-XBRL filing. It is
plain XML holding tagged facts -- the same kind of payload as companyfacts, delivered as a file in
a filing directory rather than through an API. `sec/exhibits.py`'s EX-21 licence is not invoked
here and is not widened by this module.

## Why companyfacts cannot answer either question

**The auditor.** `dei:AuditorName`, `dei:AuditorFirmId` and `dei:AuditorLocation` are text facts,
and the companyfacts API serves numeric facts only. Measured on the volume: the two `dei` tags
that reach it are `EntityCommonStockSharesOutstanding` and `EntityPublicFloat`. Nothing else.

**Company extension tags.** companyfacts exposes `us-gaap` and `dei` and nothing else, so a
company's own namespace (`aapl:`, `nvda:`) is invisible to it *by construction* -- the store holds
zero extension facts, not few. The instance is the only place they exist.

## The cost, measured rather than assumed (2026-08-03)

One instance per 10-K, and the range is much wider than a spot check suggests: Apple 1.42 MB,
NVIDIA 1.69 MB, Coca-Cola 4.32 MB, **JPMorgan 14.89 MB**. A byte-range fetch was considered and
ruled out: `dei:AuditorName` sits at 99.9% of the way through Apple's instance and 9.4% through
JPMorgan's, and Coca-Cola splits the pair -- `AuditorFirmId` at 9.4%, `AuditorName` at 100%. There
is no stable offset to range on, so it is the whole file or nothing. **Fetch once per accession
and store it**; never re-fetch to answer a second question.

## What this deliberately does NOT read

`dei:IcfrAuditorAttestationFlag` IS parsed and stored -- and it is **not** the Item 9A conclusion.
It means the ICFR is *subject to auditor attestation*. It does not say internal control was
effective and it does not say there was no material weakness. Both are prose (Track 2). The flag
travels with an explicit warning so no caller substitutes one for the other.

Critical audit matters, critical accounting estimates and the non-GAAP reconciliation are prose in
the same filing and are never touched.
"""

from __future__ import annotations

import re
import xml.etree.ElementTree as ET
from collections import Counter
from dataclasses import dataclass, field

_XBRLI = "{http://www.xbrl.org/2003/instance}"
_DEI = re.compile(r"^\{http://xbrl\.sec\.gov/dei/[\d-]+\}(.+)$")
_CYD = re.compile(r"^\{http://xbrl\.sec\.gov/cyd/[\d-]+\}(.+)$")
_TAG = re.compile(r"^\{([^}]+)\}(.+)$")

#: Namespaces published by a standards body rather than by the registrant. Anything outside this
#: set, and outside the XBRL plumbing namespaces, is the company's own extension taxonomy.
_STANDARD_HOSTS = ("fasb.org", "xbrl.sec.gov", "xbrl.org", "w3.org")

#: Cover-page `dei` facts worth keeping. An allowlist, like `proxy.py`'s -- the instance also
#: carries `…TextBlock` elements whose content is HTML prose, and enumerating what may be read is
#: the one reliable way not to drift into reading them.
_WANTED_DEI: dict[str, str] = {
    "AuditorName": "auditor_name",
    "AuditorFirmId": "auditor_firm_id",
    "AuditorLocation": "auditor_location",
    "EntityRegistrantName": "registrant_name",
    "EntityIncorporationStateCountryCode": "incorporation_state",
    "EntityFilerCategory": "filer_category",
    "CurrentFiscalYearEndDate": "fiscal_year_end",
    "DocumentFiscalYearFocus": "fiscal_year_focus",
    "DocumentPeriodEndDate": "period_end",
}

#: What this module currently extracts, bumped whenever a field is ADDED.
#:
#: The cover store is cache-aside over a 1.4-14.9 MB instance, so a cached row is never
#: re-read -- which means a newly-added field silently reads NULL for every filer already in
#: the cache, and the job that "succeeded" wrote nothing. That is exactly how `transaction_code`
#: sat at 0.03% populated in the insider store while the backfill reported success.
#:
#: `SQLiteFilingCoverRepository.get_cover` treats a row written under an older version as a MISS,
#: so the next request for that filer re-reads the instance once and the cache heals itself.
#: Bump this when you add to `_WANTED_DEI` or `_WANTED_FLAGS`.
#:
#: 1 -- auditor, ICFR attestation, extension census
#: 2 -- Rule 10D-1 error-correction + clawback-recovery flags (2026-08-04)
#: 3 -- Item 408(a) trading arrangements parsed from the same instance (2026-08-05). Not a
#:      field on CoverFacts, but the same fetch fills `trading_arrangements`, so a cached cover
#:      row means that table was never populated for the filer.
#: 4 -- Item 1C `cyd` cybersecurity flags (2026-08-05)
#: 5 -- the annual report PICKER changed (2026-08-05): rows written before this may point at a
#:      Part III 10-K/A shell rather than the original 10-K, so every one is suspect.
COVER_SCHEMA_VERSION = 5

#: Booleans that ride along in the same fetch. Stored as `True`/`False`/`None` -- `None` and
#: `False` are different answers, and collapsing them would invent a disclosure.
_WANTED_FLAGS: dict[str, str] = {
    "IcfrAuditorAttestationFlag": "icfr_auditor_attestation",
    # The two Rule 10D-1 check marks added to the 10-K cover in Dec 2023. The FIRST is asked of
    # every filer and was tagged by all eight we measured (2026-08-04); the SECOND is only asked
    # when the first is true, so `None` on a clean filer means "the question did not arise",
    # never "no clawback policy". Both are check marks, not the policy itself -- whether a
    # listing-standard clawback policy exists at all is proxy prose and stays out of reach.
    "DocumentFinStmtErrorCorrectionFlag": "error_correction",
    "DocumentFinStmtRestatementRecoveryAnalysisFlag": "clawback_recovery_analysis",
}


#: Item 1C cybersecurity flags, from the `cyd` taxonomy in the same instance. Measured 2026-08-05:
#: all six are tagged by 8 of 8 exemplar filers, so this is a dense disclosure rather than a
#: sometimes-thing.
#:
#: The `...MateriallyAffected...` one is the valuable one and the reason this beats the 8-K Item
#: 1.05 existence check alone: it is an affirmative `false` -- the registrant STATING no material
#: effect -- where a missing Item 1.05 is only an unchecked box. A checked negative, not an absence.
#:
#: The taxonomy's ten TextBlocks are prose (the framework a company follows, its process
#: description) and are deliberately not read: they are Track 2.
_WANTED_CYD: dict[str, str] = {
    "CybersecurityRiskMateriallyAffectedOrReasonablyLikelyToMateriallyAffectRegistrantFlag":
        "cyber_materially_affected",
    "CybersecurityRiskManagementProcessesIntegratedFlag": "cyber_processes_integrated",
    "CybersecurityRiskManagementThirdPartyEngagedFlag": "cyber_third_party_engaged",
    "CybersecurityRiskManagementPositionsOrCommitteesResponsibleFlag":
        "cyber_positions_responsible",
    "CybersecurityRiskManagementPositionsOrCommitteesResponsibleReportToBoardFlag":
        "cyber_reports_to_board",
    "CybersecurityRiskThirdPartyOversightAndIdentificationProcessesFlag":
        "cyber_third_party_oversight",
}


@dataclass
class ExtensionCensus:
    """How much of a filing is tagged in the registrant's OWN taxonomy rather than US-GAAP.

    A count of elements, never their content. This is **not** a non-GAAP adjustment count and must
    never be labelled as one -- a non-GAAP reconciliation is prose. What it measures is real and
    comparable on its own terms: how far a filer departs from the standard taxonomy.
    """

    namespace: str | None = None
    distinct: int = 0
    facts: int = 0
    total_facts: int = 0
    #: (element name, times used), most-used first. Names only -- values are not read.
    top: list[tuple[str, int]] = field(default_factory=list)

    @property
    def share(self) -> float | None:
        """Extension facts as a fraction of all tagged facts, or `None` when nothing was tagged."""
        return self.facts / self.total_facts if self.total_facts else None


@dataclass
class CoverFacts:
    """The cover-page facts of one annual report, plus its extension-tag census."""

    accession: str | None = None
    form: str | None = None
    filed: str | None = None
    auditor_name: str | None = None
    auditor_firm_id: str | None = None
    auditor_location: str | None = None
    registrant_name: str | None = None
    incorporation_state: str | None = None
    filer_category: str | None = None
    fiscal_year_end: str | None = None
    fiscal_year_focus: str | None = None
    period_end: str | None = None
    #: Subject to auditor attestation -- NOT "ICFR was effective". See the module docstring.
    icfr_auditor_attestation: bool | None = None
    #: Do these statements correct an error in previously issued ones? Universally tagged.
    error_correction: bool | None = None
    #: Did that correction require a clawback recovery analysis under 240.10D-1(b)? Only asked
    #: when `error_correction` is true, so None on a clean filer is "not applicable".
    clawback_recovery_analysis: bool | None = None
    #: Item 1C cybersecurity flags. `None` is UNTAGGED, never "no" -- the requirement applies to
    #: annual reports for fiscal years ending on or after 2023-12-15.
    cyber_materially_affected: bool | None = None
    cyber_processes_integrated: bool | None = None
    cyber_third_party_engaged: bool | None = None
    cyber_positions_responsible: bool | None = None
    cyber_reports_to_board: bool | None = None
    cyber_third_party_oversight: bool | None = None
    extensions: ExtensionCensus = field(default_factory=ExtensionCensus)
    instance_bytes: int | None = None
    status: str = "ok"  # "ok" | "na"
    reason: str | None = None


def find_extracted_instance(index_json: dict) -> str | None:
    """The extracted XBRL instance's filename in a filing's directory listing.

    EDGAR names it `<something>_htm.xml`. The label, calculation and definition linkbases
    (`_lab.xml`, `_cal.xml`, `_def.xml`) sit beside it and carry presentation metadata, not facts,
    so the suffix match is deliberately exact rather than "any .xml".
    """
    items = ((index_json.get("directory") or {}).get("item")) or []
    for item in items:
        name = item.get("name") or ""
        if name.endswith("_htm.xml"):
            return name
    return None


def _bool(text: str | None) -> bool | None:
    if text is None:
        return None
    t = text.strip().lower()
    return True if t in ("true", "1") else False if t in ("false", "0") else None


def _is_extension(uri: str) -> bool:
    return not any(host in uri for host in _STANDARD_HOSTS)


def parse_cover_facts(instance_xml: str) -> CoverFacts:
    """Read the auditor, the cover-page `dei` set and the extension census out of one instance.

    Only DIMENSIONLESS contexts are read for the `dei` facts. A filer with more than one class of
    stock tags `EntityCommonStockSharesOutstanding` once per class against a member axis, and the
    auditor facts of a multi-registrant filing are tagged per registrant the same way -- taking a
    dimensional value would attribute a figure to the wrong entity.

    The census counts every element regardless of context, because "how much of this filing is
    tagged in the company's own taxonomy" is a question about the whole document.
    """
    try:
        root = ET.fromstring(instance_xml)
    except ET.ParseError as exc:
        return CoverFacts(
            status="na",
            reason=f"The filing's XBRL instance could not be read ({exc}).",
            instance_bytes=len(instance_xml),
        )

    dimensionless = {
        ctx.get("id")
        for ctx in root.findall(f"{_XBRLI}context")
        if not list(ctx.iter("{http://xbrl.org/2006/xbrldi}explicitMember"))
    }

    result = CoverFacts(instance_bytes=len(instance_xml))
    per_namespace: Counter[str] = Counter()
    extension_elements: Counter[str] = Counter()
    extension_ns: str | None = None
    total = 0

    for el in root.iter():
        tag = _TAG.match(el.tag)
        if tag is None:
            continue
        uri, local = tag.group(1), tag.group(2)
        if uri.endswith("/linkbase") or "xbrldi" in uri or uri.endswith("/instance"):
            continue
        total += 1
        per_namespace[uri] += 1
        if _is_extension(uri):
            extension_ns = uri
            extension_elements[local] += 1

        if el.get("contextRef") not in dimensionless:
            continue

        cyd = _CYD.match(el.tag)
        if cyd is not None:
            field_name = _WANTED_CYD.get(cyd.group(1))
            if field_name:
                setattr(result, field_name, _bool((el.text or "").strip()))
            continue

        dei = _DEI.match(el.tag)
        if dei is None:
            continue
        name = dei.group(1)
        value = (el.text or "").strip()
        if name in _WANTED_DEI:
            setattr(result, _WANTED_DEI[name], value or None)
        elif name in _WANTED_FLAGS:
            setattr(result, _WANTED_FLAGS[name], _bool(value))

    result.extensions = ExtensionCensus(
        namespace=extension_ns,
        distinct=len(extension_elements),
        facts=sum(extension_elements.values()),
        total_facts=total,
        top=extension_elements.most_common(6),
    )

    if not result.auditor_name and not result.extensions.total_facts:
        result.status = "na"
        result.reason = (
            "This filing's XBRL instance carries no cover-page facts. Auditor tagging became "
            "required for annual reports filed after December 2021, so an older 10-K carries none."
        )
    return result

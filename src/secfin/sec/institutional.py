"""Institutional ownership ingestion: Form 13F and Schedules 13D / 13G.

STATUS: stub. This is the "ownership & flows" source, paired with insider trades.

Key modeling fact (repeated because it drives everything):
    13F is a QUARTER-END HOLDINGS SNAPSHOT, not transactions. We derive buy/sell by
    diffing consecutive snapshots (normalize/flows.py). Do not present trade-level data.

--------------------------------------------------------------------------------------
Form 13F  (institutional managers, quarterly holdings)
--------------------------------------------------------------------------------------
Filed BY the manager, listing everything they hold. To answer "who owns / is
accumulating AAPL?" you must aggregate across ALL managers' 13Fs and invert the index
by security (CUSIP/CIK) — this is a cross-entity problem, not a per-company lookup.

Implementation plan:
  1. Discover 13F filings. Two paths:
       a. per manager: /submissions/CIK##########.json, filter form in {"13F-HR","13F-HR/A"}.
       b. broadly: EDGAR full-text / full-index for the quarter (for bulk aggregation).
  2. For each filing, fetch the primary XML information table document from the filing's
     EDGAR directory (built from the accession number).
  3. Parse each infoTable entry -> InstitutionalHolding:
       nameOfIssuer, titleOfClass, cusip, value, shrsOrPrnAmt (sshPrnamt + sshPrnamtType),
       putCall, investmentDiscretion.
  4. Assemble into a HoldingsSnapshot (manager_cik, report_period = quarter-end, accession).
  5. Resolve CUSIP -> issuer CIK where possible so holdings join to our company data.
     (CUSIP->CIK is not in a single free SEC endpoint; maintain a mapping table and
     backfill it. Track unresolved CUSIPs.)

Honest limitations to surface in the API (do NOT hide these):
  * long positions in 13(f) securities only — no shorts, no cash, no non-US.
  * ~45-day reporting lag after quarter-end -> inherently stale.
  * amendments (13F-HR/A) can restate a quarter; keep both, latest filed is current.

--------------------------------------------------------------------------------------
Schedules 13D / 13G  (5%+ beneficial ownership)
--------------------------------------------------------------------------------------
Filed against an issuer when someone crosses 5% ownership. 13D = activist intent,
13G = passive. These are event-driven, not periodic.

Implementation plan:
  1. Discover via the issuer's filings or full-text index: form in
     {"SC 13D","SC 13G","SC 13D/A","SC 13G/A"}.
  2. Parse cover-page fields -> BeneficialOwnership (owner, percent_of_class,
     shares_beneficially_owned, event_date). Historically these cover pages are less
     uniformly structured than 13F XML, so start with the clearest fields and expand.
"""

from __future__ import annotations

from secfin.normalize.schema import BeneficialOwnership, HoldingsSnapshot
from secfin.sec.client import SECClient

FORM_13F = {"13F-HR", "13F-HR/A"}
FORM_13DG = {"SC 13D", "SC 13G", "SC 13D/A", "SC 13G/A"}


async def fetch_13f_snapshot(
    client: SECClient, manager_cik: int, report_period: str
) -> HoldingsSnapshot:
    """Fetch and parse one manager's 13F for a given quarter-end.

    TODO: implement per the plan in this module's docstring.
    """
    raise NotImplementedError("13F ingestion not yet implemented (see docstring).")


async def fetch_beneficial_ownership(
    client: SECClient, issuer_cik: int, limit: int = 50
) -> list[BeneficialOwnership]:
    """Fetch recent 13D/13G beneficial-ownership filings against an issuer.

    TODO: implement per the plan in this module's docstring.
    """
    raise NotImplementedError("13D/G ingestion not yet implemented (see docstring).")

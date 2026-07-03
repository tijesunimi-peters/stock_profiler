"""Insider trades (Forms 3 / 4 / 5) ingestion.

STATUS: stub. This is the second ingestion source. Unlike company financials
(which come pre-flattened from the companyfacts JSON API), insider trades come as
ownership XML documents attached to individual filings.

Implementation plan
-------------------
1. From /submissions/CIK##########.json, filter the recent-filings block to
   form types in {"3", "4", "5"} (and their /A amendments).
2. For each, build the filing's EDGAR directory URL from its accession number and
   fetch the ownership XML document (the primary .xml in that filing).
3. Parse the XML into InsiderTransaction records (see schema.InsiderTransaction):
   issuer (CIK/name), reporting owner (name + relationship: director/officer/10% owner),
   and each transaction: date, security title, shares, price-per-share,
   acquired/disposed flag, direct vs indirect ownership, shares owned after.
4. Amendments supersede prior filings for the same accession family; keep both,
   mark the latest as current (same restatement rule as financials).

Parsing notes
-------------
- Ownership XML is a stable, well-defined schema; prefer parsing it directly over
  any HTML rendering.
- Non-derivative and derivative transactions live in separate sections; capture both.
- Some entries are holdings (no transaction) rather than trades — keep them but flag.
"""

from __future__ import annotations

from secfin.normalize.schema import InsiderTransaction
from secfin.sec.client import SECClient

INSIDER_FORMS = {"3", "4", "5", "3/A", "4/A", "5/A"}


async def fetch_insider_transactions(
    client: SECClient, cik: int, limit: int = 50
) -> list[InsiderTransaction]:
    """Fetch and parse recent insider transactions for a company.

    TODO: implement per the plan in this module's docstring.
    """
    raise NotImplementedError("Insider-trade ingestion not yet implemented (see docstring).")

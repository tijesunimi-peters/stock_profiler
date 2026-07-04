"""Fetch and flatten the SEC 'company facts' payload into raw facts.

companyfacts returns, per taxonomy (us-gaap, dei, ...), per concept (e.g. "Revenues"),
per unit (e.g. "USD"), a list of data points. Each point looks roughly like:

    {"start": "2023-01-01", "end": "2023-12-31", "val": 383285000000,
     "fy": 2023, "fp": "FY", "form": "10-K", "filed": "2023-11-03", "accn": "..."}

We flatten these into a list of RawFact (source-faithful, NOT yet normalized). The
normalize layer maps these onto canonical concepts.
"""

from __future__ import annotations

from secfin.normalize.schema import RawFact
from secfin.sec.client import SECClient


def flatten_company_facts(payload: dict, cik: int, taxonomy: str = "us-gaap") -> list[RawFact]:
    """Pure flatten step: companyfacts JSON payload -> flat RawFacts.

    Deliberately network-free so both ingestion paths can call it and get identical
    output: the live per-request fetch below, and the bulk backfill (secfin.ingest.backfill),
    which loads the same payload shape from a companyfacts.zip entry instead of the API.
    """
    concepts = payload.get("facts", {}).get(taxonomy, {})
    out: list[RawFact] = []

    for tag, concept in concepts.items():
        label = concept.get("label") or tag
        for unit, points in concept.get("units", {}).items():
            for p in points:
                out.append(
                    RawFact(
                        cik=cik,
                        taxonomy=taxonomy,
                        gaap_tag=tag,
                        label=label,
                        unit=unit,
                        value=p.get("val"),
                        period_start=p.get("start"),
                        period_end=p.get("end"),
                        instant=None if p.get("start") else p.get("end"),
                        fiscal_year=p.get("fy"),
                        fiscal_period=p.get("fp"),
                        form=p.get("form"),
                        filed=p.get("filed"),
                        accession=p.get("accn"),
                        frame=p.get("frame"),
                    )
                )
    return out


async def fetch_raw_facts(client: SECClient, cik: int, taxonomy: str = "us-gaap") -> list[RawFact]:
    """Return every data point for a company under one taxonomy as flat RawFacts."""
    payload = await client.get_json(client.company_facts_url(cik))
    return flatten_company_facts(payload, cik, taxonomy)

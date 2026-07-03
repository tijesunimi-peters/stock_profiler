"""Parity between the bulk-backfill parse path and the live per-request fetch path.

Both MUST produce identical RawFacts from the same companyfacts JSON shape -- that's
the whole point of factoring flatten_company_facts out as a pure function shared by
sec/companyfacts.py:fetch_raw_facts (live) and ingest/backfill.py (bulk zip entries).
"""

from __future__ import annotations

from secfin.sec.companyfacts import fetch_raw_facts, flatten_company_facts

_PAYLOAD = {
    "facts": {
        "us-gaap": {
            "Assets": {
                "label": "Assets",
                "units": {
                    "USD": [
                        {
                            "end": "2024-09-28",
                            "val": 364980000000,
                            "fy": 2024,
                            "fp": "FY",
                            "form": "10-K",
                            "filed": "2024-11-01",
                            "accn": "0000320193-24-000123",
                        }
                    ]
                },
            },
            "Revenues": {
                "label": "Revenues",
                "units": {
                    "USD": [
                        {
                            "start": "2023-10-01",
                            "end": "2024-09-28",
                            "val": 391035000000,
                            "fy": 2024,
                            "fp": "FY",
                            "form": "10-K",
                            "filed": "2024-11-01",
                            "accn": "0000320193-24-000123",
                        }
                    ]
                },
            },
        }
    }
}


class _FakeSECClient:
    """Stand-in for SECClient: returns a fixed payload instead of hitting the network."""

    def __init__(self, payload: dict) -> None:
        self._payload = payload

    async def get_json(self, url: str) -> dict:
        return self._payload

    def company_facts_url(self, cik: int) -> str:
        return f"fake://companyfacts/{cik}"


async def test_bulk_and_live_paths_produce_identical_facts():
    cik = 320193
    # "bulk" path: as if this payload were loaded straight out of companyfacts.zip.
    bulk_facts = flatten_company_facts(_PAYLOAD, cik)
    # "live" path: as the API does today, via fetch_raw_facts.
    live_facts = await fetch_raw_facts(_FakeSECClient(_PAYLOAD), cik)

    assert bulk_facts == live_facts
    assert len(bulk_facts) == 2
    by_tag = {f.gaap_tag: f for f in bulk_facts}
    assert by_tag["Assets"].instant == "2024-09-28"
    assert by_tag["Assets"].period_start is None
    assert by_tag["Revenues"].period_start == "2023-10-01"
    assert by_tag["Revenues"].instant is None

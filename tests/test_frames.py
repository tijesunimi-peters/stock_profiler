"""Tests for the SEC frames fetch/parse module (secfin.sec.frames).

Fixture payload shapes below mirror the real SEC frames endpoint response, confirmed
live against data.sec.gov (2026-07-06): data rows carry accn/cik/entityName/loc/
start(duration only)/end/val -- no fy/fp/form/filed fields.
"""

from __future__ import annotations

from secfin.sec.client import SECClient
from secfin.sec.frames import (
    duration_frame_period,
    fetch_frame,
    instant_frame_period,
)


class _FakeSECClient:
    def __init__(self, json_by_url: dict) -> None:
        self._json = json_by_url

    async def get_json(self, url: str) -> dict:
        return self._json[url]

    frames_url = staticmethod(SECClient.frames_url)


def test_duration_frame_period_annual_and_quarterly():
    assert duration_frame_period(2023, "FY") == "CY2023"
    assert duration_frame_period(2023, "Q2") == "CY2023Q2"


def test_instant_frame_period_fy_maps_to_q4():
    assert instant_frame_period(2023, "FY") == "CY2023Q4I"
    assert instant_frame_period(2023, "Q2") == "CY2023Q2I"


async def test_fetch_frame_parses_duration_rows():
    url = SECClient.frames_url("Revenues", "CY2023Q4")
    payload = {
        "taxonomy": "us-gaap",
        "tag": "Revenues",
        "ccp": "CY2023Q4",
        "uom": "USD",
        "pts": 2,
        "data": [
            {
                "accn": "0000002969-25-000013",
                "cik": 2969,
                "entityName": "AIR PRODUCTS AND CHEMICALS, INC.",
                "loc": "US-PA",
                "start": "2023-10-01",
                "end": "2023-12-31",
                "val": 2997400000,
            },
            {
                "accn": "0000004127-25-000010",
                "cik": 4127,
                "entityName": "Skyworks Solutions, Inc.",
                "loc": "US-CA",
                "start": "2023-09-30",
                "end": "2023-12-29",
                "val": 1201500000,
            },
        ],
    }
    client = _FakeSECClient({url: payload})

    facts = await fetch_frame(client, "Revenues", "CY2023Q4")

    assert len(facts) == 2
    assert facts[0].cik == 2969
    assert facts[0].entity_name == "AIR PRODUCTS AND CHEMICALS, INC."
    assert facts[0].value == 2997400000
    assert facts[0].accession == "0000002969-25-000013"
    assert facts[0].period_start == "2023-10-01"
    assert facts[0].period_end == "2023-12-31"


async def test_fetch_frame_parses_instant_rows_with_no_start():
    url = SECClient.frames_url("Assets", "CY2023Q4I")
    payload = {
        "data": [
            {
                "accn": "0001104659-23-128321",
                "cik": 1750,
                "entityName": "AAR CORP",
                "loc": "US-IL",
                "end": "2023-11-30",
                "val": 1965600000,
            }
        ]
    }
    client = _FakeSECClient({url: payload})

    facts = await fetch_frame(client, "Assets", "CY2023Q4I")

    assert len(facts) == 1
    assert facts[0].period_start is None
    assert facts[0].period_end == "2023-11-30"


async def test_fetch_frame_skips_rows_with_no_value():
    url = SECClient.frames_url("Revenues", "CY2023Q4")
    payload = {
        "data": [
            {"accn": "acc-1", "cik": 1, "entityName": "A", "end": "2023-12-31", "val": None},
            {"accn": "acc-2", "cik": 2, "entityName": "B", "end": "2023-12-31", "val": 100},
        ]
    }
    client = _FakeSECClient({url: payload})

    facts = await fetch_frame(client, "Revenues", "CY2023Q4")

    assert len(facts) == 1
    assert facts[0].cik == 2

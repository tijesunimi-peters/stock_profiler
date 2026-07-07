"""Tests for the cross-company screening route core (api/routes.py's `_run_screen`),
called directly the same way tests/test_manager_routes.py calls other route helpers --
this is the DB-only piece with no SECClient dependency (entity-name enrichment happens
in the thin `screen_companies` route wrapper afterward and isn't covered by these tests,
same convention as the rest of routes.py's cache-aside helpers).
"""

from __future__ import annotations

from secfin.api.routes import _run_screen
from secfin.normalize.mapping import candidate_tags
from secfin.normalize.schema import RawFact
from secfin.storage.sqlite_repository import SQLiteRawFactRepository


def _frame_fact(cik: int, tag: str, value: float, frame: str) -> RawFact:
    return RawFact(
        cik=cik,
        taxonomy="us-gaap",
        gaap_tag=tag,
        label="x",
        unit="USD",
        value=value,
        period_start="2023-01-01",
        period_end="2023-12-31",
        accession=f"acc-{cik}-{tag}",
        frame=frame,
    )


def test_run_screen_filters_by_min_and_max(tmp_path):
    repo = SQLiteRawFactRepository(tmp_path / "secfin.db")
    revenue_tag = candidate_tags("revenue")[0]
    repo.upsert_raw_facts(
        [
            _frame_fact(1, revenue_tag, 100.0, "CY2023"),
            _frame_fact(2, revenue_tag, 500.0, "CY2023"),
            _frame_fact(3, revenue_tag, 1000.0, "CY2023"),
        ]
    )

    matching, values = _run_screen(
        repo, fiscal_year=2023, fiscal_period="FY", filters={"revenue": (200.0, 900.0)}
    )

    assert matching == {2}
    assert values["revenue"][2] == 500.0
    repo.close()


def test_run_screen_intersects_multiple_concepts_with_and_semantics(tmp_path):
    repo = SQLiteRawFactRepository(tmp_path / "secfin.db")
    revenue_tag = candidate_tags("revenue")[0]
    net_income_tag = candidate_tags("net_income")[0]
    repo.upsert_raw_facts(
        [
            _frame_fact(1, revenue_tag, 1000.0, "CY2023"),
            _frame_fact(1, net_income_tag, -50.0, "CY2023"),  # fails net_income filter
            _frame_fact(2, revenue_tag, 1000.0, "CY2023"),
            _frame_fact(2, net_income_tag, 100.0, "CY2023"),  # passes both filters
        ]
    )

    matching, _ = _run_screen(
        repo,
        fiscal_year=2023,
        fiscal_period="FY",
        filters={"revenue": (500.0, None), "net_income": (0.0, None)},
    )

    assert matching == {2}
    repo.close()


def test_run_screen_only_matches_the_exact_requested_frame(tmp_path):
    repo = SQLiteRawFactRepository(tmp_path / "secfin.db")
    revenue_tag = candidate_tags("revenue")[0]
    repo.upsert_raw_facts([_frame_fact(1, revenue_tag, 1000.0, "CY2022")])  # different year

    matching, _ = _run_screen(
        repo, fiscal_year=2023, fiscal_period="FY", filters={"revenue": (0.0, None)}
    )

    assert matching == set()
    repo.close()

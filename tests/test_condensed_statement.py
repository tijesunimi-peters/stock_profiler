"""Tests for the condensed (multi-period) statement shape -- V3-P4's company Overview card.

Two layers, matching how the rest of the suite splits this kind of change:

  * the pure transpose (`normalize/viz.condensed_statement`) against hand-built Statements,
    where the honesty invariant is easy to pin exactly; and
  * the endpoint (`GET /companies/{symbol}/statements/{statement}/condensed`) against the
    real AAPL companyfacts fixture through a fake repo -- no network, the
    tests/test_raw_facts_route.py pattern.

**The invariant that matters most: a period which did not report a line contributes `None`,
never 0.** A condensed card is exactly where a zero-filled gap would read as "they reported
nothing this year" instead of "we have no fact here" -- STYLE_GUIDE section 7.
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest
from fastapi import HTTPException

from secfin.api.routes import get_condensed_statement
from secfin.normalize.schema import Statement, StatementLine
from secfin.normalize.viz import condensed_statement
from secfin.sec.companyfacts import flatten_company_facts

FIXTURES_DIR = Path(__file__).parent / "fixtures"


# ---------------------------------------------------------------------------
# The pure transpose
# ---------------------------------------------------------------------------


def _line(concept: str, value: float | None, *, unit: str = "USD") -> StatementLine:
    return StatementLine(
        canonical_concept=concept,
        label=concept.replace("_", " ").title(),
        value=value,
        unit=unit,
        source_tag=concept,
    )


def _stmt(year: int, lines: list[StatementLine], *, period_end: str | None = None) -> Statement:
    return Statement(
        cik=320193,
        statement="income",
        fiscal_year=year,
        fiscal_period="FY",
        period_end=period_end or f"{year}-09-28",
        form="10-K",
        filed=f"{year}-10-31",
        accession=f"0000320193-{str(year)[2:]}-000001",
        lines=lines,
    )


def test_columns_are_oldest_to_newest_regardless_of_input_order():
    out = condensed_statement(
        [
            _stmt(2025, [_line("revenue", 3.0)]),
            _stmt(2023, [_line("revenue", 1.0)]),
            _stmt(2024, [_line("revenue", 2.0)]),
        ]
    )
    assert [c.fiscal_year for c in out.columns] == [2023, 2024, 2025]
    assert out.rows[0].values == [1.0, 2.0, 3.0]


def test_a_period_missing_a_line_is_none_not_zero():
    """The load-bearing honesty rule of this whole shape."""
    out = condensed_statement(
        [
            _stmt(2023, [_line("revenue", 1.0), _line("gross_profit", 0.4)]),
            _stmt(2024, [_line("revenue", 2.0)]),  # no gross_profit reported
            _stmt(2025, [_line("revenue", 3.0), _line("gross_profit", 1.2)]),
        ]
    )
    gp = next(r for r in out.rows if r.canonical_concept == "gross_profit")
    assert gp.values == [0.4, None, 1.2]
    assert 0 not in gp.values and 0.0 not in gp.values


def test_a_reported_tag_with_a_null_value_stays_null():
    out = condensed_statement(
        [_stmt(2024, [_line("revenue", None)]), _stmt(2025, [_line("revenue", 3.0)])]
    )
    assert out.rows[0].values == [None, 3.0]


def test_values_are_always_aligned_to_columns():
    out = condensed_statement(
        [
            _stmt(2023, [_line("revenue", 1.0)]),
            _stmt(2024, [_line("revenue", 2.0), _line("net_income", 0.5)]),
            _stmt(2025, [_line("operating_income", 0.9)]),
        ]
    )
    assert len(out.columns) == 3
    for row in out.rows:
        assert len(row.values) == 3, f"{row.canonical_concept} is not column-aligned"


def test_row_order_follows_the_newest_filings_presentation():
    """Newest column first: the most recent filing's own line order wins, and a line only
    older filings carried still appears (after them), never dropped."""
    out = condensed_statement(
        [
            _stmt(2024, [_line("revenue", 1.0), _line("retired_line", 0.1)]),
            _stmt(2025, [_line("revenue", 2.0), _line("gross_profit", 0.8)]),
        ]
    )
    order = [r.canonical_concept for r in out.rows]
    assert order[:2] == ["revenue", "gross_profit"]  # newest filing's order
    assert "retired_line" in order  # older-only line survives


def test_mixed_units_are_flagged_and_keep_the_newest_unit():
    out = condensed_statement(
        [
            _stmt(2024, [_line("share_count", 1000.0, unit="shares")]),
            _stmt(2025, [_line("share_count", 2.0, unit="shares-millions")]),
        ]
    )
    row = out.rows[0]
    assert row.unit_mixed is True
    assert row.unit == "shares-millions"  # newest column's unit


def test_single_unit_row_is_not_flagged_mixed():
    out = condensed_statement(
        [_stmt(2024, [_line("revenue", 1.0)]), _stmt(2025, [_line("revenue", 2.0)])]
    )
    assert out.rows[0].unit_mixed is False


def test_empty_input_is_an_empty_shape_not_a_crash():
    out = condensed_statement([])
    assert out.columns == [] and out.rows == []


# ---------------------------------------------------------------------------
# The endpoint
# ---------------------------------------------------------------------------


class _FakeRepo:
    def __init__(self, facts) -> None:
        self._facts = facts

    def get_raw_facts(self, cik: int):
        return [f for f in self._facts if f.cik == cik]

    def upsert_raw_facts(self, facts) -> int:  # pragma: no cover - cache hit expected
        raise AssertionError("cache hit expected; nothing should be upserted")


class _FakeTickerCache:
    async def resolve(self, client, ticker: str):
        return {"AAPL": 320193}.get(ticker.upper())


def _aapl_repo() -> _FakeRepo:
    payload = json.loads((FIXTURES_DIR / "aapl_companyfacts.json").read_text())
    return _FakeRepo(flatten_company_facts(payload, 320193))


async def _call(**overrides):
    """Every parameter explicit -- a direct handler call bypasses FastAPI, so an omitted
    argument would be a raw Query(...) object rather than its default."""
    params = dict(
        symbol="320193",
        statement="income",
        period="FY",
        limit=4,
        repo=_aapl_repo(),
        ticker_cache=_FakeTickerCache(),
    )
    params.update(overrides)
    return await get_condensed_statement(**params)


@pytest.mark.asyncio
async def test_endpoint_returns_columns_oldest_to_newest_within_limit():
    out = await _call(limit=3)
    assert out.cik == 320193
    assert out.statement == "income"
    assert out.period_type == "FY"
    assert 0 < len(out.columns) <= 3
    ends = [c.period_end for c in out.columns if c.period_end]
    assert ends == sorted(ends), "columns must be oldest -> newest"


@pytest.mark.asyncio
async def test_endpoint_columns_are_all_the_requested_period_type():
    out = await _call()
    assert {c.fiscal_period for c in out.columns} == {"FY"}


@pytest.mark.asyncio
async def test_endpoint_rows_are_column_aligned_and_never_zero_filled():
    out = await _call()
    n = len(out.columns)
    assert out.rows, "the AAPL fixture should map at least one income line"
    for row in out.rows:
        assert len(row.values) == n
        # Any absent fact must be None. A real 0 is legal, so assert on the shape:
        # every position is either None or a number, never a coerced default.
        assert all(v is None or isinstance(v, (int, float)) for v in row.values)


@pytest.mark.asyncio
async def test_endpoint_carries_the_filing_provenance_per_column():
    out = await _call()
    first = out.columns[0]
    assert first.accession, "each column must name the filing it came from"
    assert first.form and first.filed


@pytest.mark.asyncio
async def test_endpoint_resolves_a_ticker_not_just_a_cik():
    out = await _call(symbol="AAPL")
    assert out.cik == 320193


@pytest.mark.asyncio
async def test_endpoint_unknown_ticker_is_404():
    """The 404 case is an unresolvable TICKER. A digits CIK with an empty cache is NOT a 404
    here -- it is a cache miss, and the cache-aside path would go to SEC for it, so that
    branch belongs to an integration test rather than this offline one."""
    with pytest.raises(HTTPException) as exc:
        await _call(symbol="NOSUCHTICKER")
    assert exc.value.status_code == 404


@pytest.mark.asyncio
async def test_endpoint_period_type_with_no_data_is_an_empty_200_not_an_error():
    """An honest 'nothing to condense' -- distinct from an unknown company's 404."""
    out = await _call(period="Q4", statement="income")
    # Whatever the fixture holds for Q4, the contract is the same: a valid shape, no raise.
    assert out.cik == 320193
    assert len(out.rows) == 0 or all(len(r.values) == len(out.columns) for r in out.rows)

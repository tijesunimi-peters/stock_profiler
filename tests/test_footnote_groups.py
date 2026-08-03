"""Tests for the footnote GROUPS -- `normalize/statements.build_footnote_group` and the
`/companies/{symbol}/footnotes` route's period resolution. Pure: no network, no SQLite.

The load-bearing behaviour here is about ABSENCE. Footnote disclosure is optional, so a group with
nothing in it is usually the filer's choice rather than our gap -- and the two are indistinguishable
from outside the payload. These tests pin the three things that keep them distinguishable:

* a group is `ok` only when a concept the card is NAMED for resolved (the primary-concept rule),
* an absence carries a reason and the group's `coverage`, never an empty line list read as zeros,
* asking a QUARTER for an ANNUAL disclosure resolves to the annual period instead of reporting a
  false absence.
"""

from __future__ import annotations

import pytest

from secfin.normalize.mapping import FOOTNOTE_GROUPS, footnote_concepts, footnote_primary
from secfin.normalize.schema import RawFact
from secfin.normalize.statements import build_footnote_group


def _fact(
    tag: str,
    value: float = 1_000.0,
    *,
    fiscal_year: int = 2025,
    fiscal_period: str = "FY",
    unit: str = "USD",
    accession: str = "0000320193-25-000001",
    filed: str = "2025-10-30",
) -> RawFact:
    return RawFact(
        cik=320193,
        taxonomy="us-gaap",
        gaap_tag=tag,
        label=tag,
        unit=unit,
        value=value,
        fiscal_year=fiscal_year,
        fiscal_period=fiscal_period,
        accession=accession,
        filed=filed,
    )


def _tag_for(concept: str) -> str:
    """The first candidate tag for a canonical concept -- what a filer would most likely use."""
    from secfin.normalize.mapping import candidate_tags

    return candidate_tags(concept)[0]


class TestPrimaryConceptRule:
    """A card is `ok` only when the thing it is NAMED for resolved.

    The bug this rule exists for: the R&D-capitalisation card reported `ok` because R&D *expense*
    resolved. Expense is in the group as context, but a card titled "capitalised R&D" that shows
    only the expense line has not answered its own question -- and `ok` told a reader it had.
    """

    def test_a_context_concept_alone_is_not_ok(self):
        group = "capitalized_rd"
        primary = set(footnote_primary(group))
        context = [c for c in footnote_concepts(group) if c not in primary]
        assert context, f"{group} has no non-primary concept; this test would prove nothing"

        result = build_footnote_group([_fact(_tag_for(context[0]))], 320193, group, 2025, "FY")
        assert result["status"] == "na"

    def test_a_primary_concept_makes_it_ok(self):
        group = "capitalized_rd"
        primary = footnote_primary(group)[0]
        result = build_footnote_group([_fact(_tag_for(primary))], 320193, group, 2025, "FY")
        assert result["status"] == "ok"
        assert result["lines"]

    @pytest.mark.parametrize("group", sorted(FOOTNOTE_GROUPS))
    def test_every_group_declares_primaries_drawn_from_its_own_concepts(self, group):
        """A primary outside the group's own concept list could never resolve -- the card would be
        permanently `na` and nothing would say why."""
        primaries = footnote_primary(group)
        assert primaries, f"{group} declares no primary concept"
        assert set(primaries) <= set(footnote_concepts(group))


class TestAbsenceIsExplained:
    def test_an_empty_group_carries_a_reason_and_its_coverage(self):
        result = build_footnote_group([], 320193, "tax_reconciliation", 2025, "FY")
        assert result["status"] == "na"
        assert result["reason"]
        assert result["lines"] == []
        # 0.96 of filers publish a tax reconciliation; 0.04 publish capitalised R&D. A blank card
        # means very different things at those two ends, and this number is what separates them.
        assert result["coverage"] == FOOTNOTE_GROUPS["tax_reconciliation"][2]

    def test_an_absent_concept_is_omitted_NOT_zero(self):
        """The rule the whole product rests on: a missing value never renders as 0."""
        group = "tax_reconciliation"
        result = build_footnote_group(
            [_fact(_tag_for(footnote_primary(group)[0]), 0.21, unit="pure")],
            320193,
            group,
            2025,
            "FY",
        )
        assert result["status"] == "ok"
        assert all(line.value is not None for line in result["lines"])
        assert len(result["lines"]) < len(footnote_concepts(group))

    def test_an_unknown_group_says_so_rather_than_returning_an_empty_card(self):
        result = build_footnote_group([_fact("Assets")], 320193, "not_a_group", 2025, "FY")
        assert result["status"] == "na"
        assert "not_a_group" in (result["reason"] or "")


class TestPeriodAndProvenance:
    def test_facts_from_another_period_do_not_leak_in(self):
        group = "tax_reconciliation"
        tag = _tag_for(footnote_primary(group)[0])
        facts = [_fact(tag, 0.21, unit="pure", fiscal_year=2024)]
        assert build_footnote_group(facts, 320193, group, 2025, "FY")["status"] == "na"

    def test_the_latest_filed_restatement_wins_and_provenance_survives(self):
        """Restatements are never deleted; the newest FILING is what "current" means."""
        group = "tax_reconciliation"
        tag = _tag_for(footnote_primary(group)[0])
        facts = [
            _fact(tag, 0.21, unit="pure", accession="0000320193-25-000001", filed="2025-10-30"),
            _fact(tag, 0.19, unit="pure", accession="0000320193-26-000009", filed="2026-01-29"),
        ]
        result = build_footnote_group(facts, 320193, group, 2025, "FY")
        assert result["lines"][0].value == 0.19
        assert result["lines"][0].source_tag == tag
        # Provenance is group-level -- a footnote card cites the FILING it came from, and the
        # newest-filed restatement is what "current" means.
        assert result["accession"] == "0000320193-26-000009"
        assert result["filed"] == "2026-01-29"


class TestRouteResolvesTheAnnualPeriod:
    """Asked for a QUARTER, an annual disclosure must not be reported as an absence.

    A filer publishes its debt maturity ladder once a year. "Not disclosed in Q1" is true of the
    quarter and false about the filer -- the same class of mistake as reading an absence over
    EDGAR's rolling window as an absence over history.
    """

    def _facts(self):
        tag = _tag_for(footnote_primary("tax_reconciliation")[0])
        return [
            _fact(tag, 0.21, unit="pure", fiscal_year=2024),
            _fact(tag, 0.19, unit="pure", fiscal_year=2025),
            _fact("Assets", fiscal_year=2026, fiscal_period="Q1"),
        ]

    async def _call(self, facts, **kwargs):
        from secfin.api import routes as routes_module

        async def _facts_for_cik(repo, client, cik):
            return facts

        async def _cik_from_symbol(client, cache, symbol):
            return 320193

        orig_facts = routes_module._facts_for_cik
        orig_cik = routes_module._cik_from_symbol
        routes_module._facts_for_cik = _facts_for_cik
        routes_module._cik_from_symbol = _cik_from_symbol
        try:
            return await routes_module.get_footnotes(
                symbol="AAPL", repo=None, ticker_cache=None, **kwargs
            )
        finally:
            routes_module._facts_for_cik = orig_facts
            routes_module._cik_from_symbol = orig_cik

    async def test_omitting_year_resolves_to_the_latest_annual_period(self):
        payload = await self._call(self._facts(), year=None, period="FY", groups=None)
        assert payload["fiscal_year"] == 2025
        tax = next(g for g in payload["groups"] if g["group"] == "tax_reconciliation")
        assert tax["status"] == "ok"

    async def test_an_explicit_year_is_still_honoured(self):
        payload = await self._call(self._facts(), year=2024, period="FY", groups=None)
        assert payload["fiscal_year"] == 2024

    async def test_a_period_with_nothing_on_file_is_a_404_not_a_silent_empty(self):
        from fastapi import HTTPException

        with pytest.raises(HTTPException) as exc:
            await self._call(self._facts(), year=None, period="Q3", groups=None)
        assert exc.value.status_code == 404

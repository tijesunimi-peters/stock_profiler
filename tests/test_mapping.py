"""Tests for the normalization layer (no network required)."""

from __future__ import annotations

from secfin.normalize import mapping as mapping_module
from secfin.normalize.mapping import candidate_tags, concept_for_tag
from secfin.normalize.schema import RawFact
from secfin.normalize.statements import build_statement


def test_tag_maps_to_concept():
    assert concept_for_tag("NetIncomeLoss") == "net_income"
    assert concept_for_tag("Assets") == "total_assets"
    assert concept_for_tag("SomeUnknownTag") is None


def test_candidate_tags_is_ordered():
    tags = candidate_tags("revenue")
    assert tags[0] == "RevenueFromContractWithCustomerExcludingAssessedTax"
    assert "Revenues" in tags


def _fact(tag: str, val: float, filed: str) -> RawFact:
    return RawFact(
        cik=320193,
        taxonomy="us-gaap",
        gaap_tag=tag,
        label=tag,
        unit="USD",
        value=val,
        period_start="2023-10-01",
        period_end="2024-09-28",
        fiscal_year=2024,
        fiscal_period="FY",
        form="10-K",
        filed=filed,
        accession="0000320193-24-000123",
    )


def test_build_statement_prefers_first_candidate():
    facts = [
        _fact("Revenues", 100, "2024-11-01"),
        _fact("RevenueFromContractWithCustomerExcludingAssessedTax", 383, "2024-11-01"),
        _fact("NetIncomeLoss", 97, "2024-11-01"),
    ]
    stmt = build_statement(facts, 320193, "income", 2024, "FY")
    revenue = next(line for line in stmt.lines if line.canonical_concept == "revenue")
    # first candidate in the mapping wins over "Revenues"
    assert revenue.value == 383
    assert revenue.source_tag == "RevenueFromContractWithCustomerExcludingAssessedTax"


def test_restatement_latest_filed_wins():
    facts = [
        _fact("NetIncomeLoss", 90, "2024-11-01"),
        _fact("NetIncomeLoss", 97, "2025-02-01"),  # later restatement
    ]
    stmt = build_statement(facts, 320193, "income", 2024, "FY")
    net = next(line for line in stmt.lines if line.canonical_concept == "net_income")
    assert net.value == 97


def test_empty_lines_still_carries_filing_metadata():
    """A filing that exists but has no facts mapping to this statement's concepts

    should still surface its form/filed/accession, so callers can distinguish this
    from a period with no filing at all (see api/routes.py's 404 vs. empty handling).
    """
    facts = [_fact("SomeUnmappedExtensionTag", 42, "2024-11-01")]
    stmt = build_statement(facts, 320193, "balance", 2024, "FY")
    assert stmt.lines == []
    assert stmt.accession == "0000320193-24-000123"
    assert stmt.filed == "2024-11-01"
    assert stmt.form == "10-K"


def test_no_facts_for_period_yields_no_metadata():
    facts = [_fact("NetIncomeLoss", 97, "2024-11-01")]  # only fiscal_year=2024
    stmt = build_statement(facts, 320193, "income", 2023, "FY")
    assert stmt.lines == []
    assert stmt.accession is None


def _column_fact(
    tag: str,
    val: float,
    start: str,
    end: str,
    *,
    fy: int = 2023,
    fp: str = "FY",
    filed: str = "2023-11-03",
    instant: str | None = None,
) -> RawFact:
    """A fact as companyfacts really tags it: fy/fp are the FILING's period, so one
    filing's comparative columns all share the same (fy, fp)."""
    return RawFact(
        cik=320193,
        taxonomy="us-gaap",
        gaap_tag=tag,
        label=tag,
        unit="USD",
        value=val,
        period_start=None if instant else start,
        period_end=None if instant else end,
        instant=instant,
        fiscal_year=fy,
        fiscal_period=fp,
        form="10-K",
        filed=filed,
        accession="0000320193-23-000106",
    )


def test_comparative_columns_never_shadow_the_primary_column():
    # Regression (found live 2026-07-16): a FY2023 10-K tags its FY2021/FY2022
    # comparative columns fy=2023/FY too; the statement must serve the FY2023 column,
    # not whichever fact dict order happened to keep (prod served AAPL FY2021 revenue
    # as "FY2023").
    facts = [
        _column_fact("RevenueFromContractWithCustomerExcludingAssessedTax", 365_817e6,
                     "2020-09-27", "2021-09-25"),
        _column_fact("RevenueFromContractWithCustomerExcludingAssessedTax", 394_328e6,
                     "2021-09-26", "2022-09-24"),
        _column_fact("RevenueFromContractWithCustomerExcludingAssessedTax", 383_285e6,
                     "2022-09-25", "2023-09-30"),
    ]
    stmt = build_statement(facts, 320193, "income", 2023, "FY")
    revenue = next(line for line in stmt.lines if line.canonical_concept == "revenue")
    assert revenue.value == 383_285e6
    assert stmt.period_end == "2023-09-30"
    assert stmt.period_start == "2022-09-25"


def test_discrete_quarter_beats_ytd_duration_sharing_the_same_end():
    # A Q3 10-Q carries both the 3-month quarter and the 9-month YTD duration, both
    # tagged fy/fp of the filing and both ending on the same date. A Q3 statement means
    # the discrete quarter.
    facts = [
        _column_fact("RevenueFromContractWithCustomerExcludingAssessedTax", 293_000e6,
                     "2023-01-01", "2023-09-30", fp="Q3"),  # 9-month YTD
        _column_fact("RevenueFromContractWithCustomerExcludingAssessedTax", 89_500e6,
                     "2023-07-01", "2023-09-30", fp="Q3"),  # discrete quarter
    ]
    stmt = build_statement(facts, 320193, "income", 2023, "Q3")
    revenue = next(line for line in stmt.lines if line.canonical_concept == "revenue")
    assert revenue.value == 89_500e6


def test_concept_reported_only_in_a_comparative_column_is_dropped_not_borrowed():
    # One statement never mixes periods: if a tag has no fact in the primary column,
    # its line is absent (documented gap), not silently filled from a prior year.
    facts = [
        _column_fact("RevenueFromContractWithCustomerExcludingAssessedTax", 383_285e6,
                     "2022-09-25", "2023-09-30"),
        _column_fact("NetIncomeLoss", 99_803e6, "2021-09-26", "2022-09-24"),  # comparative only
    ]
    stmt = build_statement(facts, 320193, "income", 2023, "FY")
    assert not any(line.canonical_concept == "net_income" for line in stmt.lines)


def test_balance_sheet_comparative_instant_is_not_served():
    # 10-K balance sheets carry the prior year-end instant too, same fy/fp.
    facts = [
        _column_fact("Assets", 352_755e6, "", "", instant="2023-09-30"),
        _column_fact("Assets", 352_583e6, "", "", instant="2022-09-24"),
    ]
    stmt = build_statement(facts, 320193, "balance", 2023, "FY")
    assets = next(line for line in stmt.lines if line.canonical_concept == "total_assets")
    assert assets.value == 352_755e6
    assert stmt.period_end == "2023-09-30"


def test_cover_page_instant_after_period_end_does_not_hijack_the_primary_column():
    # dei cover-page facts (e.g. shares outstanding as of the FILING date, weeks after
    # fiscal year-end) share the statement facts' (fy, fp). The primary column must be
    # anchored by the statement's own tags, not by whichever fact has the latest date.
    facts = [
        _column_fact("RevenueFromContractWithCustomerExcludingAssessedTax", 416_161e6,
                     "2024-09-29", "2025-09-27", fy=2025, filed="2025-10-31"),
        _column_fact("EntityCommonStockSharesOutstanding", 14_773e6, "", "",
                     fy=2025, filed="2025-10-31", instant="2025-10-17"),
    ]
    stmt = build_statement(facts, 320193, "income", 2025, "FY")
    revenue = next(line for line in stmt.lines if line.canonical_concept == "revenue")
    assert revenue.value == 416_161e6
    assert stmt.period_end == "2025-09-27"


def test_balance_sheet_keeps_dei_shares_without_letting_them_anchor_the_column():
    # Live regression (2026-07-16): EntityCommonStockSharesOutstanding (dei) is a real
    # candidate for shares_outstanding, dated as of the FILING (~3 weeks after FY-end).
    # Anchoring the primary column on it emptied the balance sheet down to that one
    # line. The dei fact must be served WITHOUT defining the statement's column.
    facts = [
        _column_fact("Assets", 359_241e6, "", "", fy=2025, filed="2025-10-31",
                     instant="2025-09-27"),
        _column_fact("Assets", 364_980e6, "", "", fy=2025, filed="2025-10-31",
                     instant="2024-09-28"),  # comparative year-end instant
        _column_fact("EntityCommonStockSharesOutstanding", 14_773_260_000, "", "",
                     fy=2025, filed="2025-10-31", instant="2025-10-17"),
    ]
    facts[-1].taxonomy = "dei"
    stmt = build_statement(facts, 320193, "balance", 2025, "FY")
    by_concept = {line.canonical_concept: line.value for line in stmt.lines}
    assert stmt.period_end == "2025-09-27"           # anchored by us-gaap, not dei
    assert by_concept["total_assets"] == 359_241e6   # primary, not the comparative
    assert by_concept["shares_outstanding"] == 14_773_260_000  # dei still served


# ------------------------------------------------------------------ depreciation & amortization


class TestDepreciationCandidates:
    """`depreciation_amortization` was missing the two commonest spellings of its own concept.

    Measured 2026-08-09 over the 16,920 companies in `raw_facts`: the concept resolved for 50.7%
    while the tags to reach 76.4% were already stored. `DepreciationAndAmortization` (5,997
    companies) and `Depreciation` (9,493 -- the single commonest variant) were simply not in the
    candidate list.
    """

    def test_the_exact_concept_match_is_a_candidate(self):
        assert "DepreciationAndAmortization" in candidate_tags("depreciation_amortization")

    def test_the_standard_cash_flow_tag_still_wins(self):
        # 7,997 companies resolve on it today and none of them may move.
        tags = candidate_tags("depreciation_amortization")
        assert tags[0] == "DepreciationDepletionAndAmortization"

    def test_the_exact_match_outranks_the_accretion_variant(self):
        """Accretion is neither depreciation nor amortization.

        Where a filer tags both, the tag that means exactly this concept should answer. 194
        companies move on this ordering and every one of them gains precision.
        """
        tags = candidate_tags("depreciation_amortization")
        assert tags.index("DepreciationAndAmortization") < tags.index(
            "DepreciationAmortizationAndAccretionNet"
        )

    def test_depreciation_alone_is_not_a_candidate_for_the_combined_line(self):
        """`Depreciation` excludes amortization, so it cannot fill a D&A line.

        Microsoft and Alphabet both tag `Depreciation` and `AmortizationOfIntangibleAssets`
        SEPARATELY and neither tags any combined variant. Listing `Depreciation` here would have
        put depreciation alone under a line labelled "Depreciation & Amortization" and understated
        Microsoft by its entire intangible amortization. Candidates are alternatives, never
        addends.
        """
        assert "Depreciation" not in candidate_tags("depreciation_amortization")

    def test_the_split_is_served_as_its_own_concepts(self):
        # 56.1% of filers tag `Depreciation`, 45.1% `AmortizationOfIntangibleAssets`. Serving the
        # split truthfully beats flattening it into a concept it does not mean.
        assert candidate_tags("depreciation") == ["Depreciation"]
        assert candidate_tags("amortization_of_intangibles") == ["AmortizationOfIntangibleAssets"]

    def test_a_filer_reporting_the_split_gets_both_lines_correctly_labelled(self):
        facts = [
            _column_fact("NetCashProvidedByUsedInOperatingActivities", 100.0,
                         "2022-10-01", "2023-09-30", fy=2023),
            _column_fact("Depreciation", 11.0, "2022-10-01", "2023-09-30", fy=2023),
            _column_fact("AmortizationOfIntangibleAssets", 4.0,
                         "2022-10-01", "2023-09-30", fy=2023),
        ]
        stmt = build_statement(facts, 320193, "cashflow", 2023, "FY")
        by = {x.canonical_concept: x for x in stmt.lines}
        assert by["depreciation"].value == 11.0
        assert by["depreciation"].label == "Depreciation"
        assert by["amortization_of_intangibles"].value == 4.0
        # The combined concept stays absent rather than being filled with the depreciation half.
        assert "depreciation_amortization" not in by

    def test_a_filer_reporting_the_combined_line_gets_only_that(self):
        facts = [
            _column_fact("NetCashProvidedByUsedInOperatingActivities", 100.0,
                         "2022-10-01", "2023-09-30", fy=2023),
            _column_fact("DepreciationDepletionAndAmortization", 19.0,
                         "2022-10-01", "2023-09-30", fy=2023),
        ]
        stmt = build_statement(facts, 320193, "cashflow", 2023, "FY")
        by = {x.canonical_concept: x for x in stmt.lines}
        assert by["depreciation_amortization"].value == 19.0
        assert by["depreciation_amortization"].source_tag == "DepreciationDepletionAndAmortization"
        assert "depreciation" not in by


# ------------------------------------------------------------------------------ preferred stock


class TestPreferredStockConcepts:
    """The preferred parenthetical: four quantities that look alike and are not interchangeable.

    Measured 2026-08-09 over the 16,920 companies in `raw_facts`: authorised 63.5%, par 59.1%,
    issued 55.2%, outstanding 52.2%. Of the 9,337 filers tagging issued, only 2,090 report a
    latest value above zero — 7,247 report exactly 0.
    """

    def _bs(self, *facts):
        base = _column_fact("Assets", 1000.0, "", "", fy=2023, instant="2023-09-30")
        stmt = build_statement([base, *facts], 320193, "balance", 2023, "FY")
        return {x.canonical_concept: x for x in stmt.lines}

    def test_each_quantity_is_its_own_concept(self):
        # None may be a candidate for another: substituting authorised where issued is missing
        # would report charter headroom as stock in issue.
        assert candidate_tags("preferred_stock_shares_authorized") == [
            "PreferredStockSharesAuthorized"
        ]
        assert candidate_tags("preferred_stock_shares_issued") == ["PreferredStockSharesIssued"]
        assert candidate_tags("preferred_stock_shares_outstanding") == [
            "PreferredStockSharesOutstanding"
        ]
        assert candidate_tags("preferred_stock_par_value") == [
            "PreferredStockParOrStatedValuePerShare"
        ]

    def test_authorized_is_never_a_candidate_for_issued(self):
        """Authorised is issuance headroom, not stock in issue.

        Walmart authorises 100,000,000 preferred shares and has issued 0. Filling an absent
        `issued` from `authorized` would turn that into a company with 100 million preferred
        shares outstanding.
        """
        for concept in (
            "preferred_stock_shares_issued",
            "preferred_stock_shares_outstanding",
            "preferred_stock_value",
        ):
            assert "PreferredStockSharesAuthorized" not in candidate_tags(concept)

    def test_a_disclosed_zero_is_served_as_zero(self):
        # 42.8% of filers report exactly 0 issued. The filer answered the question and the answer
        # was none -- dropping the row, or showing N/A, loses a real disclosure.
        lines = self._bs(
            _column_fact("PreferredStockSharesAuthorized", 100_000_000, "", "",
                         fy=2023, instant="2023-09-30"),
            _column_fact("PreferredStockSharesIssued", 0, "", "", fy=2023, instant="2023-09-30"),
        )
        assert lines["preferred_stock_shares_authorized"].value == 100_000_000
        assert lines["preferred_stock_shares_issued"].value == 0
        assert lines["preferred_stock_shares_issued"].value is not None

    def test_the_aggregate_liquidation_preference_is_not_the_per_share_one(self):
        """Same words, different quantities — and different units.

        `PreferredStockLiquidationPreferenceValue` is the aggregate in USD;
        `PreferredStockLiquidationPreference` is per share in USD/shares. Unioning them would
        report a per-share figure as a total. JPMorgan's aggregate is $20.1B — its 2,005,375
        shares at a $10,000 preference each — so the error would be four orders of magnitude.
        """
        tags = candidate_tags("preferred_stock_liquidation_preference")
        assert tags == ["PreferredStockLiquidationPreferenceValue"]
        assert "PreferredStockLiquidationPreference" not in tags

    def test_a_filer_with_real_preferred_reports_the_claim_ahead_of_common(self):
        lines = self._bs(
            _column_fact("PreferredStockSharesIssued", 2_005_375, "", "",
                         fy=2023, instant="2023-09-30"),
            _column_fact("PreferredStockLiquidationPreferenceValue", 20_100_000_000, "", "",
                         fy=2023, instant="2023-09-30"),
        )
        assert lines["preferred_stock_shares_issued"].value == 2_005_375
        assert lines["preferred_stock_liquidation_preference"].value == 20_100_000_000


# --------------------------------------------------------------------------- lease maturities


class TestLeaseMaturityLadder:
    """The lease ladder spans two accounting standards, and that is the whole difficulty.

    Measured 2026-08-09 over the 16,920 companies in `raw_facts`: ASC 842's tags reach 38.2%, the
    pre-842 minimum-rental tags 44.3%, the union 56.4%. 3,084 companies only ever filed the old
    form, 2,048 only the new, 4,411 span the 2019 transition.
    """

    def _rung(self, *facts):
        base = _column_fact("Assets", 1000.0, "", "", fy=2023, instant="2023-09-30")
        from secfin.normalize.statements import build_concept_group

        return build_concept_group([base, *facts], 320193, "lease_maturities", 2023, "FY")

    def test_both_eras_answer_the_same_rung(self):
        # A filer files one form or the other depending on the year, so a rung that mapped only
        # one standard went blank for half the market.
        for concept, new, old in (
            ("lease_maturity_y1", "LesseeOperatingLeaseLiabilityPaymentsDueNextTwelveMonths",
             "OperatingLeasesFutureMinimumPaymentsDueCurrent"),
            ("lease_maturity_y2", "LesseeOperatingLeaseLiabilityPaymentsDueYearTwo",
             "OperatingLeasesFutureMinimumPaymentsDueInTwoYears"),
            ("lease_maturity_thereafter", "LesseeOperatingLeaseLiabilityPaymentsDueAfterYearFive",
             "OperatingLeasesFutureMinimumPaymentsDueThereafter"),
        ):
            tags = candidate_tags(concept)
            assert tags == [new, old], concept

    def test_asc_842_wins_a_year_that_tags_both(self):
        """In a transition year the recognised-liability disclosure is the operative one.

        Group resolution is per PERIOD, so this is decided year by year rather than once for the
        whole history -- a filer's 2017 ladder answers from the old tag and its 2023 ladder from
        the new one.
        """
        group = self._rung(
            _column_fact("LesseeOperatingLeaseLiabilityPaymentsDueNextTwelveMonths", 500.0,
                         "", "", fy=2023, instant="2023-09-30"),
            _column_fact("OperatingLeasesFutureMinimumPaymentsDueCurrent", 400.0,
                         "", "", fy=2023, instant="2023-09-30"),
        )
        line = next(x for x in group["lines"] if x.canonical_concept == "lease_maturity_y1")
        assert line.value == 500.0
        assert line.source_tag == "LesseeOperatingLeaseLiabilityPaymentsDueNextTwelveMonths"

    def test_a_pre_842_filer_still_gets_a_ladder(self):
        # 3,084 companies only ever filed the old form. Mapping ASC 842 alone would have left
        # every one of them with an empty card and no way to tell that from a filer with no leases.
        group = self._rung(
            _column_fact("OperatingLeasesFutureMinimumPaymentsDueCurrent", 400.0,
                         "", "", fy=2023, instant="2023-09-30"),
            _column_fact("OperatingLeasesFutureMinimumPaymentsDue", 1800.0,
                         "", "", fy=2023, instant="2023-09-30"),
        )
        by = {x.canonical_concept: x.value for x in group["lines"]}
        assert by["lease_maturity_y1"] == 400.0
        assert by["lease_maturity_total"] == 1800.0

    def test_imputed_interest_is_asc_842_only(self):
        """It reconciles the ladder to the recognised liability, which pre-842 did not have.

        Total undiscounted payments LESS imputed interest equals `operating_lease_liabilities`.
        There was no such liability before ASC 842, so a pre-842 ladder cannot be checked this way
        and the two must never be netted against each other.
        """
        assert candidate_tags("lease_imputed_interest") == [
            "LesseeOperatingLeaseLiabilityUndiscountedExcessAmount"
        ]

    def test_the_ladder_is_not_the_lease_liability(self):
        # The rungs are UNDISCOUNTED. Summing them and calling it the liability overstates it by
        # the imputed interest -- which is exactly why that reconciling item is mapped beside them.
        assert "LesseeOperatingLeaseLiabilityPaymentsDue" not in candidate_tags(
            "operating_lease_liabilities"
        )
        assert "OperatingLeaseLiability" not in candidate_tags("lease_maturity_total")


class TestTheRegistriesAreWellFormed:
    """Structural guards. Each of these caught, or would have caught, a real silent failure."""

    def test_no_concept_key_is_defined_twice(self):
        """A duplicate key in a dict literal is legal Python and silently keeps the last one.

        `amortization_of_intangibles` was defined twice (2026-08-09) after being added to the
        cash-flow block without noticing it already sat in the income block. Both definitions
        happened to be identical so nothing moved — but the next edit to the first one would have
        been silently discarded, and nothing in the test suite would have said so.
        """
        import collections
        import pathlib
        import re

        source = pathlib.Path(mapping_module.__file__).read_text()
        start = source.index("CONCEPTS: dict[str, tuple[str, list[str]]] = {")
        body = source[start : source.index("\n}\n", start)]
        keys = re.findall(r'^\s{4}"([a-z0-9_]+)": ', body, re.M)
        dupes = [k for k, n in collections.Counter(keys).items() if n > 1]
        assert dupes == [], f"duplicate CONCEPTS keys: {dupes}"

    def test_every_statement_concept_exists(self):
        # A typo in STATEMENT_CONCEPTS would drop a line from a statement with no error at all.
        for statement, concepts in mapping_module.STATEMENT_CONCEPTS.items():
            for concept in concepts:
                assert concept in mapping_module.CONCEPTS, f"{statement}: {concept}"

    def test_every_grouped_concept_exists(self):
        registries = (
            mapping_module.FOOTNOTE_GROUPS,
            mapping_module.CAPITAL_GROUPS,
            mapping_module.OBLIGATION_GROUPS,
        )
        for registry in registries:
            for group, (_label, concepts, _cov, primaries) in registry.items():
                for concept in concepts:
                    assert concept in mapping_module.CONCEPTS, f"{group}: {concept}"
                # A primary that is not in the group's own concept list can never resolve, so the
                # card would be permanently `na` for a reason no one could see.
                for concept in primaries:
                    assert concept in concepts, f"{group}: primary {concept} not in its own group"

    def test_only_the_known_tags_are_shared_between_concepts(self):
        """A tag serving two concepts is legitimate here, but only in two documented shapes.

        Written as an allow-list rather than a ban: sharing a tag by ACCIDENT means a filer's
        single fact silently answers two questions, and any caller adding those concepts together
        double-counts it. The eight below are deliberate and fall into two patterns:

        * **A statement concept and a footnote-group concept over the same fact** — the group is a
          different card, not a different number, so both must resolve from the same tag.
        * **A combined basic-and-diluted figure** — a filer whose basic and diluted are equal tags
          one element for both, and both concepts should report it rather than one going blank.
        """
        import collections

        known = {
            # statement concept  <->  footnote-group concept
            "AllowanceForDoubtfulAccountsReceivable",
            "AllowanceForDoubtfulAccountsReceivableCurrent",
            "ContractWithCustomerLiability",
            "ContractWithCustomerLiabilityCurrent",
            "DeferredRevenueCurrent",
            "EffectiveIncomeTaxRateContinuingOperations",
            # one element reported for both basic and diluted
            "EarningsPerShareBasicAndDiluted",
            "WeightedAverageNumberOfShareOutstandingBasicAndDiluted",
        }

        owner = collections.defaultdict(list)
        for concept, (_label, tags) in mapping_module.CONCEPTS.items():
            for tag in tags:
                owner[tag].append(concept)
        shared = {t for t, cs in owner.items() if len(cs) > 1}

        assert shared - known == set(), f"newly shared tags: {sorted(shared - known)}"
        stale = sorted(known - shared)
        assert stale == [], f"no longer shared, drop these from the allow-list: {stale}"

"""Tests for the SQLite beneficial-ownership repository (no network).

See storage/beneficial_ownership_repository.py for why caching is keyed at filing
granularity rather than per reporting-person row.
"""

from __future__ import annotations

from secfin.normalize.schema import BeneficialOwnership, BeneficialOwnershipFilingMeta
from secfin.storage.sqlite_beneficial_ownership_repository import (
    SQLiteBeneficialOwnershipRepository,
)

CIK = 320193


def _owner(accession: str, owner_name: str, **overrides) -> BeneficialOwnership:
    fields = {
        "issuer_cik": CIK,
        "issuer_name": "Apple Inc.",
        "owner_name": owner_name,
        "form_type": "SCHEDULE 13G",
        "filed": "2026-06-01",
        "accession": accession,
        "percent_of_class": 5.5,
        "shares_beneficially_owned": 1000.0,
        "event_date": "2026-05-15",
    }
    fields.update(overrides)
    return BeneficialOwnership(**fields)


def test_empty_repo_has_zero_cached_filings():
    repo = SQLiteBeneficialOwnershipRepository(":memory:")
    assert repo.cached_filing_count(CIK) == 0
    assert repo.get_beneficial_ownership(CIK, limit=10) == []
    repo.close()


def test_upsert_stores_filing_and_its_rows():
    repo = SQLiteBeneficialOwnershipRepository(":memory:")
    filings = [BeneficialOwnershipFilingMeta("0001-1", "2026-06-01", "SCHEDULE 13G")]
    rows = [_owner("0001-1", "Vanguard Group Inc")]

    written = repo.upsert_beneficial_ownership(CIK, filings, rows)

    assert written == 1
    assert repo.cached_filing_count(CIK) == 1
    fetched = repo.get_beneficial_ownership(CIK, limit=10)
    assert len(fetched) == 1
    assert fetched[0].owner_name == "Vanguard Group Inc"
    assert fetched[0].accession == "0001-1"
    repo.close()


def test_re_upserting_a_known_filing_does_not_duplicate_rows():
    repo = SQLiteBeneficialOwnershipRepository(":memory:")
    filings = [BeneficialOwnershipFilingMeta("0001-1", "2026-06-01", "SCHEDULE 13G")]
    rows = [_owner("0001-1", "Vanguard Group Inc")]
    repo.upsert_beneficial_ownership(CIK, filings, rows)

    written_again = repo.upsert_beneficial_ownership(CIK, filings, rows)

    assert written_again == 0
    assert repo.cached_filing_count(CIK) == 1
    assert len(repo.get_beneficial_ownership(CIK, limit=10)) == 1
    repo.close()


def test_joint_filer_rows_in_same_filing_are_both_kept():
    # A jointly-filed Schedule 13D can produce several reporting-person rows sharing one
    # accession -- filing-level dedup only guards against re-storing the SAME filing
    # twice, not against storing multiple real rows within it.
    repo = SQLiteBeneficialOwnershipRepository(":memory:")
    filings = [BeneficialOwnershipFilingMeta("0003-1", "2026-05-05", "SCHEDULE 13D/A")]
    rows = [
        _owner("0003-1", "Reporting Person A", form_type="SCHEDULE 13D/A"),
        _owner("0003-1", "Reporting Person B", form_type="SCHEDULE 13D/A"),
    ]

    written = repo.upsert_beneficial_ownership(CIK, filings, rows)

    assert written == 2
    assert repo.cached_filing_count(CIK) == 1
    owners = {r.owner_name for r in repo.get_beneficial_ownership(CIK, limit=10)}
    assert owners == {"Reporting Person A", "Reporting Person B"}
    repo.close()


def test_zero_row_filing_still_counts_as_cached():
    repo = SQLiteBeneficialOwnershipRepository(":memory:")
    filings = [BeneficialOwnershipFilingMeta("0002-1", "2026-06-02", "SCHEDULE 13G/A")]

    written = repo.upsert_beneficial_ownership(CIK, filings, [])

    assert written == 0
    assert repo.cached_filing_count(CIK) == 1
    assert repo.get_beneficial_ownership(CIK, limit=10) == []
    repo.close()


def test_get_beneficial_ownership_orders_newest_filing_first():
    repo = SQLiteBeneficialOwnershipRepository(":memory:")
    filings = [
        BeneficialOwnershipFilingMeta("0001-1", "2026-01-01", "SCHEDULE 13G"),
        BeneficialOwnershipFilingMeta("0002-1", "2026-06-01", "SCHEDULE 13G/A"),
    ]
    rows = [_owner("0001-1", "Old Filer"), _owner("0002-1", "New Filer")]
    repo.upsert_beneficial_ownership(CIK, filings, rows)

    fetched = repo.get_beneficial_ownership(CIK, limit=10)
    assert [r.owner_name for r in fetched] == ["New Filer", "Old Filer"]
    repo.close()


def test_limit_returns_only_the_newest_n_filings_worth_of_rows():
    repo = SQLiteBeneficialOwnershipRepository(":memory:")
    filings = [
        BeneficialOwnershipFilingMeta("0001-1", "2026-01-01", "SCHEDULE 13G"),
        BeneficialOwnershipFilingMeta("0002-1", "2026-03-01", "SCHEDULE 13G/A"),
        BeneficialOwnershipFilingMeta("0003-1", "2026-06-01", "SCHEDULE 13G/A"),
    ]
    rows = [
        _owner("0001-1", "Filer A"),
        _owner("0002-1", "Filer B"),
        _owner("0003-1", "Filer C"),
    ]
    repo.upsert_beneficial_ownership(CIK, filings, rows)

    fetched = repo.get_beneficial_ownership(CIK, limit=2)
    assert [r.owner_name for r in fetched] == ["Filer C", "Filer B"]
    repo.close()


def test_different_issuers_are_isolated():
    repo = SQLiteBeneficialOwnershipRepository(":memory:")
    repo.upsert_beneficial_ownership(
        CIK,
        [BeneficialOwnershipFilingMeta("0001-1", "2026-01-01", "SCHEDULE 13G")],
        [_owner("0001-1", "Apple Owner")],
    )
    other_cik = 789019
    repo.upsert_beneficial_ownership(
        other_cik,
        [BeneficialOwnershipFilingMeta("0009-1", "2026-01-01", "SCHEDULE 13G")],
        [_owner("0009-1", "MSFT Owner", issuer_cik=other_cik, issuer_name="Microsoft")],
    )

    assert repo.cached_filing_count(CIK) == 1
    assert repo.cached_filing_count(other_cik) == 1
    assert [r.owner_name for r in repo.get_beneficial_ownership(CIK, limit=10)] == ["Apple Owner"]
    repo.close()


class TestTheFilingsSUBJECTOwnsTheRow:
    """The CIK whose /submissions/ we walked is not always the filing's subject.

    A company files 13G/13D about companies IT invests in, and those land in its own feed:
    NVIDIA's carries its 9.3% of Nebius Group and 11.5% of CoreWeave. Keying those rows on the
    walked CIK made them read as holders OF NVIDIA on NVIDIA's own blockholder card -- a confident
    wrong statement about who owns the company. Found 2026-08-06 while wiring §04.
    """

    NVDA, NEBIUS = 1045810, 1861449

    def test_a_filing_about_another_issuer_is_stored_under_that_issuer(self):
        repo = SQLiteBeneficialOwnershipRepository(":memory:")
        try:
            repo.upsert_beneficial_ownership(
                self.NVDA,
                [BeneficialOwnershipFilingMeta("acc-1", "2026-07-20", "SCHEDULE 13G")],
                [
                    _owner("acc-1", "NVIDIA Corporation", issuer_cik=self.NEBIUS,
                           issuer_name="Nebius Group N.V.", percent_of_class=9.3),
                ],
            )
            # Walked NVIDIA's feed, but the subject is Nebius -- so it is NOT an NVIDIA holder.
            assert repo.get_beneficial_ownership(self.NVDA, 10) == []
        finally:
            repo.close()

    def test_a_filing_about_this_issuer_is_kept(self):
        repo = SQLiteBeneficialOwnershipRepository(":memory:")
        try:
            repo.upsert_beneficial_ownership(
                self.NVDA,
                [BeneficialOwnershipFilingMeta("acc-2", "2026-04-28", "SCHEDULE 13G")],
                [
                    _owner("acc-2", "Vanguard Capital Management", issuer_cik=self.NVDA,
                           issuer_name="NVIDIA Corp", percent_of_class=7.31),
                ],
            )
            (row,) = repo.get_beneficial_ownership(self.NVDA, 10)
            assert row.owner_name == "Vanguard Capital Management"
            assert row.percent_of_class == 7.31
        finally:
            repo.close()

    def test_a_filing_with_no_subject_cik_falls_back_to_the_walked_one(self):
        # Older or malformed filings may not carry `issuerCik`. Dropping those would lose real
        # holders, so the walked CIK is the fallback -- the best available answer, not a guess.
        repo = SQLiteBeneficialOwnershipRepository(":memory:")
        try:
            repo.upsert_beneficial_ownership(
                self.NVDA,
                [BeneficialOwnershipFilingMeta("acc-3", "2025-01-30", "SCHEDULE 13G")],
                [_owner("acc-3", "Some Holder", issuer_cik=None)],
            )
            assert len(repo.get_beneficial_ownership(self.NVDA, 10)) == 1
        finally:
            repo.close()

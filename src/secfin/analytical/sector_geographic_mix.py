"""Sector GEOGRAPHIC-MIX batch (Sector Analytics v2, P6b).

Computes, per SIC group, the revenue-weighted domestic / international / other split by summing
individual companies' reported ASC 280 geographic revenue, and writes it to `sector_geographic_mix`
for `GET /v1/sectors/{group}/geographic-mix` to read.

Analytical, batch, offline -- NEVER on the live request path (CLAUDE.md guardrail 6). Unlike the
insider-flow batch, this one is PURE PYTHON (no DuckDB / no analytical extra needed): the geography
bucketing is a Python classifier and the bounded row count doesn't warrant DuckDB. It reads the raw
`dimensional_geo_facts` (via its repository) and the `cik -> SIC` map (via the company-profile
repository), joins them in Python (no cross-repo raw SQL), and writes results back through the
ordinary SQLite repository.

Honesty / method:
  * **Derived, revenue-weighted rollup:** a company contributes its own reported domestic /
    international / other DOLLARS (dollar-summing, not average-of-ratios), so larger companies weigh
    more. Label it derived at the endpoint.
  * **Reconcile-or-exclude:** a company whose geography members don't sum to its consolidated
    revenue within `reconcile_tolerance` is EXCLUDED and counted (`excluded_unreconciled_count`) --
    the spike's mixed-hierarchy blocker. A company that disclosed no geography at all is simply not
    covered (it lowers coverage), not counted as excluded.
  * **Bucketing is documented, not ad-hoc:** normalize/segment_geography.classify_geography_member.
    `other` (unclassifiable / residual) is SHOWN, never hidden -- domestic+international+other = the
    company's geo total.
  * **Coverage is recorded and honest for a BOUNDED ingest:** `companies_in_scope` is the companies
    in the group we ingested a consolidated total for (not the whole universe we didn't ingest);
    `revenue_covered_share` is covered consolidated revenue over in-scope consolidated revenue.
  * A group with zero covered companies produces NO row (the endpoint renders that as an honest N/A,
    never a fabricated 0%/100% split).

Run: `python -m secfin.analytical.sector_geographic_mix [--fiscal-year 2025] [--sic-digits 2]`
"""

from __future__ import annotations

import argparse
import logging
from collections import defaultdict
from datetime import date

from secfin.config import settings
from secfin.normalize.segment_geography import classify_geography_member
from secfin.storage.dimensional_geo_repository import DimensionalGeoRepository, DimensionalGeoRow
from secfin.storage.sector_geographic_mix_repository import SectorGeographicMixRow
from secfin.storage.sqlite_company_profile_repository import SQLiteCompanyProfileRepository
from secfin.storage.sqlite_dimensional_geo_repository import SQLiteDimensionalGeoRepository
from secfin.storage.sqlite_sector_geographic_mix_repository import (
    SQLiteSectorGeographicMixRepository,
)

logger = logging.getLogger(__name__)


class _CompanyMix:
    """One company's reconciled geo split for a fiscal year (the rollup's per-company unit)."""

    __slots__ = ("domestic", "international", "other", "consolidated", "has_geo")

    def __init__(self) -> None:
        self.domestic = 0.0
        self.international = 0.0
        self.other = 0.0
        self.consolidated: float | None = None
        self.has_geo = False

    @property
    def geo_total(self) -> float:
        return self.domestic + self.international + self.other


def _company_mixes(rows: list[DimensionalGeoRow]) -> dict[int, _CompanyMix]:
    """Reduce raw rows to one `_CompanyMix` per company, using the LATEST accession per company
    (proxy for latest filed -- restatements: latest wins, never delete priors upstream)."""
    # Pick the latest accession per cik first (max() is a stable proxy for later filings).
    latest_accession: dict[int, str] = {}
    for r in rows:
        if r.accession > latest_accession.get(r.cik, ""):
            latest_accession[r.cik] = r.accession
    mixes: dict[int, _CompanyMix] = defaultdict(_CompanyMix)
    for r in rows:
        if r.accession != latest_accession[r.cik]:
            continue  # ignore superseded / prior filings for this year
        m = mixes[r.cik]
        if r.is_consolidated:
            m.consolidated = r.value
            continue
        bucket = classify_geography_member(r.member)
        setattr(m, bucket, getattr(m, bucket) + r.value)
        m.has_geo = True
    return mixes


def compute_sector_geographic_mix(
    db_path: str,
    fiscal_year: int,
    sic_digits: int,
    reconcile_tolerance: float,
    as_of: str,
    min_companies: int,
) -> list[SectorGeographicMixRow]:
    """Roll up per-company geo splits into per-SIC-group revenue-weighted mixes (no writes)."""
    geo_repo: DimensionalGeoRepository = SQLiteDimensionalGeoRepository(db_path)
    profiles = SQLiteCompanyProfileRepository(db_path)
    try:
        rows = geo_repo.rows_for_fiscal_year(fiscal_year)
        mixes = _company_mixes(rows)
        # Resolve each company's SIC group; drop companies with no profile (excluded, no crash).
        sic_of: dict[int, str] = {}
        for cik in mixes:
            prof = profiles.get(cik)
            if prof and prof.sic and len(prof.sic) >= sic_digits:
                sic_of[cik] = prof.sic[:sic_digits]
    finally:
        geo_repo.close()
        profiles.close()

    # Per-group accumulators.
    dom: dict[str, float] = defaultdict(float)
    intl: dict[str, float] = defaultdict(float)
    oth: dict[str, float] = defaultdict(float)
    covered: dict[str, int] = defaultdict(int)
    in_scope: dict[str, int] = defaultdict(int)
    excluded: dict[str, int] = defaultdict(int)
    covered_rev: dict[str, float] = defaultdict(float)
    in_scope_rev: dict[str, float] = defaultdict(float)

    for cik, m in mixes.items():
        group = sic_of.get(cik)
        if group is None:
            continue
        if m.consolidated is None or m.consolidated <= 0:
            continue  # no consolidated total -> not in scope (can't reconcile or weight)
        in_scope[group] += 1
        in_scope_rev[group] += m.consolidated
        if not m.has_geo:
            continue  # disclosed no geography -> lowers coverage, not a reconcile failure
        rel = abs(m.geo_total - m.consolidated) / m.consolidated
        if rel > reconcile_tolerance:
            excluded[group] += 1  # geo members don't add up -> excluded and counted (AC-5)
            continue
        covered[group] += 1
        covered_rev[group] += m.consolidated
        dom[group] += m.domestic
        intl[group] += m.international
        oth[group] += m.other

    out: list[SectorGeographicMixRow] = []
    for group in sorted(covered):
        # A group needs `secfin_peer_min_size` COVERED companies, not one.
        #
        # This floor was missing until 2026-08-15, and the first real ingest showed exactly why:
        # SIC 60 (Depository Institutions) had ONE reconciling filer out of 55 in scope, covering
        # 5.5% of the group's revenue, and its split was published as "the sector's geographic
        # mix". Every sibling sector batch applies this same minimum, and every sector endpoint's
        # caveats already promise it in these words -- "Only groups meeting the minimum size are
        # shown; a smaller group is dropped, not shown as sparse or zero."
        #
        # Dropping is right rather than annotating: a coverage note under a confident-looking bar
        # is read after the bar, if at all. `revenue_covered_share` still rides on the groups that
        # DO clear the floor, because clearing it is not the same as being well covered.
        if covered[group] < min_companies:
            continue  # too thin to characterise a sector -> no row -> honest N/A at the endpoint
        scope_rev = in_scope_rev[group]
        out.append(
            SectorGeographicMixRow(
                peer_group=group,
                fiscal_year=fiscal_year,
                domestic=dom[group],
                international=intl[group],
                other=oth[group],
                unit="USD",
                company_count=covered[group],
                companies_in_scope=in_scope[group],
                excluded_unreconciled_count=excluded[group],
                revenue_covered_share=(covered_rev[group] / scope_rev) if scope_rev > 0 else 0.0,
                as_of=as_of,
            )
        )
    return out


def run_sector_geographic_mix(
    db_path: str,
    fiscal_year: int,
    sic_digits: int,
    reconcile_tolerance: float,
    as_of: str,
    min_companies: int,
) -> int:
    """Compute the mix then replace `sector_geographic_mix` wholesale. Returns the row count."""
    rows = compute_sector_geographic_mix(
        db_path, fiscal_year, sic_digits, reconcile_tolerance, as_of, min_companies
    )
    repo = SQLiteSectorGeographicMixRepository(db_path)
    try:
        repo.clear()  # full recompute -- a group that lost coverage must not linger as stale
        repo.bulk_upsert(rows)
    finally:
        repo.close()
    logger.info(
        "sector geographic mix done: %d group rows (FY%d, SIC %d-digit, min %d covered filers)",
        len(rows),
        fiscal_year,
        sic_digits,
        min_companies,
    )
    return len(rows)


def build_arg_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(
        description="Roll up per-company ASC 280 geographic revenue into a per-SIC-group "
        "revenue-weighted domestic/international/other mix (pure-Python batch job)."
    )
    p.add_argument(
        "--fiscal-year",
        type=int,
        default=None,
        help="Annual basis to roll up (default: the latest WELL-COVERED fiscal year ingested -- "
        "the newest year is always a thin leading edge, see the repository).",
    )
    p.add_argument("--sic-digits", type=int, default=None, help="Override SIC grouping granularity")
    return p


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    args = build_arg_parser().parse_args()
    fiscal_year = args.fiscal_year
    if fiscal_year is None:
        geo_repo = SQLiteDimensionalGeoRepository(settings.secfin_db_path)
        try:
            # NOT `fiscal_years()[0]`. The newest year present is always a thin leading edge of
            # early-FYE filers -- on the 2026-08-15 ingest that was 54 companies against FY2025's
            # 3,546 -- and rolling those up would have published a 54-company figure as the
            # market's. Same rule as /v1/sectors' own year default.
            fiscal_year = geo_repo.latest_well_covered_fiscal_year()
        finally:
            geo_repo.close()
        if fiscal_year is None:
            raise SystemExit(
                "no dimensional geo facts ingested -- run "
                "`python -m secfin.ingest.dimensional_backfill --quarter …` first"
            )
    run_sector_geographic_mix(
        settings.secfin_db_path,
        fiscal_year=fiscal_year,
        sic_digits=args.sic_digits or settings.secfin_peer_sic_digits,
        reconcile_tolerance=settings.secfin_geo_mix_reconcile_tolerance,
        min_companies=settings.secfin_peer_min_size,
        as_of=date.today().isoformat(),
    )


if __name__ == "__main__":
    main()

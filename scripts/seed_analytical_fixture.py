"""Seed synthetic peer data so the Metrics Phase 2 pipeline can be exercised offline.

The three real fixtures (AAPL/JPM/WMT) sit in three different SIC groups, so none reaches the
minimum peer-group size -- correct behavior, but it shows nothing. This seeds `company_profiles`
+ `metric_values` for a set of synthetic CIKs across TWO 2-digit SIC groups (each well above the
min size), with a spread of values per metric, so `analytical/peer_ranks.py` produces real
percentiles/z-scores and `/companies/{cik}/peers` returns them.

No network. Run against a throwaway DB:
    SECFIN_DB_PATH=./data/e2e.db python scripts/seed_analytical_fixture.py
then `python -m secfin.analytical.peer_ranks` and query /v1/companies/990001/peers.
"""

from __future__ import annotations

import os
from pathlib import Path

from secfin.storage.company_profile_repository import CompanyProfile
from secfin.storage.metric_value_repository import MetricValueRow
from secfin.storage.sqlite_company_profile_repository import SQLiteCompanyProfileRepository
from secfin.storage.sqlite_metric_value_repository import SQLiteMetricValueRepository

# Two synthetic industries (2-digit SIC), 6 companies each -> both clear a min size of 5.
# Deliberately NOT the SIC groups of the real AAPL(35)/JPM(60)/WMT(53) fixtures, so those three
# stay below min size (their /peers returns "insufficient peers") and don't mix into these.
_GROUPS = [
    ("7372", "Prepackaged Software", 990001),  # SIC 73 group
    ("2834", "Pharmaceutical Preparations", 990101),  # SIC 28 group
]
_PER_GROUP = 6
_YEAR, _PERIOD = 2024, "FY"
# Real engine metric keys (so labels/units resolve) with a monotone spread across the 6 members,
# so ranks are easy to eyeball (member i gets a higher value than member i-1).
_METRICS = [
    ("net_margin", "ratio", lambda i: 0.05 + 0.03 * i),
    ("roe", "ratio", lambda i: 0.08 + 0.02 * i),
    ("debt_to_equity", "ratio", lambda i: 0.2 + 0.15 * i),
]


def main() -> None:
    db_path = os.environ.get("SECFIN_DB_PATH", "./data/e2e.db")
    Path(db_path).parent.mkdir(parents=True, exist_ok=True)

    profiles = SQLiteCompanyProfileRepository(db_path)
    values = SQLiteMetricValueRepository(db_path)
    rows: list[MetricValueRow] = []
    n = 0
    try:
        for sic, desc, base_cik in _GROUPS:
            for i in range(_PER_GROUP):
                cik = base_cik + i
                profiles.upsert(
                    CompanyProfile(cik=cik, sic=sic, sic_description=desc, name=f"Synthetic {cik}")
                )
                for metric, unit, fn in _METRICS:
                    rows.append(
                        MetricValueRow(
                            cik=cik, fiscal_year=_YEAR, fiscal_period=_PERIOD,
                            metric=metric, value=float(fn(i)), status="ok", unit=unit,
                        )
                    )
                n += 1
        values.bulk_upsert(rows)
        print(
            f"seeded analytical fixture: {n} companies in {len(_GROUPS)} SIC groups, "
            f"{len(rows)} metric rows"
        )
        print(
            f"  try: python -m secfin.analytical.peer_ranks  then  "
            f"/v1/companies/{_GROUPS[0][2]}/peers?year={_YEAR}"
        )
    finally:
        values.close()
        profiles.close()


if __name__ == "__main__":
    main()

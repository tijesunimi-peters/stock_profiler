"""Phase-3 dimensional spike: extract revenue-by-segment views for a few companies
from the SEC Financial Statement Data Sets (DERA quarterly ZIPs) into the static JSON
that feeds the explorer's "Segments · spike" view.

This is SPIKE tooling, not pipeline code (docs/SPIKE_DIMENSIONAL.md is the deliverable;
docs/ROADMAP_DATA_DEPTH.md Phase 3 gates any productization). It exists so the extract
is reproducible and the method is documented in runnable form.

Usage (host, stdlib only; zips fetched separately with a compliant User-Agent):

    curl -H "User-Agent: $SEC_USER_AGENT" -o /tmp/2025q4.zip \
      https://www.sec.gov/files/dera/data/financial-statement-data-sets/2025q4.zip
    python scripts/spike_dimensional_extract.py /tmp/2025q4.zip /tmp/2026q1.zip \
      > src/secfin/api/static/spike_dimensional.json
"""

from __future__ import annotations

import csv
import io
import json
import re
import sys
import zipfile

# (cik, symbol, latest-FY 10-K fiscal end, prior end, revenue tag). The revenue tag
# varies per filer exactly like it does in companyfacts -- the same variant problem the
# canonical mapping solves; a productized pipeline would reuse mapping.py candidates.
TARGETS = {
    320193: ("AAPL", "20250930", "20240930", "RevenueFromContractWithCustomerExcludingAssessedTax"),
    21344: ("KO", "20251231", "20241231", "Revenues"),
    1141391: ("MA", "20251231", "20241231", "Revenues"),
}
FORMS = ("10-K", "10-K/A")
VIEWS = [("BusinessSegments", "Business segments"), ("Geographical", "Geography"), ("ProductOrService", "Products & services")]
OVERRIDES = {
    "IPhone": "iPhone", "IPad": "iPad", "US": "United States", "NonUs": "Non-US",
    "CN": "China", "OtherCountries": "Other countries",
    "EuropeMiddleEastAfrica": "Europe, Middle East & Africa", "A.Pacific": "Asia Pacific",
    "WearablesHomeandAccessories": "Wearables, Home & Accessories",
    "ValueAddedServicesAndSolutions": "Value-added services & solutions",
    "PaymentNetwork": "Payment network", "PaymentSolutions": "Payment solutions",
    "InternationalMarkets": "International markets",
}


def pretty(member: str) -> str:
    m = re.sub(r"(Segment|Member)$", "", member)
    return OVERRIDES.get(m) or re.sub(r"(?<=[a-z0-9])(?=[A-Z])", " ", m)


def parse_axes(segments: str) -> dict[str, str]:
    out: dict[str, str] = {}
    for pair in segments.rstrip(";").split(";"):
        if "=" in pair:
            k, v = pair.split("=", 1)
            out[k] = v
    return out


def main(zip_paths: list[str]) -> None:
    import os

    quarters = " + ".join(os.path.basename(p).replace(".zip", "") for p in zip_paths)
    adsh_to_cik: dict[str, int] = {}
    rows_by_cik: dict[int, list[dict]] = {cik: [] for cik in TARGETS}
    for path in zip_paths:
        with zipfile.ZipFile(path) as z:
            with z.open("sub.txt") as f:
                for row in csv.DictReader(io.TextIOWrapper(f, encoding="utf-8"), delimiter="\t"):
                    if int(row["cik"]) in TARGETS and row["form"] in FORMS:
                        adsh_to_cik[row["adsh"]] = int(row["cik"])
            with z.open("num.txt") as f:
                for row in csv.DictReader(
                    io.TextIOWrapper(f, encoding="utf-8", errors="replace"), delimiter="\t"
                ):
                    cik = adsh_to_cik.get(row["adsh"])
                    if cik is not None and row.get("segments"):
                        rows_by_cik[cik].append(row)

    spike: dict[str, dict] = {}
    for cik, (sym, fy_end, prior_end, rev_tag) in TARGETS.items():
        views: dict[str, list[dict]] = {}
        for axis, label in VIEWS:
            members: dict[str, dict] = {}
            for r in rows_by_cik[cik]:
                if r["tag"] != rev_tag or r["qtrs"] != "4":
                    continue
                axes = parse_axes(r["segments"])
                if axis not in axes or (set(axes) - {axis, "ConsolidationItems"}):
                    continue  # single-axis view only; ConsolidationItems qualifier tolerated
                if axes.get("ConsolidationItems") not in (None, "OperatingSegments"):
                    continue  # drop eliminations/corporate reconciling rows
                slot = members.setdefault(axes[axis], {})
                if r["ddate"] == fy_end:
                    slot["value"] = float(r["value"])
                elif r["ddate"] == prior_end:
                    slot["prior"] = float(r["value"])
            rows = [
                {"member": pretty(m), "value": v["value"], "prior": v.get("prior")}
                for m, v in members.items()
                if v.get("value") is not None
            ]
            rows.sort(key=lambda x: -x["value"])
            if rows:
                views[label] = rows
        geo = views.get("Geography", [])
        spike[sym] = {
            "fiscal_year": int(fy_end[:4]),
            "period_end": f"{fy_end[:4]}-{fy_end[4:6]}-{fy_end[6:]}",
            "revenue_tag": rev_tag,
            "consolidated_revenue": sum(r["value"] for r in geo) if geo else None,
            "source": "SEC Financial Statement Data Sets (DERA), " + quarters,
            "views": views,
        }
    json.dump(spike, sys.stdout, indent=1)


if __name__ == "__main__":
    main(sys.argv[1:])

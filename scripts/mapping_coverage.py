"""Measure how much of the stored fact corpus the canonical mapping actually claims.

Two directions, and the second is the one that keeps the first honest:

    FORWARD   for each canonical concept, how many companies resolve it under any
              candidate tag -- "our concepts reach N% of filers"
    INVERSE   of the tags and facts actually stored, what share any concept maps at
              all -- "we claim N% of what filers tag"

A mapping can define 161 concepts, cover the statement spine for 90%+ of companies, and
still leave most of the corpus unclaimed, because us-gaap's tail is enormous. Only the
inverse number says so, which is why both are reported.

The `top_unmapped_*` lists are the mapping worklist: the tags no concept claims, ranked
by how many companies use them and by row volume. `docs/tag_glossary.jsonl` is the
companion reference for deciding what a candidate tag MEANS before mapping it -- coverage
alone has repeatedly pointed at tags that look like a concept and are not (see
DATA_MODEL's depreciation and preferred-stock sections).

Run inside the api container -- it needs the DB, not the network. Piped over stdin like
`tag_glossary.py`, because the image bakes in `src/` and not `scripts/`. One full scan of
`raw_facts`, a few minutes at ~120M rows:

    docker compose run --rm -T -v "$PWD/data:/out" api \
        python - /out/mapping_coverage.json < scripts/mapping_coverage.py

Writes JSON and prints a summary. `docs/DATA_MODEL.md`'s "Measured coverage" section is
the last recorded run.
"""

from __future__ import annotations

import collections
import json
import sqlite3
import sys

from secfin.config import settings
from secfin.normalize.mapping import CONCEPTS, STATEMENT_CONCEPTS, candidate_tags


def main(out_path: str) -> None:
    db = settings.secfin_db_path
    conn = sqlite3.connect(f"file:{db}?mode=ro", uri=True)

    # One pass for (tag, cik) pairs. DISTINCT rather than GROUP BY per tag: the union of
    # ciks across a concept's candidate tags is what "does this filer resolve the concept"
    # means, and per-tag counts cannot be added to get it.
    print("scanning distinct (tag, cik) pairs ...", flush=True)
    tag_ciks: dict[str, set[int]] = collections.defaultdict(set)
    for tag, cik in conn.execute(
        "SELECT DISTINCT gaap_tag, cik FROM raw_facts WHERE value IS NOT NULL"
    ):
        tag_ciks[tag].add(cik)
    companies = len(set().union(*tag_ciks.values())) if tag_ciks else 0
    print(f"  {len(tag_ciks):,} tags over {companies:,} companies", flush=True)

    print("scanning fact rows per tag ...", flush=True)
    tag_rows = dict(conn.execute("SELECT gaap_tag, COUNT(*) FROM raw_facts GROUP BY gaap_tag"))
    total_rows = sum(tag_rows.values())
    print(f"  {total_rows:,} fact rows", flush=True)

    mapped_tags = {t for concept in CONCEPTS for t in candidate_tags(concept)}
    present = set(tag_ciks)
    unmapped = present - mapped_tags
    rows_mapped = sum(tag_rows.get(t, 0) for t in present & mapped_tags)

    concept_cov = {
        concept: len(set().union(*(tag_ciks.get(t, set()) for t in candidate_tags(concept))))
        for concept in CONCEPTS
    }

    # How many of the concepts a given company resolves -- the "across the companies"
    # answer, which a per-concept average hides.
    per_company: collections.Counter[int] = collections.Counter()
    for concept in CONCEPTS:
        for cik in set().union(*(tag_ciks.get(t, set()) for t in candidate_tags(concept))):
            per_company[cik] += 1
    counts = sorted(per_company.values())

    def pct(p: float) -> int:
        return counts[int(len(counts) * p)] if counts else 0

    out = {
        "companies": companies,
        "fact_rows": total_rows,
        "distinct_tags_in_store": len(present),
        "distinct_tags_mapped": len(present & mapped_tags),
        "distinct_tags_unmapped": len(unmapped),
        "rows_mapped": rows_mapped,
        "rows_unmapped": total_rows - rows_mapped,
        "concepts_total": len(CONCEPTS),
        "concepts_with_no_tag_present": sorted(k for k, v in concept_cov.items() if v == 0),
        "concept_coverage": dict(sorted(concept_cov.items(), key=lambda kv: -kv[1])),
        "statement_rollup": {
            st: {k: concept_cov.get(k, 0) for k in ks} for st, ks in STATEMENT_CONCEPTS.items()
        },
        "per_company_concepts": {
            "p10": pct(0.10), "p25": pct(0.25), "median": pct(0.50),
            "p75": pct(0.75), "p90": pct(0.90), "max": counts[-1] if counts else 0,
        },
        "top_unmapped_by_companies": sorted(
            ((t, len(tag_ciks[t]), tag_rows.get(t, 0)) for t in unmapped), key=lambda x: -x[1]
        )[:40],
        "top_unmapped_by_rows": sorted(
            ((t, len(tag_ciks[t]), tag_rows.get(t, 0)) for t in unmapped), key=lambda x: -x[2]
        )[:25],
    }

    with open(out_path, "w") as fh:
        json.dump(out, fh, indent=1)

    print(f"\nconcepts defined        {out['concepts_total']:>12,}")
    print(
        f"distinct tags claimed   {out['distinct_tags_mapped']:>12,}"
        f"  {100 * out['distinct_tags_mapped'] / len(present):5.1f}% of tags in store"
    )
    print(
        f"fact rows claimed       {rows_mapped:>12,}  {100 * rows_mapped / total_rows:5.1f}%"
    )
    print(f"per-company concepts    {out['per_company_concepts']}")
    print(f"\nwrote {out_path}")


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else "mapping_coverage.json")

# Spike — Dimensional data (segments / geography / products)

Phase 3 of `ROADMAP_DATA_DEPTH.md`, executed 2026-07-16 at operator direction, scoped
to three companies (AAPL, KO, MA) plus a prototype UI. **This spike does NOT approve
productization** — that stays a separate operator decision per the roadmap; this doc is
the evidence for it.

## What was built (all clearly labeled spike, all easily removable)

- `scripts/spike_dimensional_extract.py` — reproducible extraction from the SEC
  Financial Statement Data Sets (DERA quarterly ZIPs) to a static JSON.
- `src/secfin/api/static/spike_dimensional.json` — revenue disaggregated by business
  segment / geography / product for the three latest 10-Ks (FY2025 + prior-year
  comparatives). Static file, NOT an API surface.
- Explorer "Segments · spike" view — fourth statement chip on `/explorer`, fed by the
  static JSON, wrapped in a SPIKE banner stating the scope and that companyfacts
  carries no dimensional facts. Covered by the headless render check
  (`explorer-segments` shot).

## Source (a): SEC Financial Statement Data Sets (DERA) — MEASURED

- **Access/size:** one ZIP per calendar quarter of *filings*
  (`sec.gov/files/dera/data/financial-statement-data-sets/{yyyy}q{n}.zip`). Measured:
  2025q4 = 66MB compressed / `num.txt` 568MB uncompressed; 2026q1 = 85MB. A company's
  history spans many ZIPs (keyed by filed-date quarter, like our daily-index muscle,
  unlike companyfacts' per-company files).
- **Dimensional density (the headline):** of each 10-K's `num.txt` rows —
  AAPL 203/427 dimensional (48%), KO 329/596 (55%), MA 171/504 (34%).
  **Roughly half of a filing's numeric facts are dimensional and invisible to
  companyfacts.**
- **Shape:** `num.txt` is TSV with a `segments` column of `Axis=Member;` pairs, names
  pre-shortened by DERA (`Axis`/`Member` suffixes stripped, e.g.
  `BusinessSegments=AmericasSegment;ConsolidationItems=OperatingSegments;`). Fits the
  existing single-writer zip-ingest pattern with a trivial parser.
- **Fidelity checks (passed):** AAPL's five segment revenues sum EXACTLY to the
  416.161B consolidated revenue our fixtures assert; KO/MA geography views sum to
  their consolidated totals. Values cross-check companyfacts to the dollar.
- **Extraction wall-clock (measured):** filtered stream of one quarter's `num.txt`
  ≈ 60–90s in pure Python on the dev box. Whole-market ingestion would be a
  parse-everything pass per quarter (est. 5–15 min/quarter, ~70 quarters since 2009,
  plus ~4–6GB compressed download for full history) — comparable to the companyfacts
  bulk backfill in spirit and infrastructure.

### Problems found (the honest part)

1. **Mixed hierarchy levels on one axis.** AAPL's `ProductOrService` axis carries the
   `Product` (307B) and `Service` (109B) rollups AND their components (iPhone 210B,
   Mac, iPad, Wearables) as siblings — members sum to 723B, ~1.7× revenue. DERA does
   not carry parent→child structure (that's the presentation linkbase, explicitly a
   non-goal). Any served view must either detect rollups (fragile) or disclose the
   mixing — the spike UI shows share-of-total only when members sum to consolidated
   revenue (within 1%), and says why otherwise.
2. **Reconciling items need filtering.** Segment rows carry a
   `ConsolidationItems` qualifier (OperatingSegments vs eliminations/corporate);
   naive aggregation double-counts. The spike keeps only
   `OperatingSegments`-qualified (or unqualified) rows.
3. **Tag variance persists in dimensions.** AAPL disaggregates
   `RevenueFromContractWithCustomerExcludingAssessedTax`; KO/MA disaggregate
   `Revenues`. A product pipeline reuses the canonical mapping's candidate lists —
   dimensional data inherits the variant problem, it doesn't escape it.
4. **`segments` is truncated at 1024 chars** (DERA spec) — fine for the common axes,
   a fidelity ceiling for deeply-dimensional filers (banks' fair-value tables).
5. **Member labels are mangled identifiers** (`A.Pacific`,
   `WearablesHomeandAccessories`). The spike prettifies with a small override map;
   a product needs the label from `pre.txt`/taxonomy, or accepts identifier-ish labels.

## Source (b): full XBRL instance documents — ASSESSED, NOT EXECUTED

Maximum fidelity (full member QNames, typed dimensions, no truncation, filing-day
freshness vs DERA's quarterly cadence) but: per-filing discovery + download (~5–10MB
XML each), an XBRL context-resolution parser (new dependency or nontrivial hand-rolled
code), and no bulk path — whole-market means millions of documents. Nothing in this
spike needed that fidelity. Revisit only if 1024-char truncation or label quality
becomes a real product blocker.

## Recommendation

**Source (a), if and when Phase 3 is funded.** It fits existing infrastructure
(bulk-zip ingest, single-writer pipeline), cross-checks companyfacts exactly, and its
known limitations are disclosable rather than disqualifying. Schema sketch for that
future decision: a `dimensional_facts` table keyed
`(cik, accession, tag, ddate, qtrs, unit)` with normalized `(axis, member)` pairs in a
child table (or a canonical `segments` string + index), behind its own repository;
serving via a `dimensions=` variant of the normalized-facts endpoint. Explicitly out
of spike scope: presentation hierarchy, non-revenue dimensional views (they work the
same way — KO's per-segment operating income is already in the extract), quarterly
periods.

## Sequencing

Unchanged from the roadmap: productization is an operator decision with this doc in
hand, competing with other post-launch work. Until then the spike UI stays a
three-company static demo, and the positioning rule stands — **do not promise
segments.**

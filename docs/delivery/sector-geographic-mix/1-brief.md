# P6b — Sector Geographic revenue mix (ASC 280) — Product brief

Stage 1 (Product Manager) handoff. Task slug: `sector-geographic-mix`.
Source of truth: `docs/ROADMAP_SECTOR_APP_V2.md` P6 (operator decision 2026-07-24: build both P6
spikes, Insider flow first — **✅ P6a DONE @ master b0a12ba** — then Geographic mix), the executed
`docs/SPIKE_DIMENSIONAL.md`, and `docs/ROADMAP_DATA_DEPTH.md` Phase 3. State in
`docs/delivery/_active.md`.

## Spike-decision gate — RESOLVED

`ROADMAP_DATA_DEPTH.md` Phase 3 says dimensional data "must not be started without the spike's
decision." That gate is now cleared, on the record:

- The **spike was executed** (`docs/SPIKE_DIMENSIONAL.md`, 2026-07-16): a hands-on AAPL/KO/MA
  extract from the SEC Financial Statement Data Sets (DERA) + a labeled static "Segments · spike"
  prototype. It **recommends source (a) DERA** if/when Phase 3 is funded, with a concrete schema
  sketch, and documents the honest blockers (hierarchy mixing, reconciling-item filtering, tag
  variance, 1024-char truncation, mangled member labels).
- The **operator's 2026-07-24 decision to build P6b** (this `/deliver`) **is the go-decision** on
  productizing the spike. This brief scopes that build; it does not silently start ahead of the
  gate.

This is **Track 1** — ASC 280 geographic revenue is *structured XBRL*, not Track-2 free text — but
it is the deliberately-larger "dimensional-data" work: **a NEW ingest pipeline**, not a mapping
extension (companyfacts carries only non-dimensional/consolidated facts; ~half of a 10-K's numeric
facts are dimensional and invisible to it — measured in the spike).

## Problem / user

The Sector view's **Geographic revenue mix** card is an honest placeholder ("segment (ASC 280)
data isn't ingested or aggregated by sector yet — no figures shown"). A user comparing sectors on
the paper-terminal app sees health scores, decomposition, dispersion, and now (P6a) real insider
flow — but the one *structural* signal they expect next to those is missing: **how domestic vs
international is this sector's revenue?**

Unlike P6a (which reused already-ingested per-CIK insider data as a thin aggregation layer), this
figure has **no ingested source at all**. It requires a new dimensional-XBRL ingest, geography
normalization (the moat and the risk), and a per-sector revenue-weighted rollup. This brief makes
the placeholder real for the sectors we can cover, and keeps an honest **N/A** for those we can't.

**Who it serves:** an analyst/developer using the Sector view to characterize a SIC sector; "we'd
know it's solved" when the Geographic-mix card shows a real, correctly-caveated domestic vs
international revenue split for sectors we have ASC 280 data for, with a visible **coverage** figure,
and an honest **N/A** (never `0%` / never a fabricated split) for sectors we don't.

## Operator decisions (locked 2026-07-24)

- **Geography taxonomy = binary Domestic (US) vs International, + an `other/unclassified` bucket.**
  The card shows a per-sector **domestic % / international %** split (with the unclassified remainder
  shown, not hidden). US is always identifiable; everything else non-US → international; genuinely
  ambiguous members (regions/eliminations/unmappable) → `other/unclassified`, disclosed not dropped.
  Chosen over a region set (US/EMEA/APAC/…) because filers disclose geography inconsistently — the
  binary is the most robust, highest-coverage, cleanest-honesty option, and the region set's mapping
  fragility lowers coverage. The bucketing **must be principled + documented** (a rules doc /
  mapping module, mirroring `normalize/geography.py`'s existing `classify_location`), not ad-hoc.
- **Ingest scope = bounded, latest annual.** Ingest the most recent ~1–2 annual periods' worth of
  DERA quarterly ZIPs (~4–8 ZIPs) — enough to populate sectors with real, correctly-caveated recent
  annual geo splits **now**. A whole-market/full-history DERA backfill (~70 ZIPs, ~4–6GB, hours) is
  explicitly a **later ops decision, not this build's gate** — same "make it real, don't gate on a
  market-wide backfill" stance as P6a. The coverage caveat + coverage figure carry the gaps honestly.
- **Source = (a) SEC Financial Statement Data Sets (DERA)**, per the spike's recommendation — bulk
  quarterly ZIPs whose `num.txt` carries a `segments` (`Axis=Member;`) column; fits our existing
  single-writer zip-ingest muscle. NOT source (b) per-filing XBRL instance parsing (out of scope).

## Scope (smallest slice that delivers value)

Full-stack, **backend first**, one branch off `master` (P6a merged @ b0a12ba).

1. **New dimensional-XBRL ingest (DERA, bounded).** A new ingest path that streams the bounded set
   of DERA quarterly ZIPs' `num.txt`, keeps only **geographic-revenue** dimensional rows (the ASC 280
   geography axis on a revenue tag — reusing the canonical revenue candidate-tag list, since tag
   variance persists in dimensions per the spike), filters **reconciling items** (keep
   `OperatingSegments`-qualified / unqualified; drop eliminations/corporate), and persists them to a
   new **dimensional-facts store** behind its own repository interface. Route the bulk parse through a
   **single-writer** queue (guardrail 8). SEC compliance untouched (User-Agent + process-wide throttle
   on any fetch; the DERA downloader mirrors `ingest/downloader.py`'s User-Agent guard).
2. **Geography normalization (the moat).** A principled, documented classifier mapping a dimensional
   row's geography member → `{domestic | international | other}`. Reuses `US_STATE_CODES` /
   country-code intuition where it applies; documents its rules (like `normalize/geography.py`). Also
   handles the spike's **hierarchy-mixing** blocker: only aggregate a company's geo split when its
   geographic members reconcile to the consolidated revenue within a stated tolerance (~1%); otherwise
   that company is **excluded and counted as excluded**, not silently mis-summed.
3. **Per-sector revenue-weighted rollup batch (analytical/offline).** Aggregate the per-company
   domestic/international/other revenue into per-**SIC-group** totals, **revenue-weighted** (a company
   contributes its own reported geo dollars; larger companies weigh more — document the weighting),
   into a new materialized store (a `sector_geographic_mix` table + repository, mirroring
   `sector_insider_flow_repository` from P6a). DuckDB/analytical **batch-only** or pure-Python — never
   the request path. Records the **coverage** (share of the sector's companies / sector revenue that
   disclosed usable ASC 280 geography) alongside the split.
4. **Read endpoint** `GET /v1/sectors/{group}/geographic-mix` — reads the materialized store **only**
   (like the sibling sector endpoints), returns the canonical JSON contract below. No SEC fetch, no
   DuckDB, no raw SQL on the request path; DB behind a repository interface.
5. **Wire the app panel.** Replace `geoPlaceholderHtml()` in `sectorapp.js` (and flip
   `geoInsiderRowHtml`'s "Geo stays a placeholder" comment) with a real card consuming the endpoint:
   domestic/international/other split + coverage figure + derived/coverage caveats. N/A state when the
   sector has no usable data. Styling mirrors the sibling `insiderCardHtml` (solid `.pa-card`,
   value-neutral — geography is not good/bad, so no green/red verdict coloring).

## Out of scope (do not build)

- **No whole-market / full-history DERA backfill** as a gate for this deliverable (bounded latest
  annual only; full backfill is a later ops call). No source (b) per-filing XBRL instance parsing.
- **No region-level taxonomy** (US/EMEA/APAC/…) — binary domestic/international (+ other) only, per
  the locked decision.
- **No non-geography dimensional views** — no revenue-by-business-segment, no by-product, no
  per-segment operating income. Geography revenue split only. (The spike notes those work the same
  way; they are separate future work.)
- **No presentation-linkbase / parent→child hierarchy reconstruction** (explicit `ROADMAP_DATA_DEPTH`
  non-goal). Hierarchy mixing is handled by the reconcile-or-exclude rule, not by rebuilding trees.
- **No per-company geo drill in the sector card** — sector aggregate only (a company-level segments
  view is separate; the labeled static spike stays as-is, untouched).
- **No Track-2 / free-text / LLM** — no narrative on *why* a sector is domestic/international.
- **No price/market-data enrichment** — revenue values are the reported ASC 280 dimensional dollars.
- **The existing labeled static "Segments · spike"** (`/explorer`, `spike_dimensional.json`,
  `renderSpikeSegments`) is **not touched** by this task — it remains a separate three-company demo.

## Acceptance criteria (what QA will verify)

**Ingest / dimensional store**
- **AC-1** A new ingest path reads DERA `num.txt` and persists **geographic-revenue** dimensional
  rows to a new store behind a repository interface. A fixture `num.txt` slice yields rows carrying
  the normalized `(axis, member)` geography pair, the revenue tag, value, unit, period (ddate/qtrs),
  cik, and accession — nothing derived, provenance intact.
- **AC-2** Only geography-axis rows on a **revenue** tag are ingested; **reconciling items** are
  filtered (rows qualified `OperatingSegments` or unqualified are kept; eliminations/corporate are
  dropped). A fixture proves a naive-sum double-count is avoided.
- **AC-3** The bulk parse routes through a **single-writer** queue — parsers do not open the DB
  (guardrail 8). Ingest scope is the bounded latest-annual set; it does not require the whole-market
  backfill to produce a populated result.

**Geography normalization (the moat)**
- **AC-4** A documented classifier maps a geography member → `{domestic | international | other}`:
  US/United-States-family → domestic; identifiable non-US country/region → international; ambiguous /
  unmappable / region-rollups / non-geographic → `other`. The rules live in code + a doc (mirroring
  `normalize/geography.py`), not ad-hoc inline literals. Fixtures cover a US member, a foreign-country
  member, and an unmappable member landing in each bucket.
- **AC-5** A company whose geographic members do **not** reconcile to its consolidated revenue within
  the stated tolerance (~1%) is **excluded** from the rollup and **counted as excluded** (the
  spike's hierarchy-mixing blocker) — it is never silently mis-summed into the sector split.

**Rollup batch**
- **AC-6** The batch aggregates per-company domestic/international/other revenue into per-**SIC-group**
  totals, **revenue-weighted**, grouped by the same `peer_basis` (`SIC {n}-digit`) the sibling sector
  endpoints use, reading SIC from `company_profiles`; a company with no SIC profile is excluded and
  does not crash the batch. Values are raw reported USD (no silent rescaling).
- **AC-7** The batch records a **coverage** measure per group — the share of the sector's companies
  (and/or the sector's consolidated revenue) that disclosed usable ASC 280 geography — stored
  alongside the split. Batch is offline/analytical (DuckDB or pure-Python), never on the request path.

**Endpoint / contract**
- **AC-8** `GET /v1/sectors/{group}/geographic-mix` returns 200 with: `group`, `peer_basis`,
  `period` (the annual basis + start/end), `has_data`, a `mix` of `{domestic, international, other}`
  as **both** reported USD amounts **and** shares (%), `unit` ("USD"), `coverage`
  (companies-covered / total + revenue-covered share), `company_count`, `excluded_unreconciled_count`,
  and `as_of`. It reads **only** the materialized store — no SEC fetch, no DuckDB, no raw SQL on the
  request path.
- **AC-9** A sector with **no** usable ASC 280 geography data returns an honest empty payload
  (`has_data: false`, mix fields `null`, a clear "no data" indicator) — **never** a fabricated
  `0%`/`100%` split presented as a confirmed result.
- **AC-10** A group that isn't a valid/covered SIC group behaves consistently with the other
  `/v1/sectors/{group}/*` endpoints (same not-found / empty semantics).

**UI (Sector view · Geographic revenue mix card)**
- **AC-11** The placeholder card is replaced by a real card showing the domestic / international /
  other split (%, with the underlying being revenue-weighted), the **coverage** figure, and the
  annual-period label. Values render via the shared formatters; the split is visually value-neutral
  (geography is not good/bad — no green/red verdict coloring, matching `insiderCardHtml`).
- **AC-12** A sector with no usable data renders a clear **N/A / no-geographic-data** state —
  **never `0%`** and never a fabricated split. Loading and error states are handled (no bare
  `undefined`/`NaN`).
- **AC-13** The card is theme-aware (light/dark), CSP-safe (no external assets), and matches the
  paper-terminal STYLE_GUIDE + the sibling scorecard cards (it sits in the same `.pa-geo-row` as the
  P6a insider card).

**Honesty (the brand — non-negotiable, baked into the above)**
- **AC-14** The card and the endpoint label the sector figure as a **DERIVED, revenue-weighted
  aggregate rollup** (computed by summing per-company reported ASC 280 geographic revenue).
- **AC-15** Caveats carried, in copy the user can see: (a) **coverage** — not every company discloses
  ASC 280 geography; the split reflects only companies that did, and the coverage figure is shown;
  (b) **normalization** — domestic/international is our principled bucketing of inconsistent filer
  geography labels (a documented rule, not a filer-reported field); (c) **reconciliation** — companies
  whose geo members don't reconcile to consolidated revenue are excluded and counted. The
  `other/unclassified` remainder is **shown, not hidden**.
- **AC-16** No individual company's geo split is exposed in the sector card; it is a sector aggregate.

**Regression / compliance**
- **AC-17** Existing sector endpoints/tests and the labeled static "Segments · spike" still pass /
  render unchanged (this task is additive). `pytest` green; Docker e2e render check green.
- **AC-18** SEC compliance untouched: any DERA fetch sends the descriptive User-Agent and respects
  the process-wide throttle; the aggregation is offline/batch and adds no live SEC calls to the
  request path.

## Risks / open decisions (for the architect)

- **D-1 (architect) — dimensional-facts store shape.** Per the spike sketch: a `dimensional_facts`
  table keyed `(cik, accession, tag, ddate, qtrs, unit)` with normalized `(axis, member)` (child
  table or indexed `segments` string), behind its own repository. Confirm whether P6b needs the full
  general dimensional store or a **geography-revenue-scoped** slice sufficient for this card (recommend
  the narrower slice now; leave the general store to a later phase). Also decide the `sector_geographic_mix`
  materialized-store shape (mirror `sector_insider_flow_repository`).
- **D-2 (architect) — DERA quarter selection + period alignment.** Which ~4–8 quarterly ZIPs, and how
  to pick each company's **latest annual (10-K)** geographic disclosure (DERA is keyed by filed-date
  quarter; a company's FY row may sit in any quarter's ZIP). Fiscal vs calendar; annual only (no
  quarterly geo). Document the choice; it drives the `period` field in the contract.
- **D-3 (architect) — geography member taxonomy source.** Member labels are mangled identifiers
  (spike blocker #5). Decide the classifier's input: the raw DERA member identifier + an override map,
  vs pulling labels from `pre.txt`/taxonomy. Recommend the identifier + documented override map now
  (accept identifier-ish edge cases), consistent with the bounded scope.
- **D-4 (architect) — reconciliation tolerance + the `other` bucket.** Confirm the ~1% reconcile
  tolerance (AC-5) and how `other/unclassified` revenue flows into the sector shares (shown as a third
  slice vs excluded from the denominator). Recommend: keep it in the denominator and **show it**, so
  domestic + international + other = 100% and nothing is hidden.
- **D-5 (architect) — weighting basis.** Revenue-weighted rollup: a company contributes its own
  reported domestic/international dollars, summed across the sector. Confirm this is dollar-summing
  (not an average-of-ratios), and how a company reporting only a partial geo split ("US" + a residual)
  is handled (recommend: its residual → `other`, and it counts toward coverage only if it reconciles).
- **D-6 (ops, not code) — demoable sector.** Whether to run the bounded ingest for a chosen SIC sector
  so the operator's 4b hands-on gate shows a populated card vs an honest N/A. Not a build gate; surface
  at QA/operator time (mirrors P6a's D-4). The ingest command should be documented in CLAUDE.md's
  "Common commands", like the other backfills.

## Handoff → Principal Architect

Design against the ACs above. Key constraints to honor: **Track-1 only**; source (a) **DERA**,
**bounded latest-annual** ingest (no whole-market gate); **binary domestic/international + other**
bucketing, **principled + documented**; DuckDB/analytical **batch-only** (endpoint reads a
materialized SQLite store like the sibling sector endpoints); dimensional ingest behind a repository
interface, **single-writer** bulk path, **no raw SQL in the API**; SEC compliance untouched
(User-Agent + process-wide throttle); **reconcile-or-exclude** for hierarchy mixing; **coverage shown**;
**N/A never 0%**; **derived revenue-weighted rollup labeled**, coverage + normalization caveats present.
Backend first (dimensional ingest + geography normalization + rollup batch + endpoint + pytest + JSON
contract), then wire `sectorapp.js`'s `geoPlaceholderHtml()` on the same branch. Interactive/data-driven
view → operator hands-on gate at 4b. The P6a insider card (`insiderCardHtml`, `sector_insider_flow`
repo) is the clean, recent precedent to copy for both the store shape and the card styling.

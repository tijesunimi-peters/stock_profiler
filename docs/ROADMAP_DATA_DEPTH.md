# Roadmap — Data Depth (raw facts, tier-2 concepts, dimensional data)

Separate workstream, opened 2026-07-16. Motivating fact (measured live that day): the
canonical schema maps **31 concepts**, while a single company's store already holds
**~500 distinct us-gaap tags** (AAPL: 503 tags, 466 unmapped — dividends, buybacks,
share-based compensation, working-capital deltas, PP&E, goodwill, deferred revenue...).
All of it is ingested and queryable internally; none of it is served. This roadmap is
the deliberate path from "we serve 31 curated concepts" to "we serve everything we
have, at the right level of promise for each layer."

**The layering principle (drives every decision below):** normalization is a promise —
a canonical concept means the same thing for every company, every year, and each one
costs real mapping research. Raw facts carry NO such promise, only provenance. Serve
both, never blur them: a raw fact is labeled as raw, a canonical concept earned its
name. (Same honesty rule as the rest of the product.)

## How to use this doc (for the implementing agent)

1. Read `CLAUDE.md`, `normalize/mapping.py`, `normalize/statements.py` (its module
   docstring documents the comparative-column trap — REQUIRED background for Phase 1's
   response semantics), and `docs/DATA_MODEL.md` first.
2. **Build order: Phase 1 → Phase 2 (demand-driven, per-concept) → Phase 3 (spike
   first, separately approved).** Phase 1 is concrete and ready. Phase 2 items are
   independent of each other — ship one concept at a time, driven by what users ask
   for in the support repo. Phase 3 must not be started without the spike's decision.
3. Guardrails 3–5 apply throughout: every new canonical concept updates `mapping.py`
   AND `docs/DATA_MODEL.md`; prefer mapping-table entries over company-specific hacks;
   no raw SQL in the API layer.

---

## Phase 1 — Raw-facts endpoint (concrete; small; pre- or at-launch)

**Status (2026-07-16): SHIPPED as specced** — `api/routes.py`'s `internal_router`
(admin-secret-gated, `include_in_schema=False`), tests in
`tests/test_raw_facts_route.py`, docs in `DATA_MODEL.md` + `DEPLOYMENT_DO.md` §5.
Internal-only per the operator decision below; the go-public question stays open.

`GET /v1/companies/{symbol}/facts` — serve the store's raw facts for one company,
audit fields and all. This is "show your work" promoted to an API surface: power users
self-serve the 466 tags we haven't canonicalized, without us promising normalization
we haven't done.

- **Params:** `tag=` (exact us-gaap/dei tag, repeatable), `year=` + `period=`
  (fiscal key, same semantics as /statements), optional `taxonomy=`. Require at least
  one filter (mirror `/v1/screen`'s "no unbounded scans" stance); paginate with
  `limit`/`offset`, default limit 100, cap ~1000.
- **Response rows** = the full RawFact shape: tag, taxonomy, label, value, unit,
  period_start/period_end/instant, fiscal_year/fiscal_period, form, filed, accession,
  frame, is_extension. Nothing derived, nothing dropped.
- **Document the fy/fp trap prominently** (this is the difference between a useful
  endpoint and a support burden): `fiscal_year`/`fiscal_period` are the FILING's
  period, so one (year, period) key contains the filing's comparative columns and
  YTD durations too. The docs must say "filter/aggregate by period_end/instant, not
  by fy alone" and link the methodology page. Consider echoing a `caveats` field like
  the 13F endpoints do.
- **Auth: INTERNAL-ONLY at first (operator decision 2026-07-16).** Gate behind
  `X-Admin-Secret` (`require_admin_secret`, like /v1/admin/ops), NOT behind customer
  keys, and keep it out of the public OpenAPI schema (`include_in_schema=False`).
  Whether it ever goes public is an open product question — raw facts without the
  normalization promise could confuse the positioning ("we sell the cleanup") and
  invite support burden from the fy/fp trap. Revisit with real user demand in the
  support repo. NOTE if it does go public: the free tier's published "rate-limited,
  not feature-limited" commitment (/guide) means it can't be a paid-only feature.
- **Serving path:** reuse the existing cache-aside `_facts_for_cik` (repo hit or SEC
  fetch + store). No new ingestion, no schema change, repository interface only.
- **Tests:** route wiring (auth, 404 unknown ticker, filter required), response
  fidelity against the real fixtures (assert a known unmapped tag round-trips, e.g.
  AAPL `PaymentsOfDividends`), pagination bounds.
- **Docs:** while internal-only: a DATA_MODEL section and an ops note in
  DEPLOYMENT_DO — no /guide row, no public OpenAPI entry. The marketing angle
  ("every number we didn't normalize is still yours to read, with provenance") is
  RESERVED until the go-public decision.

## Phase 2 — Tier-2 canonical concepts (demand-driven, one at a time)

**Status (2026-07-16): SHIPPED — all 15 candidates below landed as 18 canonical
concepts** (marketable securities split into `_current`/`_noncurrent`; deferred revenue
shipped as `deferred_revenue_current`), each verified per-concept against the three
fixture shapes before mapping. Decisions, structural absences, and the fy-column values
asserted in tests are recorded in `docs/DATA_MODEL.md`'s tier-2 worked example; the
unlocked metric candidates are queued in `ROADMAP_METRICS.md`'s backlog (not built,
per the note below). Further tier-2 concepts stay demand-driven.

Candidate list, grouped by statement, chosen for cross-company usefulness and clean
tag candidates. Each item = candidate-tag research across the three fixture shapes
(AAPL/WMT/JPM minimum) + `mapping.py` entry + `DATA_MODEL.md` row + fixture-test
assertions. Do NOT batch-ship without per-concept verification — wrong mappings are
worse than missing ones.

Income:
- `dividends_per_share` (CommonStockDividendsPerShareDeclared)
- `share_based_compensation` (ShareBasedCompensation — cashflow-adjacent but usually
  read with income)
- `comprehensive_income` (ComprehensiveIncomeNetOfTax)

Balance:
- `ppe_net` (PropertyPlantAndEquipmentNet)
- `goodwill` (Goodwill)
- `intangible_assets` (IntangibleAssetsNetExcludingGoodwill / FiniteLivedIntangibleAssetsNet)
- `accounts_payable` (AccountsPayableCurrent / AccountsPayableTradeCurrent)
- `deferred_revenue` (ContractWithCustomerLiabilityCurrent + noncurrent variants —
  needs a current/total decision, document it)
- `retained_earnings` (RetainedEarningsAccumulatedDeficit)
- `marketable_securities` (current/noncurrent variants — same decision)
- `operating_lease_liabilities` (OperatingLeaseLiabilityCurrent/Noncurrent)

Cash flow:
- `dividends_paid` (PaymentsOfDividends / PaymentsOfDividendsCommonStock)
- `share_repurchases` (PaymentsForRepurchaseOfCommonStock)
- `income_taxes_paid` (IncomeTaxesPaidNet)
- working-capital deltas (`change_in_receivables` / `_payables` / `_inventories` —
  IncreaseDecreaseIn*) — ship as a set, they're read together

Notes:
- Several unlock obvious Phase-2 metrics (payout ratio, buyback yield, SBC/revenue) —
  those belong in `ROADMAP_METRICS.md`; add them there when the concepts land, don't
  build metrics in this workstream.
- Bank/retailer shapes: run every new concept against the JPM/WMT fixtures and record
  the structural absences in DATA_MODEL like the existing concepts do.

## Phase 2b — Normalized tag-level layer + cluster-driven mapping (decided 2026-07-16)

Operator decisions that supersede the per-tag framing of Phase 2's "what next":

- **Normalized tag-level endpoint — SHIPPED PUBLIC:**
  `GET /v1/companies/{symbol}/normalized-facts` ("normalize without mapping") — the
  statement builder's mechanical defenses applied to every tag, no curation. See
  `DATA_MODEL.md`'s "Normalized tag-level view". This serves the breadth story; the
  canonical layer no longer chases per-tag completeness.
- **Canonical expansion is CLUSTER-DRIVEN:** canonicalize (a) statement-face concepts
  and (b) meaning-clusters of ≥2 variant tags whose combined coverage clears ~25% of
  ingested filers — worked from `docs/tag_glossary.jsonl` (meanings, not tag names),
  verified per-concept, shipped in tranches. Single-tag non-face elements stay
  tag-level. Est. ~80–120 new concepts from the current store.
  **Tranche 1 SHIPPED (2026-07-16):** 46 new concepts + 10 candidate extensions (95
  concepts total, 143 tags mapped), every multi-tag cluster verified store-wide for
  coexistence conflicts; one cluster REJECTED by that verification (the
  Depreciation/DepreciationAndAmortization family — see DATA_MODEL.md's tranche-1
  worked example, including the other exclusions). Remaining ≥25%-coverage unmapped
  tags are mostly footnote decomposition (SBC option detail, maturity schedules, tax
  reconciliation) — deliberately tag-level; further tranches demand-driven.

## Phase 3 — Dimensional data (segments/geography) — SPIKE FIRST, then decide

**Status (2026-07-16): SPIKE EXECUTED — see `docs/SPIKE_DIMENSIONAL.md`** (operator
directed a hands-on variant: AAPL/KO/MA extract from the DERA Financial Statement Data
Sets + a clearly-labeled prototype "Segments · spike" view on /explorer, fed by a
static JSON, not the API). Headline: ~half of a 10-K's numeric facts are dimensional
and invisible to companyfacts; values cross-check companyfacts exactly; the honest
blockers are hierarchy mixing on one axis and reconciling-item filtering.
Recommendation: source (a) if funded. **Productization remains UNDECIDED** — the
operator decision below still gates it.

What users will eventually ask for ("revenue by segment / by geography") **does not
exist in our current source**: the companyfacts API carries only non-dimensional
(consolidated) facts. Confirmed in the wild — do not promise segments until this
phase is deliberately funded.

- **Spike deliverable (a doc, not code):** compare the two structured sources that DO
  carry dimensions — (a) SEC "Financial Statement Data Sets" quarterly ZIPs (num.txt
  carries a segments column; bulk, structured, fits our zip-ingest muscle) vs (b)
  parsing full XBRL instance documents per filing (maximum fidelity, heaviest lift).
  Estimate: storage delta, ingest wall-clock, schema shape (dimension key design),
  and what fraction of filers report which axes. Recommend one or neither.
- Still Track 1 (structured data, no free text) — but it is a NEW INGESTION PIPELINE,
  not a mapping extension, and competes with other post-launch work. Operator
  decision with the spike doc in hand.

## Non-goals (do not drift here)

- **Presentation-linkbase hierarchy.** Real parent→child statement structure varies
  per filer; our hand-curated canonical shape IS the product (comparability). Don't
  ingest linkbases to reconstruct per-filer trees.
- **Track 2** (MD&A, footnote text, narratives) — unchanged; flag, don't build.
- **Prices/OHLCV** — unchanged, never.

## Sequencing vs launch

Phase 1 is safe pre-launch (additive, admin-gated, invisible to customers) and
useful immediately for operator debugging/mapping research; it contributes nothing to
the launch story while internal-only, by design. Phase 2 starts
after launch, paced by support-repo demand. Phase 3 only with demonstrated demand and
an approved spike.

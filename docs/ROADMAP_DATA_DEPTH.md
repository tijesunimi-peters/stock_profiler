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
- **Auth:** key-gated like other data endpoints, available on the free tier —
  "free is rate-limited, not feature-limited" is a published commitment (/guide).
- **Serving path:** reuse the existing cache-aside `_facts_for_cik` (repo hit or SEC
  fetch + store). No new ingestion, no schema change, repository interface only.
- **Tests:** route wiring (auth, 404 unknown ticker, filter required), response
  fidelity against the real fixtures (assert a known unmapped tag round-trips, e.g.
  AAPL `PaymentsOfDividends`), pagination bounds.
- **Docs:** OpenAPI tag + `/guide` endpoint table row + DATA_MODEL section. Marketing
  angle (positioning skill owns wording): "every number we DIDN'T normalize yet is
  still yours to read, with its provenance."

## Phase 2 — Tier-2 canonical concepts (demand-driven, one at a time)

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

## Phase 3 — Dimensional data (segments/geography) — SPIKE FIRST, then decide

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

Phase 1 is safe pre-launch (additive endpoint, no schema/ingest changes) and gives
the launch story a strong "and everything else is available raw" beat. Phase 2 starts
after launch, paced by support-repo demand. Phase 3 only with demonstrated demand and
an approved spike.

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

## Phase 3b — Generic filing index from `/submissions/` (DECIDED 2026-08-01, in build)

**One store, three consumers**, from a payload we already download on every company request.

`sec/insider.py:_recent_filings()` already walks `/submissions/`'s parallel arrays filtered to
Forms 3/4/5. Generalising that walk yields, per (cik, accession): `form` · `filingDate` ·
**`acceptanceDateTime`** · `accessionNumber` · **`items`** · `reportDate` · `primaryDocument`.

| consumer | what it takes |
|---|---|
| **V3-P5a §06 supply events** | existence + date of S-1/S-3/SC TO/Form 25/Form 15 — turns four *asserted* absences into *earned* ones |
| **V3-P5a §06 acceptance-lag histogram** | `acceptanceDateTime` − quarter end, per 13F-HR filer |
| **V3-P3** (`ROADMAP_APP_V3` §6) | 8-K `items` + acceptance timestamps — **the parallel track rides on this and stops being separate work** |

⚠️ **Existence and date only, never terms.** Lock-up length, tender price and share counts live in
the documents and their exhibits — prose, Track 2. A card built on this may say "no S-1/S-3 among
the N filings we scanned"; it may **not** say "no lock-up restrictions", which remains
unanswerable.

💡 Verified 2026-08-01 with our compliant User-Agent: AAPL's recent submissions carry `25-NSE`,
`S-3ASR`, `424B2`, `8-A12B`, `S-8` and 44 `144`s; a Vanguard 13F-HR carries
`acceptanceDateTime` alongside `filingDate` (they agree at day granularity, diverging only for
after-hours filings, where EDGAR assigns the next business day as the filing date).

## Phase 4 — The N-forms: N-PX (proxy votes) and N-PORT (fund holdings)

**Status: DECIDED to build later** (operator, 2026-08-01) — *"We will build on the N forms later
considering they exist on SEC EDGAR."* Not scheduled; recorded so the work is not re-derived.

**These are Track 1.** Both are structured XML on EDGAR. No HTML parsing, no LLM, no new base
dependency — they fit the existing `sec/` → `normalize/` → `storage/` → `serve` shape exactly the
way 13F and the ownership forms do.

### ✅ Verified against real filings, 2026-08-01 (fetched with our compliant User-Agent)

Not asserted — checked. Two recent accessions, their EDGAR directory listings read directly:

| form | accession | documents |
|---|---|---|
| **N-PX** | `0001104659-25-083022` (CIK 1006415, filed 2025-08-26) | `primary_doc.xml` 12 KB + **`proxytable.xml` 28.4 MB** |
| **NPORT-P** | `0001193125-26-232053` (CIK 356476, filed 2026-05-20) | `primary_doc.xml` 24 KB + `edgar.htm` |

**N-PX `proxytable.xml` element names, read off the filing:**
`issuerName` · `cusip` · `isin` · `meetingDate` · `voteDescription` · `voteCategory` ·
`categoryType` · **`howVoted`** · **`managementRecommendation`** · **`sharesVoted`** ·
`sharesOnLoan` · `voteSeries` · `voteSource` · `voteRecord` · `otherVoteDescription`

**NPORT-P `primary_doc.xml` holding fields, read off the filing:**
`name` · `cusip` · `isin` · `lei` · `title` · **`balance`** · `units` · `curCd` · **`valUSD`** ·
**`pctVal`** · `fairValLevel` · `securityLending` · `seriesName` · `seriesLei` · `regName` ·
`regLei`

### What each one unblocks

- **N-PX → V3-P5a §04's "Vote-weighted ownership"**, which currently renders an honest empty
  state. `howVoted` against `managementRecommendation`, weighted by `sharesVoted`, is *exactly*
  the "voted with management / voted against at least one item / no N-PX record" split the design
  asks for — and `cusip`/`isin` join straight to the existing CUSIP map.
- **N-PORT → §05's "Fund-level positions"**, also an honest empty state today. `seriesName` is the
  fund, `balance`/`units` the position, and **`pctVal` is the position as a percentage of the
  fund's portfolio** — the design's "% of fund" column, reported rather than derived. `valUSD` is
  market-derived and should stay excluded, which §05's copy already says.

### ⚠️ What it does NOT unblock

**8-K Item 5.07's certified meeting outcomes stay out of scope.** That is narrative HTML, and the
no-HTML-parsing rule is a standing decision rather than a backlog item — §04's voting card keeps
its empty state even after the N-forms land. The two gaps on that card are different in kind and
the copy says so deliberately.

### ⚠️ The scale problem, and it is the real design constraint

**One N-PX `proxytable.xml` was 28.4 MB.** A fund complex files one per series per year, and every
row is a vote on one ballot item at one meeting. This is a materially different ingest shape from
13F:

- It cannot be handled the way per-company cache-aside reads are — it needs a bounded backfill
  with a single writer, like `ingest/backfill.py` (guardrail 8).
- Streaming/iterative parsing, not `ET.fromstring` on the whole document.
- The useful subset is narrow: only votes whose `cusip`/`isin` resolves to an issuer we serve.
  **Filter on the way in, not after.**

N-PORT is the gentler of the two (tens of KB per filing) and is the sensible one to build first.

### Operator ruling that governs the interim (D-voting, widened 2026-08-01)

Until these land, **any structured-XML form family we do not ingest gets an honest empty state
whose copy says "not ingested yet"** — never "cannot be reported", and never a fabricated figure.
That ruling now covers the CLASS, not one form, so no fresh decision is needed for the next one.

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

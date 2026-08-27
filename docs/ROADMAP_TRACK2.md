# Roadmap — Track 2 (filing narrative)

**Status: active as of 2026-08-22 (operator decision, reversing the prior deferral recorded in
`CLAUDE.md` and `docs/TASKS.md` §5).** This is the pipeline design and UI-requirements inventory
that `CLAUDE.md`'s Track 2 section points at. Read that section first — it carries the ground
rules (cost discipline, normalized typed output, honest absence) that everything below must obey.

Source material: `docs/TRACK_2_DRAFT.md` (an external pipeline sketch — SQLite-per-quarter +
DuckDB) was the starting point. It is **not** followed as written: it assumes a storage shape
this project doesn't have (one SQLite file per fiscal quarter). Section 2 below adapts it onto
the single-operational-database architecture `CLAUDE.md` already commits to.

## 0. The zero-new-parser wins — do these first

The frontend inventory (`clearyfi_frontend/app/pages/sectors/QualitativeView.tsx`,
`app/data/api.ts`) turned up several fields the UI has been treating as permanently-Track-2 that
are actually **already-shipped Track 1 data** sitting one wiring step away from a real endpoint.
None of these need a document parser, a word list, or an LLM call — they need `sectorQualitative`
and the company `§06/§08` resolvers in `api.ts` to stop returning `qual.*` fixtures and start
calling endpoints that already exist:

| Fixture field | Real source | Why it isn't Track 2 |
|---|---|---|
| `CYBER.adopted/board/ciso/incidents8k` | `cyd:` XBRL flags via `sec/cover.py` + 8-K Item 1.05 via `filing_index` | Tagged booleans, not prose — `cover.py`'s own docstring distinguishes the flag from the narrative |
| `AUDITORS`, `AUDITOR_CHANGES`, `AUDITOR_TENURE` | `dei:AuditorName`/`AuditorFirmId` (`cover.py`) + 8-K Item 4.01 (`auditor_continuity.py`) | Already a shipped module; `api.ts` line 5138 says so explicitly |
| `DEFICIENT` (12b-25 late filing, 4.02 restatement) | `filing_index` form/item codes | Existence + dates, no text read. **Correction:** an earlier draft of this row also listed an "ICFR material weakness flag" — there is no such structured signal anywhere (`sec/cover.py`'s own docstring confirms the Item 9A conclusion is pure prose); dropped from this row, ships as 2 fields not 3 |
| Human-capital **headcount** (as distinct from the human-capital *narrative*) | `dei:EntityNumberOfEmployees` (already a mapped concept, `normalize/mapping.py:1032`) | Tagged numeric fact, ~11% filer coverage per `normalize/schema.py:89` |
| ICFR **attestation flag** (as distinct from the ICFR *conclusion*) | `dei:IcfrAuditorAttestationFlag` (`cover.py`) | Says ICFR is subject to attestation; says nothing about whether it was effective — `cover.py` warns against conflating the two, which is exactly the bug this would fix if wired carelessly |

Wiring these first is a real, shippable slice of the Qualitative page with **zero pipeline
work**, and it narrows what the parser below actually needs to cover — it's the auditor's-report
prose, the CAM topics, the risk-factor themes/excerpts, the going-concern language, litigation
matter counts, MD&A driver text, and outlook language. Everything in that shorter list is
genuinely narrative and has no Track 1 substitute.

## 1. What stays genuinely narrative (needs the new pipeline)

From the same inventory, cross-referenced against `qualitative.ts`'s fixtures and the Company
Hub's §08 "irreducibly narrative" fields (`HubOverview.tsx:1385`):

- Risk-factor **theme classification** and **coverage %** (which of ~10-20 recurring risk
  themes a filing's Item 1A touches, and how many peers) — `QUAL_THEMES`
- Risk-factor **volume** (word count trend) — cheap once Item 1A is segmented, no classification
- **YoY risk-factor diff / rewrite detection** — `RF_VOLUME.netNew`, the Company Hub's
  risk-factor-diff field, "biggest rewrites this quarter" leaderboard
- Representative **language excerpts** per theme — `THEME_LANG`, `ThemeFilings.quote`
- **Going-concern** language detection — `GOING_CONCERN`
- **Material litigation** matter counts (Item 3) — `LITIGATION`
- **Critical Audit Matters** topics (auditor's report prose) — `CAMS`
- **Non-GAAP** mention/reconciliation presence — `NON_GAAP`
- **ICFR conclusion** (effective / not effective) — distinct from the attestation flag above
- **MD&A driver** text (why a metric moved) and **outlook language** — Company Hub §08
- **Cybersecurity framework name** (NIST CSF, ISO 27001, ...) — a `cyd:` prose TextBlock, not the
  boolean flags in §0

## 2. Pipeline architecture

Adapted from `TRACK_2_DRAFT.md`, onto this project's actual storage decisions
(`CLAUDE.md`'s Architecture section): **one operational SQLite DB**, behind repository
interfaces, single-writer in bulk jobs; **DuckDB is batch-only**, attaching that same file —
never a per-quarter file fleet, never Parquet at this scale (same call already made for the 13F
inversion, `ARCHITECTURE.md` §3b).

### Stage 1 — Document fetch (new fetch target, existing discovery mechanism)

Track 1 fetches XBRL instances and JSON APIs. Track 2 needs the filing's **primary document**
(the 10-K/10-Q HTML itself) — a new fetch *target*, but not a new discovery mechanism:
`sec/exhibits.py` already walks a filing's EDGAR directory to find EX-21, so the same
directory-listing call finds the primary document too. No new SEC endpoint family to integrate.

- Coverage floor: pin against EDGAR full-text search availability (~2001 forward) before
  promising history — same "verify, don't assume" discipline as every other coverage floor in
  this repo (13D/G, Form 144, XBRL's ~2009 floor).

### Stage 2 — Parse & segment (an EX-21-style *unwilling* parser)

Split into Items (1A Risk Factors, 3 Legal Proceedings, 7 MD&A, 7A Quant/Qual, 1C Cyber) by
header detection. This is the highest-risk stage for silent bad data, so it inherits EX-21's
defining property: **the parser is unwilling.** It requires a recognizable Item header; anything
else — a non-standard TOC, a filer that doesn't use standard captions, a malformed document —
returns `status="na"` with a reason, per section, never a guess. A partial or misaligned section
extraction is worse than none, for the same reason a partial subsidiary list was.

```sql
CREATE TABLE filing_sections (
  cik INTEGER, accession TEXT, item_code TEXT,
  section_name TEXT, cleaned_text TEXT,
  word_count INTEGER, sentence_count INTEGER,
  status TEXT, reason TEXT,           -- "ok" | "na" + why, same pattern as segments.py etc.
  schema_version INTEGER,             -- heals the cache when the parser improves, per cover.py's convention
  PRIMARY KEY (cik, accession, item_code)
);
```

Behind `FilingSectionRepository` / `SqliteFilingSectionRepository`, same shape as
`filing_cover_repository.py`. In the bulk path, parsers still never touch the DB directly — same
single-writer queue as `ingest/backfill.py` (guardrail 8).

### Stage 3 — Derived text metrics (pure Python, no network, no LLM)

Loughran-McDonald tone (positive/negative/uncertainty/litigious/constraining/modal), Fog index,
Flesch-Kincaid — computed once per section at ingest time, over the already-fetched text. Same
cost profile as `normalize/metrics.py`'s financial-metric derivation: deterministic, cheap,
re-runnable, schema-versioned so a word-list update heals forward rather than requiring a manual
backfill flag.

```sql
CREATE TABLE section_metrics (
  cik INTEGER, accession TEXT, item_code TEXT,
  lm_positive REAL, lm_negative REAL, lm_uncertainty REAL,
  lm_litigious REAL, lm_constraining REAL, lm_weak_modal REAL, lm_strong_modal REAL,
  fog_index REAL, flesch_kincaid REAL,
  schema_version INTEGER,
  PRIMARY KEY (cik, accession, item_code)
);
```

### Stage 4 — YoY diffing (same DB, no cross-file attach)

`TRACK_2_DRAFT.md` treats this as the hard part because its per-quarter-file design makes last
year's data live in a different SQLite file. It isn't hard here — there's one database. The
prior fiscal period's `filing_sections` row for the same `(cik, item_code)` is one query away.
Compute cosine/Jaccard similarity against it at ingest time, for Risk Factors and Legal
Proceedings specifically (a big jump there is the actionable signal), and write the result
alongside the new filing:

```sql
CREATE TABLE section_similarity (
  cik INTEGER, accession TEXT, item_code TEXT,
  prior_accession TEXT,
  cosine_similarity REAL, jaccard_similarity REAL,
  schema_version INTEGER,
  PRIMARY KEY (cik, accession, item_code)
);
```

### Stage 5 — Bounded LLM/classification extraction (the cost-gated stage)

This is where `CLAUDE.md`'s new ground rule is load-bearing: **no blanket per-filing-per-quarter
LLM sweep.** Two different techniques, deliberately kept separate because they have very
different costs:

- **Theme classification and excerpt selection** (risk themes, going-concern language, the
  quoted passage) do **not** need an LLM call per filing. Fixed taxonomy (~10-20 themes) +
  sentence embeddings computed once per section + cosine similarity against theme anchor
  descriptions is a classification, and the highest-similarity sentence *is* the excerpt — no
  generation involved, so nothing to hallucinate. This runs as an offline batch, same cost class
  as Stage 3.
- **True LLM extraction** — CAM topic naming, litigation matter counts/entities, MD&A driver
  attribution, outlook language, the cybersecurity framework name — runs only on a **targeted
  subset**: sections whose Stage 4 similarity dropped sharply (something changed, worth reading),
  or Item 3 / the auditor's report every fiscal year regardless of similarity (small, high-value,
  bounded by construction — one auditor's report per filer per year). Never a scheduled sweep
  over the whole corpus.
- Every LLM output lands as a **normalized typed table** (`litigation_matters`, `cam_topics`,
  `mdna_drivers`, ...), never a JSON blob — same discipline `segments.py`/`share_classes.py`
  already apply to structured extraction. A low-confidence extraction writes `status="na"` with a
  reason instead of a guess, exactly like the EX-21 parser.

### Stage 6 — Analytical marts (DuckDB, batch, `ATTACH`, never live)

Same mechanism the 13F cross-manager inversion already uses: `ATTACH 'secfin.db' (TYPE sqlite)`
against the live file, no Parquet landing at this scale. New batch modules follow the existing
`analytical/` shape (`sector_insider_flow.py`, `sector_geographic_mix.py` as the closest
analogues — per-SIC-group rollups over a JOIN with `company_profiles`):

- `analytical/tone_shift_alerts.py` — sector/filer leaderboard sorted by lowest YoY similarity
  ("biggest risk-factor rewrites this quarter"), the query already sketched in
  `TRACK_2_DRAFT.md` Stage 7, unchanged in spirit.
- `analytical/sector_narrative_mix.py` — per-SIC-group median tone/fog-index trend, mirroring
  `sector_geographic_mix.py`'s reconcile-or-exclude + coverage-reporting pattern.
- Peer-rank the theme-coverage and tone metrics through the **existing** `peer_ranks.py` /
  `metric_distributions` chain rather than building a parallel ranking mechanism — Track 2
  metrics should ride the same infrastructure Track 1 metrics already use where the shape fits.

## 3. UI requirements → pipeline mapping

| UI surface (fixture today) | Stage(s) needed | Cadence | LLM? |
|---|---|---|---|
| `RF_VOLUME` word-count trend | 1, 2 | annual (10-K) | no |
| `QUAL_THEMES` coverage/direction | 1, 2, 5 (classification) | annual | no (embeddings only) |
| `THEME_LANG` / `ThemeFilings.quote` excerpts | 1, 2, 5 (classification) | annual | no |
| `EMERGING` (new themes YoY) | 2, 4, 5 (classification) | annual | no |
| `GOING_CONCERN` | 2, 5 (targeted) | annual | keyword-first, LLM fallback on ambiguous hits |
| `LITIGATION` matter counts | 2, 5 (targeted) | annual | yes, bounded to non-boilerplate Item 3 |
| `CAMS` | 1, 2, 5 (targeted) | annual | yes, bounded (one auditor's report/filer/year) |
| `NON_GAAP` | 2, keyword scan | annual | no |
| ICFR conclusion | 2, keyword-first | annual | keyword-first, LLM fallback |
| Company Hub MD&A drivers / outlook | 1, 2, 5 (targeted) | annual, similarity-triggered | yes |
| Cybersecurity framework name | 1, 2, keyword scan (NIST/ISO) | annual | no (closed vocabulary) |
| "Biggest rewrites this quarter" leaderboard | 4, Stage 6 batch | derived, no new fetch | no |
| Sector "What's moving" narrative rollup (`SectorView.tsx:495`) | Stage 6 batch | derived | no |

Fields left off this table (auditor identity/tenure, cyber booleans, deficient filings, headcount,
ICFR attestation flag) are §0's zero-new-parser wins — already answerable today.

## 4. Phased build plan

Mirrors the wave structure `ROADMAP_13F_ANALYTICS.md` uses — sequence by what's buildable now
vs. gated on a prior stage's output existing for more than one fiscal year.

- **Wave 0 (ship first, no pipeline):** wire §0's five fields into real `sectorQualitative` /
  `companyDisclosure` responses. Removes 5 of ~15 fixture blocks from the Qualitative page for
  free. **✅ DONE 2026-08-23** for the sector-level three (`cyber`, `auditors`/`auditorChanges`/
  `auditorTenure`, `deficient`) — new `analytical/sector_governance_stats.py` batch →
  `sector_governance_stats` table → `GET /v1/sectors/{group}/disclosure-mix`, wired into
  `sectorQualitative`. Real filer names, not `pickFilers`, back the `Reveal` affordance for these
  fields specifically. The other two (per-company cyber-flag/auditor-identity/headcount wiring on
  the Company Hub) were already live before this pass — see the resolver comments in `api.ts`.
- **Wave A (Stages 1-4, no LLM). ✅ DONE 2026-08-23**, scoped to Stages 1-4 only — theme
  classification (`QUAL_THEMES`/`THEME_LANG`/`EMERGING`) is NOT bundled in (it needs the taxonomy
  + embedding-approach decisions §5 still lists as open) and stays deferred. What shipped:
  `sec/filing_document.py` (fetch) → `sec/filing_sections.py` (segmentation) →
  `normalize/section_metrics.py` (tone/readability) → `normalize/section_similarity.py` (YoY
  diff) → `ingest/section_backfill.py` (orchestration) → `analytical/tone_shift_alerts.py` +
  `GET /v1/sectors/{group}/tone-shift` (Stage 6, the one shipped leaderboard). Verified end-to-end
  against live SEC data (Apple's last two 10-Ks: Risk Factors YoY cosine 0.997, Legal Proceedings
  0.979 — both sane).

  **Two deviations from this doc's own earlier framing, both operator-confirmed during
  implementation:**
  - **Segmentation uses `sec-parser==0.58.1`, not stdlib** — §5's "worth a deliberate call, not a
    default" was resolved in the library's favor. The library has no dedicated 10-K parser
    (`Edgar10QParser` is the only concrete class); the working design runs it against both forms
    anyway (10-K's differently-numbered Items just fall back to generic `TitleElement`
    classification, harmless `UserWarning`s suppressed) and extracts by SPAN over the flat,
    document-order element list — not tree-nesting, which undercounts badly for 10-K. See
    `sec/filing_sections.py`'s docstring for the full mechanism, verified against three real
    filings.
  - **Tone scoring uses AFINN-165, not Loughran-McDonald.** Checked, not assumed: the LM
    dictionary is not freely redistributable (`sraf.nd.edu` routes to a license-by-request email,
    not an open file). AFINN-165 (Apache-2.0, `normalize/afinn_wordlist.txt`, checked in) gives
    positive/negative tone only — LM's uncertainty/litigious/constraining categories are NOT
    approximated with a substitute list (that would just be a differently-named unlicensed
    derivative of LM's own curation). Weak/strong modal verbs are computed from the closed set of
    English modal auxiliaries, which is grammar, not a licensed dataset. See
    `normalize/section_metrics.py`'s docstring.
- **Wave B (Stage 5, targeted LLM):** CAMs, litigation matters, going-concern edge cases, MD&A
  drivers, outlook language, cybersecurity framework name. Gated on Wave A's similarity scores
  existing (the targeting signal) and on an LLM budget/provider decision (open, see §5).
- **Wave C (Stage 6 batch marts):** sector-level narrative rollups, cross-sector tone comparison,
  once Wave A has run across enough filers to be a real distribution — same multi-quarter gate
  Phase B of the 13F roadmap uses.

## 5. Open decisions for the operator

- ~~**Segmentation approach**~~ **Decided 2026-08-23: `sec-parser`, not stdlib.** See Wave A's
  entry above.
- ~~**LM word list**~~ **Decided 2026-08-23: AFINN-165, not Loughran-McDonald** (licensing —
  see Wave A's entry above). If a licensed LM copy is obtained later, `normalize/section_metrics.py`
  is the single place to swap it in; the `tone_positive`/`tone_negative` field names would need to
  become `lm_positive`/`lm_negative` at that point, and uncertainty/litigious/constraining could
  be added for the first time (they are not approximated today, just absent).
- ~~**Classification mechanism (Stage 5, no-LLM half)**~~ **Decided 2026-08-26: real local
  sentence embeddings via `fastembed`, not hand-rolled keyword-anchor cosine.** The project's
  first ML dependency, chosen deliberately over reusing `section_similarity.py`'s existing
  word-count-vector mechanism. See §8 for the full design.
- **LLM provider + per-filing budget cap.** Stage 5's LLM half (CAM topic naming was **removed**
  from this list 2026-08-26 — CAMs now classify via embeddings, see §8 — leaving litigation
  matter counts, MD&A drivers, outlook language) is the one recurring per-token cost;
  `CLAUDE.md` requires bounding it but doesn't fix a number. Needs a ceiling before that subset of
  Wave B starts; unrelated to the embedding-backed fields, which have no per-call vendor cost.
- **Coverage floor** — confirm the earliest fiscal year Track 2 can promise, against EDGAR
  full-text search availability, before it ships on any page. Not yet checked for Wave A's own
  `section_backfill.py` either — it walks whatever `filing_index` already covers, which is its
  own rolling-window limit (see `docs/DEPLOYMENT_DO.md` on `filing_index_backfill`'s coverage),
  not a Track-2-specific floor.
- **Theme taxonomy ownership** — `QUAL_THEMES`' 9 hardcoded themes were prototype content, not a
  researched taxonomy. Decide whether it ships as-is, gets revised, or grows per-sector. Now has a
  second half per §8: authoring/curating the anchor-phrase-turned-anchor-*embedding* corpus each
  theme (and the new CAM taxonomy) needs, checked in with the same versioning discipline as
  `afinn_wordlist.txt`.
- **DEC-1/DEC-2 revisit** (`docs/TASKS.md` §2): the "what changed this filing" band was scoped to
  structured-record-only *because* Track 2 was out of scope. Worth re-opening now, not silently
  left on its old recommendation.

## 6. Guardrails this inherits (non-negotiable, same as `CLAUDE.md`)

1. Cost-bounded LLM use — targeted subsets only, never a blanket sweep (§2 Stage 5).
2. Normalized typed output, never raw JSON blobs from an LLM call.
3. Honest `status="na"` with a reason over a guess, at every stage — segmentation, classification,
   and extraction alike.
4. Still reads only what SEC EDGAR serves — no scraping outside SEC, no market/price data (that
   boundary is unrelated to Track 1 vs 2 and stays regardless).
5. DuckDB stays batch-only; the live API never queries it directly (guardrail 6, unchanged).
6. Bulk parsers never open the DB directly — single writer, same as every other bulk job
   (guardrail 8, unchanged).

## 7. Company-level similarity history (deferred from Wave A, designed 2026-08-24, not built)

Wave A's `GET /companies/{symbol}/section-similarity` exposes only the *latest* filing's YoY
score. This section designs the multi-year trend view — a real user asked to see 5 years of it and
neither the data nor an endpoint supports that yet. Nothing in this section is implemented.

**Scope note:** both 10-K (annual) and 10-Q (quarterly) cadences are in scope, on operator
direction — not annual-only, which was the initial recommendation. This is why the design below
needs a `form` selector rather than a single chain.

### New route

`GET /companies/{symbol}/section-similarity/history?item=RF&form=10-K`

- `item`: `"RF"` | `"LEGAL"` (required — one series per call, mirroring `concept-series`'s
  `?concept=` convention; a combined chart fetches both in parallel, the way `ComparisonTray` in
  `HubOverview.tsx` already overlays multiple metric series).
- `form`: `"10-K"` | `"10-Q"` (required). **The two cadences can never be one chain** — Stage 4's
  same-form-only rule means a 10-Q's Risk Factors is only ever compared to a prior 10-Q's, never a
  10-K's, so this isn't a `frequency` conversion of one series (like `concept-series`'s
  quarterly/annual toggle) but genuinely two separate comparison chains with different noise
  profiles: a 10-Q's Risk Factors is frequently one boilerplate "no material changes" sentence
  (confirmed against real filings during Wave A's own validation), so its similarity trend behaves
  very differently from the 10-K chain and must never be silently blended with it.

Response shape (new Pydantic models, `normalize/schema.py`, alongside `SectionSimilarityItem`):

```python
class SectionSimilarityPoint(BaseModel):
    accession: str
    prior_accession: str
    period_end: str | None = None  # FilingIndexEntry.report_date -- the ground-truth anchor
    fiscal_year: int | None = None  # 10-K points only -- see the label rule below
    cosine_similarity: float | None = None
    jaccard_similarity: float | None = None
    status: str  # "ok" | "no_prior" | "not_parsed"
    reason: str | None = None

class SectionSimilarityHistory(BaseModel):
    cik: int
    item_code: str
    item_label: str
    form: str
    points: list[SectionSimilarityPoint] = Field(default_factory=list)
    caveats: list[str] = Field(default_factory=list)
```

Whole available history, oldest-first, no query-param count limit — same convention
`/metrics/{metric}/history` and `/concept-series` already use (`MetricSeriesPoint`'s shape: a gap
period is `value=None`/status na, never interpolated; `period_end` is the calendar anchor, not the
filer's own stamped label). The client slices how much to show, same as those two routes.

**Label derivation rule — read this before implementing, it's the one place a future pass could
quietly get this wrong:**
- **10-K points get `fiscal_year`**, derived from `report_date`'s year. Safe: one 10-K maps
  cleanly to one fiscal year, and being off by the exact fiscal boundary isn't meaningfully
  misleading for a single annual point.
- **10-Q points do NOT get a derived fiscal-quarter label.** `filing_index` carries no XBRL
  fiscal-period tagging (that lives in `raw_facts`, a different ingest path this route doesn't
  touch), so there is no reliable per-company fiscal-quarter derivation today. Guessing "Q1" from
  a calendar month would be wrong for any non-calendar-fiscal-year company — and this project's
  standing rule is an honest absence over a guess (same discipline as every other coverage floor
  here). **10-Q points are labeled by `period_end` alone**, a real always-correct calendar date;
  the frontend formats it as a plain date ("Mar 2026"), never a fiscal-quarter claim. Accurate
  10-Q fiscal-quarter labeling, if wanted later, needs `company_profiles.fiscal_year_end` (already
  stored) to compute an offset from `report_date` — a small, separate follow-up, not bundled here.

**Route logic**: resolve symbol → cik; `filing_repo.get_filings(cik, [form], N)` for a generous
`N` (e.g. 50 — `filing_index` is itself EDGAR's rolling window, so this is "all indexed", not an
artificial cap); walk oldest→newest; per filing, look up its section + similarity row. **Extract
the shared per-filing lookup into one helper** (e.g. `_section_similarity_status(section_repo,
similarity_repo, cik, filing, item_code)` returning the status/reason/scores tuple) so this route
and the existing latest-only one stop duplicating the ok/no_prior/not_parsed derivation.

**Caveats**: the existing four (reused from `_TONE_SHIFT_CAVEATS`), plus one new one — *"The
filing index is EDGAR's own rolling recent window; a company whose index doesn't reach back 5
years shows fewer points, not a fabricated flat line."*

### Data prerequisite — ingest targeting

`section_backfill.py` currently always walks the whole `known_issuer_ciks()` universe — there is
no way to backfill one company's history deeply without waiting for (or running) a whole-market
pass. This project's established fix for exactly this problem is already in
`ingest/filing_index_backfill.py`: `--symbol` (repeatable ticker) / `--cik` (repeatable int),
resolved via `TickerCache`. Add the same flags to `section_backfill.py`, narrowing
`run_section_backfill`'s CIK set when either is passed.

**Second prerequisite, not solved by this design either**: `filing_index_backfill.py` itself must
have indexed 5+ years of a company's filings before `section_backfill.py` has anything to walk —
for most companies today it has not been run with that much depth.

### Frontend

Extend the shipped §08 similarity card with a click-to-open drawer, modeled on `HubOverview.tsx`'s
existing `TrendDrawer` — simpler, since this data has no `range`/`basis` axis the way financial
metrics do. State: a `form` toggle (`"10-K" | "10-Q"`, default `"10-K"`) replaces `range`/`basis`.
On open, fetch `item=RF` and `item=LEGAL` for the selected form in parallel
(`ComparisonTray`'s `Promise.all` pattern) and render **one combined `SeriesChart`**
(`clearyfi_frontend/app/charts/series.tsx` — the reusable, generic `{period, value}[]` chart
primitive already used everywhere else on this page, gaps drawn as real breaks, never
interpolated) with two lines — both scores are 0-1 cosine similarity, directly comparable on one
axis, no need for two separate drawers. Point labels follow the backend's label rule exactly
(`fiscal_year` for 10-K, formatted `period_end` for 10-Q) so the frontend does no guessing either.

New `api.ts` resolver, `companySectionSimilarityHistory(symbol, item, form)`, parallel to the
existing `companyMetricSeries` — same interface shape (`vals`, `labels`, `unit`, `label`, `reason`,
`periodEnds`), built from the new endpoint's `points`.

## 8. Wave B: classification mechanism design (designed 2026-08-26, not built)

Wave A left Stage 5's actual mechanism undecided ("sentence embeddings" was floated once in §2,
never chosen). This section maps every still-fixture Qualitative-page field and Company Hub §08's
absent narrative fields to a specific mechanism, so Wave B is buildable without re-deriving any of
this. **Two operator decisions, both overriding the cheaper default**: classification uses real
local sentence embeddings (not hand-rolled keyword-anchor cosine reusing
`section_similarity.py`'s existing mechanism), and CAMS/HC_CLIMATE — which both need new Stage-2
segmentation Wave A never built — are in scope for this same wave, not deferred.

### 8.1 Embedding mechanism — library and shape

**`fastembed`** (Qdrant, ONNX Runtime, Apache-2.0), not `sentence-transformers`. Both give local
sentence embeddings; `sentence-transformers` pulls in `torch` (500MB-2GB+ CPU wheel), `fastembed`
runs on `onnxruntime` alone with small quantized models (`BAAI/bge-small-en-v1.5` or
`all-MiniLM-L6-v2` in ONNX form, ~90-130MB) — far smaller, closer to this project's cost posture
even though a dependency is now accepted in principle. Pin exactly, same discipline as
`duckdb==1.4.5` and `sec-parser==0.58.1`.

- **New pyproject extra**: add `fastembed` to the existing `narrative` extra (still ingest-only,
  still never on the live API path) rather than inventing a third extra.
- **Compute once, offline, at ingest time** — same cost shape as Stage 3's tone metrics: a
  one-time per-filing cost, cached forever, never a live-request-path computation.
- **Granularity: per-sentence, not per-section.** Sections run thousands of words — embedding
  models have a token ceiling — so `cleaned_text` is split with the `_SENTENCE_END` regex
  `filing_sections.py` already defines (reuse directly, don't re-implement), and each sentence
  gets its own vector.
- **New table**, `section_sentence_embeddings` (cik, accession, item_code, sentence_index,
  embedding BLOB float32, schema_version) — behind a new repository, same ABC+SQLite-impl shape as
  every other Track 2 store. `numpy` becomes justified for the vector math now that a real ML
  dependency is accepted (`np.dot`/norms, vectorized per filing) — the "no new dependency" reason
  `section_similarity.py` hand-rolls cosine is moot for this stage.
- **Theme/topic anchors**: for each taxonomy entry (risk theme, CAM topic — §8.3), author a short
  anchor description, embed it once (offline authoring step), check in the resulting vectors as a
  versioned artifact — same discipline as `afinn_wordlist.txt`, schema-version bumped on any
  re-curation so it heals forward. An LLM-*assisted* first drafting pass over a real filing sample
  is fine here (offline curation aid, not a per-filing call — doesn't touch guardrail 1).
- **Classification**: max cosine similarity between a filing's sentence vectors and a theme's
  anchor vector; theme "present" above a threshold that needs empirical tuning against a real
  filing sample before shipping — same "verify, don't assume" discipline as every coverage floor
  in this repo. The single highest-scoring sentence **is** the excerpt (`THEME_LANG`) — extractive
  only, nothing generated, nothing to hallucinate.
- **Operational note, not a blocking decision**: the `narrative` Docker image needs the ONNX model
  available — bake into the image at build time (predictable, no first-run latency) vs.
  download-and-cache on first use. Leave to whoever builds this.

### 8.2 New Stage-2 segmentation: two new item_codes

Wave A's `_FORM_ITEMS`/`_SECTION_NAMES`/`_MIN_WORDS` cover exactly 5 codes, each a single
contiguous span. CAMS and HC_CLIMATE both need text Wave A never segmented.

**`BUSINESS` (Item 1) — straightforward, same pattern as existing codes.** New regex
`^item\s+1\b(?!a|b|c).*business` (negative-lookahead so it never matches 1A/1B/1C), single
contiguous span, same `SectionResult` shape as today. Powers `HC_CLIMATE`:
- Section presence (Tier 0/1): a `BUSINESS` row with `status="ok"` above a min-word floor, and a
  "Human Capital" sub-heading detected by regex/keyword scan (Item 101(c) has required *some*
  human-capital disclosure since 2020, but not a mandated caption).
- Sub-rows (headcount/DEI/turnover mentions, voluntary climate language): Tier 1 regex presence
  scans within the same text ("turnover"/"attrition"/"diversity",
  "greenhouse gas"/"GHG"/"net zero"/"TCFD").
- **Not a duplicate of the already-shipped `dei:EntityNumberOfEmployees` XBRL flag** (~11%
  coverage, `normalize/schema.py:89`, roadmap §0) — a prose headcount mention with no XBRL tag is
  real and common, and this narrative scan answers a different question. Label the two distinctly
  in the UI; never silently reconcile them to one number.

**`CAM` (Critical Audit Matters, from the auditor's report) — a real structural departure.** The
auditor's report isn't a numbered Item (it's incorporated into Part II Item 8 / the F-pages), and
it contains a **repeating block** — typically 2-4 named matters, each with its own "how addressed"
/ "why considered a CAM" prose — unlike every other item_code's single span.
- Detection: locate the report by heading text ("Report of Independent Registered Public
  Accounting Firm"), then the "Critical Audit Matters" sub-heading within it, via the same flat
  span-over-`sec-parser`-elements mechanism `filing_sections.py` already uses, one level deeper —
  each CAM's bolded title is a sub-span boundary the same way a top-level Item title is one today.
- **New table, not a repurposed `filing_sections` row**: `filing_cam_matters` (cik, accession,
  ordinal, title_text, cleaned_text, word_count, status, reason, schema_version). CAM doesn't fit
  `filing_sections`' `PRIMARY KEY (cik, accession, item_code)` invariant (one row per item_code),
  and `section_similarity.py`'s YoY diff assumes exactly that shape — never extend it to a
  variable-cardinality item. CAMs aren't YoY-diffed as prose the way RF/LEGAL are anyway (topics
  recur across filers, not compared word-for-word against last year's).
- **Also authoritative for `GOING_CONCERN`**: the auditor's explanatory paragraph (going-concern
  doubt, when present) lives in the same report region. Build the report-level segmentation once;
  `GOING_CONCERN` graduates from its `MDNA`-based MVP (§8.3) to this stronger source once it
  exists, without changing its Tier 1 mechanism.
- Classification: the same embedding-cosine classifier module as risk themes (§8.1), against a new
  ~12-15-topic closed taxonomy (revenue recognition, goodwill/intangible impairment, income tax
  uncertain positions, business-combination accounting, credit-loss allowance, inventory
  valuation, contingencies/litigation reserves, ...) — CAM language is short, formulaic, and names
  a specific GAAP line item almost every time. Best-match-wins; adjacent-category bleed (e.g.
  acquired-intangible valuation straddling goodwill-impairment and business-combination) is a real
  risk, framed honestly as "closest category," not papered over.

### 8.3 Per-field mechanism table

| Field | Tier | Mechanism | New prerequisite |
|---|---|---|---|
| `RF_VOLUME.words/median/yoy` | 0 | Aggregate stored `word_count` per sector | none |
| `RF_VOLUME.netNew`, `SIGNAL_MATRIX.rf/nw` | 1 (structural) | Diff the set of Item 1A sub-heading strings YoY, over already-stored `cleaned_text` (a new parsing routine, not a new stored column — `filing_sections` schema untouched) | none to Stage 2; new lightweight batch module |
| `QUAL_THEMES.cov/dir` | 2 (embeddings) | Max sentence-vs-theme-anchor cosine per filing, aggregated by sector, YoY-diffed for `dir` | embedding infra (§8.1) |
| `THEME_LANG` | 2 (embeddings) | Best-scoring sentence per matched theme, extractive | depends on `QUAL_THEMES` classifier |
| `EMERGING` | 0, over Tier 2 output | Diff stored per-filer theme classifications between consecutive fiscal years | depends on `QUAL_THEMES` |
| `GOING_CONCERN` detection | 1 | Regex for the ASC 205-40 standard phrase, MVP over `MDNA` | none for MVP; graduates to `CAM` segmentation (§8.2) later |
| `GOING_CONCERN` nature | 1, Tier 2 fallback | Regex against a small closed cause-set near the trigger; embedding-cosine fallback only if no keyword match | none new beyond above |
| `LITIGATION` category presence | 2 (embeddings) | Per-paragraph embedding cosine within `LEGAL` against category anchors | embedding infra |
| `LITIGATION` matter counts | 3, bounded LLM | Only on non-boilerplate `LEGAL` text (pre-filtered by a Tier 1 negative-match against standard "not a party to any material proceedings" boilerplate) | none new |
| `SIGNAL_MATRIX.gc`/`.lt` | 0/1 | Direct reads of the above | — |
| `CAMS` | 2 (embeddings) | Embedding-cosine per CAM matter block against the new CAM taxonomy | `CAM` segmentation (§8.2) |
| `NON_GAAP` | 1 | Regex presence scan over `MDNA` | none |
| `HC_CLIMATE` | 0/1 | Presence + regex scans over `BUSINESS` | `BUSINESS` segmentation (§8.2) |
| Company Hub — MD&A drivers | 3, bounded LLM | Similarity-triggered or fixed annual cadence, over `MDNA` | none new |
| Company Hub — outlook language | 3, bounded LLM, Tier 1 pre-filter | Regex cue-phrase pre-screen ("we expect"/"guidance"/"outlook") before calling the LLM | none new |
| Cyber framework name | 1 | Regex/closed-vocabulary scan (NIST/ISO 27001/COBIT/CIS) over `CYBER` | none — item_code already exists |

### 8.4 Build order

1. Embedding infra (§8.1). **✅ DONE 2026-08-26, primitives only** — `fastembed==0.8.0` added to
   the `narrative` extra; `sec.filing_sections.split_sentences` (reuses `_SENTENCE_END`, keeps
   punctuation for a readable excerpt later); `normalize/section_embeddings.py`
   (`embed_sentences`/`cosine_similarity`/`best_match`, both `fastembed` and `numpy` imported
   lazily so the module stays importable without the `narrative` extra); `section_sentence_embeddings`
   table + `SectionEmbeddingRepository`/`SQLiteSectionEmbeddingRepository` (vectors keyed
   `(cik, accession, item_code, sentence_index)`, `array('f', ...)` BLOB packing — stdlib, not
   numpy, so storage stays dependency-free even though computing a vector isn't). Verified against
   the real model in the built `narrative` Docker image (384-dim vectors, self-cosine ≈ 1.0), not
   just mocked. Full test coverage skips cleanly without the extra installed
   (`tests/test_section_embeddings.py`, `tests/test_section_embedding_repository.py`), and passes
   for real with it (24/24, including live model inference).

   **Not done yet, still part of step 1**: the anchor-phrase corpus (the ~9 risk themes need short
   anchor descriptions, embedded once and checked in as a versioned artifact per §8.1) and
   NO ingest wiring exists — nothing writes to `section_sentence_embeddings` yet, since
   `section_backfill.py` doesn't call `embed_sentences` anywhere. Both are prerequisites for step
   4 below, not this step's embedding-primitive scope.
2. `BUSINESS` item_code (straightforward) → unlocks `HC_CLIMATE`.
3. `CAM` segmentation + `filing_cam_matters` table (the real new mechanism) → unlocks `CAMS`, and
   later `GOING_CONCERN`'s graduation to a stronger source.
4. Wire the embedding classifier against both the risk-theme taxonomy (`QUAL_THEMES`/`THEME_LANG`/
   `EMERGING`/`SIGNAL_MATRIX`) and the CAM taxonomy (`CAMS`) — one module, two anchor sets.
5. Tier 1 regex fields (`GOING_CONCERN` MVP, `NON_GAAP`, cyber framework name,
   `SIGNAL_MATRIX.rf/nw`/`RF_VOLUME.netNew`) have no dependency on 1-4 and are shippable any
   time — cheapest wins first, if sequencing by effort rather than by the table order above.
6. Tier 3 LLM fields (`LITIGATION` counts, MD&A drivers, outlook) stay gated on the still-open LLM
   provider/budget decision (§5) — unaffected by this design.

**No code changes in this pass.**

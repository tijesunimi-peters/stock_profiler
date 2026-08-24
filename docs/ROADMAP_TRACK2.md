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
- **LLM provider + per-filing budget cap.** Stage 5 is the one recurring per-token cost;
  `CLAUDE.md` requires bounding it but doesn't fix a number. Needs a ceiling before Wave B starts.
- **Coverage floor** — confirm the earliest fiscal year Track 2 can promise, against EDGAR
  full-text search availability, before it ships on any page. Not yet checked for Wave A's own
  `section_backfill.py` either — it walks whatever `filing_index` already covers, which is its
  own rolling-window limit (see `docs/DEPLOYMENT_DO.md` on `filing_index_backfill`'s coverage),
  not a Track-2-specific floor.
- **Theme taxonomy ownership** — `QUAL_THEMES`' 9 hardcoded themes were prototype content, not a
  researched taxonomy. Decide whether it ships as-is, gets revised, or grows per-sector.
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

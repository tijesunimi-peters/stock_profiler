Solid architecture choice — SQLite as the durable, per-period system of record and DuckDB as the ephemeral analytical layer plays to both tools' strengths (SQLite for transactional/incremental writes, DuckDB for columnar scans across years). Here's how I'd structure it end to end.

## Stage 0 — Setup (one-time)

- Load the Loughran-McDonald word lists (CSV, free from Notre Dame) into memory/a lookup table — this becomes a shared resource every parsing job references.
- Register a proper `User-Agent` string with SEC EDGAR (`CompanyName contact@email.com`) — required on every request or you get blocked. Respect the 10 req/sec rate limit.
- Decide your SQLite partitioning scheme up front: **one SQLite file per fiscal period** (e.g. `filings_2024Q1.sqlite`) is a good match for "parse individually" — it keeps ingestion jobs isolated and lets you reprocess one quarter without touching others. Same schema in every file so DuckDB can union them later.

## Stage 1 — Discovery & fetch

- Use EDGAR's bulk data endpoints (`submissions.zip`, `companyfacts.zip`) or the full-text search API to enumerate new filings per CIK rather than crawling — much faster than per-company polling.
- For each filing: store raw HTML to disk, and a row in `filings` keyed by **accession number** (globally unique, makes upserts idempotent).

```sql
-- per-quarter SQLite schema
CREATE TABLE filings (
  accession_no TEXT PRIMARY KEY,
  cik TEXT, form_type TEXT,
  fiscal_year INTEGER, fiscal_period TEXT,
  filing_date DATE, period_end_date DATE,
  raw_path TEXT, content_hash TEXT
);
```

## Stage 2 — Parse & segment

- Don't analyze whole filings — split into Items (1A Risk Factors, 3 Legal Proceedings, 7 MD&A, 7A Quant/Qual Disclosures). The `sec-parser` or `edgartools` Python libraries handle this segmentation better than hand-rolled regex on header text, since formatting varies wildly across filers.
- Store both raw and cleaned text per section, plus word/sentence counts (cheap, needed later for normalization).

```sql
CREATE TABLE filing_sections (
  accession_no TEXT, item_code TEXT,
  section_name TEXT, cleaned_text TEXT,
  word_count INTEGER, sentence_count INTEGER,
  PRIMARY KEY (accession_no, item_code)
);
```

## Stage 3 — Compute metrics at ingest time

Run this immediately after parsing, per section, and write results as structured columns — this is what turns free text into something DuckDB can aggregate:

```sql
CREATE TABLE section_metrics (
  accession_no TEXT, item_code TEXT,
  lm_positive REAL, lm_negative REAL, lm_uncertainty REAL,
  lm_litigious REAL, lm_constraining REAL,
  lm_weak_modal REAL, lm_strong_modal REAL,
  fog_index REAL, flesch_kincaid REAL,
  PRIMARY KEY (accession_no, item_code)
);
```

## Stage 4 — Temporal diffing (the part that needs cross-period lookback)

This is the one step that breaks the "isolated per-quarter" model — computing YoY similarity requires reading last year's SQLite file while writing this year's. Two ways to handle it:

1. **At ingest time**: your parsing job for 2024Q1 opens a read-only connection to 2023Q1's SQLite file, pulls the prior section text, computes cosine/Jaccard similarity, writes the result into 2024Q1's `section_similarity` table.
2. **Deferred to DuckDB**: skip it at ingest, and instead compute similarity later in the analytical layer once everything's attached (simpler pipeline, but you lose the "flag this filing for review" trigger at write time).

I'd do (1) for at least Legal Proceedings and Risk Factors, since a big language jump there is a genuinely actionable signal you want to catch immediately, not months later.

```sql
CREATE TABLE section_similarity (
  accession_no TEXT, item_code TEXT,
  prior_accession_no TEXT,
  cosine_similarity REAL, jaccard_similarity REAL,
  PRIMARY KEY (accession_no, item_code)
);
```

## Stage 5 — Embeddings & LLM extraction (async, can lag behind ingest)

- Chunk sections into paragraphs, embed with FinBERT/sentence-transformers, store vectors as BLOBs (packed float32 arrays) in a `section_embeddings` table.
- Reserve LLM structured extraction for a targeted subset — e.g., only run it on sections where Stage 4's similarity score dropped sharply (new/rewritten risk language) or on Legal Proceedings every quarter. This keeps API cost bounded rather than running extraction over every filing every quarter.
- Land LLM output as normalized tables (`litigation_matters`, `risk_topics`) rather than free JSON blobs, so DuckDB can join against them cleanly.

## Stage 6 — Bridging SQLite → DuckDB

Two real options, worth being deliberate about:

**Option A — DuckDB attaches SQLite directly:**
```sql
INSTALL sqlite; LOAD sqlite;
ATTACH 'filings_2023Q1.sqlite' AS y2023q1 (TYPE sqlite);
ATTACH 'filings_2024Q1.sqlite' AS y2024q1 (TYPE sqlite);

CREATE VIEW all_metrics AS
  SELECT *, 2023 AS src_year FROM y2023q1.section_metrics
  UNION ALL
  SELECT *, 2024 AS src_year FROM y2024q1.section_metrics;
```
Simplest to wire up, zero ETL step, good while your corpus is small-to-medium (dozens to low hundreds of SQLite files).

**Option B — Periodic export to Parquet, partitioned by year:**
Export each quarter's tables to `metrics/year=2024/quarter=Q1/*.parquet` after ingest finishes. DuckDB's Parquet reader does predicate/column pushdown far more efficiently than scanning through the SQLite row-store extension, and `read_parquet('metrics/**/*.parquet', hive_partitioning=true)` gives you year/quarter as queryable columns for free.

Given you're planning multi-year cross-sectional analysis (peer comparisons, trend lines across hundreds of companies × many years), **B scales better** once the corpus grows — I'd start with A for development speed, and add a nightly export-to-Parquet job once you're past a few years of backfill. SQLite stays the write-optimized source of truth either way; Parquet is just a read-optimized cache of it.

## Stage 7 — Analytical marts in DuckDB

Once attached/loaded, build the views that actually answer questions:

```sql
-- YoY tone deterioration, flagged for review
CREATE VIEW tone_shift_alerts AS
SELECT f.cik, f.fiscal_year, m.item_code,
       m.lm_negative - LAG(m.lm_negative) OVER (
         PARTITION BY f.cik, m.item_code ORDER BY f.fiscal_year
       ) AS negative_tone_delta,
       s.cosine_similarity
FROM all_metrics m
JOIN filings f USING (accession_no)
LEFT JOIN section_similarity s USING (accession_no, item_code)
WHERE m.item_code = '1A';
```

From there: peer percentile ranking (window functions over sector/SIC code), fog index trend per company, a "biggest risk-factor rewrites this quarter" leaderboard sorted by lowest cosine similarity.

## A few practical notes

- **Idempotency**: key everything off `accession_no`; re-running a quarter's ingest should upsert, not duplicate.
- **Vector search**: if you want "find filings with similar risk language" as a query (not just YoY diff), DuckDB's `array_cosine_similarity` (on fixed-size `ARRAY` columns, recent DuckDB versions) can do brute-force similarity search entirely in-SQL for corpora up to maybe tens of thousands of chunks — you don't necessarily need a separate vector DB unless you scale past that.
- **Orchestration**: even a simple stage-numbered Python script run via cron is fine at first; Airflow/Dagster only earns its keep once you have enough companies/quarters that backfills and retries need real tracking.


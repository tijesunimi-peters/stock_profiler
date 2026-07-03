# CLAUDE.md

Context and working agreement for this repository. Read this first before making changes.

## What this project is

A pipeline and API that ingests **structured financial data from the SEC**, normalizes it
into one clean canonical schema, and serves it as developer-friendly JSON. The business goal
is a low-cost subscription API that undercuts existing financial-data providers by turning
messy SEC filings into consistent, queryable data.

## Scope: Track 1 only (structured numeric data)

**In scope right now:**
- Income statements
- Balance sheets
- Cash flow statements
- Insider trades (Forms 3 / 4 / 5)

All four are already filed with the SEC in structured form (XBRL for financials, ownership XML
for insider trades). We **ingest and re-shape structured data — we do not scrape or parse HTML.**

**Explicitly out of scope (do not build yet):**
- MD&A, risk factors, footnotes, or any free-text narrative ("Track 2")
- Any LLM-based summarization of filings
- Cross-company screening query language (planned; see docs/ROADMAP.md — do not start early)

If a task drifts toward Track 2 or free-text extraction, **stop and flag it** rather than
implementing it. Track 2 has a recurring per-token cost that fights the "cheap subscription" goal
and is a deliberate later decision.

## Architecture (four stages)

```
  ingest            normalize             store              serve
  ------            ---------             -----              -----
  SEC APIs   -->    map raw GAAP    -->   canonical    -->   FastAPI
  (XBRL /          tags to our           records in         REST JSON
   ownership       canonical             DB / cache
   XML)            schema
```

- **ingest** (`src/secfin/sec/`): thin, rate-limited clients over the SEC's public JSON/XML APIs.
- **normalize** (`src/secfin/normalize/`): the value-add. Maps inconsistent source tags to one
  canonical schema. **This is the moat — most of our real work lives here.**
- **store**: start with on-disk/SQLite cache; design so it can move to Postgres without touching
  the API layer.
- **serve** (`src/secfin/api/`): FastAPI endpoints returning canonical JSON.

## Data sources (SEC — all public, all free)

Base host for structured data: `https://data.sec.gov`

- **Company filing index:** `/submissions/CIK##########.json`
  (10-digit zero-padded CIK) — lists all filings for one company.
- **Company facts (all XBRL numbers for a company):**
  `/api/xbrl/companyfacts/CIK##########.json` — primary source for income/balance/cashflow.
- **Single concept across periods:** `/api/xbrl/companyconcept/CIK##########/us-gaap/{Concept}.json`
- **Frames (one concept across ALL companies for one period):**
  `/api/xbrl/frames/us-gaap/{Concept}/{Unit}/{Period}.json`
  — this is the intended path to cross-company screening later. Note it now; don't build on it yet.
- **Ticker → CIK map:** `https://www.sec.gov/files/company_tickers.json`
- **Insider trades (Forms 3/4/5):** discovered via `/submissions/...`, then fetch the ownership
  XML document from the filing's EDGAR directory. Parsed in `src/secfin/sec/insider.py`.

## Tech stack

- Python 3.11+
- `httpx` — HTTP client (async-capable)
- `pydantic` v2 — schema + validation (canonical models live in `normalize/schema.py`)
- `FastAPI` + `uvicorn` — API layer
- `pytest` — tests
- SQLite for local dev; keep DB access behind a small interface so Postgres is a drop-in later.

## Repository layout

```
src/secfin/
  config.py              # settings (User-Agent, DB path) from env
  sec/
    client.py            # rate-limited SEC HTTP client (User-Agent + throttle)  [implemented]
    companyfacts.py      # fetch + shape companyfacts JSON                        [implemented]
    insider.py           # fetch + parse Forms 3/4/5 ownership XML               [stub]
  normalize/
    schema.py            # canonical Pydantic models                            [implemented]
    mapping.py           # canonical concept -> candidate US-GAAP tags (the moat) [starter]
    statements.py        # build canonical statements from company facts         [implemented]
  api/
    main.py              # FastAPI app + wiring
    routes.py            # endpoints
tests/
docs/                    # ARCHITECTURE, DATA_MODEL, ROADMAP
```

## Conventions (follow these — they prevent whole classes of bugs)

- **CIK is always stored/passed as an `int` internally** and zero-padded to 10 digits only when
  building SEC URLs. Never store the padded string as the identity.
- **Values are stored in their raw reported unit** (usually USD, sometimes shares). Never silently
  rescale. Carry the `unit` on every fact.
- **Periods:** duration facts carry `period_start`/`period_end`; instant facts carry `instant`.
  A fiscal key is `(fiscal_year, fiscal_period)` e.g. `(2024, "Q3")` / `(2024, "FY")`.
- **Every canonical fact records its source `gaap_tag` and whether it was a company extension tag**
  (`is_extension`). This is required for auditability and for improving the mapping over time.
- **Restatements:** the same concept+period can appear in multiple filings with different values.
  Keep the `accession` + `filed` date on each fact; latest `filed` wins for "current" views, but
  never delete prior values.
- Type hints on all public functions. Keep `sec/` clients free of business logic — mapping belongs
  in `normalize/`.

## SEC compliance (non-negotiable — do not bypass)

- **Every request must send a descriptive `User-Agent`** identifying the app and a contact email
  (set via `SEC_USER_AGENT` env var). Requests without it get blocked.
- **Respect the SEC fair-access rate limit** (the client throttles requests). Do not remove or raise
  the throttle to "go faster."
- SEC data is public domain, but **verify current fair-access / redistribution terms** before launch
  at the SEC developer resources page — treat the numbers in `client.py` as "verify, don't assume."

## Common commands

```bash
# install (editable) + dev deps
pip install -e ".[dev]"

# run the API locally
uvicorn secfin.api.main:app --reload

# tests
pytest

# lint/format (if configured)
ruff check . && ruff format .
```

## Guardrails for the agent

1. Don't expand into Track 2 (free text / summarization) — flag instead.
2. Don't weaken SEC rate limiting or drop the User-Agent.
3. When you add a new canonical concept, update `normalize/mapping.py` AND `docs/DATA_MODEL.md`.
4. Prefer extending the mapping table over hard-coding company-specific fixes in `statements.py`.
5. Keep the DB behind an interface; no raw SQL in the API layer.

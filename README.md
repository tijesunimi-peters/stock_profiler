# sec-financials-api

Turn messy SEC filings into clean, consistent, developer-friendly JSON.

This is the **Track 1** build: structured numeric data only — income statements, balance sheets,
cash flow statements, and insider trades (Forms 3/4/5). Everything is sourced from the SEC's free,
public structured-data APIs (XBRL + ownership XML). No HTML scraping.

> The value isn't the raw data (the SEC gives that away). It's **normalization**: mapping the
> inconsistent, company-specific tags in filings onto one canonical schema so `revenue` always
> means `revenue`, in consistent units, with restatements tracked.

## Status

Early scaffold. Implemented: SEC client (rate limiting + User-Agent), companyfacts fetch,
canonical schema, statement builder, starter GAAP mapping, API skeleton.
To do: insider-trade parsing, storage layer, expanded mapping coverage, tests. See `docs/ROADMAP.md`.

## Requirements

- Python 3.11+
- A contact email for the SEC `User-Agent` (required by the SEC for automated access)

## Setup

```bash
python -m venv .venv && source .venv/bin/activate
pip install -e ".[dev]"

cp .env.example .env
# then edit .env and set SEC_USER_AGENT to something like:
#   SEC_USER_AGENT="sec-financials-api you@example.com"
```

## Run

```bash
uvicorn secfin.api.main:app --reload
# open http://127.0.0.1:8000/docs for the interactive API
```

## Running with Docker

An alternative to the local venv above — useful if you don't want to manage a Python
install, or as the base for running the ingest jobs (see below).

```bash
cp .env.example .env
# edit .env: set SEC_USER_AGENT to a real contact email, e.g.
#   SEC_USER_AGENT="stock-profiler you@example.com"
# (docker compose loads this same .env for both the app's own settings and its own
# variable substitution — every docker compose command needs SEC_USER_AGENT resolvable,
# including `build`, so do this first)

docker compose build
docker compose up api
# reachable at http://localhost:8000 (same routes as the local run above)
```

Bulk backfill and daily incremental ingest run as one-off commands against the same
`api` service/image:

```bash
docker compose run --rm api python -m secfin.ingest.backfill
docker compose run --rm api python -m secfin.ingest.incremental
```

**Rebuild (`docker compose build`) after pulling or making source changes** — the image
bakes in `src/` at build time rather than mounting it live, so a stale image silently
runs old code. See `docs/DEVELOPMENT.md` for the full Docker workflow: tuning flags,
where the SQLite DB and downloaded bulk files persist (and why that makes backfill
resumable), and how to inspect the DB safely while a job is running.

## Example

```bash
# income statement for Apple (ticker resolves to CIK internally) -- no API key needed,
# same endpoint the public Data Explorer (/explorer) calls
curl "http://127.0.0.1:8000/v1/companies/AAPL/statements/income?period=FY&year=2024"
```

## Authentication

`GET .../statements/{statement}` and `GET .../periods` are the only endpoints servable
without a key (they back the public `/explorer` demo). Every other `/v1` endpoint
requires an `X-API-Key` header. Get one:

```bash
curl -X POST "http://127.0.0.1:8000/v1/signup" \
  -H "Content-Type: application/json" \
  -d '{"email": "you@example.com"}'
# -> {"api_key": "sfk_...", "tier": "free", "rate_limit_per_sec": 5, "daily_quota": 1000}

curl "http://127.0.0.1:8000/v1/companies/AAPL/insider-trades" -H "X-API-Key: sfk_..."
```

The key is shown once, at signup — there's no recovery flow yet, only one key per
email. See `src/secfin/auth/` and `src/secfin/api/auth.py`.

## Project docs

- `CLAUDE.md` — working agreement and architecture (read this first)
- `docs/ARCHITECTURE.md` — how data flows through the four stages
- `docs/DATA_MODEL.md` — canonical schema and the mapping approach
- `docs/ROADMAP.md` — what's next and what's deliberately deferred
- `docs/DEVELOPMENT.md` — the full Docker workflow (build, backfill, incremental,
  persistence, safe DB inspection)

## A note on the SEC

All data comes from the SEC's public systems. Requests are rate-limited and carry a descriptive
`User-Agent` per SEC fair-access rules. SEC data is public domain; verify current redistribution
terms before commercial launch.

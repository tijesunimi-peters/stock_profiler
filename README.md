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

## Example

```bash
# income statement for Apple (ticker resolves to CIK internally)
curl "http://127.0.0.1:8000/v1/companies/AAPL/statements/income?period=FY&year=2024"
```

## Project docs

- `CLAUDE.md` — working agreement and architecture (read this first)
- `docs/ARCHITECTURE.md` — how data flows through the four stages
- `docs/DATA_MODEL.md` — canonical schema and the mapping approach
- `docs/ROADMAP.md` — what's next and what's deliberately deferred

## A note on the SEC

All data comes from the SEC's public systems. Requests are rate-limited and carry a descriptive
`User-Agent` per SEC fair-access rules. SEC data is public domain; verify current redistribution
terms before commercial launch.

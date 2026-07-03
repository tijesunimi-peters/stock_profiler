# Roadmap

Track 1 = structured numeric data. Everything below stays inside Track 1 unless marked
"deferred".

## Now (scaffold — done / in progress)

- [x] SEC client: User-Agent + rate limiting
- [x] companyfacts fetch + flatten to RawFact
- [x] Canonical schema (RawFact / Statement / StatementLine / InsiderTransaction)
- [x] Starter concept → GAAP tag mapping
- [x] Statement builder (concept selection + restatement handling)
- [x] API skeleton (statements, periods)
- [ ] Ticker→CIK map caching (currently refetched per request)

## Milestone 1 — reliable financials for one statement type

- [ ] Storage layer: cache RawFacts per company (SQLite behind a repository interface)
- [ ] Put the cache in front of API routes (stop hitting SEC per request)
- [ ] Expand mapping coverage for the income statement; measure with `coverage_report()`
- [ ] Real tests against a few saved companyfacts fixtures (Apple, a bank, a retailer)

## Milestone 2 — all three statements + insider trades

- [ ] Balance sheet + cash flow mapping coverage
- [ ] Implement `sec/insider.py` (Forms 3/4/5 XML parsing) per its docstring plan
- [ ] Insider-trades endpoint

## Milestone 3 — productization

- [ ] API keys + auth + per-key rate limiting / quotas
- [ ] Usage metering (for billing) + subscription tiers
- [ ] Bulk/batch ingestion job to warm the cache (respecting SEC limits)
- [ ] OpenAPI polish, examples, and docs site

## Milestone 4 — queryability beyond single-company lookups

- [ ] Filtered listing endpoints (by concept, period)
- [ ] Cross-company screening — **built on the SEC `frames` API** (one concept across all
      companies for one period) rather than home-grown indexing where possible.

## Deferred (NOT Track 1 — decide later, deliberately)

- [ ] Track 2: MD&A / risk factors / footnotes (free-text narrative)
- [ ] Any LLM summarization of filings (recurring per-token cost — revisit only with a
      clear pricing story)

## Pre-launch checklist

- [ ] Confirm current SEC fair-access + redistribution terms
- [ ] Verify User-Agent is enforced everywhere and throttle can't be bypassed
- [ ] Load test the cache path (not the live-SEC path)

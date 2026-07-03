# Architecture

Four stages. Each stage has one job; keep the boundaries clean so any stage can be
swapped without rewriting the others.

```
  ingest              normalize             store               serve
  ------              ---------             -----               -----
  SEC public APIs --> map raw GAAP    -->   canonical     -->   FastAPI
  (XBRL JSON /       tags to our            records            REST JSON
   ownership XML)    canonical schema       (cache/DB)
```

## 1. Ingest — `src/secfin/sec/`

Thin clients over the SEC's free public APIs. **No business logic here.**

- `client.py` — one HTTP client for everything. Enforces the required `User-Agent` and
  throttles to the SEC fair-access rate. All SEC access goes through it.
- `companyfacts.py` — pulls the `companyfacts` JSON (all XBRL numbers for a company) and
  flattens it to `RawFact`s. Also resolves ticker → CIK.
- `insider.py` — (stub) pulls Forms 3/4/5 ownership XML and parses to `InsiderTransaction`s.

The financials source is already structured (companyfacts gives us clean data points), so
there's no HTML parsing. Insider trades are structured XML — again no HTML scraping.

## 2. Normalize — `src/secfin/normalize/`  ← the value-add

The SEC's data is structured but *inconsistent*: companies use different us-gaap tags for
the same concept, invent extension tags, and change tags year to year. This stage maps all
of that onto one small, stable canonical schema.

- `schema.py` — models. `RawFact` (source-faithful) vs. canonical outputs
  (`Statement`, `StatementLine`, `InsiderTransaction`).
- `mapping.py` — `canonical concept → ordered candidate GAAP tags`. The heart of the moat.
- `statements.py` — assembles a `Statement` for a company+period by choosing, per concept,
  the first candidate tag that has a value (latest-filed wins for restatements).

See `DATA_MODEL.md` for the schema and mapping details.

## 3. Store — (to build)

Not yet implemented. Design intent:

- Cache the flattened `RawFact`s per company so we don't hit the SEC on every request
  (also the only way to respect fair-access limits at scale).
- Start with SQLite; keep all DB access behind a small repository interface so moving to
  Postgres is a drop-in.
- Preserve every version of a fact (never destructively overwrite on restatement); the
  builder decides what's "current".

## 4. Serve — `src/secfin/api/`

FastAPI. `main.py` wires the app; `routes.py` exposes:

- `GET /v1/companies/{symbol}/statements/{income|balance|cashflow}?year=&period=`
- `GET /v1/companies/{symbol}/periods`
- `GET /v1/companies/{symbol}/insider-trades` (501 until implemented)

`symbol` accepts a ticker or a raw CIK. Right now routes fetch live from the SEC per
request — that's a placeholder until the store lands.

## Data flow example (income statement for AAPL, FY2024)

1. `routes` resolves `AAPL` → CIK `320193`.
2. `companyfacts.fetch_raw_facts` pulls + flattens all XBRL points.
3. `statements.build_statement` filters to (2024, "FY"), maps concepts, emits lines.
4. FastAPI returns the `Statement` as JSON.

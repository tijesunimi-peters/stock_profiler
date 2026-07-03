# Architecture

Four stages. Each stage has one job; keep the boundaries clean so any stage can be
swapped without rewriting the others.

```
  ingest              normalize             store                    serve
  ------              ---------             -----                    -----
  SEC public APIs --> map raw GAAP    -->   canonical          -->   FastAPI
  (XBRL JSON /       tags to our            records                  REST JSON
   ownership XML)    canonical schema       (SQLite/Postgres)
                                        \
                                         `-> Parquet landing -> DuckDB
                                             (batch analytical jobs only;
                                              never on the request path)
```

## 1. Ingest — `src/secfin/sec/`

Thin clients over the SEC's free public APIs. **No business logic here.**

- `client.py` — one HTTP client for everything. Enforces the required `User-Agent` and
  throttles to the SEC fair-access rate. All SEC access goes through it.
- `companyfacts.py` — pulls the `companyfacts` JSON (all XBRL numbers for a company) and
  flattens it to `RawFact`s. Also resolves ticker → CIK.
- `insider.py` — (stub) pulls Forms 3/4/5 ownership XML and parses to `InsiderTransaction`s.
- `institutional.py` — (stub) pulls Form 13F information-table XML → `HoldingsSnapshot`s, and
  Schedules 13D/G → `BeneficialOwnership`. 13F is a quarter-end *snapshot*, not trades.

The financials source is already structured (companyfacts gives us clean data points), so
there's no HTML parsing. Insider trades and 13F are structured XML — again no HTML scraping.

## 2. Normalize — `src/secfin/normalize/`  ← the value-add

The SEC's data is structured but *inconsistent*: companies use different us-gaap tags for
the same concept, invent extension tags, and change tags year to year. This stage maps all
of that onto one small, stable canonical schema.

- `schema.py` — models. `RawFact` (source-faithful) vs. canonical outputs
  (`Statement`, `StatementLine`, `InsiderTransaction`).
- `mapping.py` — `canonical concept → ordered candidate GAAP tags`. The heart of the moat.
- `statements.py` — assembles a `Statement` for a company+period by choosing, per concept,
  the first candidate tag that has a value (latest-filed wins for restatements).
- `flows.py` — derives institutional buy/sell (`HoldingDelta`) by diffing two consecutive
  13F `HoldingsSnapshot`s. Implemented; the parsing that feeds it is the `institutional.py` stub.

See `DATA_MODEL.md` for the schema and mapping details.

## 3. Store — (to build)

Not yet implemented. Two distinct stores, not one replacing the other — different jobs,
different access patterns.

### 3a. Operational store — what `serve` reads from

- Cache the flattened `RawFact`s (and, once implemented, `HoldingsSnapshot`s) per company
  so we don't hit the SEC on every request (also the only way to respect fair-access limits
  at scale).
- Start with SQLite in WAL mode (concurrent point reads for the API); keep all DB access
  behind a small repository interface so moving to Postgres is a drop-in.
- Preserve every version of a fact (never destructively overwrite on restatement); the
  builder decides what's "current".

### 3b. Analytical engine — DuckDB over Parquet (planned, Milestone 2.5)

Batch aggregation only. This is **not** the API's transactional backend and must **never**
sit on the live per-request read path — it exists for jobs that need to scan across many
companies/managers at once, which a per-company operational store isn't shaped for:

- the 13F cross-manager inversion (Milestone 2.5) — "who holds this issuer, across all
  managers, this quarter?"
- cross-company screening via the SEC `frames` API (Milestone 4).

Data pattern: cached SEC data is *also* landed as Parquet files on disk (a serialization of
the same operational records — see `DATA_MODEL.md`), and DuckDB runs vectorized scans over
those files as a separate batch job. Serverless — no DB process to run or pay for, which
fits the cheap-subscription goal. DuckDB can also read the SQLite file directly via its
`sqlite` extension, so the two stores coexist without a sync pipeline being mandatory.

**Verify, don't assume:** DuckDB's multi-process read/write concurrency semantics have
changed across releases. Pin a version and confirm the concurrency behavior in that
version's docs before implementing anything on top of it.

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

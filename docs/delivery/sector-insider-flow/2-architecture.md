# P6a — Sector Insider flow — Architecture & implementation plan

Stage 2 (Principal Architect) handoff. Reads: `1-brief.md`. Task slug: `sector-insider-flow`.

## Scope re-check (Track 1, buildable, no drift)

✅ Track 1 (structured Forms 3/4/5, already ingested). ✅ No new base dependency — the aggregation
uses the existing `analytical` extra (DuckDB, **batch-only**, off the request path). ✅ SEC
compliance untouched (batch reads the local SQLite file; adds **no** live SEC calls to the request
path). ✅ Honesty preserved (derived-rollup label, N/A-never-0, open-market-only scope, correct
insider caveats — **not** the 13F derived-trade caveat). No Track-2, no free text. **Proceed.**

## Data flow (fits the four stages)

```
normalize (parser)        analytical (batch)              store (materialized)     serve            static
------------------        ------------------              --------------------     -----            ------
sec/insider.py adds  -->  analytical/sector_insider_ -->  sector_insider_flow  --> GET /v1/sectors/  --> sectorapp.js
 transaction_code         flow.py: DuckDB over the        table (SQLite) via       {group}/insider-      Insider-flow
 (P/S/M/A/G/F) to each    SQLite file — JOIN insider_     a new repository         flow reads ONLY       card (real,
 InsiderTransaction;      transactions × company_                                   the materialized      replaces the
 persisted in the         profiles, group by SIC-2,                                 store (no DuckDB,      placeholder)
 insider cache table      window on transaction_date,                              no SEC, no raw SQL)
                          sum P vs S value
```

Guardrails honored: **6** (DuckDB never on the request path — the endpoint reads the SQLite
materialized table), **7** (aggregation is a separate offline batch), **5** (DB behind a repository
interface; no raw SQL in the API layer), **single-writer** N/A (batch is a single process; no
multi-parser pipeline). CIK stays `int`; values stay in **raw reported USD** with `unit` carried.

---

## Backend (senior-backend-engineer) — land first, in this order

### B1 · Capture the SEC transaction code (parser + schema) — `normalize/schema.py`, `sec/insider.py`

The parser currently keeps `acquired_disposed` (A/D) but not the transaction **code**, which is
what distinguishes an open-market purchase (`P`) / sale (`S`) from a grant (`A`), option exercise
(`M`), gift (`G`), or tax-withholding (`F`). Without it we cannot honestly compute "open-market
buy/sell."

- **`schema.InsiderTransaction`**: add `transaction_code: str | None = None` (the raw SEC code;
  keep it a free `str`, not a `Literal` — the code set is open-ended and we don't want to drop
  unknown codes on parse). Place it next to `acquired_disposed`.
- **`sec/insider.py` `_row_fields`**: extract it from the row's `transactionCoding` element:
  `_text(row.find("transactionCoding"), "transactionCode")`. Holdings rows (`is_holding=True`)
  have no `transactionCoding` → stays `None`. Keep `sec/` free of business logic (guardrail): the
  parser only captures the code; the *P/S-only* decision lives in the batch, not here.
- **Test**: a fixture ownership XML with mixed codes (at least one each of P, S, and one of
  M/A/G/F) → assert each row's `transaction_code` is captured and P/S are distinct from the rest
  (**AC-1**). Add a small fixture (`tests/fixtures/form4_mixed_codes.xml`) rather than relying on a
  live document.

### B2 · Persist the code in the insider cache — `storage/sqlite_insider_repository.py`

- Add `transaction_code TEXT` to the `insider_transactions` `_SCHEMA`, the `_INSERT_TXN_SQL` column
  list, `_txn_to_row`, and `_row_to_txn`.
- **Migration (idempotent, additive):** existing DBs already have `insider_transactions` **without**
  the column, so `CREATE TABLE IF NOT EXISTS` won't add it. In `__init__`, after `executescript`,
  run a guarded `ALTER TABLE insider_transactions ADD COLUMN transaction_code TEXT` only if absent
  (check `PRAGMA table_info(insider_transactions)`; SQLite has no `ADD COLUMN IF NOT EXISTS`). This
  mirrors how other repos stay forward-compatible; keep it a tiny private `_ensure_columns()` helper.
- **Legacy rows:** cached rows written before this change carry `transaction_code = NULL`. The batch
  (B3) counts **only** rows with `transaction_code IN ('P','S')`, so legacy/holding/unknown rows are
  simply excluded — honest, covered by the coverage caveat. **Do not** attempt to back-derive codes
  (we don't store raw XML). Re-warming the cache (D-4, ops) re-fetches with the new parser; note
  that the cache's upsert skips already-cached accessions, so a true re-warm means clearing the
  target CIKs' `insider_filings`/`insider_transactions` first, then re-running `insider_backfill`.
  **This is an ops/coverage step, not a build gate.**
- **Test**: round-trip an `InsiderTransaction` with a `transaction_code` through the repo; and open a
  DB created under the *old* schema (table without the column) and assert `__init__` adds it and
  reads back cleanly (migration test).

### B3 · Aggregation batch — `analytical/sector_insider_flow.py` (new)

Model on `analytical/peer_ranks.py` (DuckDB `ATTACH '<db>' (TYPE sqlite)`, lazy `import duckdb`,
compute in DuckDB, write back through a SQLite repo). **Batch-only, offline, `python -m`.**

- **Query** — JOIN `insider_transactions t` × `company_profiles cp ON cp.cik = t.issuer_cik`,
  `peer_group = substr(cp.sic, 1, :sic_digits)` (`settings.secfin_peer_sic_digits`, default 2),
  with:
  - `t.is_holding = 0`
  - `cp.sic IS NOT NULL AND length(cp.sic) >= :sic_digits`
  - `t.transaction_date` within the trailing window `[window_start, window_end]`
  - classify by `t.transaction_code`: `'P'` → buy, `'S'` → sell (everything else excluded).
- **Per `(peer_group)` aggregates** (window fixed for the run):
  - `buys  = SUM(shares*price) WHERE code='P' AND shares IS NOT NULL AND price_per_share IS NOT NULL`
  - `sells = SUM(shares*price) WHERE code='S' AND shares IS NOT NULL AND price_per_share IS NOT NULL`
  - `net = buys - sells`
  - `buy_count`, `sell_count` = count of P / S rows **with a computable value**
  - `filer_count = COUNT(DISTINCT owner_name)` over the P/S rows
  - `company_count = COUNT(DISTINCT issuer_cik)` over the P/S rows
  - `excluded_no_price_count` = P/S rows **in-window** with NULL shares or NULL price
    (**AC-3**: excluded from value sums, but surfaced as a count — never silently $0).
- **Window**: `--window-days` (default 90) and `--as-of` (default today, `YYYY-MM-DD`). The run
  computes `window_end = as_of`, `window_start = as_of - window_days`. Store all three + `window_days`
  so the endpoint/UI display the exact window (**AC-5**). Anchor on **transaction_date** (per brief).
- **Structure for testability**: keep a thin `run_sector_insider_flow(db_path, sic_digits,
  window_days, as_of)` that builds rows via the DuckDB query, then `repo.clear()` +
  `repo.bulk_upsert(rows)` (full recompute — a group that dropped out of the window must not linger,
  same pattern as peer_ranks/theme_scores). A group with zero P/S value rows in-window produces **no
  row** (absent, not zero — the endpoint turns "no row" into the honest N/A payload).
- **Tests (skip-gated on the analytical extra, exactly like `test_peer_ranks.py`:
  `importlib.util.find_spec("duckdb")` + `pytest.mark.skipif`)**: seed a temp SQLite with
  `insider_transactions` + `company_profiles` fixtures, run the batch, assert against
  `sector_insider_flow`:
  - **AC-2** grant (A) + exercise (M) + gift (G) + tax (F) rows contribute **zero**; only P/S move
    totals.
  - **AC-3** a P row with NULL price is excluded from `buys` but increments `excluded_no_price_count`.
  - **AC-4** grouping is SIC-2 from `company_profiles`; a CIK with no profile row is excluded and
    doesn't crash.
  - **AC-5** a P/S row dated outside the window is excluded.
  - net = buys − sells; `filer_count` counts distinct owners.

### B4 · Materialized store — `storage/sector_insider_flow_repository.py` (+ SQLite impl, new)

Mirror `sector_theme_score_repository.py` (abstract ABC + `NamedTuple` row) and its SQLite impl
(own connection, WAL, `bulk_upsert`/`clear`/`count`/`close`).

- **`SectorInsiderFlowRow`** (`NamedTuple`): `peer_group: str`, `as_of: str`, `window_days: int`,
  `window_start: str`, `window_end: str`, `net: float`, `buys: float`, `sells: float`,
  `buy_count: int`, `sell_count: int`, `filer_count: int`, `company_count: int`,
  `excluded_no_price_count: int`, `unit: str` (`"USD"`).
- **Table `sector_insider_flow`**, PK `(peer_group, as_of, window_days)`; index on `(as_of)`.
- **Methods**: `bulk_upsert(rows)`, `clear()`, `get(group, as_of=None)` → the row for the group at
  the given `as_of` (or the **latest** `as_of` if `None`), `latest_as_of()` → most recent `as_of`
  string or `None`, `count()`, `close()`.
- **Test**: upsert → `get` (explicit + latest) → `clear` → `latest_as_of()` empty (`None`).

### B5 · Read endpoint — `api/routes.py`, `api/main.py`, response model in `normalize/schema.py`

- **Response model `SectorInsiderFlow`** (Pydantic, near the other sector models): `group`,
  `group_label`, `peer_basis`, `as_of: str | None`, `window: {days:int, start:str|None,
  end:str|None, label:str}`, `unit: str`, `net: float | None`, `buys: float | None`,
  `sells: float | None`, `buy_count: int`, `sell_count: int`, `transaction_count: int`,
  `filer_count: int`, `company_count: int`, `excluded_no_price_count: int`, `has_data: bool`,
  `derived: bool` (always `True`), `caveats: list[str]`.
- **`GET /v1/sectors/{group}/insider-flow`** (place beside the other `/sectors/{group}/*` routes;
  a sub-path so route-ordering vs `/sectors/{group}` is not a concern). `Depends`
  `get_sector_insider_flow_repo`. Read `repo.get(group)` (latest `as_of`):
  - **row present** → map fields, `has_data=True`, `transaction_count = buy_count + sell_count`,
    `net/buys/sells` populated (**AC-6**).
  - **no row** → `has_data=False`, `net/buys/sells = None`, counts `0`, `as_of=None`, window with
    `days` from a default but `start/end=None` (**AC-7** — honest N/A, never a fabricated `0`).
  - `peer_basis = f"SIC {settings.secfin_peer_sic_digits}-digit"`; `group_label = sic2_label(group)`
    (matches the sibling endpoints; unknown/uncovered group → empty payload, same semantics —
    **AC-8**).
  - `caveats` = a module-level `_INSIDER_FLOW_CAVEATS` constant (**AC-12/13**):
    1. *Derived rollup* — "Sector net buy/sell is a **derived aggregate** summing individual
       companies' reported insider transactions."
    2. *Reporting lag* — "Forms 3/4/5 are filed after the transaction date; the most recent window
       may be incomplete."
    3. *Coverage* — "Aggregated only over companies and filings ingested so far; not every filer."
    4. *Scope* — "**Open-market purchases (P) and sales (S) only** — grants, option exercises,
       gifts, and tax-withholding are excluded."
    **Do NOT** include the 13F long-only / ~45-day derived-trade caveat (Forms 3/4/5 are *reported*
    transactions — **AC-13**). No individual insider is named (**AC-14**).
- **`api/main.py`**: add `get_sector_insider_flow_repo()` dependency mirroring
  `get_sector_theme_score_repo()` (construct `SQLiteSectorInsiderFlowRepository(settings.
  secfin_db_path)`), and register it the same way (lifespan/close wiring if the siblings do).
- **Tests (FastAPI TestClient, no network)**: seed `sector_insider_flow` via the repo, then:
  - **AC-6** GET returns 200 with the full contract, `transaction_count = buy_count+sell_count`,
    `derived=True`, all four caveats present, none mentioning 13F/long-only/45-day.
  - **AC-7** GET an unseeded group → 200, `has_data=False`, `net/buys/sells = null`.
  - Assert the handler touches only the repo (no SEC client constructed on this path).

### B6 · Docs — `docs/DATA_MODEL.md` (+ light `CLAUDE.md` layout note)

- **`docs/DATA_MODEL.md`**: document (a) the new `transaction_code` field on insider transactions
  and (b) the **sector insider-flow derivation** — open-market P/S only, value = shares × price in
  reported USD, trailing-window, a **derived rollup** with the reporting-lag + coverage caveats, and
  explicitly that it is **not** 13F-style (reported, not snapshot-diffed). Guardrail 3 (mapping.py)
  does **not** apply — this is not a new GAAP canonical concept, so `normalize/mapping.py` is
  untouched; DATA_MODEL.md is the right home.
- **`CLAUDE.md`** repo-layout + Common-commands: add `analytical/sector_insider_flow.py`, the two
  new `storage/` repo files, the new endpoint in the `api/routes.py` summary line, and the
  `python -m secfin.analytical.sector_insider_flow` batch command. (Small, keeps the map honest.)

---

## Frontend (senior-frontend-engineer) — after B1–B6 land, same branch

### F1 · Wire the Insider-flow card — `api/static/sectorapp.js` (+ CSS if needed)

Replace `insiderPlaceholderHtml()` (currently in `geoInsiderRowHtml`, ~L1005). **Leave
`geoPlaceholderHtml()` (Geographic mix) as the placeholder — that's P6b.**

- **Fetch** lazily, keyed by group, exactly like `state.spreads[g]`: add `state.insiderFlow = {}`;
  a `loadInsiderFlow(g)` that GETs `/v1/sectors/{g}/insider-flow`, stores the payload, re-renders if
  still selected; on failure cache an honest empty (`{ has_data:false, _error:true }`) and render an
  error/N/A state (no bare `undefined`/`NaN`). Trigger it from the same place the per-sector spreads
  fetch is triggered for the selected group (~L197).
- **Render** the real card (same `pa-card pa-insider` shell, drop `pa-ph`):
  - **has_data** → headline **net** (signed, e.g. `+$12.4M` / `−$5.7M`), a buys-vs-sells breakdown,
    `transaction_count` transactions · `filer_count` filers, and the **window label** (from
    `window.label`/`as_of`) (**AC-9**). Show `excluded_no_price_count` if > 0 as a small note.
    **Sign is a value, not a verdict** — keep it value-neutral in color (the F4 favorability color is
    the scorecard-trend-chip exception only; do **not** color net green/red). Use the app's existing
    number/`fmtUSD`-style formatter.
  - **has_data=false** (or error) → an explicit **"No insider data"** N/A state — **never `$0`** and
    never a fabricated figure (**AC-10**). Distinguish loading (fetch in flight) from resolved-empty.
  - Surface the `caveats` via the card's existing hint/caveat affordance (a "derived rollup ·
    reporting lag · open-market P/S only" footnote is enough inline; full list available like the
    other cards) (**AC-12/13**).
  - Theme-aware, CSP-safe, vendored assets only; match the sibling scorecard cards + STYLE_GUIDE
    (**AC-11**).
- **e2e**: extend the Docker headless render check to a sector with seeded flow → card shows the
  figure; and a no-data sector → N/A state (no `$0`, no `NaN`). Eyeball both screenshots (light +
  dark) before handoff.

---

## Acceptance-criteria → concrete checks (for QA)

| AC | Check | Owner |
|----|-------|-------|
| AC-1 | Parser test: mixed-code fixture → `transaction_code` per row; P/S distinct | backend |
| AC-2 | Batch test: A/M/G/F rows contribute 0; only P/S move totals | backend |
| AC-3 | Batch test: P row w/ NULL price excluded from `buys`, `excluded_no_price_count`++ | backend |
| AC-4 | Batch test: SIC-2 grouping from `company_profiles`; no-profile CIK excluded, no crash | backend |
| AC-5 | Batch test: out-of-window txn excluded; window fields stored | backend |
| AC-6 | Endpoint test: full contract, `transaction_count`, `derived=True`, caveats present | backend |
| AC-7 | Endpoint test: unseeded group → `has_data=false`, `net/buys/sells=null` | backend |
| AC-8 | Endpoint test: uncovered group → empty payload, sibling semantics | backend |
| AC-9 | e2e/manual: card shows net + breakdown + counts + window | frontend |
| AC-10 | e2e/manual: no-data sector → "No insider data", never `$0`/`NaN` | frontend |
| AC-11 | e2e: theme-aware, CSP-safe, matches STYLE_GUIDE | frontend |
| AC-12/13 | Endpoint + card carry derived-rollup + reporting-lag + coverage + P/S-only; **no** 13F caveat | both |
| AC-14 | Card names no individual insider | frontend |
| AC-15 | `pytest` green (incl. existing insider tests) + Docker e2e green | both |
| AC-16 | No throttle/User-Agent change; no live SEC call on the request path | backend |

## Open items carried from the brief (resolved here)

- **D-1/D-5** window = 90d default, anchored on `transaction_date`; zero/NULL-price P/S excluded from
  value but counted; amendments (3/A etc.) counted like any other filing (the cache already
  de-dupes by accession, so no double-count). Documented in the batch module docstring.
- **D-2** store keyed `(peer_group, as_of, window_days)`; endpoint reads the **latest** `as_of`.
- **D-3** parser change is additive; legacy cached rows carry NULL code and are simply excluded
  (covered by the coverage caveat); true re-population is the ops re-warm (D-4), not a build gate.
- **D-4** operator may re-warm a sector's insider cache before the 4b hands-on gate so the card shows
  a populated figure rather than N/A — surfaced at QA/operator time.

## Handoff → Senior Engineer(s)

**Full-stack, backend FIRST.** `senior-backend-engineer` owns **B1→B6** (parser+schema, cache
persist+migration, DuckDB batch, materialized repo, endpoint+model+wiring, docs) — land the endpoint
+ JSON contract with `pytest` green via Docker. Then `senior-frontend-engineer` owns **F1** on the
**same branch** — wire `sectorapp.js`'s Insider-flow card to the endpoint, N/A-never-0, verify with
the Docker e2e headless render (light + dark). Branch off `master` at the start of B1.

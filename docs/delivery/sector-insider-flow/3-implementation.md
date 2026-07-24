# P6a — Sector Insider flow — Implementation (backend) + frontend handoff

Stage 3 (Senior Backend Engineer) handoff. Branch: `sector-insider-flow` (off `master`). Reads:
`2-architecture.md`. **Backend B1–B6 landed, tested, and verified end-to-end. Frontend F1 is next
on the same branch.**

## What shipped (backend)

| Item | Files |
|------|-------|
| B1 · capture SEC `transaction_code` (P/S/M/A/G/F) on parse | `normalize/schema.py` (`InsiderTransaction.transaction_code: str\|None`), `sec/insider.py` (`_row_fields` reads `transactionCoding/transactionCode`) |
| B2 · persist code in the insider cache + additive migration | `storage/sqlite_insider_repository.py` (`transaction_code TEXT` column, `_ensure_columns()` guarded `ALTER TABLE` for pre-existing DBs, row round-trip) |
| B3 · aggregation batch (DuckDB, offline, batch-only) | `analytical/sector_insider_flow.py` (`compute_/run_sector_insider_flow`, `python -m …`) |
| B4 · materialized store | `storage/sector_insider_flow_repository.py` (ABC + `SectorInsiderFlowRow`), `storage/sqlite_sector_insider_flow_repository.py` (`sector_insider_flow` table) |
| B5 · endpoint + model + wiring | `normalize/schema.py` (`SectorInsiderFlow`, `InsiderFlowWindow`), `api/routes.py` (`GET /v1/sectors/{group}/insider-flow`, `_INSIDER_FLOW_CAVEATS`, dep getter), `api/main.py` (state + close), `config.py` (`secfin_insider_flow_window_days=90`) |
| B6 · docs | `docs/DATA_MODEL.md` (transaction_code + sector-flow derivation), `CLAUDE.md` (layout + batch command) |

**Method (locked):** open-market **P/S only**; value = `shares × price_per_share` in reported USD;
trailing window (default 90d) anchored on `transaction_date`; grouped by SIC-2 from
`company_profiles`. Missing-price P/S rows excluded from sums but counted
(`excluded_no_price_count`). A group with no in-window open-market value produces **no row** → the
endpoint renders N/A. DuckDB is **batch-only**; the endpoint reads the SQLite store via the repo.

## JSON contract the frontend consumes

`GET /v1/sectors/{group}/insider-flow` → 200 (always 200; empty is honest N/A, not 404).

**Seeded (`has_data: true`):**
```json
{
  "group": "35",
  "group_label": "Industrial & Commercial Machinery & Computer Equipment",
  "peer_basis": "SIC 2-digit",
  "as_of": "2026-06-30",
  "window": { "days": 90, "start": "2026-04-01", "end": "2026-06-30", "label": "last 90 days" },
  "unit": "USD",
  "net": 1000.0, "buys": 2000.0, "sells": 1000.0,
  "buy_count": 2, "sell_count": 1, "transaction_count": 3,
  "filer_count": 2, "company_count": 2, "excluded_no_price_count": 0,
  "has_data": true, "derived": true,
  "caveats": ["Sector net buy/sell is a DERIVED aggregate …", "…reporting lag…", "…coverage…", "Open-market purchases (P) and sales (S) only …"]
}
```

**No data (`has_data: false`):** `net`/`buys`/`sells` = **`null`**, `as_of` = `null`,
`window.start`/`window.end` = `null`, `window.days` = 90 (default still reported), counts = 0,
`derived: true`, `caveats` still present. **Render N/A — never `$0`, never `NaN`.**

## Frontend F1 — what to build (senior-frontend-engineer, same branch)

Replace `insiderPlaceholderHtml()` in `src/secfin/api/static/sectorapp.js` (~L1005, inside
`geoInsiderRowHtml`). **Leave `geoPlaceholderHtml()` as the placeholder — that's P6b.**

- Lazy-fetch keyed by group, mirroring `state.spreads[g]`: add `state.insiderFlow = {}`, a
  `loadInsiderFlow(g)` GET, re-render on arrival; failure → cache an honest empty and render N/A
  (no bare `undefined`/`NaN`). Trigger alongside the selected-group spreads fetch (~L197).
- **has_data** → headline **net** (signed, e.g. `+$12.4M` / `−$5.7M`), buys-vs-sells breakdown,
  `transaction_count` transactions · `filer_count` filers, and the `window.label`. Show
  `excluded_no_price_count` if > 0 as a small note. **Keep the sign value-neutral in color** — the
  F4 favorability color is the scorecard-trend-chip exception ONLY; do not color net green/red.
- **has_data=false / error** → explicit **"No insider data"** N/A state — never `$0`, never a
  fabricated figure. Distinguish loading vs resolved-empty.
- Surface caveats via the card's hint/caveat affordance (inline "derived rollup · reporting lag ·
  open-market P/S only" is enough; full list like the sibling cards). Name **no** individual insider.
- Theme-aware, CSP-safe, matches the sibling scorecard cards + STYLE_GUIDE.
- Verify with the Docker e2e headless render (seeded + no-data), eyeball light + dark screenshots.

**Note for the operator/QA (D-4, coverage):** on a stock volume the target sector may legitimately
read **N/A** until the insider cache is warmed with the new parser (legacy cached rows carry NULL
`transaction_code` and are excluded). Re-warming is an ops step (clear the target CIKs' insider
cache, re-run `insider_backfill`, then `python -m secfin.analytical.sector_insider_flow`), **not** a
build gate — the N/A state is the honest, correct behavior when data is absent.

## How it was verified

- **`pytest` (Docker, with `.[dev,analytical]`): 530 passed.** New/changed:
  `tests/test_sector_insider_flow.py` (repo round-trip; DuckDB batch AC-2/3/4/5 open-market-only,
  exclusions, SIC grouping, window, absent-not-zero; endpoint AC-6/7/8 incl. "no 13F caveat"
  assertion), `tests/test_insider.py` (transaction_code capture + open-market S distinct + holding
  None), `tests/test_insider_repository.py` (code round-trip + pre-`transaction_code` DB migration).
- **`ruff check` + `ruff format --check`** clean on all new/edited files (pre-existing B008 FastAPI
  `Depends`-in-defaults idiom untouched — every route uses it).
- **End-to-end live** (real batch → real endpoint via TestClient): seeded group 35 → `net=1000`,
  `transaction_count=3`, `filer_count=2`, correct 90-day window, all 4 caveats present, **no**
  13F/long-only/45-day/snapshot language; option-exercise (M) correctly excluded; empty group 99 →
  `has_data=false`, `net/buys/sells=null`, `as_of=null` (N/A, never $0).

## Guardrails honored

Track-1 only; DuckDB **batch-only** (endpoint reads SQLite via the repo — guardrail 6/7); DB behind
a repository interface, no raw SQL in the API (guardrail 5); SEC compliance untouched (no live SEC
call on the request path; no throttle/User-Agent change); CIK as `int`; values in **raw reported
USD** with `unit` carried; **N/A never 0**; derived-rollup labeled with the correct **reported**
(not 13F) caveats. No new base dependency (analytical extra only, already present).

---

## What shipped (frontend F1) — same branch

| Item | Files |
|------|-------|
| Real Insider-flow card replacing the placeholder | `api/static/sectorapp.js` (`insiderCardHtml()` + `signedUsd()`; `geoInsiderRowHtml` now calls it; `state.insiderFlow` + lazy fetch in `ensureSectorData`) |
| Card styles (native to the paper-terminal) | `api/static/sectorapp.css` (`.pa-insider-net/-figure/-dir/-break/-counts/-foot`) |
| e2e seed for the demo Sector view | `scripts/seed_fixture.py` (`_seed_sector_insider_flow`: groups 35 net-buying, 73 net-selling, 60 flat; **28 left empty → N/A card**) |
| e2e coverage of the N/A state | `scripts/headless_check.js` (new `sectorapp-insider-na` → `/sectors?group=28`; stale "placeholder" comment updated) |

**Design.** The net figure is the card's signature: mono, tabular, **signed** (`↑ +$12.4M` /
`↓ −$8.3M`), with a **direction arrow (↑/↓/→) + a single neutral accent tint** (the app's terracotta
`--accent-ink`, the **same** for both directions) and a `NET BUYING` / `NET SELLING` / `NET FLAT`
word. Direction is carried by the arrow + word, **never by a green/red good-bad color** — so no
STYLE_GUIDE favorability-color deviation is created (the F4 delta chip stays the sole such
exception). Reuses the `.pa-card` shell + mono/token vocabulary. *(The arrow + accent tint was added
in QA cycle 1 at the operator's request for a quicker read; the original was plain-ink uncolored.)* States: **loading** (spinner),
**populated** (net + buys/sells + counts + window label + `N with no reported price excluded` when
>0), **N/A** ("No insider data … Shown as N/A, not zero." — never `$0`), and **error** (same honest
N/A). Full payload caveats travel in the foot's `title` (hover). The real card is a solid `.pa-card`;
the Geographic-mix beside it stays a **dashed placeholder** (P6b) — an honest visual distinction
between "real panel, no data" and "not built yet".

## How the frontend was verified

- `docker compose build api` then the e2e headless render check. **My two shots pass with
  `errors=0`:** `sectorapp` (default sector = group 73 → populated **−$8.3M · NET SELLING**, buys/
  sells/counts/window all correct) and `sectorapp-insider-na` (group 28 → the honest N/A card).
  **Screenshots eyeballed** (`data/e2e-shots/sectorapp.png`, `sectorapp-insider-na.png`): both states
  legible, native, honest; net value uncolored; placeholder contrast correct.
- **`pytest` still green** (backend unchanged since the 530-pass run; frontend is JS/CSS + a seed
  script not exercised by pytest).

### ⚠️ Pre-existing e2e artifact (NOT this change) — QA please note

The overall `HEADLESS CHECK` exits **FAIL** in this sandbox, but **only** on the pre-existing
`sectorapp-company` / `sectorapp-company-refocus` shots (synthetic filer `?symbol=900001`), with
`502` console errors. Root cause: the **company-view sparkline** fetches
`/v1/companies/900001/metrics/net_margin/history` (pre-existing code, `sectorapp.js:1260`, **not in
this diff**); for the synthetic filer it misses the cache and falls through to SEC, which is
**unreachable in this no-network sandbox → 502** (it would be a graceful `404` with network). Proof
it is not mine: (a) `git diff master -- static/` shows my diff never touches the history-fetch path;
(b) direct curl confirms `/v1/companies/900001/metrics/net_margin/history` → 502 while
`/v1/sectors/35/insider-flow` → 200; (c) it reproduces deterministically and is a backend/network
condition a frontend change cannot cause. **QA: re-run the e2e in a networked environment** — the
company shots should return to green there; the Insider-flow shots already pass here.

## What QA should probe

- Both card states in the real app: a populated sector (35/73/60 in the demo seed) and the **N/A**
  sector (28) — confirm N/A reads "No insider data …", **never `$0`/`NaN`**.
- The **net = 0 but has_data** case (group 60): should read `$0 · NET FLAT` (honest — buys offset
  sells, data present), distinct from the N/A empty state.
- Caveats present + correct: derived-rollup + reporting-lag + coverage + open-market-P/S-only; **no**
  13F long-only/45-day/snapshot language (hover the foot for the full list).
- Both themes (light/dark) and narrow-width (the geo/insider row collapses to one column ≤ a
  breakpoint) — no overflow, net figure legible, uncolored.
- Endpoint contract directly: `GET /v1/sectors/{group}/insider-flow` for a seeded and an unseeded
  group.

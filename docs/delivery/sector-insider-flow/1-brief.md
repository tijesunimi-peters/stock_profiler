# P6a — Sector Insider flow — Product brief

Stage 1 (Product Manager) handoff. Task slug: `sector-insider-flow`.
Source of truth: `docs/ROADMAP_SECTOR_APP_V2.md` P6 (operator decision 2026-07-24: build both P6
spikes, **Insider flow first**); state in `docs/delivery/_active.md`.

## Problem / user

The Sector view's **Insider flow** card is an honest placeholder ("insider transactions are ingested
per company, not aggregated by sector yet"). A user comparing sectors on the paper-terminal app can
see health scores, decomposition, and dispersion — but not the one behavioral signal they most expect
next to those: **are insiders across this sector net buying or net selling?**

The underlying data already exists in our stores: per-CIK Forms 3/4/5 insider transactions
(`sec/insider.py` + the insider repository, with `ingest/insider_backfill.py` to warm the cache) and
CIK→SIC (`company_profiles`). What's missing is a **sector-aggregation layer** and a read endpoint —
not a new ingest project. This makes the placeholder real.

**Who it serves:** an analyst/developer using the Sector view to size up a SIC sector; "we'd know it's
solved" when the Insider-flow card shows a real, correctly-caveated net buy/sell for sectors we have
data for, and an honest **N/A** (never `$0`) for sectors we don't.

## Scope (smallest slice that delivers value)

Full-stack, **backend first**, one branch off `master`.

1. **Capture the SEC transaction code.** The parser currently keeps `acquired_disposed` (A/D) but not
   the `transactionCoding/transactionCode` (P/S/M/A/G/F…). Add it to the parse path + schema so we can
   isolate **open-market** activity. (Operator decision below: flow = open-market P/S only.)
2. **Sector-aggregation batch (analytical/offline).** Sum insider transaction **value** (shares ×
   price) into per-SIC-group **buys / sells / net** over a trailing window, into a new materialized
   store (a `sector_insider_flow` table + repository, mirroring `sector_theme_score_repository`).
   Reuse the cached per-CIK insider rows + `company_profiles` SIC. DuckDB/analytical **batch-only** or
   pure-Python — never on the request path; single-writer if it touches the bulk path.
3. **Read endpoint** `GET /v1/sectors/{group}/insider-flow` — reads the materialized store only
   (like the other sector endpoints), returns the canonical JSON contract below. No DuckDB, no raw SQL
   in the API, DB behind a repository interface.
4. **Wire the app panel.** Replace `insiderPlaceholderHtml()` in `sectorapp.js` with a real card
   consuming the endpoint: trailing-window net figure + buy/sell breakdown + counts + caveats. N/A
   state when the sector has no data.

### Operator decisions (locked 2026-07-24)

- **Flow definition = open-market only (P/S).** Buys = Σ(shares×price) where transactionCode == `P`;
  Sells = Σ(shares×price) where transactionCode == `S`; Net = Buys − Sells. Grants, option exercises
  (M), awards (A), gifts (G), and tax-withholding (F) are **excluded** and disclosed as excluded. This
  is the defensible "insider conviction" signal, not "all acquired vs disposed."
- **Panel shape = trailing-window single figure.** One net buy/sell over a trailing window (window
  length is the architect's call — recommend ~90 days; state it in the copy), with the buy/sell
  breakdown and a transaction + distinct-filer count. Matches the compact card it replaces.

## Out of scope (do not build)

- **No P6b Geographic/segment (ASC 280) work** — that's the separate follow-on `/deliver`.
- **No new per-CIK insider ingest project.** Reuse existing ingest/cache; a coverage caveat covers gaps
  rather than a market-wide backfill being a gate. (If a small cache-warm is needed for a demoable
  sector, that's an operator/ops call, not new code.)
- **No Track-2 / free-text / LLM.** No per-insider narrative, no "why."
- **No individual insider names, no per-company drill** in this card — sector aggregate only.
- **No price/market-data enrichment.** Value uses the reported `price_per_share`; transactions with no
  reported price are handled per the AC below, not by fetching a market price.
- **No 13F / derived-trade framing.** Forms 3/4/5 are *reported* transactions; do NOT attach the 13F
  long-only / ~45-day-lag "derived trade" caveat. (The sector *rollup* is derived; see honesty ACs.)

## Acceptance criteria (what QA will verify)

**Data / aggregation**
- **AC-1** The parser captures the SEC `transactionCode`; a Form 4 with mixed codes yields rows where
  open-market purchases are `P` and sales are `S`, distinct from grants/exercises/gifts (M/A/G/F).
- **AC-2** Sector net flow counts **only** open-market `P` (buy) and `S` (sell) rows. A fixture with a
  grant (A), an option exercise (M), a gift (G), and a tax-withholding (F) contributes **zero** to
  buys/sells/net; only the P and S rows move the totals.
- **AC-3** Buys/sells are Σ(shares × price_per_share) in reported USD; net = buys − sells. Values are
  in raw reported units (no silent rescaling). A P or S row with a **missing price** is excluded from
  the value sums and its exclusion is reflected in a reported count (not silently treated as $0 value).
- **AC-4** Aggregation groups companies by the same **SIC group** basis the other sector endpoints use
  (`peer_basis` = `SIC {n}-digit`), reading SIC from `company_profiles`; a company with no SIC profile
  is excluded (and does not crash the batch).
- **AC-5** The trailing window is anchored to transaction date and its length is stated in the API
  response and the UI copy; the same window drives buys, sells, net, and counts.

**Endpoint / contract**
- **AC-6** `GET /v1/sectors/{group}/insider-flow` returns 200 with: `group`, `peer_basis`,
  `window` (label + start/end dates), `net`, `buys`, `sells`, `unit` ("USD"), `transaction_count`,
  `filer_count` (distinct reporting owners), `excluded_no_price_count`, and `as_of`/coverage metadata.
  It reads **only** the materialized store — no SEC fetch, no DuckDB, no raw SQL on the request path.
- **AC-7** A sector with **no** insider data returns an honest empty/`null` payload (fields `null`, a
  clear "no data" indicator) — **never** fabricated `0` values presented as a confirmed zero net-flow.
- **AC-8** `GET`ting a group that isn't a valid/covered SIC group behaves consistently with the other
  `/v1/sectors/{group}/*` endpoints (same not-found / empty semantics).

**UI (Sector view · Insider flow card)**
- **AC-9** The placeholder card is replaced by a real card showing: net buy/sell (signed), the
  buys vs sells breakdown, transaction count, distinct-filer count, and the trailing-window label.
- **AC-10** A sector with no data renders a clear **N/A / no-insider-data** state — **never `$0`** and
  never a fabricated figure. Loading and error states are handled (no bare `undefined`/`NaN`).
- **AC-11** The card is theme-aware (light/dark), CSP-safe (no external assets), and matches the
  paper-terminal STYLE_GUIDE + the sibling scorecard cards.

**Honesty (the brand — non-negotiable, baked into the above)**
- **AC-12** The card and the endpoint label the sector figure as a **derived / aggregated rollup**
  (it is computed by summing per-company reported transactions).
- **AC-13** Caveats carried, in copy the user can see: (a) **reporting lag** — transaction date to
  filing date differs; recent activity may be incomplete; (b) **coverage** — aggregated only over
  companies/filings we've ingested; not every filer; (c) **scope** — **open-market P/S only**;
  grants/exercises/gifts/tax excluded. The **13F long-only/45-day derived-trade caveat is NOT used**
  (Forms 3/4/5 are reported transactions).
- **AC-14** No individual insider is named in the sector card; it is a sector aggregate.

**Regression / compliance**
- **AC-15** Existing insider endpoints/tests still pass (schema/parser change is additive). `pytest`
  green; Docker e2e render check green.
- **AC-16** SEC compliance untouched: no throttle/User-Agent change; the aggregation is offline/batch
  and does not add live SEC calls to the request path.

## Risks / open decisions (for the architect)

- **D-1 (architect) — aggregation grain + window.** Trailing-window length (recommend ~90 days),
  anchored on transaction date. Confirm interaction with the reporting-lag caveat (a fresh window is
  necessarily under-filled).
- **D-2 (architect) — materialized-store shape.** New `sector_insider_flow` table + repository (per
  `(group, window/as_of)` key), mirroring `sector_theme_score_repository`. Confirm whether the window
  is stored as a single "latest" row per group or keyed by as_of date.
- **D-3 (architect) — parser change surface.** Adding `transactionCode` touches
  `normalize/schema.InsiderTransaction`, `sec/insider.py`, and the insider repository's persisted
  columns (does the cache need a migration/backfill so cached rows carry the code?). Keep it additive;
  flag if cached rows lacking the code force a re-parse.
- **D-4 (ops, not code) — coverage for a demoable sector.** Whether to warm the insider cache for a
  chosen sector so the operator's 4b hands-on gate shows a populated card vs an honest N/A. Not a build
  gate; surface at QA/operator time.
- **D-5 — dilutive edge cases.** Zero-share or zero-price P/S rows, amendments (3/A,4/A,5/A) — define
  handling (recommend: exclude zero-value from sums, count amendments once). Principled + documented.

## Handoff → Principal Architect

Design against the ACs above. Key constraints to honor: Track-1 only; DuckDB/analytical **batch-only**
(endpoint reads a materialized SQLite store like the sibling sector endpoints); DB behind a repository
interface, **no raw SQL in the API**; single-writer in any bulk path; SEC compliance untouched;
**open-market P/S only**; **N/A never 0**; **derived rollup labeled**, reporting-lag + coverage caveats
present, **no 13F derived-trade caveat**. Backend first (parser + batch + endpoint + pytest + JSON
contract), then wire `sectorapp.js` on the same branch. Interactive view → operator hands-on gate at
4b.

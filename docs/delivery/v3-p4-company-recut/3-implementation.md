# 3 — Implementation: V3-P4

**Branch:** `v3-p4-company-recut` (off `master` @ `02a76c9`) · **Stage 3**

---

## Part A — Backend (`senior-backend-engineer`) ✅ DONE

Two read-only endpoints. No ingest change, no new canonical concept (so `normalize/mapping.py`
and `docs/DATA_MODEL.md` are untouched — guardrail 3 does not fire), no new dependency, no DuckDB,
no SEC-compliance change. `sec/`, `ingest/` and `storage/` are unmodified — the existing
`CompanyProfileRepository` is reused as-is.

### Files changed

| File | Change |
|---|---|
| `src/secfin/normalize/schema.py` | +`CompanyProfileInfo`, +`CondensedStatement{,Column,Row}` |
| `src/secfin/normalize/viz.py` | +`condensed_statement()` — pure transpose, no I/O |
| `src/secfin/api/routes.py` | +2 public GETs, +`_CONDENSED_{DEFAULT,MAX}_LIMIT` |
| `tests/test_condensed_statement.py` | **new** — 8 pure + 7 endpoint tests |
| `tests/test_company_profile_route.py` | **new** — 3 route tests |

### The JSON contract the frontend consumes

**B1 · `GET /v1/companies/{symbol}/profile`** — verified live:

```json
{"cik":320193,"name":"Apple Inc.","sic":"3571",
 "sic_description":"Electronic Computers","source":"SEC EDGAR filer index (SIC assignment)"}
```

- Pure operational-store read: **no facts fetch, no SEC call** beyond cached ticker→CIK. Cheap
  enough to sit alongside the page's other page-load requests.
- **A company with no ingested profile row → 200 with `name`/`sic`/`sic_description` all `null`**,
  not a 404 and not an empty string. Null is the load-bearing answer: **the frontend must OMIT a
  null field, never render it as a blank or `—` cell** (AC-6). An unknown *ticker* is the 404.
- Deliberately narrow — see §"What is NOT servable" below before adding a field to the card.

**B2 · `GET /v1/companies/{symbol}/statements/{statement}/condensed`**
`?period=FY&limit=4` (`limit` 1–8, default 4; `statement` ∈ income·balance·cashflow)

```jsonc
{ "cik":320193, "statement":"income", "period_type":"FY",
  "columns":[{"fiscal_year":2022,"fiscal_period":"FY","period_end":"2022-09-24",
              "form":"10-K","filed":"…","accession":"…"}, …],        // OLDEST -> NEWEST
  "rows":[{"canonical_concept":"interest_expense","label":"Interest Expense","unit":"USD",
           "values":[2931000000, 3933000000, null, null],             // aligned to columns
           "unit_mixed":false}] }
```

- **`values[i] === null` means that period did not report the line.** Never 0, never dropped,
  never carried forward. That real AAPL example is genuine: Apple stopped breaking out
  `interest_expense` after FY2023. **Render those as N/A** (AC-8, AC-23).
- `values.length === columns.length` always.
- Row order = union of concepts walked **newest column first**, so the latest filing's own
  presentation order wins; a line only older filings carried still appears, after them.
- `unit_mixed:true` ⇒ the concept's unit differs across columns; `unit` is the newest column's.
  Surface it rather than silently presenting two scales as one row.
- Empty (no periods of that type) → **200 with empty `columns`/`rows`**, an honest "nothing to
  condense". Unknown ticker → 404. `limit` out of bounds / bad statement → 422.

### How it was verified (driven, not just tested)

| Check | Result |
|---|---|
| `docker compose --profile test run --rm test` | **572 passed, 9 skipped, 0 failed** |
| `/profile` AAPL · WMT · unknown ticker | name+SIC returned · returned · **404** |
| **"One fact, one source"** — every condensed cell vs. the single-period `/statements/{s}` across income+balance+cashflow × 4 periods | **296 cells checked, 0 mismatches** |
| Real gaps render as `null` | `interest_expense [2931000000, 3933000000, null, null]` ✅ |
| Column ordering | oldest→newest confirmed on all three statements |
| `limit=0` / `limit=99` / `statement=bogus` | 422 / 422 / 422 |
| `period=Q3&limit=3` | `[(2023,Q3),(2024,Q3),(2025,Q3)]`, 20 rows |
| Default limit | 4 columns |
| `ruff check` | **new code clean**; the 2 remaining `E501` in `viz.py` (:553, :770) and all `B008` are **pre-existing on `master`** (107 errors on master → my additions are the FastAPI `Depends`/`Query` idiom the file already uses 100×) |

### ⚠️ What is NOT servable — do not try to add it to the identity card

Probed the live volume (1,153,678 facts). **The SEC's companyfacts API carries NUMERIC facts
only**, so these are structurally absent from our store — not an ingest gap that could be closed:

- `dei:AuditorName`, `EntityFilerCategory`, `EntityIncorporationStateCountryCode`, NAICS, HQ
  address — all **text** facts → **zero rows**.
- `EntityNumberOfEmployees` — **7 rows in the entire database**. Effectively absent.
- Only `EntityCommonStockSharesOutstanding` (2,856) and `EntityPublicFloat` (934) are real.

Five of the prototype's ten identity fields are therefore **omitted from the card**, per AC-6 and
the same reasoning V3-P2 used for the entity bar's "Peer set" cell.

---

### Handoff the backend left for the frontend — all now actioned (kept as the record)

**Operator decision received mid-build (2026-07-27), supersedes architecture §4:**
> *"Forget the balanceMatrix and match the prototype design, we can decide on where the balance
> matrix should be later."*

So the Overview §02 condensed-statements card is **uniformly the prototype's multi-period table
across all three tabs** (income · balance · cash flow) — B2 serves all three identically.
`ClearyFi.balanceMatrix` is **not** used in this card; where it eventually lives is a later call.
The full statement surface moving into Financial history still keeps its existing viz charts
(AC-20) — that is unchanged by this decision.

**Reminders that would have bitten if missed — each one did apply:**
1. `shell.js` `VIEW_ALIASES` **before** `resolveView()`'s fallback, or `/company/AAPL/statements`
   silently renders Overview (a wrong page, not an error).
2. `scripts/headless_check.js:209–212` asserts the OLD slugs — `company-path-view` → `history`,
   `company-path-unknown` → `hub`.
3. Sparklines come free from `/metrics`' per-metric `trend` array — **≤4 intra-year quarters, NOT
   the prototype's "trailing 8 quarters"**. Label honestly; render none below 2 points.
4. `/metrics` serves **30** metrics, `CATEGORIES` lists 26 — add `equity_multiplier` (Financial
   health) and `dio`/`dpo`/`ccc` (Efficiency) with formulas.
5. e2e baseline recorded in `0-e2e-baseline.md`: 37 shots, 0 threw, exactly 2 with errors
   (`sectorapp-company`=8, `sectorapp-company-refocus`=14).

---

## Part B — Frontend (`senior-frontend-engineer`) ✅ DONE

Same branch. The company hub is re-cut: **Fundamentals + Statements → Overview + Financial history.**

### Files changed

| File | Change |
|---|---|
| `static/shell.js` | `VIEWS.companies` re-cut; **`VIEW_ALIASES`** consulted before the unknown-slug fallback |
| `static/company.js` | `renderOverview()` + `renderHistory()` replace `renderFundamentals()`/the Statements tab; explorer; identity; condensed card; tile wiring; 4 previously-invisible metrics added |
| `static/app.js` | +`ClearyFi.metricTile()`, +`ClearyFi.metricSeriesChart()`, +`compactNumber()` |
| `static/app.css` | tile + drawer styles (shared component layer) |
| `static/company.css` | the two views' page layout: sections, identity, EX-21, condensed table, explorer |
| `static/components.html` | tile (4 states) + series chart (4 states); **added the missing vendored Plot script** |
| `scripts/headless_check.js` | 2 corrected assertions, 5 new shots, 4 driven interactions |

### Design fidelity

The prototype was opened **before** any CSS was written (`hub` :799-1577, `history` :1578-1679,
condensed :888-962, tiles+drawer :964-1010, EX-21 :862-879). No new tokens were needed —
`style.css` already carries the prototype's exact palette, and `.section-head` already matched its
numbered-section treatment.

### Verification

`docker compose --profile e2e up --abort-on-container-exit --exit-code-from e2e`

| | `master` baseline | this branch |
|---|---|---|
| shots | 37 | **42** (+5 new) |
| shots that **threw** (`FAILED`) | 0 | **0** |
| shots with `errors>0` | 2 (`sectorapp-company` 8, `-refocus` 14) | **2, the same two** (8, 13–14; drifts) |

`pytest`: **572 passed, 9 skipped.** No new failing shot, no shot moved 0 → >0.

The e2e **drives** the risky behaviour rather than just loading pages: the legacy `/statements`
slug must resolve to `history` (fails loudly if `VIEW_ALIASES` regresses), a tile click must open
its drawer, a second metric must overlay and grow the legend to two entries, and a range switch
must re-render.

### Six defects found by eyeballing screenshots, all fixed

The exit code was green for every one of these — they were only visible in the images.

1. **Empty beige blocks** at the end of each tile group. The grid drew rules as a 1px gap over a
   rule-colored background, so `auto-fit`'s unfilled trailing cells rendered as large beige boxes
   that read as broken tiles. Now the tiles draw their own borders over a card-colored grid.
2. **Y-axis ticks clipped and unformatted** (`00000000 −`) whenever two series had different
   units: the mixed-unit path fell through to a raw-number formatter. Added `compactNumber`
   (`129B`) and widened the margin. The axis is still shape-only — the mixed-units note says so.
3. **Duplicated count** — the chart caption and my footer both stated "N of M periods disclosed".
   Dropped the footer copy (§ captions dedupe).
4. **An open drawer stretched its three row-mates into tall empty columns**, and squeezed its
   chart into one ~180px column. An open tile now spans the row.
5. **The drawer chart ignored its container width.** `.mtile-hist:empty { display:none }` meant
   clearing the host before measuring collapsed it to 0, so `measuredWidth` returned its 420
   fallback — a §12.6 violation in my own code. Now measured before the clear.
6. **`/components` never loaded Plot**, so every Plot-based builder silently rendered its "no
   data" state there. Pre-existing (that page only demoed d3/CSS builders); fixed by vendoring
   the script in. Also moved `.mtile*` out of `company.css` into `app.css` — a shared builder
   whose styles ship with one page breaks on the next.

### What QA should probe

- **AC-20 is the highest-consequence check.** The full statement surface moved views. Exercise
  each piece against `master`: tables, the source-tag audit column ("Show your work"), the raw-JSON
  toggle, Table/Chart mode, all three statements' viz charts, and `?stmt=segments`.
- **N/A vs 0.** The condensed card renders `N/A` from a `null`; on real AAPL data
  `interest_expense` is genuinely `[…, null, null]` for FY2024/25. Confirm no `0` anywhere.
- **Every legacy URL** in the brief's table, by hand — the alias map is the single point of failure.
- **A thin/odd company**, not just AAPL: a metric with <2 trend points must show **no** sparkline
  rather than a flat line; a company absent from `company_profiles` must simply omit Registrant/SIC
  rather than render a blank row.
- **The EX-21 block** — assert zero data rows and no fabricated entity/jurisdiction/percentage.
- **No basis toggle anywhere** (AC-22); the basis is stated in the explorer footer.
- Single light theme by design — there is no `prefers-color-scheme` in the CSS, so no dark pass.
- Known unrelated: `sectorapp-company*` errors are the pre-existing CIK-900001 fixture 502s, and
  the Institutional co-holding label collision is V3-P5's.

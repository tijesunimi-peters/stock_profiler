# Architecture: institutional-tab viz — Phase 2a (per-holder conviction heatmap)

**Role:** Principal Architect → handoff to Senior Engineer
**Task slug:** `institutional-tab-viz` (Phase 2a)
**Date:** 2026-07-18
**Designs against:** `1b-brief-phase2a-heatmap.md` (AC-1a-P2a…AC-7a-P2a) + shared AC-H1–H4 /
AC-R1–R2 in `1-brief.md`.

---

## Scope re-check (Track 1, buildable, no drift)

Pure composition over 13F holdings we already ingest — **no new SEC fetch, no new canonical
concept, no mapping.py change, no free-text, no price/market data, no DuckDB.** The one new
capability is a **bounded per-manager aggregate** (each displayed holder's total 13F book value
for one quarter). This is Track 1 and fits the existing four-stage architecture. Network graph
(Phase 2b) stays out.

**Guardrail 6 call (the one that matters here):** the book-value aggregate is a `SUM(value)
GROUP BY manager_cik` over **exactly the K holders already on screen**, served by the existing
`idx_holdings_manager_period` index. That is a *bounded point/aggregate read* — the same character
as `holders_of` — **not** the whole-quarter, all-manager inversion DuckDB was benchmarked for
(`docs/ARCHITECTURE.md` §3b, which scans every manager's book). So it belongs on the live request
path, behind the repository interface, exactly like `holders_of` and `issuer_periods`. No batch
job, no analytical store. (This resolves brief Open decision 1 in favour of bounded-live; the
requirement in AC-7a-P2a — no *unbounded* cross-manager scan — is met because K is capped.)

**Null-tolerance rule (brief Open decision 2), made deterministic:** a holder gets a weight
**only if its entire book is fully valued** (`null_value_count == 0`) **and** `book_value > 0`.
Because this issuer's rows are a *subset* of the book, "book fully valued" already implies the
numerator is fully valued — one condition covers both. Any null-valued position anywhere in the
book, or a non-positive book total, → **N/A** for that row (never a weight over a partial book).
Testable and single-branch.

---

> **⚠️ SUPERSEDED — the shipped design differs substantially (operator decisions, 2026-07-18/19,
> recorded in `4b-qa-phase2a.md`).** Final Phase 2a is an **ownership treemap**: each filer's `SH`
> shares ÷ the company's **shares outstanding** (new companyfacts join via `_facts_for_cik` +
> `_shares_outstanding_asof`; options/PRN excluded via new `IssuerHolder.put_call` /
> `shares_or_principal`). `book_values`/`BookValue` were **removed**. Still no DuckDB / no
> cross-manager scan (guardrail 6): a bounded `holders_of` composition plus one cache-aside
> shares-outstanding read. Frontend is a **d3 treemap** (vendored `d3.hierarchy`/`d3.treemap`) with
> an explicit "not reported by these filers" remainder. See `4b-qa-phase2a.md` (Round 3) and
> `docs/DATA_MODEL.md` ("ownership treemap") for the as-built design.

## The measure

For issuer *I*, quarter *Q*, and each displayed holder (manager) *m*:

```
weight(m) = ( Σ value of m's holdings of I in Q )  /  ( Σ value of ALL m's holdings in Q )
```

- One row **per manager** (a multi-class holder is deduped; the numerator sums the manager's value
  across all of *I*'s CUSIPs — mirrors how the choropleth dedups a manager across classes).
- Both sums are from the **same filing** → same value unit → the ratio is immune to the ~2023
  thousands→whole-dollars flip. Single-quarter measure; unitless fraction in `[0, 1]`.
- Denominator is the manager's **reported 13F long-book**, not AUM/portfolio.

---

## Data flow (all four stages)

```
serve: GET /companies/{symbol}/institutional-conviction?period=&top=
  -> resolve cik + cusips (existing _cik_from_symbol / _cusips_for_issuer)
  -> holders = holdings_repo.holders_of(cusips, period)     # existing, shares-DESC
  -> dedup to per-manager; take top-K distinct managers by position order
  -> books  = holdings_repo.book_values([those K ciks], period)   # NEW bounded aggregate
  -> compose rows w/ weight or N/A (+status/reason)         # pure Python, no SQL
store: SQLiteHoldingsSnapshotRepository.book_values(...)     # the only new SQL
       SELECT manager_cik, SUM(value), SUM(value IS NULL), COUNT(*) ... GROUP BY manager_cik
normalize: (none — no new canonical concept; docs note only)
sec/ ingest/: UNCHANGED
static: convictionHeatmap() in app.js + convictionSection()/mountConviction() in company.js
```

No `sec/`, `ingest/`, or `normalize/` code changes. No new store, no migration (the `value`
column already exists on `holdings`).

---

## Files to touch

### 1. `src/secfin/storage/holdings_repository.py` (interface + result type)

Add a small typed result and one abstract method:

```python
from typing import NamedTuple

class BookValue(NamedTuple):
    """One manager's reported 13F book aggregate for a quarter (see book_values)."""
    total_value: float | None   # SUM over the manager's holdings; None if the book is all-null/empty
    null_value_count: int       # positions with a NULL reported value -> book is NOT fully valued
    holding_count: int          # total positions in the book that quarter

@abstractmethod
def book_values(self, manager_ciks: list[int], report_period: str) -> dict[int, BookValue]:
    """Total reported 13F book value per manager for `report_period`, for the BOUNDED set
    `manager_ciks` (the top-K holders a conviction view is about) -- NOT all managers.

    A `SUM(value) GROUP BY manager_cik` over the existing (manager_cik, report_period) index:
    a bounded per-manager aggregate, the same character as `holders_of`, NOT the whole-quarter
    cross-manager inversion reserved for DuckDB (docs/ARCHITECTURE.md 3b, guardrail 6). Managers
    with no holdings that quarter are absent from the result (caller treats as N/A). Empty
    `manager_ciks` returns `{}`. `null_value_count` lets the caller refuse to compute a weight
    over a partially-valued book (the book value would silently undercount, inflating weights).
    """
```

### 2. `src/secfin/storage/sqlite_holdings_repository.py` (impl)

```python
def book_values(self, manager_ciks: list[int], report_period: str) -> dict[int, BookValue]:
    if not manager_ciks:
        return {}
    placeholders = ",".join("?" for _ in manager_ciks)
    cur = self._conn.execute(
        f"SELECT manager_cik, SUM(value), "
        f"       SUM(CASE WHEN value IS NULL THEN 1 ELSE 0 END), COUNT(*) "
        f"FROM holdings WHERE report_period = ? AND manager_cik IN ({placeholders}) "
        f"GROUP BY manager_cik",
        (report_period, *manager_ciks),
    )
    return {
        row[0]: BookValue(total_value=row[1], null_value_count=int(row[2]), holding_count=int(row[3]))
        for row in cur.fetchall()
    }
```

- Uses `idx_holdings_manager_period`. SQLite `SUM` skips NULLs and returns `NULL` for an all-NULL
  group → `total_value` is `None` there (correctly N/A). No raw SQL escapes to the API (guardrail 5).

### 3. `src/secfin/api/routes.py` (endpoint + caveats)

New caveats list (right after `_HOLDINGS_SERIES_CAVEATS`):

```python
_CONVICTION_CAVEATS = _ISSUER_CENTRIC_CAVEATS + [
    "Weight is this issuer's reported value as a share of the manager's total REPORTED 13F "
    "long-book (Section 13(f) long US positions only) -- NOT a share of its AUM, total "
    "portfolio, or any non-13F holdings.",
    "Numerator and denominator are from the SAME quarter's filing, so the weight is unaffected "
    "by the ~2023 thousands->whole-dollars value-unit change -- it is a single-quarter measure, "
    "not a trend.",
    "A holder whose book contains ANY unvalued position, or whose book value is non-positive, "
    "shows N/A -- never a weight computed over a partial book.",
]
```

New endpoint `GET /companies/{symbol}/institutional-conviction`:

- Params: `symbol` (path); `period: str = Query(...)` (required, `YYYY-MM-DD`); `top: int =
  Query(20, ge=1, le=50)`.
- Body: resolve `cik`/`cusips`; `holders = holdings_repo.holders_of(cusips, period)`; dedup to
  per-manager in first-appearance (shares-DESC) order, summing `value` across the manager's
  issuer rows into `issuer_value[cik]` (skip `None`), preserving `manager_name`/`issuer_name`;
  take the **first K distinct managers**; `books = holdings_repo.book_values(list(those_ciks),
  period)`; per manager compute:

  ```python
  bv = books.get(cik)
  valued = bv is not None and bv.null_value_count == 0 and bv.total_value and bv.total_value > 0
  weight = (issuer_value[cik] / bv.total_value) if valued else None
  status = "ok" if valued else "na"
  reason = None if valued else (
      "book value not yet ingested for this quarter" if bv is None
      else "book contains one or more unvalued positions" if bv.null_value_count else
      "reported book value is non-positive")
  ```

- Sort rows: `status=="ok"` first by `weight` DESC, then the N/A rows (stable, position order).
- Return `{cik, cusips, period, caveats: _CONVICTION_CAVEATS, holders: [ {manager_cik,
  manager_name, issuer_name, issuer_value, book_value, weight, status, reason} ... ]}`. `weight`
  is a fraction in `[0,1]` (frontend formats as %); `weight`/`book_value` are `None` on N/A rows,
  never `0` (AC-4a-P2a / AC-H2).
- Add an OpenAPI `responses` example block mirroring the geography endpoint's.
- **Row selection is by position size; color is by within-book weight** — document this in the
  docstring and surface it in the UI caption so a reader knows what picks the rows vs the color.

> **Not in 2a:** rank-within-book column (brief called it optional). Deferrable to a cheap
> follow-up (`COUNT(*) WHERE value > issuer_value`); leave out to keep 2a minimal.

### 4. `src/secfin/api/static/app.js` (chart)

`function convictionHeatmap(data, opts)`, mirroring `holderGeographyChart`:

- Guard `window.Plot`; read `data.holders`. If **no `status==="ok"` rows**, render an honest
  empty state via `states.empty({...})` + caption (AC-6a-P2a), not a blank/all-N/A grid.
- `chartCard("How concentrated this position is in each holder's 13F book")`.
- **`Plot.cell`** grid: `y = manager_name` (ordered as returned), single measure column,
  `fill = weight` for `ok` rows with `color: { type: "sqrt"|"linear", scheme:
  pickSequentialScheme(), domain: [0, maxWeight], legend: true }` — **one-hue sequential**
  (magnitude, not diverging; AC-3a-P2a). N/A rows rendered as a **distinct drained/neutral swatch**
  (reuse the `.drained` treatment) with an explicit **"N/A"** text label + the `reason` in a
  tooltip/aria — never a colored cell, never `0` (AC-4a-P2a).
- A `Plot.text` layer prints each `ok` row's weight as a **%** on/next to its cell.
- Legible in **light and dark** via `cssVar(...)` for strokes/text (AC-H4), like the geo chart.
- `card.caption(...)`: state the definition verbatim — "share of the holder's **reported 13F
  long-book** (Section 13(f) long US positions), **not** AUM or total portfolio; single quarter;
  rows are the top-N holders by position size, colored by within-book weight." (AC-1a/2a-P2a.)
- Reuse `pickSequentialScheme()` (memoized per page load) — the STYLE_GUIDE colour-scheme
  exception already covers these Plot charts.

### 5. `src/secfin/api/static/company.js` (section + mount)

- `convictionSection()` → a titled section shell (mirror `holderGeographySection()`), placed on
  the institutional tab next to the geography section.
- `mountConviction(period)` → self-fetching (`/companies/{symbol}/institutional-conviction?period=`
  using the **same selected period** as `mountHolderGeography`), skip-on-failure (don't break the
  tab if the endpoint errors), calls `P.convictionHeatmap(res, {width: P.measuredWidth(...)})`.
- Wire into the same render path that calls `mountHolderGeography(period)` (~`company.js:511`) and
  add the section to the concatenated markup (~`company.js:539`). Do **not** touch the Top-N /
  composition / concentration components (AC-R1).

### 6. `docs/DATA_MODEL.md` (derived-surface note — not a new concept)

Under "Institutional ownership (13F, 13D/G)", add a short subsection describing the **conviction
weight**: definition (within-quarter value ratio), why it's unit-safe (same-filing numerator/
denominator), that the denominator is a **reported 13F long-book ≠ AUM/portfolio**, and the N/A
rule (any unvalued position → N/A). No `mapping.py` change (guardrail 3 applies to new *canonical
concepts*; this is a derived read over existing facts).

### 7. Fixtures & checks

- `scripts/seed_fixture.py`: ensure at least one demo manager's book has **multiple valued
  holdings** so a weight is a real fraction (e.g. Berkshire holding the demo issuer + ≥1 other
  valued position → weight < 100%), and add **one manager with a NULL-value holding** in its book
  so the N/A branch renders in the e2e screenshot. Keep the existing location/geography seed
  intact.
- `scripts/headless_check.js`: the conviction section renders within the existing institutional
  pages; confirm the seeded issuer's institutional page exercises **both** a valued weight cell
  and an N/A cell. Add a dedicated page entry only if the existing ones don't cover both states.

---

## Test strategy (engineer writes; QA re-runs)

**`tests/test_holdings_repository.py`** — extend for `book_values`:
- multiple managers in one quarter → correct per-manager `SUM`, `holding_count`;
- a manager with a NULL-value holding → `null_value_count >= 1`, `total_value` sums only the
  valued rows;
- a manager with **all** NULL values → `total_value is None`;
- a manager not present that quarter → **absent** from the dict;
- `book_values([], period) == {}`;
- period isolation (a holding in another quarter doesn't leak in).

**`tests/test_institutional_viz_routes.py`** — add conviction-endpoint cases (FastAPI TestClient,
seeded SQLite repo, same style as the geography/series tests):
- fully-valued book → `weight == issuer_value / book_value`, `status=="ok"`;
- book with a NULL position → `weight is None`, `status=="na"`, reason mentions unvalued;
- non-positive / zero book → N/A;
- **multi-class issuer** → numerator sums the manager's classes into one row (one row per
  manager);
- `top` cap honored (K distinct managers max);
- `_CONVICTION_CAVEATS` present on the response;
- **empty holders** (issuer with no ingested holders that quarter) → `holders: []` (honest empty,
  not a fabricated row).

**e2e** — `docker compose --profile e2e up --abort-on-container-exit --exit-code-from e2e` green;
eyeball `data/e2e-shots` for the conviction grid: one-hue intensity, a visible **N/A** cell, the
"reported 13F long-book — not AUM" caption, legible in the rendered theme.

---

## Acceptance criteria → concrete checks

| Criterion | Check |
|---|---|
| **AC-1a-P2a** weight = issuer value ÷ book value, one quarter | route test (fully-valued case); caption text |
| **AC-2a-P2a** denominator labeled reported 13F long-book, not AUM | caption string + `_CONVICTION_CAVEATS[0]`; grep test optional |
| **AC-3a-P2a** one-hue intensity, no verdict/diverging | `pickSequentialScheme()` + single-hue `color`; no "speculative"/score label (diff review) |
| **AC-4a-P2a** null/≤0 book → N/A, never 0 | route tests (null / all-null / ≤0); UI drained "N/A" swatch |
| **AC-5a-P2a** quarter shown + issuer-centric caveats carried | response `period` + `_CONVICTION_CAVEATS ⊇ _ISSUER_CENTRIC_CAVEATS`; UI caption |
| **AC-6a-P2a** thin/empty → honest empty state, both themes | empty-holders route test; `states.empty` branch; e2e screenshot |
| **AC-7a-P2a** no unbounded cross-manager scan | design: `book_values` is K-bounded + indexed; code review confirms no DuckDB / no whole-quarter scan |
| **AC-H2** missing never shown as 0 | N/A rows carry `weight: null`, UI renders "N/A" |
| **AC-R1** existing components intact | Top-N / composition / concentration untouched; diff review |
| **AC-R2** pytest + e2e green | CI commands above |

---

## Guardrail sign-off

- **G3/G4** no new canonical concept → no `mapping.py` change; DATA_MODEL note only. ✓
- **G5** all new SQL in `sqlite_holdings_repository.py` behind `book_values`; API does pure Python
  composition. ✓
- **G6/G7** no DuckDB, no analytical store; the aggregate is bounded + indexed, off the
  cross-manager-inversion path. ✓
- **Single-process** unchanged; no `--workers`, no per-request DuckDB. ✓
- **CIK as int**, values in raw unit (weight is a documented unitless ratio; no rescaling of stored
  values), derived number carries **status + reason** (honesty vocabulary). ✓

---

## Handoff → Senior Engineer

Branch fresh off `master` (we're on the merged `institutional-location-backfill`). Implement in the
file order above (store → serve → static → fixtures/tests → docs). The two things most likely to
bite: (1) keep the null-tolerance rule a single branch (`null_value_count == 0 and total_value >
0`) — don't reintroduce per-issuer null checks, they're redundant; (2) the N/A cell must be a
*distinct drained swatch with a literal "N/A" label*, not a low-intensity colored cell that reads
as "small weight". Self-verify with `verify` + the e2e headless check before handing to QA. Do not
commit/push or deploy unless asked.

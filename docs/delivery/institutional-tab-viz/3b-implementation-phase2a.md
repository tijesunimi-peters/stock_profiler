# Implementation: institutional-tab viz — Phase 2a (per-holder conviction heatmap)

**Role:** Senior Engineer → handoff to QA Tester
**Task slug:** `institutional-tab-viz` (Phase 2a)
**Branch:** `institutional-conviction-heatmap` (off `master`)
**Date:** 2026-07-18
**Implements:** `2b-architecture-phase2a.md` against `1b-brief-phase2a-heatmap.md`.

---

## What changed and why

A new **conviction heatmap** on the company Institutional tab: for the top holders of an issuer,
how large this position is inside each holder's *own* reported 13F book. Pure composition over
existing 13F data — no new SEC fetch, no new canonical concept, no DuckDB, no migration.

### store — `src/secfin/storage/`
- `holdings_repository.py`: added `BookValue` (`NamedTuple`: `total_value`, `null_value_count`,
  `holding_count`) and abstract `book_values(manager_ciks, report_period) -> dict[int, BookValue]`.
- `sqlite_holdings_repository.py`: implemented `book_values` — a single
  `SUM(value), SUM(value IS NULL), COUNT(*) GROUP BY manager_cik` over the **bounded** set of
  manager CIKs passed in, served by the existing `idx_holdings_manager_period`. Empty input →
  `{}`. This is the *only* new SQL; the API does pure Python composition (guardrail 5).

### serve — `src/secfin/api/routes.py`
- `_CONVICTION_CAVEATS` (extends `_ISSUER_CENTRIC_CAVEATS`): weight is a share of the reported
  **13F long-book, not AUM/portfolio**; same-filing numerator/denominator so unit-safe;
  any unvalued position → N/A.
- `GET /companies/{symbol}/institutional-conviction?period=&top=` (default `top=20`, `1..50`):
  resolves cik/cusips, dedups `holders_of` to one row **per manager** (numerator sums the
  manager's value across the issuer's classes), takes the top-`top` by position order, fetches
  their `book_values`, and emits `weight = issuer_value / book_value` with `status`/`reason`.
  **Null-tolerance is a single branch:** `bv is not None and null_value_count == 0 and
  total_value and total_value > 0`. Valued rows sort by weight DESC; N/A rows keep position order
  after them. `weight`/`book_value` are `null` on N/A rows — never `0`.

### static — `src/secfin/api/static/`
- `app.js`: `convictionHeatmap(data, opts)` — `Plot.cell` grid, `y` = holder, `fill` = weight on a
  **one-hue sequential** `pickSequentialScheme()` ramp (`domain [0, maxWeight]`, percent legend),
  `Plot.text` prints each valued cell's %. **N/A holders render as an unfilled, outlined cell with
  a literal "N/A"** — unmistakably "no data", never a pale colored cell. Empty state (no valued
  rows) via `states.empty`, distinguishing "no holders at all" from "holders exist but no book
  could be valued". Caption states the full definition (13F long-book ≠ AUM; rows by size, color
  by weight). Exported on `window.ClearyFi`.
- `company.js`: `convictionSection()` shell + self-fetching `mountConviction(period)` (skip-on-
  failure), wired into the tab render next to `mountHolderGeography(period)`. Top-N / composition /
  concentration components untouched (AC-R1).

### fixtures & docs
- `scripts/seed_fixture.py`: added **EVERPEAK ADVISORS LLC** (cik 72) as a second JPM holder whose
  book carries one **unvalued** position — so the JPM institutional page shows a mixed grid:
  NORTHLESS (valued, 100%) + EVERPEAK (N/A). Location stays `None` (geography empty-state guard
  unaffected). The AAPL demo (BRK/Vanguard/State Street, all fully valued) gives the all-valued
  grid. No change to the tuned AAPL books.
- `scripts/headless_check.js`: comment updated — the `institutional-nolocation` page now also
  guards the conviction N/A cell.
- `docs/DATA_MODEL.md`: new "conviction heatmap (Phase 2a)" subsection (derivation, unit-safety,
  13F-long-book-≠-AUM, N/A rule). No `mapping.py` change (no new canonical concept — guardrail 3
  N/A).

---

## How I verified it (commands + evidence)

- **`docker compose --profile test run --rm test`** → **380 passed, 6 skipped**. New tests:
  - `tests/test_holdings_repository.py`: `book_values` — whole-book SUM; unvalued position flagged
    (not dropped, SUM undercounts); all-null book → `total_value is None`; absent manager omitted;
    quarter-scoped; empty input → `{}`.
  - `tests/test_institutional_viz_routes.py`: conviction endpoint — fully-valued weight; N/A on an
    unvalued position; N/A on a non-positive book; multi-class holder summed into one row; `top`
    cap; caveats present; empty (uningested quarter) → `holders: []`.
- **ruff** (`--line-length 100 --select E,F,I,UP,B`): my storage + test files clean; the one E501 I
  introduced in `routes.py` (the `valued = …` line) fixed by wrapping. Remaining repo findings are
  pre-existing (unrelated files/lines) and the codebase-wide FastAPI `Depends()`-in-defaults B008.
- **`docker compose build api` + `docker compose --profile e2e up --abort-on-container-exit
  --exit-code-from e2e`** → **HEADLESS CHECK: PASS**, `errors=0` on all 13 pages incl. both
  institutional pages.
- **Eyeballed `data/e2e-shots/`:**
  - `institutional.png` (AAPL): three valued cells — Vanguard 99.0%, State Street 99.0%,
    Berkshire 79.0% (BRK visibly lighter, its deep book making AAPL a smaller share); one-hue
    ramp; "…reported 13F long-book … NOT the holder's AUM, total portfolio…" caption.
  - `institutional-nolocation.png` (JPM): NORTHLESS filled 100.0% + **EVERPEAK unfilled "N/A"** —
    the mixed grid, N/A rendered distinctly, never as 0.
  - Top-N chart, composition strip, concentration tiles all still present on both (AC-R1).

---

## What QA should probe

- **The null-tolerance edge**: confirm a holder with *any* unvalued book position is N/A (not a
  weight over the valued subset), and that N/A is never a `0` or a faint colored cell. The JPM page
  exercises this live.
- **Multi-class issuers**: one row per manager, numerator summed across classes (route test covers
  it; worth a live check if a real multi-class issuer is ingested).
- **Guardrail 6**: confirm no cross-manager scan / no DuckDB on the request path — `book_values` is
  bounded to the shown holders. (Code review of `routes.py` + `sqlite_holdings_repository.py`.)
- **Coverage ambiguity**: empty holders → `holders: []` and the UI's honest empty state, not a
  fabricated row or a "0 conviction" reading.
- **Both themes**: e2e renders in one theme; if QA can, eyeball dark mode for the N/A outline +
  text legibility.

Not committed/pushed; not deployed (operator-gated). Ready for QA.

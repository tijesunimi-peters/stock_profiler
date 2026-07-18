# Implementation: institutional-tab viz — Phase 1

**Role:** Senior Engineer → handoff to QA Tester
**Branch:** `institutional-tab-viz-phase1` (off `master`)
**Scope built:** Phase 1 only (accumulation series + filer-HQ choropleth). Phase 2
(conviction heatmap + co-holding network) is deliberately NOT in this branch — per the
architecture plan it lands as its own PR (introduces the `analytical` extra + batch stores).

---

## What changed and why

Two new **augmenting** sections on the company Institutional tab (the existing Top-N chart,
composition strip, and concentration tiles are untouched — AC-R1).

### 1. Accumulation series (stacked reported shares over recent quarters)
- **serve:** `GET /v1/companies/{symbol}/institutional-holdings-series?quarters=` — pure
  composition of `issuer_periods` + `holders_of` (existing live point reads; no DuckDB, no
  new store method). Returns per-`(manager_cik, cusip)` point arrays.
- **UI:** `ClearyFi.holdingsSeriesChart` (`app.js`) — Plot stacked `barY`, **shares not
  value** (the 13F value unit flipped thousands→whole-dollars ~2023; shares are unit-stable),
  a **randomized Observable Plot categorical scheme** per filer (`pickCategoricalScheme`,
  operator decision 2026-07-18 — see STYLE_GUIDE §6/§10) + "Other" band, 1px surface gaps
  between segments, quarter axis. A filer absent in a quarter has **no segment** (honest gap),
  never a zero bar. Caption spells out shares-not-value, gap≠exit, and change-is-derived.

### 2. Filer-HQ choropleth
- **ingest:** `sec/institutional.parse_filing_manager_location` reads the filing manager's
  `stateOrCountry` off the 13F cover page (already fetched for the co-filer roster); set on
  `HoldingsSnapshot.filing_manager_location`. Stored **raw** (no classification in `sec/`).
- **store:** new `holdings_snapshots.filing_manager_location` column + a **guarded
  `ALTER TABLE` migration** in `__init__` (`_migrate`) for pre-existing DBs; `holders_of`
  carries it onto `IssuerHolder.location`.
- **normalize:** `normalize/geography.py` — `US_STATE_CODES` (50 + DC) + `classify_location`
  → `state` / `other` / `unknown`.
- **serve:** `GET /v1/companies/{symbol}/institutional-holder-geography?period=` — buckets
  holders into `by_state` (distinct filer count + value), `outside_states` (foreign OR US
  territory), `unknown` (pre-location snapshots). Small Python aggregation over one issuer's
  holders — **not** a DuckDB scan (guardrail 6).
- **UI:** `ClearyFi.holderGeographyChart` (`app.js`) — Plot `geo` with built-in `albers-usa`,
  fetches the **vendored** `static/vendor/us-states.geojson` same-origin (no CDN/CSP issue).
  Randomized **single-hue sequential** scheme by filer count (`pickSequentialScheme` — never
  diverging/verdict); zero-filer states neutral (distinct from "few").
  Off-map + unknown tallies always shown as chips (never dropped). **Title/caption fixed to
  "reported business address … NOT where its capital originates" — never "clusters of
  capital."**

### Honesty (per the brief's ACs)
- AC-H1: both endpoints carry `_HOLDINGS_SERIES_CAVEATS` / `_HOLDER_GEOGRAPHY_CAVEATS`
  (extend `_ISSUER_CENTRIC_CAVEATS`: long-only, ~45-day lag, empty≠zero).
- AC-H2: unknown/off-map rendered as explicit tallies + honest empty states; never `0`.
- AC-1a/1b/1c/1d, AC-2a/2b/2c/2d — see the caption/label text and the empty-state paths.

### Docs
- `docs/DATA_MODEL.md` — new "issuer-centric visualization endpoints (Phase 1)" subsection +
  the `filing_manager_location` provenance/honesty note.
- `CLAUDE.md` — repo layout adds `normalize/geography.py` and the two endpoints.
- `scripts/seed_fixture.py` — seeded the three demo managers' real HQ states (NE/PA/MA) so the
  e2e/demo choropleth populates honestly.

---

## How I verified

- **`docker compose --profile test run --rm test`** → **363 passed, 6 skipped**. New tests:
  - `tests/test_institutional.py` — `parse_filing_manager_location` (real Berkshire fixture =
    "NE"; absent → None).
  - `tests/test_holdings_repository.py` — location round-trip, default None, `holders_of`
    carries it, **and the pre-location-column DB migration** (old-shape DB gains the column,
    old rows read None, re-open is a no-op).
  - `tests/test_geography.py` — classifier (states/DC, case/whitespace, missing→unknown,
    foreign+territory→other).
  - `tests/test_institutional_viz_routes.py` — series points/gap/quarters-bound; geography
    buckets; empty-quarter → empty buckets (200, not error).
- **`docker compose --profile e2e up …`** → **HEADLESS CHECK: PASS**, `[institutional]
  … errors=0` in real Chromium. Screenshot (`data/e2e-shots/institutional.png`) eyeballed:
  both charts render on-brand — stacked shares chart with legend + honesty caption; choropleth
  coloring NE/PA/MA with the Outside/Unknown tally chips and the business-address caption.
- **ruff:** zero **new** errors from my code (E501 clean on authored/edited files;
  `geography.py` passes all rules). Pre-existing baseline unchanged (62 `B008` — the repo-wide
  FastAPI `Depends()` pattern — plus pre-existing `E501` in `seed_fixture`/`test_flows`/etc.,
  none of them my lines).

---

## What QA should probe
- **Theme:** confirm both charts in **dark mode** (tokens read live via `cssVar`; the e2e
  shot is light). The geojson base fill uses `--bg-tint`, borders `--border-strong`.
- **Degenerate data:** a single-quarter issuer (series → "not enough quarters" empty state,
  not a one-bar trend); an all-`unknown`-location issuer (map neutral, Unknown chip = N,
  by_state empty); a period with no holders (geography empty state).
- **Choropleth legend** at `maxCount==1` shows a 0–1 fractional scale (every seeded state has
  exactly 1 filer). Honest but degenerate; with varied real counts it reads as integers.
  Flag if you want the legend forced to integer ticks.
- **Naming note for the PM/brief:** the off-map bucket is `outside_states` labelled "Outside
  the 50 states & DC (foreign or US territory)", a small honesty refinement over the brief's
  "outside_us" — a Puerto Rico filer is US but off the albers-usa map, so "outside US" would
  have mislabelled it.
- Not committed/pushed (awaiting QA + operator, per the pipeline).

## QA round 1 — fixes applied (2026-07-18)

All four QA findings (`4-qa.md`) addressed:

1. **[Medium] Color cycling** — `holdingsSeriesChart` default `topN` lowered **8 → 7**, so
   top-7 + "Other" = **8** stacked series ≤ the smallest categorical scheme (`dark2`/`set2` =
   8 colors). No d3 ordinal recycling → no two series share a hue. Documented the coupling in
   a comment (raising topN past 7 needs a ≥-color scheme).
2. **[AC-1d] Single-quarter one-bar chart** — the null-guard is now `periods.length < 2`
   (was `!periods.length`), so at one quarter the chart returns null and `company.js`'s
   "Fewer than two 13F quarters are ingested" empty state fires as intended. **AC-1d now fully
   met.**
3. **[Low] Stale comments** — the Phase-1 section header and the choropleth inline comment now
   describe the multi-hue categorical / single-hue sequential scheme approach, not "one
   terracotta accent."
4. **[Low] Duplicated state set** — added `tests/test_state_code_parity.py`: parses
   `STATE_CODE_TO_NAME` out of `app.js` and asserts its codes equal `US_STATE_CODES`
   (`normalize/geography.py`). Fails loudly if the two ever diverge (which would silently drop
   a state filer — breaching AC-2b).

**Re-verified:** `pytest` **364 passed, 6 skipped** (+1 parity test); e2e **HEADLESS CHECK:
PASS**, institutional `errors=0`; new test + `app.js`-adjacent files ruff-clean.

**Note for QA:** the color-cycling fix is verified **by construction** (domain ≤ 8 ≤ min scheme
colors) — the seed fixture only has 3 AAPL-holding managers, so a ≥9-series stack isn't
exercised visually. Findings 1 & 2's runtime paths (≥9 series; exactly 1 quarter) aren't in the
demo data; both are simple bounds/guards.

## QA round 3 — blank geo-map empty state fixed (2026-07-18)

**Operator report:** "the geo plot graph is not showing anything." QA reproduced it (round 3):
when **no holder has a mappable US-state location** — the default for all real data until a
location backfill runs — `holderGeographyChart` drew an all-neutral (near-invisible) US map that
read as blank. AC-H4 violation.

**Fix (`app.js` `holderGeographyChart`):** added an early branch — when `by_state` is empty
(nothing to place on the map), render an honest empty state ("No filer locations to map yet …
location tracking was added recently and shows only after a re-ingest") **plus the
outside/unknown tally chips**, instead of the choropleth. No blank map, and no meaningless
0-only color legend. The has-state-data path is unchanged (verified no regression). The tally
chips are now a shared `tallyChipsHtml()` helper used by both states.

**Regression coverage added (the round-2 e2e gap):**
- `scripts/seed_fixture.py` — a second issuer (**JPM**, which has companyfacts so its page loads
  clean) held by one manager with `filing_manager_location=None`, plus JPM's CUSIP resolution.
- `scripts/headless_check.js` — new page `["institutional-nolocation", "/company/JPM?tab=institutional"]`
  so the headless check now renders the no-location path (which previously only ever ran with
  seeded locations).
- `tests/test_institutional_viz_routes.py` — `test_geography_all_unknown_when_no_holder_has_location`
  asserts the endpoint returns `by_state == []` with `unknown.filer_count == 2` (the exact
  precondition the UI branches on).

**Re-verified:** `pytest` **365 passed, 6 skipped** (+1); e2e **HEADLESS CHECK: PASS**, both
`[institutional]` (AAPL, map renders) and `[institutional-nolocation]` (JPM, empty state
renders) at `errors=0`; both screenshots eyeballed — JPM shows the "NO FILER LOCATIONS TO MAP
YET" note + "Location unknown: 1 filer" chip (no blank map); AAPL still shows the colored
choropleth. New Python is ruff-clean (the 9 `seed_fixture.py` E501s are the pre-existing
`_BRK_EXTRA_POSITIONS` lines, unchanged by this work).

## Open (deferred to Phase 2 / operator, from the architecture §10)
- Existing cached snapshots need an `institutional_backfill` re-run to populate real
  locations (they show as "unknown" until then) — **operator timing call, not a code blocker.**
- Multi-quarter coverage for the launch basket governs how rich the series/choropleth look.
- Phase 2 (conviction heatmap, co-holding network) is a separate follow-on branch.

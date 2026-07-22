# Architecture — Single-sector page shell + sidebar submenu (Phase 1)

Stage 2 (Principal Architect). Designs against `1-brief.md`. **Frontend-only.**
Owner: `senior-frontend-engineer`. No backend stage.

Scope re-check: **Track 1, in-architecture.** UI restructuring over four already-shipped Track-1
endpoints; no `sec/`/`ingest/`/`normalize/`/`storage/`/`api/` change, no new dependency, CSP-safe
(no new external assets). Nothing touches the request path or SEC compliance.

---

## Decisions resolved

### R1 — remove the cross-sector `#spreads` section (CONFIRMED)
Today's "Spread within each sector" section (`renderSpreads`/`#spreads`, a box **per sector** for
one metric over `/sectors/spreads`, driven by `?metric=`) is a **cross-sector** surface — it
contradicts single-sector focus. **Remove it** this phase; the cross-sector view returns as the
**Phase 3 peer strip** (`00 §3b`). The **per-sector** spreads (`paintDetailSpreads` over
`/sectors/{group}/spreads`, a box **per metric** for the one sector) **stay** and move into the
single-sector body. The `?metric=` URL param is retired from this page.

### R2 — no period picker; as-of FY is header metadata (CONFIRMED)
The page stays **latest-FY** (whatever `/sectors` resolves). The header shows `fiscal_year` as
**metadata**; there is **no period/year control** and **no `year`/`period` param threaded through
state** this phase. Cross-page "period" = that resolved FY (display-only). The trend's existing
`?range=` (1Y/5Y/All) is unrelated and **stays**. (Deferred: a period selector.)

### R3 — one-item submenu affordance (nested group, expanded)
`Sectors` becomes a **nested parent** with a disclosure caret, **expanded by default**, and one
indented child **Overview → /sectors**. Rendered as a real button (`aria-expanded`, keyboard
Enter/Space toggles) so it is future-proof for adding Company/Compare/Qualitative, but with a single
child it reads as a small labeled section — not broken. On `/sectors` the parent carries an
`is-open`/ancestor-active class and **Overview** gets the existing `.current` treatment.

### R4 — keep the e2e render check green (harness update is part of this task)
`scripts/headless_check.js` currently drives these `/sectors` shots:
- `["sectors","/sectors"]` — was the all-sectors grid → now the **default single-sector view**.
- `["sectors-expanded","/sectors?group=60&range=5y"]` — `?group=` now **selects** sector 60 (still
  renders DuPont tree + trend + per-sector spreads). Keep.
- `["sectors-lifecycle","/sectors?group=73&range=all"]` — selects 73 (negative-CCC lifecycle). Keep.
- `["sectors-spreads","/sectors?metric=debt_to_equity"]`, `["sectors-spreads-clip",…interest_coverage]`,
  `["sectors-spreads-empty",…quick_ratio]` — these exercise the **removed** cross-sector spread.
  **Remove these three** and replace with shots that exercise the new surfaces (see the AC table):
  a **selector-open** interaction shot and an **honest-empty / unknown-`?group=`** shot.

The e2e fixture (`scripts/seed_fixture.py`) already seeds `sector_dupont` for groups incl. 60 and 73;
the engineer confirms the **default-select** (largest `peer_count`) resolves to a populated sector in
the fixture so `/sectors` (no param) renders a real body.

---

## State model (client-side, self-contained)

The selector is a **client-side filter over the ~70 sectors already returned by `/sectors`** — no
new endpoint, no fetch/debounce (unlike `suggest.js`, which is a server-backed *ticker* widget and
is **not** reused here). One state object in `sectors.js`:

```
state = { group: <selected SIC-2 code | null>, range: "1y"|"5y"|"all" }
```
- **Resolution order on load:** `?group=` param → `localStorage` last-viewed → **default = the
  sector with the largest `peer_count`** in the `/sectors` list.
- **On select:** set `state.group`, `history.replaceState` to `?group=<code>` (mirror `compare.js`'s
  URL-param carry; keep `&range=` when set), write `localStorage` last-viewed (reuse app.js's guarded
  `try/catch` pattern), re-render the body **in place** (no reload).
- An **unknown/below-min `?group=`** (not in the `/sectors` list) falls back to the default sector
  with a quiet `text.muted` "sector not found, showing <default>" note — never a broken page.
- `localStorage` key: `secfin:lastSector` (guarded read/write).

Data flow (all existing endpoints):
- `/sectors` — fetched once: the **selector list** (`group`, `group_label`, `peer_count`) + the
  aggregation banner/caveats + the resolved `fiscal_year` (header as-of).
- `/sectors/{group}` — the selected sector's DuPont series (tree from latest point + ROE trend).
- `/sectors/{group}/spreads` — per-sector metric spreads small-multiple.
- `/sectors/{group}/lifecycle` — the CCC/lifecycle trend.
Lazy per selected sector, cached in `state` (same as today's `state.series`/`groupSpreads`/`lifecycle`).

---

## Layout — `static/sectors.html`

Restructure the mounts (keep the shell/topbar/sidebar wiring):
```
#masthead      — slim page title/lede (kept, compact)
#sectorbar     — NEW: shared header (breadcrumb + peer-count pill + as-of FY) + the selector
                 (searchable combobox + most-recently-viewed pill cluster)
#aggregation   — honesty banner + "how to read" caveats (KEPT, unchanged meaning)
#view          — NEW single-sector BODY: DuPont tree, ROE trend (+1Y/5Y/All), per-sector spreads,
                 lifecycle/CCC trend  (the four existing renderers, re-homed)
#disclosure    — KEPT
#footer        — KEPT
```
**Remove** the `#spreads` mount (cross-sector section).

---

## `static/sectors.js` — the rewrite (keep the renderers, replace the spine)

**Remove:** `COLS`, `sortedSectors`, `renderGrid`, `wireGrid`, the table markup; the whole
cross-sector spread block (`SPREAD_GROUPS`, `SPREAD_METRICS`, `renderSpreads`, `renderPicker`,
`wirePicker`, `paintSpread`, `drawSpread`, `spreadCaveatsBlock`); `maybeAutoExpand`.

**Keep / re-home (unchanged rendering):** `dupontTree`, `rangeControls`, `windowedPoints`,
`paintTrend`, `wireRange`, `paintDetailSpreads`/`drawDetailSpreads` (per-sector), `paintLifecycle`/
`drawLifecycle`/`lifecycleCaveats`, `aggregationBlock`, `fmtCell`/`fmtSpreadVal`.

**Add:**
- `resolveInitialGroup(list)` — the resolution order above.
- `renderSectorBar(list)` — the `#sectorbar`: breadcrumb (`Sectors › <group_label>`), peer-count
  pill (selected sector's `peer_count`), as-of FY pill; the **combobox** (text input that filters
  `list` by label/code, arrow/enter/escape keyboard, click-to-select) and the **recently-viewed
  pills** (from a small `localStorage` MRU list, selected one marked active).
- `selectSector(code)` — set state, update URL + MRU + last-viewed, call `renderBody`.
- `renderBody()` — the former `paintDetail` guts against `state.group`: fetch `/sectors/{group}`,
  paint tree + trend + per-sector spreads + lifecycle; per-panel loading/empty/error (existing
  `P.states.*`), N/A never 0 (existing behavior — missing leg → "—", trend gap → line break).

`init()`: fetch `/sectors` once → render masthead + aggregation + sector bar, resolve initial group,
`renderBody()`. Honest empty when `/sectors` has **no** sectors (AC-11).

---

## `static/script.js` + CSS — the sidebar submenu

Extend the `GROUPS` model so an item may carry `children`:
```
{ label: "Overview", items: [
   { key: "sectors", label: "Sectors", href: "/sectors",
     children: [ { key: "sectors", label: "Overview", href: "/sectors" } ] } ] }
```
Render an item **with `children`** as a nested block: a **parent button** (`.side-parent`,
`aria-expanded="true"`, caret) + a **child list** (`.side-children`, indented) of `.side-link`s.
The parent toggles the child list (keyboard Enter/Space; focus-visible); default **expanded**. The
active child gets `.current`; the parent gets an ancestor-active class when the page matches a child.
Items **without** `children` render exactly as today (Company hub / Compare / Screen unchanged).

**CSS** (`style.css`, token-driven — the sidebar lives there with `.side-group`/`.side-link`): add
`.side-parent` (same metrics as `.side-link` + a caret via a `::after` or inline glyph, no new
asset), `.side-parent[aria-expanded="false"] + .side-children { display:none }`, `.side-children`
(left indent + hairline guide), reusing `--accent-wash`/`--ink`/`--mono-muted`. No new tokens.

---

## Files to touch

**Edit:** `static/sectors.html` (mounts), `static/sectors.js` (spine rewrite),
`static/sectors.css` (selector + header styles; drop table/cross-spread styles),
`static/script.js` (nested `GROUPS` + submenu render/wire), `static/style.css` (`.side-parent`/
`.side-children`), `scripts/headless_check.js` (PAGES per R4).
**No** backend, schema, or `docs/DATA_MODEL.md` change (no data-model impact). Update
`docs/REDESIGN_SECTOR_OVERVIEW.md` Phase 1 status; `docs/ROADMAP_UI.md` if it tracks `/sectors`.

---

## AC → concrete check

| AC | Check |
|----|-------|
| AC-1 | e2e `/sectors` (no param): screenshot shows one sector's body (default = largest `peer_count`), not a table, not blank. |
| AC-2 | Drive `/sectors?group=60` → sector 60 body; `/sectors?group=99` (unknown) → falls back to default with the muted note, no page error. |
| AC-3 | Driven: type in the combobox filters the list; pick → body re-renders in place, URL gains `?group=`, `localStorage` MRU/last-viewed updated (assert via `page.evaluate`). |
| AC-4 | Driven: select a non-default sector, revisit `/sectors` (no param) → last-viewed restored from `localStorage`. |
| AC-5 | e2e `/sectors?group=60&range=5y`: DuPont tree + ROE trend + working 1Y/5Y/All toggle + per-sector spreads render; `/sectors?group=73&range=all`: lifecycle/CCC trend renders. |
| AC-6 | Aggregation banner + caveats present; copy still says "aggregate … not a median". |
| AC-7 | Header shows breadcrumb (sector name), peer-count pill, as-of FY. |
| AC-8 | Sidebar: `Sectors` is an expandable parent, `Overview` child `.current` on `/sectors`; Company hub/Compare/Screen still top-level; parent button keyboard-toggles + focus-visible (driven). |
| AC-9 | N/A never 0: a sector with a missing DuPont leg shows "—"; a trend coverage gap breaks the line; an empty per-sector spread shows the honest empty state — verified on an edge sector. |
| AC-10 | Per-panel states: a failed `/sectors/{group}/lifecycle` (or empty) degrades without blanking tree/trend; loading shows skeletons not a full-page spinner. |
| AC-11 | `/sectors` with no materialized sectors → honest empty state (no crash). (Unit-check the empty-list branch; fixture always has sectors, so assert via a forced empty response in a driven check or code path.) |
| AC-12 | Theme-aware (light+dark, tokens only), CSP-safe (no new external asset), mobile width holds (e2e viewport + a narrow shot), no clipped labels. |
| AC-13 | `docker compose --profile e2e up …` exit 0; eyeball the updated shots (default, selected sector, selector-open, empty/unknown-group). |
| AC-14 | `docker compose --profile test run --rm test` green (no backend change; existing sector-route tests unaffected). |

---

## Handoff → `senior-frontend-engineer`

Branch off `master` (`sector-overview-shell`). Order: (1) `script.js` nested submenu + CSS; (2)
`sectors.html` mounts; (3) `sectors.js` spine rewrite (state model + selector + `renderBody`
re-homing the four renderers), removing the table + cross-sector spread; (4) `sectors.css`; (5)
`scripts/headless_check.js` PAGES per R4; (6) docs. Self-verify: `pytest` (Docker) green, then the
e2e headless check — **rebuild the `api` image first** (`docker compose build api`; the image bakes
in `static/`, it is not mounted live) and **eyeball every screenshot** (exit code catches console
errors, not layout/copy/theme). No backend stage.

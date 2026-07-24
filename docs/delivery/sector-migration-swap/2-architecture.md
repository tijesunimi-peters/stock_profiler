# 2 — Architecture: Sector Analytics v2 routing swap (P7 / Migration M2)

**Task slug:** `sector-migration-swap` · **Stage:** Principal Architect → Senior Engineer(s)
**Input:** `1-brief.md`. **Roadmap:** `ROADMAP_SECTOR_MIGRATION.md` M2, `ROADMAP_SECTOR_APP_V2.md` P7.

## Scope re-check (passes)

Track-1, **serve-stage only**. No `ingest/`, `normalize/`, `storage/`, no new canonical concept, no
`mapping.py`/`DATA_MODEL.md` change, no new endpoint/schema. The `/v1/sectors*` **API** endpoints are
untouched — this only changes which **static shell** the page routes return and where the nav points.
No new base dependency, no SEC-compliance surface, no DuckDB/request-path concern. Single-process
model unaffected. **No scope drift.** M1 parity port stays dropped; M3 deletion stays out.

## Design

Two stages, backend first on one branch off `master`.

### Stage 3a — Backend (`senior-backend-engineer`) — `src/secfin/api/main.py`

Three edits in the page-route block (around L298 + L348–351), plus tests. The `/explorer` route
(L270–279) is the in-repo precedent for a 301 with param translation; `Request` is already imported
(main.py:18), `RedirectResponse` too (L19).

**Edit 1 — `/sectors` now serves the v2 app** (replace the body of `sector_overview`, L348–351):

```python
@app.get("/sectors", include_in_schema=False)
async def sector_overview() -> FileResponse:
    # M2 routing swap (2026-07-24, ROADMAP_SECTOR_MIGRATION.md): /sectors is the canonical
    # sector page and now serves the v2 Sector Analytics app (#app + sectorapp.js). The old
    # single-sector page lives on at /sectors-legacy for one release (rollback), then M3 deletes it.
    return FileResponse(STATIC_DIR / "sector-analytics.html")
```

**Edit 2 — `/sector-analytics` 301-redirects to `/sectors`, preserving the query string**
(replace `sector_analytics_app`, L298–302):

```python
@app.get("/sector-analytics", include_in_schema=False)
async def sector_analytics_redirect(request: Request) -> RedirectResponse:
    # M2 swap: /sectors is canonical now. Keep existing /sector-analytics links + bookmarks
    # working by 301-redirecting, carrying the raw query string through (?group=&view=&symbol=
    # &a=&b=) -- the app honors those params identically at the new URL.
    target = "/sectors"
    if request.url.query:
        target = f"{target}?{request.url.query}"
    return RedirectResponse(target, status_code=301)
```
Use `request.url.query` (the already-encoded raw query string) — do **not** re-parse/re-encode
params by hand; that both preserves `a`/`b`/anything the app might add later and avoids a
double-encoding bug. 301 (permanent) matches `/explorer`'s precedent and the brief.

**Edit 3 — add the always-on legacy route** (new handler; place it right after `/sectors` so the
pairing reads top-to-bottom). **No env flag** (operator decision 2026-07-24 — localhost dev is the
only live context; prod rollback/sequencing is deferred to `/devops-engineer`):

```python
@app.get("/sectors-legacy", include_in_schema=False)
async def sector_overview_legacy() -> FileResponse:
    # Rollback path for the M2 swap: the pre-v2 single-sector page (sectors.js/html/css), kept
    # reachable for one release before M3 deletes it. Plain always-on route, no env gate.
    return FileResponse(STATIC_DIR / "sectors.html")
```
`sectors.js`/`sectors.css` keep loading normally — `StaticFiles` is mounted at `/static` (L262),
untouched, and `sectors.html`'s `<script src="/static/sectors.js">` resolves as before.

**No route-ordering hazard:** `/sectors`, `/sectors-legacy`, `/sector-analytics` are three distinct
literal paths. Do **not** delete `sectors.*` (M3).

**Backend tests — `tests/test_static_pages.py`** (extend; matches its `_client(tmp_path, monkeypatch)`
`TestClient` pattern). `TestClient` follows redirects by default — pass `follow_redirects=False` to
assert the 301:

- `test_sectors_serves_the_v2_app`: `GET /sectors` → 200, `text/html`; body contains `id="app"` and
  `/static/sectorapp.js`; body does **not** contain `/static/sectors.js` (proves it's the app shell,
  not the old page).
- `test_sector_analytics_redirects_to_sectors_preserving_params`:
  `client.get("/sector-analytics", follow_redirects=False)` → `status_code == 301`,
  `headers["location"] == "/sectors"`; and
  `client.get("/sector-analytics?group=73&view=company&symbol=320193&a=73&b=60", follow_redirects=False)`
  → 301 with `location == "/sectors?group=73&view=company&symbol=320193&a=73&b=60"` (full query
  string survives, order preserved).
- `test_sectors_legacy_serves_the_old_page`: `GET /sectors-legacy` → 200; body contains
  `/static/sectors.js`; does **not** contain `/static/sectorapp.js`.

### Stage 3b — Frontend (`senior-frontend-engineer`) — `static/` + `scripts/headless_check.js`

**Edit 4 — v2 app sidebar → canonical `/sectors`** (`src/secfin/api/static/sectorapp.js`, the
`sidebarHtml()` nav array + active check):
- L282: `["Coverage", "/coverage"], ["Sector analytics", "/sector-analytics"],`
  → change the href to `"/sectors"` (keep the label text "Sector analytics").
- L285: `var active = n[1] === "/sector-analytics";` → `var active = n[1] === "/sectors";`
  (**both** must change together, or the sidebar loses its active highlight on the canonical URL).

**Edit 5 — audit every other `static/*` internal link.** Grep the whole static tree for
`"/sector-analytics"` and confirm **zero** page-nav links remain after Edit 4:
`grep -rn '/sector-analytics' src/secfin/api/static/` — expected remaining hits are non-nav only
(the `<title>` in `sector-analytics.html`, code comments). The shared shell `script.js:28–29`
already uses `href: "/sectors"` → post-swap it lands on the app; **verify, leave as-is** (no dead
link, no change). If the audit surfaces any other page (e.g. `index.html`) linking
`/sector-analytics`, repoint it to `/sectors`.

**Edit 6 — e2e shots (`scripts/headless_check.js`).** Once `/sectors` serves the app, the 9 old-page
`sectors*` shots (they drive old-page DOM: `sectors`, `sectors-selected`, `sectors-lifecycle`,
`sectors-selector`, `sectors-unknown-group`, `sectors-decomp`, `sectors-scorecard-empty`,
`sectors-drilldown-fh`, `sectors-drilldown-empty`, L52–69) break. Do:
- **Remove** those 9 old-page shot entries **and** their name-keyed interaction branches
  (`sectors-decomp` L241+, `sectors-drilldown-fh`/`sectors-drilldown-empty` L247+ — grep
  `name === "sectors-` and delete the old-page branches; **do not** touch `sectorapp-*` branches).
- **Add exactly one** legacy shot: `["sectors-legacy", "/sectors-legacy"]` — proves the rollback
  page still renders while the route lives (satisfies "keep one `/sectors-legacy` shot").
- **Repoint the `sectorapp*` shots** from `/sector-analytics` → `/sectors` (mechanical: change the
  URL column only; the shot **names** stay identical so every `name === "sectorapp-*"` interaction
  branch keeps matching). This proves the app renders at the **canonical** URL incl. deep-links
  (`?group=`, `?view=company&symbol=`, `?view=compare&a=&b=`) — directly covering AC-5. The 301
  itself is covered more reliably by the pytest above, so shots need not also chase the redirect.

## Acceptance criteria → concrete checks

| AC | Check | Owner |
|----|-------|-------|
| AC-1 `/sectors` serves the v2 app | `test_sectors_serves_the_v2_app` (body has `id="app"` + `sectorapp.js`, not `sectors.js`); e2e `sectorapp` shot at `/sectors` renders | backend + frontend |
| AC-2 `/sector-analytics` 301 → `/sectors`, params preserved | `test_sector_analytics_redirects_to_sectors_preserving_params` (301 + `location` with full query string incl. group/view/symbol/a/b) | backend |
| AC-3 `/sectors-legacy` serves old page; `sectors.*` retained | `test_sectors_legacy_serves_the_old_page` (body has `sectors.js`, not `sectorapp.js`); `git status` shows `sectors.*` untouched; e2e `sectors-legacy` shot renders | backend + frontend |
| AC-4 all nav → `/sectors`, no dead links, active highlight | `grep -rn '/sector-analytics' static/` = title/comments only; sectorapp.js L282/285 both `/sectors`; e2e shot shows the sidebar "Sector analytics" entry active on `/sectors` | frontend |
| AC-5 app renders at canonical incl deep-links | e2e `sectorapp`, `sectorapp-company`, `sectorapp-compare` shots now driving `/sectors...` render the right view/state | frontend |
| AC-6 honesty no-regression | layout-neutral (same app); QA eyeballs N/A-never-0, caveats/provenance, scores-as-positions on the app at `/sectors` | QA |
| AC-7 pytest + e2e green, other pages OK | `pytest` (new route tests + full suite); Docker e2e passes + eyeballed; `/`, `/company/*`, `/manager/*`, `/coverage`, `/guide` still render; their "Sectors" nav lands on the app | backend + frontend + QA |

## Test / verification strategy

- **Backend:** `docker compose --profile test run --rm test` (pytest) — new tests in
  `test_static_pages.py`; full suite green (nothing else touched).
- **Frontend:** `docker compose --profile e2e up --abort-on-container-exit --exit-code-from e2e` —
  exit code is pass/fail; **eyeball** `./data/e2e-shots/`: the `sectorapp*` shots render at
  `/sectors`, `sectors-legacy` renders the old page, sidebar active-state correct. Rebuild the `api`
  image after `src/` changes (`docker compose build`) — the image bakes in `src/`.
- **Honesty:** no data path changed, so AC-6 is a no-regression eyeball on the app's existing
  affordances (N/A never 0, caveats/provenance, scores-as-positions) at the new URL — QA drives it.

## Honesty / guardrails carried

N/A never 0; caveats + aggregation provenance intact; theme scores are positions, not verdicts;
13F/derived caveats unaffected. Layout-neutral swap — the only new failure modes are a **dropped
query string on the 301** (AC-2 guards) and a **dead/duplicated nav link** (AC-4 guards); tests target
both. No `--workers`, no request-path DuckDB, no SEC-throttle change (none of this touches those).

## Handoff → Senior Engineer(s)

Full-stack, **backend first, then frontend, same branch off `master`**.
1. **`senior-backend-engineer`** — main.py Edits 1–3 (swap `/sectors`→app, 301
   `/sector-analytics`→`/sectors` w/ `request.url.query` passthrough, add `/sectors-legacy`) + the 3
   `test_static_pages.py` tests (`follow_redirects=False` for the 301). Self-verify pytest in Docker,
   then set `next_stage: frontend`.
2. **`senior-frontend-engineer`** — Edits 4–6 (sectorapp.js L282 href + L285 active-check → `/sectors`;
   static-tree grep audit; headless_check.js: drop 8 old-page shots + old-page branches, add one
   `sectors-legacy` shot, repoint `sectorapp*` shots to `/sectors`). Self-verify Docker e2e + eyeball,
   then set `next_stage: qa`.

Do **not**: add endpoints/schema, touch `/v1/sectors*`, delete `sectors.*`, re-add DuPont/lifecycle
charts, or add an env flag for the legacy route.

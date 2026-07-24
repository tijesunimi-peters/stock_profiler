# 3 — Implementation

**Task slug:** `sector-migration-swap` · **Branch:** `sector-migration-swap` (off `master`)

## Backend (senior-backend-engineer) — DONE

### What changed (`src/secfin/api/main.py`, serve stage only)
1. **`/sectors` → v2 app.** `sector_overview()` now returns `sector-analytics.html` (the `#app` shell
   + `sectorapp.js`) instead of `sectors.html`. `/sectors` is the canonical sector page.
2. **`/sector-analytics` → 301 redirect.** `sector_analytics_redirect(request)` 301-redirects to
   `/sectors`, appending `request.url.query` (the already-encoded raw query string) when present — so
   `?group=&view=&symbol=&a=&b=` survive intact, no re-parse / no double-encode. Precedent: the
   existing `/explorer` 301 (L270).
3. **`/sectors-legacy` (new, always-on).** `sector_overview_legacy()` serves the old `sectors.html`
   (which loads `/static/sectors.js` via the untouched `/static` mount) — the one-release rollback
   path. **No env flag** (operator decision 2026-07-24). `sectors.*` files are **not** deleted (M3).

No `/v1/sectors*` API, schema, normalize, storage, or ingest change. No new dependency. Single-process
model, SEC throttle, DuckDB-off-request-path all untouched (none are on this path).

### Contract for the frontend (Edits 4–6, same branch)
- `/sectors` now IS the app; `/sector-analytics` 301s to it. So the app's own sidebar link must point
  at **`/sectors`** (canonical), and its active-state check must compare against `/sectors`:
  - `static/sectorapp.js` L282 `["Sector analytics", "/sector-analytics"]` → href `"/sectors"`.
  - `static/sectorapp.js` L285 `n[1] === "/sector-analytics"` → `n[1] === "/sectors"`.
- Audit `grep -rn '/sector-analytics' src/secfin/api/static/` — after the edit, remaining hits should
  be non-nav only (`sector-analytics.html` `<title>`, comments). Shared shell `script.js:28–29`
  already uses `/sectors` (verify it lands on the app; no change expected).
- e2e (`scripts/headless_check.js`): drop the 8 obsolete old-page `sectors*` shots + their name-keyed
  branches; **keep one** `["sectors-legacy", "/sectors-legacy"]` shot; repoint the `sectorapp*` shots'
  URLs from `/sector-analytics` → `/sectors` (names unchanged so interaction branches still match).

### How I verified
- `docker compose --profile test run --rm test` — **full suite 514 passed, 6 skipped**.
- New tests in `tests/test_static_pages.py` (all green), driving the real ASGI app via `TestClient`:
  - `test_sectors_serves_the_v2_app` — `/sectors` 200, body has `id="app"` + `/static/sectorapp.js`,
    **not** `/static/sectors.js`. (AC-1)
  - `test_sector_analytics_redirects_to_sectors_preserving_params` — `follow_redirects=False`: bare →
    301 `location: /sectors`; `?group=73&view=company&symbol=320193&a=73&b=60` → 301 with the full
    query string preserved verbatim. (AC-2)
  - `test_sectors_legacy_serves_the_old_page` — `/sectors-legacy` 200, body has `/static/sectors.js`,
    not `sectorapp.js`. (AC-3)
- `ruff check --select E,F,UP,B` + `ruff format --check` on the changed lines: **clean**. (Two
  repo-wide nits — an I001 import-order at main.py L43–47 and a `'/disclaimer'` quote at
  test_static_pages.py L108 — are **pre-existing on `master`**, outside my change region; left alone
  to keep the diff scoped.)

### For QA to probe
- Multi-param redirect fidelity (AC-2) — try odd param orders / extra params; the raw-query passthrough
  should carry anything, not just the five named params.
- That `sectors.*` still exists on disk (AC-3) and the legacy page actually functions, not just 200s.
- The frontend nav audit (AC-4) — no lingering `/sector-analytics` page link anywhere in `static/`.

## Frontend (senior-frontend-engineer) — DONE (same branch)

### What changed
- **`static/sectorapp.js`** — the app's own sidebar now points at the canonical URL:
  L282 `["Sector analytics", "/sectors"]` (href flipped; label kept — it names what the app *is*,
  matching the app's own `<h1>` "Sector analytics"); L285 active-check `n[1] === "/sectors"` (both
  changed together so the sidebar keeps its active highlight on `/sectors`). Header comment refreshed
  to note the canonical `/sectors` route + the 301-in.
- **`static/sectorapp.css`** — header comment refreshed (canonical `/sectors`; `/sector-analytics`
  301s in). No style change.
- **Static-tree audit** (`grep -rn '/sector-analytics' static/`): after the edit the only remaining
  hits are the `sector-analytics.html` `<title>` and code comments — **zero** nav links. The shared
  shell `script.js:28–29` already uses `href: "/sectors"` → verified it lands on the app post-swap;
  left as-is (no dead link).
- **`scripts/headless_check.js`** — dropped the 9 obsolete old-page `sectors*` shots and their three
  name-keyed interaction branches (`sectors-decomp`, `sectors-drilldown-fh/-empty`,
  `sectors-selector`); added one `["sectors-legacy", "/sectors-legacy"]` render shot (rollback
  proof); repointed all 13 `sectorapp*` shot URLs from `/sector-analytics` → `/sectors` (names
  unchanged, so every `name === "sectorapp-*"` interaction branch still matches). `node --check` OK.

### How I verified
- `docker compose build api` (image bakes in `src/`), then
  `docker compose --profile e2e up --abort-on-container-exit --exit-code-from e2e`.
- **33 shots rendered, no page crashes.** The **only** nonzero-error shots are the two pre-existing
  Company-view **502** baselines (`sectorapp-company`/`-refocus`, `symbol=900001`: cache-miss → SEC
  unreachable in the network-isolated e2e). This baseline is documented + reproduced-on-clean-base in
  `sector-v2-qualitative/4-qa.md` and `sector-v2-compare/4-qa.md` — **not** introduced here (my
  change touches no data-fetch path; the app makes identical fetches regardless of serving URL).
- **Eyeballed** `data/e2e-shots/`:
  - `sectorapp.png` — app renders at `/sectors`; sidebar "Sector analytics" shows the **active**
    highlight; honesty affordances intact (provisional banner, "Not yet scored", "to be defined",
    "a position vs … not a good/bad or buy verdict", "omitted, not zero", N/A/N·M chips).
  - `sectors-legacy.png` — the **old** page ("Sector performance overview", DuPont + ROE trend + CCC
    lifecycle) renders at `/sectors-legacy`; rollback path confirmed.
  - `sectorapp-compare*`, `sectorapp-company-*`, `sectorapp-*` deep-links all render the right
    view/state at `/sectors...` (AC-5).

### For QA
- e2e exit code is non-zero **only** because of the documented Company-502 baseline — treat as the
  known baseline, not a regression (confirm the two 502 shots are the *only* nonzero ones).
- Verify the 301 param passthrough (AC-2) and that no `static/*` page link still targets
  `/sector-analytics` (AC-4). Confirm `sectors.*` files still exist on disk (AC-3, M3 not done here).

### Manual-gate follow-up (2026-07-24, operator interactive acceptance)
- **Sidebar label rename** (operator request): `sectorapp.js:282` nav label "Sector analytics" →
  "**Sectors**" (href unchanged `/sectors`; active-state unchanged). Makes the app sidebar consistent
  with the shared shell nav (`script.js` "Sectors"). Re-verified: `docker compose build api` + e2e →
  33 shots, no crashes, only the documented Company-502 baseline nonzero; `sectorapp.png` shows the
  sidebar reading "Sectors" and highlighted active. The page `<h1>` stays "Sector analytics" (the
  operator asked to rename only the sidebar menu item).
- **Company-view selector scoping** (operator observation): confirmed **by-design + pre-existing** —
  the Company view places a filer among its *own SIC peer group* via a global search, decoupled from
  the sector dropdown (`:470`, `:1091–1127`). M2 touched no Company-view logic → not a regression,
  out of scope. Candidate follow-up if sector-scoped focal selection is desired.

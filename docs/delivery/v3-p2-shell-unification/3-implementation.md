# 3 — Implementation: V3-P2, shell unification

**Task:** `v3-p2-shell-unification` · **Branch:** `v3-p2-shell-unification` (off `master` @ `bae78cb`)
**Plan:** `2-architecture.md` §8

---

## Stage 3a — Senior Backend Engineer ✅ COMPLETE (2026-07-26)

Scope was deliberately thin: land the paths so the frontend can build URL-as-state against
something real, and remove the superseded legacy page.

### What changed

**`src/secfin/api/main.py`** — three new static routes, one deleted:

| Route | Serves | Note |
|---|---|---|
| `GET /company/{symbol}/{view}` | `company.html` | **`{view}` is not validated server-side** |
| `GET /sectors/{group}` | `sector-analytics.html` | selection moves from `?group=`+localStorage into the path |
| `GET /sectors/{group}/{view}` | `sector-analytics.html` | as above, plus active view |
| ~~`GET /sectors-legacy`~~ | — | **deleted** |

The no-validation choice is deliberate and commented in-code: **the client owns view resolution**
(AC-21 requires an unknown slug to fall back to the default view), so a server-side 404 would
directly contradict it. Each handler returns the same `FileResponse` as its bare route — verified
byte-identical below, which is what makes the shell's path parsing the single source of truth.

**Deleted** (item 7 / AC-23): `static/sectors.html`, `static/sectors.css`, `static/sectors.js`.
The `/sectors` docstring no longer claims a rollback page exists.

**`tests/test_static_pages.py`** — `test_sectors_legacy_serves_the_old_page` → `test_sectors_legacy_is_gone`
(asserts 404 **and** that the three files are gone from disk, so an unrouted-but-present file can't
pass), plus three new tests: company view paths, company unknown-view fallback, sector group/view paths.

**`scripts/headless_check.js`** — dropped the `sectors-legacy` shot.

### Verification (run, not assumed)

```
docker compose --profile test run --rm test     ->  554 passed, 9 skipped
```

Route-level self-verification against a real `TestClient`, comparing served bytes to the bare route:

```
200  /company/AAPL                    company.html             identical
200  /company/AAPL/statements         company.html             identical
200  /company/AAPL/nonsense           company.html             identical
200  /sectors                         sector-analytics.html    identical
200  /sectors/35                      sector-analytics.html    identical
200  /sectors/35/compare              sector-analytics.html    identical
200  /sectors/35/zzz                  sector-analytics.html    identical
200  /manager/1067983                 200                      (unaffected)
200  /compare · /screen · /coverage   200                      (unaffected)
404  /sectors-legacy                                           gone
301  /sector-analytics             -> /sectors                 still redirects
```

`ruff check` reports 2 errors in `main.py` — **confirmed pre-existing on `master`** (verified by
stashing); unrelated to this change and left alone rather than mixed into this diff.

### Notes for the frontend engineer

- **`/manager/{cik}` has no `/{view}` route** — one view until V3-P6. Don't emit manager view paths.
- **No `/compare/{sectors|companies}`** — deferred to V3-P7 (operator, 2026-07-26).
- Unknown view slugs return **200**, not 404 — `shell.js` must do the fallback (AC-21).
- The server does **no** redirecting of legacy query forms. Honoring `?tab=`/`?group=`/`?view=` is
  entirely `shell.js`'s job (`2-architecture.md` §2.2), including the `/screen?view=rank` collision.

---

## Stage 3b — Senior Frontend Engineer ✅ COMPLETE (2026-07-27)

Net **−1,656 lines** across 28 files. Two shells became one.

### What changed

**New — the shell**
- **`static/shell.js`** (`window.ClearyFiShell`) — the single nav implementation: `SUBJECTS` /
  `ACTIONS` / `VIEWS` tables, `route()`, `mount()`, `rail()`, `entityBar()`, `navigate()`,
  `setSearchHandler()`. **Auto-mounts on DOM ready.**
- **`static/shell.css`** — 210px sidebar, subject nav + `planned` badge, sticky topbar, drawer,
  view rail, entity control bar. Ported from `prototype.dc.html:36-70` onto `style.css` tokens.

**Retired**
- `script.js`: 168 → 29 lines. Marketing `.nav` hamburger only; the shell renderer is gone.
- `style.css`: −282 lines (the whole `.app-side`/`.app-topbar`/drawer block).
- `sectorapp.js`: `sidebarHtml()`, `topbarHtml()`, `railHtml()` deleted; `wireShell()` thinned.
- `sectorapp.css`: `.pa-side*` / `.pa-topbar*` / `.pa-search*` / `.pa-body` / `.pa-rail*` blocks
  deleted, **plus both V3-P1 canary blocks** (AC-12).
- `sectors.html` / `.css` / `.js` deleted (stage 3a).

**Re-homed**
- `sector-analytics.html` — now loads `app.css` + `shell.css`; shell mounts sit **outside `#app`**
  so `renderApp()`'s wholesale innerHTML rewrite can't drop the shell's listeners (AC-14).
- `company.html/.js/.css` — tabs → view rail, entity control bar, path-driven views + pushState.
- `manager.html/.js` — shell mounts + entity control bar (async-safe name).
- `compare` / `screen` / `coverage` / `components` — `script.js` → `shell.js`, `+shell.css`. Nothing else.
- `data-shell` attributes removed everywhere: the active subject derives from the path.

### Five real bugs found and fixed while verifying

1. **`/company/AAPL/statements` resolved the ticker as `"statements"`.** `company.js` took the
   *last* path segment. Now indexed (`[1]`); `manager.js` hardened the same way.
2. **`/screen`, `/coverage`, `/compare`, `/components` rendered an EMPTY shell.** `script.js`
   self-executed; `shell.js` needed an explicit `mount()`, and `/coverage` + `/components` have no
   page JS to call it. → shell.js now **auto-mounts**, with `setSearchHandler()` for the sector
   app's override (which must keep search setting the focal company, not navigating away).
3. **Cascade inversion** (architect's risk A2, confirmed real). Blocks written as *substitutes*
   for `app.css` became *overrides* once it loaded — so `.plot-chart`'s card chrome (bg + border +
   radius + shadow) started applying to the distribution strips and drill-box tiles, nesting a card
   inside a card. Both scoped blocks now unset it explicitly.
4. **"On this page" section nav broke.** It injected into the sidebar using `.app-side-foot` /
   `.side-group` / `.side-link` — all deleted. It landed after the pinned footer, unstyled and
   wrapping. Now uses the shell's class names with self-contained CSS in `company.css`.
5. **Entity bar's Period stuck at `—`.** `onResolved()` painted the bar before `applyTabFromUrl()`
   settled the tab. Now driven from `render()`, the one place every view/period change funnels
   through — so the bar always reports what is on screen.

### One product fix beyond the plan (worth flagging)

**A closed off-canvas drawer stayed clickable and focusable.** Off-screen via `transform` is not
inert: the panel still sat over the topbar (z-index 70 > 60), so tapping the hamburger right after
closing hit the sidebar's *brand link* and navigated to `/`. Reproduced deterministically. Fixed
with `pointer-events: none` (instant, so a re-tap works mid-slide) + `visibility: hidden` after the
transition (fixes the tab order), keeping the slide-out animation. **This bug was inherited from the
retired `script.js` shell — pre-existing, not a regression.**

### Verification

```
docker compose --profile test run --rm test          -> 554 passed, 9 skipped
docker compose build api && … --profile e2e up       -> baseline held (see below)
```

**AC-25 measured, not asserted.** Baseline captured on this branch *before* any frontend change
(backend-only): exactly **2 failing shots** — `sectorapp-company` (8 errors) and
`sectorapp-company-refocus` (13), both CIK 900001 502s in the offline sandbox; everything else
`errors=0`. **Final run: the same 2 shots, nothing added.** (The 502 count drifts 12–14 run to run;
it is a synthetic-fixture artifact.)

⚠️ **`HEADLESS CHECK: FAIL` is the expected baseline state** and the compose exit code is unreliable
when piped. Grep the per-shot lines — and grep **`FAILED`** as well as `errors=`, or a shot that
threw disappears silently rather than showing as an error.

**Shots added:** `company-path-view`, `company-path-unknown`, `sectors-path-group`,
`shell-drawer-narrow` (900px, opens the drawer, closes via scrim, reopens — the AC-4 guard).
**Selectors updated:** `.pa-rail-btn` → `.shell-rail-btn`, `.topbar-search` → `.shell-search`.

**DOM-level checks driven live across all 7 shell pages:**

| Check | Result |
|---|---|
| Subject list identical on all 7 pages | ✅ `navSame=true` everywhere |
| Active subject derived from path | ✅ Companies / Managers / Sectors; `null` on `/components` |
| 4 planned entries are `<span>`, no `href`, no handler | ✅ `spans=true href=false` |
| `cursor: default` + `--mono-muted` + `title` | ✅ `cursor:default`, `rgb(139,133,121)` = `#8b8579`, all titled |
| Right rail only on `/sectors` | ✅ `rrail=1` there, `0` elsewhere |
| Brand resolves to a real route | ✅ `href="/"` |
| `.plot-chart` base declared once | ✅ `app.css:441` only |

**Screenshots eyeballed:** `company`, `company-path-view`, `company-path-unknown`,
`shell-drawer-narrow`, `manager`, `sectorapp`, `sectorapp-company-trend`, `screen`, `coverage`,
`compare`. Every distribution strip, box-whisker, geo-mix and insider-flow card still mounts.

### Docs updated (required by the architecture, not deferred)

`STYLE_GUIDE` §4.2 (subject nav is now what ships), §5 (new skeleton, load order, rail + entity
bar rules), §6/§11 (`shell.js` references, company hub as the rail/bar reference) ·
`ROADMAP_APP_V3` §6 (V3-P2 ticked, P4–P7 unblocked) · `ROADMAP_SECTOR_MIGRATION` M3 (done) ·
`CLAUDE.md` repo layout (shell.js/shell.css named; `sectors.*` gone).

### What QA should probe hardest

1. **`/company` content parity vs `master`** — the whole containment argument. All five views,
   same labels/order, same content. The rail is chrome; the content must be untouched.
2. **The entity control bars for fabrication.** `/manager` before the holdings fetch resolves
   (name must be `—`, never the CIK). No `94% filed`, no hard-coded period, and deliberately **no
   "Peer set" cell** and **no "facts as filed · not restated" line** — that claim is false for this
   product (`metrics.py` emits `as-restated`); both omissions are reasoned in `company.js`.
3. **Legacy URLs.** `?tab=`, `?stmt=`, `?trend=`, `?group=`, `?a=&b=`, `?symbols=`, and especially
   **`/screen?view=rank`** — `?view=` means "shell view" on `/sectors` but "screen mode" on
   `/screen`; `route()` only reads it for subjects that declare views.
4. **Back/Forward** across views on `/company` and `/sectors`, and reload-at-depth.
5. **The drawer below 1024px on every shell page** — it existed on only one side before the merge.
6. **Search behaviour differs by design:** `/sectors` submit sets the focal company and stays put;
   everywhere else it navigates to `/company/{symbol}`. Not a defect — see `2-architecture.md` §2.3.
7. **Title row = "Company hub"**, ticker in the meta + entity bar (prototype fidelity per D1). The
   architect flagged the SEO trade-off; it is on the 4b questionnaire and is cheap to reverse.

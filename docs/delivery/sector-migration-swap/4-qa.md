# 4 — QA: Sector Analytics v2 routing swap (P7 / Migration M2)

**Task slug:** `sector-migration-swap` · **Branch:** `sector-migration-swap` (off `master`)
**Verdict:** ✅ **PASS — pending operator manual UI verification** (interactive/behavioral change →
operator hands-on required per policy; see `4b-manual-verification.md`).
**Change classification:** interactive/behavioral (routing swap: which page `/sectors` serves, a new
301 redirect, a new legacy route, and a changed nav target + active-state) → **blocking** manual gate.

## Acceptance criteria — pass/fail with evidence

| AC | Verdict | Evidence |
|----|---------|----------|
| **AC-1** `/sectors` serves the v2 app (not the old page) | ✅ | **Live HTTP:** `GET /sectors` → 200, body has `id="app"` + `/static/sectorapp.js`, **no** `/static/sectors.js`. **pytest** `test_sectors_serves_the_v2_app`. **Screenshot** `sectorapp.png` — the app renders at `/sectors`. |
| **AC-2** `/sector-analytics` 301 → `/sectors`, params preserved | ✅ | **Live HTTP:** bare → `301 Location: /sectors`; `?group=73&view=company&symbol=320193&a=73&b=60` → `301 Location: /sectors?group=73&view=company&symbol=320193&a=73&b=60` (verbatim); **extra/encoded param** `?group=52&range=all&foo=bar%20baz` → `301 Location: /sectors?group=52&range=all&foo=bar%20baz` (raw-query passthrough, not just the 5 named params). **pytest** `test_sector_analytics_redirects_to_sectors_preserving_params`. |
| **AC-3** `/sectors-legacy` serves the old page; `sectors.*` retained | ✅ | **Live HTTP:** `GET /sectors-legacy` → 200, body has `/static/sectors.js`, **no** `sectorapp.js`. **Disk:** `sectors.js/html/css` all present (`ls`). **pytest** `test_sectors_legacy_serves_the_old_page`. **Screenshot** `sectors-legacy.png` — full old page (DuPont + ROE trend + CCC lifecycle) renders. |
| **AC-4** all nav → `/sectors`, no dead links, active highlight | ✅ | **Grep:** `grep -rn '/sector-analytics' static/` = 2 hits, both file-header **comments** — **zero** page links (href-form grep empty). Shared shell `script.js:28–29` already `/sectors`. **Screenshots** `sectorapp.png` / `-compare-na.png` — sidebar "Sector analytics" shows the **active** accent highlight at `/sectors`. |
| **AC-5** app renders at canonical incl. deep-links | ✅ | **e2e** at `/sectors`: `sectorapp` (Sector), `sectorapp-company*` (`?view=company&symbol=`), `sectorapp-compare*` (`?view=compare&a=&b=`), `sectorapp-compare-pin` (`?group=73`) all render the right view/state, `errors=0` (except the documented Company-502 baseline — see Defects). **Live HTTP:** following `/sector-analytics?group=73` (curl-L equivalent) lands on the app. |
| **AC-6** honesty no-regression | ✅ | **Screenshot** `sectorapp-compare-na.png` (`a=73&b=28`): sector B shows **"not scored"** / **"N/A"** / **"no distribution"** — never `0`; "Composite **DERIVED**"; "a position … not a good/bad or buy verdict"; "no winner is declared"; "An axis marked n/s … never plotted as 0". `sectorapp.png`: provisional banner, "Not yet scored", "to be defined", "omitted, not zero". Layout-neutral swap — same app, affordances unchanged. |
| **AC-7** pytest + e2e green; other pages OK | ✅ | **pytest 514 passed, 6 skipped** (independent re-run). **e2e** 33 shots, no page crashes; only nonzero = the 2 documented Company-502 baselines. Other pages (`/`, `/company/*`, `/manager/*`, `/coverage`, `/components`, `/compare`, `/screen`) all rendered `errors=0`. |

## Review questionnaire

1. **What shipped** — Clicking "Sectors" (or opening `/sectors`) now lands on the new v2 Sector
   Analytics app instead of the old single-sector page. Old `/sector-analytics` links/bookmarks
   still work — they 301-redirect to `/sectors` keeping their query. The pre-v2 page is still one
   URL away at `/sectors-legacy` as a rollback.
2. **Surfaces touched** — Serve-stage routing in `api/main.py` (`/sectors` now serves the app,
   `/sector-analytics` → 301, new `/sectors-legacy`); the v2 app's own sidebar nav + active-state in
   `static/sectorapp.js`; header comments in `sectorapp.js/css`; the e2e shot set in
   `scripts/headless_check.js`; tests in `tests/test_static_pages.py`. **No** `/v1/*` API, schema, or
   data path touched.
3. **AC → evidence** — see the table above; every AC tied to a live-HTTP response, a pytest, and/or a
   named screenshot.
4. **States exercised** — *Populated:* the app's Sector, Company, and Compare views at `/sectors`
   (screenshots). *Empty/honest-degradation:* Compare sector B with no scores → "not scored"/"N/A"/"no
   distribution" (`sectorapp-compare-na.png`); the sector scorecard's deferred themes → "Not yet
   scored". *Redirect:* driven live with bare, 5-param, and extra-encoded-param queries. *Rollback:*
   `/sectors-legacy` rendered the old page live + in e2e.
5. **Edge cases probed** — **N/A vs N·M vs 0:** confirmed missing/unscored render as N/A / "not
   scored" / "no distribution", never `0` (AC-6). **Redirect param fidelity:** an *unnamed* extra
   param (`foo=bar%20baz`) survived the 301 verbatim, so the passthrough is the raw query, not a
   5-param allow-list. **Route double-serve:** `/sector-analytics` returns 301, not a 200 (no two
   URLs both serving the app). 13F/restatement/multi-class/429/upstream-502 — **N/A to this change**
   (no data path touched); the one live 502 observed is the pre-existing Company-view baseline, not
   introduced here.
6. **Honesty contract** — caveats + aggregation provenance present on the app at `/sectors`;
   composite labeled **DERIVED**; scores framed as positions, not verdicts; no missing value shown as
   `0`; no fabricated precision; no over-claiming copy. All carried over intact (layout-neutral swap).
7. **Deltas from the brief** — none. Built exactly to brief + architecture. The legacy mechanism is
   the operator-chosen plain always-on `/sectors-legacy` route (no env flag). Everything was
   verifiable by automation + live HTTP; nothing left unverifiable except the *felt* interaction
   (nav click / bookmark redirect / rollback in a real browser) → the manual gate below.
8. **Residual risk** — Low. What a human should confirm by hand: clicking "Sector analytics" in the
   app sidebar actually navigates to `/sectors` and shows active; an old `/sector-analytics?...`
   bookmark opens the right view; `/sectors-legacy` is usable for rollback. What would worry me most
   if wrong: a dropped query param on the redirect (verified false, incl. unnamed params) or a nav
   link still pointing at the old page (verified false).

## UI/UX review

Layout-neutral — the app itself is unchanged (P0–P5), so this is a no-regression review at the new
URL. **States** render intentionally: populated Sector/Company/Compare, honest empty ("not
scored"/"N/A"/"no distribution"), and the old page at `/sectors-legacy` all legible with no clipping
or overflow in the shots. **Copy:** the sidebar keeps the label "Sector analytics" (it names what the
app *is*, matching the app's own `<h1>`) while pointing at the canonical `/sectors` — consistent, no
dead vocabulary. **Affordances:** the sidebar "Sector analytics" entry shows its active state at
`/sectors` (accent color) — the active-check fix works. **Consistency:** same shared "paper terminal"
design system; nothing one-off introduced. Theme: unchanged (token-driven app, not touched).

## Defects

**None attributable to this change.**

- *Pre-existing baseline (not a regression):* `sectorapp-company` / `sectorapp-company-refocus`
  (`?view=company&symbol=900001`) log **502 Bad Gateway** console errors in the network-isolated e2e
  sandbox — a synthetic filer's company data cache-misses and the cache-aside path can't reach SEC.
  This baseline is documented and reproduced-on-clean-base in `sector-v2-qualitative/4-qa.md` and
  `sector-v2-compare/4-qa.md`. It is **independent of this change** (the app makes the identical
  fetches regardless of which URL served it; this change touches no data path). It is the *only*
  nonzero-error shot in the run, so the e2e exit code is non-zero for this known reason alone.

## Manual UI verification (operator-gated — see `4b-manual-verification.md`)

Interactive/behavioral change → **operator hands-on required** (blocking). Script:

1. Open **`/sectors`** → the v2 Sector Analytics app loads (control bar, "Health scorecard",
   decomposition, Distribution), **not** the old "Sector performance overview". Sidebar "Sector
   analytics" is highlighted active.
2. In the app sidebar, click **"Sector analytics"** → URL stays/returns to `/sectors`, entry stays
   active (no navigation to the old page, no dead link).
3. Open **`/sector-analytics?group=73&view=company&symbol=320193`** → browser lands on
   **`/sectors?group=73&view=company&symbol=320193`** (URL bar shows the redirect) and the Company
   view opens focused on that symbol.
4. Open **`/sectors?view=compare&a=73&b=28`** → Compare view; sector B's unscored themes read
   **"not scored"** and its missing metric medians read **"N/A" / "no distribution"** — never `0`.
5. Open **`/sectors-legacy`** → the **old** page renders and is usable (selector, DuPont, lifecycle)
   — rollback path works. Confirm `sectors.*` files still exist (they do; M3 not done here).
6. From another page (e.g. `/company/AAPL`), click **"Sectors"** in the shell nav → lands on the app
   at `/sectors`.

Until the operator runs this and confirms, the verdict remains **PASS — pending manual UI
verification**, not "ready to deploy".

### Operator interactive acceptance — round 1 (2026-07-24)
Operator drove the flow live and confirmed all functional checks ✅ (app at `/sectors`, 301 with
params, N/A-never-0, legacy page + shell nav). Two items raised:
1. **Sidebar rename** "Sector analytics" → "**Sectors**" — a copy request (in scope). **Applied** on
   `sectorapp.js:282` + re-verified (e2e clean, sidebar reads "Sectors" active). Minor accepted-change,
   not a failing AC → `qa_cycles` bumped to 1. Awaiting the operator's final confirmation of the rename.
2. **Company-view selector not sector-scoped** — investigated; **by-design + pre-existing** (global
   "place a filer in its own SIC peers" search, decoupled from the sector dropdown; `:470`,
   `:1091–1127`). M2 touched no Company-view logic → **not a regression, out of scope**. Logged as a
   candidate follow-up, does not block M2.

## Handoff

**Verdict: ✅ PASS — pending operator manual UI verification.** All 7 ACs pass on automated + live-HTTP
evidence; no defects introduced (the sole nonzero e2e shot is the documented Company-502 baseline).
**Next:** operator runs `docs/delivery/sector-migration-swap/4b-manual-verification.md` (interactive
acceptance). A confirmed questionnaire unlocks a **deploy request** (operator-gated `/devops-engineer`
— sequence the analytical batch so `/sectors` isn't honest-empty on prod cutover, per
ROADMAP_SECTOR_MIGRATION.md §165). **Not** a deploy. On a ❌, loop back to the owning engineer.

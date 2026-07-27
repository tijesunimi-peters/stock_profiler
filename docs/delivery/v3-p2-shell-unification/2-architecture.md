# 2 — Architecture: V3-P2, shell unification

**Task:** `v3-p2-shell-unification` · **Stage 2 (Principal Architect)** · 2026-07-26
**Input:** `1-brief.md` (26 ACs) · `ROADMAP_APP_V3.md` §2 · `STYLE_GUIDE.md` §4.2/§5/§10.1
**Prototype:** `prototype.dc.html` :36–70 (shell markup) · :7325–7370 (nav model)

**Scope re-check: PASSES.** Track 1. No new canonical concept, no `mapping.py` change, no
`DATA_MODEL.md` change, no new endpoint, no new dependency, no change to the SEC client, the
rate limiter, the repositories, or DuckDB's batch-only boundary. This phase moves UI chrome and
adds static-file routes. The four-stage pipeline (ingest → normalize → store → serve) is untouched
below `serve`, and within `serve` only `main.py`'s static routes and `api/static/` change.

---

## 1. The decision the brief left open: where the single nav renderer lives

**Extract to `static/shell.js` + `static/shell.css`. Do not make `sectorapp.js` the entry point
for the other six pages.**

The brief said "`sectorapp.js`/`sectorapp.css` become **the** product shell" and left the file
layout to me. The code says extraction is the only workable reading:

`sectorapp.js:273` — `renderApp()` — does `app.innerHTML = sidebarHtml() + topbarHtml() + …` and
then `wireShell()`. **The entire shell is destroyed and rebuilt on every state change** (every tile
click, every dropdown toggle). It is a 1,986-line IIFE whose closure is sector state: `state.sectorIdx`,
`state.themeScores`, `state.geoMix`. Making `/company` — which has its own 4,236-line component
layer and a completely different state model — load and run that IIFE would mean rewriting
`company.js`, `manager.js`, `compare.js` and `screen.js` into the sector app's render model. That is
a rewrite of the entire frontend, not a shell unification, and it would demolish the content-parity
rule (AC-15/AC-18).

Extraction satisfies **AC-2 ("exactly one implementation")** exactly as written — one function
produces the sidebar HTML, and both the sector app and the five component-layer pages call it.

**A second, load-bearing benefit:** the shell moves **out of `#app`'s innerHTML blast radius**. The
sidebar/topbar mount as siblings of `#app` in `sector-analytics.html` and are rendered **once**.
`renderApp()` then only rewrites the main column. This fixes an existing latent bug — today every
sector tile click silently rebuilds and re-wires the whole sidebar — and it is what makes **AC-14**
(the two-phase render contract) safe rather than hopeful.

### File plan

| File | Action |
|---|---|
| `static/shell.js` | **NEW** — `window.ClearyFiShell`. The single nav renderer + route parser + drawer + search + view rail + entity bar. |
| `static/shell.css` | **NEW** — unified shell CSS: sidebar, subject nav, topbar, drawer, view rail, entity control bar. |
| `static/script.js` | Delete lines 15–149 (the `#appSide`/`#appTopbar` renderer, `GROUPS`, `sideLink`, `sideItem`, `logo`, topbar, drawer, ⌘K). **Keep** lines 151–167 (marketing `.nav` hamburger). Keep the filename — six marketing/legal pages load it and are out of scope. |
| `static/style.css` | Delete the `.app-side` / `.app-topbar` / `.app-main` / `.app-scrim` / `side-open` blocks (`:737–990`); they are superseded by `shell.css`. Leave everything else. |
| `static/sectorapp.js` | Delete `sidebarHtml()` (:293) and `topbarHtml()` (:320). `renderApp()` stops emitting them. Register the search override. |
| `static/sectorapp.css` | Delete `.pa-side*` / `.pa-topbar*` / `.pa-brand*` / `.pa-search*` / `.pa-apiref` shell blocks and both P1 canary blocks (`:330–335`, `:338–344`). Keep sector-**view** CSS. |
| `static/sectors.html`, `sectors.css`, `sectors.js` | **DELETE** (item 7). |
| `static/company.html` / `company.js` / `company.css` | Tabs → view rail; add entity control bar; path-based tab state. |
| `static/manager.html` / `manager.js` | Add entity control bar; swap shell mounts. |
| `static/compare.html`, `screen.html`, `coverage.html`, `components.html` | Swap `script.js` → `shell.js`, add `shell.css`. No other change. |
| `static/sector-analytics.html` | Add `app.css` (AC-12) + `shell.css`; add shell mounts outside `#app`. |
| `api/main.py` | New view routes; delete `/sectors-legacy`. |
| `tests/test_static_pages.py` | Update asset assertions; delete the legacy test; add view-route tests. |
| `scripts/headless_check.js` | Delete the `sectors-legacy` shot; add path-form shots. |

**`sectorapp.css` is NOT renamed.** After extraction it holds only sector-view styles, which is what
its name will then honestly mean.

---

## 2. `ClearyFiShell` — the contract

`shell.js` is dependency-free except `suggest.js` (optional, same as today). It must load **before**
`app.js`/page JS and **after** `suggest.js`.

```js
window.ClearyFiShell = {
  // Parse location into selection state. The single source of truth for "where am I".
  // Handles BOTH the new path forms and every legacy query form (AC-20).
  route(),          // -> { subject, id, view, action }

  // Render sidebar + topbar into #appSide / #appTopbar. Call ONCE per page load.
  mount(opts),      // opts: { onSearch?: fn(symbol) }  — default navigates to /company/{sym}

  rail(opts),       // -> DOM node: the vertical Views rail. { views:[[slug,label]], active, onSelect }
  entityBar(cells), // -> DOM node: the entity control bar. cells: [{ label, value, mono?, state? }]

  navigate(view, opts), // pushState (default) / replaceState; updates the path, fires onSelect
};
```

### 2.1 `route()` — the routing table

Subject and action are **derived from the path**, killing `sectorapp.js`'s hard-coded
`n[1] === "/sectors"` (AC-6).

| Path | subject | action | id | view (default) |
|---|---|---|---|---|
| `/company/{sym}[/{view}]` | `companies` | — | symbol | `fundamentals` |
| `/compare` | `companies` | `compare` | — | — |
| `/screen` | `companies` | `screen` | — | — |
| `/coverage` | `companies` | `coverage` | — | — |
| `/sectors[/{group}[/{view}]]` | `sectors` | `compare` iff view=`compare` | SIC group | `sector` |
| `/manager/{cik}` | `managers` | — | CIK | — |
| `/components` | *none* | — | — | — |

Company views: `fundamentals` · `statements` · `insider` · `institutional` · `beneficial`.
Sector views: `sector` · `company` · `compare` · `qual` · `filings`.
**Unknown slug → that subject's default view** (AC-21) — never an error.

### 2.2 Legacy URL compatibility (AC-20) — the regression net

Every form below is live in `scripts/headless_check.js` today. `route()` reads the path first; if
the path carries no view, it falls back to the legacy query parameter.

| Legacy form | Resolves to |
|---|---|
| `/company/AAPL?tab=statements` | company view `statements` |
| `/company/AAPL?tab=statements&stmt=balance` | `statements`, sub-control `balance` (`?stmt=` **stays a query param** — it selects a sub-control inside a view, not a view) |
| `/company/AAPL?trend=net_margin` | `fundamentals` + trend deep-link (unchanged) |
| `/sectors?group=28` | sector `28`, view `sector` |
| `/sectors?view=company` / `?a=&b=` | sector app view + compare pair (unchanged) |
| `/compare?symbols=AAPL,JPM,WMT` | `/compare`, symbols query (unchanged) |
| `/screen?view=rank&concept=…` | `/screen` — **`?view=` here is the screen page's own control, NOT a shell view.** `route()` must not consume it. |

⚠️ **`/screen?view=rank` is a genuine collision.** `view` means "shell view" on `/sectors` and
"screen mode" on `/screen`. `route()` only interprets `?view=` for subjects that declare shell
views (`companies`, `sectors`). `/screen` has no view rail, so its `?view=` passes through
untouched. Getting this wrong silently breaks the `screen` headless shot.

**Normalization policy:** legacy query forms are **honored in place, not redirected**. A
`replaceState` to the canonical path form is permitted; a server-side 3xx is not — it would break
the `?stmt=`/`?trend=`/`?symbols=` combinations that carry additional state.

### 2.3 The search-behaviour divergence — resolve explicitly

**AC-5 says submitting the topbar search navigates to `/company/{symbol}`. On `/sectors` it must
not.** Today `sectorapp.js:1949` wires submit to `selectFocal()` — "place this filer in its peer
distribution" — which is the entire point of the Company view and of the distribution strip V3-P1
just shipped. Navigating away would regress P1.

**Resolution:** `mount({ onSearch })` — default navigates; `sectorapp.js` passes `selectFocal`.
One implementation, one wiring, page-specific effect. **QA: AC-5's "navigates to `/company/{symbol}`"
applies to the five component-layer pages; on `/sectors` the correct behaviour is that the focal
company changes and the URL does not leave `/sectors`.** Recorded so it is not filed as a defect.

---

## 3. Nav model (AC-9/AC-10/AC-11)

Ported verbatim from `prototype.dc.html:7334–7357`. Subject order is the prototype's — Companies ·
Sectors · **People** · Managers · Auditors · Funds · Events.

```js
var SUBJECTS = [
  ["companies", "Companies", "/company/AAPL", "Registrants — 10-K, 10-Q, 8-K, proxy and Section 16 filings"],
  ["sectors",   "Sectors",   "/sectors",      "Peer groups of registrants, compared as populations"],
  ["people",    "People",    null,            "Directors and officers as entities — board interlocks, Section 16 history, 8-K 5.02 moves"],
  ["managers",  "Managers",  "/manager/1067983", "13F filers as entities — register footprint, N-PX voting record, 13D campaigns"],
  ["auditors",  "Auditors",  null,            "Audit firms as entities — client portfolio, CAM topics, fees, tenure"],
  ["funds",     "Funds",     null,            "Registered funds — N-CEN, N-PORT and N-CSR filings"],
  ["events",    "Events",    null,            "Form cross-sections — every 4.02 restatement, 4.01 auditor change or 12b-25 in a period"],
];
```

**Planned entries emit `<span class="shell-nav-item is-planned" title="…">`** — a `<span>`, not an
anchor. No `href` attribute, no listener, `cursor: default`, `--mono-muted`, plus the prototype's
mono `planned` badge. This is `STYLE_GUIDE` §10.1 as markup: **if it is not an `<a>`, AC-9 and AC-11
cannot regress by accident.**

Actions are built per active subject (item-4 table in the brief) using the same renderer and the
same `is-planned` treatment, with the description in the `title`.

**Managers' live destination.** The subject needs an href but managers are keyed by CIK with no
"default manager". Use `/manager/1067983` (Berkshire — already the `manager` headless fixture). It
resolves 200, so it is a real destination, not a placeholder link. Same pattern as Companies →
`/company/AAPL` today.

---

## 4. The frame (AC-15/16/17) — and the two honesty traps in it

### 4.1 View rail
Rendered only where the page has ≥2 views: `/company` (5) and `/sectors` (4). `shell.css` supplies
the two-column wrapper (`.shell-body` → `.shell-rail` + `.shell-viewport`), replacing
`sectorapp.css`'s `.pa-body`/`.pa-rail`/`.pa-viewport`, which the sector app then consumes.

`/company`: `company.html`'s `<div class="segmented" id="tabs">` (:25–31) is replaced by a rail
mount. `company.js`'s `onTabClick` (:368) becomes the rail's `onSelect`; `state.tab` slugs are
unchanged, so `renderView()`'s dispatch (:393–396) is untouched. **`#stmt-types` (Income · Balance ·
Cash Flow · Segments) stays exactly where it is** — it is a sub-control inside the Statements view,
not a view. Same for `#period-control`.

### 4.2 Entity control bar — **trap 1: do not port the prototype's basis line**

The prototype's company bar (`prototype.dc.html:85–108`) ends with *"Facts as filed · not restated
for later amendments."* **That statement is false for this product.** `metrics.py` hard-codes
`restatement_basis="as-restated"` and `DATA_MODEL` R9 requires one labeled basis per series. Porting
that line would ship a factual misstatement about our own data and violate `STYLE_GUIDE` §8.1.
**Drop it.** Likewise drop `94% filed` and `Q1 FY26` — synthetic (`ROADMAP_APP_V3` §7).

### 4.3 Entity control bar — **trap 2: "Peer set" is not available (R4 resolved)**

I checked. `/companies/{symbol}/peers` (`routes.py:1117`) returns `peer_group` **per metric**, is
**period-scoped**, carries **no `group_label`**, and reads from precomputed `metric_ranks` — an
empty result is explicitly a valid outcome. There is no page-load-time, period-independent sector
label for a company. Adding one is a new endpoint → backend feature work → **out of scope** and
straight into V3-P5 (Peer-relative) territory.

**Columns, restricted to what each page already resolves on load:**

| `/company/{symbol}` | Source | Always available? |
|---|---|---|
| Company (ticker, large mono) | URL symbol | yes |
| CIK | `P.resolveSymbol()` | yes (after resolve) |
| Period | `state.fundValue` / `state.stmtValue` | yes |
| As of | literal "latest filing" — same claim the masthead makes today | yes |

| `/manager/{cik}` | Source | Always available? |
|---|---|---|
| Manager (name) | `snapshot.manager_name` (`manager.js:128`) | **async** |
| CIK | URL | yes |
| Period | `state.value` (13F quarter) | yes |
| As of | "13F quarter-end · ~45-day lag" | yes |

**Peer set is omitted, not rendered as a permanent N/A cell.** An N/A that can never resolve is
chrome noise, not honesty; §7's vocabulary is for data points, and this is a chrome slot we simply
do not fill yet. Record the reason in a code comment so V3-P5 knows to add it.

**Async cells never fabricate.** The manager name is unknown until the holdings fetch resolves. The
cell renders `—` (or a loading marker) and fills in on resolve. **It must never render the CIK, a
guess, or a blank styled as a value** (AC-16, AC-26).

### 4.4 Title row — a fidelity call I am making, and flagging

The prototype's title row is h1 `Company hub` with the ticker in the right meta. Production's h1 is
the ticker (`company.js:242`). D1 says the prototype wins where the IAs disagree, so **adopt the
prototype**: h1 `Company hub`, subtitle *"Everything filed by this registrant · 10-K, 10-Q, 8-K,
Forms 3/4/5 · as of latest filing"*, right meta `AAPL · CIK 320193`.

**Trade-off, stated:** this weakens the `<h1>` as an SEO signal on our most-indexed page. It is
mitigated — the ticker remains the largest mono element on the page (the control bar's primary
cell) and `<title>` is unchanged. **Flag this row in the 4b questionnaire**; it is exactly the kind
of design-fidelity call that consumed both of V3-P1's fix cycles, and it is cheap to reverse.

### 4.5 No right rail (AC-17)
`rightRailHtml()` stays sector-app-private. `shell.js` exposes no right-rail API in this phase.

---

## 5. Stylesheet consolidation (AC-12/AC-13)

**Survivor: `app.css` owns the `.plot-chart` base rule** (`:441–470`). It is where `chartCard()`
lives and it is now loaded by every shell page.

The rule for the engineer — mechanical, not a judgement call:

> Delete any declaration in a page stylesheet whose property values are **identical** to `app.css`'s.
> Keep declarations that **genuinely differ**, and update the stale "this page does not load
> app.css" comments, which will all be lies after this branch.

Applying it:

| Location | Verdict |
|---|---|
| `app.css:441–470` | **survivor** — base rule |
| `sectors.css:333,408,447` | **gone** with the file (item 7) |
| `company.css:578` `.stmt-chart-cell .plot-chart{margin:0;height:100%}` | **keep** — real positional override |
| `company.css:604` `.inst-cell .plot-chart{margin:0}` | **keep** — real positional override |
| `sectorapp.css:188` `.pa-drill-boxes .plot-chart{margin:0;padding:12px 0;border-top:…}` | **keep** — real override |
| `sectorapp.css:192–195` `.pa-drill-boxes .plot-chart-title/-caption/-body` | **keep, re-comment.** These deliberately differ (sans 13.5px/600, no uppercase vs app.css's mono treatment). They were written as substitutes but function as overrides. **Verify visually after `app.css` loads** — cascade order changes. |
| `sectorapp.css:330–335` `.pa-dp-host .plot-chart*` | **DELETE** (AC-12 canary) |
| `sectorapp.css:338–344` `.pa-dp-host .dist-strip-*` | **DELETE** (AC-12 canary) |

⚠️ **Load-order risk.** `sectorapp.css` must load **after** `app.css` or the kept overrides lose the
cascade. `STYLE_GUIDE` §5's order (`style.css` → `app.css` → page CSS) already prescribes this;
`sector-analytics.html` must adopt it exactly.

---

## 6. The two-phase render contract (AC-14) — do not break this

`sectorapp.js` builds **HTML strings**, assigns them, then post-render `mount*()` functions append
**DOM nodes** (`mountDistribution` :1176, `mountCompanyDots` from P1, box-whisker, geo-mix,
insider-flow). Chart builders return DOM nodes (D5) and cannot be string-concatenated.

**Binding rules:**
1. `ClearyFiShell.rail()` and `.entityBar()` return **DOM nodes**, consistent with `chartCard()` and D5.
2. `mount()` runs **once**, outside `#app`. `renderApp()` must never rewrite `#appSide`/`#appTopbar`.
3. `renderApp()` keeps its exact ordering: assign `#app` innerHTML → `renderViewport()` → `wireShell()`.
4. `wireShell()` loses its sidebar/search wiring (now `shell.js`'s, wired once) and keeps the
   sector-specific wiring: `#paDdBtn`, `#paDdMenu`, `#paPin`, `.pa-rail-btn` → the shell rail, `#coBackBtn`.

**Failure mode if ignored:** the shell re-renders inside `#app`, `mount()` is never re-run, listeners
are lost, and every chart in the sector app silently stops appearing while the page still looks fine.

---

## 7. Backend (R3 resolved): a thin backend sub-stage, first

`api/main.py` is backend-owned (guardrail: no page script may invent server routes), so this goes to
`senior-backend-engineer` **first**, on the same branch. It is small but it gates the frontend —
URL-as-state cannot be verified until the paths 200.

```python
@app.get("/company/{symbol}/{view}", include_in_schema=False)   # -> company.html
@app.get("/sectors/{group}", include_in_schema=False)            # -> sector-analytics.html
@app.get("/sectors/{group}/{view}", include_in_schema=False)     # -> sector-analytics.html
# DELETE /sectors-legacy (main.py:381) + sectors.html/css/js
```

- Every handler returns the **same `FileResponse`** as its bare route. **The server does not validate
  the view slug** — the client owns view resolution (AC-21), and a server-side 404 on an unknown slug
  would contradict it.
- `/manager/{cik}` gains no `/{view}` route — manager has one view until V3-P6.
- **No `/compare/{sectors|companies}`** — deferred to V3-P7 (operator, 2026-07-26).
- Confirm no collision with the `/v1` API routers (they are separately prefixed) and that
  `/sectors/{group}` cannot shadow `/sectors-legacy` — moot once deleted.

`tests/test_static_pages.py`: delete the `/sectors-legacy` test (:160–163); add tests that the new
paths return 200 and serve the right HTML; update the asset assertions (`script.js` → `shell.js`,
`app.css` now on the sector page, `sectors.js` references gone at :133–141).

---

## 8. Ordered implementation plan

### Stage 3a — `senior-backend-engineer` (small, first)
1. Add the three view routes; delete `/sectors-legacy` and `sectors.html`/`.css`/`.js`.
2. Update `tests/test_static_pages.py`; delete the legacy test; add view-route tests.
3. `pytest` green in Docker. **Hand off with the paths serving.**

### Stage 3b — `senior-frontend-engineer` (the bulk, same branch)
4. **`shell.css`** — port the prototype's shell (`:36–70`): 210px sidebar, subject/action/reference
   groups, sticky topbar, `planned` badge, `.shell-body`/`.shell-rail`/`.shell-viewport`, entity bar.
   **Carry over the drawer** from `style.css:972–990` (AC-4) — it exists only on the `script.js` side
   and is the single easiest thing in this branch to lose.
5. **`shell.js`** — `route()`, `mount()`, `rail()`, `entityBar()`, `navigate()`. Drawer + ⌘K/Ctrl-K/`/`
   + Escape + `suggest.js` attach, ported from `script.js:89–148` (do not rewrite from memory —
   that behaviour is correct today).
6. **Retire `script.js`'s shell half**; delete `style.css:737–990`.
7. **`sector-analytics.html`** — add `app.css` + `shell.css` in §5 order; add `#appSide`/`#appScrim`/
   `#appTopbar` mounts **outside `#app`**. **`sectorapp.js`** — delete `sidebarHtml`/`topbarHtml`,
   call `ClearyFiShell.mount({onSearch: selectFocal})` once at `init()`, swap `.pa-rail` → shell rail,
   thin `wireShell()`. **Delete the two canary blocks** (AC-12).
8. **Verify the sector app end to end before touching anything else** — every chart still mounts
   (AC-14). This is the highest-risk step; do not proceed past a broken sector app.
9. **`company.html`/`.js`/`.css`** — shell mounts, rail instead of `#tabs`, entity control bar,
   path-driven `state.tab` + `pushState`, title row per §4.4. Keep `#stmt-types`, `#period-control`,
   the static footer, and every view's content byte-identical.
10. **`manager.html`/`.js`** — shell mounts + entity control bar (async-safe name).
11. **`compare.html`, `screen.html`, `coverage.html`, `components.html`** — swap `script.js` →
    `shell.js`, add `shell.css`. **Nothing else.** Verify `/screen?view=rank` still works (§2.2).
12. **Stylesheet consolidation** per the §5 table.
13. **`scripts/headless_check.js`** — drop `sectors-legacy`; add shots for `/company/AAPL/statements`,
    `/sectors/35`, and a ≤1023px viewport shot proving the drawer (AC-4).
14. Docker e2e; eyeball every screenshot against the prototype before handoff.

---

## 9. Acceptance criteria → concrete checks

| AC | Check |
|---|---|
| AC-1 | `grep -n 'GROUPS\|appSide\|topbar-search' static/script.js` → no hits |
| AC-2 | `grep -rn 'side-link\|shell-nav-item\|pa-side-link' static/*.js` → only `shell.js` |
| AC-3 | Headless shots of all 7 shell pages; sidebar HTML identical |
| AC-4 | 1023px-wide shot: hamburger visible, drawer opens, scrim + Escape + link-click close it — **on `/company` AND `/sectors`** |
| AC-5 | ⌘K/Ctrl-K/`/` focus on all 7; `/company` submit navigates; **`/sectors` submit sets focal, stays on `/sectors`** (§2.3) |
| AC-6 | `/company/AAPL` → Companies highlighted + `aria-current`; `/manager/…` → Managers; `/sectors` → Sectors; `grep 'n\[1\] === "/sectors"'` → no hits |
| AC-7 | Brand is `<a href="/">`, reads `ClearyFi` + `SEC data` |
| AC-8 | `/company`'s static `<footer class="app-footer">` still in the served HTML |
| AC-9 | DOM: the 4 planned entries are `<span>`, no `href`, no listener, `--mono-muted`, `cursor:default`, `title` present; clicking changes nothing incl. the URL |
| AC-10 | Actions re-scope per subject; under Sectors, Screen+Coverage inert with descriptions; under Companies all 3 resolve 200 |
| AC-11 | `grep -n 'href="#"' static/shell.js` → no hits |
| AC-12 | `/sectors` HTML links `app.css`; `grep 'pa-dp-host' sectorapp.css` → no hits; distribution strip still renders with title, caption, dots |
| AC-13 | `grep -rn '^\.plot-chart {' static/*.css` → exactly one, in `app.css` |
| AC-14 | Sector app: distribution strip, `mountDistribution`, box-whisker, geo-mix, insider-flow all render after a tile click and a view switch |
| AC-15 | 5 views, same labels/order; each view's content diffed against `master` |
| AC-16 | Control bars contain no `94% filed`, no hard-coded period, no "not restated" line; manager name renders `—` before resolve, never a guess |
| AC-17 | No right rail in the DOM on the 5 pages |
| AC-18 | `/compare`, `/screen`, `/coverage` content diffed against `master` |
| AC-19 | Click a view → path updates; reload → same view; Back → previous view |
| AC-20 | Every `headless_check.js` URL resolves to the intended view, incl. `/screen?view=rank` and `?tab=&stmt=` |
| AC-21 | `/company/AAPL/nonsense` → Fundamentals, no error |
| AC-22 | Sector Company view: focal selector lists only the selected sector's filers |
| AC-23 | `/sectors-legacy` → 404; the three files gone; no test/shot references |
| AC-24 | `docker compose --profile test run --rm test` |
| AC-25 | Headless failures ⊆ the documented CIK 900001 502 baseline |
| AC-26 | No `0` for a missing value; chips/provenance/13F-derived caveats present as on `master` |

---

## 10. Risks

**A1 — The drawer is the most likely silent loss.** It lives only in `script.js`/`style.css`, which
this branch deletes, and the sector app has no equivalent to copy from. **Port it before deleting
the source**, and keep the narrow-viewport headless shot as the permanent guard.

**A2 — Cascade inversion in `sectorapp.css`.** Blocks written as *substitutes* for `app.css` become
*overrides* once `app.css` loads. Specificity may now differ from intent. Step 8's visual check is
not optional.

**A3 — `renderApp()` clobbering the shell.** §6 rule 2. The failure is silent: the page looks right
and the charts vanish.

**A4 — `?view=` means two different things** (§2.2). Breaks `/screen` silently.

**A5 — Blast radius.** Every data page changes in one branch; the roadmap accepts this deliberately
(one navigation change, one regression pass). The mitigation is the parity checks (AC-15/18) and the
headless suite, not a smaller branch.

**A6 — Baseline honesty.** The e2e suite already reports `HEADLESS CHECK: FAIL` from pre-existing
CIK 900001 502s in the offline sandbox. **Capture the baseline on `master` before starting** so
AC-25 is measured, not asserted.

---

## Handoff

**Full-stack, backend first, one branch off `master`** (`v3-p2-shell-unification`).

- **`senior-backend-engineer` — stage 3a:** §7. Three static routes, `/sectors-legacy` removal,
  `tests/test_static_pages.py`. Small; hand off as soon as the paths serve and `pytest` is green.
- **`senior-frontend-engineer` — stage 3b:** §8 steps 4–14. The bulk.

**Doc updates required in this branch** (not deferrable — the guide will otherwise describe a shell
that no longer exists):
- `STYLE_GUIDE.md` §4.2 — drop the "⚠️ Changing in V3-P2" framing; the subject nav is now what ships.
- `STYLE_GUIDE.md` §5 — replace the page skeleton with the `shell.js`/`shell.css` version and the
  new load order; remove the "don't add a second nav" interim instruction.
- `STYLE_GUIDE.md` §11 — note that `/company` now carries the view rail + entity control bar.
- `ROADMAP_SECTOR_MIGRATION.md:154` — mark the M3 legacy deletion done.
- `docs/ROADMAP_APP_V3.md` §6 — tick V3-P2.

**No `mapping.py`, `DATA_MODEL.md`, schema, repository, or ingest change** — if the implementation
starts reaching for one, that is scope drift: stop and escalate.

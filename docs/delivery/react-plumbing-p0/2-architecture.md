# 2 — Architecture · `react-plumbing-p0`

**Brief:** `1-brief.md` (AC-1 … AC-10) · **Parent:** `docs/ROADMAP_REACT_PLUMBING.md` Phase 0
**Owner:** `senior-frontend-engineer` — **no backend, no Python, no `src/secfin/` change.**
**Date:** 2026-08-02

---

## ⚠️ Scope re-check: the brief's premise is wrong, and the correction is the design

The brief says *"two views break the contract; the others are already on the seam."* **I checked
every page. That is not the state of the app.**

| view | reads the seam? | actual source |
|---|---|---|
| `HubOverview` | ❌ **no** | `hubData(T)` + 13 siblings, synchronous |
| `InstitutionalView` | ⚠️ **hybrid** | takes a `surface` prop **and** calls 8 `inst*()` from `hub.ts` |
| `InsiderView` | ❌ no | `data/insider.ts`, synchronous |
| `HistoryView` | ❌ no | ported lineage |
| `SectorView` · `QualitativeView` · `FilingsView` | ❌ no | `data/prototype.ts`, `data/qualitative.ts` |
| `PeersView` | ✅ yes | `surface` prop |
| Manager (6 views) · Compare (2) | ✅ yes | `useApi` |

**Nine views bypass the seam, not two.** And two further problems fall out of that:

### 1. The loading gates are decorative — they gate on payloads the views never read

`CompanyPage` fires four `useApi` calls (`overview`, `inst`, `insider`, `peers`) and renders
`<HubOverview />` and `<InsiderView />` **with no props**. Those fetches now feed only the
loading/error gate at line 44. So the page shows a spinner for a payload, then renders a view built
from an entirely different source.

**A loading state that resolves independently of the data being displayed is worse than none** — it
reports readiness it cannot know. This is not a Phase A problem to inherit; it is live now.

### 2. `InstitutionalView` reads two synthetic sources that disagree

It takes `surface: CompanyInstitutionalSurface` (from `surfaces.ts`) and computes
`reported = surface.holders.reduce(...)` — **while rendering its holder table from
`instRegister(sel.focal)` in `hub.ts`.** Two independently-seeded fixtures describing the same
register.

`surfaces.ts`'s own header states the principle it violates: *"one builder per view, all reading
the metric engine so no two views can disagree about the same fact (RECONCILIATION §4.4)."* Here a
**single view** disagrees with itself. On synthetic data that is invisible; on real data it is the
class of bug that produces a page whose tiles contradict its table.

### 3. There is no synthetic banner — so **AC-6 cannot pass as written**

`data/api.ts` declares `PROVENANCE = { synthetic: true, note: "Deterministic-synthetic figures. No
SEC endpoint is being called." }` and **nothing imports it.** No component anywhere renders that
disclosure. `app/README.md`'s claim — *"A standing banner says so at the top of every page"* — **is
false.**

Under the operator's 2026-08-02 ruling that this app **succeeds `api/static/`**, an app in which
every figure is synthetic and nothing says so is on a path to being customer-facing. V3-P5a's whole
D-literals discipline was the inverse: `ipBanner()` named the sections still on prototype values,
and its *disappearance* was the proof the phase was done.

**This is a defect, and it should be fixed here.** Design below; it is deliberately a **separate
commit** so it cannot contaminate the AC-2 equivalence diff.

---

## ✅ Scope — DECIDED 2026-08-02: **option C, invert the seam onto the ported lineage**

**Operator ruling.** `data/api.ts` resolves the **ported** builders — `hub.ts`, `insider.ts`,
`qualitative.ts`, `prototype.ts` — the figures the accepted design was drawn against. Not
`surfaces.ts`.

Rejected: **A** (two views against `surfaces.ts` — seam functions we would rewrite in Phase A once
the ported lineage wins anyway) and **B** (all nine views against `surfaces.ts` — plumbing what
`state.tsx` itself calls the *"pre-port synthetic catalog"*, whose shims are already scheduled to
*"disappear as each view is rebuilt against the prototype's own data"*).

### What C settles by construction

Two of the three defects above stop being choices and become consequences:

| defect | how C resolves it |
|---|---|
| **`InstitutionalView`'s two sources** | The `surface: CompanyInstitutionalSurface` prop is **deleted**. Once the seam resolves `hub.ts`, the view has one source and cannot disagree with itself. |
| **Decorative loading gates** | `CompanyPage`'s four `useApi` calls now return the payloads the views actually render, so the gate finally gates on the right thing. |

Only the **missing synthetic banner** remains a discretionary call. It ships as **commit 2**,
isolated so it can be dropped without touching anything else — see Design 3. Recommended in scope:
under the successor ruling an app where every figure is synthetic and nothing says so is heading for
customers.

### What C means for `surfaces.ts` — the name survives, the job inverts

Today it **generates** figures from `seed.ts`. Under C it **adapts** payloads it is handed:
`f(fixture) → viewModel` in Phase 0, `f(apiResponse) → viewModel` in Phase A, **same function
signature both times.** That is the whole point of the ruling — *the adapters written in Phase 0 are
the ones that survive Phase A*, fed real JSON instead of fixtures.

`seed.ts` and `metrics.ts` die as each view lands. `catalog.ts` **stays** — product knowledge, per
the app README.

### Split

- **`P0a` (this task):** `HubOverview` + `InstitutionalView` + the harness + the banner. Size
  unchanged from the brief.
- **`P0b` (follow-on):** the remaining seven views — `InsiderView`, `HistoryView`, `SectorView`,
  `QualitativeView`, `FilingsView`, plus retiring the `state.tsx` shims and `surfaces.ts`/`metrics.ts`.
  Mechanical once the P0a pattern exists; **not costed here** and should get its own brief.

## Architecture boundary check

**This task touches no stage of the four-stage pipeline.** No `sec/`, `ingest/`, `normalize/`,
`storage/`, `api/`. No canonical concept, so **no `mapping.py` and no `DATA_MODEL.md` update**
(guardrail 3 not engaged). No SQL, no repository, no DuckDB, no SEC request — guardrails 2, 5, 6, 7,
8 are all inert here. Track 1 throughout: no free text is parsed, nothing is summarised.

**One boundary gap to record.** `senior-frontend-engineer`'s SKILL says it owns
`src/secfin/api/static/`. This task is entirely `clearyfi_frontend/`. Under the successor ruling
that skill's ownership line and `CLAUDE.md`'s repo-layout section both need updating — **a docs
change, not a blocker, but it should not be left implicit.**

---

## Design 1 — the seam's payload boundaries

### The principle: follow the BACKEND's read boundary, not the page's visual boundary

The brief's instruction is that Phase A must be a body change, not another refactor. That means the
grouping has to anticipate how the endpoints group.

**Precedent, from our own API.** `/institutional-register-shape` returns turnover, tenure *and*
stable-capital together, and its docstring says why: *"returned together because they all consume
the identical multi-quarter read — splitting them would triple the work for one dataset."*

**Counter-precedent, also ours.** `ROADMAP_REACT_PLUMBING` records V3-P5a's **~3–5 s page load** from
**13 concurrent requests serialising on one event loop**. The API is deliberately single-process.
**One seam call per visual section would rebuild that problem by construction.**

So: **one seam function per backend read pattern.** Not one per section (too many), not one per page
(blocks on the slowest, and no such aggregate endpoint exists or should).

### Hub Overview — 6 seam functions

| seam fn | Phase A source | feeds |
|---|---|---|
| `companyIdentity(symbol)` | `/profile` + `/submissions` metadata (V1/V3b) | §01 profile card, breadcrumb, EDGAR links, §01.1 |
| `companyFinancials(symbol, year, fiscalPeriod)` | `/statements/{s}/condensed` ×3 + `/metrics` + `/periods` — **one facts read serves all** | §02.1 statements, §02.6 snapshot |
| `companyMetricSeries(symbol, id, range, basis)` | `/metrics/{m}/history` — **per-metric, on demand** | §02.3 trend drawer, §02.5 tray |
| `companyFootnotes(symbol, year, fiscalPeriod)` | Phase B grouped-concepts route | §02.8–2.18, §04.1–4.3, §07 |
| `companySegments(symbol, fiscalYear)` | Phase C dimensional | §02.7, §03 entire, §04.5 |
| `companyFilingEvents(symbol)` | `/filing-index` — **one walk, many consumers** | rail timeline, §05.1, §06.4–6.6, §08.4/8.6, the "what changed" band |

Plus `companyOwnership(symbol, quarterEnd)` → `/beneficial-ownership` + `/insider-trades` for §04.7 and
§05.4 — **shared with `InsiderView`**, which is why C's re-scope matters.

`companyMetricSeries` is deliberately **not** folded into `companyFinancials`: it is
parameterised by the reader's range/basis choice and fires on interaction, not page load. Folding it
in would mean refetching six statements to change a chart's window.

### Institutional — 5 seam functions, mapping to endpoints that already exist

| seam fn | shipped endpoints |
|---|---|
| `instRegisterSnapshot(symbol, quarterEnd)` | `institutional-periods`, `-filed-since`, `-share-attribution`, `filing-index` |
| `instRegisterSeries(symbol, quarters)` | `-holdings-series`, `-holders`, `-register` (composition + concentration + Lorenz) |
| `instFlows(symbol, quarterEnd)` | `-activity`, `-activity-series`, `-conviction` |
| `instRegisterShape(symbol, quarters)` | `-register-shape` (turnover + tenure + stable-capital + retention) |
| `instStewardship(symbol, quarterEnd)` | `beneficial-ownership`; N-PX **not ingested** → honest empty state (D-voting, widened) |

These follow the shipped routes exactly, because V3-P5a already drew these boundaries and the
operator accepted them.

### What must NOT become seam functions

**Product knowledge, not data.** These stay plain module imports, per the app README's own rule that
`catalog.ts` *"keeps the metric definitions … which are product knowledge rather than mock data"*:

`HUB_SECTIONS` · `INST_SECTIONS` · `INST_HEADS` · `LABEL_TO_ID` · `unitFmt` · **`HUB_CALCS`**
(our documented derivations — formula, inputs, and the condition under which our number and the
filer's legitimately differ) · `INST_GLOSSARY` · `MIX_KINDS` / `MIX_COLORS` · `edgarLink` ·
`STANDARD_DISCLOSURES`.

**The test:** if Phase A would have to re-cut a boundary, it is drawn wrong now.

---

## Design 1b — the adapter contract *(operator ruling, 2026-08-02)*

> **Ruling.** *"The api response is the source of truth and the surfaces can adapt the information
> per card/view. The api should be canonical as much as possible. The frontend can make as many api
> requests to get all its data and then transforms/re-shape as needed."*

This settles the layering. Two modules, two jobs:

| module | job | may it compute? |
|---|---|---|
| `data/api.ts` | **fetch** — params out, canonical JSON in. Fans out to N endpoints, `Promise.all`, returns raw responses. | no |
| `data/surfaces.ts` (repurposed) | **adapt** — pure `f(responses) → viewModel`. Rename, group, order, label, merge. | **no** |

### The hard line: reshape, never derive

The adapter may not compute a number the API did not return.

Every derived figure the API serves carries `status` / `reason` / `formula` / `cannot`. A client
that divides two fields to produce a percentage **discards all four**, and a figure rendered without
them is indistinguishable from a fabricated one. That is the product's whole differentiator.

Two precedents, both ours:

- **`/institutional-register` returns `share_vector` alongside the concentration figures**, and says
  why: *"so a cumulative-share chart and the tiles beside it can never disagree (STYLE_GUIDE rule
  12)."* An adapter that recomputed the vector would void that guarantee.
- **§04's "adjusted base" is the counter-example.** The prototype computes 13F shares + net deltas
  as a % of shares outstanding. `institutional-share-attribution` **deliberately refuses** to return
  it — D-attribution ruled *three reported rows, no residual, no total, `rows_are_additive: false`*.
  An adapter "massaging" those rows into the card's arithmetic reintroduces exactly the fabricated
  residual the operator struck out. **That card needs a redesign, not an adapter.**

**Rule for the engineer: if the number is not in the response, the card renders `N/A`. Never
arithmetic.** The corollary — `?? 0` is banned in this module — is the single most likely honesty
regression in the whole plumbing effort.

### The endpoint stays canonical; the card does not shape it

The `/v1` API is the product being sold, not a backend-for-frontend. When a card wants something no
endpoint returns there are exactly two moves: **add it to the endpoint as a fact** (Phase B mapping
work, with its own provenance), or **render `N/A`**. Never: the adapter invents it.

### The adapter is bidirectional — and this is where the period problem lives

`period` is **three incompatible things** in the real API, all spelled the same:

| vocabulary | shape | endpoints |
|---|---|---|
| fiscal pair | `year: int` (**required**) + `period: FiscalPeriod` = `"FY"\|"Q1".."Q4"` | `/metrics`, `/statements/{s}`, `/peers`, `/sectors` |
| 13F quarter-end | `period: str` = `"2026-03-31"` (**required, no default**) | ~11 institutional endpoints |
| lookback count | `quarters: int` | `-holdings-series`, `-register-shape`, `-activity-series` |

The app currently carries one hard-coded string, `period: "2026-Q1"` (`state.tsx:208`), which
matches **none** of the three. `subIndustry` is likewise pinned to `null`.

**These are not freely convertible.** A fiscal Q1 for Apple ends in late September; a 13F quarter-end
is a calendar date. `CLAUDE.md` already flags the same trap for the frames API — *"frame periods are
CALENDAR-quarter aligned (not fiscal-period aligned)"*.

So one URL state (`?period=`) must **fan out into three vocabularies**, per endpoint family. That
conversion belongs in the adapter, on the way *in*, and it is **unbuilt work neither the brief nor
the first draft of this document costed.** It also validates Design 1's grouping: each group has one
period vocabulary, so each conversion lives in exactly one place.

---

## Design 1c — request volume: the ruling, and the collision it exposes ⚠️

> **Ruling.** *"The frontend can make as many api requests to get all its data."*

**Accepted, and it is the right call for the API's integrity** — it means no endpoint gets bent into
an aggregate to save a round-trip, and canonicality is never traded for page speed. Design 1's
groupings stay as drawn.

**But it collides with the gating rule and the tier model, and the collision is a product decision,
not an engineering one.**

### The gating rule is explicit and was learned the hard way

`routes.py:163-173`:

> *"if one of our own static pages will call it client-side, it goes on `public_router`, **full
> stop** — gating an endpoint our own UI depends on just breaks that UI (see the insider-trades tab
> / metric-periods 401s this exact mistake caused)."*

Current split: **26 endpoints on `public_router`** (keyless, IP-limited), **23 on `router`**
(`require_api_key`), 1 internal.

### Under the successor ruling, the React app *is* "our own UI"

So by that rule, **every endpoint it calls client-side must move to `public_router`** — including
most of the institutional set Phase A needs, which currently sit on the keyed `router`.

**That makes them free and keyless.** If the React app is the full product UI, it calls nearly
everything, and nearly the whole API becomes public. **That erodes the paid surface**, which is a
pricing decision (`docs/product/PRICING.md`), not a refactor detail.

### And the rate limits do not fit an SPA

| | limit |
|---|---|
| anonymous / `public_router`, per IP | **2.0 req/sec** (`config.py:48`) |
| `free` tier key | **5 req/sec, 1,000 req/day** |
| `basic` | 20/sec, 25,000/day |

A Hub Overview page under this ruling fires roughly **15–20 requests**. At 2.0/sec that is **~8
seconds of pure rate-limiting** before a single query runs. On the `free` key tier, 1,000/day ÷ ~18
per page ≈ **55 page views per day**.

**The structural difference the successor ruling introduces:** the server-rendered app builds most
of each page **in-process** and fetches only enhancements client-side. An SPA has no server render
step — **every figure is a client fetch.** The existing limits were sized for the former.

### Options — operator's call, none of them compromise canonicality

- **(a) Session auth for the app**, separate from customer API keys, with its own generous limit.
  ✅ *Recommended* — the app authenticates as itself, the public API keeps its tiers intact, and no
  endpoint has to move to `public_router` to keep the UI working.
- **(b) Raise the anonymous IP limit** for the app's origin. Simplest; weakens abuse protection on
  an unmetered surface.
- **(c) Move the endpoints to `public_router`** as the gating rule literally requires, and accept a
  much smaller paid surface. Honest to the existing rule; a real pricing change.
- **(d) Pre-render the first paint** (Vite SSR). Removes the burst entirely; much the largest change
  and not a Phase 0 option.

**Not blocking Phase 0** — nothing here is fetched yet. **Blocking Phase A**, and it should be
decided before the first endpoint is wired, because (a) and (c) imply different auth plumbing in the
adapter.

---

## Design 2 — the AC-2 render-equivalence harness

### Determinism is verified, which is what makes the diff meaningful

I checked: **no `Date.now()`, no `new Date()` (arg-less), no `Math.random()` anywhere in `app/` or
`src/`.** All 27 `new Date(...)` calls take an explicit argument, and `managerActivity` pins
`today = "2026-08-01"`. Same ticker → same numbers, always. **Without this the harness would be
worthless**, so it is stated as a precondition the engineer must re-check if `seed.ts` changes.

### Mechanism

1. `npm run app:build` → `app-dist/`, served statically.
2. Headless Chromium visits each `(route, ticker)` pair.
3. **Wait for the resolved state, not the loading one** — `waitForFunction` on the absence of
   `.state-loading` within the view root. This is the harness's one real trap: post-refactor the
   views render a loading frame first, so a naive `domcontentloaded` capture would diff a spinner
   against a page.
4. Dump `document.querySelector('[data-view-root]').outerHTML`, normalise, write one file per pair.
5. `diff` baseline vs post-change. **AC-2 passes only on an empty diff.**

**Normalisation:** strip React `data-reactroot`, collapse whitespace between tags, and drop
`id`/`aria-controls` values that embed a generated suffix. Nothing else — over-normalising is how a
diff goes green while the page changed.

**Baseline capture is step zero.** It must be taken on the **unmodified** commit, before any edit,
and committed as a fixture. A baseline captured after the first edit proves nothing.

### No new dependency (AC-9)

Reuse `ghcr.io/puppeteer/puppeteer:latest` — **already pulled** by the repo's `e2e` compose profile —
via a new `e2e-react` profile that serves `app-dist/` and mounts the script. **No npm dependency is
added to `clearyfi_frontend`**, which keeps AC-9 clean and matches how `scripts/headless_check.js`
already works for the server-rendered app.

### Screenshots as the eyeball pass (not the gate)

Same harness, `page.screenshot`, **transitions disabled** — inject
`* { transition: none !important; animation: none !important; }` before capture. The V3-P5a port log
records screenshots taken mid-transition diffing as layout bugs; do not repeat it. Both themes, and
one mobile width for AC-10.

---

## Design 3 — the synthetic-disclosure banner (separate commit)

**Build the V3-P5a `ipBanner()` pattern, not a static string.** A component that takes the list of
surfaces still running on synthetic data and renders nothing when that list is empty.

That gives Phase A a per-section retirement path and makes the banner's eventual **disappearance**
the proof that plumbing is complete — exactly how D-literals was demonstrated on 2026-08-01.

Copy follows the honesty rules already in force: name what is synthetic, do not hedge, and **do not
imply any figure is real.** `PROVENANCE` in `api.ts` is the natural home for the list.

**Sequencing is load-bearing:** commit 1 is the refactor and must produce an **empty** AC-2 diff;
commit 2 adds the banner and **deliberately changes the render**, verified on its own. Combining
them destroys the equivalence claim, which is the only real check this task has.

---

## Ordered implementation plan — `senior-frontend-engineer`

Branch off `master`. One branch: `react-plumbing-p0`.

| # | step | AC |
|---|---|---|
| 1 | Build the harness (`clearyfi_frontend/scripts/render_snapshot.js` + `e2e-react` compose profile). **Capture and commit the baseline on the unmodified tree.** | AC-2 |
| 2 | Add seam functions to `data/api.ts` per Design 1, resolving the **ported** builders (`hub.ts`) — option C. Each returns a fixture today and an API response in Phase A, **same signature**. | AC-1 |
| 3 | Convert `HubOverview` + `HubRail` to `useApi`; keep the static imports static. | AC-1, AC-8 |
| 4 | Convert `InstitutionalView`; **delete the `surface` prop** and its `surfaces.ts` import — the two-source defect goes with it. | AC-1, AC-8 |
| 5 | Add `StateBlock` loading / empty / error to both. Re-point `CompanyPage`'s gates at the payloads the views now actually read — the decorative-gate defect goes with it. | AC-3, AC-4, AC-5 |
| 6 | Re-run the harness. **Diff must be empty.** Eyeball screenshots, both themes + mobile. | AC-2, AC-10 |
| 7 | `npm run app:typecheck && npm run app:build`. | AC-7 |
| 8 | **Separate commit:** the disclosure banner. Re-run the harness; the diff is now expected to be non-empty **and confined to the banner**. | AC-6 |

### Honesty requirements called out

- **`data === null` must never format as `0`.** Every numeric render behind a `Resource<T>` returns
  the `StateBlock`, not a defaulted value. This is the single most likely regression (brief, Risk 3)
  and the product's cardinal rule.
- **Empty is not null.** A resolved payload with zero rows is `empty`; an unresolved one is
  `loading`. `StateBlock`'s own `empty` copy already encodes the distinction — *"a filing is on
  record … not the same as 'nothing filed'"* — and it must not be reused for a failed fetch.
- **Nothing becomes more real.** No caveat, disclosure or `STANDARD_DISCLOSURES` entry is removed.

### Test strategy

`pytest` is **not** run — no Python changes. The gates are: the AC-2 diff (automated),
`app:typecheck`, `app:build`, the screenshot eyeball, and the operator's `4b` hand-run. QA should
additionally drive every control in AC-8 and force an error by throwing inside a seam function.

---

## AC → concrete check

| AC | check |
|---|---|
| AC-1 | `grep -rn 'data/hub' app/pages/` → **0 hits** |
| AC-2 | `diff` of baseline vs post-change snapshots → **empty**, ≥3 tickers × 2 views |
| AC-3 | `?slow` → `.state-loading` present in both views |
| AC-4 | throw inside a seam fn → `StateBlock variant="error"`, page intact |
| AC-5 | empty-array payload → `variant="empty"`; **no `0` rendered for a missing value** |
| AC-6 | banner renders; removing the last synthetic surface from `PROVENANCE` renders nothing |
| AC-7 | both npm scripts exit 0 |
| AC-8 | drive all 12 controls (statement tabs ×3, range ×3, basis ×2, tray add/remove/clear/hide, calc chips, snapshot tiles, rail filters, Institutional expanders) |
| AC-9 | `git diff package.json` → no dependency added |
| AC-10 | screenshots in both themes + one mobile width |

---

## Handoff → `senior-frontend-engineer`

**Unblocked — scope decided (C, 2026-08-02). Ready to implement.** The three findings above — the decorative gates, the two-source hybrid, and the missing
banner — are defects in the current app, not consequences of this change; they are fixed here
because this task is already inside all three.

**No backend stage. No `2-architecture` backend section exists because there is no backend work.**
If Phase A's endpoints later need shaping to match Design 1's boundaries, that is a Phase A
architecture task and belongs to `senior-backend-engineer` then, not now.

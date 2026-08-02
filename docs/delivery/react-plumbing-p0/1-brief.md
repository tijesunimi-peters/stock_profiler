# 1 — Brief · React plumbing **Phase 0**: move the last two views onto the data seam

**Task slug:** `react-plumbing-p0`
**Parent:** `docs/ROADMAP_REACT_PLUMBING.md` (Phase 0)
**Stage:** Product Manager → Principal Architect
**Date:** 2026-08-02

> **Context note.** This brief was scoped from `docs/ROADMAP_REACT_PLUMBING.md` and its six
> verification results (V1–V6, all closed 2026-08-02), which are on disk. The PM-stage context
> reset was not run because the immediately preceding work *is* this task's discovery phase, not a
> previous task's residue. Every input is durable and re-readable.

---

## Problem / user

**Who hurts:** us, immediately — and every downstream phase of the plumbing roadmap.

`clearyfi_frontend/app/data/api.ts` is the app's data seam. Its own README states the design
contract: *"`data/api.ts` is the only file that knows where data comes from. Every view reads
through it and nothing else, and it is already async, so the swap is: `fetch('/v1/…')`."*

**Two views break that contract.** `HubOverview.tsx` and `InstitutionalView.tsx` call `hub.ts`
**synchronously and directly** — `hubData(T)`, `instRegister(sel.focal)`, `instSnapshot(sel.focal)`
and eight siblings. There is no seam to repoint and nowhere to put a fetch.

**Why it matters now, and not later:** these are not marginal views. They are **the two the
roadmap plumbs first and the two best served by shipped endpoints** — the Company Hub Overview is
the whole of Phase A, and the Institutional view maps almost card-for-card onto the endpoints
V3-P5a delivered and the operator accepted on 2026-08-01. Every hour of Phase A work done before
this refactor is work done against a seam that does not exist.

**Evidence:** `grep` of `app/pages/**` shows every other page using `useApi(() => api.x(...))`;
these two import from `../../data/hub` and render from a synchronous return value. They
consequently have **no loading state, no error state and no empty state** — three of the four
states the product's honesty posture requires, structurally absent.

**How we know it's solved:** both views render **pixel-identically** to today, while reading
exclusively through `api.*`, and their loading / empty / error states are exercisable.

---

## Scope

**The smallest slice that delivers value: a pure refactor. No new data, no new endpoint, no
changed pixel.**

1. **Add seam functions** in `data/api.ts` for the payloads the two views need, resolving the
   *existing* synthetic builders in `hub.ts` — exactly as the other 17 seam functions already do
   for `surfaces.ts`.
2. **Convert `HubOverview.tsx`** to read through `useApi`, including its `HubRail` export.
3. **Convert `InstitutionalView.tsx`** the same way.
4. **Add the three missing states** to both, using the existing `StateBlock` component — the same
   vocabulary every other view already uses.
5. **Establish a render-equivalence check** for the React app, which today has none (see AC-2 and
   Open decision 2).

### Out of scope — explicitly

- **Any real endpoint call.** Phase 0 ships the seam; Phase A repoints it. The app stays 100%
  synthetic when this lands.
- **Removing the synthetic banner**, deleting `seed.ts` / `surfaces.ts` / `hub.ts`, or touching
  `catalog.ts`. Those come when a surface is actually plumbed.
- **Any card, copy, layout, grid, class-name or affordance change.** Rule 2 of the roadmap.
- **The other views** — sector, qualitative, filings, compare, manager, history, insider, peers,
  overview. They are already on the seam and are not touched.
- **The whole-market bulk backfill.** It is a parallel prerequisite for *Phase A*, not for Phase 0,
  and it is an existing deferred DevOps item — see Risk 2. It should be *decided* now because it is
  long-running, but it is not this task's deliverable.
- **Track 2 anything.** Unchanged.

---

## Acceptance criteria

Observable and testable. QA checks these.

| # | Criterion |
|---|---|
| **AC-1** | Neither `HubOverview.tsx` nor `InstitutionalView.tsx` imports from `data/hub` any more. A grep for `from "../../data/hub"` in `app/pages/**` returns **zero** results. Both read only via `api.*` through `useApi`. |
| **AC-2** | **Render equivalence.** For at least three focal tickers, the rendered DOM of each view is **identical** before and after, ignoring only React-generated keys. A diff is produced and is empty. This is the load-bearing criterion — it is what "no layout change" means operationally. |
| **AC-3** | **Loading** renders via `StateBlock` and is reachable with `?slow` on the URL (the app's existing 900 ms latency switch). Confirmed on both views. |
| **AC-4** | **Error** renders via `StateBlock` and degrades honestly — a thrown seam function shows the error state, not a blank page, a partial chart, or a crash. Confirmed by forcing a rejection. |
| **AC-5** | **Empty** renders via `StateBlock` where a payload legitimately has no rows, and reads as an honest empty state — **never a zero**, never a broken chart. |
| **AC-6** | **The synthetic banner still shows on every page.** Phase 0 changes nothing about where the data comes from, so nothing about the disclosure may change either. A reader must not be able to infer from this change that any figure became real. |
| **AC-7** | `npm run app:typecheck` and `npm run app:build` both pass. |
| **AC-8** | **No behaviour regressions.** Every control in both views still does what it did: the statement tabs, the trend drawer's range and basis tabs, the comparison tray (add / remove / clear / hide), the calc chips (`ƒ derived`), the snapshot tiles, the rail's form filters, and Institutional's expanders. A control that renders and does nothing is a defect (**D-behaviour**). |
| **AC-9** | **No new dependency**, nothing loaded from the network, no CSP-violating asset. |
| **AC-10** | Both views render legibly in **light and dark**, unchanged from today. |

### Honesty criteria are AC-5 and AC-6 specifically

This is a refactor, so the honesty surface is narrow but sharp: **the change must be invisible in
the data-truthfulness dimension.** Nothing becomes more real. The banner stays. No `N/A` becomes a
`0` and no `0` becomes an `N/A` as a side effect of moving through an async boundary — a plausible
regression when `null` payloads start flowing through `Resource<T>`.

---

## Risks / open decisions

### Risk 1 — "pixel-identical" is asserted, not tested, until we build the check

The React app has **no test harness at all**: `package.json` offers `app:typecheck` and
`app:build` and nothing else. The server-rendered app's e2e Chromium check
(`docker compose --profile e2e`) points at `secfin.api.main:app` and does not see this app.

**AC-2 therefore requires building something that does not exist.** This is the one place Phase 0
is not purely subtractive, and the architect must scope it. **Open decision 2 below.**

*Why this is worth insisting on:* V3-P5a's fidelity gate failed **three times** before passing, and
the log's own conclusion was that a section whose headers, copy and grids all match can still be a
third of the work. A refactor of two 1,200-line views without a diff is exactly the shape of change
that looks finished and is not.

### Risk 2 — the bulk backfill is a real ops decision with no restore point ⚠️

**This does not block Phase 0. It blocks Phase A, and it is long-running, so it should be decided
in parallel — not discovered later.**

> ### ✅ DECIDED 2026-08-02 — **wire backups first, then re-ingest**
>
> **Operator ruling.** The DO Spaces backup path is settled and `secfin-backup.timer` un-paused
> **before** the prod-volume re-ingest runs. Phase 0.5 is therefore **two** sequential DevOps
> tasks, both operator-gated, and the first one is the backup path — not the ingest.
>
> This retires the "no restore point + non-regenerable `api_keys`" exposure before a multi-hour
> disk-filling run touches the volume, and it settles the 100 GiB-vs-57 G-snapshot problem
> (`DEPLOYMENT_BLOCK_STORAGE.md`) by moving snapshots off-box, which is the same decision.

V1 found the dev volume holds **1,153,678 facts across 8,919 companies, of which only 72 carry ≥50
distinct tags**. Phases A and B render for ~72 companies without a backfill.

**It is not new work to design.** It is an already-scoped, already-validated, **deferred** DevOps
step:

- `ROADMAP_SECTOR_ANALYTICS` #3 — the whole-market backfill was **run and verified** (20,072
  companies, 121M facts) on a *scratch hydrated copy*. The **prod-volume re-ingest is explicitly a
  deferred DevOps step.**
- `DEPLOYMENT_BLOCK_STORAGE.md` step 3 — same item, still open.

**The risks attached to it are already documented and are serious:**

- Live data after re-ingest ≈ **54 G**, on a **100 GiB** Volume that also cannot hold a 57 G
  snapshot alongside it. The operator chose 100 G over the recommended 250 G.
- **There is no restore point at all.** Droplet snapshots were deleted to reclaim root disk;
  Spaces-backed backups are **not yet wired** and `secfin-backup.timer` is **paused**.
- Granular `raw_facts` is regenerable. **`api_keys` is not.**
- The box is 1 vCPU / 2 GB; the run needs `SECFIN_BACKFILL_WORKERS=1` and takes several hours.

**Recommendation: settle the backup path before the re-ingest, not after.** Running a
multi-hour, disk-filling, irreversible-in-practice ingest against a database with no restore point
and a non-regenerable table is the kind of risk that is cheap to retire first. This is a DevOps
task (`/devops-engineer`) and operator-gated; it is named here so it is not discovered at Phase A.

### Risk 3 — a `null` payload silently becoming a rendered `0`

Moving from a synchronous return to `Resource<T>` introduces `data === null` on every first render.
Any component that does `data?.x ?? 0` — or that formats `undefined` through a numeric formatter —
turns a loading state into a fabricated zero. **AC-5 and AC-6 exist for this.** It is the single
most likely honesty regression in an otherwise cosmetic change, and it is the product's cardinal
rule.

### ✅ DECIDED 2026-08-02 — `clearyfi_frontend` is the **successor** to `api/static/`

**Operator ruling.** The React app replaces the server-rendered app as the product frontend;
`src/secfin/api/static/` enters maintenance.

**This does not change Phase 0** — the refactor is identical either way. It changes what Phase A
and DevOps owe, and those consequences are cheaper to name now than to discover:

1. **Phase A owes parity, and the parity set must be enumerated — not assumed.** The shipped app
   covers more than the React app does: the company hub (which absorbed the data explorer, with
   `/explorer` redirecting to it), the sectors app, manager pages, coverage/guide pages, and the
   marketing/prose pages. **The React app has no equivalent of several of these.** Someone must
   list what must exist before the switch, and that list is a Phase A input, not a Phase 0 one.
2. **`CLAUDE.md`'s shell rule transfers.** It currently names `api/static/shell.js` as *"THE
   product shell … the ONLY nav implementation — don't add a second."* Under this ruling the React
   shell inherits that status. **`CLAUDE.md` and the repo-layout section need updating** — a docs
   task, but a load-bearing one, because that rule is what has kept a second nav from appearing.
3. **The honesty vocabulary must come across intact.** The React app's own README already flags
   two deliberate departures from the prototype, one of which is that it keeps a **"Data notes &
   coverage"** block the prototype has nowhere. Under a successor ruling that block stops being a
   nicety and becomes a product commitment, alongside the status/provenance chips and the
   `N/A`-never-`0` rule.
4. **Two things the React app does not have at all, and a customer-facing app needs:**
   **API-key auth and the tier/quota handling** (M3 — the shipped app has `/usage`, tiers, admin),
   and **a serving story**. The React app builds to a static `app-dist/`; the shipped app is served
   by FastAPI out of `api/static/`. Whether the SPA is served by FastAPI, by Caddy, or from a
   separate origin is a **DevOps decision with CSP implications** and it is not yet made.
   *These are Phase A / DevOps scope. Flagged, not designed here.*

### Open decision 1 (remaining) — does Phase 0 cover both views, or Hub first?

The roadmap's stated order is "company hub overview page, section by section." **Recommendation:
both, in one task.** They are the same refactor twice, they share the `StateBlock` and `useApi`
wiring, and splitting them means building the AC-2 equivalence harness for one view and then
re-running it for the other. Splitting is defensible if the diff turns out to be large; that is the
architect's call once the harness exists.

### Open decision 2 (remaining) — how do we test render equivalence? *(architect's to propose, operator's to fund)*

Three routes, cheapest first:

- **(a) DOM snapshot diff.** Render both views to static HTML pre- and post-change (Vite build +
  a headless page visit), normalise React keys, `diff`. Cheap, catches structural change exactly,
  catches nothing visual that the DOM does not encode.
- **(b) Screenshot diff** with the Puppeteer image the repo already pulls for the server-rendered
  e2e. Catches visual regressions the DOM misses; needs a stable viewport and transitions
  disabled — a known trap from the V3-P5a port log, where charts captured mid-transition diffed
  as layout bugs.
- **(c) Both.** DOM diff as the gate, screenshots as the eyeball pass.
- **Recommendation: (c)**, with (a) as the automated gate. The app has no harness at all, so
  whatever is built here becomes the foundation for every later phase — that argues for doing it
  properly once rather than three times.

---

## Handoff → Principal Architect

**Design against AC-1 … AC-10.** The shape of the work is well-constrained; the two things that
need real design are:

1. **The seam's payload boundaries.** `hub.ts` exposes ~14 functions to these two views
   (`hubData`, `hubProfile`, `hubSnapshot`, `hubInsider`, `hubLinks`, `hubSegmentChips`,
   `hubContextPill`, `metricDefs`, `seriesFor`, `instFreshness`, `instRegister`, `instSnapshot`,
   `instRegisterExtras`, `instFlows`, `instSteward`, `instBehavior`, `instLimits`). **Do not
   mirror all of them as seam functions.** Group them the way the *endpoints* will group them in
   Phase A, so the Phase A swap is a body change and not another refactor. `ROADMAP_REACT_PLUMBING`'s
   §01–§08 card ledger is the map of which endpoint feeds which card — use it to draw the
   boundaries now.
2. **The AC-2 harness** (Open decision 2).

**Do not** design the endpoint calls themselves — that is Phase A, and it depends on rulings the
operator has not yet given (the seven listed at the end of the roadmap), plus the parity-set
enumeration and the serving/auth questions raised by the successor ruling above.

**Owner after design:** `senior-frontend-engineer` — this is entirely `clearyfi_frontend/`, no
Python, no API change.

**Note on `_active.md`:** deliberately **not** overwritten. It still records `v3-p5a-institutional`
as `next_stage: done` with its RESUME block intact. Starting `/deliver` on this task will replace
it — that is the pipeline's normal behaviour and needs no permission, but it has not been done
pre-emptively here.

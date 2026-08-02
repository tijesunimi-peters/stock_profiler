# Active delivery task

task_slug: react-plumbing-p0
request: Phase 0 of `docs/ROADMAP_REACT_PLUMBING.md` — move the Company Hub Overview and
  Institutional views onto the `clearyfi_frontend` data seam (pixel-identical refactor), so the
  Phase A endpoint swap is a body change and not another refactor.
branch: merged — `061dd99` (refactor) + `d03c633` (banner) are **in `master`**; the stale
  `react-plumbing-p0` pointer still sits at the old base `bb1e672` and can be deleted
next_stage: done
qa_cycles: 0
updated: 2026-08-02

> Previous task **v3-p5a-institutional** completed 2026-08-01 (`next_stage: done`, §01–§06 all
> operator-accepted, D-literals satisfied). Its state file is preserved in git at `9652721`;
> its stage docs are intact in `docs/delivery/v3-p5a-institutional/`.

## Progress
- [x] 1 Product Manager       -> 1-brief.md
- [x] 2 Principal Architect   -> 2-architecture.md
- [x] 3 Frontend  -> 3-implementation.md  (AC-1..AC-9 green; AC-10 partial — no dark theme exists)
- [x] 4 QA Tester             -> 4-qa.md  (✅ PASS — pending manual UI verification)
- [x] 4b Operator manual verification -> 4b-manual-verification.md  ✅ **CONFIRMED 2026-08-02**

## P0b — the remaining seven views (follow-on, same task folder)
- [x] P0b-1 Company  `cf01f6c`  · HistoryView, InsiderView, PeersView
- [x] P0b-2 Sectors  `39e8837`  · SectorView, QualitativeView, FilingsView, SectorPage
- [x] P0b-3 Manager  `8bd8fab`  · ManagerPage + the six views, **plus a chart-readout leak fix**
- [x] P0b QA         -> `4-qa-p0b.md`   ✅ PASS, 73 driven assertions, 0 product defects
- [x] P0b 4b operator verification -> `4b-manual-verification-p0b.md`  ✅ **CONFIRMED 2026-08-02**
- [ ] P0b-4 Retirement · delete `surfaces.ts`/`metrics.ts`, kill the 27 `state.tsx` shim usages  ⬅ **NEXT, and now unblocked**

---

# ✅ PHASE 0 IS COMPLETE AND ACCEPTED

All five stages done, operator-confirmed 2026-08-02. Everything is **committed to `master`**:
`061dd99` (refactor) · `d03c633` (banner) · this doc set. The stale `react-plumbing-p0` branch
pointer still sits at the old base `bb1e672` and can be deleted.

# ▶️ WHAT'S NEXT — Phase A, and it is blocked

**Phase A is the one that actually calls endpoints.** It cannot start until the two decisions under
"NOT decided" below are made. A third item is unblocked and cheap whenever you want it: **P0b**,
the remaining views onto the seam (now including the Manager port that landed on top of this work).

`/deliver <request>` starts the next task and overwrites this file; the record survives in git and
in `docs/delivery/react-plumbing-p0/`.

## Operator rulings so far (all 2026-08-02)

1. **`clearyfi_frontend` SUCCEEDS `src/secfin/api/static/`** as the product frontend. Consequences
   in `1-brief.md`: the parity set must be enumerated, `CLAUDE.md`'s "the ONLY nav implementation"
   rule transfers to the React shell, and the app needs auth + a serving story it does not have.
2. **Backups before re-ingest.** Phase 0.5 is two sequential DevOps tasks: wire DO Spaces +
   un-pause `secfin-backup.timer`, *then* the prod-volume whole-market backfill.
3. **The API response is the source of truth.** `api.ts` fetches; `surfaces.ts` adapts
   (`f(response) → viewModel`, pure). **Reshape, never derive** — if the number is not in the
   response, the card renders `N/A`. The API stays canonical, not card-shaped.
4. **The frontend may make as many requests as it needs.** No endpoint gets bent into an aggregate
   to save a round-trip.
5. **Scope option C** — the seam resolves the **ported** builders (`hub.ts` et al), not
   `surfaces.ts`. The adapters written now are the ones that survive Phase A.

## NOT decided — blocks Phase A, not Phase 0

**Auth + rate limits for an SPA.** `routes.py:163` requires that any endpoint our own UI calls
client-side lives on `public_router` (keyless) — which, under ruling 1, would make nearly the whole
API free and shrink the paid surface. And the limits do not fit an SPA: **2.0 req/sec** anonymous
per IP, **5/sec + 1,000/day** on the free key tier, against a page that fires ~15–20 requests.
Four options in `2-architecture.md` § "Design 1c"; **session auth for the app, separate from
customer API keys, is the recommendation.** Decide before the first endpoint is wired.

## Verifications already run — do NOT repeat. Results in `docs/ROADMAP_REACT_PLUMBING.md`

V1 basket tag coverage ✅ · V2 DEF 14A `ecd` ✅ · V3 10-K instance `dei`/`cyd`/`ecd` ✅ ·
V3b DERA `sub.txt` auditor ❌ absent · V4 `officerTitle` ✅ (ambiguous on 35% of values) ·
V5 DERA axes ✅ (DERA uses SHORT names — `BusinessSegments`, not `StatementBusinessSegmentsAxis`) ·
V6 NAICS ❌ absent.

## Notes / open loops

- **P0b** — the remaining seven views (`InsiderView`, `HistoryView`, `SectorView`,
  `QualitativeView`, `FilingsView`) plus retiring `surfaces.ts` / `metrics.ts` / the `state.tsx`
  shims. Mechanical once P0a's pattern exists; **not costed**, needs its own brief.
- ✅ **The harness EXISTS** — `clearyfi_frontend/scripts/render_snapshot.mjs` (DOM equivalence,
  with a `--verify-stable` determinism assertion) and `drive_states.mjs` (states + controls).
  Baseline was captured on the unmodified tree before any edit; **AC-2 diff is empty.**
  ⚠️ It captures `.alt-content` only — the view body, NOT the masthead / entity bar / disclosures.
- ✅ **The banner shipped as commit 2**, isolated from the refactor as planned.
- ⚠️ **The working tree keeps gaining parallel ports.** Peers landed on `master` mid-task
  (`bb1e672`); the **Manager** port then appeared uncommitted (`app/pages/manager/views.tsx`,
  new `app/data/manager.ts`) while this task was implementing. **None of it is this task's —
  stage files explicitly, never `git add -A`.**

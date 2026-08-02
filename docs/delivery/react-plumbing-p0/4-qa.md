# 4 — QA · `react-plumbing-p0`

**Commits:** refactor **`061dd99`** + banner **`d03c633`**, on base `bb1e672`.
**Now in `master`** — fast-forwarded after QA began; the Manager port (`e5044bc`…`cd33485`) sits on top.
QA tested **`d03c633`** in isolation, which is in master's history unchanged.
**Verdict: ✅ PASS — and OPERATOR CONFIRMED 2026-08-02** (`4b-manual-verification.md`, signed).
All 12 rows walked interactively. The judgement row landed: the banner's copy stays as written.
One issue surfaced during the walk and was **not a code defect** — a stale vite dev server serving
`app.css` truncated at the banner block. Restart resolved it; no change made.
**Date:** 2026-08-02

> **Tested in an isolated worktree at the committed SHAs.** The main working tree carries unrelated
> in-flight **Manager**-port edits (`app/pages/manager/*`, new `app/data/manager.ts`); testing there
> would have measured someone else's code. `git worktree add --detach /tmp/qa-p0 d03c633`.
>
> **`pytest` was NOT run: no Python changed.** No `src/secfin/` file is touched, so the API suite
> and the server-rendered e2e profile are not in scope. Stated rather than silently skipped.

---

## Acceptance criteria

| # | Criterion | Result | Evidence |
|---|---|---|---|
| AC-1 | Views no longer import `data/hub` | ✅ | `grep` on both converted views at `d03c633` → **0 hits** |
| AC-2 | Render equivalence, ≥3 tickers | ✅ | **Baseline regenerated independently from `bb1e672`.** `diff -r base refactor` → **empty**; byte totals identical (**450,926** both) |
| AC-3 | Loading via `StateBlock`, reachable | ✅ | `?slow`, both views |
| AC-4 | Error renders, page survives | ✅ | `?fail`, both views, 4 assertions |
| AC-5 | No missing value as `0` | ✅ | every `.hub-cell-mono` scanned for `0` / `0.0` / `$0.0B` → none |
| AC-6 | Disclosure present; absent when list empties | ✅ | **9 routes**, incl. sector, manager, compare. **Emptied `syntheticSurfaces` and rebuilt → absent on every route**, not an empty strip |
| AC-7 | typecheck + build | ✅ | both exit 0 at `d03c633` |
| AC-8 | Every control still works | ✅ | **10 controls driven**, incl. the four the engineer could not reach |
| AC-9 | No dependency added | ✅ | `package.json` / lock untouched; Chromium from the image the repo already pulls |
| AC-10 | Legible in light and dark | ⚠️ **N/A (dark)** | **This app defines no dark theme** — no `prefers-color-scheme`, no `data-theme`, no `.dark`. Light verified. Confirmed the engineer's disclosure, not taken on trust |

---

## I closed the blind spot the engineer flagged

The handoff states — honestly, unprompted — that the harness captures `.alt-content` only, so
AC-2 says nothing about the masthead, entity bar or disclosures. **I did not accept that.**

I re-captured **the entire `<body>`** at `bb1e672` and `061dd99` and diffed:

```
diff -r full-bb1e672 full-061dd99   →   EMPTY
```

**The refactor changed nothing anywhere on the page, not just in the view body.** That is a
stronger result than claimed, and it means the narrow capture was not hiding anything here.

---

## Defects

### D-QA-1 · No mobile layout — **PRE-EXISTING, not caused by this change**

At 390px the page overflows by **446px** (overview) / **400px** (institutional). The sidebar keeps
its full desktop width and clips the content column off-screen (`.qa/shots/mobile-overview.png`).

**Attributed by measurement, not assumption** — identical at all three commits:

| commit | overview | institutional |
|---|---|---|
| `bb1e672` base | 446px | 400px |
| `061dd99` refactor | 446px | 400px |
| `d03c633` banner | 446px | 400px |

Overflowing elements are `.shell-search`, `.shell-apiref`, `.page`, `.masthead` — **all shell
components, none from this change.** `.synth-banner` appears in the list at `d03c633` only because
it is as wide as the page container that already overflows; its own `@media (max-width: 640px)`
rule works and its text wraps correctly. **The banner is a passenger, not a cause.**

**Not a blocker for this task.** It is a real product defect and it matters more now the app is the
product frontend — raised for the roadmap, not for this branch.

### Nothing else found

No console or page errors across any pass. No console error in ~30 navigations.

---

## Review questionnaire

**1. What shipped.** Nothing a reader can see changed on the two pages — which is the point. What
changed underneath is that both views now ask for their data instead of computing it inline, so
each has a real loading, error and empty state where it previously had none. The visible addition
is a strip at the top of every page saying that every figure in the app is invented.

**2. Surfaces touched.** No endpoints — the app calls none. `app/data/api.ts` (+14 seam functions,
`?fail`), new `app/data/hub-catalog.ts`, `HubOverview.tsx`, `InstitutionalView.tsx`,
`CompanyPage.tsx`, new `app/ui/SyntheticBanner.tsx`, `app/ui/Shell.tsx`, `app/app.css`, two new
harness scripts, `.gitignore`.

**3. AC → evidence.** The table above; every row is a command I ran, not a claim I read.

**4. States exercised.** **Populated** — 3 tickers × 2 views, settled DOM captured. **Loading** —
`?slow` holds every seam call 900ms; `.state-loading` observed on both views. **Error** — `?fail`
rejects every call; `StateBlock variant="error"` observed and the page frame survived intact.
**Empty** — exercised on the banner by emptying `syntheticSurfaces` and rebuilding; the component
returns `null` and the element is absent. A genuinely empty *data* payload is not reachable while
the fixtures always return rows — noted as residual risk.

**5. Edge cases probed.** **N/A vs 0** — scanned every mono cell on both views across 3 tickers for
a bare `0`; none. The rendered `N/A` cells (e.g. the drained SG&A row) survive the refactor
byte-identically. **Restatement basis** — the as-filed / as-restated tab is wired and refetches
(a real distinction here: it is the vintage of a fact, not a window over it). **429 / 502 / 503 /
multi-class / PRN** — **not applicable**: this app makes no HTTP request at all. Saying so is more
useful than inventing a check.

**6. Honesty contract.** No missing value as `0` (AC-5, driven). Derived figures keep their
`ƒ derived` chips and the drawers still open to formula + inputs + the condition under which our
number and the filer's legitimately differ. 13F language intact — "DERIVED by diffing two 13F
quarterly snapshots", long-only and ~45-day-lag caveats present on the institutional view.
`STANDARD_DISCLOSURES` unchanged. **And the app now states that none of it is real**, which is the
single biggest honesty improvement in the change.

**7. Deltas from the brief.** AC-10's dark half is not testable because the design system has one
palette; the engineer disclosed this and I confirmed it rather than passing it. `?fail` is an
addition not in the brief — it is what makes AC-4 verifiable at all, and it is the right call.
The seam grew to 8 hub functions rather than 6; the boundaries are defensible and each is
documented with the endpoints that replace it.

**8. Residual risk.** What would worry me most, in order:

1. **The seam boundaries are a bet on Phase A.** They are drawn against endpoints that mostly do
   not exist yet (Phase B/C). If the grouping is wrong the swap is another refactor — exactly what
   this task existed to prevent. Nothing here can test that; the endpoints have to arrive first.
2. **The empty *data* state is unexercised.** Every fixture returns rows, so `StateBlock
   variant="empty"` has no reachable path in either view today. It will get its first real workout
   on a thinly-ingested filer in Phase A — on a volume where **only 72 of 8,919 companies** carry
   more than 50 tags, that is not a rare case.
3. **Mobile is unusable** (D-QA-1) and now ships under a "successor to `api/static/`" ruling.

---

## UI/UX review

**States** render intentionally: loading is the shared shimmer, error names what failed and keeps
the page frame, and the banner's empty case is true absence rather than a collapsed box.

**Legibility & layout** hold at desktop (`.qa/shots/desktop-*.png`) — no clipping, no overflow,
charts and rails correct. Mobile fails, pre-existing (D-QA-1).

**Copy.** The banner reads *"No figure on this page comes from an SEC filing. Values are generated
from the ticker and are stable, plausible, and wrong."* Active, specific, no apology and no mood —
and **"stable, plausible, and wrong"** is the sentence that stops a plausible-looking number being
mistaken for a real one. It names the failure mode instead of gesturing at it. The surface list is
in the mono utility face because those are identifiers.

**Consistency.** Reuses `StateBlock` rather than a one-off; the banner borrows `--ext-*`, the
extension-tag palette, instead of introducing a colour. The system genuinely has no danger token,
so this is the disciplined choice.

**Affordances.** All 10 driven controls respond and show state. Focus-visible and keyboard order
were not machine-tested — that is on the manual gate.

---

## Manual UI verification

See **`4b-manual-verification.md`** — 12 rows, ~5 minutes. **The verdict stays PASS-pending until
the operator hand-runs it.**

Start the app:

```bash
cd clearyfi_frontend && npm run dev        # http://localhost:5174
```

---

## Handoff

✅ **OPERATOR CONFIRMED 2026-08-02 — Phase 0 is accepted and complete.**

**PASS — manual UI verification completed.** AC-1 through AC-9 verified independently at the
committed SHAs; AC-10's dark half is not applicable and is disclosed rather than waved through.
**One defect found, measured to be pre-existing** (D-QA-1, mobile), so it does not block this
branch.

Two things I want on the record because they are unusual and good: the engineer **disclosed their
own harness's blind spot** in the handoff rather than letting it read as fuller coverage — I closed
it and it was clean. And the refactor's central claim, an empty DOM diff, **reproduced from an
independently regenerated baseline**, which is the only way that claim is worth anything.

**Not blocked.** Nothing here is deployable on its own and nothing should be deployed: the app
still calls no endpoint and says so on every page. What this unlocks is **Phase A**, which is
itself blocked on two prior decisions — the whole-market backfill (backups first, per the
2026-08-02 ruling) and the SPA auth/rate-limit question.

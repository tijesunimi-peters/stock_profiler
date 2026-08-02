# 4 — QA · `react-plumbing-p0` **P0b** (the remaining seven views)

⚠️ **Two QA pairs are on disk for this task and only the filenames tell them apart.**
`4-qa.md` / `4b-manual-verification.md` = **P0a** (Hub Overview + Institutional, signed 2026-08-02).
**This pair = P0b.** A green report in the other says nothing here.

**Under test:** `cf01f6c` (company) · `39e8837` (sectors) · `8bd8fab` (manager + chart fix)
**Base:** `77f154d`
**Verdict: ✅ PASS — and OPERATOR CONFIRMED 2026-08-02** (`4b-manual-verification-p0b.md`, signed).
All 12 rows first-pass. The judgement row landed — hover works, so the leak fix spared the wired
tooltip host and removed only orphans.
**Date:** 2026-08-02

> Tested in an isolated worktree at the committed SHAs (`git worktree add --detach /tmp/qa-p0b`).
> **`pytest` not run — `git diff --name-only 77f154d..8bd8fab -- src/ tests/` returns 0 files.**
> No Python changed, so the API suite and the server-rendered e2e profile are out of scope. Stated
> rather than skipped silently.

---

## Acceptance criteria

| # | Criterion | Result | Evidence |
|---|---|---|---|
| AC-1 | No view imports a figures module | ✅ | grep over `app/pages/` **and** `app/ui/` for all eight fixture modules → **0 hits**. This is now true of the *whole app*, not just two views. |
| AC-2 | Render equivalence | ⚠️ **not empty — and correctly so** | 15 of 25 cells byte-identical. The other 10 differ **only** by removed hidden readouts — proven below. |
| AC-3 | Loading via `StateBlock` | ✅ | `?slow` on **12 routes** |
| AC-4 | Error renders, frame survives | ✅ | `?fail` on 12 routes |
| AC-5 | No missing value as `0` | ✅ | every mono cell / tile value / side-count scanned across 12 routes → none |
| AC-6 | Disclosure present | ✅ | banner on all 12 routes incl. manager and sectors |
| AC-7 | typecheck + build | ✅ | both exit 0 at `8bd8fab` |
| AC-8 | Controls still work | ✅ | driven per route; read-only views correctly report *no controls* rather than a false failure |
| AC-9 | No dependency added | ✅ | package manifests unchanged across the range |
| AC-10 | Light + dark | ⚠️ **N/A (dark)** | unchanged from P0a: this app defines no dark theme |

---

## AC-2 does not produce an empty diff, and that is the honest result

The manager commit deliberately changes rendered DOM — it fixes a chart-layer leak. So I did not
test for an empty diff. **I tested that every difference is confined to the elements the engineer
claimed**, by stripping `<div class="chart-readout">…</div>` from both sides and re-diffing:

```
cells whose difference is NOT purely chart-readout elements:  0
```

**Zero.** Across all 25 cells, nothing else changed — no value, no label, no class, no attribute,
no ordering.

### The leak, measured

| | cells | charts | readouts | adjacent duplicates |
|---|---:|---:|---:|---:|
| `77f154d` before | 25 | 168 | **189** | **56** |
| `8bd8fab` after | 25 | 168 | **101** | **0** |

A manager footprint with **4 charts was carrying 21 readouts**. They are `display:none` until
hovered and they accumulated on every re-render — invisible and unbounded, which is the worse
combination: nothing looks wrong while the DOM grows.

**Confirmed pre-existing**, not introduced here: the 189/56 figures are measured at `77f154d`,
before any P0b commit.

### And the surviving readout is the wired one

A leak fix that deleted the *live* element would be a silent regression — the tooltip would simply
stop working. So I hovered rather than assumed:

- **Insider after the fix: 1 of 3 charts shows a live readout** — identical to before it.
- Footprint and Institutional show 0 **at the base commit too**, so their charts want a hover on a
  data point rather than a container centre. Not a regression; measured on both sides before
  saying so.

---

## I closed the blind spot again, and widened it

P0a's report disclosed that the harness captures `.alt-content` only. I re-captured **the entire
`<body>`** at both commits across 15 cells — masthead, entity control bar, view, disclosures,
footer:

```
FULL-PAGE cells differing beyond removed readouts:  0
```

Page chrome is untouched. The narrow capture was not hiding anything.

---

## Defects

### Nothing found in the product.

No console or page errors across 12 routes × 3 states. **73 driven assertions, 0 failures.**

### D-QA-P0b-1 · pre-existing mobile layout — unchanged, still open

Carried forward from P0a (D-QA-1). Not re-measured; nothing in this range touches the shell.

### Two defects in MY OWN test scripts, found and fixed mid-run

Recording them because both would have produced a false pass:

1. **The full-page script still used the `.hub` predicate** the engineer had already fixed in the
   harness — it timed out on Insider and wrote **3 cells instead of 15**. The comparison over those
   3 reported "0 differing", which reads exactly like full coverage. Caught by checking the file
   count against what I expected.
2. **A wrong glob path** made the readout measurement report `0 readouts, 0 duplicates` for both
   sides — a clean-looking result from a directory that did not exist.

Neither is a product defect. Both are the same failure mode: **a green number from a check that did
not run.**

---

## Review questionnaire

**1. What shipped.** Nothing looks different. Underneath, the last seven views stopped computing
their own figures and now ask the seam for them, so every view in the app has a real loading and
error state and there is one place to point at the API. A hidden chart bug got fixed on the way
through.

**2. Surfaces touched.** No endpoints — the app still calls none. `data/api.ts` (+6 seam
functions), new `data/sector-catalog.ts`, `hub-catalog.ts`, the five company views + `CompanyPage`,
the three sector views + `SectorPage`, `ManagerPage` + `views.tsx`, `charts/kernel.ts`, both
harness scripts.

**3. AC → evidence.** The table above; every row is a command, not a claim.

**4. States exercised.** **Populated** — 25 cells across 12 routes. **Loading** — `?slow`, all 12.
**Error** — `?fail`, all 12; the frame survived each time. **Not-found** — the manager route with a
CIK outside the roster, kept as its own snapshot cell. **Empty** — still not reachable for a data
payload; the fixtures always return rows. Same residual risk as P0a.

**5. Edge cases probed.** **N/A vs 0** — clean across all 12. **Read-only views** — Insider and
four manager views have zero buttons; my first pass called that a control failure, which was wrong,
and the check now distinguishes *absent* from *broken*. **429 / 502 / restatement / multi-class** —
not applicable, the app makes no HTTP request.

**6. Honesty contract.** No missing value as `0`. Derived figures keep their `ƒ derived` chips and
drawers. 13F language intact. The banner is on all 12 routes and still says every figure is
synthetic — **which remains true; nothing here plumbs real data.**

**7. Deltas from the brief.** AC-2 is not an empty diff, for a reason the engineer disclosed up
front and I verified independently. The `makeReadout` fix is out of the brief's stated scope — I
consider it correct to have taken it, because the alternative was leaving a known unbounded leak in
place to protect a metric.

**8. Residual risk.**

1. **The seam boundaries remain a bet on Phase A.** Six more seam functions now, all drawn against
   endpoints that mostly do not exist. Nothing here can test that.
2. **`surfaces.ts` and `metrics.ts` are now dead weight** — every view is off them, but they are
   still in the tree, as are the 27 `state.tsx` shim usages. P0b-4 removes them; until then the app
   carries two fixture lineages, and someone could wire a new view to the wrong one.
3. **Manager landed on `master` days ago and is the newest code here.** It had the least settling
   time before being refactored.

---

## UI/UX review

**States** render intentionally on all 12 routes. **Read-only views correctly have no controls** —
worth stating, because "no controls responded" and "there are no controls" look identical to a
script and only one is a defect.

**Copy and consistency** unchanged — this range moved no user-visible text. The `sector-catalog` /
`hub-catalog` split keeps the status/provenance vocabulary exactly where it was.

**Legibility** unchanged at desktop; mobile still fails, pre-existing.

---

## Manual UI verification

See **`4b-manual-verification-p0b.md`** — 12 rows, ✅ **CONFIRMED 2026-08-02**, walked
interactively in three batches.

**Two rows carried the weight and both landed.** Row 4: Peer-relative's peer-set pill *agrees* with
Overview's — those surfaces share one `companyIdentity` read precisely so they cannot disagree, and
that was confirmed by eye rather than inferred. Row 7: hover still works, which is the one thing no
script could settle.

```bash
cd clearyfi_frontend && npm run dev        # http://localhost:5174
```

---

## Handoff

✅ **OPERATOR CONFIRMED 2026-08-02 — P0b is accepted.**

**PASS — manual UI verification completed.** AC-1, AC-3…AC-9 verified independently at the committed
SHAs. AC-2 is deliberately non-empty and its difference is proven to be exactly the removed hidden
readouts and nothing else. AC-10's dark half is not applicable.

**One product improvement worth naming:** a leak that put **189 hidden elements where 101 belong**,
56 of them stacked duplicates, is gone — and it was found only because widening the snapshot matrix
made the count visible.

**Not blocked. Not deployable either, and should not be deployed:** the app still calls no endpoint and says so on every
page. What this unlocks is **P0b-4** (retiring `surfaces.ts`/`metrics.ts` and the shims) and then
Phase A, which remains blocked on the whole-market backfill and the SPA auth decision.

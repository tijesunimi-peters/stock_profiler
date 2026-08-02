# 3 — Implementation · `react-plumbing-p0`

**Branch:** `react-plumbing-p0` (off `master` @ `bb1e672`) · **Owner:** senior-frontend-engineer
**Date:** 2026-08-02 · **Backend:** none. No Python, no `src/secfin/`, no `pytest` run.
**Status:** implemented and self-verified. **Not committed** — commit/push only when asked.

---

## What changed

Two views moved onto the data seam, and the app gained a disclosure it should always have had.

| file | change |
|---|---|
| `app/data/api.ts` | **+14 seam functions** (8 hub, 6 institutional) resolving the **ported** builders per option C, each documented with the Phase A endpoints that replace its body. Payload interfaces exported so views type against the seam, not `hub.ts`. Added `?fail`. |
| `app/data/hub-catalog.ts` | **new.** Splits `hub.ts`'s **structure** (section ordinals, `LABEL_TO_ID`, `unitFmt`, `HUB_CALCS`, glossary, `edgarLink`) from its **figures**. Structure survives Phase A; figures die. |
| `app/pages/company/HubOverview.tsx` | 6 `useApi` reads + `StateBlock` states. `HubRail` fetches its own timeline. `TrendDrawer` and `ComparisonTray` fetch on interaction. |
| `app/pages/company/InstitutionalView.tsx` | 6 `useApi` reads. **`surface` prop deleted** with its `surfaces.ts` import. |
| `app/pages/company/CompanyPage.tsx` | Institutional read removed (the view self-gates); page gate no longer double-covers the two converted views. |
| `app/ui/SyntheticBanner.tsx` + `app/app.css` + `app/ui/Shell.tsx` | **new banner** — commit 2. |
| `scripts/render_snapshot.mjs`, `scripts/drive_states.mjs` | **new harness.** No npm dependency. |
| `.gitignore` | ignores `clearyfi_frontend/.render/`. |

### Two commits, and the order matters

1. **The refactor** — must produce an **empty** DOM diff. That diff is the only real gate here.
2. **The banner** — deliberately changes the render, verified separately.

Combining them would have destroyed the equivalence claim.

---

## AC → evidence

| AC | result | evidence |
|---|---|---|
| **AC-1** no `data/hub` import in the views | ✅ | `grep -n 'data/hub"' app/pages/company/{HubOverview,InstitutionalView,CompanyPage}.tsx` → **0 hits** |
| **AC-2** render equivalence | ✅ | `diff -r .render/before .render/after` → **empty**, 3 tickers × 2 views. Char counts identical (47,988 / 104,007 / 47,995 / 100,690 / 48,692 / 99,948). Re-run on the final code. |
| **AC-3** loading via `StateBlock` | ✅ | `drive_states.mjs` — `?slow`, both views |
| **AC-4** error, page survives | ✅ | `drive_states.mjs` — `?fail`, both views, 4 assertions |
| **AC-5** no missing value as `0` | ✅ | `drive_states.mjs` scans every `.hub-cell-mono` for a bare `0` / `0.0` / `$0.0B` → none |
| **AC-6** disclosure present | ✅ | renders on `/company/*/overview`, `/institutional`, `/sectors/sector`; screenshot `.render/banner.png` |
| **AC-7** typecheck + build | ✅ | both exit 0 |
| **AC-8** controls still work | ✅ | 6 driven: statement tab, `ƒ derived` chip, row→drawer, drawer range tab (refetches), `+ compare` tray, rail form filter. **15/15 assertions pass, 0 console errors.** |
| **AC-9** no dependency added | ✅ | `package.json` / `package-lock.json` untouched; Chromium comes from the image the repo already pulls |
| **AC-10** legible in both themes | ⚠️ **partial — see below** | light verified by screenshot |

### AC-10 cannot pass as written, and it is not a defect

**This app has no dark theme.** No `prefers-color-scheme` block, no `data-theme` hook, no `.dark`
selector anywhere in `src/styles/clearyfi.css` — it is a single warm-paper palette by design.

So the AC's dark half is **not applicable**, not failed. Light-mode legibility is verified. Whether
the app should have a dark theme at all is a design question the successor ruling reopens, and it
is not this task's to answer. **Flagging rather than quietly reporting green.**

---

## The determinism the harness rests on — measured, not assumed

The whole diff is meaningless if the app renders differently run to run. So:

- **Static check:** no `Date.now()`, no arg-less `new Date()`, no `Math.random()` anywhere in
  `app/` or `src/`. All 27 `new Date(...)` calls take an explicit argument.
- **Empirical check:** `--verify-stable` captures every cell **twice** and byte-compares. Passed on
  both the before and after runs.

That second check is the one that matters — the first is a grep and could be defeated by any
transitive import.

---

## ⚠️ What the harness does NOT cover — read this before trusting AC-2

**It captures `.alt-content` only.** That is the view body: it excludes the masthead, the entity
control bar, the disclosures block and the footer.

I found this the honest way. After adding the banner I expected a banner-shaped diff and got an
**empty** one — because the banner mounts above the masthead, outside the capture. The banner was
rendering fine; the harness simply could not see it, which is why AC-6 is evidenced by a separate
direct check and a screenshot rather than by the diff.

**Consequence for QA:** AC-2 proves the two views' bodies are unchanged. It proves nothing about
page chrome. A regression in the entity bar would pass this gate. Widening the capture to the whole
shell is a sensible follow-on; I left it narrow because a wider scope would have made the banner
commit's diff noisy for no gain here.

---

## Reproducing the gate

The baseline is **deliberately not committed** — one QA regenerates from the base commit is
stronger evidence than one I hand over, and a committed baseline rots when the design moves.

```bash
cd clearyfi_frontend

# BEFORE — from the base commit
git stash && git switch --detach bb1e672
npm run app:build
docker run --rm -u root \
  -v "$PWD/scripts/render_snapshot.mjs":/home/pptruser/render_snapshot.mjs:ro \
  -v "$PWD":/app -w /home/pptruser \
  -e PUPPETEER_CACHE_DIR=/home/pptruser/.cache/puppeteer \
  ghcr.io/puppeteer/puppeteer:latest \
  node render_snapshot.mjs --dist /app/app-dist --out /app/.render/before --verify-stable

# AFTER — at the refactor commit (NOT the banner commit; that one changes the render on purpose)
git switch react-plumbing-p0    # then: git stash pop
npm run app:build
#   ... same docker run, --out /app/.render/after

diff -r .render/before .render/after     # must be EMPTY

# states + controls
docker run --rm -u root \
  -v "$PWD/scripts/drive_states.mjs":/home/pptruser/drive_states.mjs:ro \
  -v "$PWD":/app -w /home/pptruser \
  -e PUPPETEER_CACHE_DIR=/home/pptruser/.cache/puppeteer \
  ghcr.io/puppeteer/puppeteer:latest node drive_states.mjs --dist /app/app-dist
```

---

## Defects found in the existing app, and what I did about each

| # | finding | action |
|---|---|---|
| 1 | **`InstitutionalView` read two fixtures for one register** — a `surface` prop from `surfaces.ts` alongside eight `hub.ts` builders | **Fixed.** The prop's only derived value (`reported`) was **assigned and never rendered**, so deleting it is genuinely zero-diff. |
| 2 | **Decorative loading gates** — `CompanyPage` fetched four payloads and rendered views with no props | **Half fixed.** Overview and institutional now self-gate. `insider` and `peers` remain (their views were ported off the seam by the Peers work) — **P0b**. |
| 3 | **No synthetic disclosure existed.** `PROVENANCE` was declared and never imported; `app/README.md` claimed a banner that was not there | **Fixed** as commit 2. |
| 4 | Four unused imports in `InstitutionalView` (`compact`, `humanDate`, `CompositionStrip`, `PctBar`) | **Left alone** — verified pre-existing via `git show HEAD:…`. A zero-diff refactor is the wrong commit to fix unrelated lint in. |

---

## Deviations from the architecture plan

- **`companyIdentity` takes `(symbol, subActive, subCount)`**, not `(symbol)`. The context pill is
  peer-set-relative, so the peer selection has to reach it. Phase A source is `/peers`, which needs
  the same input.
- **8 hub seam functions, not 6.** §05 governance and §06/§08 disclosure got their own, because
  their Phase A sources are genuinely different reads (insider + 8-K items; instance-parse + Track
  2 empty states) rather than more of the grouped-concepts route.
- **Gating is per-view, not per-section.** Progressive paint is right when latency is real; today
  every read resolves in the same tick and a per-section skeleton would be theatre. Deferred to
  Phase A, where it can be measured. Noted in both views.
- **`?fail` added** to `api.ts`. Not in the plan, but AC-4 requires reaching the error state, and
  the alternative is breaking the app by hand and remembering to undo it.

---

## Handoff → QA Tester

**Probe these:**

1. **AC-2 by regenerating the baseline yourself** (above). Do not take my snapshots on trust.
2. **The harness's blind spot** — it does not capture page chrome. Eyeball the masthead, entity bar
   and disclosures on both views.
3. **`?slow` and `?fail`** on both views, and on a view I did *not* touch (`/insider`, `/peers`) to
   confirm nothing regressed there.
4. **The banner** — it must appear on **every** page, including sector, manager and compare. Empty
   `PROVENANCE.syntheticSurfaces` → it must render **nothing at all**, not an empty strip.
5. **N/A vs 0** across both views; the drive script only checks `.hub-cell-mono`.
6. **Mobile width** — the banner wraps to two rows by design; confirm no horizontal bleed.
7. **The four controls the drive script could not reach**: Institutional's expanders and lightbox
   zooms, the `basis` (as-filed / as-restated) tabs, the tray's remove/clear/hide, and the snapshot
   tiles. Driven manually is fine; they are the ones a lost handler would hide in.

**Not in scope, deliberately:** `InsiderView`, `HistoryView` and the three sector views still
bypass the seam (P0b). No endpoint is called — the app remains 100% synthetic, which is the point
of the banner.

# 2 — Architecture: V3-P1, chart foundry (rescoped)

**Task:** `v3-p1-chart-foundry` · **Stage 2 (Principal Architect)** · 2026-07-26
**Input:** `1-brief.md` (18 ACs) · **Owner of stage 3:** `senior-frontend-engineer` (only stage)

---

## Scope re-check

Track 1, frontend-only, no new dependency (vendored d3 v7.9.0 exports `scaleLinear`, `quantile`,
`forceSimulation`). No API, no `normalize/`, no `storage/`, no schema change — **guardrail 3 does not
fire** (no new canonical concept). Single-process, DuckDB, SEC compliance: untouched.

**One scope correction the PM could not have made without reading the schema — see AC-7 below.**

## Decision 1 — engine: **d3**, per D5

The strip needs a linear scale, quantiles, and **collision placement**. D5's selection rule is
explicit: Plot where the chart is a plain mark on a scale, d3 where custom placement/collision logic
is needed — *"the collision logic cannot be expressed in Plot."* This is the d3 case. It is also the
first real exercise of the P0 rule, which is why this phase was sequenced first.

## Decision 2 — **deterministic dodge, not a force beeswarm**

The brief permits either provided placement is *data-derived, not index-derived* (AC-4 is about
meaning). **Choose deterministic dodge** — sort by value, place each mark at the lowest free lane
that clears already-placed marks within `2r` on x:

- **Stability is the deciding argument.** The Company view **re-renders on every focal change**
  (`selectFocalCik` → `renderApp`). A force simulation seeds differently and settles differently
  each run, so peers would visibly reshuffle when only the *focal* changed. Motion that implies the
  data moved, when it didn't, is noise at best and misleading at worst. Dodge is a pure function of
  the values: same values → same layout, every render.
- Cheaper and simpler: one sort plus a linear scan, no tick loop, no `forceSimulation` import path,
  no "run to N ticks synchronously" caveat.
- Still fully density-derived: vertical offset comes from how many peers occupy the same x
  neighbourhood — which is exactly the meaning AC-4 asks for, and exactly what index jitter lacks.

Record the rejection of force in the code comment so it isn't "fixed" later.

## Decision 3 — string pipeline meets a node-returning builder

`sectorapp.js` builds **HTML strings**; the builder returns a **DOM node** (AC-1, D5). The repo
already solved this: `distributionCardHtml` emits `<div class="pa-drill-boxes" id="paDistBoxes">`
and a post-render `mountDistribution()` (`sectorapp.js:1176`) does `host.appendChild(P.boxWhiskerChart(...))`.

**Follow that precedent exactly.** `coDotPlotHtml` emits a host element; a new `mountCompanyDots()`
appends built nodes after render, called from the same place `mountDistribution` is.

## Decision 4 — click wiring becomes a callback, not a DOM contract

Today `wireCompanyView()` (`sectorapp.js:1585`) binds `document.querySelectorAll(".pa-dot[data-cik]")`.
A shared builder in `app.js` must not carry a `data-cik` contract — `cik` is a sector-app concept.
**The builder takes `opts.onPeerClick(peer)`** and calls it with the peer object it was given. The
sector app closes over its own `selectFocalCik`. Keeps `app.js` generic; keeps the DOM contract
inside one file.

## Decision 5 — AC-7 splits (scope correction)

`SectorCompanyValue.value` is typed `float` with the comment *"never None — N/A rows are excluded"*,
and `sqlite_sector_company_repository.py:22` confirms the exclusion happens **server-side**. The
payload carries **no excluded count**. So AC-7's caption requirement cannot be fully met by a
frontend-only change.

| | Scope | Design |
|---|---|---|
| **AC-7a** — the builder never plots a null/N/A at 0, excludes it, and **states the excluded count in its caption when > 0** | **IN** | Fully implementable and testable — the builder is shared, and future callers *will* pass nulls. `/components` fixtures must include nulls to prove it (AC-16). |
| **AC-7b** — the *sector app* reader can tell "40 peers" from "40 of 58" | **OUT** | Needs `excluded_count` on `SectorCompanyValueList` — a backend change this phase does not have. The strip's own count is legitimately 0 here (no nulls arrive), so the caption correctly stays silent. |

**AC-7b is a real residual honesty gap and must be recorded, not dropped** — log it in
`BUILDER_INVENTORY.md` and in the QA report as a known follow-up (small backend change; natural home
is V3-P4/P5 when the Company views are re-cut). QA must **not** fail the task for AC-7b.

---

## API design

```js
ClearyFi.distributionStrip(peers, opts) -> DOM node
// peers: [{ id, label, value }]   value may be null -> excluded, counted, reported
// opts: {
//   width,            // from measuredWidth(); NEVER hardcoded (AC-2)
//   height,           // default ~64
//   focalId,          // marks one peer focal (AC-3)
//   format,           // fn(value) -> string, for labels + titles
//   title, caption,   // chartCard chrome; caption gets the excluded-count clause appended
//   emptyCopy,        // honest empty-state copy (AC-8)
//   showIqr,          // default true; forced false when n < 2 (AC-8)
//   onPeerClick,      // fn(peer) — optional (Decision 4)
// }
```

**Marks:** IQR band, median rule, one dot per peer, focal marker. AC-3 requires the focal be
distinguishable **without color alone** → focal is a **larger diamond** (shape + size), matching the
existing `.pa-diamond` vocabulary users already know.

**AC-6 one fill:** every peer dot shares one fill; the focal is distinguished by *emphasis* (shape,
size, stroke), never by a second hue or a lightness ramp.

**AC-8 thin data:** `n === 0` → empty-state copy only, no axes, no band. `n === 1` → the single dot
and its value, **no IQR band and no median rule** (both meaningless from one point) plus a one-line
note saying so. Never a zero-width band.

**AC-5 labels:** min/median/max labels measured with `getComputedTextLength()`, edge-anchored
(`text-anchor` flips at the canvas edge), ≥9px effective size, authored at the measured container
width — STYLE_GUIDE §12 rules 1, 6, 7.

## Files to touch (exhaustive)

| # | File | Change | ACs |
|---|---|---|---|
| 1 | `static/app.js` | `distributionStrip()` near `boxWhiskerChart` (~3876) + export in the `window.ClearyFi` object | 1–9 |
| 2 | `static/app.css` | mark styles (`.dist-strip-*`) using tokens only — no new hue | 3, 6 |
| 3 | `static/components.html` | 4 states: populated+focal, populated no-focal, single-peer, empty — **and a fixture containing nulls** to prove AC-7a | 16 |
| 4 | `static/sectorapp.js` | `coDotPlotHtml` (**1495**) emits a host div; new `mountCompanyDots()` mirroring `mountDistribution` (**1176**); `wireCompanyView` (**1585**) drops the `.pa-dot[data-cik]` binding in favour of `onPeerClick` | 10, 11 |
| 5 | `static/sectorapp.css` | add `.plot-chart*` re-declaration scoped to the new host (the app.css-not-loaded precedent at **189**); **delete** the now-dead `.pa-dot`, `.pa-diamond`, `.pa-dp-iqr`, `.pa-dp-median`, `.pa-dp-track` rules | 10, 12 |
| 6 | `docs/BUILDER_INVENTORY.md` | **NEW** — all ~40 prototype builders, one status each; the two deferrals with reasons; the AC-7b gap | 13–15 |

**Not touched:** `src/secfin/**` except `api/static/`; no `.py`, no schema, no tests dir.

## Ordered plan

1. **`BUILDER_INVENTORY.md` first.** It is the phase's most reusable output and it is pure analysis —
   doing it first means the builder is written knowing exactly what it supersedes.
2. **`distributionStrip()` + `app.css` marks.** Build against `/components` fixtures, including the
   null-bearing one, before touching the sector app.
3. **`/components` entry, 4 states.** This is the proving surface — get all four honest before
   migrating a live view.
4. **Migrate `sectorapp.js`** — host div, `mountCompanyDots()`, `onPeerClick`. Verify the focal
   re-click loop still works (AC-11) *before* deleting anything.
5. **Delete the dead CSS + the `.pa-dot` path.** A separate step on purpose: if step 4 regressed, you
   want the old path still in git-diff view, not already gone.
6. **e2e + eyeball.** Rebuild the image first — `src/` is baked in, not mounted.

## Test strategy

```bash
docker compose build api
docker compose --profile e2e up --abort-on-container-exit --exit-code-from e2e
# screenshots -> data/e2e-shots ; exit code catches console/page errors only
```

Checks the exit code will **not** catch — eyeball these:

- label overlap / clipping on the strip at both desktop and mobile widths (§12 rules 1, 7)
- the focal diamond readable at small width, and distinguishable **with color ignored** (AC-3)
- single-peer state shows no band (AC-8)
- the null-bearing `/components` fixture reports its excluded count (AC-7a)

Grep-level:

```bash
grep -c "pa-dot\|pa-diamond" src/secfin/api/static/sectorapp.js   # expect 0 after step 5 (AC-10)
grep -n "distributionStrip" src/secfin/api/static/app.js          # defined + exported
grep -rn "forceSimulation" src/secfin/api/static/app.js           # expect 0 — dodge, not force
```

## Handoff → `senior-frontend-engineer`

Branch `v3-p1-chart-foundry` off **`master`** (clean this time — P0 is merged; `STATUS_MAPPING.md`,
STYLE_GUIDE §6/§12 are all on master).

Already decided — do not reopen: **d3 not Plot** (D5); **dodge not force** (render stability);
**`onPeerClick` callback not a `data-cik` DOM contract**; **AC-7b is out of scope and must be
recorded, not built**. The 4b operator gate is **required** — this changes an interactive surface.

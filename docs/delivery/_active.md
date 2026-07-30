# Active delivery task

task_slug: v3-p5a-institutional
request: V3-P5a — Company: **Institutional**. Build the prototype's Institutional view. 13D/G folds
  in; Insider activity keeps its own view. (Peer-relative was split out as **V3-P5b**.)
branch: v3-p5a-institutional (clean off `master` 9d0d10f — **attempt 4**)
next_stage: frontend    ← PHASE 1, design port. No PM/architect stage this attempt; see below.
qa_cycles: 0
updated: 2026-07-30

---

# ⚠️ ATTEMPT 4 — the WORKFLOW changed. Read this before touching anything.

**Three attempts have failed, all on the same thing: prototype fidelity. None failed on data or
honesty.**

| Attempt | Outcome |
|---|---|
| 1 | Reached the 4b gate, took **five rounds** of fidelity feedback, operator called a restart. Built from the brief's block list, retrofitting prototype structure whenever a gap surfaced → fidelity came last. |
| 2 | Rebuilt structure-first from a mechanically-extracted element inventory. Operator called a **full revert to master**. |
| 3 | **Green on everything measurable** — pytest 609, e2e 48 shots / 0 threw / 2 pre-existing, 44 driven QA assertions, **0 product defects**, and the operator's own 4b batches A and B passed **by hand**. Still stopped at the gate: *"I can still see leftovers from previous design."* |

**Attempt 3's diagnosis, accepted by the operator:** it built the prototype's **structure** out of
the **existing product's components** — our `chartCard` chrome (mono eyebrow + caption + card frame),
P4's `.ov-card`/`.stmt-table`/`.pbtn` vocabulary, our existing chart builders. Right skeleton, wrong
body. Automation cannot see that, which is why three green builds were rejected.

## The new workflow: DESIGN FIRST, DATA SECOND — with an operator gate between

| Phase | Scope | Gate |
|---|---|---|
| **1 — design port** | Port the prototype's Institutional view onto a **fresh blank page**: its markup, its CSS, its chart builders, **and its own sample values**. **ZERO backend calls. Nothing fetched. No data plumbing.** | **🚦 Operator verifies the design is faithful** |
| **2 — data plumbing** | Replace every literal with real filings data, keeping the ported design intact | QA + 4b |

The point: fidelity becomes verifiable **on its own**, with nothing else moving. Attempts 1–3 all
built design and data together, so every fidelity miss surfaced late and every fix risked the data.

---

## 🔒 Operator decisions — 2026-07-30, the terms of attempt 4. Do NOT re-litigate.

1. **D-legacy** — the existing Institutional view moves to **`/company/{symbol}/institutional-legacy`**
   and is **LISTED in the view rail** ("Institutional (legacy)"), so old and new can be compared side
   by side without retyping URLs. **Temporary**: delete the entry, the view and its render path once
   the port is accepted.
2. **D-literals** — the phase-1 page carries **the prototype's own sample values, verbatim**. Not
   blank slots, not uniform fakes: you cannot verify "exactly the prototype" against an empty page —
   charts collapse, tables have no rows, wrapping and label collisions never happen.
   **Guardrails, non-negotiable:** a loud **`⚠ STATIC DESIGN PORT — NOT REAL DATA`** banner at the
   top of the page, not dismissible; the honesty rules are suspended **only** for this unshipped
   scaffold; and **phase 2 is not done until no literal remains.**
3. **D-protocharts** — **port the prototype's own chart builders**, don't reuse ours. Our
   `ClearyFi.*` builders and their chrome are part of what read as "old design".
4. **D-clean-master** — attempt 4 starts from a **clean master**. Nothing is carried over in the
   working tree, including attempt 3's backend and its fixes.

### 🔒 Still in force from 2026-07-28 (settled before attempt 3; unchanged)

**FIVE company views, and exactly ONE slug retires.**
`hub · history · insider ("Insider activity") · institutional · peers`, with
`VIEW_ALIASES.companies += { beneficial: "institutional" }` as the only retirement.
13D/G folds into Institutional (a 5% stake and the register it sits in are one question). **Insider
stays its own view** — Forms 3/4/5 are as-reported *transactions*, a different KIND of fact from a
quarter-end holdings snapshot, and folding them in would bury the only insider surface we have behind
a register view. ⚠️ This contradicts `ROADMAP_APP_V3` §6's "three-way collapse"; the operator decision
wins — update the roadmap when P5a lands.

*(The `beneficial` → `institutional` alias is a **phase-2** change: §04 is where 13D/G lands and that
needs data. Phase 1 leaves `/beneficial` alone.)*

---

## 🔑 THE UNLOCK: the prototype RENDERS. Port against ground truth, not by eye.

**This is what the previous three attempts did not have.** They read `prototype.dc.html` as *source*
and ported by eye — which is exactly how the `+ Also in this section` pattern survived five rounds of
review unnoticed.

`prototype.dc.html` is a dc-runtime/React export that pulls React + ReactDOM + Babel from unpkg.
Served over HTTP **with outbound internet**, it renders live. Verified 2026-07-30.

```bash
docker run -d --rm --name proto-srv --network stock_profiler_default \
  -v "$PWD/docs/design/sector-app-prototype-v3:/srv:ro" -w /srv \
  python:3.11-slim python -m http.server 9000
# from a container on that network: http://proto-srv:9000/prototype.dc.html
#   it opens on Sectors → click sidebar "Companies", then the view rail's "Institutional"
#   sections are #i1…#i7 (each has a data-screen-label); content column is 694px at a 1440 viewport
docker rm -f proto-srv    # when finished
```

**Use it to:** capture per-section ground-truth screenshots and **diff each ported section against
its capture before starting the next**; read the prototype's exact sample values out of its DOM
(satisfying D-literals precisely rather than inventing numbers); and read computed CSS per element
instead of guessing from inline styles.

**Serving our own app for comparison** (the seeded fixture publishes no port of its own):

```bash
docker compose --profile e2e run --rm -d -p 8000:8000 --name p5a-preview e2e-app
# → http://localhost:8000/company/AAPL/institutional
docker stop p5a-preview
```

---

## Progress (attempt 4)

- [x] **P1a** existing Institutional view → `/institutional-legacy`, **listed in the rail** as
      "Institutional (legacy)". Rail is now Overview · Financial history · Insider · Institutional ·
      Institutional (legacy) · 13D/G. The period selector + the entity bar's Period cell follow the
      LEGACY view; the port is not period-scoped. All 5 company URLs verified 200.
- [x] **P1b** blank `/institutional` live: the undismissable NOT-REAL-DATA banner, the prototype's
      in-view header (breadcrumb + source line), and the seven section shells with the prototype's
      headings and scope notes verbatim. `renderInstitutionalPort()` in `company.js`; CSS namespace
      `.ip-*` in `company.css`. No console errors.
- [ ] **P1c** ⬅ **NEXT** capture prototype ground truth → `v3-p5a-institutional/prototype-ground-truth/`
- [ ] **P1d** ⬅ **NEXT** port the prototype's CSS primitives
- [ ] **P1e-§01** ⬅ **NEXT** build §01 only, diff it, **then STOP for the operator's read on the
      fidelity bar** before §02–§07
- [ ] **P1e-rest** §02 → §07, screenshot-diffing each against its capture before starting the next
- [ ] **P1f** port the prototype's chart builders (D-protocharts)
- [ ] **P1g** full-page diff vs the prototype
- [ ] **🚦 OPERATOR GATE — verify the design port.** Phase 2 does not start until this passes.
- [ ] **P2** plumb real data in, literal by literal, until none remain
- [ ] 4 QA · 4b operator verification

⚠️ **Working tree is UNCOMMITTED** (4 files: `_active.md`, `company.js`, `company.css`, `shell.js`).
Nothing is committed on this branch — it is still at `master` (`9d0d10f`).

---

## ▶ NEXT (resume here): P1c → P1d → §01, then STOP

**Scope of this run: P1c, P1d, and §01 ONLY.** §01 is the fidelity probe — build it, diff it against
the prototype, show the operator, and get their read on whether that is the bar **before** spending
six more sections on the wrong one. Do not run ahead to §02.

### P1c — capture ground truth

Serve the prototype and our app (both commands are under "THE UNLOCK" above), navigate the prototype
to Companies → Institutional, and screenshot `#i1`…`#i7` individually plus the full page into
`docs/delivery/v3-p5a-institutional/prototype-ground-truth/`. Content column is **694px** at a 1440
viewport — match that width when diffing, or every proportion will read wrong.

**Also extract the literals from the live DOM while you are there** (D-literals). Do not hand-type
them from the notes below.

### P1d — the CSS primitives §01 needs

Port from the prototype's own inline styles, then verify with `getComputedStyle` on the live render:
the **card** (`--bg-card`, 1px `--border`, 12px radius, `--shadow`, 15px/16px padding) · the
**accent-edged strip** (3px `--accent` left border) · the **tint panel** (`--bg-tint`,
1px `--border-tint`, 9px radius) · the **micro-label** (mono 9.5px, 0.1em, uppercase,
`--mono-muted`) · the **tile grid** (`repeat(auto-fit,minmax(180px,1fr))`, **1px gap on a `--rule`
background**, 10px radius, overflow hidden) · the **`ƒ DERIVED` badge** · the **dashed value cue**
(the click affordance is a `border-bottom` on the VALUE ITSELF) · the **expander bar** · the
**vertical cell divider** (1px × 38px `--rule`).

### P1e-§01 — the elements, in order (prototype :1699–1894)

1. **Freshness strip** — 4 cells separated by 1px vertical rules, wrapping: `REGISTER AS OF` ·
   `NEXT 13F WINDOW CLOSES` · `FILINGS SINCE THE SNAPSHOT` (value in `--accent-ink`) ·
   `CONFIRMED IN LAST 30 DAYS`. Each cell: mono 9.5px uppercase label / mono 15px 600 value / mono
   10px note. Then a top rule and **two prose lines** (the 45-day lag line, the Section 13(f) scope
   line) at 12.5px `--ink-body`.
2. **Card "Since the last 13F"** — title + scope note + `Base 13F ↗` link + a **`ƒ DERIVED` chip**;
   a tint panel carrying `Base register + Filed since = Adjusted register` (three cells, mono 17px
   values, `+` and `=` as mono 15px `--mono-muted` glyphs between them); the micro-label
   `WHERE THE REGISTER MOVED · PRIOR QUARTER TO CURRENT`; a legend `○ prior quarter ● current`;
   **the dumbbell chart**; its caption; then the **expander bar** (`+ ALSO IN THIS SECTION` +
   `filing-by-filing detail since the snapshot · how fast each form arrives`).
3. **Tile grid**, 4 tiles — `REPORTING MANAGERS` · `SHARES REPORTED` · `INSTITUTIONAL SHARE`
   (carries a `ƒ DERIVED` chip) · `INSIDER OWNERSHIP`. Values are mono 22px 600 with the **dashed
   underline cue**; each has a mono 10px note beneath.

The **dumbbell** is the one chart §01 needs — port the prototype's builder (D-protocharts), not
`ClearyFi.dumbbellChart`. Its anatomy: row label right-aligned in a left gutter, hollow dot = prior
quarter, filled = current, connector between, **signed delta right-aligned outside the plot**,
colour = manager type.

### Cross-check only — values seen on a 2026-07-30 capture

⚠️ **The prototype seeds its sample data from the ticker**, so a different focal company renders
different numbers. Take the literals from the DOM (P1c); these are a **sanity check that you are
looking at the right elements**, not the source:

`1Q26` · `filed 2026-05-12 · 73 days since filed` · `2026-08-14` / `in 21 days` · `6` filings since ·
`32%` confirmed · base `767M` + `9.7M` = `776M` (`61.6% of shares outstanding`, `3 of 6 filings
applied`) · tiles `1,669` / `767M` / `60.8%` / `6.4%` · dumbbell rows `Hedge fund H +4.9M`,
`Active manager D +4.4M`, `Sovereign fund G +2.6M`, `Index manager C +1.8M`, `Pension system F
+0.7M`, `Index manager B −1.4M`, `Active manager E −2.7M`, `Index manager A −10.5M`.

**Note the shapes, which do not vary:** quarters render as **`1Q26`**, never `Mar 31, 2026`; manager
names in the prototype's sample data are TYPE names; deltas carry an explicit sign.

### Done-when, for this run

- `#ip-01` rendered, screenshotted at a 694px content column, and **diffed side by side against
  `proto-i1.png`**, with the differences you can still see listed honestly rather than declared
  absent.
- No backend call added. No literal outside §01. The banner still at the top.
- **Then stop and ask the operator** whether §01 is the fidelity bar, before building §02–§07.

---

## 🗄 Attempt 3 is archived, not lost — mine it, don't rebuild it

Branch **`v3-p5a-attempt3-archive`** (commit `1429955`, local, never pushed). Restore any single file:

```bash
git checkout v3-p5a-attempt3-archive -- <path>
git branch -D v3-p5a-attempt3-archive     # to discard it entirely
```

**Worth pulling from it rather than re-deriving** (each was verified working):

| What | Why it may be worth having |
|---|---|
| `src/secfin/normalize/register.py` + 4 endpoints + `period_meta` + 37 tests | The whole **phase-2** backend, already built and green: `share_vector`, `concentration` (HHI / effective-N / Gini / "half the register"), `turnover`, `tenure`, `stable_capital_share`, each carrying `status` + `reason` + `formula` + `population` + `cannot`. Zero DuckDB, zero batch jobs, zero new ingest. |
| **fix 1** — `ClearyFi.chartWidth()` + `.page { width: 100% }` | A **real, product-wide layout bug**, unrelated to this view: charts were authored at the mount width, then silently downscaled by their own card (Plot's `max-width:100%` scales text too — measured 854→816, 419→381); collapsed `:empty` mounts measured 0 and fell back to a default; and `.page` was sized by its CONTENT, not the viewport (64→952→1070px on /manager as content landed — the likely cause of V3-P4's "content column squeezed to 171px"). |
| **fix 2** — `coHoldingNetwork` label placement | Candidate-offset placement + drop, per `STYLE_GUIDE` §12. |
| `scripts/seed_fixture.py` 13F `filed` dates | Fixture filed *on* quarter-end is impossible (a 13F is due ~45 days after); lagged to 31–44 days. |
| The delivery trail | `1-brief.md` (32 ACs) · `2-architecture.md` · `0-element-inventory.md` (as-built, every row with a verdict) · `4-qa.md` · `4b-manual-verification.md` · `5-design-port-plan.md` |
| `prototype-ground-truth/*.png` | The captures; or just regenerate them with the commands above. |

⚠️ Attempts 1 and 2 are separately preserved on branch **`v3-p5-company-institutional`** (`0ce1146`).
**Do not build on or delete either archive branch.**

---

## Inherited lessons — these cost real rounds. Don't re-learn them.

1. **Open the prototype per ELEMENT, not per phase.** Diff the element list of the prototype section
   against what you built, one line at a time. Now that it renders, diff the *screenshots*.
2. **Ten of V3-P4's defects were visible ONLY in a screenshot** — phantom grid cells, a 73-label axis
   smear, a content column squeezed to 171px, a chart ignoring its container. The e2e exit code was
   green for every one. **Eyeball every shot.**
3. **Verify a failing assertion before reporting it.** Six of P4's "failures" and four of attempt 3's
   were the script's fault: `innerText` of a **collapsed** container (a `<details>`, or anything
   `hidden`) is empty **by design** — use `textContent` or open the affordance first. Also:
   `fullPage` screenshots misplace `position: sticky`/`fixed` elements, which looks like an overlap
   bug and isn't.
4. **A chart built inside a hidden container measures 0** and silently authors at its fallback width.
   Mount on first reveal.
5. **`selectTab()` early-returns when the view is already active** — any "jump to view X carrying
   state" hand-off must handle the already-there case. P4 shipped exactly that bug.
6. **Ask, don't guess, on ambiguous design feedback.** P4's four clarifying questions each prevented
   a wrong cycle; the two items guessed at both came back.

### Two honesty tensions phase 2 must resolve (seen in the prototype's own §01)

The prototype draws figures we either cannot source or have deliberately refused to compute. Phase 1
ports them **as drawn** — the operator is verifying design. **Phase 2 must re-apply the honesty
calls**, and each one changes the layout, so each needs an operator decision rather than a silent
revert:

- **"Confirmed in last 30 days · 32%"** — we do not track filing confirmations.
- **The adjusted register** (`767M + 9.7M = 776M`) — summing a 13D/G *total* + a Form 4 *transaction*
  + a 13F *holding* invents a share count nobody filed. Attempt 3 omitted it deliberately and the
  operator's Batch B passed on exactly that reasoning.

---

## Parallel track (NOT the active task) — V3-P3, cheap metadata unlock

`ROADMAP_APP_V3` §6: **backend-only, no UI, depends on nothing** — can run alongside. Store **8-K item
codes + acceptance timestamps** from the `/submissions/` JSON we already fetch. Turns the shell's
"What's moving" feed from a placeholder into a real feed, unblocks **P8**, and makes V3-P4's
right-rail Filing-timeline placeholder real without moving it. `sec/insider.py:_recent_filings()`
already walks those parallel arrays filtered to Forms 3/4/5 — generalizing that filter is most of the
work. ⚠️ **Verify `items` and `acceptanceDateTime` are actually present** in a real payload fetched
with our own compliant User-Agent before designing; the roadmap asserts it.

## Previous task

### ✅ V3-P4 DONE (2026-07-28) — merged to master as `94c3c70`
`/company/{symbol}` re-cut into **Overview** (`hub`) and **Financial history** (`history`).
Trail: `docs/delivery/v3-p4-company-recut/`. Discoveries P5 inherits as fact:
**companyfacts carries NUMERIC facts only** (`dei:AuditorName`, NAICS, HQ, employee count are text →
structurally absent from our store); **`company_profiles` has name + SIC for 8,917 CIKs**;
`/metrics` returns a per-metric `trend` array that is **intra-year quarters, not year-over-year**.

# Active delivery task

task_slug: v3-p5a-institutional
request: V3-P5a — Company: **Institutional**. Build the prototype's Institutional view. 13D/G folds
  in; Insider activity keeps its own view. (Peer-relative was split out as **V3-P5b**.)
branch: v3-p5a-institutional (clean off `master` 9d0d10f — **attempt 4**)
next_stage: manual      ← §01 built + diffed; PAUSED for the operator's read on the
  fidelity bar before §02-§07. No PM/architect stage this attempt; see below.
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
      `.ip-*` in `company.css`.  *(P1a+P1b committed as `54d1522`, pushed.)*
- [x] **P1c** prototype ground truth captured → `v3-p5a-institutional/prototype-ground-truth/`
      (PNG per section `#i1`…`#i7` + full page, `literals.json` = every element's text AND computed
      CSS, `tokens.json`). Re-runnable: `v3-p5a-institutional/tools/{capture,ours,boxes,shot,frac}.js`.
      **Two things this settled:** the prototype's tokens are byte-identical to `style.css`'s (only
      `--rule` → `--border-tint-rule` is renamed), and it loads the same Google Fonts request we
      already do — so nothing had to be vendored or re-picked.
- [x] **P1d** the prototype's CSS primitives ported under `.ip-*`, read off the live render with
      `getComputedStyle` rather than inferred from its markup.
- [x] **P1e-§01** built and diffed. **Pixel-identical**: of 3.1M pixels, 753 differ at all, 48 by
      more than 8/255, exactly **1** by more than 32/255, and there are **zero contiguous bands**.
      69 of 73 element boxes match to under 0.01px (the other 4 are a nesting artifact — see the
      log); section height 1127px in both, at 1× and 2×.
- [x] **🚦 OPERATOR READ (2026-07-30): §01 IS the fidelity bar** — with one gap the operator caught
      that I had not surfaced: the prototype's Institutional view has a **right rail** and a
      **SECTIONS jump list**, and the port had neither. Both now built. Four more decisions taken:
      **pacing** = build §02–§07 then show; **expanders** = build and wire them (done for §01);
      **right rail** = the prototype's frame with OUR honest empty state, NOT its nine sample
      filings (no filing index until V3-P3, and P4 deliberately refused to invent one); **rail
      scope** = the ported view only, other views unchanged; **narrow widths** = port as drawn.
- [ ] **P1e-§02…§07** ⬅ **WE ARE HERE.** Not started. See "the measured remainder" below.
- [ ] **P1e-rest** §02 → §07, screenshot-diffing each against its capture before starting the next
- [ ] **P1f** the remaining prototype chart builders (D-protocharts) — §01's dumbbell is done
- [ ] **P1g** full-page diff vs the prototype
- [ ] **🚦 OPERATOR GATE — verify the design port.** Phase 2 does not start until this passes.
- [ ] **P2** plumb real data in, literal by literal, until none remain
- [ ] 4 QA · 4b operator verification

⚠️ **Working tree is UNCOMMITTED** (`company.css`, `company.js`, `shell.js`, `shell.css`,
`scripts/headless_check.js`, and the new `docs/delivery/v3-p5a-institutional/`). Branch is at
`54d1522`.

## The measured remainder — read before starting §02

Ground truth for all seven sections is captured **with the expanders open**
(`literals-open.json`, `proto-i<N>-open.png`). Section heights, open:

| §01 | §02 | §03 | §04 | §05 | §06 | §07 | total |
|---|---|---|---|---|---|---|---|
| 1700 | 2026 | 3017 | 1961 | 1177 | 1304 | 540 | **11,725px** |

§01 is finished, expander included. §02–§07 are empty shells: ~10,000px of design and roughly
**eight more chart builders** to port — paired mini bar charts and a nine-quarter stacked area
(§02); a diverging flow chart, a ranked bar list, a cumulative-share curve and a treemap (§03);
§04–§06 not yet inventoried. Every one is a hand-authored SVG on a fixed `viewBox` in the
prototype, like §01's dumbbell — never Plot.

**Method, unchanged and non-negotiable:** capture → build → `tools/boxes.js` (numeric) → pin the
column AND its fractional origin → pixel diff. §01 only reached pixel-identical because every
element was measured; four of its five defects were invisible by eye. Building six sections faster
than that is precisely what produced three rejected attempts.

### What the second run added, beyond §01

- **`shell.js`'s `rail()` takes an optional `sections` list** — a view that declares none renders
  exactly what it did before, so no other page changed. Labels are the prototype's SHORT forms.
- **Right rail** on the ported view: `.ip-rr-*`, its own namespace, so P4's signed-off rail is
  untouched. Column went 960px → **732px** (the prototype's is 694px; the 38px is our 132px view
  rail against its 178px, which is V3-P2's settled width and not the port's to change).
- **Expanders are real.** Bar toggles the block after it and relabels itself `− Hide`. §01's body
  is built: six-filing table, exclusion caveat, five-row "how fast each form arrives".
- **Scroll-spy: two bugs found by measuring.** An `IntersectionObserver` band was reliably off by
  one (`scroll-margin-top` parks the target inside it while the previous section is still there);
  the rect test that replaced it then missed by **exactly one pixel** (sections land at top=121,
  the line was 120). Clicking a rail link now marks its own target and holds the scroll handler
  off 900ms. ⚠️ Driving `scrollIntoView` at the LAST sections still marks the previous one — the
  page cannot scroll them under the line. Re-check once §02–§07 have real height.
- **§01 re-diffed after all of it: still zero bands, still 1 pixel above 32/255.**

---

## What §01 cost, and what it caught — read this before §02

Full record: **`docs/delivery/v3-p5a-institutional/5-design-port-log.md`**. The four defects the
numeric diff found and the eye did not:

1. **`style.css`'s `h2` rule leaked in** (`line-height: 1.12; letter-spacing: -0.03em`) — the
   section title came out 9.6px narrower and 3.7px shorter, and pushed *every element below it* up
   by 3.7px. This is precisely what "leftovers from previous design" means, and it is invisible
   without measuring. **Assume more of these; measure every section.**
2. **Badge line box** — the prototype's badge is a `<button>` (UA `line-height: normal` → 11px); a
   `<span>` inherits the body's. Survived rounding at 1× and became a whole extra pixel at 2×.
   **Check every section at both device pixel ratios** (`tools/frac.js`).
3. **`text-wrap: pretty`** — the prototype sets it on exactly three things in §01 and nowhere else.
   It changes where last lines break.
4. **Font fallback** — the prototype declares `"IBM Plex Mono"` with NO generic fallback on the
   badge and the `↗` link; `ƒ`→U+0191 and `↗`→U+2197 are absent from that font, so the fallback
   decides the box width.

**The method, in order:** capture → build → `boxes.js` (numeric, catches layout) → pin our column
AND its fractional origin → pixel diff (catches rasterisation). Pinning the origin matters: Chrome
snaps line boxes to device pixels, so a half-pixel difference in where the section starts rounds one
line of a paragraph differently from its neighbours and fills the diff with noise that is not a
layout difference.

### Deliberate, listed differences in §01 (not oversights)

- **Every affordance is inert** — the two `ƒ DERIVED` badges, `Base 13F ↗`, and the
  `+ ALSO IN THIS SECTION` bar are `<span>`s that render identically and do nothing. Nothing exists
  behind them in phase 1. The expander's revealed content is **not** built (§01's element list
  covers the bar, not what is behind it). Wired in phase 2.
- **The dumbbell's `prior`/`current` were recovered**, not invented: read back from the captured
  SVG's x positions via `x = 210 + v/123.43 × 372`. They reproduce the geometry to <0.1px *and*
  every one rounds to the delta the prototype prints — that agreement is the proof the scale was
  recovered rather than guessed.
- **Colour is carried per row**, not derived: the prototype paints "Active manager D" `#a88c5f` but
  "Active manager E" `#8b8579`, so its type→colour rule keys off something its labels don't expose.
  Only three colours appear across §01–§04. **§02/§03 should settle it.**
- **Narrow widths**: below ~600px the freshness strip stacks and its 1px vertical rules strand
  between cells, reading as stray marks. The prototype's own CSS, ported as written. Needs a
  decision if we care.

### e2e

44 shots. `institutional`, `institutional-legacy`, `institutional-nolocation` all `errors=0`.
**One real regression found and fixed:** the P1a re-route silently broke the holder-geography
regression guard (`institutional-nolocation` clicks `#inst-subtabs`, which now lives at the legacy
slug) — it had been failing since `54d1522`. Repointed, plus a shot added for the port.
Two failures remain and are **pre-existing, confirmed by stashing this run's changes and
re-running**: `sectorapp-company` (errors=8) and `sectorapp-company-refocus` (errors=14), both 502s
on `/sectors?view=company&symbol=900001`, a synthetic fixture CIK, on pages this change never
touches. No `pytest` run — no Python changed.

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

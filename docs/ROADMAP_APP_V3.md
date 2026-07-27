# Roadmap — App **v3** (whole-product IA from the updated prototype)

Successor to `ROADMAP_SECTOR_APP_V2.md`. v2 was a five-view sector app; **v3 is no longer a sector
app** — the prototype grew into the IA for the whole product, with three entity "subjects" and
fifteen views. This roadmap says what changes, what is buildable today, what needs new ingest, what
must stay a placeholder, and in what order.

## Source artifacts

| File | What it is |
|---|---|
| `docs/design/sector-app-prototype-v3/prototype.dc.html` | **The prototype — source of truth for layout, vocabulary, and honesty behaviour.** Open in a browser. 699 KB, ~8k lines, 5.5× the v2 artifact. A design artifact, React-flavored, one class, all figures deterministic-synthetic — **do not port its architecture, and do not port a single number.** |
| `docs/design/sector-app-prototype-v3/RECONCILIATION.md` | Written by the design side **against our current `HANDOFF.md` + `STYLE_GUIDE.md`**. Collisions, the status-vocabulary gap, the chart translation table, and the label-placement rules. Read it in full before building. |
| `docs/design/sector-app-prototype-v3/screenshots/` | Iteration shots (nav rail, filings list, gantt zoom). |
| `docs/design/sector-app-prototype-v3/support.js` | The DC runtime the prototype loads. Unchanged from v2. Do not edit. |

The bundle's own `handoff/HANDOFF.md` and `handoff/*.dc.html` are **byte-identical to the v2 copies
already in the repo** — nothing new there; ignore them. `RECONCILIATION.md` is the new document.

---

## 1. What changed from v2

| | v2 | v3 |
|---|---|---|
| Shape | one sector app, 5 views | **3 subjects × 15 views**, one shared selection state |
| Nav | our Data/Reference sidebar | **subject-based top nav** (Companies · Sectors · People · Managers · Auditors · Funds · Events) with **actions scoped to the active subject** (Compare · Screen · Coverage) |
| Views | Sector · Company · Compare · Qualitative · Filings | **Companies (5)**: Overview · Financial history · Institutional · Peer-relative · Compare companies<br>**Sectors (4)**: Sector · Compare · Qualitative · Filings<br>**Managers (6)**: Profile · Register footprint · Voting record · 5% filings · Filing activity · Filing behaviour |
| Charts | ~12 builders | **~40 builders** (see §5) |
| Target stack | "Tailwind + positioned divs" | **d3** for anything with custom label placement (RECONCILIATION §5) |

Four of the seven nav subjects (**People, Auditors, Funds, Events**) have **no views in the
prototype** — they are labeled affordances only. Two of three actions (**Screen, Coverage**) are
stubs inside the prototype but are **real routes in production**.

---

## 2. Decision gates

**D1 and D2 are LOCKED (operator, 2026-07-26)** — the two that gated everything else. D3–D5 remain
open and are resolved inside **V3-P0**, which is now startable.

| Gate | State |
|---|---|
| **D1** Surface/route ownership | 🔒 **LOCKED — option (1), absorb. The prototype's IA is authoritative.** Existing routes survive as deep links into the one app |
| **D2** Subject-based nav | 🔒 **LOCKED — build it as the prototype draws it: all 7 subjects, 4 rendered planned-and-inert.** It is the product's primary nav |
| **D3** Status-vocabulary mapping | 🔒 **RESOLVED (V3-P0)** — `docs/STATUS_MAPPING.md` + `STYLE_GUIDE` §7.1 |
| **D4** as-filed / as-restated basis axis | 🔒 **RESOLVED (V3-P0)** — the axis already exists; `STYLE_GUIDE` §8.1. Compute path deferred to V3-P4+ |
| **D5** Chart engine (d3 vs Plot) | 🔒 **RESOLVED (V3-P0)** — per-chart engine under a `ClearyFi.*` builder; `STYLE_GUIDE` §6 + §12 |

### D1 — Surface/route ownership 🔒 LOCKED (2026-07-26)

**Decision: option (1) — absorb. The build fits the prototype; the prototype's IA is authoritative.**
Where production's IA and the prototype's disagree, **the prototype wins** and production migrates.

**One app, one shell, one state model.** All fifteen views live in a single application shell — the
prototype's: subject nav → sector/entity control bar → view rail → content column (960px cap) →
sticky right rail. Selection (`sector · sub-industry · period · focal company · manager`) persists
across every view because you never leave the app.

**Routes are preserved as addresses, not as separate designs.** This is the one refinement on the
prototype, and it costs nothing structurally: `/company/AAPL` does not redirect to `/sectors` — it
**serves the same app**, with `subject=companies · view=hub · focal=AAPL` derived from the path.
Every existing link, bookmark and indexed URL keeps resolving; what changes is the shell and IA it
renders inside. **The URL is the serialization of the app's selection state.**

Proposed scheme (finalize in V3-P0): `/company/{symbol}[/{view}]` · `/manager/{cik}[/{view}]` ·
`/sectors/{group}[/{view}]` · `/compare/{sectors|companies}`. A bare route means that subject's
default view (`hub`, `mgr`, `sector`).

**Consequences that are now binding:**

- **The two shells merge.** The sector app's self-contained shell (`sectorapp.js` / `sectorapp.css`)
  becomes **the product shell**; `script.js`'s sidebar/topbar is retired into it. This is the single
  largest frontend change in the project — see the risk note below.
- **The component layer survives the merge and is not negotiable.** `app.css` / `app.js`
  (`ClearyFi.*`) carry the status chips, provenance, metric cards, statement tables and states —
  i.e. §6 and §7 of the style guide. The sector app currently declines to load `app.css`; **under
  absorb it must**. Net: `app.css`/`app.js` = components, `sectorapp.css`/`sectorapp.js` = shell.
  Resolving the two stylesheets' overlap is a V3-P2 task, not a later cleanup.
- **The company hub is re-cut, not just re-homed.** Today's tabs map onto the prototype's five
  company views: Fundamentals + Statements → **Overview** + **Financial history**; Insider +
  Institutional + 13D/G → **Institutional**; plus new **Peer-relative** and **Compare companies**.
- **Compare rename stands:** `/compare/sectors` and `/compare/companies`, `/compare` →
  `/compare/companies` (that is what it is today, so existing links survive). Lands in **V3-P7**.
- **URL-as-state is now a foundation, not a fix.** Under split-by-altitude it merely carried
  selection between routes; under absorb it *is* the navigation model. It absorbs both known open
  items (URL doesn't reflect the active view; focal selector not sector-scoped) as a side effect.
- **Marketing and legal pages stay outside** (`/`, `/guide`, `/methodology`, `/privacy`, `/terms`,
  `/disclaimer`). They keep the static `.nav`; the prototype does not cover them.

**⚠️ Risk this decision accepts, and how it is contained.** `/company/{symbol}` is the reference
implementation — the style guide names it "the parent" of every data page — and it is our most
linked page. Absorb rewrites its shell *and* re-cuts its content. **Mitigation: those are two
separate phases.** V3-P2 re-homes the existing pages into the unified shell with **their current
content and tabs completely unchanged**, so any regression is unambiguously the shell's. V3-P4/P5
then re-cut the company views on a stable shell. Never do both in one branch.

*Rejected: (3) Split by altitude — respects the existing routes, but leaves two shells and two
IAs in the product and reduces the prototype's persistent selection to a state-passing trick.
(2) Backport — least disruptive, and loses the point of the redesign entirely.*

#### The collisions this resolves

The prototype grew Company, Manager and Compare surfaces *inside* the app; production already
routes all three standalone.

| Prototype surface | Production route | Collision |
|---|---|---|
| Company Hub (5 views) | `/company/{symbol}` — Fundamentals, Statements, Insider, Institutional, 13D/G | Same content, different IA. Prototype splits Financial history and Peer-relative into siblings; production nests all under one tabbed hub. |
| Managers (6 views) | `/manager/{cik}` — one page | Production has one page, prototype has six views. |
| Compare companies | `/compare` | Prototype *also* has a sector-vs-sector "Compare" — **two different comparisons, one word**. |

### D2 — Subject-based nav 🔒 LOCKED (2026-07-26, revised same day to match the prototype)

The prototype replaces our Data/Reference sidebar with **subjects + subject-scoped actions**: the
nav names *the entity you are analysing*, and the actions available hang off whichever subject is
active. This is a claim that the product is **entity-centric** — that Companies, Sectors and
Managers are three instances of one pattern, not three unrelated pages.

**Decision: build the nav exactly as the prototype draws it, all seven subjects.**

| Subject | State | Destination |
|---|---|---|
| **Companies** | live | `/company/{symbol}` — registrants; 10-K, 10-Q, 8-K, proxy, Section 16 |
| **Sectors** | live | `/sectors` — peer groups of registrants, compared as populations |
| **Managers** | live | `/manager/{cik}` — 13F filers; register footprint, N-PX voting, 13D campaigns |
| People | planned | directors and officers as entities — board interlocks, Section 16 history, 8-K 5.02 |
| Auditors | planned | audit firms — client portfolio, CAM topics, fees, tenure |
| Funds | planned | registered funds — N-CEN, N-PORT, N-CSR |
| Events | planned | form cross-sections — every 4.02, 4.01 or 12b-25 in a period |

- **Planned subjects render, drained and inert** — `--mono-muted` fill, `cursor: default`, **no
  href and no click handler**, and a `title` naming what the subject will hold. Exactly the
  prototype's treatment.
- **Planned actions render the same way.** Compare · Screen · Coverage stay subject-scoped; where an
  action isn't built for the active subject (e.g. Compare under Managers) it appears planned **with
  its description**, not omitted. Live ones resolve to `/compare/*`, `/screen`, `/coverage`.
- Under the locked D1 there is **one shell**, so the subject list has exactly **one source of
  truth** — the unified shell renderer. No per-page nav copies.

**Why this does not violate the "no placeholder links" anti-pattern** — and a required doc
amendment. That rule targets links that *promise a destination and don't deliver*. A planned subject
is not a link at all: no href, no handler, drained to the same `--mono-muted` we use for N/A values,
and self-explaining on hover. It is the **status vocabulary applied to navigation** — structurally
absent, honestly marked — and suppressing it would hide real information about what the product
covers. **V3-P0 must amend `STYLE_GUIDE.md` §10** to draw that line explicitly, so a future reader
doesn't "fix" the nav back.

*Superseded reading (locked and reversed the same day): ship only the three live subjects and hide
the rest. Reversed under the governing principle that the build fits the prototype — and because the
anti-pattern it leaned on does not actually apply to a non-interactive label.*

**Consequence:** this subject nav becomes **the product's primary navigation**, replacing the
Data/Reference sidebar everywhere except the marketing/legal pages. It ships as part of **V3-P2**,
the shell unification — one navigation change, one regression pass.

### D3 — Status vocabulary 🔒 RESOLVED (V3-P0, 2026-07-26)

**Landed as `docs/STATUS_MAPPING.md`** (the row-by-row table) **+ `STYLE_GUIDE` §7.1** (the two
normative rules, kept in the guide so a reader who never opens the companion still can't get the
honesty wrong). Rows are decided by a four-step test applied in order — is it a status at all? is
the value computable? structurally meaningless? present but imprecise? — which makes the mapping
mechanical rather than a matter of taste.

**One deliberate divergence from the design's own table:** RECONCILIATION maps *"no disclosure in
this period"* → N/M. **We resolved it to N/A**, because §7 defines N/M as *"computable but would
mislead"* and an undisclosed period has no inputs to compute from — N/M is definitionally
unavailable. The same test reclassified nothing else, but it was applied to every row rather than
inherited.

*Original framing, for the record:*

**The prototype has no status chips at all.** It expresses the same distinctions in prose. Production
§6 requires a chip on every metric and derived value. Mapping (from RECONCILIATION §3):

| Prototype prose | Production status |
|---|---|
| "not tagged" (missing side of a paired bar) | **N/A** — filer has no such line item |
| "not shared" (Compare companies) | **N/A** — measure absent by business nature |
| "no filing on record" | **N/A** — form does not apply |
| "Section 16 does not apply…" | **N/A** with reason |
| "no disclosure in this period" | **N/M** |
| Gap in a series line | **N/A** — period not disclosed; the line **breaks rather than interpolating** (a §7 requirement, not a style choice) |
| "provisional" on composite scores | **APPROX** |
| Derived `ƒ` chip | not a status — that's provenance |

**Action:** each becomes a `statusChip()`; **the prototype's prose moves into `provenance()` verbatim
— it is better than our current copy, do not paraphrase.** The prototype's rule that an absent
measure is *omitted from a comparison rather than shown as zero* already satisfies §6.

### D4 — Basis axis 🔒 RESOLVED (V3-P0, 2026-07-26)

**The premise was wrong: this is not a third axis, and it is not unmodelled.** The axis already
exists in code — `RestatementBasis = Literal["as-restated", "as-originally-reported"]`
(`normalize/schema.py:619`), `MetricValue.restatement_basis` (`schema.py:649`), already named as a
provenance field in `STYLE_GUIDE` §8, and `DATA_MODEL` R9 already requires one labeled basis per
series, never mixed.

What does **not** exist is any code path that emits `as-originally-reported` — `metrics.py` hard-codes
`"as-restated"`. So D4 resolved to: **document the axis (`STYLE_GUIDE` §8.1) and set the rule that
protects it** — *a UI must not offer an as-filed/as-restated toggle until a real point-in-time
compute path exists behind it.* A toggle returning identical data on both settings fabricates
precision and breaks §9.1, which is the worst outcome available here because it looks like rigor.
Until then the basis is **stated, not selectable**.

**Still open, and genuinely the operator's call:** whether `as-originally-reported` becomes a
shipped capability at all. It is a real differentiator — most vendors silently restate, and we keep
every prior value — but serving it needs a new point-in-time compute path across `metrics.py` and
the materialized `metric_values`. **Recommend deciding at V3-P4**, when the Financial-history view
actually wants the toggle; it is backend work and does not belong in a docs phase.

### D5 — Chart engine 🔒 RESOLVED (V3-P0, 2026-07-26)

**Landed in `STYLE_GUIDE` §6.** The rule stands and was extended, not replaced: pages never call
`Plot.plot()` or `d3` directly; every chart is a `ClearyFi.*` builder; **the engine is chosen per
chart** — Plot where the chart is a plain mark-on-scale, d3 wherever custom label placement or
collision logic is needed, since §12's rules cannot be expressed in Plot. Both are already vendored,
so neither choice adds a dependency.

**Settled in passing (it was a live ambiguity): every builder returns a DOM node.** Not a
preference — `chartCard()` (`app.js:432`) builds and returns a node, and §6 requires every chart to
wrap itself in it, so a string builder cannot satisfy the wrapper rule. The four hand-rolled string
builders (`sparkline`, `trendChart`, `trajectoryChart`, `positionBar`) stay strings and are
**frozen** — recorded as a closed decision so V3-P1 doesn't relitigate it five times.

---

## 3. Scope reality check — what each view actually needs

This is the section that determines how big v3 really is. Classification is against **what we
ingest today**: XBRL companyfacts, per-company submissions JSON, Forms 3/4/5 ownership XML, 13F
info tables + cover pages, SC 13D/G, SEC frames, and DERA dimensional geographic revenue.

| Subject · View | Classification | Notes |
|---|---|---|
| **Sectors** · Sector | **Shipped** | scorecard, decomposition, distribution, peer strip, geo mix (P6b), insider flow (P6a) all real. v3 re-arranges, adds nothing new. |
| **Sectors** · Compare | **Shipped** | radar + overlaid IQR already built. |
| **Sectors** · Qualitative | **Track 2 — placeholder** | risk-factor themes, representative language, CAMs, Item 1C, auditor landscape, RF word-count, non-GAAP, human capital/climate. All free-text. |
| **Sectors** · Filings | **Track 2 — placeholder** | cited-passage list. |
| **Companies** · Overview | **Mixed** | financial figures are Track-1 real. **EX-21 subsidiary/jurisdiction structure is an exhibit, not tagged XBRL → Track 2.** Split the view: build the Track-1 half, placeholder the structure block. |
| **Companies** · Financial history | **Track-1, have data** | statements + metric history exist; restatement basis is already stored (D4 is the only open question). |
| **Companies** · Institutional | **Track-1, have data** *(+ optional extras)* | 13F, 13D/G, Forms 3/4/5 all ingested; issuer-centric endpoints exist. **N-PX, N-PORT, Form 144, DEF 14A are NOT ingested** — placeholder or defer those blocks. |
| **Companies** · Peer-relative | **Partly shipped** | dot-plots/IQR/focal marker exist in the sector app. The prototype's "Beyond the financials" extras (Item 1A/1C/3, CAMs, Item 405, 8-K 4.01/5.02) are **Track 2**. |
| **Companies** · Compare companies | **Track-1, have data** | `/compare` exists. v3 adds the *comparison-validity* framing (§4.6) — adopt that. |
| **Managers** · Profile | **Track-1, have data** | 13F cover page + holdings. |
| **Managers** · Register footprint | **Track-1, have data** | 13F snapshots + derived deltas (carry the long-only / ~45-day-lag caveats). |
| **Managers** · 5% filings | **Track-1, have data** | SC 13D/G ingested (structured-XML coverage floor ~mid-2025 — surface it). |
| **Managers** · Voting record | **New ingest — N-PX** | structured XML, but a whole new source. Gated. |
| **Managers** · Filing activity | **New metadata — cheap** | needs **acceptance timestamps**, which we already fetch in submissions JSON and simply don't store. |
| **Managers** · Filing behaviour | **New metadata — cheap + 12b-25** | acceptance timestamps + late-filing forms. |
| Shell · "What's moving" feed | **Upgradable from placeholder** | the prototype labels it Track 2, but **8-K item codes are structured metadata in submissions JSON** — no text parsing. This can become real cheaply. |

**Summary:** of 15 views — **2 shipped**, **6 buildable on data we already have**, **3 cheap
metadata unlocks**, **1 gated new ingest (N-PX)**, **3 Track-2 placeholders**, and several mixed
views that need splitting into a Track-1 half and a placeholder half.

### Guardrail 1 restated, because v3 pushes hard on it

The prototype's Qualitative and Peer-relative surfaces expand **Track 2** substantially (risk-factor
themes, representative language, CAMs, going-concern, litigation, human capital). `CLAUDE.md`
guardrail 1 is unchanged: **flag, don't build.** These stay honest placeholder layouts — real
structure, every data cell an unmistakable "— / to be defined", never a fabricated figure, filer,
count, %, ●, or excerpt. Reversing that is a deliberate operator decision with a recurring
per-token cost, not something v3 grants by implication.

---

## 4. Honesty conventions to adopt (STYLE_GUIDE §9 amendments)

Six patterns the prototype earned that our doc doesn't have (RECONCILIATION §4):

1. **Age of the newest fact is shown as prominently as the fact** — a "newest fact" banner plus
   clocks (since last filing, position-data age, next filing due). Generalizes §9.7.
2. **Staleness ledger** — per form type: as-of date, age bar, *what it tells you*, and *what it
   cannot*. **The "cannot" column is the load-bearing half.**
3. **Structural absence ≠ missing data.** "No reported stake reaches 10%, so Section 16 does not
   apply and no Form 4 is due" is not "no data". Our N/A chip conflates them — **the reason string
   must survive**.
4. **One fact, one source.** Every figure on a view derives from the same object the other views
   render. Most of the prototype's bugs were violations of this. **Enforce in review.**
5. **Deadline context on any dated filing metric** — a lag figure without its statutory deadline is
   not interpretable (the 13F day-0 → day-45 window strip).
6. **Comparison validity is stated before the comparison** — "N of 5 filing-basis items line up · N
   of 9 measures are tagged by both filers", detail below.

---

## 5. The chart program (largest single bloc of work)

~40 prototype builders. Full translation table in RECONCILIATION §5b.

- **13 stay CSS/flex DOM, do not port to d3** — `pctBar`, `contribBar`, `coverageBar`, `insiderBar`,
  `stackedBar`, `stackedBar2`, `cmpBars`, `cmpMetricBars`, `pairBars`, `ladderRows`, `track`,
  `presenceMatrix`, `filerReveal`. They reflow, wrap, and inherit tokens for free; porting them
  would be a regression.
- **~27 become d3 builders**, notably: `seriesChart` (gap-breaking line — a honesty requirement),
  `histogramChart`, `stackedCols`, `eventStrip`, `dotPlot`/`peerDots`/`universeDots`, `treemap`
  (use `d3-hierarchy`, not the hand-rolled squarify), `cohortHeatmap`/`matrixChart` (**single-hue
  sequential only**), `dotCalendar` (**`scaleSqrt` — area, not radius**), `logDots` (`scaleLog`),
  `windowStrip`, `stakeStepChart` (`curveStepAfter`), `ganttChart`, `dumbbellChart`, `radarChart`.
- **5 consolidations — build once with options, not copies:** distribution strip
  (`dotPlot`+`peerDots`+`universeDots`), scatter (`parityLine: bool`), sparkline (`size`), step chart
  (`series: []`), and keep `histogramChart` single.
- **Unchanged rules:** wrap in `chartCard()`; width from `measuredWidth()`, never hardcoded; ranked
  bars take one fill with emphasis; magnitude single-hue; captions dedupe.

### Label placement — must survive the port (new STYLE_GUIDE section)

About a third of the prototype's iterations were label collisions. d3 solves none of them.

1. **Edge anchoring, not width arithmetic** — a centred label that would cross the canvas edge
   switches `text-anchor` and pins to the edge. **Use `getComputedTextLength()`** — real DOM
   measurement, strictly better than the prototype's constants.
2. **Line height from computed `line-height`, never font-size** — a font-size-derived step is always short.
3. **Candidate-offset placement** for scatter labels (right/left × baseline/above/below); if none
   clears, drop the label and leave the value on the `<title>`.
4. **Origin tick belongs to the x axis only.**
5. **Series names go in a legend** when lines converge.
6. **Author charts at their container width** — never author at a default and scale down. Expand
   overlays **re-author** at overlay width.
7. **Minimum effective text size ~9px** after scaling: verify `fontSize × (renderedWidth / viewBoxWidth)`.

---

## 6. Phasing

Numbering continues from v2's P0–P7. One `/deliver` iteration per phase, branched off `master`,
stacked. Interactive/data-driven phases take the operator hands-on gate at 4b; placeholder-only
phases may be accepted at the QA-tester level.

| Phase | Work | Depends on |
|---|---|---|
| **V3-P0** | **Decisions + doc amendments, no code.** Resolve **D3–D5** (D1/D2 are locked). Amend `STYLE_GUIDE.md`: §6 chart-engine rule (d3 *or* Plot under a `ClearyFi` builder), §9 + the six honesty patterns, a new label-placement section, §4.2/§5 for the locked subject nav, and **§10 to draw the line between a placeholder link and a planned-and-inert nav label** (per D2). Write the status-chip mapping table (D3) with the prototype's prose carried over verbatim. | — (startable now) |
| **V3-P1** | **Chart foundry, wave 1.** The five that recur most — distribution strip, gap-breaking series line, histogram, stacked columns, event strip — in d3, each added to `/components` as it lands. Plus `ResizeObserver` re-measure on view change, and the five consolidations. | P0 (D5) |
| **V3-P2** | **Shell unification — the keystone phase (per D1 absorb).** (a) Promote `sectorapp.js`/`sectorapp.css` to **the** product shell and retire `script.js`'s sidebar/topbar into it; (b) make the unified shell load `app.css`/`app.js` and resolve the two stylesheets' overlap; (c) ship the locked **D2 subject nav**; (d) **URL-as-state** — every route serves the one app with selection derived from the path, absorbing both known open items. **Re-home `/company`, `/manager`, `/compare`, `/screen`, `/coverage` with their current content and tabs UNCHANGED** — no view re-cutting in this branch, so any regression is unambiguously the shell's. | P0 |
| **V3-P3** | **Cheap metadata unlock.** Store **8-K item codes + acceptance timestamps** from the submissions JSON we already fetch. Turns "What's moving" from a placeholder into a real feed and unblocks P8. Single-writer ingest path, guardrail 8. | — |
| **V3-P4** | **Company — re-cut into Overview + Financial history.** The first content re-cut on the stable unified shell: today's Fundamentals + Statements become the prototype's two views. Track-1 half only; EX-21 structure block stays a placeholder. Resolves D4 in the UI. | P1, **P2** |
| **V3-P5** | **Company — Institutional + Peer-relative.** Insider + Institutional + 13D/G collapse into one **Institutional** view; Peer-relative ports from the sector app. 13F/13D-G/Forms 3-4-5 blocks real; N-PX/N-PORT/144/DEF 14A blocks placeholder or omitted; "Beyond the financials" extras are Track 2. | P1, **P2** |
| **V3-P6** | **Managers — Profile, Register footprint, 5% filings** at `/manager/{cik}[/{view}]`, using the prototype's six-view rail with three views live. | P1, **P2** |
| **V3-P7** | **Compare companies** + the locked `/compare/{sectors,companies}` rename, with `/compare` → `/compare/companies`. Adopt the comparison-validity framing (§4.6). | **P2** |
| **V3-P8** | **Managers — Filing activity + Filing behaviour.** The staleness-ledger and window-strip patterns (§4.2, §4.5) land here. Sequenced last of the real work because it is the view most likely to need real data to be worth shipping. | P3 |
| **V3-P9** | **Gated new ingest — N-PX voting record**, and, only if wanted, Form 144 / N-PORT / DEF 14A / EX-21. Each is its own ingest decision and its own roadmap entry, not a v3 line item. | operator |
| **held** | **People · Auditors · Funds · Events** — no views built; they ship in the nav from P2 as **planned-and-inert** labels (D2). All **Track-2** views stay placeholders. | operator |

### Sequence at a glance

**P0 decisions → P1 charts → P2 shell unification → P3 metadata → P4/P5 Company → P6 Managers →
P7 Compare → P8 Filing activity → [P9 gated ingest].**

P0–P3 are foundations; P4–P8 are the visible surfaces.

**With D1 locked to absorb, V3-P2 is the whole critical path.** Every view phase (P4–P7) runs on the
unified shell, so nothing after P2 can start before it lands. Only **P1** (chart builders, pure
additions to `/components`) and **P3** (ingest metadata, no UI) can run alongside it — start them in
parallel to keep the queue moving while P2 is in flight.

**The one rule P2 must not break:** it re-homes pages **without changing their content**. Shell
migration and content re-cut never share a branch. If a P2 review starts discussing which tabs
should exist, that discussion belongs in P4.

---

## 7. Standing rules for every v3 phase

- **Do not port the prototype's architecture** — port layouts, vocabulary, and honesty behaviour.
  D1's "the prototype's IA is authoritative" governs **information architecture**: the shell, the
  nav, the view set, the state model. It does not license porting React, its single-class structure,
  or its synthetic data layer.
- **Shell changes and content changes never share a branch** (the P2 rule, generalized).
- **Do not port a single number.** Every prototype figure is deterministic-synthetic off a seeded
  `sd()`/`ri()`. They are plausible, not accurate. **Never use one as a test fixture.**
- **Status chip on every derived value** — the gap in D3 is the single most likely thing to be lost
  in translation.
- **No chart authored below its container width**; add a headless shot for every new view.
- The `HANDOFF.md` §9 checklist applies unchanged.
- Track-2 placeholders: replicate the layout, never fabricate a cell.
- **F4 favorability color** stays as decided in v2 (Sector view done; Company + Compare still open).

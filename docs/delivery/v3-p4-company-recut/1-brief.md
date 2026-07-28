# 1 — Product brief: V3-P4, Company re-cut (Overview + Financial history)

**Task:** `v3-p4-company-recut` · **Stage 1 (Product Manager)** · 2026-07-27
**Source:** `docs/ROADMAP_APP_V3.md` §6 (P4) · `docs/design/sector-app-prototype-v3/prototype.dc.html`
(`hub` view :799–1577, `history` view :1578–1679, view list :7388) · `docs/STYLE_GUIDE.md` §8.1, §11
**Depends on:** V3-P1 (chart foundry, `docs/BUILDER_INVENTORY.md`) · **V3-P2** (unified shell — already on `master`)

---

## Problem / user

**The company hub's information architecture is the one the prototype replaced.** V3-P2 moved
`/company/{symbol}` onto the unified shell but deliberately left its content and view set untouched,
so the page still presents *Fundamentals* and *Statements* — two tabs that split the same company by
**data type** (ratios vs. line items) rather than by the question the reader is asking. The reader
who wants "how is this company doing right now?" has to visit both; the reader who wants "how has
this moved over ten years?" can only get there one metric at a time, through a per-card trend panel
that charts a single series and cannot overlay.

The prototype splits the same material by **time horizon** instead: **Overview** answers the
current-period question in one screen, **Financial history** answers the across-time question with a
real explorer (any metric, any period on file, up to three overlaid). That is the split this phase
delivers.

**Who this serves.** The evaluating reader on our most-linked page — `STYLE_GUIDE` §11 names
`/company/{symbol}` "the parent" of every data page. Every later v3 phase (P5 Institutional and
Peer-relative, P6 Managers, P7 Compare) inherits whatever pattern this phase sets.

**How we know it's solved.** A reader lands on `/company/AAPL`, gets identity + this period's
statements + every metric in one scroll; clicks through to Financial history and can chart revenue,
overlay net income and free cash flow, and switch range without leaving the view. No URL that
resolved before this phase stops resolving.

### ⚠️ The shield V3-P2 had does not exist here

P2 could claim any regression was unambiguously the shell's, because it changed no content, and QA
proved it with a content-parity harness against `master`. **P4 changes content by definition.** The
parity trick does not apply. Every acceptance criterion below therefore describes the *intended new
shape* concretely enough that QA can tell a deliberate change from a regression — that is the main
thing that makes this phase harder than it looks, and the budget is spent here on purpose.

---

## Scope

### The view set after this phase

The `companies` rail becomes **five views**, of which P4 owns the first two:

| Slug | Label | Owner | State after P4 |
|---|---|---|---|
| `hub` | **Overview** | **P4** | new — replaces `fundamentals` |
| `history` | **Financial history** | **P4** | new — replaces `statements` |
| `insider` | Insider | P5 | **unchanged** — do not touch `renderInsider()` |
| `institutional` | Institutional | P5 | **unchanged** — do not touch `renderInstitutional()` |
| `beneficial` | 13D/G | P5 | **unchanged** — do not touch `renderBeneficial()` |

Slugs `hub` and `history` are **locked inputs**, not a choice: `ROADMAP_APP_V3` §2 (D1) names
`view=hub` as the company default, and `_active.md` records the four company view keys. P5 collapses
the last three into `inst`; that is not this branch's business.

### Overview (`/company/{symbol}/hub`)

Two sections, numbered as the prototype numbers them (`01`, `02`, with a source eyebrow).

**§01 Identity & structure**
- **Registrant profile** — a compact key/value card. **Only fields this page can honestly resolve
  today.** The prototype lists ten (CIK, SIC, NAICS, state of incorporation, headquarters, fiscal
  year-end, auditor, employees, filer status, first 10-K); most come from sources we do not serve.
  Fields with no served source are **omitted, not rendered as a permanent N/A** — the same call
  V3-P2 made and reasoned for the entity bar's "Peer set" cell (a cell that can never resolve is
  chrome noise, not honesty). The architect determines the resolvable set (see Open decision 1).
- **Consolidated subsidiaries — an honest EX-21 placeholder.** Real structure (the Entity /
  Jurisdiction / Ownership column heads, the card chrome, the "Read EX-21 ↗" affordance), **zero
  data rows, not one fabricated entity, jurisdiction, count or percentage.** The empty state states
  plainly that EX-21 is a filed *exhibit*, not tagged XBRL, so it is not in our structured coverage.
  This is the one placeholder `ROADMAP_APP_V3` §3 asks for by name.

**§02 Financial detail**
- **Condensed statements** — the prototype's compact card: statement tabs (Income · Balance sheet ·
  Cash flow), the most recent **four** periods as columns, one row per canonical line. Read-only
  summary; the exhaustive table lives in Financial history. **Balance sheet renders via the existing
  `ClearyFi.balanceMatrix` builder** (operator instruction). Line values reuse the existing
  structured statement data — no new normalization, no new row vocabulary.
- **Financial snapshot** — **the merged block.** Today's 5-tile "At a glance" band and the ~28-card
  metric grid **become one surface**, and it adopts the prototype's snapshot design *and function*
  (operator instruction, `prototype.dc.html:964–1010`):
  - a dense tile grid, tiles grouped under the existing six `CATEGORIES` headings;
  - each tile: metric label · large value · an 8-period sparkline · a YoY line · a compare action;
  - **clicking a tile opens a drawer** below it holding the metric's own chart, range tabs, and the
    "How this is computed" panel (formula, basis, and the why-reason for any APPROX/N/A/N/M);
  - the compare action deep-links into Financial history with that metric preselected.
  - The status glyph, basis label and peer bar the metric cards carry today **must survive the
    redesign** — §6/§7/§8 of the style guide are not relaxed by a visual change.
  - The "On this page" section rail retargets to the snapshot's category groups.

### Financial history (`/company/{symbol}/history`)

- **Metric explorer** (prototype `:1604–1652`): the grouped metric picker ("click to overlay, up to
  three"), one series chart with a legend carrying each series' latest value and a remove control,
  **range tabs (8 quarters · 20 quarters · 5 fiscal years)**, an Expand affordance, and the footer
  facts — range low/high (single series only), *"N of M periods disclosed"*, a mixed-units warning
  when overlaid series do not share a unit, and the overlay hint.
- **The full statement surface, moved here intact** — the existing statement tables with the
  source-tag audit column, the raw-JSON toggle, the segments spike (`?stmt=segments`, three symbols)
  and the income/balance/cash-flow viz charts. **Restyled toward the prototype; not re-implemented
  and not reduced.** Nothing that ships today on the Statements tab may be lost.
- **Basis is stated, never selectable** (see D4 below).

### URL and route compatibility (non-negotiable)

Every one of these must land on the right view after the re-cut:

| URL | Lands on |
|---|---|
| `/company/AAPL` | Overview |
| `/company/AAPL/hub` · `/company/AAPL/history` | the named view |
| `/company/AAPL/fundamentals` (legacy path) | Overview |
| `/company/AAPL/statements` (legacy path) | Financial history |
| `/company/AAPL?tab=fundamentals` · `?tab=statements` | Overview · Financial history |
| `?stmt=income\|balance\|cashflow\|segments` | Financial history, that statement selected |
| `?trend=<metric>` | that metric's detail — the snapshot drawer or the explorer, one or the other, decided once and documented |
| `/company/AAPL/{insider,institutional,beneficial}` | unchanged |

⚠️ `shell.js`'s `resolveView()` silently maps an **unknown** slug to the subject's default view. Left
alone, `/company/AAPL/statements` would quietly land on **Overview** — a wrong page, not an error.
Legacy slugs need explicit aliasing, not the fallback.

### Out of scope (explicit)

- **Prototype Overview sections 03–08** — Segments & geography, Capital & ownership, Governance &
  people, Accounting quality & audit, Obligations & contingencies, Disclosure change. Every one
  needs a source we do not ingest (ASC 280 per-company segments, DEF 14A, the auditor's report,
  Item 3, Item 1A). **Not rendered at all** — not even as placeholders. Operator decision, 2026-07-27.
- **All footnote blocks in prototype §02** (revenue disaggregation, RPO, inventory, debt ladder, tax
  rate reconciliation, deferred revenue, SBC, goodwill by reporting unit, leases). Dimensional /
  footnote XBRL we do not ingest.
- **"What changed this filing"** (prototype `:814–829`) — a narrative diff against the prior annual
  report. Track 2.
- **The as-filed / as-restated toggle** — see D4.
- **The sticky cross-view comparison tray** (prototype `:1653–1677`). Multi-metric overlay is fully
  reachable from Financial history's own picker, so the tray adds state complexity without adding
  capability. The snapshot tile's compare action deep-links into Financial history instead.
- **The Insider, Institutional and 13D/G views** — V3-P5 owns those, including the known
  pre-existing co-holding label-collision defect (verified on `master`; not P4's to fix or be
  blamed for).
- **Track 2 in any form** — no free-text extraction, no summarization, no LLM.

---

## Acceptance criteria

Observable and testable. QA verifies each by driving the real app, not by reading the diff.

### Structure and routing

- **AC-1** The `companies` view rail reads **Overview · Financial history · Insider · Institutional ·
  13D/G**, in that order. No "Fundamentals" or "Statements" label appears anywhere in the product.
- **AC-2** `/company/AAPL` renders Overview and the address bar normalizes to `/company/AAPL/hub`
  without adding a history entry.
- **AC-3** Every URL in the compatibility table above lands on the stated view. `/company/AAPL/statements`
  lands on **Financial history**, never on Overview.
- **AC-4** Selecting a view pushes history; Back and Forward walk the views and re-render correctly.
- **AC-5** The Insider, Institutional and 13D/G views render byte-for-byte what they render on
  `master` at the same viewport (their renderers are untouched).

### Overview

- **AC-6** §01 renders a numbered heading (`01 Identity & structure`) and a Registrant profile card
  in which **every displayed field carries a real, resolved value**. No field renders `0`, `—`,
  `null`, `undefined`, or a placeholder string where a value failed to resolve — such a field is
  absent from the card.
- **AC-7** The Consolidated subsidiaries block renders its column heads and empty state and contains
  **zero data rows**. No entity name, jurisdiction, ownership %, subsidiary count or offshore
  percentage appears. Its copy names EX-21 as an untagged filed exhibit and says plainly that it is
  outside our structured coverage.
- **AC-8** §02's Condensed statements card shows the three statement tabs and up to four period
  columns; switching tabs re-renders without a page load. The balance-sheet tab renders through
  `ClearyFi.balanceMatrix`. A period with no mapped line for a row shows the N/A treatment, **never
  `0`**.
- **AC-9** The Financial snapshot renders **one merged surface** covering the metrics the six
  `CATEGORIES` name — the separate "At a glance" band and the separate metric-card grid are both
  gone. Tiles are grouped under their category headings.
- **AC-10** Every snapshot tile carries the metric's **status glyph** and **basis label** (TTM /
  as-of). A metric whose status is N/A or N/M renders drained with its status, **never as `0` and
  never omitted silently**.
- **AC-11** Clicking a tile opens its drawer in place, containing that metric's chart and a "How
  this is computed" panel with the formula, the basis, and — for any APPROX/N/A/N/M — the specific
  reason string from `MetricValue.reason`. Closing it restores the grid.
- **AC-12** Where peer data exists, the tile or its drawer still shows the peer position **and** the
  standing honesty note that a percentile is position among peers, not a good/bad verdict.
- **AC-13** A tile's compare action navigates to Financial history with that metric selected.
- **AC-14** The "On this page" rail lists the snapshot's category groups and scroll-spy highlights
  the group nearest the top of the viewport.

### Financial history

- **AC-15** The metric picker renders every metric grouped by category. Clicking a metric charts it;
  clicking a second and third **overlays** them; a fourth is refused with the prototype's message
  ("Three metrics is the maximum — deselect one to add another"), not silently ignored.
- **AC-16** The legend shows one entry per series with its latest value and a working remove control.
- **AC-17** Range tabs offer **8 quarters · 20 quarters · 5 fiscal years**; changing range re-fetches
  or re-slices and re-renders the chart.
- **AC-18** A period with no computable value is a **gap in the line — the line breaks and is never
  interpolated across it** (`STYLE_GUIDE` §7 requirement, not a style choice), and the footer states
  *"N of M periods disclosed"* with the real counts.
- **AC-19** Overlaying series with different units surfaces the mixed-units warning ("read shape, not
  level"). Same-unit overlays do not show it.
- **AC-20** The full statement tables, the source-tag audit column, the raw-JSON toggle, the segments
  spike and the income/balance/cash-flow viz charts are all present and functional in this view.
  **QA must exercise each against `master` to confirm nothing was dropped in the move.**
- **AC-21** Charts are authored at their measured container width (`measuredWidth()`), not a default.
  The content column is ~854px at a 1280px viewport because the Views rail sits beside it
  (`STYLE_GUIDE` §12.6); no axis or series label is clipped or overlapping at that width.

### Honesty (the brand — enforced, not assumed)

- **AC-22** **No as-filed / as-restated toggle exists anywhere in either view.** Financial history
  states the basis in prose/provenance: every series is **as-restated**, one labeled basis per
  series (`DATA_MODEL` R9), and the copy does not claim or imply a point-in-time as-filed series is
  available. The prototype's two basis-tab controls are deliberately **not ported**.
- **AC-23** No missing value renders as `0` anywhere in either view — grid, drawer, statement cell,
  chart point or sparkline.
- **AC-24** Every derived figure carries its status and reaches its provenance (formula · basis ·
  why-flag) without leaving the page.
- **AC-25** The standing disclosures still render on both views (`financials_floor`, `not_advice`).
- **AC-26** Nothing on either view is sourced from the prototype's synthetic figures. **No prototype
  number appears in product code, copy, or a test fixture** (`ROADMAP_APP_V3` §7).

### Regression net

- **AC-27** `pytest` passes in Docker.
- **AC-28** The headless e2e check is **no worse than the `master` baseline**, which must be
  **captured on `master` before any code is written** so this is measured, not asserted. Known
  baseline: pre-existing CIK-900001 502s on the synthetic fixture (`sectorapp-company` ~8 errors,
  `sectorapp-company-refocus` 12–14, count drifts run to run). Two harness traps: **the compose exit
  code is unreliable when piped**, and a shot that *throws* prints `FAILED` rather than `errors=N` —
  **grep for both**, or a broken shot vanishes from a filtered log.
- **AC-29** A new headless shot exists for each of the two new views (`ROADMAP_APP_V3` §7).
- **AC-30** No console error on either view at the default viewport for a real ticker.

---

## Risks / open decisions

1. **The Registrant profile's resolvable field set — the one place P4 may need backend work.**
   `_active.md` assumed P4 is frontend-only unless D4 shipped; that assumption is now in doubt. Of
   the prototype's ten identity fields, only CIK is on the page today. SIC lives in
   `company_profiles` but no endpoint serves a company's own SIC directly (`/peers` returns a
   `group_label` per metric, when ranks exist); state of incorporation, headquarters and NAICS come
   from the submissions JSON we fetch but do not store; auditor, employees and filer status *may* be
   tagged `dei` facts we already ingest (`dei:AuditorName`, `dei:EntityFilerCategory`) — **verify
   against real stored facts, do not assume.** Fiscal year-end and first-period-on-record are
   derivable from `/periods` today. **Architect decides:** ship only what existing endpoints already
   return, or add a thin read-only profile endpoint. Either is acceptable; a fabricated or
   permanently-blank field is not.
2. **The four-period Condensed statements card is a multi-period read the API does not serve in one
   call.** `/statements/{statement}` is single-period; the `viz-series` endpoints return
   purpose-built viz shapes, not a generic condensed statement. Architect chooses N parallel
   single-period calls or a new endpoint, and states the choice.
3. **Losing shipped Statements functionality in the move** is the highest-consequence failure mode
   here and the reason AC-20 demands a side-by-side check against `master` rather than a code read.
4. **Page weight.** Overview now carries identity + condensed statements + ~28 metric tiles, each
   with a sparkline. Sparklines must not become ~28 blocking history requests on first paint —
   lazy/batched loading is an architecture call, but a slow first paint on the product's most-linked
   page is a real regression and QA should time it.
5. **The prototype's own copy is better than ours** — where it states a limitation, carry it
   **verbatim** into `provenance()` rather than paraphrasing (D3, `ROADMAP_APP_V3` §2).
6. **`?trend=<metric>` has two plausible new homes.** Pick one, document it, keep the URL working.
7. **Operator is available for design questions mid-build** ("ask me more later if need",
   2026-07-27) — specifically around statement presentation and where `balanceMatrix` applies.

### Decisions already taken by the operator (2026-07-27) — do not reopen

- **D4 → state the basis, ship no selector.** `STYLE_GUIDE` §8.1's standing rule holds: a toggle
  returning identical data on both settings fabricates precision. `as-originally-reported` remains
  unbuilt and unshipped; whether it ever becomes a capability stays a future operator call. The
  operator's "it should match the prototype" note is read as *the view's layout matches the
  prototype apart from the two basis controls, which we cannot honestly ship* — if that reading is
  wrong, it surfaces at the 4b gate.
- **Overview scope → Track-1 sections plus the EX-21 placeholder only.** Sections 03–08 are not
  rendered.
- **Statements → all of it into Financial history**, using the structured table that exists, styled
  to the prototype; balance sheet via `balanceMatrix`.
- **The metric grid → merged into the Financial snapshot**, adopting the prototype's snapshot design
  and function.

---

## Scope gate

**Not fired.** Every shipped surface reads XBRL companyfacts and the metric layer we already
compute. The one Track-2 surface in the phase (EX-21) is flagged and placeheld exactly as guardrail 1
requires, and prototype sections needing un-ingested sources are excluded rather than faked.

---

## Handoff → Principal Architect

Design against the criteria above. The four things to settle first:

1. **Route/alias layer** — `hub`/`history` slugs plus explicit legacy aliasing in `shell.js`'s
   `VIEWS.companies` and `company.js`'s `route()`/`applyTabFromUrl()`, so no legacy URL falls
   through `resolveView()`'s unknown-slug default (AC-3).
2. **Backend or not** — resolve open decisions 1 and 2 and **record the answer explicitly**, as P2
   did. If it is frontend-only, say so; if a thin profile or condensed-statement endpoint is
   warranted, that makes P4 full-stack and the run goes backend-first.
3. **The Financial snapshot tile + drawer component** — the largest single piece of new UI. It must
   carry status, basis, provenance and peer position through a visual redesign. Check
   `docs/BUILDER_INVENTORY.md` before writing any chart: V3-P1 established that several prototype
   builders already exist in honest form, and rebuilding one is a regression.
4. **Sparkline/history fetch strategy** for ~28 tiles (open decision 4).

Read `prototype.dc.html` before writing any CSS. Both of V3-P1's fix cycles were design-fidelity
guesses; V3-P2 had none, because it opened the prototype first.

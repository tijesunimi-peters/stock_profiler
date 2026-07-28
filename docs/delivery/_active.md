# Active delivery task
task_slug: v3-p4-company-recut
request: V3-P4 — Company re-cut, per `docs/ROADMAP_APP_V3.md` §6. The company hub's **Fundamentals + Statements** tabs become the prototype's two views: **Overview** and **Financial history**. This is the FIRST content re-cut on the unified shell V3-P2 landed, and it changes the reference page (`STYLE_GUIDE` §11 calls `/company/{symbol}` "the parent" of every data page). Track-1 half only — the EX-21 subsidiary/jurisdiction structure block is an exhibit, not tagged XBRL, so it stays an honest placeholder (Track 2: flag, don't build). Resolves **D4** in the UI: decide whether an as-filed/as-restated control ships at all, under the standing rule that a toggle must not appear until a real point-in-time compute path exists behind it.
branch: v3-p4-company-recut
next_stage: done
qa_cycles: 4
updated: 2026-07-28

## Progress
- [x] 1 Product Manager       -> 1-brief.md
- [x] 2 Principal Architect   -> 2-architecture.md
- [x] 3 Backend  ✅ DONE — 2 read-only endpoints, 572 pytest green, driven-verified -> 3-implementation.md
- [x] 3 Frontend ✅ DONE — re-cut shipped; 42 e2e shots, 0 threw, no new errors; 6 visual defects found by eyeballing + fixed
- [x] 4 QA Tester ✅ PASS 30/30 · **4 cycles** — 18 operator findings + 4 QA-found defects, all fixed + re-verified. Cycles 3-4 were operator-approved SCOPE ADDITIONS (comparison tray, right rail), not repeat failures -> 4-qa.md
- [x] 4b Operator manual verification ✅ **CONFIRMED 2026-07-28** (5 rounds) -> 4b-manual-verification.md
      (r1: 13 defects · r2: 3 + the 73-tick smear · r3: the comparison tray + a dead hand-off — all fixed. Round 4 = final re-check.
       r4: the right rail — escalated at the cap as a scoping call; operator chose 'build it now as a placeholder'. Round 5 = final re-check.)

## Notes / open loops

### Operator decisions taken at the PM stage (2026-07-27) — LOCKED, do not reopen
1. **D4 → state the basis, ship NO selector.** `STYLE_GUIDE` §8.1's rule holds; the prototype's two
   basis tabs are deliberately not ported. Operator note "it should match the prototype" is read as
   *layout matches apart from the basis controls*; that reading surfaces at 4b.
2. **Overview scope → Track-1 sections + the EX-21 placeholder ONLY.** Prototype sections 03–08
   (Segments & geography, Capital & ownership, Governance, Accounting quality, Obligations,
   Disclosure change) are **not rendered at all**, not even as placeholders — every one needs a
   source we do not ingest.
3. **Statements → all of it into Financial history**, using the structured table that exists, styled
   to the prototype. **Balance sheet renders via `ClearyFi.balanceMatrix`** (operator instruction).
4. **The ~28-card metric grid + the 5-tile "At a glance" band → MERGED into one "Financial snapshot"
   block** in Overview §02, adopting the prototype's snapshot **design and function**
   (`prototype.dc.html:964–1010`): tile = label · value · 8-period sparkline · YoY · compare action;
   click opens a drawer with the metric's chart + "How this is computed". Status glyph, basis label
   and peer position must survive the redesign.
5. **Operator is available for design questions mid-build** ("ask me more later if need") —
   specifically statement presentation and where `balanceMatrix` applies.

### ⚠️ The rule that protected V3-P2 is GONE for this phase
P2 could claim "any regression is unambiguously the shell's" because it changed no content, and QA
proved it with a side-by-side content-parity harness against `master`. **P4 changes content by
definition** — that shield does not exist here, and the parity trick does not apply. The brief's
ACs are written to describe the *intended new shape* precisely enough that QA can tell a deliberate
change from a regression.

### Locked inputs — do NOT reopen
- **The prototype's IA is authoritative** (D1). Company views are `hub` (Overview) · `history`
  (Financial history) · `inst` (Institutional) · `company` (Peer-relative) —
  `prototype.dc.html:7388`. **P4 delivers the first two; P5 delivers the other two.**
- **Read `docs/design/sector-app-prototype-v3/prototype.dc.html` FIRST** for any "match the design"
  work. Both of V3-P1's fix cycles were design-fidelity guesses; V3-P2 had none, because it opened
  the prototype before writing CSS. Keep doing that.
- **Track 2 stays flagged, not built.** EX-21 structure: honest placeholder layout, real structure,
  never a fabricated cell.

### ✅ ARCHITECT RESOLVED all four (2026-07-27) — `2-architecture.md`. **P4 IS FULL-STACK.**
The `_active.md` assumption "frontend-only unless D4 ships" is **superseded**. Evidence, probed
live against the 1.15M-fact volume — do not re-derive:
1. **companyfacts is NUMERIC-ONLY.** `dei:AuditorName`, `EntityFilerCategory`,
   `EntityIncorporationStateCountryCode`, NAICS, HQ are **text** facts → structurally absent from
   our store, not an ingest gap. `EntityNumberOfEmployees` appears **7 times in the whole DB**.
   Five prototype identity fields are therefore **omitted** (AC-6), not placeheld.
   **`company_profiles` HAS `name` + `sic` + `sic_description` for 8,917 ciks** (AAPL = 3571
   "Electronic Computers", "Apple Inc.") but **no endpoint serves it** → **new `GET
   /companies/{symbol}/profile`** (~30 lines; repo + dependency already exist, `routes.py:1195`).
2. **4-period condensed statements → new `GET /companies/{symbol}/statements/{s}/condensed`**
   (`limit` default 4). Four client calls = four full-history facts reads per card. Mirrors
   `get_capital_structure_series` (`routes.py:607`). **`null` is never `0`** is its load-bearing rule.
3. **Snapshot tile = a NEW sibling builder in `app.js`; `metricCard` STAYS** (still used by
   `components.html`; P5/P7 may want it). Do not delete it in this branch.
4. **Sparkline = ZERO extra requests.** `/metrics?year&period` **already returns a `trend` array
   per metric** (verified: 30 metrics × intra-year quarterly points w/ status). ⚠️ It is
   **intra-year quarters (≤4 points), NOT the prototype's "trailing 8 quarters"** — label it
   honestly, and render **no sparkline** at <2 points (never a flat line, never a zero baseline).
   The **drawer** lazy-loads `/metrics/{m}/history` on open (today's `loadTrend()` pattern).
5. **Bonus:** `/metrics` returns **30** metrics; `CATEGORIES` lists **26**. `equity_multiplier`,
   `dio`, `dpo`, `ccc` are computed, served and never rendered — add them (AC-15 needs it anyway).
6. **`?trend=<metric>` → opens that metric's snapshot drawer on Overview** (minimal-churn successor
   to today's behaviour; keeps the existing `trend` e2e shot meaningful).
7. ⚠️ **`shell.js` needs a `VIEW_ALIASES` map consulted BEFORE `resolveView()`'s unknown-slug
   fallback** — `{companies: {fundamentals:"hub", statements:"history"}}`. Covers path AND `?tab=`
   in one place. Without it `/company/AAPL/statements` silently renders Overview.
8. ⚠️ **`scripts/headless_check.js:209–212` asserts the OLD slugs** — `company-path-view` must
   become `history`, `company-path-unknown` must become `hub`. These WILL fail if missed.
9. **Guardrail 3 does NOT fire** — no new canonical concept, so `normalize/mapping.py` and
   `docs/DATA_MODEL.md` are untouched.

### ✅ OPERATOR ANSWERED the balance-matrix question (2026-07-27) — supersedes arch §4
> *"Forget the balanceMatrix and match the prototype design, we can decide on where the balance
> matrix should be later."*

Overview §02's condensed-statements card is **uniformly the prototype's multi-period table across
all three tabs** (income · balance · cash flow). `ClearyFi.balanceMatrix` is **NOT** used there;
its eventual home is a later decision. The full statement surface moving into Financial history
still keeps its existing viz charts (AC-20) — unchanged by this.

### Original open decisions handed to the architect (brief §Risks) — all now resolved above
1. **Registrant profile's resolvable field set — the one place P4 may need backend work.** Only CIK
   is on the page today. SIC is in `company_profiles` with no direct endpoint; state of incorp. /
   HQ / NAICS come from submissions JSON we fetch but don't store; auditor / employees / filer
   status *may* be tagged `dei` facts we already ingest — **verify against real stored facts.**
   Fiscal year-end + first period are derivable from `/periods`. Ship only what resolves; omit the
   rest (never a permanent N/A cell). **Record frontend-only vs full-stack explicitly, as P2 did.**
2. **The 4-period Condensed statements card is a multi-period read the API doesn't serve in one
   call** (`/statements/{s}` is single-period; `viz-series` returns purpose-built viz shapes).
   N parallel calls or a new endpoint — architect chooses and states it.
3. **`?trend=<metric>` has two plausible new homes** (snapshot drawer vs explorer). Pick one,
   document it, keep the URL working.
4. **Sparkline fetch strategy for ~28 tiles** — must not become 28 blocking requests on first paint.

### Evidence already gathered — don't re-derive
- **`company.js` is 1,730 lines**, view renderers at `renderFundamentals()` :1091,
  `renderStatements()` :1264, `renderInsider()` :1034, `renderInstitutional()` :570,
  `renderBeneficial()` :493. **P4 touches the first two only — leave the other three alone** (P5's).
- **The view rail is already generic.** `ClearyFiShell.rail({subject, active, onSelect})` plus
  `VIEWS.companies` (`shell.js:77`) drive it. Re-cutting means changing that list and `render()`'s
  dispatch — **not** rebuilding navigation.
- ⚠️ **`shell.js`'s `resolveView()` maps an UNKNOWN slug to the subject's default view.** Left
  alone, `/company/AAPL/statements` silently lands on **Overview** — a wrong page, not an error.
  Legacy slugs need explicit aliasing, not the fallback. V3-P2's AC-20 regression net (every legacy
  URL form driven per-URL in the e2e) still applies and will catch a miss.
- **`CATEGORIES` (`company.js:13`)** is the six-group metric taxonomy — now the grouping for the
  merged Financial snapshot tiles and the "On this page" rail.
- **Prototype line refs:** `hub` view :799–1577 · `history` view :1578–1679 · condensed statements
  :888–962 · financial snapshot tiles + drawer :964–1010 · EX-21 block :862–879 · view list :7388 ·
  `histRangeTabs`/`histBasisTabs` :7962–7969 · history data shape :7975–8006.
- **`docs/BUILDER_INVENTORY.md`** (V3-P1's durable output) answers "does this prototype builder
  already exist?" — **check it before writing any chart**; rebuilding an honest existing builder is
  a regression, which is what rescoped P1.

### Handed forward BY V3-P2 — P4/P5's inheritance
1. **No "Peer set" cell in the company entity control bar.** Deliberately omitted and reasoned in
   `company.js`. **P5 (Peer-relative) is where it earns its place**, likely with a small backend
   addition. Don't quietly re-add it in P4. The same reasoning governs the Registrant profile:
   a field that can never resolve is omitted, not shown as a permanent N/A.
2. **`/company`'s `<h1>` reads "Company hub"** (prototype fidelity per D1), ticker in the meta +
   entity bar. Operator confirmed keeping it 2026-07-27 — don't relitigate.
3. **The content column is ~14% narrower** (854px vs 992px at 1280px) because the Views rail sits
   beside it. **Author every chart at its container width** via `measuredWidth()`, never at a
   default (`STYLE_GUIDE` §12.6).
4. **`/manager/{cik}/{view}` routes deliberately do not exist yet** — manager has one view until P6.

### Flags for the engineer / QA
- **e2e baseline:** the suite reports `HEADLESS CHECK: FAIL` from **pre-existing** CIK-900001 502s
  on the synthetic fixture (2 shots: `sectorapp-company` ~8 errors, `sectorapp-company-refocus`
  12–14 — the count drifts run to run). **Capture the baseline on `master` before writing code** so
  AC-28 is measured, not asserted. Two harness traps: the compose exit code is unreliable when
  piped, and a shot that *throws* prints `FAILED` rather than `errors=N` — **grep both**, or a
  broken shot vanishes from a filtered log instead of showing up as an error.
- **Known pre-existing defect, not yours:** the Institutional tab's "which holders run similar
  portfolios" graph has colliding node labels — verified present on `master` at an identical
  viewport, so it predates the shell work. Fix in P5 (which owns that view) or ticket separately;
  don't let P4 get blamed for it.
- **AC-20 is the highest-consequence check in the phase:** the full statement surface (tables,
  source-tag audit column, raw-JSON toggle, segments spike, viz charts) must arrive in Financial
  history **intact**. Verify side-by-side against `master` by driving it, not by reading the diff.

---

## Parallel track (NOT the active task) — V3-P3, cheap metadata unlock

`ROADMAP_APP_V3` §6 says P3 can run alongside the company phases: it is **backend-only, no UI, and
depends on nothing**. Queued here so it isn't forgotten. Start it with its own `/deliver` in a
separate session and branch, or promote it to active if P4 stalls.

**Request:** Store **8-K item codes + acceptance timestamps** from the `/submissions/` JSON we
already fetch. Turns the shell's "What's moving" feed from a placeholder into a real feed, and
unblocks **P8** (Manager Filing activity / Filing behaviour).

**Evidence already gathered:**
- `filings.recent` is **already parsed**: `sec/insider.py:_recent_filings()` (:49) walks those
  parallel arrays (`form`, `accessionNumber`, `filingDate`, `primaryDocument`) for Forms 3/4/5, and
  `sec/client.py:116` provides `submissions_url()`. `institutional.py` does the same for 13F.
- So the "cheap" claim holds: **no new SEC endpoint, no new fetch, no new dependency** — it reads
  two more sibling arrays from a payload we already pull.
- ⚠️ **Verify before designing:** confirm `items` (8-K item codes) and `acceptanceDateTime` are
  actually present in `filings.recent` for the forms we care about, against a real payload fetched
  with our own compliant User-Agent (generic tools get 403'd by SEC's WAF). The roadmap asserts it;
  treat that as "verify, don't assume", like everything else in `CLAUDE.md`.
- **Guardrail 8 applies:** route it through the single-writer ingest path — parsers never open the
  DB. New storage goes behind a repository interface; no raw SQL in the API.
- ⚠️ **P3 also feeds the Registrant profile question above** (acceptance timestamps / submissions
  metadata). If P3 lands first, revisit P4's open decision 1.

---

## ✅ V3-P4 DONE (2026-07-28) — operator CONFIRMED at 4b

Branch `v3-p4-company-recut` (off `master` @ `02a76c9`), **not committed** — commit is operator-gated.
Trail: `docs/delivery/v3-p4-company-recut/` (`0-e2e-baseline` … `4b-manual-verification`).

**What shipped.** `/company/{symbol}` re-cut from two data-type tabs into two time-horizon views:
**Overview** (`hub`) — identity · condensed 4-year statements · the merged Financial-snapshot tile
grid — and **Financial history** (`history`) — the metric-overlay explorer plus the entire former
Statements surface, moved intact. Full-stack: 2 read-only endpoints (`/profile`,
`/statements/{s}/condensed`), 2 new shared builders (`metricTile`, `metricSeriesChart`), a sticky
comparison tray, and a right-rail Filing-timeline placeholder. ~2,450 lines changed.

**Cost: 4 QA cycles.** Cycles 1–2 were genuine prototype-fidelity misses on my side. **Cycles 3–4
were operator-approved scope ADDITIONS** — the comparison tray (which `1-brief.md` had explicitly
scoped out) and the right rail (V3-P3's data). Recorded so the brief and the build don't silently
disagree.

### Lessons P5 should not repeat
1. **Fidelity work needs the prototype open, per element — not per phase.** I read the prototype
   for layout and still missed the masthead shape, the breadcrumb, the inline section source, the
   tile anatomy, the shaded sparkline and the right rail. Diff the *element list* of a prototype
   section against what you built, not the general look.
2. **Four defects were only ever visible in a screenshot** — beige phantom tiles, a 73-label axis
   smear, a 171px squeezed column, a chart ignoring its container. The exit code was green for
   every one. **Eyeball every shot; the render check does not see layout.**
3. **`selectTab()` early-returns when the view is already active** — any "jump to view X with
   state" hand-off must handle the already-there case or it silently no-ops.
4. **My own QA assertions produced 6 false failures** (digits inside "EX-21"/"10-K"/"Item 1",
   `innerText` of a collapsed `<details>`, a stale selector, a too-short wait). Verify a failing
   assertion before reporting it as a defect.

### Inheritance for V3-P5
- **Three honest placeholders now exist** and must not be quietly filled: Item 1 (Business),
  EX-21 subsidiaries, and the right-rail Filing timeline. Each has real structure and zero
  fabricated cells. The timeline becomes real with **V3-P3**, without moving.
- **The right rail is scoped to `hub` + `history`.** P5 decides what Institutional/Peer-relative
  carry — `renderRightRail()` gates on `state.tab`.
- **`VIEW_ALIASES` in `shell.js` is permanent.** P5 collapsing insider/institutional/beneficial
  into `inst` must add those three slugs to it, or indexed URLs will silently land on Overview.
- **`metricTile` + `metricSeriesChart` are shared builders** in `app.js` with `/components` demos —
  reuse, don't fork. `metricCard` survives for whoever still wants the card form.
- Still open from P2: **no "Peer set" cell** in the entity bar until P5's Peer-relative view earns
  it; the Institutional co-holding label collision is **P5's to fix**.

## Previous task
- **V3-P2 DONE (2026-07-27): operator CONFIRMED at 4b** — all 20 manual checks passed hands-on,
  after **1 QA fix cycle**. Committed `05032df`, **merged to master as `ec079c2`** (not pushed).
  Trail in `docs/delivery/v3-p2-shell-unification/`.
- **✅ No merge trap this time** — P2 is already on `master`, so P4 branches off a master that
  contains it. P0, P1 and P2 each hit this trap; P2 was merged immediately to end the pattern.
- **What P2 shipped:** one shell (`static/shell.js` + `shell.css`) replacing the two that had
  drifted apart; the D2 subject nav; URL-as-state; `/sectors-legacy` decommissioned; `.plot-chart`
  declared once. Net −1,562 lines of product code. **P4–P7 all run on this shell.**
- **QA caught two defects the automation missed** — AC-22 was never implemented, and the entity bar
  contradicted the page's own quarter selector. Both were found by *driving* the app, not by
  reading the diff. Worth repeating into every later phase: the driven and hands-on passes are
  where the real defects surfaced.

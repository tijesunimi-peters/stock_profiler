# Active delivery task
task_slug: v3-p4-company-recut
request: V3-P4 — Company re-cut, per `docs/ROADMAP_APP_V3.md` §6. The company hub's **Fundamentals + Statements** tabs become the prototype's two views: **Overview** and **Financial history**. This is the FIRST content re-cut on the unified shell V3-P2 landed, and it changes the reference page (`STYLE_GUIDE` §11 calls `/company/{symbol}` "the parent" of every data page). Track-1 half only — the EX-21 subsidiary/jurisdiction structure block is an exhibit, not tagged XBRL, so it stays an honest placeholder (Track 2: flag, don't build). Resolves **D4** in the UI: decide whether an as-filed/as-restated control ships at all, under the standing rule that a toggle must not appear until a real point-in-time compute path exists behind it.
branch: not yet branched
next_stage: pm
qa_cycles: 0
updated: 2026-07-27

## Progress
- [ ] 1 Product Manager       -> 1-brief.md
- [ ] 2 Principal Architect   -> 2-architecture.md
- [ ] 3 Backend  (only if D4 resolves to "ship it" — that needs a point-in-time compute path)
- [ ] 3 Frontend -> 3-implementation.md
- [ ] 4 QA Tester             -> 4-qa.md
- [ ] 4b Operator manual verification -> 4b-manual-verification.md  (REQUIRED — this re-cuts the reference page)

## Notes / open loops

### ⚠️ The rule that protected V3-P2 is GONE for this phase
P2 could claim "any regression is unambiguously the shell's" because it changed no content, and QA
proved it with a side-by-side content-parity harness against `master`. **P4 changes content by
definition** — that shield does not exist here, and the parity trick does not apply. Acceptance
criteria must describe the *intended new shape* precisely enough that QA can tell a deliberate
change from a regression. Budget for that in the brief; it is the main thing that makes this phase
harder than it looks.

### Locked inputs — do NOT reopen
- **The prototype's IA is authoritative** (D1). Company views are `hub` (Overview) · `history`
  (Financial history) · `inst` (Institutional) · `company` (Peer-relative) —
  `prototype.dc.html:7388`. **P4 delivers the first two; P5 delivers the other two.**
- **Read `docs/design/sector-app-prototype-v3/prototype.dc.html` FIRST** for any "match the design"
  work. Both of V3-P1's fix cycles were design-fidelity guesses; V3-P2 had none, because it opened
  the prototype before writing CSS. Keep doing that.
- **Track 2 stays flagged, not built.** EX-21 structure, CAMs, risk-factor text: honest placeholder
  layouts, real structure, never a fabricated cell.

### Evidence already gathered — don't re-derive
- **`company.js` is 1,730 lines**, view renderers at `renderFundamentals()` :1091,
  `renderStatements()` :1264, `renderInsider()` :1034, `renderInstitutional()` :570,
  `renderBeneficial()` :493. **P4 touches the first two only — leave the other three alone** (P5's).
- **The view rail is already generic.** `ClearyFiShell.rail({subject, active, onSelect})` plus
  `VIEWS.companies` in `shell.js` drive it. Re-cutting means changing that list and `render()`'s
  dispatch — **not** rebuilding navigation. Renaming a slug changes the URL, so preserve `?tab=`
  and old-path compatibility in `route()`; V3-P2's AC-20 regression net (every legacy URL form
  driven per-URL in the e2e) still applies and will catch a miss.
- **`CATEGORIES` (`company.js:13`)** is the Fundamentals metric grouping — the natural seam between
  a headline "Overview" and the full grid + statements in "Financial history".
- **D4 is a one-line reality:** `metrics.py:1279` hard-codes `restatement_basis="as-restated"`;
  nothing emits `as-originally-reported`. `STYLE_GUIDE` §8.1 forbids shipping a toggle until a real
  compute path exists — **a toggle returning identical data on both settings fabricates precision**,
  which is the worst failure available here because it looks like rigor. The honest default is
  *state the basis, don't offer a selector*. Shipping it for real is a backend project
  (point-in-time compute across `metrics.py` + `metric_values`) and is the operator's call.

### Handed forward BY V3-P2 — P4/P5's inheritance
1. **No "Peer set" cell in the company entity control bar.** Deliberately omitted and reasoned in
   `company.js`: `/companies/{symbol}/peers` returns `peer_group` *per metric*, is period-scoped,
   carries no `group_label`, and empty is a valid result — there is no page-load-time sector label
   for a company. **P5 (Peer-relative) is where it earns its place**, likely with a small backend
   addition. Don't quietly re-add it in P4 without that.
2. **`/company`'s `<h1>` reads "Company hub"** (prototype fidelity per D1), ticker in the meta +
   entity bar. Operator confirmed keeping it 2026-07-27 — don't relitigate.
3. **The content column is ~14% narrower** (854px vs 992px at 1280px) because the Views rail sits
   beside it. Charts truncate labels accordingly — **author every chart at its container width**
   via `measuredWidth()`, never at a default (`STYLE_GUIDE` §12.6).
4. **`/manager/{cik}/{view}` routes deliberately do not exist yet** — manager has one view until P6.

### Flags for the PM / architect
- **Any backend work?** Only if D4 resolves to "ship the toggle". Otherwise frontend-only. Decide
  at the architecture stage and record it, as P2 did.
- **What actually goes in Overview vs Financial history?** The prototype is the source of truth;
  resist inventing a split. This is the single most likely place for scope to drift.
- **e2e baseline:** the suite reports `HEADLESS CHECK: FAIL` from **pre-existing** CIK-900001 502s
  on the synthetic fixture (2 shots: `sectorapp-company` ~8 errors, `sectorapp-company-refocus`
  12–14 — the count drifts run to run). **Capture the baseline on `master` before starting** so the
  AC is measured, not asserted. Two harness traps: the compose exit code is unreliable when piped,
  and a shot that *throws* prints `FAILED` rather than `errors=N` — **grep both**, or a broken shot
  vanishes from a filtered log instead of showing up as an error.
- **Known pre-existing defect, not yours:** the Institutional tab's "which holders run similar
  portfolios" graph has colliding node labels — verified present on `master` at an identical
  viewport, so it predates the shell work. A `STYLE_GUIDE` §12 label-placement issue in an existing
  builder. Fix in P5 (which owns that view) or ticket separately; don't let P4 get blamed for it.

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

---

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

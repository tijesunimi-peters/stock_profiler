# Active delivery task
task_slug: v3-p5-company-institutional
request: V3-P5 — Company: **Institutional + Peer-relative**, per `docs/ROADMAP_APP_V3.md` §6. Today's three separate views — Insider, Institutional, 13D/G — collapse into ONE **Institutional** view, and **Peer-relative** ports from the sector app. 13F / 13D-G / Forms 3-4-5 blocks are real Track-1 data; N-PX, N-PORT, Form 144 and DEF 14A blocks are placeholder-or-omitted; the prototype's "Beyond the financials" extras (Item 1A/1C/3, CAMs, Item 405, 8-K 4.01/5.02) are **Track 2 — flag, don't build**. Second and final content re-cut of the company hub, on the shell V3-P2 landed and the patterns V3-P4 set.
branch: not yet branched
next_stage: pm
qa_cycles: 0
updated: 2026-07-28

## Progress
- [ ] 1 Product Manager       -> 1-brief.md
- [ ] 2 Principal Architect   -> 2-architecture.md
- [ ] 3 Backend  (only if the architect finds a gap — 12 issuer-centric endpoints already exist)
- [ ] 3 Frontend -> 3-implementation.md
- [ ] 4 QA Tester             -> 4-qa.md
- [ ] 4b Operator manual verification -> 4b-manual-verification.md  (REQUIRED — interactive change)

---

## Notes / open loops

### ⚠️ Read this first: what V3-P4 cost, and why
P4 passed QA 30/30 on automation and still took **4 operator rounds and 22 defects** to accept.
None were data or honesty failures — **almost all were prototype-fidelity misses**. Budget for
fidelity as the main work of this phase, not as polish at the end.

1. **Open the prototype per ELEMENT, not per phase.** P4 read the prototype for layout and still
   missed the masthead shape, the breadcrumb, the inline section source, the tile anatomy, the
   shaded sparkline and the right rail. **Diff the element list of the prototype section against
   what you built**, one line at a time.
2. **Ten defects were visible ONLY in a screenshot** — phantom grid cells, a 73-label axis smear, a
   content column squeezed to 171px, a chart ignoring its container. The e2e exit code was green
   for every one. **Eyeball every shot.**
3. **`selectTab()` early-returns when the view is already active** (`company.js`). Any "jump to
   view X carrying state" hand-off must handle the already-there case or it silently no-ops.
   P4 shipped exactly that bug in the comparison tray.
4. **Verify a failing QA assertion before reporting it.** Six of P4's "failures" were the script's
   fault: digits inside `EX-21` / `10-K` / `Item 1`, `innerText` of a **collapsed** `<details>`,
   a stale selector after a DOM move, and a wait shorter than the page's 2.2s load.
5. **Ask, don't guess, on ambiguous design feedback.** P4's four clarifying questions each
   prevented a wrong cycle; the two items that were guessed at both came back.

### Locked inputs — do NOT reopen
- **The prototype's IA is authoritative** (D1). Company views are `hub` (Overview) · `history`
  (Financial history) · `inst` (Institutional) · `company` (Peer-relative) —
  `prototype.dc.html:7388`. **P4 delivered the first two; P5 delivers the other two.**
- **Read `docs/design/sector-app-prototype-v3/prototype.dc.html` FIRST** for any "match the design"
  work.
- **Track 2 stays flagged, not built** — honest placeholder layouts, real structure, never a
  fabricated cell.
- **D4 stays resolved:** basis is stated, never selectable (`STYLE_GUIDE` §8.1). Don't add a toggle.

### ❓ Decision for the PM/architect: the Peer-relative URL slug
The prototype's state key is `company`, which would make the URL `/company/AAPL/company` — poor.
D1 says routes are **our** serialization ("preserved as addresses, not as separate designs"), so the
slug is ours to choose while the IA stays the prototype's. Recommend `peers` or `peer-relative`.
Decide it in the brief and record it; whatever is chosen, the alias rule below still applies.

### Evidence already gathered — don't re-derive

**Prototype line refs**
- `inst` (Institutional) view: **:1682–2725**. Seven sections: Register snapshot · Register over
  time & holders · Flows & concentration · Ownership & stewardship · Holder behavior · Register
  limits & supply · Reference.
- `company` (Peer-relative) view: **:407–798**, plus its rail block at :235. Blocks: Segment &
  geographic mix · Filing history & flags · Disclosure behavior · Accounting choices · Governance &
  people · Ownership shape · Obligations & structure. Its data builder is `peerExtras()` at
  **:6012** — read it to see which blocks are Track 2 (most of them).
- The view rail / Sections nav pattern: **:247–257**. The right rail: **:3902**.

**Current code (line numbers are POST-P4 — they moved)**
- `company.js` is now **2,524 lines**: `renderBeneficial()` :575 · `beneficialTable()` :602 ·
  `renderInstitutional()` :652 · `renderInstitutionalData()` :689 · `institutionalView()` :781 ·
  `renderInsider()` :1116 · `insiderTable()` :1144. **These three views are what P5 merges.**
- `app.js` is now **4,529 lines** and already carries the institutional chart builders:
  `holdingsSeriesChart`, `activityMixChart`, `activityFlowChart`, `holderGeographyChart`,
  `convictionHeatmap`, `coHoldingNetwork`, `divergingBars`, `dumbbellChart`, `positionCountChart`,
  plus P4's `metricTile` / `metricSeriesChart` and the distribution strip from P1.
  **Check `docs/BUILDER_INVENTORY.md` before writing any chart** — rebuilding an honest existing
  builder is what rescoped V3-P1.

**Backend: 12 issuer-centric endpoints already ship.** P5 is likely **frontend-only** — confirm and
record it explicitly, as P2 and P4 did.
`/companies/{symbol}/` → `insider-trades` · `beneficial-ownership` · `institutional-holders` ·
`institutional-activity` · `institutional-activity-series` · `institutional-periods` ·
`institutional-holdings-series` · `institutional-holder-geography` · `institutional-conviction` ·
`institutional-co-holding` · `peers` · `peers/{metric}/distribution`.

**Not ingested — placeholder or omit, never fake:** N-PX (voting), N-PORT, Form 144, DEF 14A
(beneficial-ownership table, comp, board). These are named in the prototype's Institutional and
Peer-relative views. N-PX is gated to **V3-P9**.

### Inherited from V3-P4 — the patterns to reuse, and the traps
1. ⚠️ **`VIEW_ALIASES` in `shell.js` is permanent and P5 MUST extend it.** Collapsing
   insider/institutional/beneficial into `inst` retires three live slugs. Add all three to
   `VIEW_ALIASES.companies` or `/company/AAPL/insider` will **silently render Overview** — a wrong
   page, not an error, because `resolveView()` sends unknown slugs to the default. The e2e drives
   every legacy URL per-URL; extend that list.
2. **Three honest placeholders exist and must not be quietly filled:** Item 1 (Business), EX-21
   subsidiaries (both on Overview), and the right-rail **Filing timeline**. The timeline becomes
   real with **V3-P3**, without moving.
3. **The right rail is scoped to `hub` + `history`** (`renderRightRail()` gates on `state.tab`).
   P5 decides what its two views carry — the prototype's rail is `inHub`, i.e. all company views.
4. **Reusable patterns P4 established:** `secHead(n, title, source)` (source inline with the
   title) · `viewHeader(label, note)` (the `sector › name › ticker` breadcrumb) · the `.pbtn`
   button · in-card controls instead of a page-level control bar · `metricTile` + drawer ·
   the sticky comparison tray (`state.tray`, persists across views) · Sections nav in the view rail.
5. **The "Peer set" entity-bar cell is still deliberately absent.** V3-P2 omitted it because
   `/peers` returns `peer_group` per metric, is period-scoped and carries no page-load-time label.
   **P5's Peer-relative view is exactly where it earns its place** — likely with a small backend
   addition. This is the one place it may legitimately be added.
6. **Known pre-existing defect that is NOW P5's to fix:** the Institutional "which holders run
   similar portfolios" co-holding graph has colliding node labels (`coHoldingNetwork`). Verified on
   `master` at an identical viewport since before the shell work — `STYLE_GUIDE` §12 label
   placement. P5 owns that view.
7. **Charts author at container width** via `measuredWidth()`, never a default. Content column is
   ~831px at 1280px (~854 without the right rail). Plot's `ticks: N` is **advisory on a `point`
   scale** — hand it an explicit tick list or a long series smears (P4 hit this at 73 labels).

### e2e baseline — recapture before writing code
`master` (post-P4, `94c3c70`) is at **43 shots · 0 threw · exactly 2 with errors**
(`sectorapp-company` 8, `sectorapp-company-refocus` 13–14 — the count drifts run to run; the cause
is pre-existing CIK-900001 502s on the synthetic fixture). **Re-capture on `master` before starting**
so the AC is measured, not asserted; P4's baseline artifact is `v3-p4-company-recut/0-e2e-baseline.md`.
Two harness traps: the compose exit code is unreliable when piped, and a shot that *throws* prints
`FAILED` rather than `errors=N` — **grep both**.

### Flags for the PM
- **Scope is genuinely large**: seven prototype sections in Institutional alone, several needing
  un-ingested sources. The brief's real job is deciding **which blocks are Track-1 real, which are
  honest placeholders, and which are omitted entirely** — the same three-way split P4's operator
  made for Overview's sections 03–08 (omitted, not placeheld).
- **13F honesty is non-negotiable and easy to lose in a re-cut**: a 13F is a quarter-end holdings
  **snapshot**, not transactions. Any buy/sell is **derived by diffing quarters** and must read as
  derived, carrying the long-only / ~45-day-lag caveats (`CLAUDE.md`, `DISCLOSURES.institutional_13f`).
- **Insider Forms 3/4/5 are as-reported**, and Acquired/Disposed is the reported code — never a
  buy/sell judgment. The existing copy gets this right; don't paraphrase it away.
- **13D/G has a structured-XML coverage floor (~mid-2025)** — surface it, don't hide an empty result.

---

## Parallel track (NOT the active task) — V3-P3, cheap metadata unlock

`ROADMAP_APP_V3` §6: P3 is **backend-only, no UI, depends on nothing**, and can run alongside the
company phases. Start it with its own `/deliver` in a separate session and branch, or promote it
here if P5 stalls.

**Request:** Store **8-K item codes + acceptance timestamps** from the `/submissions/` JSON we
already fetch. Turns the shell's "What's moving" feed from a placeholder into a real feed, unblocks
**P8**, and **makes V3-P4's right-rail Filing-timeline placeholder real** without moving it.

**Evidence already gathered:**
- `filings.recent` is **already parsed**: `sec/insider.py:_recent_filings()` (:49) walks those
  parallel arrays (`form`, `accessionNumber`, `filingDate`, `primaryDocument`) filtered to Forms
  3/4/5; `sec/client.py:116` provides `submissions_url()`. `institutional.py` does the same for 13F.
  **Generalizing that filter is most of the work.**
- So the "cheap" claim holds: **no new SEC endpoint, no new fetch, no new dependency**.
- ⚠️ **Verify before designing:** confirm `items` (8-K item codes) and `acceptanceDateTime` are
  actually present in `filings.recent`, against a real payload fetched with our own compliant
  User-Agent (generic tools get 403'd by SEC's WAF). The roadmap asserts it; treat it as
  "verify, don't assume".
- **Guardrail 8:** single-writer ingest path, parsers never open the DB; storage behind a
  repository interface; no raw SQL in the API.

---

## Previous task

### ✅ V3-P4 DONE (2026-07-28) — operator CONFIRMED at 4b, **merged to master**
Commit `50e0c16`, merged as **`94c3c70`** (not pushed — `master` is local-only).
Trail: `docs/delivery/v3-p4-company-recut/`.
**✅ No merge trap:** P5 branches off a `master` that already contains P4. P0, P1 and P2 each hit
that trap; P2 and P4 were merged immediately to end the pattern.

**What P4 shipped.** `/company/{symbol}` re-cut into **Overview** (`hub`) and **Financial history**
(`history`). Full-stack: `GET /companies/{symbol}/profile` and
`GET /companies/{symbol}/statements/{s}/condensed`; `ClearyFi.metricTile` and
`ClearyFi.metricSeriesChart`; a sticky comparison tray; a right-rail Filing-timeline placeholder;
`VIEW_ALIASES`; and `equity_multiplier`/`dio`/`dpo`/`ccc` surfaced after being computed-but-invisible.
~4,370 lines. Verified on `master` after merge: **pytest 572 · e2e 43 shots, 0 threw, 2 pre-existing**.

**Discoveries P5 inherits as fact, not assumption:**
- **companyfacts carries NUMERIC facts only.** `dei:AuditorName`, `EntityFilerCategory`,
  `EntityIncorporationStateCountryCode`, NAICS and HQ are **text** facts → structurally absent from
  our store. `EntityNumberOfEmployees` exists **7 times in the whole DB**. Don't plan a surface
  around them.
- **`company_profiles` has `name` + `sic` + `sic_description` for 8,917 CIKs**, now served by
  `/companies/{symbol}/profile`.
- **`/metrics` returns a per-metric `trend` array** (intra-year quarters, ≤4 points) — free
  sparkline data, but it is **NOT year-over-year**; P4 labels it `· 4 quarters` for that reason.

### ✅ V3-P2 DONE (2026-07-27) — merged as `ec079c2`
One shell (`static/shell.js` + `shell.css`), the D2 subject nav, URL-as-state,
`/sectors-legacy` decommissioned. **P4–P7 all run on this shell.**

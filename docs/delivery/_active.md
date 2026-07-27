# Active delivery task
task_slug: v3-p2-shell-unification
request: V3-P2 — Shell unification, the keystone phase of the v3 programme, per `docs/ROADMAP_APP_V3.md` §2 (D1 absorb, D2 subject nav) and §6. Four parts, one branch, one regression pass. (a) **Promote `sectorapp.js`/`sectorapp.css` to THE product shell** and retire `script.js`'s sidebar/topbar into it, so there is one shell and one navigation implementation instead of two. (b) **Make the unified shell load `app.css`/`app.js`** (the sector app currently declines `app.css`) and resolve the stylesheet overlap — `.plot-chart` is declared in FOUR files (`app.css`, `company.css`, `sectorapp.css`, `sectors.css`) and V3-P1 added a fifth scoped block plus a `.dist-strip-*` re-declaration. (c) Ship the locked **D2 subject nav**: seven subjects, three live (Companies → `/company/{symbol}`, Sectors → `/sectors`, Managers → `/manager/{cik}`), four rendered **planned-and-inert** (People, Auditors, Funds, Events — `--mono-muted`, `cursor: default`, NO href and NO click handler, self-explaining `title`), with subject-scoped actions (Compare · Screen · Coverage) that render planned-with-description where not built. (d) **URL-as-state**: every route serves the one app with selection derived from the path (`/company/{symbol}[/{view}]`, `/manager/{cik}[/{view}]`, `/sectors/{group}[/{view}]`, `/compare/{sectors|companies}`), absorbing the two known open items (URL doesn't reflect the active view; focal selector not scoped to the selected sector). **Re-home `/company`, `/manager`, `/compare`, `/screen`, `/coverage` with their CURRENT CONTENT AND TABS COMPLETELY UNCHANGED** — no view re-cutting in this branch.
branch: v3-p2-shell-unification
next_stage: done
qa_cycles: 1
updated: 2026-07-27

## Progress
- [x] 1 Product Manager       -> 1-brief.md  (26 acceptance criteria; 4 operator forks resolved)
- [x] 2 Principal Architect   -> 2-architecture.md  (extract to shell.js/shell.css; backend-first)
- [x] 3 Backend  -> DONE: 3 static view routes + /sectors-legacy deleted; 554 pytest pass
- [x] 3 Frontend -> DONE: shell.js/shell.css; 5 bugs fixed; 554 pytest pass; e2e at baseline
- [x] 4 QA Tester -> 4-qa.md: round 1 FAIL (2 defects) -> fixed -> round 2 PASS, all 26 ACs
- [x] 4b Operator manual verification -> CONFIRMED 2026-07-27, all 20 checks passed hands-on

## Notes / open loops

### ✅ V3-P2 DONE — operator CONFIRMED at 4b (2026-07-27)
All 20 manual checks passed on a hands-on run (walked interactively in 5 batches). Branch
`v3-p2-shell-unification` is **committed? NO — not yet committed; operator-gated.**
Operator settled the one judgement call: `/company` keeps the prototype's "Company hub" h1.

**P4-P7 are now unblocked** — they all run on this shell.

### QA round 2 PASSED (2026-07-27)
All 26 ACs pass on driven evidence. pytest 554 passed; e2e sits exactly on its pre-existing baseline
(2 synthetic-CIK-900001 502 shots). Content parity vs master proven per view with a side-by-side
harness. **Two items to put in front of the operator:** (1) `/company`'s content column is 14%
narrower (854 vs 992px) because the Views rail sits beside it — values identical, some chart labels
truncate differently; (2) `/company`'s h1 now reads "Company hub" not the ticker (prototype fidelity
per D1) — SEO trade-off, trivially reversible.
**Not ours, worth a ticket:** the "similar portfolios" graph has colliding node labels — verified
present on master at an identical viewport (STYLE_GUIDE §12 issue in an existing builder).

### 🔴 QA round 1 FAILED (2026-07-27) — back to frontend, cycle 1 [RESOLVED]
- **D1 (blocking): AC-22 / brief scope item 8 was never implemented.** `focalPeerList()`
  (`sectorapp.js:1314`) scopes to `state.focalGroup` (the focal company's SIC group), NOT to
  `selectedGroup()` (the sector chosen in the control bar). Repro: `/sectors?view=company&symbol=320193`
  -> control bar "Business Services" while the selector lists 11 SIC-35 filers.
- **D2 (minor): entity bar contradicts the page.** `/company/AAPL/institutional` shows `PERIOD —`
  while the page's own control shows `QUARTER (13F) Mar 31, 2026`. `state.instValue` resolves after
  render() paints the bar and nothing repaints it. Honest (never 0) but breaks "one fact, one source".
- Everything else passed on driven evidence, incl. content parity vs master.
- **Both FIXED and re-verified in round 2.** D1's fix establishes an invariant (focalGroup ===
  selectedGroup(), kept in step by syncSectorToGroup + resolveFocalInGroup) rather than patching
  the symptom; a sector with no company metrics now renders an honest empty state instead of
  silently falling through to another sector's filers.

### ⚠️ The one rule this phase must not break
**Re-home pages WITHOUT changing their content.** Shell migration and content re-cut never share a
branch (`ROADMAP_APP_V3.md` §7). If a review starts debating which tabs the company hub should have,
that belongs to V3-P4. The whole risk-containment argument for D1 rests on this: if the shell move
is content-neutral, any regression is unambiguously the shell's.

### Why this is the riskiest phase in the programme
`/company/{symbol}` is the **reference implementation** — STYLE_GUIDE §11 names it "the parent" of
every data page, and it's the most-linked page we have. This phase rewrites the shell under it.
Everything after P2 (P4–P7) runs on the unified shell, so **nothing downstream can start until this
lands**. Only V3-P3 (ingest metadata) is independent.

### Evidence already gathered — don't re-derive
- **The two sidebars are entirely separate implementations sharing no code.**
  `sector-analytics.html` does **not** load `script.js`; `sectorapp.js:293` has its own
  `sidebarHtml()` building `<aside class="pa-side">`, while `script.js:23` has a `GROUPS` array
  filling `#appSide`. Two sources of truth for one navigation.
- **They have already drifted**, visibly: the shared shell has a nested *Overview → Sectors →
  Overview* group, `data-shell`-driven `.current` highlighting, an off-canvas drawer below 1024px,
  a mark+wordmark logo and "API Reference ↗". The sector app flattens Sectors into a fifth Data
  item, **hard-codes it active** (`var active = n[1] === "/sectors"` — it can never highlight
  anything else), has no drawer, brands as `ClearyFi` + `SEC data`, and says "API reference".
- **`.plot-chart` is declared in FOUR stylesheets** — `app.css`, `company.css`, `sectorapp.css`,
  `sectors.css`. The roadmap says "the two stylesheets' overlap"; it is four, plus what P1 added.
- **V3-P1 added one more instance deliberately and temporarily:** `.pa-dp-host .plot-chart*` and
  `.pa-dp-host .dist-strip-*` are re-declared in `sectorapp.css` purely because that page can't see
  `app.css`. **Both blocks should disappear in this phase** — they are the canary for (b) being done.
- **`sectorapp.js` builds HTML strings**, then post-render `mount*()` passes append DOM nodes
  (`mountDistribution` at :1176, `mountCompanyDots` from P1). Any shell work must preserve that
  two-phase render, or every chart in the sector app stops mounting.

### Locked inputs — do NOT reopen
- **D1 = absorb.** The prototype's IA is authoritative. One app, one shell, one state model. Routes
  survive as addresses: `/company/AAPL` serves the same app with `subject=companies · view=hub ·
  focal=AAPL` derived from the path. Nothing redirects into `/sectors`.
- **D2 = the nav as the prototype draws it**, all seven subjects, four planned-and-inert. Justified
  in `STYLE_GUIDE.md` §10.1 (a planned-and-inert label is not a placeholder link).
- **Marketing/legal pages stay outside** the app shell (`/`, `/guide`, `/methodology`, `/privacy`,
  `/terms`, `/disclaimer`) — they keep the static `.nav`.

### The lesson V3-P1 paid for — apply it here
Both of P1's fix cycles were **design fidelity, not logic**: an unrequested restyle, then two wrong
guesses at what the operator meant before opening the prototype. **For any "match the design" work,
read `docs/design/sector-app-prototype-v3/prototype.dc.html` FIRST** — it is in the repo, it is the
source of truth, and it is cheaper than a round-trip. The prototype's shell is the target here:
subject nav → entity control bar → view rail → 960px content column → sticky 262px right rail
(appears ≥1240px), fixed 210px left sidebar.

### Flags for the PM / architect
- **Is any backend work needed?** URL-as-state may need new/changed FastAPI routes
  (`/sectors/{group}`, `/company/{symbol}/{view}`, `/compare/{sectors|companies}` + a `/compare`
  redirect). Decide at the architecture stage whether that's a backend sub-stage or just
  `main.py` route additions the frontend engineer can own.
- **`/screen` and `/coverage`** also load the shared shell. They are in scope for re-homing even
  though the prototype says little about them — don't leave two shells alive by forgetting them.
- **`/sectors-legacy`** (superseded `sectors.html` + `sectors.css`) is dead weight that still
  declares `.plot-chart`. Consider decommissioning it here rather than migrating it — operator call.
- **e2e baseline:** the suite reports `HEADLESS CHECK: FAIL` overall due to **pre-existing**
  Company-view 502s on synthetic CIK 900001 in the offline sandbox (confirmed in three QA records
  now). Expect that; a shell change touching every page must not add to it.

### Operator decisions taken at the PM stage (2026-07-26) — do NOT reopen
1. **Shell reach = FULL PROTOTYPE FRAME.** Not just sidebar+topbar: `/company`'s tab strip becomes
   the prototype's vertical view rail, and `/company` + `/manager` gain an entity control bar.
   Operator picked this over the narrower "outer chrome only" option after being shown that it
   weakens the "any regression is unambiguously the shell's" containment argument. Recorded as
   risk R1 in `1-brief.md`; view-set/content parity is now tested explicitly (AC-15/16/18) rather
   than assumed.
2. **Actions are genuinely subject-scoped.** Companies → Compare/Screen/Coverage all live.
   Sectors → Compare live, Screen + Coverage planned-and-inert. Managers → all three planned.
3. **`/sectors-legacy` is DECOMMISSIONED in this branch** — route, `sectors.html`, `sectors.css`,
   `sectors.js`, its headless shot and `tests/test_static_pages.py:160` all deleted.
4. **`/compare/{sectors|companies}` rename DEFERRED to V3-P7** (roadmap §6 wins over the request
   text). `/compare` is re-homed unchanged at its current path.

### Previous task
- **V3-P1 DONE (2026-07-26): operator CONFIRMED at 4b after 2 fix cycles.**
  ✅ **Merged into master as `bae78cb`** — the merge trap below is RESOLVED; P2 branches off a
  master that already contains P1. Trail in `docs/delivery/v3-p1-chart-foundry/`.

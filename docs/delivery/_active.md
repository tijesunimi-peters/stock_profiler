# Active delivery task
task_slug: v3-p2-shell-unification
request: V3-P2 — Shell unification, the keystone phase of the v3 programme, per `docs/ROADMAP_APP_V3.md` §2 (D1 absorb, D2 subject nav) and §6. Four parts, one branch, one regression pass. (a) **Promote `sectorapp.js`/`sectorapp.css` to THE product shell** and retire `script.js`'s sidebar/topbar into it, so there is one shell and one navigation implementation instead of two. (b) **Make the unified shell load `app.css`/`app.js`** (the sector app currently declines `app.css`) and resolve the stylesheet overlap — `.plot-chart` is declared in FOUR files (`app.css`, `company.css`, `sectorapp.css`, `sectors.css`) and V3-P1 added a fifth scoped block plus a `.dist-strip-*` re-declaration. (c) Ship the locked **D2 subject nav**: seven subjects, three live (Companies → `/company/{symbol}`, Sectors → `/sectors`, Managers → `/manager/{cik}`), four rendered **planned-and-inert** (People, Auditors, Funds, Events — `--mono-muted`, `cursor: default`, NO href and NO click handler, self-explaining `title`), with subject-scoped actions (Compare · Screen · Coverage) that render planned-with-description where not built. (d) **URL-as-state**: every route serves the one app with selection derived from the path (`/company/{symbol}[/{view}]`, `/manager/{cik}[/{view}]`, `/sectors/{group}[/{view}]`, `/compare/{sectors|companies}`), absorbing the two known open items (URL doesn't reflect the active view; focal selector not scoped to the selected sector). **Re-home `/company`, `/manager`, `/compare`, `/screen`, `/coverage` with their CURRENT CONTENT AND TABS COMPLETELY UNCHANGED** — no view re-cutting in this branch.
branch: not yet branched
next_stage: pm
qa_cycles: 0
updated: 2026-07-26

## Progress
- [ ] 1 Product Manager       -> 1-brief.md
- [ ] 2 Principal Architect   -> 2-architecture.md
- [ ] 3 Backend  (likely N/A — frontend + possibly a few FastAPI route paths for URL-as-state)
- [ ] 3 Frontend -> 3-implementation.md
- [ ] 4 QA Tester             -> 4-qa.md
- [ ] 4b Operator manual verification -> 4b-manual-verification.md  (REQUIRED — navigation is interactive, and this touches EVERY page)

## Notes / open loops

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

### Previous task
- **V3-P1 DONE (2026-07-26): operator CONFIRMED at 4b after 2 fix cycles**, committed `f69ffda` on
  branch `v3-p1-chart-foundry` (**unmerged**). Trail in `docs/delivery/v3-p1-chart-foundry/`.
- **⚠️ MERGE `v3-p1-chart-foundry` INTO MASTER BEFORE BRANCHING P2.** P2 edits `app.css`,
  `sectorapp.css`, `sectorapp.js` and `script.js` — the same files P1 changed. Branching off master
  without merging first will lose P1's work or conflict later. (Same trap P0 and P1 both hit.)

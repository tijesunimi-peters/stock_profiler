# 1 — Product brief: V3-P2, shell unification

**Task:** `v3-p2-shell-unification` · **Stage 1 (Product Manager)** · 2026-07-26
**Source:** `docs/ROADMAP_APP_V3.md` §2 (D1 absorb, D2 subject nav) + §6 · `STYLE_GUIDE.md` §4.2, §5, §10.1
**Prototype (source of truth for layout):** `docs/design/sector-app-prototype-v3/prototype.dc.html` lines 36–70 (the shell) and 7325–7370 (the nav model)

**Scope gate: PASSED.** Track 1 only. No free-text, no LLM, no new data source, no new base
dependency, no change to SEC compliance. This phase moves and merges existing UI chrome.

---

## Problem / user

**The product has two navigations and neither knows about the other.**

`sector-analytics.html` does not load `script.js`. `sectorapp.js:293` builds its own
`<aside class="pa-side">`; `script.js:23` builds a different sidebar from a `GROUPS` array into
`#appSide`. Two source-of-truth implementations sharing no code — and they have already drifted in
seven visible ways:

| | Shared shell (`script.js`) | Sector app (`sectorapp.js`) |
|---|---|---|
| Sectors in the nav | nested *Overview → Sectors → Overview* group | flattened to a fifth "Data" item |
| Active highlighting | `data-shell` → `.current` + `aria-current` | **hard-coded** `n[1] === "/sectors"` — can never highlight anything else |
| Below 1024px | off-canvas drawer + hamburger + Escape-to-close | **no drawer at all** |
| Brand | mark + wordmark, links to `/` | text `ClearyFi` + `SEC data`, **not a link** |
| API link | "API Reference" pill | "API reference ↗" |
| Search | `⌘K` / `Ctrl-K` / `/` + `suggest.js` autocomplete | `⌘K` label rendered, wiring separate |
| Component layer | loads `app.css` + `app.js` | loads `app.js`, **declines `app.css`** |

That last row is the expensive one. Because the sector app cannot see `app.css`, V3-P1 had to
**re-declare** `.plot-chart*` and `.dist-strip-*` under `.pa-dp-host` in `sectorapp.css` — with an
in-code comment saying *"V3-P2 removes this duplication when the shells merge."* `.plot-chart` is
now declared in **four stylesheets** (`app.css`, `company.css`, `sectorapp.css`, `sectors.css`)
plus P1's scoped block. Every future chart phase pays this tax again.

**Users:** (1) anyone navigating the product, who currently gets a different sidebar, a different
brand, and a different mobile behaviour depending on which page they landed on; (2) every engineer
on V3-P4…P7, none of which can start until one shell exists.

---

## Scope

Eight items, one branch, one regression pass.

### 1. One shell (D1 absorb)
`sectorapp.js` / `sectorapp.css` become **the** product shell. `script.js`'s `#appSide` /
`#appTopbar` renderer is **retired into it** — deleted, not left dormant. `script.js` keeps only
the marketing/prose `.nav` hamburger (its second half, lines 151–167).

The shell is the prototype's: **210px fixed sidebar** (brand → `Subjects` → `Actions · {subject}` →
`Reference` → "Data, not investment advice." foot) + **sticky topbar** (search, `API reference ↗`).

Pages carrying the shell: `/company/{symbol}`, `/manager/{cik}`, `/compare`, `/screen`,
`/coverage`, `/sectors`, `/components`. Marketing/legal (`/`, `/guide`, `/methodology`, `/privacy`,
`/terms`, `/disclaimer`) **stay outside** on the static `.nav` — unchanged by this branch.

### 2. The component layer loads everywhere
Every shell page loads `app.css` **and** `app.js`. `sector-analytics.html` gains `app.css`.

### 3. Stylesheet overlap resolved
`.plot-chart` and its `-title` / `-body` / `-caption` / `-note` children are declared **once**, in
`app.css`. Page stylesheets keep only *scoped positional overrides* (e.g. `.stmt-chart-cell
.plot-chart { margin: 0 }`) — never a re-declaration of the base rule. The two P1 canary blocks in
`sectorapp.css` (`.pa-dp-host .plot-chart*` at :330–335, `.pa-dp-host .dist-strip-*` at :338–344)
are **deleted**; their disappearance is the proof that item 2 actually landed.

### 4. The D2 subject nav
Seven subjects, exactly as the prototype draws them (`prototype.dc.html:7334–7340`):

| Subject | State | Destination / `title` |
|---|---|---|
| **Companies** | live | `/company/{symbol}` |
| **Sectors** | live | `/sectors` |
| **Managers** | live | `/manager/{cik}` |
| People | planned-and-inert | "Directors and officers as entities — board interlocks, Section 16 history, 8-K 5.02 moves" |
| Auditors | planned-and-inert | "Audit firms as entities — client portfolio, CAM topics, fees, tenure" |
| Funds | planned-and-inert | "Registered funds — N-CEN, N-PORT and N-CSR filings" |
| Events | planned-and-inert | "Form cross-sections — every 4.02 restatement, 4.01 auditor change or 12b-25 in a period" |

Order is the prototype's: Companies · Sectors · **People** · Managers · Auditors · Funds · Events.
Planned entries follow `STYLE_GUIDE` §10.1 — **no `href`, no click handler, not an anchor**,
`--mono-muted`, `cursor: default`, `title` present — plus the prototype's mono `planned` badge.

**Actions are subject-scoped** (operator decision, 2026-07-26):

| Active subject | Compare | Screen | Coverage |
|---|---|---|---|
| Companies | `/compare` | `/screen` | `/coverage` |
| Sectors | sector Compare view | *planned* | *planned* |
| Managers | *planned* | *planned* | *planned* |

Planned actions render **with their description in the `title`**, never omitted. There is no sector
screener and `/coverage` is not a sector-universe coverage page — claiming otherwise would be the
dishonest option.

### 5. The prototype frame on the re-homed pages *(operator chose the fuller option)*
- **View rail** — a page with **two or more views today** renders them as the prototype's vertical
  `Views` rail instead of a horizontal strip. That is `/company` (5) and `/sectors` (4, already has
  one). Pages with a single view (`/manager`, `/compare`, `/screen`, `/coverage`) get **no rail** —
  a one-item rail is noise, and inventing entries for it would be V3-P4/P6 content work.
- **Entity control bar** — rendered only where a **single focal entity** exists: `/company` (the
  company) and `/manager` (the manager). `/sectors` already has its sector control bar, unchanged.
  `/compare`, `/screen`, `/coverage` are action surfaces with no focal entity → no bar.
- **Every control-bar cell is real or honestly marked.** Fields come only from data the page
  already fetches. Anything unavailable renders `—` / N/A with a reason, or is omitted. **Do not
  port the prototype's `94% filed`, `Q1 FY26`, or any other synthetic figure** (`ROADMAP_APP_V3` §7).
- **No right rail is added anywhere.** It stays only where it already exists (the sector app).
  There is no content for one on the other pages, and inventing it is fabrication.

### 6. URL-as-state
Selection derives from the path; the path is the serialization of selection.

- `/company/{symbol}[/{view}]` — views: `fundamentals` · `statements` · `insider` ·
  `institutional` · `beneficial`
- `/manager/{cik}` — single view
- `/sectors[/{group}[/{view}]]` — views: `sector` · `company` · `compare` · `qual` · `filings`
- Changing view **pushes** a history entry, so Back/Forward walk views.
- **Every URL form that works today keeps working** — `?tab=`, `?group=`, `?view=`, `?a=&b=`,
  `?symbols=`, `?stmt=`, `?trend=`. They may normalize to the new path, but must not 404 or land on
  the wrong view. `scripts/headless_check.js` drives ~20 of these; they are the regression net.
- An unknown `{view}` slug resolves to that subject's default view rather than erroring.

### 7. Decommission `/sectors-legacy` *(operator decision)*
Delete the route, `sectors.html`, `sectors.css`, `sectors.js`, the `sectors-legacy` headless shot,
and the test at `tests/test_static_pages.py:160`. Its one-release rollback window (2026-07-24 swap)
is long past and `ROADMAP_SECTOR_MIGRATION.md:154` already schedules exactly this. Removes one
`.plot-chart` declaration and a third surviving shell.

### 8. Focal selector scoped to the selected sector
The second of the two known open items. In the sector app's Company view, the focal-company
selector offers only filers in the currently selected sector.

---

## Out of scope

- **`/compare/{sectors|companies}` rename** — belongs to **V3-P7** per `ROADMAP_APP_V3` §6
  (operator confirmed 2026-07-26). `/compare` is re-homed at its current path, unchanged.
- **Any change to the set of views, tabs, or the content inside them.** The company hub keeps all
  five tabs, same labels, same order, same content. Re-cutting is V3-P4/P5.
- Track-2 anything. New ingest, new endpoints, new metrics.
- Manager's six-view rail (V3-P6), Peer-relative view (V3-P5), the as-filed/as-restated toggle
  (`STYLE_GUIDE` §8.1 forbids it until a point-in-time compute path exists).
- Marketing/legal page chrome.
- New chart builders (V3-P1 shipped wave 1; further waves are per-phase).

---

## Acceptance criteria

QA verifies each by exercising the running app, not by reading the diff.

**Shell unification**
- **AC-1** `script.js` contains no sidebar or topbar renderer. Its `GROUPS` array, `sideLink`,
  `sideItem`, `logo` and topbar block are gone; only the marketing `.nav` hamburger remains.
- **AC-2** The sidebar HTML is produced by exactly **one** function in the codebase. Grep for a
  second nav implementation returns nothing.
- **AC-3** All seven shell pages render an identical sidebar and topbar — same brand, same link
  set, same order, same wording — verified across `/company/AAPL`, `/manager/1067983`, `/compare`,
  `/screen`, `/coverage`, `/sectors`, `/components`.

**Nothing regresses from either shell** (each of these exists on one side today and must exist on both)
- **AC-4** Below 1024px the sidebar is an off-canvas drawer behind a topbar hamburger; the scrim
  closes it, Escape closes it, and following a link closes it. **This exists only in `script.js`
  today — losing it on `/sectors` or gaining nothing on `/company` are both failures.**
- **AC-5** `⌘K` (mac) / `Ctrl-K` / `/` focuses the topbar search from every shell page; `suggest.js`
  autocomplete attaches; submitting navigates to `/company/{symbol}`.
- **AC-6** The active subject is highlighted **derived from the current path** — `/company/AAPL`
  highlights Companies, `/manager/…` highlights Managers, `/sectors` highlights Sectors — and
  carries `aria-current`. The hard-coded `n[1] === "/sectors"` is gone.
- **AC-7** The brand resolves to `/` (a real route — not a placeholder link) while reading as the
  prototype's `ClearyFi` + `SEC data`.
- **AC-8** Pages that render a footer today still render it.

**The subject nav (D2 / §10.1)**
- **AC-9** All seven subjects render. People, Auditors, Funds and Events have **no `href`
  attribute, are not `<a>` elements, have no click handler**, use `--mono-muted`, `cursor: default`,
  carry the `planned` badge, and expose the `title` text in the table above. Clicking one does
  nothing and does not change the URL.
- **AC-10** Actions re-scope with the active subject exactly per the item-4 table. Under Sectors,
  Screen and Coverage are inert and carry their descriptions; under Companies all three are live
  links that resolve 200.
- **AC-11** No `href="#"` anywhere in the shell.

**Component layer + stylesheet consolidation**
- **AC-12** `/sectors` loads `app.css`. The `.pa-dp-host .plot-chart*` and `.pa-dp-host
  .dist-strip-*` blocks are **deleted from `sectorapp.css`**, and the P1 distribution strip on the
  sector app's Company view still renders correctly with its title, caption and dots.
- **AC-13** `.plot-chart` (base rule) is declared in exactly one file — `app.css`. A repo grep
  shows no second base declaration.
- **AC-14** `sectorapp.js`'s two-phase render survives: HTML string first, then post-render
  `mount*()` DOM appends. Every chart in the sector app still mounts — the distribution strip
  (`mountCompanyDots`), `mountDistribution` (:1176), box-whisker spreads, geo-mix and insider-flow
  cards.

**Frame + content parity** *(the rule this phase must not break)*
- **AC-15** `/company/{symbol}` offers the same five views, same labels, same order —
  Fundamentals · Statements · Insider · Institutional · 13D/G — now in the vertical rail. Each
  view's content is unchanged from `master`.
- **AC-16** The `/company` and `/manager` entity control bars contain **no fabricated value**.
  Every cell is either a real value from data the page already fetches or an explicit `—` / N/A
  with a reason. No `94% filed`, no hard-coded period. Nothing renders a missing value as `0`.
- **AC-17** No right rail appears on `/company`, `/manager`, `/compare`, `/screen` or `/coverage`.
- **AC-18** `/compare`, `/screen` and `/coverage` render their existing content unchanged inside
  the new shell.

**URL-as-state**
- **AC-19** Selecting a view updates the path (`/company/AAPL/statements`, `/sectors/35/compare`);
  reloading that URL lands on the same view; Back returns to the previous view.
- **AC-20** Every URL in `scripts/headless_check.js` still resolves to the intended view. Legacy
  `?tab=` / `?group=` / `?view=` / `?a=&b=` / `?symbols=` forms are honored or normalized — never a
  404, never the wrong view.
- **AC-21** An unknown view slug (`/company/AAPL/nonsense`) falls back to the default view rather
  than erroring.
- **AC-22** In the sector app's Company view, the focal-company selector lists only filers in the
  selected sector.

**Decommission + regression**
- **AC-23** `/sectors-legacy` returns 404; `sectors.html` / `sectors.css` / `sectors.js` are
  deleted; no test or headless shot references them.
- **AC-24** `pytest` passes in Docker.
- **AC-25** The headless check adds **no new failures** beyond the documented pre-existing
  Company-view 502s on synthetic CIK 900001 in the offline sandbox (confirmed in three prior QA
  records). A shell change touching every page must not add to that baseline.
- **AC-26** No page renders a missing or inapplicable value as `0`, and every status chip,
  provenance affordance and 13F "derived" caveat present on `master` is still present.

---

## Risks / open decisions

**R1 — The containment argument is weaker than the roadmap assumed.** `ROADMAP_APP_V3` §2 justifies
D1's risk by promising P2 re-homes pages "with their current content and tabs completely
unchanged", so "any regression is unambiguously the shell's". The operator chose the **full
prototype frame** (2026-07-26), which also restructures each page's interior chrome: tabs become a
vertical rail and `/company` gains an entity control bar. The *set* of views and the *content*
inside them is still untouched, so the rule holds in substance — but a regression is no longer
unambiguously attributable to the sidebar alone. **Mitigation, and why the brief is written this
way:** AC-15/AC-16/AC-18 check view-set and per-view content parity against `master` explicitly, so
the parity claim is tested rather than assumed. Recorded here as a knowingly-accepted trade, not an
oversight.

**R2 — `/company/{symbol}` is the reference implementation.** `STYLE_GUIDE` §11 names it "the
parent" of every data page and it is the most-linked page in the product. This branch rewrites its
shell *and* its view chrome. It deserves the majority of QA's time and a mandatory hands-on 4b gate.

**R3 — Backend involvement is real but small.** URL-as-state needs new `main.py` routes:
`/company/{symbol}/{view}`, `/sectors/{group}`, `/sectors/{group}/{view}`, and the `/sectors-legacy`
deletion. All are `FileResponse` of an existing HTML file plus tests. **Architect's call** whether
that is a backend sub-stage or route additions the frontend engineer owns. Flagging, not deciding.

**R4 — The entity control bar may want data the page does not fetch.** The prototype's company bar
shows Company · Peer set · Period · Last filed. If peer set or last-filed is not already on the
company hub's payload, the honest answer is an N/A cell **or** dropping that cell — **not** a new
endpoint, which would push this branch into backend feature work. Architect to confirm what is
available before specifying the bar's columns.

**R5 — Sequencing.** Nothing in V3-P4…P7 can start until this lands. Only V3-P1 (done) and V3-P3
(ingest metadata, no UI) run alongside. A long QA loop here blocks the whole programme.

**R6 — The V3-P1 lesson.** Both of P1's fix cycles were **design fidelity, not logic** — an
unrequested restyle, then two wrong guesses at the operator's intent before opening the prototype.
`prototype.dc.html` lines 36–70 are the shell markup and lines 7325–7370 are the nav model. **Read
them before writing shell CSS**, not after a rejected round-trip.

**No open decisions blocking the architect.** The four forks (shell reach, action scoping,
`/sectors-legacy`, compare rename) were put to the operator and resolved on 2026-07-26; each is
recorded inline above.

---

## Handoff → Principal Architect

Design against the 26 acceptance criteria. Specific things to resolve at stage 2:

1. **Where the single nav renderer lives** — `sectorapp.js` is a 1,986-line IIFE built around
   sector state. The shell must serve six pages that are not the sector app. Decide whether the
   shell is extracted into its own file (e.g. `shell.js`) that `sectorapp.js` and the other page
   scripts both consume, or whether `sectorapp.js` genuinely becomes the entry point for every
   page. **AC-2's "exactly one implementation" is the constraint; the file layout is your call.**
2. **Backend sub-stage or not** (R3) — decide and record it, so `_active.md` routes to the right
   engineer.
3. **The stylesheet consolidation order** — which of the four `.plot-chart` declarations is the
   survivor and what each page keeps as a scoped override, without regressing the statement charts
   (`company.css:578`), institutional cells (`:604`) or drill boxes (`sectorapp.css:188`).
4. **The two-phase render contract** (AC-14) — `sectorapp.js` returns HTML strings then mounts DOM
   nodes. Any shell refactor must preserve it explicitly, or every chart in the sector app silently
   stops mounting.
5. **Entity control bar columns** (R4) — confirm against the actual payloads before speccing.
6. **URL-as-state mechanics** — pushState vs replaceState per interaction, and how legacy query
   params normalize (AC-20).

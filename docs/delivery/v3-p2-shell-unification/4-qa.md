# 4 — QA: V3-P2, shell unification

**Task:** `v3-p2-shell-unification` · **Stage 4 (QA Tester)** · 2026-07-27
**Branch:** `v3-p2-shell-unification` · **Verified against:** `1-brief.md` (26 ACs)

---

## Round 1 — verdict: ❌ **FAIL** (2 defects, both frontend)

24 of 26 criteria pass on driven evidence. **AC-22 was not implemented at all** — scope item 8 of
the brief. One additional defect found while driving.

*(Round 2 below, after the fix.)*

### Defects

#### D1 — AC-22 NOT IMPLEMENTED · severity: **blocking**

The brief's scope item 8 ("Focal selector scoped to the selected sector") and **AC-22** were never
built. `focalPeerList()` (`sectorapp.js:1314`) scopes to `state.focalGroup` — the *focal company's*
SIC group — not to `selectedGroup()`, the sector chosen in the control bar. This is the exact "known
open item" the brief said URL-as-state would absorb.

**Repro:** open `/sectors?view=company&symbol=320193`, wait for the focal to resolve.

```
control bar sector : "Business Services"
focal peer group   : "Industrial & Commercial Machinery & Computer Equipment"  (SIC 35)
focal selector     : 11 options, all SIC 35
```

The control bar claims one sector while the selector below lists another sector's filers. Also
visible in the `sectorapp-company-trend` screenshot: control bar "Chemicals & Allied Products",
breadcrumb "Industrial & Commercial Machinery…", context "11 peers · SIC 35".

#### D2 — entity control bar contradicts the page on Institutional · severity: **minor**

On `/company/AAPL/institutional` the entity bar reads `PERIOD —` while the page's own control reads
`QUARTER (13F) Mar 31, 2026`. `periodLabelForBar()` reads `state.instValue`, which is populated by
the async institutional-periods fetch *after* `render()` paints the bar, and nothing repaints it.

Not an honesty violation — `—` is the correct rendering for an unresolved value, and it is never a
fabricated number or a `0`. But it breaks **"one fact, one source"** (`ROADMAP_APP_V3` §4.4): two
elements on the same screen state different things about the same period.

**Repro:** `/company/AAPL` → Institutional → compare the bar's `PERIOD` against `QUARTER (13F)`.

---

## Round 2 — verdict: ✅ **PASS — pending operator manual verification** (2026-07-27)

Both defects fixed by `senior-frontend-engineer` and re-verified by driving, not by reading the diff.

### D1 / AC-22 — FIXED ✅

The fix establishes an invariant rather than patching the symptom: **`state.focalGroup` is always
`selectedGroup()`**. Setting a focal moves the sector selection to that focal's group
(`syncSectorToGroup`), and picking a sector re-resolves the focal inside it (`resolveFocalInGroup`).

Driven evidence — all three directions:

| Path | Control bar | Focal peer group | Result |
|---|---|---|---|
| `?view=company&symbol=320193` (ticker search) | Industrial & Commercial Machinery & Computer Equipment | SIC 35, 11 options | ✅ agree *(was "Business Services" vs SIC 35)* |
| `?view=company` (default focal) | Industrial & Commercial Machinery & Computer Equipment | SIC 35 | ✅ agree |
| switch sector → Building Materials & Garden Supplies | Building Materials & Garden Supplies | SIC 52 | ✅ agree |

The third case is the one worth calling out: that sector has **no company-level metrics**, and the
fix deliberately does *not* fall through to another sector — it renders the honest "Place a filer in
its peers" empty state with the breadcrumb reading `Building Materials & Garden Supplies › the focal
filer · SIC 52`. Screenshot `_ac22-empty-state.png`: **no fabricated filers, no zeros
(`zeros=0`), no page errors.** Silently showing another sector's filers would have been the wrong fix.

### D2 — FIXED ✅

`/company/AAPL/institutional`: entity bar `PERIOD Mar 31, 2026` == page `QUARTER (13F) Mar 31, 2026`.
`ensureInstPeriods()` now repaints the bar when the async axis resolves.

### Regression check after the fix

```
pytest                     554 passed, 9 skipped
e2e                        37 shots; the SAME 2 baseline CIK-900001 failures, no FAILED lines
```

---

## Acceptance criteria

Evidence is either a driven interaction (scripted through real Chromium against the running app), a
named screenshot in `data/e2e-shots/`, or command output. No AC is marked from source reading.

| AC | Verdict | Evidence |
|---|---|---|
| AC-1 `script.js` has no shell renderer | ✅ | 168 → 29 lines; the only `GROUPS`/`appSide` hits are in the explanatory comment |
| AC-2 exactly one nav implementation | ✅ | `grep -l 'shell-nav-item\|side-link\|pa-side-link' *.js` → `shell.js` only |
| AC-3 identical sidebar on all 7 shell pages | ✅ | Driven: subject list signature identical across `/company`, `/manager`, `/compare`, `/screen`, `/coverage`, `/sectors`, `/components` (`navSame=true`) |
| AC-4 drawer below 1024px | ✅ | `shell-drawer-narrow.png` at 900px: hamburger → drawer opens, scrim closes it, reopens. Driven, not just rendered |
| AC-5 ⌘K / Ctrl-K / `/` focus | ✅ | Driven on all 7 pages; `/` and Ctrl-K both land on `#shellSearchInput` |
| AC-6 active subject from path + `aria-current` | ✅ | `/company`→Companies, `/manager`→Managers, `/sectors`→Sectors, `/components`→none. `n[1] === "/sectors"` gone |
| AC-7 brand resolves to `/` | ✅ | `.shell-brand[href="/"]` on all 7 |
| AC-8 footers preserved | ✅ | 6 footer links on `/company`, `/manager`, `/compare`, `/screen`, `/coverage` |
| AC-9 planned entries inert per §10.1 | ✅ | All 4 are `<span>`, `href=false`, `cursor:default`, `rgb(139,133,121)` = `--mono-muted` `#8b8579`, all `title`d. Clicking changes nothing |
| AC-10 actions re-scope per subject | ✅ | Companies: 3 live. Sectors: Compare live, Screen+Coverage planned. Managers: all 3 planned (`manager.png`, `sectorapp.png`, `screen.png`) |
| AC-11 no `href="#"` in the shell | ✅ | `grep -c 'href="#"' shell.js` → 0 |
| AC-12 `/sectors` loads `app.css`; canary blocks gone | ✅ | `app.css` linked; `grep pa-dp-host sectorapp.css` → 0 `.dist-strip` hits. Strip renders with title, caption, dots (`sectorapp-company-trend.png`) |
| AC-13 `.plot-chart` base declared once | ✅ | `grep -rn '^\.plot-chart {' *.css` → `app.css:441` only |
| AC-14 two-phase render survives | ✅ | `sectorapp.png` + `sectorapp-company-trend.png`: distribution strips, box-whisker, geo-mix, insider-flow, decomposition all mount after tile clicks and view switches |
| AC-15 same 5 views, content unchanged | ✅ | **Content-parity harness vs `master`** (below): Fundamentals, Statements, Statements/balance, Insider, 13D/G, WMT statements all byte-identical text |
| AC-16 control bars carry no fabricated value | ✅ | No `94% filed`, no hard-coded period, no "not restated" line. `/manager` name renders `—` until the holdings fetch resolves. **D2 (minor) filed** for a stale-but-honest `—` |
| AC-17 no right rail on the 5 pages | ✅ | `.pa-rrail` count: 1 on `/sectors`, 0 on all others |
| AC-18 `/compare`, `/screen`, `/coverage` unchanged | ✅ | Content-parity harness: all identical to `master` |
| AC-19 path updates, reload, Back/Forward | ✅ | Driven: `/company/AAPL` → normalizes to `/fundamentals`; click Insider → `/insider`; 13D/G → `/beneficial`; Back → `/insider` (rail active follows); Back → `/fundamentals`; Forward → `/insider` |
| AC-20 every legacy URL still resolves | ✅ | Driven: `?tab=statements\|insider\|institutional\|beneficial`, `?tab=statements&stmt=balance`, `?trend=net_margin` all land on the intended view. **`/screen?view=rank` not consumed** — Rank mode active, rows render |
| AC-21 unknown slug → default view | ✅ | `/company/AAPL/nonsense` → Fundamentals, no error (`company-path-unknown.png`) |
| AC-22 focal selector scoped to selected sector | ✅ | **Round 1 FAIL (D1) → fixed → re-verified in round 2**: control bar and focal peer group agree on ticker search, default focal, and sector switch; empty case honest (`_ac22-empty-state.png`) |
| AC-23 `/sectors-legacy` gone | ✅ | Route 404s; `sectors.html/.css/.js` absent; `test_sectors_legacy_is_gone` asserts both |
| AC-24 pytest green | ✅ | `554 passed, 9 skipped` |
| AC-25 no new e2e failures | ✅ | Exactly the 2 baseline CIK-900001 shots; see below |
| AC-26 no `0` for missing; chips/provenance intact | ✅ | `compare.png` shows N/A with reasons and N/M distinct; status chips, "show your work", 13F derived caveats all present |

### Content parity vs `master` — the load-bearing rule

Ran both revisions side by side (a `master` git worktree as a second compose project, network-joined)
and compared the **content region** (`#view` + `#legend` + `#disclosure` + `#stmt-types` +
`#period-control`) innerText for each view:

```
SAME  company fundamentals   SAME  company insider      SAME  manager
SAME  company statements     SAME  company 13D/G        SAME  compare
SAME  company stmt balance   SAME  company WMT stmts    SAME  screen rank / coverage
DIFF  company institutional  (label truncation only — every value identical)
```

**Two false alarms resolved, both environment not code:**
- 13D/G initially differed — the branch's long-lived `data/e2e.db` carried 3 extra rows from an
  earlier session (28 vs the seeded 25). Re-seeded from scratch → **identical**.
- The institutional diff is **label truncation**, not data: the content column is **854px on the
  branch vs 992px on master** because the view rail takes 132px + gap. Percentages are identical
  (45.8 / 22.4 / 9.8 / 7.7 / 6.3 / 4.9 / 3.1); only where names elide differs
  (`BERKSHIRE HATHAWAY INC` → `BERKSHIRE HATHAWAY I…`). This is an inherent consequence of the
  operator-chosen full prototype frame. **Flagged for the operator at 4b**, not filed as a defect.

### Pre-existing, NOT caused by this change

The "which holders run similar portfolios" graph has colliding node labels
(`GREYSTONE PAR…`/`MERIDIAN ASSET MG…` overprinted). I captured the same card from **master** and
**branch** at identical viewports: **master collides too** (`_cmp-similar-master.png` vs
`_cmp-similar-branch.png`). A `STYLE_GUIDE` §12 label-placement issue in an existing builder — out
of scope here; worth its own ticket.

### e2e baseline (AC-25)

Baseline captured on this branch **before** any frontend change: exactly 2 failing shots —
`sectorapp-company` (8 errors) and `sectorapp-company-refocus` (13), both synthetic-CIK-900001 502s.
Final run: **the same 2 shots, nothing added.** Overall `HEADLESS CHECK: FAIL` is the expected
baseline state.

⚠️ **Two harness traps** the next QA should know: the compose exit code is unreliable when piped, and
a shot that *throws* prints `FAILED` rather than `errors=N` — grep both, or a broken shot vanishes
from a filtered log instead of showing up as an error.

---

## Review questionnaire

**1. What shipped.** The product now has one navigation instead of two. Every data page —
company, manager, compare, screen, coverage, sectors, components — wears the same 210px sidebar
naming the seven entity subjects (three live, four drawn as inert "planned" labels) with the
actions available under whichever subject you're in. `/company` moved its five tabs into a vertical
Views rail and gained an identity bar, and the view you're looking at is now in the URL, so views
are linkable and the Back button walks them.

**2. Surfaces touched.** New `static/shell.js` + `shell.css`. Retired the shell half of `script.js`
and 282 lines of `style.css`; deleted the sector app's private sidebar/topbar/rail CSS and both
V3-P1 canary blocks. Re-homed `company.*`, `manager.*`, `compare/screen/coverage/components.html`,
`sector-analytics.html`. Backend: `/company/{symbol}/{view}`, `/sectors/{group}`,
`/sectors/{group}/{view}` added; `/sectors-legacy` + `sectors.{html,css,js}` deleted.

**3. AC → evidence.** The table above; every row is a driven interaction, a named screenshot, or
command output.

**4. States exercised.** *Populated* — every page against the seeded fixture. *Loading* — the
manager entity bar before the holdings fetch resolves (name renders `—`, then fills in). *Empty* —
the Qualitative/Filings Track-2 placeholders (`sectorapp-qual`, `sectorapp-filings`) and the
`sectorapp-insider-na` group-28 cards ("No insider data" / "No ASC 280 geographic disclosure",
never `$0`/`0%`). *Error* — `/company/AAPL/nonsense` before the symbol-parsing fix produced a real
HTTP 404 state, which is how I found that bug; and the CIK-900001 502 path is the standing baseline.

**5. Edge cases probed.** **N/A vs N/M vs 0**: `compare.png` shows N/A with per-cell reasons
("required input not reported for this period"), N/M distinct ("prior-period base is negative or
zero"), and Interest Coverage as `N/A` rather than `0`. **Unresolved-but-known-later**: the manager
name and the institutional quarter (→ D2). **Legacy-vs-new URL collision**: `/screen?view=rank`,
where `?view=` means something different than it does on `/sectors` — verified not consumed.
**Restatements / multi-class / PRN**: unchanged code paths, and content parity proves the rendered
output is byte-identical to `master`. **429 / upstream 502**: not re-probed — this branch touches
no request path; the 502 handling is the standing e2e baseline.

**6. Honesty contract.** Planned nav entries are structurally inert (`<span>`, no href, no handler,
`--mono-muted`, titled) — §10.1 satisfied as markup, so it cannot regress by styling accident.
Entity-bar cells are real or drained; **no** "Peer set" cell (unavailable at page load — omitted
rather than shown as a permanent N/A) and **no** "facts as filed · not restated" line, which would
be false for this product since `metrics.py` emits `as-restated`. Both omissions are reasoned in
code comments. No prototype figure was ported. 13F caveats, status chips and "show your work"
affordances all survive.

**7. Deltas from the brief.** **AC-22 was not implemented (D1).** Beyond that: the shell had to be
*extracted* to `shell.js`/`shell.css` rather than literally making `sectorapp.js` the product shell
— the architect's call, and AC-2 is satisfied as written. The `/company` title row now reads
"Company hub" with the ticker in the meta + entity bar (prototype fidelity per D1); the architect
flagged the SEO trade-off and it is on the 4b questionnaire. Search behaviour differs by design on
`/sectors` (sets the focal company, doesn't navigate) — documented in `2-architecture.md` §2.3, so
AC-5's "navigates to /company/{symbol}" applies to the other five pages.

**8. Residual risk.** The content column is 14% narrower on `/company`; charts re-truncate labels.
Nothing became illegible in the shots I reviewed, but this is the thing most worth a human eye. The
drawer is the behaviour most likely to be lost in a future refactor — it now has a dedicated shot.
What would worry me most if wrong: a legacy deep link silently landing on the wrong view, which is
why AC-20 is driven per-URL rather than sampled.

---

## UI/UX review

- **Consistency:** the same sidebar, brand, topbar and drawer now render on all seven pages —
  previously the sector app had a different brand, no drawer, a hard-coded active item, and
  different API-link casing. That inconsistency is gone.
- **Affordances:** rail buttons carry `active` + `aria-current`; planned entries deliberately offer
  no affordance (no pointer cursor, not focusable) — correct per §10.1.
- **Focus:** `:focus-visible` outlines on brand, nav links, rail buttons, hamburger, API pill.
- **Responsive:** below 1024px the sidebar becomes a drawer and the rail becomes a horizontal
  scroll strip rather than eating half the width (`shell-drawer-narrow.png`).
- **A11y improvement found and fixed during the branch:** a closed off-canvas drawer used to stay
  clickable and tab-reachable (a tap on the hamburger right after closing hit the brand link and
  navigated to `/`). Now `pointer-events: none` + `visibility: hidden` after the slide. Inherited
  from the retired `script.js` shell — pre-existing, not introduced here.
- **Copy:** action/subject labels name entities the user recognizes; `planned` badges say what they
  mean; no over-claiming.
- **Theme:** the product ships a single warm-paper theme (no `prefers-color-scheme` anywhere in the
  CSS); all shell colors are token-driven, verified via computed styles (`--mono-muted` resolved to
  `#8b8579` at runtime).

---

## Manual UI verification

**Classification: interactive / logic change → operator hands-on is REQUIRED (blocking).** This
changes navigation, state and URL behaviour on every data page.

Run against a local instance (`docker compose up api` → `http://localhost:8000`).

1. Open `/company/AAPL`. → Sidebar: Subjects (Companies highlighted), People/Auditors/Funds/Events
   greyed with `planned`; Actions · Companies: Compare/Screen/Coverage; Reference. URL normalizes to
   `/company/AAPL/fundamentals`.
2. **Try to click "People".** → Nothing happens; no navigation, no cursor change to a pointer.
3. Click through the Views rail: Statements → Insider → Institutional → 13D/G. → Content matches
   what each tab showed before; URL tracks each view.
4. Press **Back** three times, then **Forward**. → Views walk in order; the rail highlight follows.
5. Reload on `/company/AAPL/insider`. → Lands on Insider, not Fundamentals.
6. Open `/company/AAPL?tab=institutional` (an old bookmark). → Institutional view.
7. On Institutional, compare the entity bar's **PERIOD** with the **QUARTER (13F)** selector.
   → They must agree (this is defect D2's check).
8. Narrow the window below ~1024px. → Sidebar collapses behind a hamburger; open it, close via the
   dimmed scrim, press Escape, and immediately re-tap the hamburger. → Reopens; must NOT jump home.
9. Press `/` then `⌘K`/`Ctrl-K` on any page. → Topbar search focuses.
10. Open `/sectors`. → Sectors highlighted; **Screen and Coverage show `planned`** (there is no
    sector screener). Compare is live.
11. On `/sectors`, type a ticker in the topbar search and submit. → Sets the focal company and stays
    on `/sectors` — by design, it does not navigate away.
12. `/sectors` → Company view. → **The focal selector must list filers from the sector named in the
    control bar** (this is defect D1's check).
13. Open `/manager/1067983`. → Managers highlighted; all three actions `planned`; entity bar shows
    the manager name (not the CIK), CIK, quarter, and the ~45-day-lag note.
14. Visit `/sectors-legacy`. → 404.
15. Scan `/compare` for honesty. → Missing values read `N/A` with a reason or `N/M` — never `0`.

**Operator outcome:** _pending_ — see `4b-manual-verification.md`.

---

## Handoff

**Round 1: FAIL** → back to `senior-frontend-engineer` with D1 (AC-22, blocking) and D2 (minor).
**Round 2: PASS** after both were fixed and re-verified by driving.

**Verdict: ✅ PASS — pending operator manual UI verification.**

All 26 acceptance criteria pass on driven evidence. `pytest` 554 passed; the e2e headless suite sits
exactly on its pre-existing baseline (2 synthetic-CIK-900001 502 shots, nothing added). Content
parity against `master` was proven per view, not assumed.

This is an **interactive/logic change touching every data page**, so the operator hands-on gate is
**blocking**: → **`4b-manual-verification.md`**. It is **not** "ready to deploy" until that is signed
off. A green report plus a completed questionnaire unlocks a deployment *request*, never the deploy.

**Two things to put in front of the operator specifically:**
1. The `/company` content column is **14% narrower** (854px vs 992px) because the Views rail sits
   beside it — an inherent consequence of the operator-chosen full prototype frame. Values are
   identical; some chart labels truncate at different points. Worth an eye (checklist row 20).
2. The `/company` `<h1>` now reads **"Company hub"** rather than the ticker (prototype fidelity per
   D1). SEO trade-off on our most-indexed page; trivially reversible (checklist "judgement call").

**Not caused by this branch, worth its own ticket:** the "which holders run similar portfolios"
graph has colliding node labels — verified present on `master` at an identical viewport
(`_cmp-similar-master.png`). A `STYLE_GUIDE` §12 label-placement issue in an existing builder.

# P4 — Qualitative view v2 (placeholder expansion) · Architecture & plan

**Stage:** 2 — Principal Architect
**Input:** `1-brief.md` (AC-1…AC-10)
**Owner of implementation:** `senior-frontend-engineer` (single sub-specialty)
**Backend:** **N/A** — no `sec/`/`ingest/`/`normalize/`/`storage/`/`api/` (Python) change. No route,
no repository, no endpoint, no canonical concept, no `mapping.py`/`DATA_MODEL.md` change.

## Scope re-check (passed)

Frontend-only, Track-2 **placeholder** expansion. Confirmed **in bounds**:
- **No Track-2 build.** Renders no derived/extracted narrative; only static labels + honest empty
  states. This is the honesty guardrail *made visible*, not a step into free-text extraction.
- **No new base dependency**, no CDN/external asset (CSP-safe, vendored idiom already in use).
- **No SEC-compliance surface** touched (no network calls added).
- **No backend / no request-path change** → single-process, rate-limiter, DuckDB guardrails not
  engaged. Nothing to re-check there.

Stop-and-flag triggers (real Track-2 extraction, a backend endpoint, a new base dep, weakened SEC
compliance) are **not** hit. Proceed.

## Where it lives (two files, one pair)

| File | Change |
|---|---|
| `src/secfin/api/static/sectorapp.js` | Rewrite `renderQualView` to the fuller placeholder layout; add `wireQualView()` (called at its end, matching `renderSectorView`→`wireSectorView`); add the 7-block `QUAL_DISCLOSURE` constant (labels + SEC-source one-liners, **no data**); add minimal store state. |
| `src/secfin/api/static/sectorapp.css` | Extend the `pa-qual-*` block with classes for the Disclosure-landscape grid, the expandable representative-language panel, the "Filings →" affordance, and the click-to-reveal filer-count panel. Theme-aware via the existing CSS vars; **no favorability color**. |

No other files. The app is server-rendered static JS/CSS loaded by the `/sector-analytics` page;
no template change needed (the view is client-rendered into `#viewport`).

## Design

### 1. Store state (minimal, mirrors existing idioms)

Add to `var state` (line ~19):
```js
qualThemeOpen: null,   // theme-label string whose representative-language panel is expanded
                       //   (single-open, mirrors state.decompTheme)
qualFilerOpen: {},     // { affordanceId: true } revealed filer-count panels
                       //   (multi-open map, mirrors state.coTrendOpen)
```
Both reset naturally on full re-render; no cross-view coupling. No new payload, no fetch.

### 2. `renderQualView(vp)` — the expanded placeholder layout

Keep the current honest scaffolding **verbatim in spirit** (AC-1): section head `01 Qualitative
disclosures`, the sub-line, the `pa-qual-banner` (Track-2 / structured-only / "nothing here is
fabricated"), the `pa-qual-planned-label`, and the closing `pa-qual-foot`. Then, in order:

1. **Risk-factor themes card** (`pa-qual-rt`, left col of `pa-qual-cols`). For each of the 7
   `QUAL_THEMES` labels render `pa-qual-rtrow` **as a button/clickable row** carrying
   `data-qual-theme="<label>"`:
   - name + empty coverage-bar shape (`pa-qual-rtbar`, no fill) + a **neutral direction-chip slot**
     rendering `—` / "planned" (class `pa-qual-planned`) — **never** new/rising/fading/stable.
   - a persistent **"Filings →"** affordance (`pa-qual-filings` with `data-qual-filings`,
     `stopPropagation` so it doesn't also toggle the row) — inert stub (AC-7).
   - When `state.qualThemeOpen === label`, render an inline **representative-language panel**
     (`pa-qual-langpanel`) below the row: honest empty state — "Verbatim excerpt + source + 'Open
     filings in ClearyFi' will appear here · to be defined · no filing text shown" (`pa-qual-phtag`).
     **No quote text.** (AC-3, AC-10.)
2. **Side cards** (`pa-qual-colR`) — unchanged `QUAL_SIDE` empty cards (AC-5).
3. **Per-filer signal matrix** (`pa-qual-matrix`) — unchanged headers + empty body (AC-5). One of the
   count-column header cells (or an in-body affordance) carries a **click-to-reveal filer-count**
   control `data-qual-filer="<id>"`; when open, show `pa-qual-filerpanel` honest empty state ("the
   specific tickers will list here · to be defined · none shown"). Provide at least the filer-count
   reveal required by AC-6; reveal panels are honest empty states, never tickers.
4. **NEW — Disclosure landscape** (`pa-qual-landscape`), a titled section (`pa-qual-planned-label`
   style sub-label + heading) with a `pa-qual-grid`-style responsive grid of **7** `pa-qual-block`
   cards, one per `QUAL_DISCLOSURE` entry. Each block: title, a one-line "what it will show + SEC
   source" description, an unmistakable placeholder body (`—` / "planned" / "to be defined"), **no
   counts/%/●**. The blocks that the prototype makes count-revealing (e.g. Cybersecurity incidents,
   Auditor changes, Late/deficient filings, litigation total) carry a `data-qual-filer` reveal that
   opens the same honest empty state (AC-6). (AC-4.)

End `renderQualView` with `wireQualView();`.

### 3. `QUAL_DISCLOSURE` constant (labels only — the moat is honesty here)

Hardcoded beside `QUAL_THEMES`/`QUAL_SIDE`, **labels + source strings only, no data**:
```
["Cybersecurity",        "Material incidents + governance — 10-K Item 1C · 8-K Item 1.05"]
["Critical Audit Matters","Auditor-flagged CAMs — auditor's report (PCAOB AS 3101)"]
["Auditor landscape",    "Auditor share · changes · tenure — 10-K signature · 8-K Item 4.01"]
["Risk-factor volume",   "Item 1A word-count trend + net-new — 10-K/10-Q Item 1A"]
["Non-GAAP & charges",   "Non-GAAP usage + reconciliations — 8-K Item 2.02 · MD&A"]
["Late & deficient filings","12b-25 late notices · ICFR weakness · restatements — NT · Item 9A · 8-K 4.02"]
["Human-capital & climate","Workforce metrics + voluntary climate — 10-K Item 1"]
```
(Exactly the brief's 7 blocks. Descriptions are *what it will show*, not values — safe.)

### 4. `wireQualView()` — wire interactions (empty-state only)

New function, called at the end of `renderQualView`; attaches after `vp.innerHTML` is set (same
pattern as `wireSectorView`). All handlers `renderApp()` to re-render (the app's single idiom):
- `.pa-qual-rtrow[data-qual-theme]` click / keydown(Enter/Space): toggle `state.qualThemeOpen`
  (set to label, or `null` if already open) → re-render. Row is `role="button"` `tabindex="0"`.
- `.pa-qual-filings[data-qual-filings]` click: `e.stopPropagation(); e.preventDefault();` — **no-op**
  (P5 Filings view not built). No navigation, no error (AC-7).
- `[data-qual-filer]` click: `e.stopPropagation();` toggle `state.qualFilerOpen[id]` → re-render (AC-6).

No `document`-level listeners needed; the outside-click closer already exists for the dropdown only.

### 5. CSS (`pa-qual-*` additions, theme-aware, no color)

Reuse existing tokens (`--border-strong`, `--bg-tint`, `--mono-muted`, `--rule`, `--ink*`). Add:
`pa-qual-landscape`, `pa-qual-block` (dashed-border card like `pa-qual-card`), `pa-qual-block-src`
(mono, muted source line), `pa-qual-langpanel` / `pa-qual-filerpanel` (inset dashed panel,
`pa-qual-phbody`/`pa-qual-phtag` typography), `pa-qual-filings` (mono link-style affordance, muted —
**not** an accent/action color that implies it works; hover cursor only), a `.is-open` affordance
state, and `[aria-expanded]` styling on the row. Extend the existing `@media` block so the landscape
grid and rows collapse to one column on narrow widths. **No good/bad/green/red** anywhere (AC-8).

## Honesty invariants (the load-bearing part — AC-2)

- Every added cell is `—`, "planned", "to be defined", "none shown", or a `what-it-will-show`
  description — **never** a figure, count, %, ratio, ●/○, direction word, ticker, company name, or
  excerpt. This holds in the **collapsed and every expanded/revealed state** (AC-2, AC-10).
- Coverage bars render **empty** (no fill) — the existing `pa-qual-rtbar` already does this; the
  Disclosure blocks add no bar with fill.
- The "Filings →" and filer-count affordances **look interactive but reveal only empty states**;
  they never produce data or navigate to a broken route.

## Test strategy → concrete checks (AC → verification)

Frontend-only; no `pytest` logic added, but the suite must stay green (AC-9). Primary verification is
the Docker e2e headless render check + driving the real UI. Engineer self-verifies before handoff;
QA repeats + eyeballs.

| AC | Concrete check |
|---|---|
| AC-1 | View DOM contains `.pa-qual-banner`, the "Track 2 · not yet derived" flag, and the `.pa-qual-foot` "Nothing … derived … or estimated." line. |
| AC-2 | Grep the *rendered* Qualitative DOM (collapsed **and** after expanding every row/reveal) for digits/%/●/○ and the words new/rising/fading/stable — **none** in data cells. Manual eyeball of every expanded state. |
| AC-3 | 7 `.pa-qual-rtrow[data-qual-theme]` rows; clicking one shows `.pa-qual-langpanel` empty state; each row has a `.pa-qual-filings` affordance. |
| AC-4 | `.pa-qual-landscape` present with exactly **7** `.pa-qual-block` cards whose titles = the 7 disclosure labels; each has a source line + placeholder body, no counts. |
| AC-5 | 3 `.pa-qual-sidecard`s + matrix with 5 `.pa-qual-mcol` headers, all empty-state bodies. |
| AC-6 | Clicking a `[data-qual-filer]` control reveals `.pa-qual-filerpanel` "none shown" empty state — no tickers. |
| AC-7 | Clicking "Filings →" does nothing (no nav, no console error, no thrown exception). |
| AC-8 | No external requests (CSP); renders in light + dark (headless screenshot both); no favorability color class in the qual DOM. |
| AC-9 | `docker compose --profile e2e up` render check passes; `pytest` green; Sector/Company/Compare + view-rail switching unaffected. |
| AC-10 | Toggle each interaction open→closed→open: no data ever appears; closed state identical to initial. |

## Handoff → Senior Frontend Engineer

**Branch:** `sector-v2-qualitative` (already created off `sector-v2-compare`; verify you're on it —
do **not** re-branch off `master`, this is stacked on the P3 compare work).

**Do:** implement §1–§5 in `sectorapp.js` + `sectorapp.css`. Rewrite `renderQualView`, add
`QUAL_DISCLOSURE`, add `wireQualView()` + the 2 state fields, extend the `pa-qual-*` CSS. Keep the
banner/foot honesty copy. Self-verify with the Docker e2e headless render check (light + dark),
expand **every** interactive element and confirm each revealed panel is an honest empty state, then
hand off. **Backend engineer stage is skipped** (N/A). Then → QA.

**Don't:** add any real data, any ticker/count/excerpt (even as an example), any backend/route, any
favorability color, any external asset, or wire "Filings →" to a real destination (P5 owns that).

# ClearyFi UI — Style Guide (READ BEFORE BUILDING NEW PAGES)

This is the canonical style reference for every ClearyFi data-facing page (Company hub /
Fundamentals, Statements, Compare, Screen, Data coverage, and anything new). **Read this in full
before writing a new page.** It exists so a new screen looks like it was always part of the
product — same paper, same rules, same numeric treatment, same honesty conventions.

**The company hub (`/company/{symbol}`) is the reference implementation, and every new data
page is a child of it.** (It absorbed the original reference, the Data Explorer, on 2026-07-17 —
`/explorer` now redirects to the hub's Statements tab.) New pages load the same base stylesheet
(`/static/style.css`) and the shared data-component layer (`/static/app.css` + `/static/app.js`),
then add only what's specific to them. When in doubt, open the company hub and match it.

The aesthetic is a **warm "paper terminal"** system: soft off-white paper, a single terracotta
accent, IBM Plex Mono for anything machine-ish (data, tags, metadata, API paths), Hanken Grotesk
for human copy. Rounded corners and soft drop shadows (not hard edges). It reads like a clean,
calm developer tool over real filings, not a flashy SaaS dashboard.

> **Non-negotiable rule that outranks aesthetics:** never fabricate or imply precision we
> don't have. The status vocabulary (§7) and the provenance/"show your work" pattern (§8)
> are load-bearing product features, not decoration. A new page that drops them is wrong
> even if it looks right.

> **History:** an earlier draft of this guide specified an ink-blue "ledger" palette with hard
> offset shadows. That was superseded — the shipped Explorer palette below is canon. If you find
> ink-blue/`#EDE4D0`/hard-shadow references anywhere, they're stale.

---

## 1. Color tokens

Use these exact values (defined in `static/style.css`, extended in `static/app.css`). Do not
introduce new hues. Reference them as CSS variables; never hard-code hexes in a page.

### Paper & surfaces (warm neutrals)
| Token | Var | Hex | Use |
|---|---|---|---|
| Paper base | `--bg-page` | `#F6F3EE` | Page background |
| Card fill | `--bg-card` | `#FDFBF7` | Cards, table interiors (the "active" surface) |
| Tint | `--bg-tint` | `#EFE9DE` | Panels, state cards, table header strips |
| Badge fill | `--bg-badge` | `#F0E4D6` | Toolbars, N/A cell fill, hover |

### Ink (text)
| Token | Var | Hex | Use |
|---|---|---|---|
| Ink | `--ink` | `#1C1A16` | Primary text, heavy rules, inverse-button fill |
| Ink body | `--ink-body` | `#544F46` | Body copy |
| Ink muted | `--ink-muted` | `#5C574D` | Secondary text |
| Ink soft | `--ink-soft` | `#6B6459` | Meta text, labels |
| Mono muted | `--mono-muted` | `#8B8579` | Captions, uppercase micro-labels, N/A & N/M values |

### Rules / borders
| Token | Var | Hex | Use |
|---|---|---|---|
| Border | `--border` | `#E7E0D3` | Card/panel borders, row dividers |
| Border strong | `--border-strong` | `#D8D1C4` | Control borders, inactive pill borders |
| Border tint | `--border-tint` | `#E2DACB` | Panel sub-borders |
| Rule (hairline) | `--border-tint-rule` | `#E5DFD3` | Masthead rule, row dividers inside cards |

### Accent — terracotta (the ONLY chromatic accent for "good"/interactive)
| Token | Var | Hex | Use |
|---|---|---|---|
| Accent | `--accent` | `#C0703A` | Eyebrows, active states, links, primary-on, sparklines |
| Accent hover | `--accent-hover` | `#A85F30` | Hover on accent |
| Accent ink | `--accent-ink` | `#8A5A2F` | Accent text on wash, open-provenance label |
| Accent wash | `--accent-wash` | `#F3E4D5` | Active pill fill, revealed-value highlight |

### Favorability — the sector scorecard exception (redesign Phase 2; extended to the sector app 2026-07-22)
| Token | Var | Hex | Use |
|---|---|---|---|
| Positive | `--positive` / `--positive-wash` | `#5E7D4F` / `#E6ECDD` | Improving/favorable direction on a sector theme score |
| Caution | `--caution` / `--caution-wash` | `#A97C2C` / `#F2E7CF` | Flat/mid (cross-sector-average) band |
| Negative | `--negative` / `--negative-wash` | `#A8432E` / `#F1DCD4` | Worsening/unfavorable direction |

A **deliberate, scoped exception** to "terracotta is the only chromatic accent" and to §7's
"status is never conveyed by color alone." The sector overview scorecard (`/sectors`, guide
`layout_guides/00 §5`) uses this muted, earthy trio (moss / amber / brick — **not** a primary
green/red stoplight) to signal **favorability of direction/position**. Rules: (1) use it **only**
for favorability on the scorecard (the trend-delta chip and a thin score-band accent) — **not** as a
general good/bad palette elsewhere; (2) it is always paired with a **glyph** (▲/▬/▼) and a **number**,
so meaning never rests on color alone; (3) the **score is a POSITION vs other sectors, not a good/bad
or buy/sell verdict** — the scorecard's caveats say so and the score number itself stays neutral
`--ink`, never a saturated fill.

> **Extended to the `/sector-analytics` app (operator decision, 2026-07-22).** The paper-terminal
> app originally shipped **color-free** (arrow glyphs only). The operator reversed that during Phase 1
> manual UI verification: the **same trio + same three rules above** now also apply to the app's
> score **deltas + biggest shifts** (and, consistently, wherever direction is shown across its views).
> Color **accompanies** the arrow/position — never color alone. Implementation is tracked as
> **followup F4** in `docs/delivery/sector-app-followups.md`; until it lands, the app is still
> color-free in code.

### Audit badges (data provenance — from `app.css`)
| Token | Var | Hex | Use |
|---|---|---|---|
| US-GAAP | `--gaap-color` / `--gaap-bg` / `--gaap-border` | `#3D6A8A` / `#E4EDF2` / `#CDDCE4` | US-GAAP source-tag badge |
| Extension / flag | `--ext-color` / `--ext-bg` / `--ext-border` | `#B04A3A` / `#F5E2DA` / `#E8C4B4` | Company **extension** tag badge; **APPROX** status; 404 code; mismatch warnings |

**The `ext` family is the semantic "flag / caveat / doesn't-reconcile" reserve.** It's close to
the accent terracotta but distinctly redder; APPROX and extension/404 states use it. Because it's
tonally near the accent, status is **never** conveyed by color alone (see §7).

### Shadow
Soft, downward drop shadow (never a hard offset):
- Cards / panels: `box-shadow: 0 18px 40px -26px rgba(40, 30, 15, 0.35);` (`--shadow-soft`)

---

## 2. Typography

Two families only (Google Fonts): `Hanken Grotesk` (400–900) + `IBM Plex Mono` (400–600).

**Hanken Grotesk** — human/display: page titles, company names, metric names, body copy,
word-label buttons.
**IBM Plex Mono** — machine/data: all numeric values, tickers, status tags, metadata,
uppercase micro-labels, API paths, source tags, captions.

### Scale (px, desktop)
| Role | Family / weight | Size | Notes |
|---|---|---|---|
| Page title (`h1`) | Hanken 800 | 36 | letter-spacing −0.02em, line-height 1.05 |
| Section name (`h2`) | Hanken 800 | 21 | in a section header (§4) |
| Company/section name | Hanken 800 | 19–28 | |
| Card / metric name | Hanken 600 | 14 | line-height 1.25 |
| Big numeric value | Plex Mono 600 | 26 | `font-variant-numeric: tabular-nums`, ls −0.01em |
| Body copy | Hanken 400 | 14–15.5 | color ink-body, line-height 1.5 |
| Eyebrow | Plex Mono 600 | 11.5 | uppercase, ls 0.14em, accent |
| Micro-label | Plex Mono 400/600 | 9–10.5 | uppercase, ls 0.1–0.12em, mono-muted |
| Status tag / badge | Plex Mono 600 | 8.5 | uppercase, ls 0.06–0.07em |
| Caption / footnote | Plex Mono 400 | 10–11 | mono-muted |

**Numbers are always tabular** (`font-variant-numeric: tabular-nums`) so columns align.
Negatives use accounting parentheses (`($108.5B)`); the minus glyph `−` (U+2212) is fine for
growth deltas.

---

## 3. Layout & spacing

- **App shell on every data page** (§5) — fixed left sidebar + sticky topbar, rendered by
  `static/script.js` into `#appSide`/`#appTopbar`. Fixed furniture; don't redesign per page.
  Marketing/prose pages (`/`, `/guide`, legal) keep the older static `.nav` instead.
- **Content column inside the shell**: `.page` (max-width 1440px), padding `12px 32px 72px`
  — the same column on every data page.
- Section rhythm: ~34px before a section header. Card grids use `gap:16px`
  (`repeat(auto-fill, minmax(240px, 1fr))`).
- **Always flex/grid + `gap`** for any group of siblings (chips, cards, meta rows). Never rely on
  inline-block whitespace.
- Radii are **rounded**: 7–8px on controls (inputs, buttons, pills, selects), 12–14px on cards,
  panels, and state boxes.

---

## 4. Signature treatments (the things that make it "ClearyFi")

1. **Warm paper background** — `--bg-page` (`#F6F3EE`), flat (no dotted grid).
2. **App shell** — a slim fixed **left sidebar** (logo, grouped links: Data → Company hub /
   Compare / Screen / Coverage; Reference → Docs & guide / Methodology / API Reference;
   a "Data, not investment advice" foot) and a sticky **topbar** holding the global
   ticker/CIK search (`⌘K` / `Ctrl-K` / `/` focuses it) plus an `API Reference` pill.
   Both are rendered by `static/script.js` — pages carry only the empty mounts (§5), so
   the link set lives in exactly one place. Below 1024px the sidebar becomes an
   off-canvas drawer behind a hamburger in the topbar. The active section's link gets
   `.current` (accent-wash pill) via `<body data-shell="...">`.
   (Marketing/prose pages keep the older static `.nav` markup with its own hamburger.)

   **⚠️ Changing in V3-P2 — the subject nav.** The Data/Reference grouping above is what ships
   *today*; it is being replaced by the v3 prototype's **subject-based nav**, locked by the operator
   2026-07-26 (D2). Build new nav work against this, not against the grouping above:
   - The sidebar names **the entity you are analysing**, and the actions available hang off
     whichever subject is active. It is a claim that the product is entity-centric.
   - **Seven subjects. Three live** — Companies (`/company/{symbol}`), Sectors (`/sectors`),
     Managers (`/manager/{cik}`). **Four planned and inert** — People, Auditors, Funds, Events.
   - Planned subjects render **drained and inert** per §10.1: `--mono-muted`, `cursor: default`,
     **no href and no click handler**, and a `title` naming what the subject will hold. They are not
     hidden — suppressing them would hide what the product covers.
   - **Actions are subject-scoped** (Compare · Screen · Coverage). Where an action isn't built for
     the active subject, it renders planned **with its description**, not omitted.
   - Under D1 (absorb) there is **one shell**, so the subject list has exactly **one source of
     truth** — no per-page nav copies.

   > **Source:** D2 — locked by operator 2026-07-26 · `ROADMAP_APP_V3.md` §2 · ships in V3-P2
3. **Masthead** — Hanken 800 title → right-aligned mono meta caption → a single
   `1px solid --border-tint-rule` **rule** → optional intro paragraph. `ClearyFi.masthead()`
   emits it; the Explorer carries the same `.masthead` markup statically. App-shell pages
   carry **no eyebrow** (the sidebar already brands the page; dropped everywhere 2026-07-17
   for consistency) — `ClearyFi.masthead()` renders one only if explicitly passed.
4. **Soft drop shadow** (§1) on cards/panels — never a hard offset, never `blur:0`.
5. **Section headers** — mono number (`01`, accent) + Hanken 800 name + a `2px solid --ink`
   underline.
6. **Segmented controls / pills** — 1.5px `--border-strong` border, 7–8px radius; active =
   terracotta accent fill, white text; period pills active = `--accent-wash` fill + accent border.
7. **Inverse button** — `--ink` fill, `--bg-page` text, mono uppercase label, 8px radius.
8. `::selection { background:#E9C9A9; }` (from `style.css`).

---

## 5. Standard page shell (copy this skeleton)

Every data page lives inside the app shell and closes with a footer. New pages load, in
order: Google Fonts → `style.css` → `app.css` → their own page CSS; and `suggest.js` →
`script.js` → `app.js` → their page JS (`suggest.js` before `script.js` so the topbar
search gets autocomplete).

```html
<body class="app has-ctx" data-shell="screen">   <!-- has-ctx only with a .controls bar -->
  <aside class="app-side" id="appSide" aria-label="Primary navigation"></aside>
  <div class="app-scrim" id="appScrim"></div>
  <div class="app-main">
  <header class="app-topbar" id="appTopbar"></header>
  <main class="page">…masthead / controls / legend / view / disclosure…</main>
  <div id="footer"></div>
  </div>
```

- **Shell:** `script.js` fills `#appSide`/`#appTopbar`. `data-shell` names the sidebar link
  to mark `.current` (`company` / `compare` / `screen` / `coverage`; the manager
  page uses `""` — no section is current, the masthead carries the context).
  **Changing in V3-P2:** under D1 (absorb) this shell and the Sector app's self-contained shell
  **merge into one**, `sectorapp.*` becomes the product shell, and the mounts here are superseded by
  the subject nav in §4.2. Until that lands, build to the skeleton below; don't add a second nav.
- **Sticky context:** `body.has-ctx` reserves `--ctx-h` so the page's `.controls` bar
  sticks under the topbar (≥1100px) and `.stmt-table th` header rows stick below both.
  Table headers inside a horizontal-scroll wrapper (`.matrix-scroll`) stay in flow —
  page-level sticky cannot work inside an overflow box.
- **Masthead:** `ClearyFi.masthead({ eyebrow, title, meta, lede })` — compacted inside the
  shell (27px title via `body.app` overrides in `style.css`).
- **Footer:** `ClearyFi.footer()` → `.app-footer`: a thin top rule, mono accent links to real
  routes (`/company/AAPL`, `/coverage`, `/docs`, each with `↗`), and a muted tagline "ClearyFi ·
  public SEC data, cleaned & queryable".

Links: accent color, mono. Resolve every href to a real destination — never leave placeholders.

---

## 6. Components inventory (reuse, don't reinvent — all in `app.js`/`app.css`)

- **Status chip / marker** — `ClearyFi.statusChip()` / §7. Present on every metric and derived value.
- **Metric card** — `ClearyFi.metricCard(mv)`: name + status chip header; big mono value + basis
  tag; optional inline caveat note (left `--ext-border` rule); built-in "Show your work"
  provenance. `--bg-card` + soft shadow; N/A cards drop the shadow and use `--bg-tint`.
- **Statement table** — `.stmt-table`: mono tabular amounts, `source_tag` + a US-GAAP/EXT badge
  per row, `--bg-tint` header with a 2px ink underline, rounded 14px card with soft shadow.
- **Ticker chip** — mono, `--ink` fill, `--bg-page` text, 7px radius. The company identity token.
- **Sparkline** *(when trend lands)* — inline SVG polyline, `--accent` 1.5px stroke, self-scaling,
  last point marked. Hidden (with a mono "no series" note) when the value is N/A or N/M.
- **Provenance / "Show your work"** — `ClearyFi.provenance()` / §8.
- **Disclosure / data-notes** — `ClearyFi.disclosure()`: dashed `--border-strong` container,
  `+`/`−` toggle, honesty copy pulled to match `docs/DATA_MODEL.md`.
- **States** — `ClearyFi.states.loading` (pulsing accent dot + shimmer bars + cold-path note) /
  `empty` (calm "filing on record, no mapped fields") / `notFound` (mono `HTTP 404` in
  `--ext-color` + recovery chips) / `error`.
- **Global search** — lives in the shell's topbar (script.js; `⌘K` / `Ctrl-K` / `/` focuses
  it) and navigates to the company hub, which handles resolution/404 itself.
  `ClearyFi.mountSearch()` remains for in-page flows that need resolve callbacks (Compare's
  "Add a company", the components demo).
- **Charts** — every chart is a `ClearyFi.*` builder backed by a **vendored** engine
  (`/static/vendor/d3.min.js` + `/static/vendor/plot.umd.min.js`, load d3 first; exposes
  `window.Plot`). **Pages never call `Plot.plot()` or `d3` directly** — the builder owns its
  spec, the tokens (one terracotta accent, IBM Plex Mono numerals) and its honesty caption.

  **Engine is chosen per chart, not per codebase** (D5, V3-P0). Use **Plot** where the chart is a
  plain mark-on-scale and Plot genuinely shortens it. Use **d3 directly** for anything with custom
  label placement or a non-standard layout — **the collision logic in §12 cannot be expressed in
  Plot**, and that is the deciding test, not familiarity. Both are already vendored, so neither
  choice adds a dependency.

  **Every builder returns a DOM node** (callers append it). This is not a preference: `chartCard()`
  builds and returns a node, and every chart must wrap itself in it, so a string builder cannot
  satisfy the wrapper rule. New d3 builders follow the same convention as the existing Plot ones.
  The four hand-rolled string builders — `sparkline` / `trendChart` / `trajectoryChart` /
  `positionBar` — **stay strings and stay frozen**; they are not migrated, and that is a closed
  decision, not an open backlog item. Shared chrome + sizing:
  every chart — Plot or d3 — wraps itself in `chartCard()` (`.plot-chart`: eyebrow title, scrollable
  body, caption/note) — one visual dialect per page — and takes `opts.width` from its mount
  site via `ClearyFi.measuredWidth(container, fallback)`, never a hardcoded pixel width.
  **Ranked bars take one fill** — bar length already encodes the value, so a
  darker-where-bigger lightness ramp double-encodes it; use *emphasis* (accent one mark,
  mute the rest) when one mark is the point. Tint still distinguishes mark *kinds* (e.g.
  solid = opened/closed outright vs lighter = resized) — kind is identity, not magnitude.
  **Multi-series categorical charts use a color palette** (operator decision 2026-07-18):
  a chart whose marks are *distinct entities* (e.g. each 13F filer in the stacked
  shares-over-quarters chart) hands color to a **randomized Observable Plot categorical
  scheme** — `ClearyFi.pickCategoricalScheme()`, memoized per page load so a series keeps its
  color across re-renders (color follows the entity) and a reload reshuffles. This is the one
  sanctioned exception to "one terracotta accent": it applies **only** to categorical identity,
  never to encode magnitude or a verdict. **Magnitude stays single-hue** — the holder
  choropleth uses a randomized *single-hue sequential* scheme (`pickSequentialScheme()`), never
  diverging or green/red, because §9.2 (color is never a good/bad verdict) still holds.
  **Captions dedupe:** a standing caveat (e.g. "reported 13F long positions only") renders
  once per page, prominently; each chart's caption carries only what is specific to that
  chart. Repeating the same line under every chart trains readers to skip captions.

  > **Source:** D5 — RECONCILIATION.md §5 (v3 prototype) · resolved V3-P0, 2026-07-26

---

## 7. Status vocabulary (LOAD-BEARING — every data point carries one)

Four statuses, distinguishable by **glyph + label + border style**, never by color alone
(accessibility + honesty — doubly important here since the accent and the flag color are both
warm). Chip = mono, 8.5px, uppercase, 6px radius.

| Status | Glyph | Tag | Meaning | Chip style (`app.css`) |
|---|---|---|---|---|
| OK | `●` | OK | Trustworthy value | text ink-soft, transparent bg, `1px solid --border-strong` |
| Approximate | `≈` | APPROX | Shown, but flagged imprecise | text/bg/border = `--ext-*` family |
| Not applicable | `∅` | N/A | Structurally meaningless for this company/industry — **or absent for this period/filer**; the reason string distinguishes them (§7.1, §9.11) | text ink-soft, bg `--bg-badge`, `1.5px solid --border-strong` |
| Not meaningful | `~` | N/M | Computable but would mislead | text ink-soft, transparent, `1.5px dashed --mono-muted` |

Rules:
- **N/A and N/M are never rendered as 0, blank, or an invented number.** Show the token
  (`N/A` / `N/M`) in drained `--mono-muted`, with the reason in provenance.
- **APPROX still shows the value** with the `≈` marker — the number is useful, the caveat rides
  alongside it (e.g. the R5 debt-split undercount).
- Solid border = N/A (hard structural), dashed border = N/M (soft judgment). Keep that distinction.
- A legend (`ClearyFi.statusLegend()`) explaining all four appears near the top of any page that
  shows metrics.

These map 1:1 onto the API: `MetricValue.status` is exactly `ok | approximate | na | nm`.

### 7.1 Translating a design that has no chips

The v3 prototype expresses these same distinctions in **prose**, not chips. Two rules govern the
translation, and they outrank convenience:

1. **The design's prose becomes the reason string, verbatim.** It is better than our current copy —
   carry it into `provenance()`'s *"why {flag}"* line as written. Do not paraphrase or tighten it;
   paraphrase loses the distinction the prose exists to make.
2. **Our definitions above win on any conflict.** In particular: **`N/M` requires computability.**
   If the inputs are absent, the value cannot be computed at all, so N/M is *definitionally
   unavailable* however the prose sounds — it is `N/A` with a reason.

The row-by-row table — every prototype phrasing, its resolved token, and the reasoning — is
**`docs/STATUS_MAPPING.md`**. Consult it when translating a prototype surface; add a row rather than
deciding locally. **Never invent a fifth token.**

> **Source:** D3 — RECONCILIATION.md §3 (v3 prototype) · resolved V3-P0, 2026-07-26

---

## 8. Provenance / "Show your work" (mandatory for derived numbers)

Any computed/derived figure must explain itself via progressive disclosure. `ClearyFi.metricCard`
builds this in; `ClearyFi.provenance()` is the standalone builder. A closed-by-default "Show your
work" toggle (mono, accent, `+`/`−`) reveals:
- **Formula** — mono, plain-language (`Net income ÷ Revenue`).
- **Basis** — TTM vs as-of; **restatement basis** (as-restated / as-originally-reported); the
  filing date the value is current as of (`as_of`). Surface fiscal-calendar mismatches here.
- **Why {flag}** — for any APPROX/N/A/N/M, the specific reason (from `MetricValue.reason`).

Provenance is closed by default, opens in place, and never blocks the primary read.

**Basis is always labelled** — income & cash-flow metrics are **TTM**, balance-sheet metrics are
**as-of** a date. Tag every value (`TTM` / `AS-OF`) and never mix bases silently. Quarterly views
say so explicitly (flows are TTM; EPS is N/M — not summable across quarters).

### 8.1 Basis is two-dimensional, and already modelled

Basis is **`basis` × `restatement_basis`**, not one axis. Both already exist in the schema — verify
rather than take this on trust:

| Axis | Type | Values |
|---|---|---|
| `basis` | `MetricBasis` (`normalize/schema.py`) | `TTM` · `as-of` |
| `restatement_basis` | `RestatementBasis` (`normalize/schema.py`) | `as-restated` · `as-originally-reported` |

**Everything we serve today is `as-restated`.** `normalize/metrics.py` sets it unconditionally, and
`DATA_MODEL.md` R9 requires a series to share **one** labeled basis, never mixed. The data to do
otherwise exists — every fact keeps its `accession` + `filed`, and prior values are never deleted —
but **no code path currently produces `as-originally-reported`**.

**The rule this exists to protect:** a UI must **not** offer an as-filed / as-restated toggle until
a real point-in-time compute path exists behind it. A toggle that returns identical data on both
settings fabricates precision and breaks §9.1 — the worst outcome available here, because it looks
like rigor. Until that path is built, the restatement basis is **stated in provenance, not
selectable**.

> **Source:** D4 — RECONCILIATION.md §3 (v3 prototype) · resolved V3-P0, 2026-07-26 · compute path
> deferred to V3-P4 or later (`ROADMAP_APP_V3.md` §2)

---

## 9. Honesty conventions (product rules, enforce in every page)

These are the reason the product exists. A page that violates them is broken.

1. **Never fabricate precision.** No zeros-as-missing, no blanks, no made-up numbers.
   Missing/inapplicable → the right status token, always.
2. **Descriptive, never prescriptive.** Peer ranks and position bars describe *where* a value
   sits, not whether it's good. **Never color a metric good/bad**, never pick a "winner", never
   rank companies overall. Accent = interaction/emphasis; the ext/flag color = caveat; neither is
   a verdict.
3. **Comparability is explicit.** Rankings exclude N/A and N/M. A close gap between an APPROX
   value and a clean one is not a trustworthy head-to-head — say so.
4. **Alignment is surfaced, not hidden.** Different fiscal calendars, filing lag, and
   TTM-vs-as-of are shown in headers/banners, not silently reconciled.
5. **Approximations are honest, not buried.** If we show it, we flag it, and we explain why.
6. **Coverage limits are surfaced.** Empty ≠ "nothing filed" — carry the coverage-floor notes
   (XBRL ~2009→2012; 13D/G structured-XML ~mid-2025; 13F long-only / ~45-day lag) via
   `ClearyFi.disclosure()`.
7. **Data is as-of the latest filing — not real-time.** State it in the masthead/meta.
8. **Nothing here is investment advice.** The disclosure block says so plainly.

### Rules 9–14 — added from the v3 design work

Rules 1–8 above are the originals and are unchanged. These six came out of the v3 prototype and are
now equally binding.

9. **Age of the newest fact is shown as prominently as the fact.** A view built on filings leads
   with how old its newest filing is — "since last filing", "position-data age", "next filing due".
   This generalizes rule 7: stating *"as of the latest filing"* is not enough if the latest filing
   is eleven months old.
10. **Staleness ledger.** Where a view spans several form types, give each one a row: as-of date,
    age, **what it tells you**, and **what it cannot**. The *"cannot"* column is the load-bearing
    half — it is the only place a reader learns that a 13F says nothing about shorts, or that a
    Form 4 says nothing about intent. Do not drop it to save width.
11. **Structural absence ≠ missing data.** *"No reported stake reaches 10%, so Section 16 does not
    apply and no Form 4 is due"* is a different statement from *"no data"*. Our `N/A` chip conflates
    them, so **the reason string is what carries the difference — it must survive** into
    `provenance()`. See §7.1 and `docs/STATUS_MAPPING.md`.
12. **One fact, one source.** Every figure on a view derives from the same object the other views
    render — a date shown in two places is the *same* date, not two independent derivations. Most
    of the prototype's bugs were violations of this. **Enforce it in review**, because it is
    invisible in a screenshot.
13. **Deadline context on any dated filing metric.** A lag figure without its statutory deadline is
    not interpretable: "filed 38 days after quarter-end" means nothing until you know the deadline
    is 45. Show the window, place the filing in it.
14. **Comparison validity is stated before the comparison.** Open with what lines up — *"N of 5
    filing-basis items line up · N of 9 measures are tagged by both filers"* — and put the detail
    below. A reader who scrolls past the caveat has still seen it.

> **Source:** RECONCILIATION.md §4 (v3 prototype) · adopted V3-P0, 2026-07-26

---

## 10. Anti-patterns (do NOT do these)

- New colors/hues, or a second accent — **except** a multi-series *categorical* chart, which may
  use a randomized Observable Plot categorical scheme for entity identity (§6, operator decision
  2026-07-18). Everywhere else: one terracotta accent; the ext family is for caveats only;
  magnitude stays single-hue; never a good/bad color.
- Color-coding metrics green/red for good/bad, or ranking companies overall.
- Rendering a missing/inapplicable value as `0`, `—`, blank, or a guess.
- Dropping the status chip, the basis tag, or the provenance affordance on a derived number.
- Emoji or decorative icons. Generated graphics are data-driven charts only — the hand-rolled
  SVG builders and the vendored-engine `ClearyFi` builders (§6, Plot or d3) — never decoration; keep them
  literal, and never CDN-load a chart library on a data page.
- Inter/Roboto/Arial substitutes for the two chosen families.
- Inline-block whitespace layout instead of flex/grid `gap`.
- Placeholder links. Every href resolves to a real route. **A planned-and-inert nav label is not a
  placeholder link and is permitted** — see below.
- Re-declaring tokens in a page instead of using the `style.css`/`app.css` variables, or
  re-implementing the nav/masthead/components instead of reusing `ClearyFi.*`.

### 10.1 Placeholder link vs planned-and-inert label

The anti-pattern above forbids a link that **promises a destination and doesn't deliver**. It does
not forbid naming something that isn't built yet. A **planned-and-inert label** is permitted, and is
the honest way to show a subject the product covers but hasn't shipped:

| | Placeholder link (**forbidden**) | Planned-and-inert label (**permitted**) |
|---|---|---|
| Markup | an `<a href>` — to `#`, to a 404, or to a stub page | no `href`, no click handler; not an anchor |
| Cursor | `pointer` — it invites a click | `default` — it doesn't |
| Color | normal link/accent treatment | `--mono-muted`, the same drained fill N/A values use |
| On hover | nothing, or a dead navigation | a `title` naming what the subject will hold |

The second is **§7's status vocabulary applied to navigation**: structurally absent, honestly
marked, self-explaining. Hiding it instead would suppress real information about what the product
covers. This is why the subject nav (§4.2) ships all seven subjects with four inert.

> **Source:** D2 — locked by operator 2026-07-26 · `ROADMAP_APP_V3.md` §2

---

## 11. Reference implementations

- **`static/company.html` (`/company/{symbol}`)** — the **parent**: the company hub —
  Fundamentals (metric cards), Statements (FY + quarterly periods, source-tag audit column,
  raw-JSON toggle, segments spike), Insider, Institutional, 13D/G; loading/404/empty states.
  The most complete reference; new pages descend from it. (`/explorer` merged in 2026-07-17.)
- **`static/components.html` (`/components`)** — the shared-component kitchen sink (`ClearyFi.*`):
  masthead, status legend, metric cards, provenance, disclosure, states, search.
- **`static/coverage.html` (`/coverage`)** — CUSIP resolution rate + coverage boundaries.

New pages are built the same way: load `style.css` + `app.css`, reuse the shell and `ClearyFi.*`
builders, and — above all — keep the honesty conventions.

---

## 12. Chart label placement (read before writing a chart builder)

Label collisions consumed roughly a third of the v3 prototype's design iterations. **No charting
library solves any of these** — d3 and Plot both place a label exactly where you tell them to. The
rules below are empirical; treat them as part of the chart spec, not as polish applied afterwards.

1. **Edge anchoring, not width arithmetic.** A centred label that would cross the canvas edge
   switches its `text-anchor` to `start`/`end` and pins to the edge. **Measure with
   `getComputedTextLength()`** — we render in a real DOM, so per-character width estimates (which
   the prototype had to use, and which clipped repeatedly) are strictly worse.
2. **Line height comes from computed `line-height`, never from font size.** A font-size-derived
   step is always short, and the error compounds down a stacked label block.
3. **Candidate-offset placement** for scatter-style labels: try right/left × baseline/above/below
   and take the first that clears every label already placed. If none fits, **drop the label** and
   leave the value on the `<title>` — an unreadable overlap is worse than a tooltip.
4. **The origin tick belongs to the x axis only.** Emitting both an x and a y label at index 0
   stacks two labels in the corner.
5. **Series names go in a legend when lines converge.** End-of-line labels collide precisely when
   the data is most interesting — e.g. every 13D/G line ending just above 5%.
6. **Author every chart at its container width.** Take the measured width
   (`ClearyFi.measuredWidth()`) and author to it; never author at a default and let the SVG scale
   down, which shrinks text below the legible floor. An expand/overlay view **re-authors** at the
   overlay width — it does not scale the inline copy up.
7. **Minimum effective text size is ~9px** after any scaling. Verify:
   `fontSize × (renderedWidth / viewBoxWidth) ≥ 9`.

> **Source:** RECONCILIATION.md §6 (v3 prototype) · adopted V3-P0, 2026-07-26

# Handoff — ClearyFi frontend (design implementation)

**Scope of this document: the frontend only.** Everything below is about markup, CSS, client-side
JS, design tokens, components, and page layout. It deliberately says nothing about how data is
produced, stored, or served — you do not need to know any of that to work on the UI. Treat data as
"JSON that arrives"; the only thing that matters to design is the **status vocabulary** (§6) and
the **honesty conventions** (§7), which are load-bearing product features rather than styling.

Canonical style reference: **`docs/STYLE_GUIDE.md`** — read it in full before building a new page.
This file is the "what is actually built, and where" layer on top of it.

---

## 1. The design language: "paper terminal"

A warm, calm developer tool over public filings — not a flashy SaaS dashboard.

- **Soft off-white paper** background, card surfaces slightly lighter than the page.
- **One chromatic accent: terracotta.** Interaction, emphasis, active state, links.
- **Two typefaces only** — `Hanken Grotesk` (human copy: titles, names, body) and
  `IBM Plex Mono` (machine: all numbers, tickers, tags, metadata, uppercase micro-labels).
- **Rounded corners + soft downward drop shadow** — never a hard offset shadow, never `blur: 0`.
- **All numbers tabular** (`font-variant-numeric: tabular-nums`); negatives in accounting
  parentheses `($108.5B)`.

Tokens live as CSS variables in `static/style.css` (base) and `static/app.css` (data-component
layer). **Never hard-code a hex in a page; never introduce a new hue.** The full token table —
paper/ink/border/accent/favorability/audit-badge families, with exact values and intended use — is
`docs/STYLE_GUIDE.md` §1.

Two sanctioned exceptions to "one accent," both narrow:

1. **Favorability trio** (moss / amber / brick) for *direction* on sector scores — always paired
   with a glyph (▲/▬/▼) and a number, never color alone, never a buy/sell verdict.
2. **Categorical chart color** — a multi-series chart whose marks are *distinct entities* may use a
   randomized Observable Plot categorical scheme for identity. Never to encode magnitude.

Prior art worth reading before a visual change: `docs/design/sector-app-prototype-v2/HANDOFF.md`
and the browsable `prototype.dc.html` next to it — the hi-fi prototype the sector app was built
from. `docs/layout_guides/00-global-conventions.md` … `04-*.md` are the per-page layout specs.

**Single theme.** The app is light-only by design. There is no dark mode and no
`prefers-color-scheme` branch — don't add one without a decision.

---

## 2. Where the frontend lives

Everything is under `src/secfin/api/static/`. Plain HTML + CSS + vanilla ES5-flavored JS — **no
build step, no framework, no bundler, no npm.** Pages are static files; the server just hands them
over. Edit a file, rebuild the container, reload.

| File | What it is |
|---|---|
| `style.css` | Base: design tokens (`:root`), typography, marketing/prose page styles |
| `app.css` + `app.js` | **Shared data-component layer** — the `ClearyFi.*` builders (§5). `app.js` is the big one (~205 KB) |
| `script.js` | Renders the **app shell** (fixed left sidebar + sticky topbar) into empty mounts |
| `suggest.js` | Standalone ticker/company autocomplete for the topbar search |
| `index.html` | Marketing landing page (hero code panel, problem, features, coverage, pricing) |
| `company.html` / `company.js` / `company.css` | **Company hub — the reference implementation** |
| `compare.html` / `.js` / `.css` | Side-by-side company comparison |
| `screen.html` / `.js` / `.css` | Cross-company screening UI |
| `manager.html` / `manager.js` | Institutional-manager profile |
| `coverage.html` | Data-coverage page |
| `components.html` | **Kitchen sink** — every `ClearyFi.*` component rendered on one page |
| `sector-analytics.html` / `sectorapp.js` / `sectorapp.css` | **Sector Analytics app** — its own self-contained shell (§4) |
| `sectors.html` / `sectors.js` / `sectors.css` | Legacy sector overview (superseded, still routed) |
| `guide.html` + `guide.css`, `methodology.html`, `privacy.html`, `terms.html`, `disclaimer.html` | Prose/legal pages, older static `.nav` |
| `infographic-template.html`, `social-slides.html` | Standalone marketing/graphic templates |
| `vendor/` | Vendored, CSP-safe: `d3.min.js`, `plot.umd.min.js`, `us-states.geojson` |
| `favicon.svg` / `.ico`, `robots.txt` | Static assets |

**Fonts are still CDN-linked** (Google Fonts, `preconnect` + one stylesheet link per page). Vendored
self-hosting is a known open item (§9). Chart libraries, by contrast, are **already vendored** and
must stay that way — never CDN-load a chart library on a data page.

### Routes → files

| Route | File |
|---|---|
| `/` | `index.html` |
| `/company/{symbol}` | `company.html` |
| `/manager/{cik}` | `manager.html` |
| `/compare`, `/screen`, `/coverage` | `compare.html`, `screen.html`, `coverage.html` |
| `/sectors` | `sector-analytics.html` (the v2 app) |
| `/sectors-legacy` | `sectors.html` |
| `/sector-analytics` | 301 → `/sectors` |
| `/explorer` | redirect → company hub Statements tab (the old Data Explorer was absorbed 2026-07-17) |
| `/components`, `/guide`, `/privacy`, `/terms`, `/disclaimer` | matching `.html` |

---

## 3. Shell A — the shared app shell (most data pages)

Rendered by `script.js` into empty mounts, so the nav link set lives in exactly one place. Pages
carry only this skeleton:

```html
<body class="app has-ctx" data-shell="screen">   <!-- has-ctx only when the page has a .controls bar -->
  <aside class="app-side" id="appSide" aria-label="Primary navigation"></aside>
  <div class="app-scrim" id="appScrim"></div>
  <div class="app-main">
    <header class="app-topbar" id="appTopbar"></header>
    <main class="page">…masthead / controls / legend / view / disclosure…</main>
    <div id="footer"></div>
  </div>
```

- **Sidebar** — logo, grouped links (Data → Company hub / Compare / Screen / Coverage; Reference →
  Docs & guide / Methodology / API Reference), and a "Data, not investment advice" foot.
  `<body data-shell="…">` marks the active link `.current` (accent-wash pill). Below 1024px it
  becomes an off-canvas drawer behind a hamburger.
- **Topbar** — global ticker/CIK search (`⌘K` / `Ctrl-K` / `/` focuses it) + an API Reference pill.
- **Content column** — `.page`, max-width 1440px, padding `12px 32px 72px`. Same column everywhere.
- **Masthead** — `ClearyFi.masthead()`: Hanken 800 title → right-aligned mono meta → hairline rule →
  optional lede. App-shell pages carry **no eyebrow** (the sidebar already brands the page).
- **Footer** — `ClearyFi.footer()`: thin rule, mono accent links (each with `↗`), muted tagline.
- **Sticky context** — `body.has-ctx` reserves `--ctx-h` so a `.controls` bar sticks under the
  topbar (≥1100px). Note: table headers inside a horizontal-scroll wrapper (`.matrix-scroll`) stay
  in flow — page-level sticky cannot work inside an overflow box.

**Load order matters.** CSS: Google Fonts → `style.css` → `app.css` → page CSS. JS: `suggest.js` →
`script.js` → `app.js` → page JS (`suggest.js` before `script.js` so the topbar search gets
autocomplete).

Marketing and legal pages deliberately keep the **older static `.nav`** markup with its own
hamburger — they are not inside the app shell.

---

## 4. Shell B — the Sector Analytics app (`/sectors`)

Newest and most involved surface. **It is intentionally self-contained**: it loads `style.css` (for
the tokens only) plus its own `sectorapp.css`, and builds its own paper-terminal shell in
`sectorapp.js`. It does **not** load `app.css`, `company.css`, `sectors.css`, or `script.js`.
It does load `app.js` (for `ClearyFi.*` helpers — `esc`, `fmt`, `measuredWidth`, `boxWhiskerChart`,
states) and `suggest.js` (header search).

Single page, one persistent selection state (sector / sub-industry / period / focal company),
rendered into `<div id="app">`. Layout: sidebar · main column with topbar → page title → sector
control bar → body (view rail + viewport + right rail).

**Five views**, four on the rail plus one drill-in:

| View | What it answers |
|---|---|
| **Sector** | How is this sector doing? Scorecard, decomposition, peer strip, biggest shifts, distribution spreads, geographic-mix + insider-flow cards |
| **Company** | Where does one filer sit vs peers? Peer dot-plots, search-driven focal company |
| **Compare** | How do two sectors differ? Theme spine, metric medians, composite radar, overlaid IQR strips |
| **Qualitative** | Honest "coming — Track 2" placeholder **layout** |
| **Filings** | Drill from Qualitative; also an honest placeholder layout |

Design notes specific to this app:

- **Compare uses A = `--accent` (terracotta) and B = `--pa-b`** — a second hue that is *categorical
  identity only* (which sector), never favorability.
- **Right rail** (Sector/Company/Compare/Qualitative): snapshot · "what's moving" feed placeholder ·
  how-to-read.
- The **Qualitative and Filings views are placeholders on purpose** — real layout, honestly labeled
  as not-yet-real, rather than fake content. Keep them honest if you touch them.
- The geographic-mix and insider-flow cards on the Sector view are **live, not placeholders** (they
  were wired up in July 2026). Both are value-neutral: a stacked bar with a hatched "other" band,
  and **N/A is never drawn as 0%**.

Live-vs-placeholder status, plus the governing "prototype fidelity with honest placeholders"
directive, is tracked in `docs/delivery/sector-app-followups.md`. Read it before assuming a card is
finished.

---

## 5. Component library — reuse, don't reinvent

All in `app.js` / `app.css`, all namespaced `ClearyFi.*`. `/components` renders every one of them —
open it first when you need to know what already exists.

- `statusChip()` — the status marker (§6). On every metric and derived value.
- `metricCard(mv)` — name + status chip, big mono value + basis tag, optional inline caveat with a
  left rule, built-in "Show your work" provenance. N/A cards drop the shadow and go tint-filled.
- `.stmt-table` — statement table: mono tabular amounts, source-tag + audit badge per row, tint
  header with a 2px ink underline, 14px rounded card.
- **Ticker chip** — mono, ink fill, paper text, 7px radius. The company identity token.
- `provenance()` — standalone "Show your work" (§7).
- `disclosure()` — dashed container, `+`/`−` toggle, honesty copy.
- `states.loading` / `empty` / `notFound` / `error` — loading is a pulsing accent dot + shimmer bars
  + a cold-path note; notFound is a mono `HTTP 404` in the flag color plus recovery chips.
- `mountSearch()` — for in-page flows needing a resolve callback (Compare's "Add a company"). The
  *global* search lives in the shell topbar, not here.
- **Charts** — `ClearyFi` builders over **vendored Observable Plot** (load `d3.min.js` before
  `plot.umd.min.js`; exposes `window.Plot`). Pages never call `Plot.plot()` directly. Every Plot
  chart wraps itself in `chartCard()` and takes its width from `measuredWidth(container, fallback)`
  — never a hardcoded pixel width. Plot builders return a **DOM node** (callers append it); the
  older hand-rolled string builders (`sparkline`, `trendChart`, `trajectoryChart`, `positionBar`)
  are unchanged and not migrated.
  - **Ranked bars take one fill** — length already encodes value; use *emphasis* (accent one mark,
    mute the rest) when one mark is the point.
  - **Magnitude stays single-hue** (the holder choropleth uses a randomized single-hue sequential
    scheme — never diverging, never green/red).
  - **Captions dedupe** — a standing caveat renders once per page, prominently; per-chart captions
    carry only what's specific to that chart.

---

## 6. Status vocabulary — every data point carries one

Four statuses, distinguished by **glyph + label + border style, never by color alone** (both the
accent and the flag color are warm, so color alone would be ambiguous as well as inaccessible).
Chip: mono, 8.5px, uppercase, 6px radius.

| Status | Glyph | Tag | Meaning | Border |
|---|---|---|---|---|
| OK | `●` | OK | Trustworthy value | 1px solid, border-strong |
| Approximate | `≈` | APPROX | Shown, but flagged imprecise | ext/flag family |
| Not applicable | `∅` | N/A | Structurally meaningless here | 1.5px **solid** |
| Not meaningful | `~` | N/M | Computable but would mislead | 1.5px **dashed** |

- **N/A and N/M are never rendered as `0`, `—`, blank, or an invented number.** Show the token in
  drained mono-muted, with the reason in provenance.
- **APPROX still shows the value** — the number is useful, the caveat rides alongside it.
- Solid border = hard structural (N/A); dashed = soft judgment (N/M). Keep that distinction.
- `statusLegend()` appears near the top of any page showing metrics.

---

## 7. Honesty conventions — these outrank aesthetics

A page that looks right but violates these is wrong. Full list in `docs/STYLE_GUIDE.md` §9.

1. **Never fabricate precision.** No zeros-as-missing, no blanks, no guesses.
2. **Descriptive, never prescriptive.** Ranks and position bars describe *where* a value sits, not
   whether it's good. Never color a metric good/bad, never pick a winner, never rank companies
   overall.
3. **Comparability is explicit.** Rankings exclude N/A and N/M; say so.
4. **Alignment is surfaced, not hidden** — fiscal-calendar differences, filing lag, TTM-vs-as-of go
   in headers/banners, never silently reconciled.
5. **Approximations are flagged and explained.**
6. **Coverage limits are surfaced** via `disclosure()` — empty ≠ "nothing filed."
7. **Data is as-of the latest filing, not real-time** — state it in the masthead meta.
8. **Nothing here is investment advice** — the disclosure block says so plainly.

**Provenance ("Show your work") is mandatory for any derived number.** Closed-by-default toggle
(mono, accent, `+`/`−`), opens in place, never blocks the primary read. It reveals: the **formula**
in plain language, the **basis** (TTM vs as-of, restatement basis, the date the value is current as
of), and **why {flag}** for any APPROX/N/A/N/M. **Basis is always labelled** — tag every value
`TTM` or `AS-OF` and never mix bases silently.

---

## 8. Anti-patterns (do not do these)

- New colors/hues or a second accent, outside the two narrow exceptions in §1.
- Green/red good-bad coloring, or ranking companies overall.
- Rendering a missing/inapplicable value as `0`, `—`, blank, or a guess.
- Dropping the status chip, basis tag, or provenance affordance on a derived number.
- Emoji or decorative icons. Graphics are data-driven charts only, kept literal.
- Inter/Roboto/Arial in place of the two chosen families.
- Inline-block whitespace layout instead of flex/grid `gap`.
- Placeholder links — every `href` resolves to a real route.
- Re-declaring tokens in a page instead of using the variables, or re-implementing the
  nav/masthead/components instead of reusing `ClearyFi.*`.
- CDN-loading a chart library on a data page (they're vendored for a reason).

---

## 9. Building and verifying a change

**Host Python is not usable for this project — work through Docker.** The image bakes `src/` in at
build time with no live mount, so **rebuild after every frontend edit** before looking at it in a
container:

```bash
docker compose build
docker compose up api          # then open http://localhost:8000
```

**Headless render check** (Puppeteer; drives real pages, writes screenshots, exit code is the
pass/fail signal). This is the standard gate for a UI change — run it *and eyeball the shots*:

```bash
docker compose --profile e2e up --abort-on-container-exit --exit-code-from e2e
# screenshots -> ./data/e2e-shots (gitignored); script -> scripts/headless_check.js
```

Add a shot for any new page or state you build. Two things to know about the current baseline:
console errors should be **0**, and there is a **known pre-existing failure** on the Company view
for a synthetic fixture in the no-network sandbox — it predates recent work and is not yours.

Checklist before handing a UI change off:

- [ ] Tokens only — no new hex, no new font/weight.
- [ ] Status chip + basis tag + provenance present on every derived number.
- [ ] N/A and N/M render as tokens, never `0`.
- [ ] Responsive: sidebar drawer below 1024px; wide content scrolls inside its own container, the
      page body never scrolls horizontally.
- [ ] e2e run green, screenshots eyeballed at desktop and mobile widths.
- [ ] Every `href` resolves to a real route.

---

## 10. Known open frontend items

- **Fonts are CDN-linked**, not self-hosted. Vendoring them is recommended for performance and
  privacy and has been an open follow-up for a while.
- **Favorability color rollout is partial** — followup **F4**: applied on the Sector view, still
  **open for the Company and Compare views**. Until it lands, those views remain color-free (arrow
  glyphs only). See `docs/delivery/sector-app-followups.md`.
- **Sub-industry control in the sector bar is a placeholder** (followup F6) — the control exists,
  the real option set does not.
- **URL does not reflect the active view** on view-switch in the sector app — deep-linking a view
  other than `compare` doesn't round-trip.
- **Company view's focal selector is not scoped to the selected sector** — it can offer companies
  outside the sector you're looking at.
- **Qualitative and Filings views are honest placeholder layouts**, by design. Don't fill them with
  invented content; they become real only when the underlying disclosure work is greenlit.
- **`sectors.html` (legacy sector overview) is superseded** by the v2 app but still routed at
  `/sectors-legacy`. It's dead weight to be removed once nothing points at it.

---

## 11. Reference implementations — open these first

1. **`static/company.html` → `/company/{symbol}`** — the **parent**. Tabs: Fundamentals, Statements,
   Insider, Institutional, 13D/G, plus loading/404/empty states. Every new data page descends from
   it. When in doubt, open the company hub and match it.
2. **`static/components.html` → `/components`** — the kitchen sink for `ClearyFi.*`.
3. **`static/sector-analytics.html` → `/sectors`** — the newest and most designed surface; the
   reference for the self-contained-app pattern.
4. **`static/coverage.html` → `/coverage`** — coverage boundaries page.

Docs that govern this work, in priority order: `docs/STYLE_GUIDE.md` (canonical) →
`docs/layout_guides/00-global-conventions.md` (+ `01`–`04` per-page specs) →
`docs/design/sector-app-prototype-v2/` (hi-fi prototype + its handoff) →
`docs/ROADMAP_UI.md` (what's shipped and what's planned) →
`docs/delivery/sector-app-followups.md` (live open-items list for the sector app).

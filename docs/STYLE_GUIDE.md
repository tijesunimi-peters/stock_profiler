# Profin UI — Style Guide (READ BEFORE BUILDING NEW PAGES)

This is the canonical style reference for every Profin data-facing page (Data Explorer,
Company hub / Fundamentals, Statements, Data coverage, and anything new). **Read this in full
before writing a new page.** It exists so a new screen looks like it was always part of the
product — same paper, same rules, same numeric treatment, same honesty conventions.

**The Data Explorer (`/explorer`) is the reference implementation, and every new data page is a
child of it.** New pages load the same base stylesheet (`/static/style.css`), the same top nav,
and the shared data-component layer (`/static/app.css` + `/static/app.js`), then add only what's
specific to them. When in doubt, open the Explorer and match it.

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

### Audit badges (data provenance — from `app.css`/`explorer.css`)
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

- **Top nav on every page** (§5) — the shared `.nav` from `style.css`. Fixed furniture; don't
  redesign per page.
- **Centered single column** under the nav: `.page` (max-width ~1040px), padding `12px 32px 72px`.
- Section rhythm: ~34px before a section header. Card grids use `gap:16px`
  (`repeat(auto-fill, minmax(240px, 1fr))`).
- **Always flex/grid + `gap`** for any group of siblings (chips, cards, meta rows). Never rely on
  inline-block whitespace.
- Radii are **rounded**: 7–8px on controls (inputs, buttons, pills, selects), 12–14px on cards,
  panels, and state boxes.

---

## 4. Signature treatments (the things that make it "Profin")

1. **Warm paper background** — `--bg-page` (`#F6F3EE`), flat (no dotted grid).
2. **Shared top nav** — logo (ink square + terracotta dot + "Profin") on the left, text links +
   an `API Reference` pill on the right, hamburger + `.nav-mobile` on small screens (wired by
   `static/script.js`). Copy the markup from `explorer.html` / any child page verbatim.
3. **Masthead** — mono terracotta eyebrow ("Profin — SEC …, normalized") → Hanken 800 title →
   right-aligned mono meta caption → a single `1px solid --border-tint-rule` **rule** → optional
   intro paragraph. (This is the Explorer's `.explorer-hero`; `Profin.masthead()` emits the same.)
4. **Soft drop shadow** (§1) on cards/panels — never a hard offset, never `blur:0`.
5. **Section headers** — mono number (`01`, accent) + Hanken 800 name + a `2px solid --ink`
   underline.
6. **Segmented controls / pills** — 1.5px `--border-strong` border, 7–8px radius; active =
   terracotta accent fill, white text; period pills active = `--accent-wash` fill + accent border.
7. **Inverse button** — `--ink` fill, `--bg-page` text, mono uppercase label, 8px radius.
8. `::selection { background:#E9C9A9; }` (from `style.css`).

---

## 5. Standard page shell (copy this skeleton)

Every data page opens with the shared nav + a masthead and closes with a footer. New pages load,
in order: Google Fonts → `style.css` → `app.css` → their own page CSS; and `script.js` →
`app.js` → their page JS.

- **Nav:** the shared `.nav` block (see `explorer.html`). Mark the current section's link
  `class="current"` where one applies.
- **Masthead:** `Profin.masthead({ eyebrow, title, meta, lede })` — matches the Explorer hero.
- **Footer:** `Profin.footer()` → `.app-footer`: a thin top rule, mono accent links to real
  routes (`/explorer`, `/coverage`, `/docs`, each with `↗`), and a muted tagline "Profin ·
  public SEC data, cleaned & queryable".

Links: accent color, mono. Resolve every href to a real destination — never leave placeholders.

---

## 6. Components inventory (reuse, don't reinvent — all in `app.js`/`app.css`)

- **Status chip / marker** — `Profin.statusChip()` / §7. Present on every metric and derived value.
- **Metric card** — `Profin.metricCard(mv)`: name + status chip header; big mono value + basis
  tag; optional inline caveat note (left `--ext-border` rule); built-in "Show your work"
  provenance. `--bg-card` + soft shadow; N/A cards drop the shadow and use `--bg-tint`.
- **Statement table** — `.stmt-table`: mono tabular amounts, `source_tag` + a US-GAAP/EXT badge
  per row, `--bg-tint` header with a 2px ink underline, rounded 14px card with soft shadow.
- **Ticker chip** — mono, `--ink` fill, `--bg-page` text, 7px radius. The company identity token.
- **Sparkline** *(when trend lands)* — inline SVG polyline, `--accent` 1.5px stroke, self-scaling,
  last point marked. Hidden (with a mono "no series" note) when the value is N/A or N/M.
- **Provenance / "Show your work"** — `Profin.provenance()` / §8.
- **Disclosure / data-notes** — `Profin.disclosure()`: dashed `--border-strong` container,
  `+`/`−` toggle, honesty copy pulled to match `docs/DATA_MODEL.md`.
- **States** — `Profin.states.loading` (pulsing accent dot + shimmer bars + cold-path note) /
  `empty` (calm "filing on record, no mapped fields") / `notFound` (mono `HTTP 404` in
  `--ext-color` + recovery chips) / `error`.
- **Global search** — `Profin.mountSearch()`: ticker-or-CIK input that resolves and routes to the
  company hub.
- **Plot charts (Phase 5, 13F portfolio viz)** — `Profin.*` builders backed by **vendored
  Observable Plot** (`/static/vendor/d3.min.js` + `/static/vendor/plot.umd.min.js`, load d3
  first; exposes `window.Plot`). Pages never call `Plot.plot()` directly — every chart is a
  `Profin` builder that owns its Plot spec, the tokens (one terracotta accent, IBM Plex Mono
  numerals) and its honesty caption. Plot builders return a **DOM node** (callers append it),
  unlike the older string builders. The hand-rolled `sparkline`/`trendChart`/
  `trajectoryChart`/`positionBar` stay as they are — not migrated. Shared chrome + sizing:
  every Plot chart wraps itself in `chartCard()` (`.plot-chart`: eyebrow title, scrollable
  body, caption/note) — one visual dialect per page — and takes `opts.width` from its mount
  site via `Profin.measuredWidth(container, fallback)`, never a hardcoded pixel width.
  **Ranked bars take one fill** — bar length already encodes the value, so a
  darker-where-bigger lightness ramp double-encodes it; use *emphasis* (accent one mark,
  mute the rest) when one mark is the point. Tint still distinguishes mark *kinds* (e.g.
  solid = opened/closed outright vs lighter = resized) — kind is identity, not magnitude.
  **Captions dedupe:** a standing caveat (e.g. "reported 13F long positions only") renders
  once per page, prominently; each chart's caption carries only what is specific to that
  chart. Repeating the same line under every chart trains readers to skip captions.

---

## 7. Status vocabulary (LOAD-BEARING — every data point carries one)

Four statuses, distinguishable by **glyph + label + border style**, never by color alone
(accessibility + honesty — doubly important here since the accent and the flag color are both
warm). Chip = mono, 8.5px, uppercase, 6px radius.

| Status | Glyph | Tag | Meaning | Chip style (`app.css`) |
|---|---|---|---|---|
| OK | `●` | OK | Trustworthy value | text ink-soft, transparent bg, `1px solid --border-strong` |
| Approximate | `≈` | APPROX | Shown, but flagged imprecise | text/bg/border = `--ext-*` family |
| Not applicable | `∅` | N/A | Structurally meaningless for this company/industry | text ink-soft, bg `--bg-badge`, `1.5px solid --border-strong` |
| Not meaningful | `~` | N/M | Computable but would mislead | text ink-soft, transparent, `1.5px dashed --mono-muted` |

Rules:
- **N/A and N/M are never rendered as 0, blank, or an invented number.** Show the token
  (`N/A` / `N/M`) in drained `--mono-muted`, with the reason in provenance.
- **APPROX still shows the value** with the `≈` marker — the number is useful, the caveat rides
  alongside it (e.g. the R5 debt-split undercount).
- Solid border = N/A (hard structural), dashed border = N/M (soft judgment). Keep that distinction.
- A legend (`Profin.statusLegend()`) explaining all four appears near the top of any page that
  shows metrics.

These map 1:1 onto the API: `MetricValue.status` is exactly `ok | approximate | na | nm`.

---

## 8. Provenance / "Show your work" (mandatory for derived numbers)

Any computed/derived figure must explain itself via progressive disclosure. `Profin.metricCard`
builds this in; `Profin.provenance()` is the standalone builder. A closed-by-default "Show your
work" toggle (mono, accent, `+`/`−`) reveals:
- **Formula** — mono, plain-language (`Net income ÷ Revenue`).
- **Basis** — TTM vs as-of; **restatement basis** (as-restated / as-originally-reported); the
  filing date the value is current as of (`as_of`). Surface fiscal-calendar mismatches here.
- **Why {flag}** — for any APPROX/N/A/N/M, the specific reason (from `MetricValue.reason`).

Provenance is closed by default, opens in place, and never blocks the primary read.

**Basis is always labelled** — income & cash-flow metrics are **TTM**, balance-sheet metrics are
**as-of** a date. Tag every value (`TTM` / `AS-OF`) and never mix bases silently. Quarterly views
say so explicitly (flows are TTM; EPS is N/M — not summable across quarters).

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
   `Profin.disclosure()`.
7. **Data is as-of the latest filing — not real-time.** State it in the masthead/meta.
8. **Nothing here is investment advice.** The disclosure block says so plainly.

---

## 10. Anti-patterns (do NOT do these)

- New colors/hues, or a second accent. One terracotta accent; the ext family is for caveats only.
- Color-coding metrics green/red for good/bad, or ranking companies overall.
- Rendering a missing/inapplicable value as `0`, `—`, blank, or a guess.
- Dropping the status chip, the basis tag, or the provenance affordance on a derived number.
- Emoji or decorative icons. Generated graphics are data-driven charts only — the hand-rolled
  SVG builders and the vendored-Plot `Profin` builders (§6) — never decoration; keep them
  literal, and never CDN-load a chart library on a data page.
- Inter/Roboto/Arial substitutes for the two chosen families.
- Inline-block whitespace layout instead of flex/grid `gap`.
- Placeholder links. Every href resolves to a real route.
- Re-declaring tokens in a page instead of using the `style.css`/`app.css` variables, or
  re-implementing the nav/masthead/components instead of reusing `Profin.*`.

---

## 11. Reference implementations

- **`static/explorer.html` (`/explorer`)** — the **parent**: query flow, loading/404/empty
  states, raw-XBRL→clean audit. The most complete reference; new pages descend from it.
- **`static/components.html` (`/components`)** — the shared-component kitchen sink (`Profin.*`):
  masthead, status legend, metric cards, provenance, disclosure, states, search.
- **`static/company.html` (`/company/{symbol}`)** — the company hub: Fundamentals (metric cards)
  + Statements tabs, period selector (annual + quarterly), status system, provenance.
- **`static/coverage.html` (`/coverage`)** — CUSIP resolution rate + coverage boundaries.

New pages are built the same way: load `style.css` + `app.css`, reuse the nav and `Profin.*`
builders, and — above all — keep the honesty conventions.

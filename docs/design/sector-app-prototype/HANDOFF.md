# SEC Sector Analytics ("ClearyFi") — Implementation Handoff

Implementation-ready brief for Claude Code. A working reference implementation
lives in `Sector Analytics.dc.html` — point Claude Code at it for exact spacing,
the deterministic seed function, and the full constituent/weight tables.

---

## 1. What it is

A single-page analytics app built **entirely from SEC-filed data**. Four
"altitudes" of the same sector dataset, switched via an in-page left rail while
**sector / period / company selection persist across all four views**.

Sample sector: **Semiconductors** (~28 illustrative filers, deterministic
synthetic figures). All numbers must be traceable/openable — mark synthetic
data clearly. "Data, not investment advice."

---

## 2. Design language ("paper terminal")

**Palette (light, warm):**

| Token | Hex |
| --- | --- |
| page bg | `#F6F3EE` |
| card bg | `#FDFBF7` |
| tint bg | `#EFE9DE` |
| badge bg | `#F0E4D6` |
| ink | `#1C1A16` |
| body ink | `#544F46` |
| muted ink | `#5C574D` |
| soft ink | `#6B6459` |
| mono-muted | `#8B8579` |
| border / border-strong | `#E7E0D3` / `#D8D1C4` |
| rule | `#E5DFD3` |

**Accents:**
- **Terracotta (single primary accent):** `#C0703A`, hover `#A85F30`, ink `#8A5A2F`, wash `#F3E4D5`.
- **Categorical-only second hues** (identity, never favorability): GAAP blue `#3D6A8A` (bg `#E4EDF2`, border `#CDDCE4`); ext/flag red `#B04A3A` (bg `#F5E2DA`, border `#E8C4B4`).

**Type:** Hanken Grotesk (headings/body, weights 400–900); IBM Plex Mono (labels,
numbers, captions — uppercase 9–11px, letter-spacing 0.06–0.12em).

**Card:** 12–14px radius, 1px border, soft shadow `0 18px 40px -26px rgba(40,30,15,.35)`.

---

## 3. Honesty rules — LOAD-BEARING, do not violate

1. **No good/bad color.** Never color a metric green/amber/red for favorability.
   Direction = arrow glyphs (↑ ↓ →) + position on a track only. One terracotta
   accent throughout.
2. **Composite scores are provisional.** Every 0–100 theme score is
   percentile-averaged and favorability-adjusted across 11 sectors; label them
   provisional and make every score **click-to-decompose** into its weighted
   constituents (weight × constituent percentile → contribution).
3. **No winner in compare.** True-length bars; inverted metrics ("lower is
   better") get a text marker, never a flipped fill. A vs B color is categorical
   identity, not a verdict.
4. Filing-event feed is **walled off** from metrics. Coverage/status legend
   always visible (OK / ≈ approx / ∅ N/A / ~ N/M).

---

## 4. Layout shell

- Fixed **210px left sidebar** — brand ("ClearyFi" + "SEC data"), nav groups
  (Data: Company hub / Compare / Screen / Coverage / **Sector analytics**;
  Reference: Docs & guide / Methodology / API reference).
- Sticky **top header** — search stub (⌘K) + API-reference link.
- **Main column** (max 1440px): page title + as-of note, then a persistent
  **sector control bar**, then a two-column body: **132px view rail**
  (Sector / Company / Compare / Qualitative) + content.

**Sector control bar (persistent, all views):** sector pills · sub-industry
pills · meta row (filer count, period, coverage) · status legend · "pin to
compare" button.

---

## 5. The four views

- **Sector:** 7-theme scorecard grid → click tile to expand (drives peer strip +
  drill-down); click score → decomposition panel. Peer strip = 11-sector bar
  chart, focal sector accented. Biggest-shifts list (standardized Δ vs own
  history, threshold flag). Drill-down tiles = horizontal track with IQR band
  (wash) + median tick. Filing-event feed with categorical status dots.
- **Company:** left percentile rail (per-theme P-values) + composite rank card.
  Main = per-metric **dot-plot distributions**: each peer a clickable dot, IQR
  band, median line, focal filer as a terracotta diamond; click a dot to
  re-focus.
- **Compare:** two sector selectors (A = terracotta, B = blue). Paired composite
  bars per theme with signed gap label. Metric-median cards, bar length
  normalized per metric, raw value at bar end, "lower is better" tag on inverted
  metrics.
- **Qualitative:** risk-theme landscape (coverage bar + YoY direction chip:
  new/rising/fading/stable, taxonomy frozen YoY), emerging-risks box,
  going-concern watch, litigation, per-filer signal matrix (risk-factor count,
  new, going-concern ●, litigation ●).

---

## 6. Data & scoring

- **Percentile-averaged rollup:** constituent metrics → favorability-adjusted
  percentile vs peer set → weighted average → 0–100. Inverted metrics
  (net debt/EBITDA, DSO, cash-conversion cycle) invert the percentile before
  averaging.
- **Same-store rule:** when coverage < threshold (default 80%), compute deltas
  same-store and label it. Sample uses 94% → full peer set.
- Seven themes: Profitability & returns, Growth, Financial health, Cash &
  investment, Operating efficiency, Accounting quality, Structure & activity.

---

## 7. Functional behaviors (interactions & state)

### Global state (persists across all four views)

Single store: `{ view, sectorIdx, subIdx, expandedTheme, decompTheme, focalTicker, compareA, compareB }`.

- **Sector pills** (control bar): click → set `sectorIdx`, reset `subIdx` to
  none. Every view re-derives from the new sector immediately (scorecard scores,
  ranks, deltas, peer-strip highlight, compare-A default, company peer set).
- **Sub-industry pills:** toggle (click again to clear). When active, narrows the
  peer count and rank basis ("of N sub-industries" instead of "of 11 sectors")
  and swaps the company context pill (NAICS vs SIC). Meta row updates filer
  count + label.
- **View rail (Sector/Company/Compare/Qualitative):** click → set `view`.
  Selection state (sector, sub, focal, compare pair) is preserved — switching
  views never resets it.
- **Pin to compare** button: sets `view='compare'` and `compareA = current
  sectorIdx`. Button shows a checked/"pinned" state whenever the current sector
  equals compareA or compareB.

### Sector view

- **Theme tile click:** sets `expandedTheme`. Drives three things at once — the
  tile gets the accent-wash highlight, the **peer strip** re-renders for that
  theme (11-sector bars, focal sector accented), and the **drill-down** panel
  swaps to that theme's dispersion tiles.
- **Score click (inside a tile):** `stopPropagation` so it doesn't also expand;
  toggles `decompTheme`. Opens the decomposition panel showing each
  constituent's weight, a contribution bar (normalized to the largest
  contributor), and signed contribution; recomputed composite shown in the panel
  title. Click again or "− close" to dismiss.
- **Biggest-shifts / filing feed:** display-only; status dots are categorical
  (accent/ext/muted), never favorability.

### Company view

- **Peer-distribution dot click:** any non-focal dot is clickable → sets
  `focalTicker`; the diamond marker and every per-metric percentile (P-value),
  the rank card, and the left percentile rail all recompute for the new filer.
- **Composite rank number:** click → opens the same decomposition mechanism
  (dashed underline signals openable).
- Percentiles are favorability-adjusted (inverted metrics flip) and exclude
  N/A · N/M filers.

### Compare view

- **A pills / B pills:** independently set `compareA` / `compareB`. All paired
  composite bars, signed gap labels (with leading-sector abbreviation), and
  metric-median cards recompute. A is always terracotta, B always blue —
  identity only.
- Gap label emphasis: |gap| ≥ 10 renders in full ink, else soft ink. **No winner
  is ever declared.**

### Qualitative view

- **Theme row click:** stubbed to open representative filing language (hook:
  `open` handler per theme). Direction chips are computed from frozen-taxonomy
  YoY deltas (new/rising/fading/stable).
- Matrix and side panels are display-only; ● marks are presence flags, not
  scored.

### Non-navigating stubs (wire on integration)

Sidebar nav items, top search (⌘K), API/docs/coverage footer links, and the
qualitative "read filing language" panel are placeholders with `preventDefault`
no-op handlers.

---

## 8. Stack — Tailwind CSS

No chart library, no heavy framework. Tailwind CSS for all styling; vanilla JS
(or a light layer like Alpine.js) only where interaction requires it (§7).

### Tailwind config

- Register the §2 palette as named theme colors in `tailwind.config`
  (`theme.extend.colors`) — e.g. `page`, `card`, `tint`, `ink`, `body`, `muted`,
  `accent`/`accent-hover`/`accent-ink`/`accent-wash`, `gaap`, `ext`. Then use
  `bg-card`, `border-border`, `text-ink`, etc. Keep them as CSS vars behind the
  Tailwind names if you want runtime theming.
- Fonts via `theme.extend.fontFamily`: `font-sans` → Hanken Grotesk,
  `font-mono` → IBM Plex Mono. A small `@layer components` `.mono-label` for the
  uppercase-tracked mono captions (`font-mono text-[9.5px] tracking-[0.12em]
  uppercase text-muted`).
- Card shadow as a named `boxShadow` token (the §2 soft shadow).
- Layout with Tailwind grid/flex + `gap-*` (sidebar + main; view-rail + content;
  scorecard `grid grid-cols-[repeat(auto-fit,minmax(158px,1fr))]`). Avoid
  absolute positioning except inside charts.

### Charts — Tailwind-styled divs, no SVG needed

All four chart types are positioned `<div>`s inside a `relative` container;
compute the value→percent in JS and set it via inline `style` (`left`/`width`/
`height`) — Tailwind handles the rest (`bg-accent-wash`, `rounded`, `border`).

- **Drill-down track & compare metric bars:** `relative` track; IQR band =
  `absolute bg-accent-wash rounded` with inline `left:q1%`/`width:(q3−q1)%`;
  median = 2px `absolute bg-ink` at `left:median%`; focal marker = a 12px
  `rotate-45` diamond div. Compare bars: `width = value / max(a,b) * 100%` —
  **true length, never flipped** for inverted metrics; add a "lower is better"
  text marker instead.
- **Company dot-plots:** peers = `absolute w-2 h-2 rounded-full bg-border-strong`
  at inline `left:value%` + `top:calc(50% + jitter)` (deterministic, e.g.
  `(i%5−2)*13%`), each with an `onclick` → set focal; focal filer = larger
  `rotate-45` diamond on top (`z-10`). IQR band + median line as above.
- **Peer strip & percentile rail:** `flex` row/column of bar divs; height/width
  via inline `%`; focal sector/theme `bg-accent`, others `bg-border-strong`.
- **Percentiles / quantiles:** tiny JS helper (sort + linear interpolation) for
  q1/median/q3/min/max. Favorability adjustment: for inverted metrics use
  `1 − percentile` before averaging (see §6).
- **Color:** never map a metric value to a color scale — the honesty rules (§3)
  forbid favorability color. `accent` (terracotta) is the only accent; A vs B in
  compare is a fixed 2-value categorical mapping (`accent` vs `gaap`).

### Interactivity (vanilla JS / Alpine)

- Hold the §7 store as a plain JS object (or Alpine `x-data`); on any change,
  re-render the affected view (template string → `innerHTML`, or toggle
  `hidden`/classes and update text + inline `%` styles).
- View rail, sector dropdown, sub-industry pills, theme expand, score
  decomposition, dot re-focus, compare A/B selectors are click handlers that
  mutate the store and re-render. Stubs (sidebar, search, footer links) use
  `preventDefault`.
- Sector **dropdown**: a button toggling an `absolute` menu div; a `document`
  click listener (or Alpine `@click.outside`) closes it on outside click.

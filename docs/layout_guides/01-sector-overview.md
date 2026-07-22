# Altitude 1 — Sector Overview

**Prerequisite:** read `00-global-conventions.md` first. This page assumes the
style, sidebar, tile grammar, direction handling, header, state, and composite
scoring rules defined there.

This is the **landing altitude.** Its entire job is to answer "how is this sector
doing?" in about five seconds, using composite judgments — not raw ratios. Raw
metrics are one click deeper. Resist the urge to add more to this page; density
here is the thing we are protecting against.

---

## Information ordering (top to bottom)

1. **Page header bar** (shared header, see `00 §6`)
2. **Left rail** — view switcher + section jump list
3. **Health scorecard** — seven composite theme tiles (the hero of the page)
4. **Theme drill-down panel** — one expanded theme, using the metric-tile grammar
5. **"What's moving" feed** — filing-event stream, sits beside the drill-down

Nothing else belongs above the fold. Governance/compensation and full risk text
live on the qualitative page (`04`), not here.

---

## 1. Page header bar

Shared header from `00 §6`: sector selector (with dropdown affordance), peer-set
pill ("62 filers"), as-of period, coverage indicator. The **sector selector is
the primary control** on this page — changing it re-derives everything below and
propagates to all other altitudes.

## 2. Left rail (view switcher)

Fixed-width rail (~130px) on the left. Contents, in order:
- Small `text.muted` label "View".
- Four altitude entries: **Sector** (active here), **Company**, **Compare**,
  **Qualitative**. Active item uses the accent background/text treatment; others
  are `text.secondary`.
- A hairline divider, then secondary entries if the app needs them.

Active-state styling must come from the existing style guide. See `00 §2` — the
relationship between this rail and the existing sidebar is an **open question to
confirm with the user**, not an assumption.

## 3. Health scorecard (hero)

A responsive grid of **seven composite tiles**, one per theme. Grid uses
auto-fit columns (min ~150px) so it reflows; on a wide viewport this is a single
row, wrapping to two rows when narrow.

Each tile contains, in order:
- **Theme name** (`text.secondary`).
- **Composite score** 0–100 (large, `text.primary`) with a **trend delta** chip
  beside it (e.g. "+4"), colored by favorability (`positive`/`caution`/`negative`)
  with an up/down/flat icon.
- **Percentile line** (`text.muted`) — "82nd pctile", **vs all sectors** (this is
  the one place cross-sector percentile is allowed; label it as such).

The seven themes and the constituent metrics that roll into each (final weighting
is an **open decision — see `00 §9`**):

| Theme | Constituent metrics (SEC-derived) |
|-------|-----------------------------------|
| Profitability & returns | gross/operating/net margin, ROA, ROE (book), ROIC |
| Growth | revenue growth YoY & sequential, 3-yr CAGR, growth dispersion |
| Financial health | debt/equity, net debt/EBITDA, interest coverage, current & quick ratios |
| Cash & investment | operating cash flow margin, FCF, FCF conversion, capex intensity, R&D intensity |
| Operating efficiency | inventory turnover, DSO, DPO, cash conversion cycle, asset turnover, revenue/employee |
| Accounting quality | restatement rate, material-weakness rate, late-filing rate, accruals ratio |
| Structure & activity | net entrants (S-1) vs exits (Form 15), M&A (8-K 1.01/2.01), insider net buy/sell, institutional flow |

Interaction: clicking a tile **expands that theme** in the drill-down panel below
(section 4). The default expanded theme on load should be confirmed with the user
(suggested default: Growth).

## 4. Theme drill-down panel

Occupies the left ~60% of the row beneath the scorecard. Header line: theme name
+ a `text.muted` hint ("drill-down, one shared tile format").

Body: a small stack of **metric tiles** (see `00 §3`) for that theme — typically
three to four of its most informative constituents. Each tile is the full grammar
(median value, IQR band, median tick). Because no single company is focal on the
sector page, the marker element is omitted here; the dispersion band itself is the
message. Include at least one **dispersion metric** (e.g. top-vs-bottom-quartile
growth spread) with a caption interpreting whether the sector is broad-based or
carried by a few names.

## 5. "What's moving" feed

Occupies the right ~40% of the same row. This surface is **deliberately walled off
from the analytical panels** — it carries *change/events*, they carry *state*.

Header: "What's moving" + `text.muted` hint ("filing events"). Body: a vertical
list of recent events, each a row with a leading icon (colored by severity), a
bold one-line title, and a `text.muted` source line naming the form/item and
count. Event types and their sources:

| Event | Source | Icon severity |
|-------|--------|---------------|
| Executive/CFO departure | 8-K Item 5.02 | caution |
| Restatement filed | 8-K Item 4.02 | negative |
| Auditor change | 8-K Item 4.01 | caution |
| M&A activity | 8-K Item 1.01 / 2.01 | neutral/accent |
| Insider buying/selling shift | Form 4 (net ratio) | accent |
| New entrant | S-1 | neutral |
| Deregistration / exit | Form 15 | neutral |

Order events by recency and materiality. Keep it a feed, not a table.

---

## Interactions summary

- Change sector (header) → re-derive page + propagate state to all altitudes.
- Click theme tile → expand that theme in the drill-down.
- Click a filer name/marker anywhere → navigate to **Company drill-down** (`02`)
  for that filer, preserving sector/period.
- The drill-down and feed never reorder the scorecard; the scorecard is the
  stable spine of the page.

## States

Per `00 §10`. Additionally: if composite scoring is not yet defined (`00 §9`),
render tiles with a visible "provisional" affordance so no one mistakes
placeholder scores for final output.

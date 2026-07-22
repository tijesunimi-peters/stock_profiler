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

1. **Page header bar** (shared header, see `00 §6`) — sector pill row, then
   sub-industry pill row
2. **Left rail** — view switcher + section jump list
3. **Health scorecard** — seven composite theme tiles (the hero of the page)
4. **Peer strip** — one row of bars placing this sector against the others on the
   focused theme (`00 §3b`)
5. **Biggest shifts band** — three to five largest metric deltas (`00 §12`)
6. **Theme drill-down panel** — one expanded theme, using the metric-tile grammar
7. **"What's moving" feed** — filing-event stream, sits beside the drill-down

Nothing else belongs above the fold. Governance/compensation and full risk text
live on the qualitative page (`04`), not here.

---

## 1. Page header bar

Shared header from `00 §6`: peer-set pill ("62 filers"), as-of period, coverage
indicator — plus the **sector selector, which is the primary control on this
page and on every other altitude.**

Per `00 §11.1` the selector is a **persistent pill row, not a dropdown.** It
occupies its own line directly beneath the header metadata, with a **second pill
row for sub-industries** (`00 §11.3`) beneath it that appears once a sector is
selected. Changing either row re-derives everything below and propagates the new
peer set to all altitudes, preserving the expanded theme (`00 §11.2`).

A **pin control** (`00 §11.4`) sits at the right end of the sector row, adding
the current sector to the compare altitude (`03`).

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
- **Rank badge** (`00 §3a`, `text.muted`) — "3rd of 11", the sector's rank against
  all sectors on that theme, ordered by favorability (`00 §5`). Required on every
  tile: because only one sector is on screen (`00 §11`), the badge is what tells
  the reader whether 68 is good. When a sub-industry is active, the badge relabels
  to rank against sibling sub-industries.

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
(section 6) and **re-points the peer strip** (section 4) to that theme. The
default expanded theme on load should be confirmed with the user (suggested
default: Growth).

Clicking the **score itself** (not the tile body) opens the score decomposition
required by `00 §9a`: constituents, weights, and each constituent's contribution
this period. Confirm with the user whether this opens in place or as a panel.

## 4. Peer strip

A single row beneath the scorecard, per `00 §3b`: one small bar per sector on the
**currently expanded theme**, selected sector in `accent`, others neutral. Height
is small — this is context, not a chart. It re-renders whenever the expanded
theme changes.

This strip exists specifically because the product shows one sector at a time. It
answers "is this number unusual?" without the reader leaving the page, and it is
the cheapest substitute for the cross-sector grid this product deliberately does
not have. Caption in `text.muted` naming the theme and the basis
("financial health · 11 sectors · Q1 FY26").

## 5. Biggest shifts band

A compact horizontal band beneath the peer strip, per `00 §12`. Three to five
rows, each: metric name (`text.secondary`) + signed delta (`text.primary`,
colored by favorability per `00 §5`) + a `text.muted` basis note
("vs prior quarter" or "same-store, 41 of 62 filers" per `00 §6`).

Selection rule: the metrics that moved most **relative to their own history**
(largest standardized change), not the largest absolute change — otherwise
volatile metrics dominate the band every period. Threshold-crossing metrics
(`00 §13`) are pinned to the top of this band with their flag.

Do not confuse this with the "what's moving" feed in section 7. This band is
quarterly metric deltas; that feed is daily filing events. `00 §12` covers the
naming rule.

## 6. Theme drill-down panel

Occupies the left ~60% of the row beneath the shifts band. Header line: theme name
+ a `text.muted` hint ("drill-down, one shared tile format").

Body: a small stack of **metric tiles** (see `00 §3`) for that theme — typically
three to four of its most informative constituents. Each tile is the full grammar
(median value, IQR band, median tick). Because no single company is focal on the
sector page, the marker element is omitted here; the dispersion band itself is the
message. Include at least one **dispersion metric** (e.g. top-vs-bottom-quartile
growth spread) with a caption interpreting whether the sector is broad-based or
carried by a few names.

## 7. "What's moving" feed

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

- Change sector or sub-industry (header pill rows) → re-derive page + propagate
  peer set to all altitudes, **preserving the expanded theme** (`00 §11.2`).
- Click theme tile → expand that theme in the drill-down and re-point the peer
  strip.
- Click the score on a tile → open its decomposition (`00 §9a`).
- Pin control (header) → add this sector to the compare altitude (`00 §11.4`).
- Click a filer name/marker anywhere → navigate to **Company drill-down** (`02`)
  for that filer, preserving sector/period.
- The drill-down and feed never reorder the scorecard; the scorecard is the
  stable spine of the page.

## States

Per `00 §10`. Additionally: if composite scoring is not yet defined (`00 §9`),
render tiles with a visible "provisional" affordance so no one mistakes
placeholder scores for final output.

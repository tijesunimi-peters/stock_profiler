# SEC Sector Analytics — Global Conventions

**Read this file before implementing any individual page.** It defines the rules
that every altitude shares: style adherence, sidebar handling, the repeated
metric-tile pattern, data conventions, and cross-page state. The four page specs
(`01`–`04`) assume everything here and only describe what is unique to that page.

This is also the reusable pattern guide for **future pages** in this product.
When a new page is added, it should conform to the conventions below rather than
inventing its own layout language.

---

## 0. What this product is

A dashboard built **entirely from SEC-filed data** (no market/price data) that
lets a user judge the health of an industry or sector, see where a single filer
sits within its peers, compare two sectors, and read the qualitative disclosure
picture. There are four "altitudes," each its own page:

| # | Page | Question it answers | Spec file |
|---|------|--------------------|-----------|
| 1 | Sector overview | How is this sector doing? | `01-sector-overview.md` |
| 2 | Company drill-down | Where does this filer sit vs peers? | `02-company-drilldown.md` |
| 3 | Sector compare | How do two sectors differ? | `03-sector-compare.md` |
| 4 | Qualitative disclosures | What are filers saying / worried about? | `04-qualitative-disclosures.md` |

The overriding design goal is **preventing information overload**: front pages
carry judgments (scores, direction, rank), and raw metrics live in the
drill-down. Never put everything on one screen.

---

## 1. Style adherence — DO NOT introduce new styling

There is an **existing style guide** in this codebase. It governs fonts and
colors and it wins over anything implied here.

Rules:

- **Do not add any new font family or font weight** beyond what the existing
  guide defines.
- **Do not introduce any color or hex value** that is not already a token in the
  existing guide.
- **Find the existing design tokens** (CSS variables, theme file, or equivalent)
  and reuse them. Do not hardcode colors.
- The tables in this document describe styling in **semantic roles**
  (e.g. "primary text", "accent", "positive/negative direction"). Your job is to
  **map each role to the existing token**, not to pick a value.
- If the existing guide is missing a role you need (for example, it has no
  "warning" color), **stop and ask** which token to use. Do not invent one.

Semantic roles referenced throughout the specs — map these to existing tokens:

| Role | Used for |
|------|----------|
| `text.primary` | Values, headings, filer names |
| `text.secondary` | Labels, supporting copy |
| `text.muted` | Captions, hints, "as of" metadata |
| `surface.page` | Page background |
| `surface.card` | Raised cards / panels |
| `surface.inset` | Metric-tile background, track backgrounds |
| `border.hairline` | Default dividers and card borders |
| `accent` | Primary selection, "sector A" in compare |
| `secondary-accent` | "Sector B" in compare (a second distinct hue from the guide) |
| `positive` | Favorable trend / good percentile |
| `caution` | Rising risk / mid values |
| `negative` | Unfavorable trend / going-concern / restatement |

Typography and casing follow the existing guide. If the guide is silent, default
to **sentence case everywhere** (headings, labels, buttons) — never Title Case,
never ALL CAPS.

---

## 2. Sidebar / navigation — ASK before colliding

There is an **existing sidebar**. The four pages need to be reachable, and the
user moves between altitudes frequently, so navigation must be first-class.

Rules:

- **Do not assume** where these entries go or what they are named.
- Before adding, renaming, reordering, or grouping any sidebar item:
  **check the existing sidebar first.**
- If a proposed label or route **collides** with an existing sidebar item, or if
  it is unclear where the new entries belong, **STOP and ask the user** how to
  resolve it. Do not overwrite, rename, merge, or reorder existing items on your
  own judgment.
- The four altitudes are closely related. Confirm with the user whether they
  should be (a) a nested group under one parent sidebar item, (b) four top-level
  items, or (c) an in-page view switcher with a single sidebar entry. **Do not
  pick one silently.**

Regardless of the sidebar decision, each page carries an **in-page view
switcher / left rail** listing the altitudes (Sector · Company · Compare ·
Qualitative), because users pivot between them mid-analysis. This is described
per page.

---

## 3. The universal metric-tile grammar

Every numeric metric, on every page, is displayed the **same way**. Learn it
once, read it everywhere. This is the single most important consistency rule.

A metric tile shows, in this order:
1. **Metric label** (`text.secondary`) and the **sector median** value
   (`text.muted`), on one line.
2. A **horizontal track** containing:
   - a shaded **interquartile band** (Q1→Q3) using `surface.inset` filled with
     `accent` at low emphasis,
   - a **median tick** (thin vertical mark, `text.primary`),
   - a **position marker** for the focal entity when one exists (the selected
     company as a filled diamond in `accent`; a peer dot cloud on the company
     page).
3. An optional one-line **caption** (`text.muted`) for interpretation
   (e.g. "wide spread — a few names carry the sector").

Do not vary this grammar between pages. A revenue-growth tile, an
interest-coverage tile, and an R&D-intensity tile all render identically.

### 3a. Rank badge (companion to every score)

Because the product is **single-sector at a time** (§11), a bare score has no
context — the reader cannot tell whether 68 is good. Therefore **any composite
score or theme score is always rendered with a rank badge** in the form
`68 · 3rd of 11`, where the ordinal is the sector's rank against all sectors on
that theme. The badge sits directly beneath the score in `text.muted`, and the
ordinal itself is **favorability-driven** (§5), not raw-percentile-driven.

The rank badge is not optional decoration. It is the mechanism that repays the
cross-sector context lost by showing one sector at a time.

### 3b. Peer strip (contextual, one per page)

A **peer strip** is a single row of small bars, one per sector, showing where
every sector sits on **one currently-focused metric or theme**. The selected
sector's bar uses `accent`; all others use a neutral fill from the guide. Labels
are abbreviated sector names in `text.muted`, with the selected one in
`accent`.

Rules:
- **One peer strip per page, maximum.** It is context, not content.
- It **follows focus**: it re-renders to whatever theme or metric the user last
  expanded or drilled into. Do not pin it permanently to one metric.
- It is **not clickable-to-navigate by default** — confirm with the user whether
  clicking a bar should switch the selected sector, since that competes with the
  header selector.

---

## 4. Percentile-first

At overview and compare altitudes, **lead with percentile or rank**, not the raw
value. "12th percentile" is instantly legible; "18% effective tax rate" is not,
unless the reader already knows the sector norm. Raw values are shown, but they
are secondary to the entity's position within the peer set. Percentiles are
always **within the peer set**, never cross-sector, unless explicitly labeled
"vs all sectors" (only the composite scorecard does this).

**Percentile and rank are both shown, and they answer different questions.**
Percentile places an entity inside its own peer set; rank (§3a) places the
*sector* against other sectors. Overview and compare tiles carry the rank badge;
company-page tiles carry the peer percentile. Never substitute one for the other
without relabeling.

---

## 5. Direction handling — favorability, not raw rank

Some metrics are **"lower is better"** (leverage, net debt/EBITDA, days sales
outstanding, effective tax rate in some framings, accruals). Every metric must
carry a **`higherIsBetter` flag.**

- Color (positive/caution/negative) and any "good/bad" affordance are driven by
  **favorability**, computed from the flag — **not** by the raw percentile.
- A company below the median on net debt/EBITDA should read as **positive**
  (green), even though its percentile rank is low.
- In the compare view, the "winner" bar for an inverted metric must be handled so
  it does not read backwards against normal metrics (see `03` for the specific
  rule).

Do not hardcode direction per page; store it with the metric definition so all
pages inherit it.

---

## 6. Shared header elements

Every page's top bar includes, left to right:
- **Context / breadcrumb** — the current sector (and company, on the drill-down).
- **Peer-set size** — e.g. "62 filers", as a quiet pill.
- **As-of period** — e.g. "Q1 FY26".
- **Filing-coverage indicator** — e.g. "94% filed", signaling how complete the
  period's filings are. This matters: early in a reporting period, aggregates are
  provisional. Show coverage prominently and never hide it.

**Same-store comparison while coverage is incomplete.** A sector median computed
from 40% of filers is not comparable to last quarter's median computed from 100%
of them, and quarter-over-quarter deltas built that way are artifacts of the
filing calendar rather than real change. Until coverage crosses a threshold,
compute every period-over-period delta on a **same-store basis** — only filers
that reported in *both* periods — and label it as such in `text.muted`
("same-store, 41 of 62 filers"). Above the threshold, switch to the full peer
set and label the switch. **Confirm the coverage threshold with the user**; do
not pick one silently.

The peer set is defined by **SIC or NAICS code**. SIC is coarse (diversified
firms land in one bucket); prefer a NAICS crosswalk or a curated mapping if one
exists. **Confirm the peer-set definition with the user** if it is not already
established — it determines every median and percentile in the product.

---

## 7. Cross-page state (what carries over)

When a user switches altitude, preserve:
- **Selected sector** (and the peer set it implies),
- **As-of period**,
- **Selected company** (so jumping Company → Sector → Qualitative keeps context).

Switching sector on any page updates the peer set everywhere. Losing this state
on navigation is a primary cause of the "overwhelm / lost my place" feeling, so
treat it as a hard requirement.

---

## 8. Data provenance & formatting

- **Every displayed value must be traceable** to a specific form + XBRL tag or
  filing item. Build with a source reference attached to each metric so a value
  can link back to the filing. This is non-negotiable for the qualitative page
  and strongly preferred everywhere.
- XBRL tagging is inconsistent across filers. Revenue, R&D, and debt line items
  in particular need **normalization before aggregation.** Flag to the user where
  a metric depends on inconsistently tagged data.
- **Round every displayed number** to sensible precision: integers for counts,
  1–2 decimals for percentages and ratios, thousands separators for currency.
  Never surface raw float artifacts.
- Use **tabular figures** (`font-variant-numeric: tabular-nums`) for any column
  or stacked set of numbers so they align.

---

## 9. Composite scores — OPEN DECISION, confirm before building

The overview scorecard (§`01`) shows a 0–100 **composite score** per theme. The
method for rolling constituent metrics into a single score is **not yet
defined.** Do not invent one silently. Before implementing the scorecard,
**ask the user** to confirm:
- which constituent metrics roll into each of the seven themes,
- how they are weighted and normalized (e.g. percentile-averaged, z-scored),
- how the trend delta is computed (vs prior quarter / prior year).

Until defined, build the scorecard against a clearly-labeled placeholder scoring
function so it is obvious the numbers are not final.

### 9a. Score transparency is mandatory

A single number labeled "financial health" will be trusted further than it
deserves — the same abstraction that makes the product digestible also makes it
opaque. Every composite score must therefore be **openable**, showing:
- the constituent metrics that rolled into it,
- the weight applied to each,
- each constituent's own contribution to the score this period (so the reader can
  see *which* input moved the composite),
- the normalization method in one line of `text.muted`.

Build this affordance at the same time as the score, not later. A score without a
visible decomposition should not ship.

---

## 10. Universal states

- **Loading**: show tile skeletons in place; never a full-page spinner that hides
  the layout.
- **Empty / no coverage**: if a sector/period has too few filers for a stable
  median, say so explicitly ("insufficient filings for this period") rather than
  rendering a misleading distribution. Confirm the minimum-filer threshold with
  the user.
- **Error**: fail per-panel, not per-page — one broken metric should not blank the
  scorecard.

---

## 11. Single-sector focus — the selection model

The product shows **one sector at a time.** There is no multi-sector heatmap
home; the sector selector is the spine of the entire product. This is a
deliberate anti-overload choice, and it carries obligations.

### 11.1 The selector

- Rendered as a **persistent pill row**, not a dropdown. Visible options let a
  user step through sectors quickly and keep the previously-viewed sector in
  peripheral memory for comparison; a dropdown hides both.
- **Pinned to the top of every altitude.** Switching sector must never require
  navigating back to the overview.
- Selected pill uses the `accent` background/text treatment; unselected pills use
  `text.primary` on a hairline-bordered transparent surface. Pull both from the
  existing guide (§1).
- If the sector count is large enough that pills wrap past two rows, **ask the
  user** whether to group them or fall back to a combobox. Do not silently
  truncate.

### 11.2 State preservation is on the metric axis, not the page axis

This is the behavior that makes one-at-a-time viable for comparison work.

> If a user is reading the accruals-ratio detail for sector A and selects
> sector B, they land on the **accruals-ratio detail for sector B** — not on
> sector B's page header.

Sector selection changes the *subject* of the current view; it never resets the
view. The same holds for the expanded theme on the overview, the metric stack on
the company page, and the theme landscape on the qualitative page. Preserve, in
addition to the items in §7: **expanded theme, focused metric, and scroll
anchor.**

### 11.3 Sub-industry drill

Sector medians hide most of the signal. "Technology" blends semiconductors,
software, and hardware, which share almost nothing on capex intensity or
deferred revenue. Once a sector is selected, offer a **second pill row of its
sub-industries**, derived from the peer-set classification in §6.

- Selecting a sub-industry narrows the peer set for every median, percentile,
  and rank on the page, and updates the peer-set pill count.
- The rank badge (§3a) must relabel when a sub-industry is active — ranks are
  then against sibling sub-industries, not against sectors. Label it explicitly.
- **Confirm the sub-industry taxonomy with the user** alongside the peer-set
  decision in §6; they are the same decision at two depths.

### 11.4 Pin-to-compare (escape hatch)

Single-sector focus is the default, but users eventually need two sectors side by
side. Provide a small **pin** control on the sector header. Pinned sectors
accumulate into the compare altitude (`03`) rather than opening a second panel
in place.

The compare page is specified for **two** sectors. Allow at most two pins by
default; if a user attempts a third, raise the N-way question (`03`
extensibility note) rather than cramming a third bar into the paired layout.

---

## 12. Change-first surfaces

Users mostly care about what is **different** this period, not the standing
level. Every altitude that shows state should also carry a compact
**"biggest shifts"** band: the three to five metrics that moved most against
their own history, each as metric name + signed delta + favorability color.

Two naming rules, because these are easy to confuse:
- **"Biggest shifts"** = *metric deltas*, quarterly cadence, derived from XBRL
  aggregates. Lives with the analytical panels.
- **"What's moving"** = *filing events*, daily cadence, derived from 8-K/Form 4/
  S-1 flow. Lives in the walled-off feed (`01 §5`).

Do not merge these two surfaces and do not reuse each other's labels. They differ
in cadence, source, and meaning, and merging them makes a quarterly aggregate
look like breaking news.

---

## 13. Threshold alerts

Do not rely on the user scanning for problems. Where a metric crosses a defined
threshold against its own history — material-weakness rate doubling, insider net
buying at a multi-year high, going-concern count rising — the product should
**raise it**, as a flag on the relevant tile and an entry in the appropriate
change surface (§12).

- Thresholds are stored with the metric definition alongside `higherIsBetter`
  (§5), not hardcoded per page.
- Alert copy states the fact and the comparison basis, nothing more
  ("material-weakness rate 4.1%, highest in 8 quarters"). No adjectives.
- **Confirm the threshold set and the lookback window with the user** before
  building. An alert layer that fires too often is worse than none.

---

## 14. Metric budget — what is on screen by default

The catalog of SEC-derivable metrics is far larger than any page should show.
Default views carry roughly **20 metrics across the seven themes**; everything
else lives behind an "all metrics" expansion or a saved custom view.

Guidance for what stays out of the default:
- **Annual-cadence, niche disclosures** — governance and compensation (DEF 14A),
  say-on-pay outcomes, board tenure, pension funding, CAM themes. These warrant
  their own tucked-away surface, not front-page space.
- **Anything the reader cannot act on at sector altitude** — single-filer trivia
  belongs on the company page.

When adding a metric to a default view, something else comes out. Treat the
budget as fixed and **raise the tradeoff with the user** rather than growing the
page.

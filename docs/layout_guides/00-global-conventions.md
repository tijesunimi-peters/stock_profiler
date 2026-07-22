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

---

## 4. Percentile-first

At overview and compare altitudes, **lead with percentile or rank**, not the raw
value. "12th percentile" is instantly legible; "18% effective tax rate" is not,
unless the reader already knows the sector norm. Raw values are shown, but they
are secondary to the entity's position within the peer set. Percentiles are
always **within the peer set**, never cross-sector, unless explicitly labeled
"vs all sectors" (only the composite scorecard does this).

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

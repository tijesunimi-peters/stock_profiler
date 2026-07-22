# Altitude 4 — Qualitative Disclosures

**Prerequisite:** read `00-global-conventions.md` first.

This page deliberately uses a **different grammar** from the numeric altitudes.
Narrative disclosure (risk factors, legal proceedings, going concern, MD&A) does
**not** quantify honestly on a 0–100 scale, so this page does not try. Instead it
does three things: **cluster** the text into themes, surface **what is new**, and
keep the **actual filing language one click away.** Do not force this content
into the metric-tile grammar.

Sources: 10-K Item 1A (risk factors), Item 3 (legal proceedings), the
going-concern determination (auditor opinion / notes), Item 1C (cybersecurity),
and MD&A.

---

## Information ordering (top to bottom)

1. **Header / breadcrumb bar**
2. **Two-column body**
   - **Left (wider):** risk-factor theme landscape
   - **Right (narrower):** emerging-risk box, going-concern watch, litigation summary
3. **Per-filer signal matrix** (full width, below)

---

## 1. Header / breadcrumb bar

Breadcrumb: sector (`text.muted`) → chevron → "Qualitative disclosures"
(`text.primary`). Peer/period pill ("62 filers · FY25 10-Ks"). Right side: the
sections being read ("Item 1A · 3 · 1C · MD&A") so the reader knows the basis.

Beneath it, the **same sector and sub-industry pill rows** as every other
altitude (`00 §11.1`, `00 §11.3`). Two page-specific cautions:

- Narrowing to a sub-industry shrinks the filer count fast, and the theme model
  needs a minimum corpus to cluster stably. If a sub-industry falls below the
  clustering threshold, **suppress the theme landscape and show the per-filer
  signal matrix instead** (per the states section below) rather than rendering an
  unstable cluster set. Say why, in `text.muted`.
- Switching sector preserves the **selected theme** where a comparable theme
  exists in the pinned taxonomy, and otherwise falls back to the top theme with a
  `text.muted` note. This follows `00 §11.2`, adapted: the taxonomy is per-sector,
  so metric-axis preservation is best-effort here, not guaranteed.

**No peer strip on this page.** Coverage percentages across sectors are not
comparable when each sector has its own frozen taxonomy, and a strip would imply
they are. This is a deliberate exception to `00 §3b`.

## 2a. Risk-factor theme landscape (left, wider — the anchor)

Header: "Risk-factor themes" + `text.muted` hint ("share of filers citing · YoY
direction").

A vertical list of themes. Each row is a three-column grid and is **clickable**:

- **Column 1** — theme name (`text.primary`).
- **Column 2** — a **coverage bar**: share of filers in the sector citing this
  theme, filled with `accent`. Coverage (a count) is the honest measure here —
  **not** a sentiment score.
- **Column 3** — a **direction chip**, right-aligned, one of:
  - "new" pill (`secondary-accent`/pro tone) — theme appeared this year,
  - rising (up icon, `caution`),
  - fading (down icon, `positive`),
  - stable (dash, `text.muted`).

**Clicking a theme** opens the representative filing language for that theme
across filers (this is where the "reading" affordance lives — deliberately behind
a click so raw prose never crowds the overview). Implement the click via the
app's normal navigation/detail pattern.

Example themes for a semiconductor sector (illustrative; real themes come from the
topic model): foundry/supply concentration, export controls & geopolitics,
customer concentration, cyclical demand/inventory, IP & patent litigation, talent
& skilled labor, capital intensity, AI-demand dependence (new), water/energy for
fabs.

## 2b. Right column (stacked)

Three panels, top to bottom:

**Emerging this year** — a tinted box (`caution` background). The
highest-value surface on the page: risks that are **net-new or spiking** in the
language year over year (e.g. "AI-demand concentration — cited by 27 filers, 0
last year"). Numeric dashboards can never catch these because they show up in
prose long before they hit the financials. Each item: bold title + a one-line
`text` note in the same tint.

This panel is a **producer for the shared alert layer** (`00 §13`): a theme
crossing its emergence threshold should also raise a flag the user can see from
the sector overview, so a disclosure signal is not missed just because the reader
never navigated to this altitude. Keep the alert copy count-based
("cited by 27 filers, 0 last year") — the "count, don't editorialize" rule below
applies to alerts as much as to this page.

**Going-concern watch** — a card bordered with `negative`. Header with a count
("2 / 62"). Body: a short list of flagged filers, each with the **nature of the
flag** in `text.muted` ("substantial doubt", "covenant waiver"). Keep this
**sober and factual** — it is a binary auditor determination, not a score. No
alarmist styling beyond the border/count.

**Material litigation** — a plain card. Header with total filer count. Body: the
dominant **litigation categories** with counts (e.g. patent/IP, antitrust/export
enforcement, securities). Category + count, not narrative.

## 3. Per-filer signal matrix (full width)

Header: "Per-filer signals" + `text.muted` hint ("flags derived from narrative
sections").

A bordered table/grid. This mirrors the numeric drill-down's spirit but **swaps
distributions for flags** — dots and counts, not bars — signaling these are
discrete disclosures, not continuous measures. Columns:

| Column | Content |
|--------|---------|
| Filer | name (`text.primary`, bold) |
| Risk factors | count of Item 1A risk factors (`text.secondary`) |
| New | count of net-new risks this year (pro/`secondary-accent` if > 0, else dash) |
| Going concern | flagged dot (`negative`) or dash |
| Litigation | active dot (`text.secondary`) or dash |

Consider adding a **cybersecurity** column (Item 1C, effective for fiscal years
ending on/after 15 Dec 2023) once coverage is broad enough — confirm with user.

---

## Methodology notes the implementer must respect

- **Theme clustering needs a pinned taxonomy.** Use an embedding-based topic model
  over Item 1A, but **freeze the taxonomy year over year.** If themes are
  re-clustered each period, the "rising/new/fading" deltas become artifacts of
  re-clustering rather than real disclosure change. This is what makes YoY
  comparison trustworthy — do not skip it.
- **Every derived flag must be traceable to a filing span** (`00 §8`). A user must
  be able to jump from any signal to the exact source language. Qualitative
  signals lose all credibility the moment they cannot be verified against the
  filing.
- **Count, don't editorialize.** Coverage %, filer counts, category counts — not
  sentiment scores. The credibility of this page rests on it not pretending to
  quantify tone.

## States

Per `00 §10`. If a sector's filings are too few to cluster meaningfully, show the
raw per-filer signal matrix and suppress the theme landscape rather than
presenting an unstable cluster set.

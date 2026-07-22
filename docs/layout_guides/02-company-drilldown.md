# Altitude 2 — Company Drill-down

**Prerequisite:** read `00-global-conventions.md` first.

This page shows **one filer placed inside the actual distribution of its peers.**
The governing principle: the company is **never shown alone.** Every number
arrives with its peer context attached, so the reader sees not just *that* the
company is at the 74th percentile but *what the pack looks like* around it.

---

## Information ordering (top to bottom)

1. **Header / breadcrumb bar**
2. **Left rail** — the company's theme percentiles + composite rank card
3. **Main column** — peer-distribution dot-plots, one per metric

---

## 1. Header / breadcrumb bar

Left to right:
- Breadcrumb: sector name (`text.muted`) → chevron → **company name + ticker**
  (`text.primary`, larger).
- Context pill: "SIC 3674 · rank 11 / 62" (peer classification + composite rank).
- Right side: the **filing basis** — "10-Q · Q1 FY26" — so the reader knows which
  filing the figures come from.

Changing the sector or period here follows the shared state rules (`00 §7`).

## 2. Left rail — percentile summary

Fixed-width column (~186px). This is the company's shape at a glance, before any
distribution is read. Contents in order:

- Label "Percentile vs peers" (`text.secondary`).
- **Seven theme percentile bars**, one per theme from `01`'s scorecard, in the
  same order. Each bar: theme name (`text.secondary`) + "P##" (`text.muted`),
  above a thin horizontal bar filled to the percentile. **Bar color is driven by
  favorability** (`00 §5`), banded roughly as: high = positive, mid = accent,
  low = caution. Do not color by raw percentile for inverted metrics.
- A **composite rank card** at the bottom (`surface.inset`): "Composite rank
  11 / 62" with a quarter-over-quarter movement line ("up 4 spots QoQ", colored
  by favorability).

## 3. Main column — peer distribution dot-plots

Header: "Peer distribution" + `text.muted` legend ("each dot a filer · shaded band
= IQR · line = median · ◆ = [company]").

Then a **vertical stack of distribution rows**, one per metric, separated by
hairlines. Each row:

- **Header line**: metric name (`text.primary`, bold) on the left; on the right,
  the company's value + percentile ("value 24.1% · P74"), `text.secondary`.
- **Distribution track** (taller than the sector-page tiles to hold the dot
  cloud):
  - shaded **IQR band** (Q1→Q3), `accent` at low emphasis,
  - **median tick**, `text.muted`,
  - a **dot per peer filer**, low-opacity `border.stronger`, positioned by value
    with slight vertical jitter so overlapping dots remain visible — this dot
    cloud is the whole point; it reveals whether the pack is tight or scattered,
    unimodal or bimodal,
  - the **focal company marker**: a filled **diamond** in `accent` with a short
    stem, drawn on top at the company's position.

Recommended default metrics (confirm the set with the user; each carries its
`higherIsBetter` flag per `00 §5`):

| Metric | Direction | Source |
|--------|-----------|--------|
| Net margin | higher better | income statement (XBRL) |
| Revenue growth YoY | higher better | income statement (XBRL) |
| Net debt / EBITDA | **lower better** | balance sheet + income statement |
| FCF margin | higher better | cash flow statement |
| Inventory turnover | higher better | income statement + balance sheet |
| Effective tax rate | context-dependent | tax footnote / income statement |

**Direction matters visually here.** For "lower is better" metrics, a company to
the left of the median is favorable; make sure the percentile shown and any
color affordance reflect favorability, not raw position (`00 §5`).

---

## Interactions

- Click any **peer dot** → switch the focal company to that filer (re-render in
  place), preserving sector/period. Consider a hover tooltip naming the peer.
- Breadcrumb sector name → back to **Sector overview** (`01`).
- Left-rail theme bar → optionally scroll/expand the corresponding metrics in the
  main column (confirm with user whether bars are navigational).

## States

Per `00 §10`. If the focal company has not filed for the current period, show its
**most recent filing** with an explicit "as of [period]" note rather than
dropping it from the distribution or showing stale data unlabeled.

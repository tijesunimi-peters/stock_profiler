# SEC Sector Analytics ("ClearyFi") — Implementation Handoff

A comprehensive brief for Claude Code. The working reference implementation is
**`Sector Analytics.dc.html`** — open it in a browser to see every layout,
interaction, and the exact spacing/copy. This document describes what it does,
how it behaves, and where each number comes from, so it can be rebuilt in a
production stack.

---

## 1. What it is

A single-page analytics app built **entirely from SEC-filed data**. It presents
one sector's fundamentals and disclosures at five levels ("views"), all sharing
one persistent selection state (sector / sub-industry / period / focal company).
Sample sector: **Semiconductors** (~28 illustrative filers; figures are
deterministic synthetic stand-ins, clearly provisional). Tagline: *"Data, not
investment advice."*

**Hard constraint — SEC financials only.** Every metric derives from SEC filings
(10-K/10-Q XBRL facts, 8-K events, Forms 3/4/5, S-1, 12b-25, auditor reports,
narrative sections). **No market data** (prices, market cap, P/E, EV/EBITDA,
dividend/buyback yield, valuation multiples, returns) anywhere until market data
is explicitly available.

---

## 2. Design language ("paper terminal")

**Palette (light, warm)** — define as CSS variables / theme tokens:

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
| border-tint / rule | `#E2DACB` / `#E5DFD3` |

**Accents**
- **Terracotta (single primary accent):** `#C0703A`, hover `#A85F30`, ink `#8A5A2F`, wash `#F3E4D5`.
- **Categorical-only second hues** (identity, never favorability): GAAP blue `#3D6A8A` (bg `#E4EDF2`, border `#CDDCE4`); ext/flag red `#B04A3A` (bg `#F5E2DA`, border `#E8C4B4`).

**Type:** Hanken Grotesk (headings/body, 400–900); IBM Plex Mono (labels,
numbers, captions — uppercase 9–11px, letter-spacing 0.06–0.12em).
**Card:** 12–14px radius, 1px border, soft shadow `0 18px 40px -26px rgba(40,30,15,.35)`.

---

## 3. Honesty rules — LOAD-BEARING, do not violate

1. **No good/bad color.** Never color a metric green/amber/red for favorability.
   Direction is shown with arrow glyphs (↑ ↓ →) and position on a track only; one
   terracotta accent throughout. (The only red/ext usage is for *categorical*
   flags like restatement / going-concern / material-incident, never as a "bad
   value" scale.)
2. **Composite scores are provisional.** Every 0–100 theme score is
   percentile-averaged and favorability-adjusted across sectors; it is labeled
   provisional and is **click-to-decompose** into its weighted constituents.
3. **No winner declared.** In Compare, bars are true-length; inverted metrics get
   a "lower is better" text marker, never a flipped fill. A vs B color is
   categorical identity, not a verdict.
4. Filing-event feed ("What's moving") is walled off from metrics. Coverage /
   status legend (OK / ≈ approx / ∅ N/A / ~ N/M) is always visible.

---

## 4. Global layout & shell

- **Fixed 210px left sidebar** — brand ("ClearyFi" + "SEC data"); nav groups
  (Data: Company hub / Compare / Screen / Coverage / **Sector analytics**;
  Reference: Docs & guide / Methodology / API reference). Nav items are stubs.
- **Sticky top header** — search stub (⌘K) + API-reference link.
- **Main column** (max 1440px): page title + as-of note, then a persistent
  **sector control bar**, then a body with a **132px view rail**, the content
  column (**capped at 960px** so panels don't stretch on wide screens), and a
  **sticky 262px right rail** that appears ≥1240px and hides below.

**Sector control bar (persistent across all views)**
- **Sector dropdown** (button + menu; active item checked/accent-washed; closes on select).
- **Sub-industry pills** (toggle; narrows peer count & rank basis; swaps company context pill NAICS↔SIC).
- **Meta row**: filer count · period · coverage, plus the status legend.
- **Pin to compare** button → jumps to Compare with this sector as A; shows a "pinned" state when the current sector is A or B.

**Right rail** (Sector view): **Sector snapshot** (filers/period/coverage/focused
theme) · **What's moving** Track-2 filing feed (walled off) · **How to read this**
note + Methodology link.

---

## 5. The five views

### 5.1 Sector view — three-scope analytical arc
- **01 · Health scorecard** — 7 composite theme tiles (score, ↑/↓/→ delta, "P## vs
  all sectors", "N of M" rank). Provisional banner. **Peer strip** ("where this
  sector sits" — one bar per sector on the focused theme, focal sector accented)
  sits directly under the grid. **Geographic revenue mix** (ASC 280 stacked
  region bar + legend) and **Insider flow** (Forms 3/4/5 net buy/sell ratio +
  buyer/seller split) close the section.
- **02 · What drives it** — full-width **decomposition** panel (constituent weight
  · contribution bar · signed contribution; open by default on the focused
  theme) followed by **Biggest shifts** (largest standardized YoY moves, with a
  "notable" flag).
- **03 · Distribution** — one merged dispersion block with a scope toggle
  **[This theme] / [All metrics]** (IQR band + median tick per metric).

### 5.2 Company view
- Left sticky rail: per-theme **percentile bars** (P-values) + a **composite rank**
  card (click to open decomposition).
- Main: per-metric **dot-plot distributions** — each peer a clickable dot, IQR
  band, median line, focal filer a terracotta diamond. Each row has a
  **click-to-expand sparkline** → an inline 8-quarter trend chart (area+line,
  quarter axis, hi/lo labels, start→now caption).
- **Segment & geographic mix** (ASC 280, by-segment and by-region stacked bars).
- **Filing history & flags** — recent 10-K/10-Q/8-K/Form 4 timeline with
  restatement / material-weakness / timely-filer badges.

### 5.3 Compare view (sector-vs-sector)
- Two independent sector selectors (A = terracotta, B = blue).
- **Composite scores** — paired bars per theme with signed gap label (|gap| ≥ 10
  emphasized).
- **Composite profile radar** — the 7 themes as two overlaid polygons + a
  "reading the shape" note (full width).
- **Metric medians & spread** — per-metric cards: paired median bars (normalized
  per metric, raw value at bar end) **and** overlaid IQR bands + median ticks for
  both sectors on a shared axis. "lower is better" marker on inverted metrics.
- No winner; A/B color is identity only.

### 5.4 Qualitative view
- **Risk-factor themes** — share-of-filers coverage bar + YoY direction chip
  (new/rising/fading/stable; taxonomy frozen YoY). Each row: a persistent
  **Filings →** link (opens the Filings view) and click-to-expand
  **representative language** (verbatim excerpt + source + "Open filings in
  ClearyFi").
- **Emerging this year** / **Going-concern watch** / **Material litigation** side
  panels.
- **Per-filer signal matrix** (risk-factor count, new, going-concern ●, litigation ●).
- **Disclosure landscape** section (8 blocks): **Cybersecurity** (Item 1C + 8-K
  1.05), **Critical Audit Matters**, **Auditor landscape** (share + changes +
  tenure), **Risk-factor volume** (Item 1A word-count trend + net-new),
  **Non-GAAP & charges**, **Late & deficient filings** (12b-25 / Item 9A / 4.02),
  **Human-capital & climate** (Item 1 + voluntary climate).
- **Every filer count is click-to-reveal** — expands the specific tickers behind
  the number (emerging risks, cyber incidents, auditor changes, litigation total
  & per category, deficient filings).

### 5.5 Filings view (on-site theme drill)
Reached from any risk-theme "Filings →" or "Open filings in ClearyFi". Shows:
breadcrumb (sector › Risk theme › name), coverage + direction chip, filing count,
the representative-language block, **form-type tabs** (All / 10-K / 10-Q / 8-K),
and a **paginated filing list** (6/page; prev/next + numbered pages; "1–6 of 14"
range label). Each row: filer ticker + company name + accession no., form badge,
filed date (sorted newest-first), section label, and the matched cited passage.
Back link returns to the previous view. Everything resolves in-app — no EDGAR
redirect.

---

## 6. Interaction & state model

**Single store**, shared across all views:
`{ view, sectorIdx, subIdx, sectorMenuOpen, expandedTheme, decompTheme, drillScope,
focalTicker, sparkOpen, compareA, compareB, themeLangOpen, filerListOpen,
filingsTheme, prevView, filingsPage }`.

Key behaviors:
- **Sector dropdown** → sets `sectorIdx`, clears sub-industry, re-derives every view.
- **Sub-industry pill** → toggles `subIdx`; narrows peer count / rank basis / context pill.
- **View rail** → sets `view`; all selection state preserved across views.
- **Pin to compare** → `view='compare'`, `compareA = sectorIdx`.
- **Scorecard tile** → sets `expandedTheme` (drives decomposition + theme-scoped dispersion + peer strip together).
- **Score number** → toggles `decompTheme` (stopPropagation so it doesn't also expand the tile).
- **Distribution scope toggle** → `drillScope` = theme | all.
- **Peer dot (Company)** → sets `focalTicker`; recomputes rail, rank, all dot-plots, segment/geo, filings, sparklines.
- **Sparkline** → toggles `sparkOpen` (per metric) → inline trend chart.
- **Compare A/B pills** → set `compareA` / `compareB`; recompute bars, radar, spread cards.
- **Risk-theme row** → toggles `themeLangOpen` (representative language) OR "Filings →" sets `filingsTheme` + `view='filings'`.
- **Filer count chips** → toggles `filerListOpen` (per id) → reveals tickers.
- **Filings pager** → `filingsPage`; reset to 0 on open.
- Stubs (sidebar, search ⌘K, footer links, form tabs) use `preventDefault` no-ops.

---

## 7. Data sources — where every number comes from (SEC EDGAR)

**Financial statement metrics (10-K / 10-Q XBRL facts)**
- Margins (gross/operating/net), ROIC, revenue growth/CAGR/sequential, net
  debt/EBITDA, interest coverage, current ratio, OCF margin, FCF & conversion,
  capex & R&D intensity, inventory turnover, DSO, cash-conversion cycle, asset
  turnover, revenue/employee, effective tax rate, accruals ratio.
- Restructuring / impairment charges: XBRL facts + footnotes.

**Segment & geographic mix** — ASC 280 segment disclosure in the 10-K (by
business and by geography).

**Insider flow** — Forms **3 / 4 / 5** (net buy/sell $ ratio, buyer/seller counts, direction).

**Filing-event feed / "What's moving"** — **8-K** item-tagged events (2.02 earnings,
1.01/2.01 M&A, 4.01 auditor change, 4.02 restatement, 5.02 exec change, 1.05
cybersecurity incident, S-1 new entrant).

**Structure & activity** — S-1/424B (entrants), Form 15/25 (exits), 8-K M&A,
Forms 3/4/5 (insider), 13F/13D-G (institutional/activist — when added).

**Composite scores** — derived: constituent metric → favorability-adjusted
percentile vs peer set → weighted average → 0–100. Inverted metrics (net
debt/EBITDA, DSO, cash-conversion cycle) invert the percentile before averaging.
Same-store rule: when coverage < threshold (default 80%), deltas compute
same-store and say so. Sample coverage 94% → full peer set.

**Qualitative / narrative (require full-text parsing, not tagged XBRL)**
- Risk-factor themes & representative language — **10-K Item 1A** (10-Q Part II
  Item 1A updates); located via EDGAR full-text search; taxonomy frozen YoY.
- Going-concern — auditor report / notes (substantial-doubt language).
- Material litigation — **Item 3 (Legal Proceedings)**.
- Cybersecurity — **10-K Item 1C** (2023 rule) + **8-K Item 1.05** incidents.
- Critical Audit Matters — the **auditor's report** (PCAOB AS 3101).
- Auditor landscape — auditor name/opinion in the 10-K; changes via **8-K Item 4.01**; tenure by tracking across years.
- Risk-factor volume — word-count of **Item 1A** over time; net-new by YoY diff.
- Non-GAAP usage — **8-K Item 2.02 / Ex-99.1** + MD&A reconciliations.
- Late / deficient filings — **Form 12b-25 (NT 10-K/10-Q)**; ICFR material weakness in **Item 9A**; restatements in **8-K Item 4.02**.
- Human-capital — **10-K Item 1 (Business)** (2020 rule); climate/GHG where disclosed (SEC climate rule currently stayed → sparse/voluntary).

**Caveats for production:** CAMs, Item 1C, human-capital, risk-factor themes are
*narrative text*, not tagged facts — they need full-text parsing / NLP, not a
clean fact query. Climate coverage will be sparse while the rule is stayed.

---

## 8. Recommended production stack

- **Tailwind CSS** (palette/fonts/shadow as `tailwind.config` theme tokens),
  React + inline/utility styling. No chart library required.
- **Charts are plain positioned divs / small inline SVG** — tracks, dot-plots,
  paired bars, peer strip, radar, sparklines, trend chart: a `relative`
  container with children positioned by percentage. Compute quantiles with a tiny
  sort+interpolation helper. Never map a metric value to a color scale (§3).
- One shared store (§6); each view is a pure render of derived values.
- Reference implementation uses the "Design Component" format (`support.js`
  runtime + `Name.dc.html`); the logic lives in a `class Component` with a
  `renderVals()` that returns all template inputs. Treat it as the source of
  truth for exact math (deterministic seed function, constituent weights, IQR
  synthesis) and copy.

---

## 9. Changelog — updates made in this session

1. Built the full 4-view app (Sector / Company / Compare / Qualitative) in the
   ClearyFi language, honoring all honesty rules; resolved ClearyFi×SEC conflicts
   (no favorability color; provisional scores with open decomposition;
   categorical A/B; no winner; in-page view rail).
2. Handoff doc iterated: pure HTML/CSS → D3 → **Tailwind** target stack.
3. Sector selector converted from pills to a **dropdown**.
4. **Re-architected the Sector view** into three numbered scopes (scorecard+peer
   strip → drivers → merged distribution with a This-theme/All-metrics toggle);
   moved decomposition to full width, opened by default; pulled the Track-2 feed
   out of the flow.
5. Capped content column at **960px**; added the sticky **right rail** (snapshot +
   Track-2 feed + reading note).
6. Added **Geographic revenue mix** (ASC 280) and **Insider flow** (Forms 3/4/5) to
   the Sector view.
7. Company view: added **sparklines** (click-to-expand 8-quarter trend), **Segment
   & geographic mix**, and **Filing history & flags**.
8. Compare view: added **profile radar** and **overlaid IQR spread** per metric;
   removed a redundant divergence table.
9. Qualitative view: wired **representative filing language**; added the
   **Disclosure landscape** (Cybersecurity 1C, CAMs, Auditor landscape,
   Risk-factor volume, Non-GAAP & charges, Late/deficient filings, Human-capital
   & climate); made **every filer count click-to-reveal** the tickers.
10. Links kept **on-site** (internal `/filings?theme=` route) instead of EDGAR.
11. Built the **Filings view** (breadcrumb, representative language, form tabs,
    filing list) and made its table **paginated** (6/page).
12. Persisted the **SEC-financials-only / sector-vs-sector** constraints in
    `CLAUDE.md`.

---

## 10. Files in this handoff

- `Sector Analytics.dc.html` — the reference implementation (open in a browser).
- `support.js` — the Design Component runtime it loads (do not edit).
- `HANDOFF.md` — this document.
- `CLAUDE.md` — project constraints (SEC-only, sector-vs-sector, honesty rules).

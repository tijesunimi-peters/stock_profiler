---
name: content-seo
description: Content marketing and SEO expertise for the secfin API — technical blog posts, programmatic SEO pages from our own data, comparison/alternative pages, sitemaps and indexing. Use when writing marketing content, planning or building programmatic SEO pages, or working on organic-search acquisition.
---

# Content & SEO

Load `marketing-guardrails` first. Strategy context: Options 2, 3, and 6 in
`docs/product/CAMPAIGN_OPTIONS.md`.

## The three content engines

### 1. Technical war stories (feeds HN + long-tail SEO + trust)

The normalize layer is the content mine: every mapping gap, restatement surprise, and
structural oddity documented in `docs/DATA_MODEL.md` is a post. Standing topic bank:
"why revenue is N different XBRL tags", "restatements rewrite history", "13F 'trades'
don't exist", "banks don't file like retailers", "the frames API's calendar-quarter
trap". Format: real data shown raw-vs-normalized, real code, one honest limitation
admitted per post. Cadence: 1–2 substantial posts/month; never filler.

### 2. Programmatic SEO from our own data

Page families, in rollout order (template value density, high → low):
per-company hub pages (fundamentals + insider + holders + peer rank — the UI already
renders most of this), per-metric peer-comparison pages, per-manager 13F pages,
per-insider pages. Rules from the finance-pSEO playbook:

- Every page: data-updated date (we have `filed` natively), one paragraph of genuine
  editorial value beyond injected numbers, and a soft CTA ("this page is one API call",
  with the actual call).
- Publish continuously, not in one burst; separate XML sitemap for programmatic pages;
  IndexNow pings on publish.
- **Caveats render on-page**: 13F pages carry the derived/45-day-lag note visibly.
  This is a ranking-safe differentiator, not a weakness.
- Never generate pages for companies/metrics where our own coverage report is poor —
  a thin page with our name on it damages the trust positioning.

### 3. Comparison & alternative pages (highest intent)

"sec-api.io alternative", "FMP vs secfin for SEC filings data", etc. Guardrail 5
applies with force: state competitors' real strengths (FMP: prices, global; sec-api.io:
full-text search), win on normalization depth, free-tier terms, price. Refresh
competitor claims from `market-research` before publishing; date every comparison.

## SEO mechanics for this site

- Server-rendered pages (`api/static/`) are already crawler-friendly; keep it that way
  — no client-side-only content for anything meant to rank.
- E-E-A-T for finance ("your money" queries): visible methodology pages, data-source
  attribution (SEC EDGAR, public domain), update dates, and an about/contact page are
  not optional in this vertical.
- Internal linking: war-story posts link to the programmatic pages they explain and
  vice versa; comparison pages link to methodology.
- Measure with Search Console from day one; rankings compound over months — report
  trends, not weekly noise.

## Output contract

Content plans and drafts: `docs/product/CONTENT.md` (calendar + topic bank) and one
file per draft under `docs/product/drafts/`. Programmatic-page work is product
engineering — it follows the repo's normal conventions (`docs/ROADMAP_UI.md`, repos
behind interfaces, no raw SQL in the API layer) and ships with the same rigor as any
feature. Every draft ends with the **Compliance check** note.

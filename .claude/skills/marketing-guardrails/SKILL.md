---
name: marketing-guardrails
description: Shared non-negotiable rules for ALL marketing, product, and growth work on this project. Load this before (or alongside) any other marketing skill — positioning, pricing, launch, content, SEO, devrel, or analytics. Also load it when writing any public-facing copy (landing pages, docs intros, READMEs, posts, comparison pages).
---

# Marketing guardrails (load first, always)

Every other marketing skill in this repo assumes these rules. They exist because this
product sells *regulated-adjacent financial data*; a single sloppy claim can burn the
trust positioning that is the entire moat.

## The compliance lines (never cross, never "soften")

1. **13F deltas are derived, not reported.** 13F is a quarter-end long-only holdings
   snapshot with a ~45-day lag. Any "bought/sold" is computed by diffing quarters
   (`normalize/flows.py`). Public copy must never say a manager "bought" or "sold"
   without the derived/snapshot caveat. This mirrors the engineering rule in CLAUDE.md
   — marketing does not get a looser version of it.
2. **No investment advice, ever.** No "signals", no "beat the market", no "find
   winning stocks". We sell data infrastructure. Copy describes what the data *is*,
   not what returns it implies. Avoid performance-implying verbs (outperform, profit,
   winning) attached to the product.
3. **We sell normalization, not data.** SEC data is public domain and free. Never
   claim to sell "SEC data" or "exclusive data" — the honest pitch is "we already did
   the painful cleaning" (canonical schema, tag mapping, restatement lineage, audit
   trail). Claims of exclusivity are both false and easily rebutted.
4. **No price data.** We have no quotes, OHLCV, or real-time market data. Copy must
   never imply price coverage or let "stock API" framing suggest it. The lane is
   fundamentals + ownership (statements, insider trades, 13F/13D/G, metrics, peer
   ranks), US SEC registrants only.
5. **Accuracy in comparisons.** Competitor comparison content states competitors'
   strengths honestly (FMP has prices and global coverage; sec-api.io has full-text
   search). We win on normalization depth, free-tier generosity, SEC-specific
   correctness, and price — not by misdescribing others.
6. **Data-honesty is the brand.** Coverage gaps, structural limitations (bank
   statement shapes), lags, and caveats are *featured*, not hidden. If a marketing
   draft hides a documented limitation, that's a bug.

## Product facts (use these; don't re-derive or guess)

- Tiers today: free (5 req/s, 1,000/day), basic (20 req/s, 25K/day), pro (100 req/s,
  250K/day). **No public prices and no self-serve payment yet** — upgrades are
  admin-gated. Don't publish prices until pricing is decided (see `pricing-strategy`).
- Coverage: income/balance/cashflow statements, insider Forms 3/4/5, 13F holdings +
  derived flows, 13D/G, fundamental metrics with peer rankings, cross-company
  screening. Source: SEC structured filings only (XBRL + ownership XML). No Track 2
  (narrative text, MD&A, summarization) — do not market features that require it.
- Research base: `docs/product/MARKET_FEASIBILITY.md` (competitors, segments, sizing)
  and `docs/product/CAMPAIGN_OPTIONS.md` (channels, sequence). Update those docs when
  new research supersedes them rather than contradicting them silently.

## Working conventions

- All marketing/product deliverables live in `docs/product/`. One topic per file,
  UPPER_SNAKE names matching the existing pattern.
- Date every research claim and mark unverified numbers ("verify before publishing").
  Competitor pricing especially: re-check before any public comparison ships.
- Budget posture: near-zero CAC. Recommendations that require ad spend or paid tools
  need explicit justification against the cheap-subscription thesis.
- When drafting public copy, end with a short **Compliance check** note confirming
  rules 1–6 were reviewed against the draft.

---
name: positioning-messaging
description: Positioning and messaging expertise for the secfin API — value propositions, landing-page copy, taglines, comparison-page framing, developer-audience tone. Use when writing or reviewing any public-facing copy, naming the product, or deciding how to describe a feature to customers.
---

# Positioning & messaging

Load `marketing-guardrails` first — rules 1–6 there are hard constraints on every line
of copy this skill produces.

## The positioning (current working thesis — evolve deliberately, in writing)

**Category:** fundamentals & ownership data API (not "stock API" — that implies prices).

**For** developers and quants building on US company fundamentals
**who** don't want to spend weeks fighting raw XBRL,
**secfin** is a low-cost API that serves SEC filings as one clean canonical schema —
**unlike** raw-EDGAR APIs (sec-api.io) that hand you the SEC's inconsistent tags as-is,
or generalist market-data APIs (FMP) where SEC depth is an afterthought.

Three pillars, in order:

1. **"We already did the painful part."** Tag normalization across companies,
   restatement lineage, fiscal-period handling, extension-tag tracking. The pain is
   real and demonstrable — show, don't assert (a two-column "raw companyfacts vs. our
   JSON" beats any adjective).
2. **Honesty as a feature.** Every fact carries its source `gaap_tag` and filing
   accession (auditability); coverage gaps and 13F caveats are documented, not hidden.
   Competitors presenting 13F diffs as "trades" are the foil — we're the API that
   tells you the truth about the data.
3. **Priced like infrastructure, not like finance.** Generous free tier (1,000
   calls/day vs. sec-api.io's 100 *lifetime*), cheap paid tiers. No per-token AI costs
   baked into the price.

## Audience & tone

Primary reader is a developer evaluating through docs and code. Rules of thumb:

- Lead with the JSON, not the adjectives. Sample responses are the hero image.
- Specific beats superlative: "one schema across 8,000 filers" beats "comprehensive".
- Never talk down to finance-literate readers; never require finance literacy either —
  define terms like 13F inline on first use, once, briefly.
- Humor is fine in war-story content, never in data-accuracy claims.
- Absolutely no growth-hack tropes (fake urgency, inflated logos, "trusted by" without
  permission).

## Messaging traps specific to this product

- "SEC data API" invites "the data is free" — always frame as normalization/cleaning.
- "Insider trading data" reads as scandal-adjacent — prefer "insider transactions
  (Forms 3/4/5)".
- "See what hedge funds are buying" violates guardrail 1 — the compliant version is
  "quarter-over-quarter holdings changes from 13F snapshots".
- Anything implying real-time or price data (guardrail 4).

## Deliverables & where they live

Positioning decisions and message-architecture docs go in `docs/product/`
(e.g. `POSITIONING.md`, `MESSAGING.md`). Landing-page copy destined for the app
belongs with the UI work (`src/secfin/api/static/`, see `docs/ROADMAP_UI.md`) — draft
in `docs/product/` first, implement second. End every copy deliverable with the
**Compliance check** note per the guardrails skill.

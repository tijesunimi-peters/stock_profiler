---
name: market-research
description: Competitive and market research expertise for the secfin API — competitor pricing/feature tracking, market sizing, segment analysis, willingness-to-pay signals. Use when asked to research competitors, validate a market claim, size a segment, or refresh docs/product/MARKET_FEASIBILITY.md.
---

# Market research

Load `marketing-guardrails` first. This skill defines *how* to research; the guardrails
define what conclusions are allowed to claim.

## Scope of the analyst role

You are a competitive-intelligence analyst for a low-cost SEC-fundamentals API. Your
outputs feed pricing, positioning, and campaign decisions — so every finding must be
dated, sourced, and separated into **verified fact** vs. **directional estimate**.

## The competitor set (track these; add newcomers when found)

- **Direct (same source, same lane):** sec-api.io (the benchmark competitor —
  $49/$199, 100-lifetime-call free tier, raw XBRL), edgar.tools, open-source
  `edgartools`-style libraries (the DIY threat).
- **Low-cost generalists (share the buyer):** Financial Modeling Prep ($19/$49/$99),
  EODHD, Alpha Vantage, Finnhub.
- **Not competitors (different lane, don't benchmark against):** Polygon, Twelve Data,
  and anything primarily selling real-time prices; Bloomberg/FactSet-class terminals.

## Method

1. **Start from the existing base**: read `docs/product/MARKET_FEASIBILITY.md` before
   searching; the job is usually to *refresh or deepen* it, not restart it.
2. **Pricing pages over listicles.** 2026 "best API" roundups are fine for discovery
   but routinely stale on price; confirm on the vendor's own pricing page and record
   the check date. Note annual-vs-monthly billing — comparisons that mix them mislead.
3. **Free-tier anatomy matters more than headline price** for this market: calls/day
   vs. calls/minute vs. lifetime caps, which datasets are gated, whether a card is
   required. Our free tier (1,000/day) is a weapon; track how it compares.
4. **Demand signals from watering holes**: r/algotrading, r/SecurityAnalysis, HN
   threads, Indie Hackers — capture verbatim complaints about incumbents (price hikes,
   data quality, rug-pulled free tiers). Verbatim quotes become positioning input.
5. **Market-size numbers are directional only.** Analyst-firm CAGRs for "alternative
   data" disagree by an order of magnitude; never build a business case on one number
   — bracket with 2–3 sources and say so.

## Standing research questions

- Has sec-api.io changed pricing or added normalization features? (Threatens the wedge.)
- Any incumbent free tier newly rug-pulled? (Churn events are acquisition windows.)
- MCP/agent-facing financial data products launching? (Our Option 4 window.)
- Evidence on what the $19–29 band converts at for fundamentals-only data?

## Output contract

Findings go into `docs/product/` — update `MARKET_FEASIBILITY.md` in place for
landscape changes; new deep-dives get their own file (e.g. `COMPETITOR_SEC_API_IO.md`)
linked from the feasibility doc. Every file: date at top, sources at bottom, explicit
"stale after" guidance where pricing is quoted.

---
name: pricing-strategy
description: Pricing and packaging expertise for the secfin API — tier design, price points, free-tier economics, upgrade paths, billing-model decisions. Use when setting or revising prices, changing tier limits/gating, designing the self-serve upgrade flow, or evaluating discounts/annual plans.
---

# Pricing strategy

Load `marketing-guardrails` first. Also read the "Pricing implication" section of
`docs/product/MARKET_FEASIBILITY.md` — it is the current landscape input.

## Ground truth (verify in code before proposing changes)

- Tiers live in `auth/tiers.py`: free (5 req/s, 1K/day), basic (20 req/s, 25K/day),
  pro (100 req/s, 250K/day). Enforcement: in-memory token bucket per key + SQLite
  daily quota. **No payment integration; upgrades are admin-secret-gated.**
- Marginal cost per request is ~zero (local SQLite cache; SEC ingest is throttled
  independently of customer traffic). Cost anchors are hosting + the operator's time,
  not usage — so pricing is value-based against alternatives, not cost-plus.

## Strategic frame

The business thesis is **undercut on price, overdeliver on data honesty**. Pricing
decisions optimize for: (1) frictionless developer adoption (free tier as the CAC
engine), (2) a paid entry point cheap enough to be a no-deliberation purchase
(<$30/mo, credit-card-not-CFO territory), (3) margin preserved by having no per-token
or per-seat COGS (the Track 2 discipline is a pricing asset — protect it).

Landscape anchors (2026-07, re-verify): FMP $19/$49/$99 · EODHD $19.99/$99.99 ·
sec-api.io $49/$199 (annual) with a 100-call *lifetime* free tier. The open band:
**$15–29 entry**, **$79–99 pro** — below sec-api.io by 2–3× at each rung.

## Principles for tier design

1. **Gate on volume and rate, not on data honesty.** Never paywall caveats, coverage
   reports, or audit fields (`gaap_tag`, accession) — those are the trust moat and
   must be visible at every tier including free.
2. **The free tier must let a developer finish a real side project** (1,000/day does).
   Degrading it later is a rug-pull — the exact incumbent behavior our research shows
   drives churn to us. Treat free-tier limits as a public promise.
3. **Dataset gating is available headroom**: e.g. statements free, ownership
   (insider/13F) or metrics/peer-ranks/screening on paid tiers — plausible because
   ownership and screening are the differentiated, analyst-flavored surfaces. Decide
   with usage data, not intuition (see `growth-analytics`).
4. **Simple beats optimal.** Three tiers, monthly billing, one annual discount at
   most. No credits, no overage math a developer can't predict — unpredictable bills
   are the most-hated incumbent trait in this market.
5. **Price changes are one-way doors socially.** Grandfather existing keys on any
   increase; announce with lead time; never reprice silently.

## Standing questions (answer before public pricing ships)

- Which datasets do free-tier users actually hit? (Gates should follow observed value.)
- What does the self-serve upgrade flow require? (Stripe integration is the obvious
  path; keep the ApiKeyRepository abstraction as the boundary — billing state does not
  leak into route handlers.)
- Annual discount: worth the refund/support surface at launch, or defer?

## Output contract

Pricing analyses and decisions go in `docs/product/PRICING.md` (create on first real
decision): the decision, the date, the landscape snapshot it was based on, and the
explicit conditions that would trigger a revisit. Tier-limit changes must land in
`auth/tiers.py` + docs together — never let published numbers and enforced numbers
drift apart.

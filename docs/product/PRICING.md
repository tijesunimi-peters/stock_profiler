# Pricing — decisions

*Output contract of the `pricing-strategy` skill: every real pricing decision lands here
with its date, the landscape snapshot it was based on, and the explicit conditions that
would trigger a revisit. Tier-limit changes must land in `auth/tiers.py` + docs together.*

## Decision 1 — launch posture: free during beta, planned prices published (2026-07-14)

**Decided (operator, 2026-07-14):** launch with posture (b) from
`LAUNCH_READINESS.md` §1 — every tier is **free during beta**, and the site states the
**planned** prices plainly. No Stripe/self-serve payment at launch; upgrades remain
admin-gated. Stripe integration is post-launch work, triggered by actual paid demand
(see revisit triggers).

Why (b) over (a): it unblocks the launch immediately (Stripe was the checklist's named
long pole), it is honest (planned prices labeled as planned, beta labeled as beta), and
announcing planned prices before billing exists is not a rug-pull — the rug-pull rule
protects the *free tier's limits* and *live* prices, neither of which changes here.

## Decision 2 — planned price points (2026-07-14)

**Decided (operator, 2026-07-14):**

| Tier | Limits (auth/tiers.py) | Planned price |
|---|---|---|
| free | 5 req/s · 1,000 req/day | $0 — free forever, limits are a public promise |
| basic | 20 req/s · 25,000 req/day | **$19 / month** (planned) |
| pro | 100 req/s · 250,000 req/day | **$79 / month** (planned) |

Billing model when live: monthly, flat, no per-call metering, no overage math. No annual
discount at launch (deferred — refund/support surface not worth it yet).

### Landscape snapshot this was based on (2026-07, from MARKET_FEASIBILITY.md — re-verify before billing goes live)

| Competitor | Entry / upper | Note |
|---|---|---|
| sec-api.io | $49 / $199 per mo | closest direct competitor; 100-call *lifetime* free tier |
| Financial Modeling Prep | $19 / $49 / $99 per mo | broadest low-cost incumbent |
| EODHD | $19.99 / $99.99 per mo | fundamentals only in top bundle |

Positioning: **$19 basic** sits at FMP-Starter parity with much deeper SEC-native
coverage and undercuts sec-api.io's entry by ~2.5×; **$79 pro** undercuts sec-api.io
Business by ~2.5× and slots under FMP Ultimate. Both are no-deliberation,
credit-card-not-CFO purchases, per the strategy frame. Our free tier (1,000/day) already
beats every competitor's free tier and stays untouched.

### Standing commitments attached to these decisions

- **The free tier's limits are a public promise.** They do not degrade at beta end.
- **Grandfathering:** keys issued during the beta keep working when billing starts;
  paid-tier beta users get explicit notice + a migration window before any charge.
  Prices never change silently (one-way-door rule).
- **Nothing honesty-related is ever paywalled** — caveats, coverage reports, audit
  fields (`gaap_tag`, accession) stay visible on every tier including free.

### Revisit triggers

1. **Before Stripe ships** (prices become live): re-verify the competitor snapshot
   above; confirm $19/$79 still undercuts; decide the beta-end date and announce with
   lead time.
2. **Usage evidence** from `api_key_usage` showing which datasets free users actually
   hit — dataset gating (e.g. ownership/screening on paid) is available headroom, but
   only with observed data (`growth-analytics`), never intuition.
3. **Competitor repricing** that closes the undercut (especially sec-api.io moving
   below $49).
4. Any tier-limit change in `auth/tiers.py` — this doc, `/terms`, `/guide`, and the
   drift tests move together.

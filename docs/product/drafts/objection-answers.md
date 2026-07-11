<!--
Prepared honest answers to the predictable launch-thread objections. Status: draft.
Purpose: draft these BEFORE launch day so in-thread replies are prepared, not
improvised (launch-campaign skill: "Prepared honest answers beat improvised ones").
These are answers for HN/PH/Reddit comment threads -- keep them conversational, not
marketing-copy-stiff; concede limitations fast, per the launch-campaign skill's
guidance ("concede limitations fast -- no prices, US-only -- stated before commenters
find them").
Compliance check at the bottom.
-->

# Prepared objection answers

## "Isn't SEC data free?"

Yes -- completely, and we say so on every page we can (see the methodology page). We're
not selling SEC data; the raw filings are public domain and anyone can hit
`data.sec.gov` directly right now. What we sell is the normalization: mapping the
dozen-plus real tag variants for "revenue" (and every other concept) onto one consistent
schema, keeping restatement history instead of silently overwriting it, tracking which
tags are company-specific extensions, and deriving things like 13F quarter-over-quarter
activity correctly (with the caveats attached, not stripped). If you want to do that
mapping yourself, `data.sec.gov`'s companyfacts API is right there and free -- we
genuinely mean that, it's linked from our own docs. We're betting people would rather
pay a little to skip months of tag-mapping work than build it themselves, the same way
people pay for managed Postgres instead of running their own cluster, even though
Postgres itself is free.

## "How is this different from sec-api.io?"

Real, direct competitor, worth naming honestly. sec-api.io hands you the SEC's own raw
tags as JSON (plus full-text search, which we don't have) -- they're closer to "XBRL to
JSON" than "one consistent schema." If you pull the same concept from ten different
companies through their API, you can still get ten different tag names back and have to
reconcile them yourself. We do that reconciliation for you: one `revenue` field, every
company, every year, with the original tag preserved for audit rather than hidden. On
price and free-tier terms we're also meaningfully more generous (their free tier is 100
calls *lifetime*, not per day/month) -- but the real differentiator is the normalization
depth, not just the price. If full-text search across filing narrative text is what you
need, honestly, they're the better fit for that specific use case; we're deliberately
scoped to structured numeric data only.

## "Is this investment advice?"

No, and we mean that as more than a legal disclaimer -- it shapes what we build. This is
a data API: historical, as-filed or as-restated numbers, normalized. No ratings, no
"buy/sell" signals, no scores implying a security is a good or bad idea, no performance
predictions. Percentile/peer-rank numbers describe where a company sits in its industry
group *today*, not a verdict -- a high percentile on a leverage metric isn't "good," it's
just high. If you're using this for anything that matters financially, talk to an actual
licensed advisor who knows your situation; we built a tool for developers, not a
substitute for one. Full disclaimer's linked in every page footer if you want the
complete version.

## "Where are the prices?"

There aren't any, on purpose, in either sense of the question:

- **No price/quote/OHLCV data at all.** We've never had it and aren't planning to add
  it -- it's a genuinely different data problem (real-time market data vendors, not SEC
  filings) and we'd rather be excellent at fundamentals + ownership than mediocre at
  everything. If you need both, pair us with whatever price feed you already use --
  we're built to be a companion API, not a replacement for one.
- **No public dollar pricing for the API itself yet.** [Launch-week status, update
  before posting: either "self-serve payment is live at $X/$Y" if that shipped, or
  "we're free during the beta period while we validate usage patterns -- planned tiers
  and prices are noted on the pricing section of the site" if it hasn't. Do not leave
  this bracket in the published version -- see `docs/product/PRICING.md` for the
  actual decision once it exists.]

---

*Compliance check: "isn't SEC data free" answer explicitly agrees and reframes as
normalization, never claims data exclusivity (guardrail 3); sec-api.io comparison
states their real strengths (full-text search) honestly rather than only their
weaknesses (guardrail 5); investment-advice answer has no hedging -- flatly "no" with
the reasoning, not a legal-sounding non-answer (guardrail 2); prices answer is explicit
about zero price-data coverage (guardrail 4) and doesn't invent a dollar figure for the
open pricing question (ground rule: no invented prices -- flagged as a live dependency
instead). Reviewed against `marketing-guardrails`.*

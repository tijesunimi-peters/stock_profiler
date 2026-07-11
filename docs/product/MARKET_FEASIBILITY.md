# Market feasibility — initial research

*Status: initial desk research, 2026-07-11. Verify pricing figures before quoting them in
public marketing copy — competitor pricing changes often.*

## What we are selling

A low-cost subscription API that turns messy SEC filings into one clean canonical JSON
schema: income/balance/cashflow statements, insider trades (Forms 3/4/5), institutional
ownership (13F, 13D/G), derived fundamental metrics, and peer rankings.

Two facts shape everything in this document:

1. **The raw data is free.** Anyone can hit `data.sec.gov` themselves. We are not selling
   data; we are selling *normalization* — the canonical schema, the GAAP-tag mapping,
   restatement handling, derived metrics, and the honest caveats (e.g. 13F deltas are
   derived, not reported trades). Marketing that claims to sell "SEC data" invites the
   obvious "it's free" rebuttal; marketing that sells "we already did the painful part"
   does not.
2. **We have no market prices.** No quotes, no OHLCV, no real-time anything. Most
   "stock API" comparisons are dominated by price data. We compete in the
   *fundamentals + ownership* lane, not the market-data lane. Positioning must never
   drift into implying price coverage.

## Competitive landscape

### Closest direct competitor: sec-api.io

Same source (EDGAR), same form coverage (3/4/5, 13F, 13D/G, XBRL financials, and more).
Personal plan ~$49/mo (annual) / $55 month-to-month; Business ~$199/mo (annual). Free
tier is **100 API calls lifetime** — not per month. It is a *raw* data API: full-text
search and XBRL-to-JSON conversion, largely leaving tag normalization to the customer.

That is our wedge: sec-api.io hands you the same inconsistent GAAP tags the SEC does,
just as JSON. We hand you `revenue`, `net_income`, `operating_cash_flow` — one schema
across every company, with the source tag preserved for audit.

### Broader fundamentals/API providers (2026 pricing, from public comparisons)

| Provider | Free tier | Paid entry | Fundamentals angle |
|---|---|---|---|
| Financial Modeling Prep | 250 calls/day | $19 / $49 / $99 per mo | Broadest low-cost incumbent; filings + transcripts at $99 |
| Alpha Vantage | 25 req/day | ~$50/mo | Popular free tier; fundamentals are secondary to prices |
| EODHD | 20 calls/day | $19.99; $99.99 all-in-one | Fundamentals bundled in top tier |
| Finnhub | 60 calls/min | tiered | SEC filings + news sentiment; free tier generous on rate |
| Polygon | limited | $79/mo unlimited | Real-time market data; not a fundamentals specialist |
| Twelve Data | 800 calls/day | $191 / $832 per mo | Priced for market data at scale |
| sec-api.io | 100 calls *lifetime* | $49 / $199 per mo | Raw EDGAR: full-text search, XBRL→JSON |
| edgar.tools | 100 calls/day | $0–79/mo | EDGAR web app + AI plugin angle |

Two structural observations:

- **The $19–49/mo band is where indie developers actually buy** (FMP Starter, EODHD).
  sec-api.io starting at $49 with a lifetime-capped free tier leaves room *below* it.
- **Our free tier is already competitive**: 5 req/s and 1,000 calls/day beats FMP's
  250/day, Alpha Vantage's 25/day, EODHD's 20/day, and embarrasses sec-api.io's 100
  lifetime. A generous free tier is the acquisition channel for API products; ours costs
  us almost nothing because the data is cached locally and SEC ingest is throttled
  independently of customer traffic.

### The DIY competitor

The biggest competitor is not a company; it is a developer deciding to hit
`data.sec.gov` directly (or use `edgartools`-style open-source libraries). The counter
is the same as the sec-api.io wedge: raw companyfacts JSON has inconsistent tags per
company, restatements, fiscal-vs-calendar period traps, and extension tags. Content
marketing should *demonstrate* that pain (it is genuinely painful) rather than assert it.

## Market size and demand signals

- Alternative-data market estimates for 2025–2026 cluster around **$19–30B** with CAGRs
  of 30%+ (Grand View Research, IMARC, Fortune Business Insights — figures vary wildly
  between firms; treat as directional only).
- Financial data APIs specifically: ~**14.5% CAGR** through 2033 (HTF MI).
- Retail-investor sophistication and algorithmic trading are the cited growth drivers on
  the low end of the market — exactly our segment.
- **MCP / LLM-agent integration is called out as a dominant 2026 trend**: developers
  deploying MCP servers so AI agents can query financial data. A clean canonical schema
  is *more* valuable to an LLM agent than to a human (agents can't eyeball-fix messy
  tags). This is a differentiator we get almost for free and should treat as a
  first-class product surface, not an afterthought.

## Target segments (ordered by fit)

1. **Indie fintech developers** building screeners, dashboards, portfolio tools — the
   classic FMP/EODHD customer, price-sensitive, evaluates via docs and free tier.
2. **Quant hobbyists / r/algotrading types** who need fundamentals, insider trades, and
   13F holdings as *signals* — care about data honesty (as-reported vs. restated,
   point-in-time) which we already handle correctly.
3. **AI-agent builders** who need machine-consumable fundamentals (MCP angle above).
4. **Finance writers / data journalists / newsletter authors** — insider-trade and 13F
   stories are evergreen content; they need queryable data, not terminals.
5. **Small RIAs and independent analysts** — later; they need SLAs and support we don't
   have yet.

## Feasibility assessment

**Verdict: viable as a lean, low-CAC subscription business; not a venture-scale market
at our price point — which matches the stated goal.**

For it: a direct competitor (sec-api.io) sustains $49–199/mo on the same free source
with a *worse* free tier and *less* normalization; the $19–29 band below it is
occupied only by generalists (FMP) whose SEC-specific depth (insider joint filers,
13F caveats, restatement lineage) is shallow; our marginal cost per customer is near
zero (SQLite cache, no per-token costs — the Track 2 discipline is also a margin story).

Against it — the honest risks:

- **No moat in the data, thin moat in the mapping.** The mapping table is replicable by
  a determined competitor. Defense is pace and trust (documented caveats, coverage
  reports), not secrecy.
- **Breadth gap.** No prices means we're a *second* API for many customers, not their
  only one. Positioning as "the fundamentals/ownership companion to your price feed" is
  more honest and more winnable than head-to-head "best stock API."
- **US-only.** EDGAR covers SEC registrants; no international fundamentals.
- **Compliance surface.** We must never present 13F-derived deltas as reported trades,
  and marketing must never slide into investment advice. These constraints are baked
  into the marketing skills (see `.claude/skills/`).
- **Redistribution:** EDGAR data is public domain and we found no redistribution
  restriction (checked 2026-07-07, see CLAUDE.md), but re-verify before launch copy
  makes claims about licensing.

## Pricing implication (input to pricing work, not a decision)

Current tiers (free 5 rps/1K day; basic 20 rps/25K day; pro 100 rps/250K day) have no
public prices yet. The landscape suggests: **basic at $15–29/mo** (undercuts FMP Starter
on SEC depth, undercuts sec-api.io by 2–3×), **pro at $79–99/mo** (below sec-api.io
Business by ~2×, at FMP Ultimate parity with deeper SEC coverage). Validate
willingness-to-pay before committing; see the `pricing-strategy` skill.

## Sources

- [Best Financial Data APIs in 2026 (nb-data)](https://www.nb-data.com/p/best-financial-data-apis-in-2026)
- [Best Financial Data APIs for Developers in 2026 (Lambda Finance)](https://www.lambdafin.com/articles/financial-data-api-2026)
- [sec-api.io review, pricing, features (Find My Moat)](https://www.findmymoat.com/tools/sec-api-sec-api-io)
- [sec-api.io alternatives (Find My Moat)](https://www.findmymoat.com/alternatives/sec-api-sec-api-io)
- [edgar.tools vs sec-api comparison](https://www.edgar.tools/vs/sec-api)
- [Alternative Data Market Size (Grand View Research)](https://www.grandviewresearch.com/industry-analysis/alternative-data-market)
- [Alternative Data Market (IMARC)](https://www.imarcgroup.com/alternative-data-market)
- [Financial Data APIs Market (HTF MI)](https://www.htfmarketintelligence.com/report/global-financial-data-apis-market)

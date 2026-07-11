# Campaign options — initial research

*Status: initial desk research, 2026-07-11. Companion to `MARKET_FEASIBILITY.md`.
These are options with a recommended sequence, not a committed plan.*

## Constraints that shape channel choice

- **Budget: near zero.** The whole business thesis is "cheap subscription" — paid
  acquisition (ads) fights the margin story and is out until organic channels are
  exhausted. Every option below is organic / product-led.
- **The buyer evaluates through code.** For API products the docs, the free tier, and
  the time-to-first-successful-call *are* the marketing. Channel work is wasted if the
  landing → signup → first 200 response path isn't excellent first.
- **We already have marketing assets in the repo**: the server-rendered UI (company hub,
  data explorer, coverage pages — `docs/ROADMAP_UI.md`) doubles as a live demo, and the
  coverage-report methodology doubles as trust content.

## Option 1 — Launch sequence: Show HN first, Product Hunt as echo

**Cost: time only. One-shot with long tail via search.**

Conventional 2026 guidance for dev tools: Hacker News "Show HN" is the primary launch
for APIs/CLIs/SDKs — the audience is the actual buyer and technical substance beats
polish. Product Hunt (Tue/Wed) works as a separate beat 2–4 days apart with a different
angle; DevHunt and Indie Hackers as smaller follow-ons (Indie Hackers reportedly
converts better per visitor for dev-tool audiences).

The HN angle should be the *technical war story*, not the product pitch: "Show HN: I
normalized every US-GAAP tag the S&P 500 files with the SEC" outperforms "Show HN:
cheap financial data API." We have genuine material: restatement lineage, extension
tags, banks that don't file `Revenues`, the 13F derived-delta problem, calendar-vs-
fiscal frames. HN loves "the data is free, the cleaning is hell" stories.

**Prerequisite:** payments/self-serve upgrade path live (currently manual admin-gated),
or an explicit "free while in beta" story — launching with no way to pay is fine,
launching with an *unclear* pricing story is not (pre-launch checklist already says this).

## Option 2 — Programmatic SEO from our own data

**Cost: engineering time. Compounding; slow ramp (months). The highest-leverage
long-term channel.**

We sit on exactly the "exclusive data asset + differentiated template" combination that
makes programmatic SEO work in finance: per-company pages (fundamentals + insider
activity + institutional holders + peer rank), per-metric peer-comparison pages
("AAPL operating margin vs. sector"), per-manager 13F pages ("Berkshire Hathaway 13F
holdings changes"). The company-hub UI is already most of the template.

Practices from finance pSEO playbooks worth adopting: publish continuously rather than
in bursts, show a data-updated date on every page (we have `filed` dates natively),
separate XML sitemap for programmatic pages, IndexNow pings, and a paragraph of real
editorial value per page — not just injected numbers. Every page footer is a soft CTA:
"this page is one API call."

**Caveat rows carry to the pages:** 13F pages must say "derived from quarter-end
snapshots, ~45-day lag" — which is also a *credibility* differentiator vs. sites that
present 13F diffs as trades.

## Option 3 — Technical content marketing (the moat as content)

**Cost: writing time. Feeds both HN and SEO.**

The normalize layer generates endless honest content: "Why 'revenue' is 15 different
XBRL tags", "How restatements silently rewrite history", "13F 'trades' don't exist —
here's what the data actually says", "What the SEC frames API won't tell you." Each
post is simultaneously HN-submittable, long-tail SEO, and a trust signal that we
understand the data better than cheaper-looking alternatives. Target cadence for a solo
operation: 1–2 substantial posts/month beats weekly filler.

## Option 4 — MCP server + AI-agent distribution

**Cost: small engineering lift (thin MCP wrapper over existing REST). Timely.**

MCP integration is repeatedly cited as the dominant 2026 financial-API trend. A
published MCP server ("give Claude/your agent clean SEC fundamentals") is both a real
product surface and a launch story of its own — listable in MCP directories, a second
Show HN, and a differentiator sec-api.io-class competitors haven't productized well.
Canonical schema is the selling point: agents can't eyeball-fix messy tags.

## Option 5 — Community seeding (Reddit, Discord, GitHub)

**Cost: ongoing attention. Converts well; scales poorly.**

r/algotrading, r/SecurityAnalysis, quant Discords, and dev.to constantly recycle "where
do I get cheap fundamentals / insider / 13F data?" threads. The playbook is answering
those threads *helpfully* (including naming free alternatives) with the product as one
option — not drive-by promotion, which those communities punish. An open-source Python
client SDK on GitHub/PyPI gives the community something to adopt and file issues
against, and is the standard bottom-up wedge for API products.

## Option 6 — Comparison / alternative pages

**Cost: low. High buying intent.**

"sec-api.io alternative", "Financial Modeling Prep vs X for SEC data" pages capture the
highest-intent searches in this niche (the Find My Moat / edgar.tools results in our own
research prove the pattern works). Must be factually scrupulous — praise competitors'
strengths (FMP has prices; we don't), win on normalization depth, free-tier honesty,
and price.

## What's deliberately NOT here

- **Paid ads** — fights the margin thesis; revisit only with LTV data.
- **Cold outreach / sales** — wrong motion for $19–99/mo self-serve.
- **LLM-generated content farms** — pSEO pages must be backed by our real data and real
  editorial judgment; anything else risks both rankings and the trust positioning.
- **Anything implying investment advice or presenting derived 13F deltas as trades** —
  compliance line, non-negotiable, enforced in every marketing skill.

## Recommended sequence

1. **Now → launch:** finish the self-serve pricing story; treat docs + free tier +
   data explorer as the launch asset; write 2–3 technical posts (Option 3) as a content
   runway.
2. **Launch week:** Show HN with the war-story angle → Product Hunt 2–4 days later →
   Indie Hackers / DevHunt / relevant subreddits over the following week (Option 1, 5).
3. **Post-launch quarter:** programmatic SEO rollout (Option 2), MCP server (Option 4),
   comparison pages (Option 6), steady content cadence.

## Sources

- [API product marketing strategy (Stackmatix)](https://www.stackmatix.com/blog/api-product-marketing-strategy)
- [How to promote and market an API (Zuplo)](https://zuplo.com/learning-center/how-to-promote-and-market-an-api)
- [Product Hunt vs Hacker News (Smol Launch)](https://smollaunch.com/compare/product-hunt-vs-hacker-news)
- [Indie Hackers launch strategy data (Awesome Directories)](https://awesome-directories.com/blog/indie-hackers-launch-strategy-guide-2025/)
- [Product Hunt alternatives that work in 2026 (Pinggy)](https://pinggy.io/blog/best_producthunt_alternatives/)
- [Programmatic SEO guide (Backlinko)](https://backlinko.com/programmatic-seo)
- [Programmatic SEO for financial products (Gemeos)](https://www.gemeosagency.com/en/blog/programmatic-seo-financial-products-comparison-playbook)
- [When to invest in programmatic SEO (RankScience)](https://www.rankscience.com/blog/how-to-grow-your-traffic-with-programmatic-seo)

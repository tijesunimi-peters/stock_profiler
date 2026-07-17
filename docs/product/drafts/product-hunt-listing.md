<!--
Product Hunt listing draft. Status: draft.
Angle: the PRODUCT surface (data explorer, clean JSON, generous free tier) --
deliberately distinct from the Show HN war-story angle, per CAMPAIGN_OPTIONS.md
("Product Hunt works as a separate beat 2-4 days apart with a different angle") and
the launch-campaign skill ("PH angle: the product surface ... honest category
framing"). Do not cross-post identical copy between the two.
Compliance check at the bottom.
-->

# Product Hunt listing

## Name

ClearyFi

## Tagline (max ~60 chars)

Clean SEC financials, as a simple API -- not a stock API.

(Alt, if the dash reads oddly on PH's UI: "SEC filings, normalized into one clean
JSON schema.")

## Category

Developer Tools / APIs (not "Fintech" broadly -- avoid drifting into a category that
implies trading or investing tooling; this is data infrastructure).

## Description (the listing body)

SEC filings are public and free. Actually *using* them isn't -- every company tags the
same financial concept differently, restates history without warning, and sometimes
invents its own tags entirely. ClearyFi does that normalization once, so you get one
consistent JSON schema (`revenue`, `net_income`, `operating_cash_flow`, ...) across
every company and every year, with the original source tag kept on every field for
audit.

**What's in it:**
- Income statements, balance sheets, cash flow -- normalized, with restatement history
  kept (never silently overwritten)
- Insider transactions (Forms 3/4/5), including joint-filer attribution
- Institutional ownership (13F holdings + quarter-over-quarter derived activity,
  Schedule 13D/13G) -- always shipped with the derived/long-only/45-day-lag caveats,
  never presented as reported trades
- Fundamental metrics and peer rankings by industry
- A live Data Explorer and company-comparison UI you can try with zero setup

**What's deliberately not in it:** no prices, no quotes, no real-time market data --
ever. This is a fundamentals-and-ownership companion to your price feed, not a
replacement for one. US SEC registrants only. No AI-generated summaries of filings --
every number traces back to a real tag in a real filing.

**Free tier:** 1,000 requests/day, 5 req/sec, every endpoint, full historical
coverage -- no feature is behind a paywall on free. (No self-serve billing yet at
launch -- see the pricing note on the site; treat every tier as free during the beta
period until that's decided.)

Built by a solo developer who got tired of re-deriving the same GAAP-tag mapping table
for every side project.

## First comment (maker's note)

Hey HN/PH -- maker here. I built this because I kept re-solving the same problem: SEC
XBRL data is free and complete, but genuinely painful to use directly (inconsistent
tags, restatements, a 13F "holdings" format that people routinely mistake for a trades
feed). This is the normalization layer I wish existed, wrapped in a plain REST API.

Try the Data Explorer first if you want to see real output before signing up for
anything: [link]. Signup for an API key is instant, no card. Genuinely interested in
what you'd want normalized next -- especially if you've hit tag inconsistencies I
haven't seen yet.

## Gallery / screenshot notes (for whoever captures these)

- Data Explorer showing a real company's normalized statement, with the raw-tag
  tooltip/audit trail visible if the UI exposes it
- The company comparison view (multi-company side by side)
- A short "raw XBRL tag -> our schema" diagram (same one used on the landing page hero)
- Do NOT screenshot anything that could read as a price chart or trading dashboard --
  reinforces the "not a stock API" positioning rather than undercutting it

---

*Compliance check: tagline and description explicitly disclaim "not a stock API" /
no price data (guardrail 4); "normalized," not "sells SEC data" framing throughout
(guardrail 3); 13F line carries the derived/long-only/45-day-lag caveat inline
(guardrail 1); no investment-advice language anywhere (guardrail 2); no competitor
named or compared (guardrail 5 n/a); scope limits (US-only, no prices, no AI summaries)
stated as features of honesty, not buried (guardrail 6); free-tier claim ("no feature
behind a paywall") matches `auth/tiers.py` -- all three tiers get every endpoint, tiers
differ only by rate/quota. Reviewed against `marketing-guardrails`.*

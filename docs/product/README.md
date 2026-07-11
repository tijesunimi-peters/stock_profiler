# docs/product — product & marketing workspace

Product-side (non-engineering) planning for the secfin API: market research,
positioning, pricing, campaigns, and growth measurement. Engineering docs stay in
`docs/`; this directory is about selling the thing those docs describe.

## Contents

- **[MARKET_FEASIBILITY.md](MARKET_FEASIBILITY.md)** — initial market research
  (2026-07-11): competitive landscape, market sizing, target segments, feasibility
  verdict, pricing implications. The base document other work builds on.
- **[CAMPAIGN_OPTIONS.md](CAMPAIGN_OPTIONS.md)** — acquisition channel research and
  a recommended launch/growth sequence (Show HN → Product Hunt → community;
  programmatic SEO + MCP + comparison pages post-launch).

Files created as work progresses (referenced by the skills below, created on first
real use): `POSITIONING.md`, `PRICING.md`, `CONTENT.md` + `drafts/`, `DEVREL.md`,
`METRICS.md`, `LAUNCH_NOTES.md`, `COMMUNITY_NOTES.md`.

## The marketing skills (`.claude/skills/`)

Marketing expertise is encoded as skills so any session can pick up this work with
the constraints intact:

| Skill | Covers |
|---|---|
| `marketing-guardrails` | **Load first, always.** Compliance lines (13F caveat, no advice claims, normalization-not-data), product facts, working conventions |
| `market-research` | Competitor/pricing tracking, sizing, demand signals |
| `positioning-messaging` | Value props, copy, tone, messaging traps |
| `pricing-strategy` | Tier design, price points, free-tier economics |
| `launch-campaign` | Show HN / Product Hunt execution, launch readiness |
| `content-seo` | Technical posts, programmatic SEO, comparison pages |
| `devrel-community` | Onboarding funnel, SDK/MCP distribution, community engagement |
| `growth-analytics` | Metric definitions, usage analysis, campaign retros |

## Conventions

- One topic per file, UPPER_SNAKE names, date at the top of research docs, sources at
  the bottom. Update in place when new research supersedes old — don't fork stale
  copies.
- Competitor pricing goes stale fast: re-verify before quoting anything publicly.
- Everything public-facing passes the `marketing-guardrails` compliance check.

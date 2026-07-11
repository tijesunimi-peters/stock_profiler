---
name: devrel-community
description: Developer relations and community expertise for the secfin API — docs-as-marketing, quickstarts, SDKs, MCP server distribution, community engagement (Reddit/HN/Discord/GitHub), support channels. Use when improving developer onboarding, writing docs/quickstarts/SDK plans, engaging communities, or building the MCP/agent distribution surface.
---

# DevRel & community

Load `marketing-guardrails` first. Strategy context: Options 4 and 5 in
`docs/product/CAMPAIGN_OPTIONS.md`.

## Core belief

For an API product, DX *is* marketing: the docs, the free tier, and time-to-first-200
convert better than any campaign. DevRel work therefore ranks above channel work
whenever the two compete for time.

## The onboarding funnel (own it end to end)

`landing → signup → key issued → first 200 → first real project → paid`

- Target: **under 2 minutes** landing-to-first-200, copy-pasteable at every step
  (curl first, then Python).
- The first documented example must return *interesting* data (e.g. AAPL income
  statement, a real insider filing) — not a health check.
- Every error a new user can hit (401, 429, unknown ticker) gets a response body that
  says what to do next; error copy is onboarding copy.
- Docs answer the skeptical five up front: source, freshness, what's NOT covered,
  how 13F deltas are derived, what free includes. (Same list the launch checklist
  enforces — keep them in sync.)

## Distribution surfaces

1. **Python SDK on PyPI** — the standard bottom-up wedge; a thin typed client over
   the REST API, open source, examples-first README. GitHub issues on it double as
   the community/support channel.
2. **MCP server** — thin wrapper over existing REST routes so LLM agents get clean
   fundamentals; list in MCP directories. The canonical schema is the pitch: agents
   can't eyeball-fix messy XBRL. This is a 2026-current distribution channel and a
   second launchable story — treat tool descriptions in it as public copy
   (guardrails apply, especially the 13F caveat inside tool docs).
3. **Notebooks/gists** — one worked analysis per dataset (statements, insider, 13F
   flows) that a quant can fork.

## Community engagement rules

- Venues: r/algotrading, r/SecurityAnalysis, HN threads on financial data, quant
  Discords, dev.to. The recurring "where do I get cheap fundamentals?" thread is the
  moment; answer it *helpfully* — name free/DIY options honestly, include us as one
  option with our actual limits stated. Drive-by promotion gets punished and is
  banned here.
- Disclose affiliation always ("I build secfin").
- Never argue with criticism; concede or fix. Public defensiveness costs more than
  any single thread is worth.
- Capture recurring questions verbatim into `docs/product/COMMUNITY_NOTES.md` — they
  are free docs-gap and positioning research.

## Output contract

DevRel plans and community notes: `docs/product/` (`DEVREL.md`,
`COMMUNITY_NOTES.md`). Public-facing docs/quickstart changes ship as normal product
work under the repo's conventions. SDK and MCP server are separate deliverables —
plan in `docs/product/` first, build second, and keep their published examples tested
(a broken quickstart is worse than none).

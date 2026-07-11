---
name: launch-campaign
description: Launch and campaign-execution expertise for the secfin API — Show HN / Product Hunt / Indie Hackers launches, launch-readiness checklists, post drafts, follow-up sequencing. Use when planning or executing a launch, drafting a Show HN or Product Hunt post, or scheduling a campaign calendar.
---

# Launch campaigns

Load `marketing-guardrails` first. The channel research and recommended sequence live
in `docs/product/CAMPAIGN_OPTIONS.md` — read it before planning; update it if a
campaign's results contradict it.

## The playbook (from CAMPAIGN_OPTIONS.md, operationalized)

**Sequence:** Show HN first → Product Hunt (Tue/Wed) 2–4 days later with a different
angle → Indie Hackers / DevHunt / relevant subreddits over the following week. Each
beat gets its own framing; never cross-post identical copy.

**The HN angle is the war story, not the pitch.** Titles that work in this niche name
the technical pain: normalization across thousands of filers, restatements, extension
tags, the 13F derived-delta problem. Titles that die: anything with "cheap",
"platform", or a features list. In the thread: answer everything, concede limitations
fast (no prices, US-only — stated *before* commenters find them), link the coverage
methodology. HN will test the free tier live — see readiness below.

**Product Hunt angle:** the product surface (data explorer, company hub, clean JSON),
maker story in first comment, honest category framing (developer tools / APIs).

## Launch-readiness checklist (block the launch on these, in order)

1. **Pricing story is clear** — either live self-serve payment or an explicit "free
   during beta, these will be the prices" note. Unclear pricing is a launch blocker
   (also in `docs/ROADMAP.md`'s pre-launch checklist); absent payment is not.
2. **The load test reflects launch shape**: many distinct free keys, cold-ish cache
   (the roadmap's pre-launch load-test work is the reference). HN traffic is exactly
   "hundreds of new keys, shallow queries, same few tickers".
3. **Time-to-first-200 under 2 minutes**: landing → signup → key → working curl. Every
   extra step measurably bleeds signups; test it fresh, as a stranger.
4. **SEC compliance under load**: signup spikes must not translate into SEC request
   spikes (cache-aside + process-wide limiter should hold — verify, don't assume).
5. **Docs answer the first five skeptical questions**: where the data comes from, how
   fresh, what's NOT covered, how 13F deltas are derived, what free actually includes.
6. **A feedback channel exists** (GitHub issues at minimum) and is linked from docs.

## During and after

- Launch days are full-time attendance: respond in-thread within minutes, fix small
  reported bugs live and say so in the thread (HN rewards this visibly).
- Capture every objection verbatim into `docs/product/LAUNCH_NOTES.md` — objections
  are free positioning and pricing research.
- Within a week: retro in the same file — traffic, signups, activation (first 200),
  which angle drew which audience. Feed conclusions back into `CAMPAIGN_OPTIONS.md`.

## Compliance notes specific to launches

Launch posts are public copy: guardrails 1–6 apply in full, including in *comment
replies* written in haste. Prepared honest answers beat improvised ones — draft the
"isn't SEC data free?", "how is this different from sec-api.io?", and "is this
investment advice?" replies before launch day.

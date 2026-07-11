---
name: growth-analytics
description: Growth measurement expertise for the secfin API — funnel metrics, activation/retention definitions, usage analysis from the api_key_usage data, campaign attribution, pricing/gating decisions from evidence. Use when defining metrics, analyzing signup/usage data, evaluating a campaign's results, or asked "is this working?".
---

# Growth analytics

Load `marketing-guardrails` first. This skill turns the other skills' work into
evidence; its job is to prevent narrative-driven decisions.

## What we can already measure (use before building anything new)

- **Signups**: `api_keys` table (email, tier, created) via `ApiKeyRepository`.
- **Usage**: `api_key_usage` daily per-key request counts (feeds quotas and
  `GET /v1/usage`). This is the activation/retention backbone.
- **Not yet captured**: per-endpoint usage, referrer/attribution, docs analytics.
  Propose additions only when a named decision needs them, and keep them behind the
  repository interfaces like everything else. Analytical/batch analysis belongs in
  the DuckDB layer (guardrail 6: never on the live request path).

## Metric definitions (keep stable; changing a definition resets its history)

- **Signup**: key issued via `POST /v1/signup`.
- **Activated**: first 2xx against a gated endpoint (excluding `/usage` itself) —
  the "first 200" the launch and devrel skills optimize.
- **Engaged**: requests on ≥3 distinct days in the trailing 14.
- **Retained (Wk4)**: any request in days 22–28 after signup.
- **Converted**: moved to a paid tier (admin-gated today; self-serve later).
- North-star while pre-revenue: **weekly engaged keys**. Post-pricing: paying keys ×
  churn. Vanity metrics (page views, HN points, PH rank) are diagnostics, never goals.

## Practices

1. **Decision-first analysis.** Every analysis names the decision it feeds ("gate
   ownership endpoints on paid?" needs per-endpoint usage; "did the HN launch work?"
   needs signup + activation around the date). No dashboards for their own sake.
2. **Cohort by acquisition wave.** Launch-week keys behave differently from
   steady-state keys; blending them hides both signals.
3. **Small-N honesty.** Early counts are tens, not thousands — report absolute
   numbers with "too early to trend" flags rather than percentages that imply
   precision. No A/B testing until traffic supports it; sequential before/after with
   dates is the honest tool at this scale.
4. **Attribution will be rough.** UTM params on links we control, a "where did you
   hear about us?" free-text field on signup if added later, and timing correlation.
   State uncertainty; don't build attribution theater.
5. **Privacy posture**: emails are the only PII; never export them into analyses or
   docs — analyses use key ids and aggregates.

## Output contract

Recurring reporting and analyses live in `docs/product/METRICS.md` (definitions above
go there on first real report, then treat them as append-only). Campaign retros
(launch, content pushes) go in the campaign's own notes file with the numbers, the
prior expectation, and the decision taken. Ad-hoc queries/scripts: `scripts/` if
reusable, scratchpad if not — same repo conventions as everything else.

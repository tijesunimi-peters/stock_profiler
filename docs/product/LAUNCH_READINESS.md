# Launch readiness checklist

*Status as of 2026-07-11. Companion to `CAMPAIGN_OPTIONS.md` (channel plan) and the
engineering pre-launch checklist in `docs/ROADMAP.md` (complete — this file picks up
where that one ends). Update statuses in place as items land; add the completion date
and verification evidence next to each, matching the ROADMAP.md style.*

**Launch definition:** the Show HN → Product Hunt → community sequence in
`CAMPAIGN_OPTIONS.md`, pointed at a publicly hosted API strangers can sign up for.

## Already verified (engineering — see docs/ROADMAP.md pre-launch checklist)

- [x] SEC compliance confirmed against SEC's own docs; User-Agent enforced at every
      entry point; process-wide throttle proven under real concurrent load (2026-07-07)
- [x] Warm cache path load tested (~11–14ms hits); cold path tested at the 8 req/s
      ceiling; upstream SEC failures return 502/503 with retry guidance, not bare 500s
- [x] Backup/restore round-trip verified against the live volume (2026-07-07)
- [x] All Track 1 features complete (M4 done); auth, tiers, quotas, usage metering
      verified end-to-end

## 1. Pricing story — THE launch blocker

- [ ] Decide price points for basic and pro (landscape input:
      `MARKET_FEASIBILITY.md` suggests $15–29 basic, $79–99 pro; use the
      `pricing-strategy` skill; record the decision in `PRICING.md`)
- [ ] Choose the launch posture: (a) Stripe self-serve upgrade, or (b) explicit
      "free during beta — planned prices are X/Y" note on the site. Either unblocks
      launch; unclear pricing does not.
- [ ] If (a): payment flow behind the existing `ApiKeyRepository` boundary; billing
      state must not leak into route handlers (repo guardrail 5)
- [ ] Published tier limits and `auth/tiers.py` enforced limits match exactly

## 2. Production deployment

*Prep complete 2026-07-11 (infra track): `docs/DEPLOYMENT.md` runbook,
`docker-compose.prod.yml` (API loopback-only behind Caddy TLS), systemd
timers + wrapper scripts under `deploy/`, and `scripts/verify_deployment.py`
(10/10 against local compose, incl. a real SEC call, a real 429 trip, and a
backup → volume-wipe → restore round trip — see `tracks/infra.md`). The boxes
below describe deployed-state facts and stay unchecked until a host exists;
each is now a runbook step rather than open design work.*

- [ ] Pick a host (single small VPS fits the design — in-memory per-key limiter and
      process-wide SEC throttle assume ONE uvicorn process; do not add `--workers`
      without revisiting both)
- [ ] Domain + TLS
- [ ] Uptime monitoring with alerting (external ping service is enough)
- [ ] `SEC_USER_AGENT` set to a real contact address in production env
- [ ] Cron: daily incremental ingest (`python -m secfin.ingest.incremental`)
- [ ] Cron: scheduled backups (`python -m secfin.storage.backup`) with the backup
      dir on storage that survives the app volume (mirrors the compose setup)
- [ ] Verify the deployed instance end-to-end: signup → key → gated request → 429
      behavior, from outside the host

## 3. Data coverage at launch

- [ ] Bulk-seed insider cache (`python -m secfin.ingest.insider_backfill`) — live DB
      held only **72 insider filings** at the 2026-07-07 restore check
- [ ] Bulk-seed 13F holdings (`python -m secfin.ingest.institutional_backfill
      --period <latest quarter>`) — live DB held only **2 holdings snapshots**
- [ ] Re-run the metrics pipeline afterward (sic_backfill → metrics_backfill →
      peer_ranks) so peer ranks reflect the seeded data
- [ ] Spot-check a launch-day basket (AAPL-class large caps + a few likely HN
      favorites) across ALL endpoint families: statements, insider, 13F manager +
      issuer views, metrics, peers, screening

## 4. Legal & trust pages

- [x] Privacy policy (emails are collected at signup — not optional) — done
      2026-07-11: `/privacy` live; collected fields verified against the actual
      `api_keys` schema, IPs confirmed in-memory-only, no trackers. **Draft-bannered
      pending operator legal review**; contact/repo links are placeholders.
- [x] Terms of service (acceptable use, tier limits as published, no-SLA-at-launch,
      termination) — done 2026-07-11: `/terms` live; tier table copied verbatim from
      `auth/tiers.py` (test-asserted); says "free during beta" until `PRICING.md`
      exists; termination matches the real admin-gated revocation state.
      **Draft-bannered pending legal review**; governing-law clause is a placeholder.
- [x] "Data, not investment advice" disclaimer, linked from the footer — done
      2026-07-11: `/disclaimer` live with the 13F derived-delta/long-only/45-day
      caveats; footer-linked from every page (static footers, `app.js` shared
      `footer()`, explorer) — link presence test-asserted (`tests/test_static_pages.py`).
- [x] Data source & methodology page: SEC EDGAR, public domain, freshness/lag per
      dataset, the 13F derived-delta + ~45-day-lag caveat stated plainly
      (doubles as the E-E-A-T surface `content-seo` needs) — done 2026-07-11:
      `/methodology` live; per-dataset freshness/lag table, full 13F caveat set,
      what's-not-covered list; leaves the redistribution re-verification below open.
- [ ] Re-verify SEC fair-access/redistribution terms launch week (last checked
      2026-07-07 with an explicit "re-verify before launch" note)

## 5. Onboarding funnel

- [ ] Timed test, as a stranger: landing → signup → key → first successful curl in
      **under 2 minutes** on the deployed instance
- [x] First documented example returns interesting real data (e.g. AAPL income
      statement), copy-pasteable curl then Python — done 2026-07-11: landing-page
      hero rewritten from a fictional endpoint/shape to the real
      `GET /v1/companies/AAPL/statements/income` call with arithmetic-checked real
      FY2023 figures and real GAAP source tags; guide gained a curl-then-Python
      step 0 against the same keyless endpoint.
- [x] Docs answer the skeptical five up front: data source, freshness, what's NOT
      covered (no prices, US-only, no Track 2 text), how 13F deltas are derived,
      what free actually includes — done 2026-07-11: `guide.html` `#skeptical`
      section directly after the hero, each answer linking to its backing page.
- [x] Error responses a newcomer hits (401, 429, unknown ticker, bad period) each
      say what to do next — done 2026-07-11: guide error table gained a
      "what to do next" column; API's own detail strings reviewed as adequate
      (verified live: unknown ticker → 404 `Unknown ticker: …`). Fixed a false doc
      claim that 503 was admin-only (the upstream-transport handler returns it to
      customers).
- [x] Public API reference presentable (FastAPI /docs pass: descriptions, examples,
      auth explained) — reviewed 2026-07-11: `_OPENAPI_DESCRIPTION`/`_OPENAPI_TAGS`
      already cover auth + the 13F caveat with per-tag grouping; no gap found,
      `/docs` verified 200.

## 6. Ops & abuse handling

- [ ] Key revocation path (explicitly unbuilt per ROADMAP M3 notes) — at minimum an
      admin-gated disable before strangers hold keys
- [ ] Error-rate visibility: a way to see 5xx spikes and yesterday's traffic without
      SSHing around (log review routine is enough at this scale) — *routine
      documented 2026-07-11 in `docs/DEPLOYMENT.md` (Caddy JSON access logs +
      journald); verify on the real host before checking*
- [ ] Feedback/support channel (GitHub issues is enough) linked from docs and site
      footer
- [ ] Decide on email verification at signup: currently none (any string gets a
      key). Acceptable for launch? If deferring, note the abuse exposure and the
      trigger to revisit (e.g. quota-evasion via throwaway signups)
- [ ] Signup-spike safety re-check on the deployed host: burst of new keys must not
      translate into an SEC request spike (cache-aside + shared limiter held in
      testing; confirm once on production hardware)

## 7. Launch assets (see `launch-campaign` + `content-seo` skills)

- [ ] 2–3 technical war-story posts written and published as the content runway —
      *three WRITTEN 2026-07-11 (`docs/product/drafts/war-story-*.md`, each with a
      marketing-guardrails compliance check); PUBLISHING is an operator action
      pending a place to publish*
- [x] Show HN post drafted (war-story angle, not product pitch) + Product Hunt
      listing drafted with its own distinct angle — done 2026-07-11:
      `drafts/show-hn-post.md` (war-story angle + prepared in-thread context),
      `drafts/product-hunt-listing.md` (product-surface angle, no copy reuse).
      Both name their pre-posting gates: pricing story resolved + live deployment.
- [x] Prepared honest answers to the predictable objections: "isn't SEC data
      free?", "how is this different from sec-api.io?", "is this investment
      advice?", "where are the prices?" (both meanings) — done 2026-07-11:
      `drafts/objection-answers.md`; sec-api.io's full-text-search strength stated
      honestly; the dollar-pricing half is a bracketed placeholder pending the
      pricing decision.
- [ ] Launch-day availability blocked out: in-thread responses within minutes,
      small fixes shipped live
- [x] `LAUNCH_NOTES.md` ready to capture objections verbatim + the retro within a
      week (traffic, signups, activation = first 200) — done 2026-07-11: empty
      template at `docs/product/LAUNCH_NOTES.md` (per-post verbatim log + retro
      tables).

## Parallel execution

This checklist runs as four parallel tracks via the `/launch-parallel` mode
(`.claude/skills/launch-parallel/`), one background subagent per track
(`.claude/agents/launch-{code,data,writing,infra}.md`), each with its own file lane
and a notes log under `tracks/`:

- **code** — §1 plumbing + §6 revocation (worktree; blocked on a pricing decision
  for the Stripe half)
- **data** — §3 backfills + spot-checks (live Docker volume; hours of wall clock)
- **writing** — §4 legal/trust pages, §5 copy, §7 assets (worktree)
- **infra** — §2 as runbook + scheduled-job files + verification script (worktree;
  prep-only until a host exists)

**Run log:** 2026-07-11 — writing + infra tracks ran and converged (merged to
master; full suite 294 passed / 6 skipped post-merge; `verify_deployment.py`
re-run independently, 10/10). code and data tracks have NOT run yet.

Convergence (orchestrator, after tracks land): merge branches, verify claims, flip
checkboxes here, then the deployed-host verifications (§2 external check, §5 timed
stranger test, §6 spike re-check). Operator-only actions — price-point decision,
Stripe account, domain, VPS, legal review — are the critical path once tracks
complete. The long poles are Stripe integration (if chosen) and backfill wall-clock
time.

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

## 1. Pricing story — THE launch blocker (RESOLVED 2026-07-14)

- [x] Decide price points for basic and pro — decided 2026-07-14 (operator):
      **$19/mo basic, $79/mo pro (planned)**, recorded with the landscape snapshot,
      standing commitments (free-tier promise, grandfathering) and revisit triggers
      in `PRICING.md`.
- [x] Choose the launch posture — decided 2026-07-14 (operator): **(b) free during
      beta with planned prices published**. Site updated: `/terms` tier table +
      pricing note, `/guide` tier note, and the landing pricing section (which also
      had a stale fictional "$29 Developer" card and a false "signups aren't open
      yet" line — replaced with the real tiers and a `POST /v1/signup` CTA).
- [ ] ~~If (a): payment flow~~ — N/A for launch (posture (b) chosen). Stripe is
      post-launch work, gated by `PRICING.md` revisit trigger 1 (re-verify landscape,
      announce beta end, grandfather beta keys) and stays behind the
      `ApiKeyRepository` boundary when built (repo guardrail 5).
- [x] Published tier limits and `auth/tiers.py` enforced limits match exactly —
      verified 2026-07-12 (code track): `/terms`, `/guide`, ROADMAP, and
      MARKET_FEASIBILITY all match `TIERS`; enforcement (burst + daily quota)
      matches published numbers with no off-by-one; drift tests now derive
      expected strings from `TIERS` at import time (`tests/test_static_pages.py`).

## 2. Production deployment

*Prep complete 2026-07-11 (infra track): `docs/DEPLOYMENT.md` runbook,
`docker-compose.prod.yml` (API loopback-only behind Caddy TLS), systemd
timers + wrapper scripts under `deploy/`, and `scripts/verify_deployment.py`
(10/10 against local compose, incl. a real SEC call, a real 429 trip, and a
backup → volume-wipe → restore round trip — see `tracks/infra.md`). The boxes
below describe deployed-state facts and stay unchecked until a host exists;
each is now a runbook step rather than open design work.*

- [x] Pick a host — decided 2026-07-14 (operator): **DigitalOcean** (PaaS ruled out:
      ephemeral filesystem loses the SQLite volume). Provisioned same day:
      droplet `secfin-api`, TOR1, $12 Basic (1 vCPU/2GB/50GB), 143.198.37.67,
      Ubuntu 24.04, cloud firewall inbound 22/80/443 only. Runbook §3–§8 executed:
      repo at `/opt/secfin` (rsynced — no deploy key yet, so day-2 `git pull` needs
      one), prod image built, DB hydrated from the seeded local backup
      (`secfin-20260715T022201Z.db`, 695MB) via `restore --latest`, `api` service
      up loopback-only. Verified: `/health` ok; AAPL FY2023 income served from the
      restored DB; gated endpoint demands key; `:8000` confirmed unreachable from
      outside (only 22 open until Caddy starts).
- [x] Domain + TLS — done 2026-07-14: **clearyfi.com** (operator purchase,
      Namecheap DNS). Two-host layout (operator decision): `clearyfi.com` =
      site/frontend, `api.clearyfi.com` = documented API base, both proxying the
      same app; `www` 301s to bare. Let's Encrypt certs obtained for all three on
      first Caddy start; `guide.html` placeholders replaced with the real domain.
- [x] Uptime monitoring with alerting (external ping service is enough) — done
      2026-07-14 via DO's own (free) monitoring, no third-party account needed:
      external uptime check on `https://api.clearyfi.com/health` from
      us_east+us_west with email alerts on down-for-2m and TLS-expiry<14d, plus
      droplet CPU/memory/disk threshold alerts, plus an in-app
      `GET /v1/admin/ops` snapshot (response-class counters, per-day
      traffic/signups/keys). See `docs/DEPLOYMENT_DO.md` §6.
- [x] `SEC_USER_AGENT` set to a real contact address in production env — done
      2026-07-14: real contact address in `/opt/secfin/.env` (mode 600), plus a
      fresh `SECFIN_ADMIN_SECRET` generated on-box (never left the droplet).
- [x] Cron: daily incremental ingest (`python -m secfin.ingest.incremental`) —
      installed 2026-07-14 via `deploy/install.sh`; `secfin-incremental.timer`
      active, first fire 2026-07-15 06:00 UTC. *Re-verify
      `/var/log/secfin/incremental.status` after the first run.*
- [x] Cron: scheduled backups (`python -m secfin.storage.backup`) with the backup
      dir on storage that survives the app volume (mirrors the compose setup) —
      installed 2026-07-14, same evidence; `secfin-backup.timer` first fire
      2026-07-15 07:00 UTC, writes to the droplet's `/opt/secfin/data/backups`
      bind mount. *Off-droplet backup destination still an open operator decision
      (see the backup-posture discussion, 2026-07-14).*
- [x] Verify the deployed instance end-to-end: signup → key → gated request → 429
      behavior, from outside the host — done 2026-07-14:
      `verify_deployment.py --base-url https://api.clearyfi.com` run from the
      operator's machine (not the droplet), **10/10 passed** — health, real
      signup, gated request with the fresh key, free-tier 429 trip, unknown-ticker
      404, `/docs`, and all four static pages over live TLS.

## 3. Data coverage at launch

- [x] Bulk-seed insider cache (`python -m secfin.ingest.insider_backfill`) — done
      2026-07-12 (data track): 122 → **60,744 filings / 162,050 transactions**,
      6,315/6,736 issuers. First attempt no-opped on a real bug (issuer discovery
      trusted only the empty `ingest_checkpoint`); fixed by the code track with a
      regression test, then re-run on the rebuilt image. See `tracks/data.md`.
- [x] Bulk-seed 13F holdings (`python -m secfin.ingest.institutional_backfill
      --period 2026-03-31`) — done 2026-07-12 (data track): 5 → **8,771 snapshots
      at 2026-03-31** (99.6% of 8,803 candidates; 32 validation-error stragglers),
      3.38M holding rows. First run crashed on a duplicate cover-page
      `sequenceNumber` (CIK 1890906); code track added per-candidate isolation +
      parse-time dedup, rerun completed cleanly in ~16 min.
- [x] Re-run the metrics pipeline afterward (sic_backfill → metrics_backfill →
      peer_ranks) so peer ranks reflect the seeded data — done 2026-07-12:
      6,736/6,736 SIC codes, metrics + ranks idempotent, zero failures.
      *Known limit: peer-ranks/screening breadth is real only at FY2023 —
      `frames_backfill` was never run for 2024–2026 (operator scope decision;
      hours of SEC requests).*
- [x] Spot-check a launch-day basket (AAPL-class large caps + a few likely HN
      favorites) across ALL endpoint families: statements, insider, 13F manager +
      issuer views, metrics, peers, screening — done 2026-07-12 (data track basket:
      AAPL/MSFT/NVDA/TSLA/WMT/JPM/PLTR/GME + Berkshire-as-manager). Found the
      frame-only-CIK bug that permanently 404'd statements for 6,721 of 6,736
      CIKs; fixed (code track), verified healed live on PLTR + GME (real income
      statements via SEC fallback, 2026-07-12).

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

- [x] Key revocation path (explicitly unbuilt per ROADMAP M3 notes) — at minimum an
      admin-gated disable before strangers hold keys — done 2026-07-12 (code
      track): `POST /v1/admin/keys/{email}/revoke` (`X-Admin-Secret`-gated, 503 if
      secret unset), behind `ApiKeyRepository.revoke_key`. Verified live at
      convergence: signup → 200 → revoke → **401 on the very next request** (no
      cache, no delay). Requires `SECFIN_ADMIN_SECRET` set in production env.
- [x] Error-rate visibility: a way to see 5xx spikes and yesterday's traffic without
      SSHing around (log review routine is enough at this scale) — routine verified
      on the real host 2026-07-14: status-code breakdown, 5xx grep (zero since
      deploy), and api-container tail all work as documented. Bonus finding: the
      404s are scanner probes (`/.env`, `/.git/config` — correctly 404ing, nothing
      sensitive in the web surface) plus missing `/favicon.ico` and `/robots.txt`
      (polish, not blocking).
- [ ] Feedback/support channel (GitHub issues is enough) linked from docs and site
      footer
- [x] Decide on email verification at signup — decided 2026-07-14 (operator):
      **defer**; launch without verification. Exposure: throwaway strings get free
      keys, so per-key quotas can be evaded by re-signup; blast radius is bounded
      (keys are admin-revocable, the shared SEC throttle is process-wide, and the
      anon limiter caps keyless traffic). Revisit triggers: evidence of
      quota-evasion via throwaway signups (visible in `api_key_usage` review), or
      before billing goes live (payment requires a real address anyway).
- [x] Signup-spike safety re-check on the deployed host: burst of new keys must not
      translate into an SEC request spike (cache-aside + shared limiter held in
      testing; confirm once on production hardware) — verified 2026-07-14 on the
      live droplet: 15 fresh keys issued in ~11s, then 45 gated/public calls across
      an 8-ticker basket; outbound SEC traffic measured with tcpdump (all outbound
      :443 SYNs, deduped) = **56 connections over 23s, ~2.4/s avg, peak 2–4/s** —
      nowhere near the 8 req/s throttle ceiling. Statements/insider served pure
      cache (zero SEC traffic); the per-IP anon limiter tripped correctly (3×429)
      on the repeated public-endpoint calls. Test keys revoked after (15/15 → the
      revocation path exercised again in prod). *Known behavior, not a defect:
      `beneficial-ownership` (13D/G) revalidates against SEC per request (~2
      connections each; it was never bulk-seeded, unlike insider/13F) — under a
      real burst it queues behind the shared throttle and slows down while SEC
      stays protected, the designed failure mode. Warm-seeding 13D/G is optional
      post-launch work.*

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

**Run log:** 2026-07-12 — code + data tracks ran and converged. Code: key
revocation + tier-drift tests, plus three real bugs found by the data track's
live runs and fixed mid-session (insider issuer discovery on checkpoint-less
DBs; 13F per-candidate crash isolation + cover-page `sequenceNumber` dedup;
frame-only-CIK statements 404). Data: §3 fully seeded (counts above), backup
taken first (`secfin-20260711T190135Z.db`). Convergence verification on the
rebuilt image: full suite **311 passed / 6 skipped**; revocation live
(200 → revoke → 401); PLTR/GME statements healed; `verify_deployment.py`
10/10. All four tracks are now complete; the remaining unchecked items are
operator-only or need a deployed host.

Convergence (orchestrator, after tracks land): merge branches, verify claims, flip
checkboxes here, then the deployed-host verifications (§2 external check, §5 timed
stranger test, §6 spike re-check). Operator-only actions — price-point decision,
Stripe account, domain, VPS, legal review — are the critical path once tracks
complete. The long poles are Stripe integration (if chosen) and backfill wall-clock
time.

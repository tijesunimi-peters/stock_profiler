# QA: institutional-holder treemap (Phase 2a)

**Role:** QA Tester → DevOps Engineer
**Task slug:** `institutional-tab-viz` (Phase 2a)
**Branch:** `institutional-conviction-heatmap`
**Date:** 2026-07-19
**Verdict: 🟢 PASS — ready to deploy** (deploy stays operator-gated).

Verified against `1c-brief-phase2a-institutional-treemap.md`. This is the re-scoped treemap
(pooled ingested-filer shares) that fixes the round-4 remainder-dominance kill.

---

## Gates (independent re-run)

- **`docker compose --profile test run --rm test`** → **376 passed, 6 skipped.**
- **`docker compose --profile e2e up --abort-on-container-exit --exit-code-from e2e`** →
  **HEADLESS CHECK: PASS**, `errors=0` on all 13 pages incl. both institutional pages.
- **Live flow** (brought up `e2e-app`, curled the real endpoint): confirmed the shipped JSON
  contract and the top-N/other-tile math end-to-end (below).

## Live evidence

`GET /v1/companies/AAPL/institutional-conviction?period=2026-03-31&top=1`:
```
keys: caveats, cik, cusips, holders, ingested_filer_count, na_filers, other_ingested,
      period, pool_total_shares        # NO shares_outstanding key (removed)
pool_total_shares: 2.23e9   ingested_filer_count: 3
holders: [("VANGUARD GROUP INC", 0.5874)]
other_ingested: {filer_count: 2, shares: 9.2e8, weight: 0.4126}
shown + other sum: 1.0
```
→ **AC-1 confirmed live:** a shown filer's weight is its slice of the whole pool, and shown +
`other_ingested` sum to **1.0** (the treemap tiles to 100%, no giant remainder).

## Screenshots (`data/e2e-shots/`)

- **AAPL** — dense treemap: Vanguard **58.7%** / State Street **28.7%** / Berkshire **12.6%** fill
  the box, sum to 100%. Note: *"Sized by each filer's share of the 2.23B shares held by the 3
  ingested 13F filers this quarter — a share of the reported institutional holdings, NOT of the
  company."* No dominating remainder.
- **JPM** — NORTHLESS **60.0%** + EVERPEAK **40.0%** (pool 3.8M); geography empty-state guard
  intact; no console errors.
- Existing components (composition strip, Top-N, concentration tiles, accumulation series,
  choropleth) all still render (AC-8).

## Acceptance criteria

| Criterion | Result | Evidence |
|---|---|---|
| **AC-1** weight = shares ÷ pool; squares + other sum to 100% | ✅ | live `top=1`: 0.5874 + 0.4126 = 1.0; route test (weights sum 1.0); screenshots dense |
| **AC-2** "share of ingested 13F shares", NOT shares-outstanding / NOT % of company / NOT all institutional | ✅ | caption + `_CONVICTION_CAVEATS` (grep: all three negations present); tooltip "% of ingested 13F shares"; note "NOT of the company" |
| **AC-3** coverage-dependent + empty ≠ zero | ✅ | caveat "Coverage-dependent…not a confirmed zero"; empty-quarter route test → `pool_total_shares: null` |
| **AC-4** SH-only; options/PRN excluded (filer + pool) | ✅ | route tests: option+PRN excluded, options-only filer excluded, multi-class SH summed |
| **AC-5** discretion, not beneficial ownership | ✅ | caption + caveat ("DISCRETION … not the firm's own beneficial ownership") |
| **AC-6** null share count → N/A in `na_filers`, never 0/square | ✅ | route test (`na_filer_is_excluded_from_the_pool`); UI footnote, never sized |
| **AC-7** single-quarter, quarter shown, thin/empty honest state, both themes | ✅¹ | response `period`; empty-quarter test; `states.empty` branches; theme via `cssVar` tokens |
| **AC-8** existing components intact; pytest + e2e green | ✅ | screenshots; 376 pass; e2e PASS |

¹ Dark theme is theme-aware **by construction** (all colors via `cssVar` tokens, same as every
other chart); the e2e captures one theme, so dark mode is not independently screenshotted — an
evidence gap consistent with the repo's existing charts, not a defect.

## Honesty contract — verified

- Denominator labelled the ingested-13F pool, explicitly **NOT** shares outstanding / **NOT** % of
  the company / **NOT** all institutional ownership. ✅
- No "not held" / "not reported by these filers" remainder wording — the aggregate tile is
  **"Other ingested filers (N)"**, a labelled minority sibling. ✅
- Options (put/call) + PRN **excluded** from filer shares and the pool. ✅
- 13F = investment **discretion**, not beneficial ownership — stated. ✅
- N/A filers listed, never a 0 or a fabricated square; empty → honest empty state. ✅
- No security review needed: read-only issuer-centric endpoint, no auth/API-key/rate-limiter/ingest
  path; a pure `holders_of` composition (no companyfacts, no DuckDB — guardrail 6 clean).

## Notes for the commit (not defects)

1. **The branch carries two logical changes.** Besides the treemap, it also holds the earlier
   **senior-engineer skill split** (`.claude/skills/senior-engineer`, `senior-backend-engineer`,
   `senior-frontend-engineer`, `principal-architect`, `qa-tester`, `docs/delivery/README.md`).
   These are unrelated to the treemap — when committing, they should be **separate commits** (or the
   operator's call). Flagging so the treemap commit stays clean.
2. **`other_ingested` tile + `na_filers` footnote** are not in the demo fixtures (AAPL 3 / JPM 2
   filers, `top=20`). They are route-tested and one was live-driven via `top=1`; a real page with
   >20 filers or a null-share filer would render them. Coverage of the demo, not the feature.

## Handoff → DevOps

🟢 **PASS — ready to deploy.** A green QA report unlocks a deploy *request*; the deploy itself
stays operator-gated. Nothing committed or pushed yet.

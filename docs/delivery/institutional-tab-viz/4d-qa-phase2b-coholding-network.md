# QA: co-holding network (Phase 2b)

**Role:** QA Tester → DevOps Engineer
**Task slug:** `institutional-tab-viz` (Phase 2b)
**Branch:** `institutional-conviction-heatmap`
**Date:** 2026-07-19
**Verdict: 🟢 PASS — ready to deploy** (deploy stays operator-gated).

Verified against `1d-brief-phase2b-coholding-network.md` (AC-1…AC-8).

---

## Gates (independent)

- **`docker compose --profile test run --rm test`** → **390 passed, 6 skipped.**
- **`docker compose --profile e2e up --abort-on-container-exit --exit-code-from e2e`** →
  **HEADLESS CHECK: PASS**, `errors=0` on all 13 pages (re-run independently — same result).
- **Code review** of the co-holding path + **honesty grep** of backend caveats and frontend.

## Acceptance criteria

| Criterion | Result | Evidence |
|---|---|---|
| **AC-1** nodes = top-K holders, size = stake (shares) | ✅ | route test (top-K, multi-class summed); AAPL screenshot (large Vanguard/State St, small cluster) |
| **AC-2** edges = overlap in OTHER holdings, derived not trading; **no herding/style** | ✅ | caption (JPM shot) + `_COHOLDING_CAVEATS`; grep clean (only the "never a …(momentum/value)… label" negation) |
| **AC-3** overlap on CUSIP, this issuer excluded | ✅ | `test_coholding` (exclude) + route test; live AAPL Vanguard `other_holdings_count=1` (just {Ally}, AAPL excluded) |
| **AC-4** thin/empty → honest state, never a fake network | ✅ | **JPM live**: "No shared other-holdings to connect" note; route test (1 holder → 0 edges); `<2` → empty branch |
| **AC-5** bounded, no unbounded cross-manager scan / no DuckDB | ✅ | code review: `holders_of[:top]` → `manager_cusip_sets` → `co_holding_edges`; `top`≤50 bound; grep: no DuckDB on path |
| **AC-6** standing 13F + coverage caveats | ✅ | `_COHOLDING_CAVEATS ⊇ _ISSUER_CENTRIC_CAVEATS` + coverage-dependent line |
| **AC-7** self-contained d3-force, **deterministic**, both themes | ✅ | vendored `d3-force` (no CDN); **zero `Math.random`** in the fn, seeded circle positions + 300 synchronous ticks; `cssVar` tokens |
| **AC-8** existing components intact; pytest + e2e green | ✅ | 7-holder AAPL page renders composition/Top-N/treemap/series/choropleth; 390 pass; e2e PASS |

## Live evidence

- **AAPL** (`data/e2e-shots/institutional.png`): a legible force-directed graph — the
  Fairwind/Greystone/Meridian/Hallmark **cluster** + the **Vanguard↔State Street** pair (two large
  nodes), with **Berkshire an isolated node** (shares nothing above threshold). Matches the
  backend's live 7-node/6-edge output. Node size tracks stake; edges present; caption + note carry
  the honesty framing.
- **JPM** (`institutional-nolocation.png`): the honest **thin state** — both holders hold only JPM,
  so "No shared other-holdings to connect" renders, never a fake 2-node graph.

## Honesty contract — verified

- Edges labelled "**overlap in OTHER reported holdings … NOT coordinated or timed trading, and
  never an investment-style label**". ✅ No affirmative herding/momentum/smart-money/crowd usage
  (grep). ✅
- This issuer excluded from overlap (edges are the *other* names). ✅
- Isolated nodes rendered honestly (Berkshire), never dropped. ✅
- Coverage-dependent caveat present; thin/empty is a note, never a zero. ✅
- No security review needed: read-only issuer-centric endpoint; no auth/API-key/rate-limiter/ingest
  path; a bounded `holders_of` composition (no companyfacts, no DuckDB — guardrail 6 clean).

## Notes for the commit (not defects)

1. **The branch carries multiple logical changes** — the senior-engineer **skill split**
   (`.claude/skills/*`, `docs/delivery/README.md`), the **conviction→treemap** work (Phase 2a), and
   this **co-holding network** (Phase 2b). Sort into **separate commits** at commit time.
2. **The AAPL demo now has 7 institutional holders** (was 3, from `_seed_coholding`) — this
   deliberately enriches *all* AAPL institutional views (7-state choropleth, 7-filer treemap,
   composition). Everything renders cleanly; it's an intended fixture change, not a regression.
3. The `other_ingested`/`na_filers` treemap paths and the network's `top`-cap "extra edges" are not
   exercised by the demo fixtures (route-tested + one live `top=1` check earlier). Coverage of the
   demo, not the features.

## Handoff → DevOps

🟢 **PASS — ready to deploy.** A green QA report unlocks a deploy *request*; the deploy itself stays
operator-gated. Nothing committed or pushed yet.

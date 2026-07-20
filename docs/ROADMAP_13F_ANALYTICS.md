# Roadmap — 13F analysis layer (manager + institutional views)

Follow-on analysis features for `/manager/{cik}` and the company hub's Institutional tab,
scoped from a review of what the ingested data can already support (2026-07-14). This doc
sequences the items and defines the **parallel execution plan** (the worktree-track pattern
that shipped UI Phase 5 and its polish pass).

Read first: `CLAUDE.md` (13F caveats are load-bearing), `docs/STYLE_GUIDE.md` §6/§9/§10,
`docs/ROADMAP_UI.md` Phase 5 (the shipped chart builders these items extend), and
`docs/DATA_MODEL.md` (CUSIP resolution, value unit convention, coverage floors).

## Hard limits (scope guards — same spirit as the Phase 5 honesty rules)

1. **No price/market data, no performance analysis.** "How did this manager's picks do"
   requires prices — deliberately out of scope (licensing + Track 1 boundary). Do not
   approximate it from 13F values either (see #2).
2. **Value ≠ action.** A position's reported-value change conflates the manager's trading
   with market moves. Flow/turnover analysis uses **shares** or **% of book computed
   within one quarter's snapshot** (unit-safe: numerator and denominator from the same
   filing). Never a cross-quarter value delta presented as a trade.
3. **Descriptive, never prescriptive** (§9.2): no "smart money" scores, no crowding
   verdicts, no manager rankings. Counts, shares-of-book, presence/absence — with the
   standing caveats (derived-not-reported, long-only, ~45-day lag, ingested-filers-only).
4. **Serve path vs analytical layer:** per-manager / per-issuer analysis that joins point
   lookups (holdings × `company_profiles`, holdings × 13D/G rows for one issuer) stays on
   the ordinary cache-aside serve path. Anything **cross-manager or cross-issuer at scale**
   (overlap matrices, leaderboards) is a DuckDB batch job writing precomputed rows through
   a SQLite repo — never live DuckDB behind a request (CLAUDE.md guardrails 6/7).
5. **Unresolved CUSIPs are a first-class bucket.** Any analysis that needs CUSIP→CIK
   (sector composition, 13D/G cross-ref) shows "unresolved (n, m% of value)" honestly —
   the resolver is deliberately conservative and coverage will be partial.

## Data-readiness gate

Real coverage is ~one broadly-ingested quarter (2026-06-30, 579 managers) plus
single-manager history. **Phase A needs only one quarter** and is buildable now. Phase B
items are multi-quarter series — same gate as UI Phase 5.5: build after ≥4 broadly-ingested
quarters exist, or they render as honest-but-useless single points. Phase C is
batch/analytical and also benefits from more quarters but isn't strictly gated.

---

## Phase A — quarter-independent analysis (data-ready NOW)

Three vertical slices, one per track (see the parallel plan below). Each slice is
backend-(if needed)-plus-UI, end-to-end, so no track blocks on another's endpoint.

### A1 — Sector composition (manager view; issuer twin optional)
- **What:** the manager's book by industry — resolved holdings mapped CUSIP→CIK→SIC
  (`company_profiles`, already populated by `sic_backfill`), rendered as a part-to-whole
  strip (reuse the composition strip recipe: ordered segments, one hue, 2px gaps) or
  ranked bars by 2-digit SIC group, **plus the unresolved bucket** (rule 5).
- **Backend:** extend the manager holdings response (or a sibling endpoint) with a
  per-holding `sic`/`sic_description` for resolved CIKs — point lookups against
  `CompanyProfileRepository` on the existing serve path. No new canonical models.
- **Caveats copy:** composition of *resolved* reported value; unresolved n% shown, never
  redistributed.

### A2 — 13D/G cross-reference (issuer view)
- **What:** on the Institutional tab, flag which 13F holders also have a Schedule 13D/13G
  on file for this issuer (crossing 5% is a materially different kind of ownership).
  A badge on the holders table rows + a small "5%+ owners on file" list linking the two
  datasets, with the 13D/G ~mid-2025 structured-XML coverage floor carried.
- **Backend:** join the issuer's `beneficial_ownership` rows (already served) against the
  holders list by owner/manager name — **conservative exact-normalized match only**, same
  philosophy as the CUSIP resolver (a wrong link is worse than no link); unmatched names
  simply carry no badge. Matching helper lives in `normalize/`, not in the route.

### A3 — Option/PRN exposure + co-filer attribution (manager view; NO backend)
- **What:** (a) stat tiles for the share of reported value in put/call option rows and in
  PRN principal rows (fields already parsed and rendered per-row — this aggregates them);
  (b) the co-filer roster becomes analytical: per-holding `other_managers` discretion refs
  aggregated into "positions/value by discretion-holder" (the data is already in every
  holdings response).
- Pure client-side over the existing response; reuse `.stat-tiles` + the strip/bars
  builders.

### A4 — Insider × institutional juxtaposition (issuer view) — second wave
- **What:** a shared calendar timeline for one issuer: derived institutional flow
  (quarterly, shares) alongside as-reported insider transactions (dated) — side-by-side
  small multiples, **never one axis**, no causal framing.
- Data-ready (both endpoints exist) but UI-heavy; deliberately not in the first parallel
  batch to keep tracks small. Schedule after A1–A3 merge, or as a fourth track if the
  batch runs clean.

### Phase A tasks
- [ ] A1 sector composition (backend SIC join + strip/bars UI + unresolved bucket)
- [ ] A2 13D/G cross-reference (conservative name-match helper + holder badges + owners list)
- [ ] A3 option/PRN exposure tiles + co-filer attribution (client-side)
- [ ] A4 insider × institutional timeline (second wave)

## Phase B — multi-quarter series (GATED: ≥4 broadly-ingested quarters)

Same gate as UI Phase 5.5. All reuse the value-line/count-strip fetch loop and chart
conventions (calendar axis, gaps break lines, clip pre-2024 for anything value-based).

- [ ] B1 Turnover intensity per quarter (entries/exits/changed positions as % of book by
      count — shares-basis, rule 2)
- [ ] B2 Concentration trend (top-1/top-10 share series; %-within-quarter is unit-safe)
- [ ] B3 Position tenure ("held since …" per holding; longest-held list)
- [ ] B4 Issuer ownership breadth + holder churn series (n filers holding; new vs exited
      per quarter)
- [ ] B5 Issuer net derived flow in shares per quarter (sum of signed changes, standing
      caveats)

## Phase C — cross-entity batch analytics (DuckDB, precomputed)

Analytical-layer jobs in `analytical/` (same `ATTACH` mechanism as `peer_ranks`), writing
precomputed tables through ordinary SQLite repos; endpoints are point lookups (rule 4).

- [ ] C1 Manager overlap/similarity (value-weighted book intersection; "most similar
      books" is descriptive output, not a recommendation)
- [ ] C2 "Most widely held / most added / most exited this quarter" leaderboards
      (discovery page; adjacent to M4 screening — share its query path, don't fork one)
      - [ ] C2a **Cluster buying** (explicit slice of "most added"): issuers ranked by the
        number of **independent** managers that NEWLY entered (prior-quarter shares 0 → >0)
        the same quarter — the strongest single 13F signal. A count of distinct new-entrant
        managers per issuer, derived via `flows.diff_holders`/`summarize_activity` over the
        whole-quarter inversion. Descriptive only (rule 3) — a count, never a "smart money"
        score or crowding verdict; carries the standing derived-not-reported / long-only /
        ~45-day-lag / ingested-filers-only caveats.
- [ ] C3 Amendment diff view (original vs amended snapshot for one (manager, quarter) —
      the diff machinery exists in `normalize/flows.py`)
- [ ] C4 **Sector rotation (market-wide)** — cross-manager, multi-quarter aggregate of the A1
      SIC join: total reported value share (and filer count) by 2-digit SIC group per quarter
      across ALL ingested managers, as a quarter-over-quarter series, to surface macro shifts
      (e.g. growth → defensive). Distinct from A1 (one manager's book). Reuses the C-layer
      `ATTACH` mechanism (rule 4) + the SIC join; the unresolved-CUSIP bucket is shown, never
      redistributed (rule 5). **Descriptive only** (rule 3): a share-of-book / filer-count series
      by sector, never a "rotation call" or allocation recommendation. Cross-quarter comparison
      is **%-within-quarter or filer-count / shares** (unit-safe, rule 2) — never a cross-quarter
      raw value delta. Gated by data depth like Phase B (needs several broadly-ingested quarters
      to read as a trend, not a single point).
- [ ] C5 **Under-the-radar discovery (low institutional breadth)** — issuers held by only a FEW
      ingested 13F filers (low holder count), optionally with ≥1 newly-entering manager, as a
      discovery list. **In-scope proxy ONLY — this is NOT a "small/mid-cap screen":** market cap
      needs price × shares-outstanding, and price/market data is barred (Hard Limit #1). Frame it
      strictly as "few reporting institutions hold this," and LEAD with the coverage caveat
      (rule 5 spirit): low breadth is coverage-dependent (only ingested filers are counted), NOT a
      confirmed absence of institutional interest. Descriptive count (rule 3) — no "hidden gem"
      language.

---

## Parallel execution plan (Phase A)

Same pattern that shipped UI Phase 5 + polish: **foundation commit on master first, then
one worktree branch per track, Sonnet implementation agents, merge + full verification at
the end.** Tracks are vertical slices specifically so no track waits on another's endpoint.

**Foundation (sequential, before spawning — keep it small):**
1. Fixture: give the seeded Berkshire book SIC coverage (seed `company_profiles` rows for
   a few of the synthetic CUSIPs' would-be CIKs is NOT possible — they're unresolved by
   design; instead seed 2–3 *resolvable* extra positions with real issuer names/CIKs so
   A1 has resolved+unresolved buckets to render) and a matching 13D/G owner name overlap
   so A2's badge path renders offline (the 13D/G fixture already uses Vanguard/State
   Street/Berkshire names — align one with a 13F holder name).
2. Agree response-shape additions in this doc before build (A1: per-holding
   `sic`/`sic_description`; A2: per-holder `has_beneficial_filing` or a separate matched
   list — implementer decides shape, records it in `DATA_MODEL.md`).
3. This doc committed; tracks must NOT edit docs (convergence flips the checkboxes).

**Tracks (worktrees off the foundation commit):**

| Track | Branch | Scope | Files owned |
|---|---|---|---|
| A1 sector | `a13f-sector` | SIC join + composition UI | `api/routes.py` (holdings route only), `normalize/` (join helper), `manager.js` (new section), `app.js` (only if a new builder variant is needed), tests |
| A2 13d/g xref | `a13f-dgxref` | name-match helper + issuer UI | `normalize/` (new match module), `api/routes.py` (holders route only), `company.js` (Institutional tab), tests |
| A3 exposure | `a13f-exposure` | option/PRN tiles + discretion attribution | `manager.js`, `app.js` (tile/aggregation helpers), NO backend |

Known merge overlaps: `api/routes.py` (A1 vs A2 — different route functions, append-style),
`app.js` export list (all), `manager.js` (A1 vs A3 — different sections). Same class of
conflicts as the Phase 5 merges; the coordinator resolves.

**Per-track verification (unchanged from Phase 5):** Docker only (host has no python) —
`cp .env.example .env`, then
`docker compose --profile e2e up --abort-on-container-exit --exit-code-from e2e e2e-app e2e`
(explicit service names — the default `api` service collides on host port 8000), PASS with
zero console errors, screenshot review of `data/e2e-shots/manager.png` /
`institutional.png`; `docker compose --profile test run --rm test` for any track touching
Python. Commit on the track branch with the Claude trailer.

**Convergence (coordinator):** merge tracks → full e2e + pytest on master → screenshot
review → flip this doc's checkboxes → remove worktrees/branches.

**A4 second wave:** single agent after the A1–A3 merge (its timeline UI touches the same
Institutional-tab region as A2 — sequencing avoids a needless conflict).

## Verify, don't assume

- A1: confirm `company_profiles` actually has SIC rows for resolved CIKs beyond the three
  fixture companies before promising coverage numbers (`sic_backfill` run state is a data
  question, not a code one).
- A2: measure the name-match hit rate on real data before shipping the badge as a feature
  (a badge that never appears is worse than no badge); report the rate in the track
  summary.
- B items: re-check the broad-quarter count before starting (the gate is about real
  ingested data, not the fixture).
- C items: inherit the 2.5 analytical-mechanism decision (DuckDB-over-SQLite `ATTACH`);
  do not introduce a new mechanism.

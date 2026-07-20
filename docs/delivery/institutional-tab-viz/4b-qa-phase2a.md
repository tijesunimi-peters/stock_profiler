# QA: institutional-tab viz — Phase 2a (per-holder conviction heatmap)

**Role:** QA Tester → hand BACK to Product Manager / Senior Engineer
**Task slug:** `institutional-tab-viz` (Phase 2a)
**Branch:** `institutional-conviction-heatmap`
**Date:** 2026-07-18
**Round 1 verdict: 🔴 BLOCKED** — own-book measure mismatched operator intent + duplication.
**Round 2 verdict: 🔴 SUPERSEDED** — "share of ticker total" built & green, but operator then
reframed it as a treemap of % of shares outstanding (a different measure + visual).
**Round 3 verdict: 🟢 PASS (built & green)** — ownership treemap; first version with a genuinely new
number (% of the company).
**Round 4 verdict (2026-07-19): ⛔ UNDONE — feature backed out at operator's request** (see
"Round 4" at the bottom). The treemap is *honest* but *uninformative*: with few ingested filers,
each holds a tiny % and the "not reported by these filers" remainder dominates (AAPL 84.8%, JPM
99.9%), so the holdings render as near-invisible slivers. All Phase-2a conviction/treemap code was
reverted; the branch is back to the Phase-1 state (accumulation series + choropleth only).

---

## Why it's blocked (the headline)

The operator's QA directive — *"the heatmap should be how concentrated the managers are on the
ticker"* — was ambiguous between two denominators. I asked; the operator chose:

> **weight = manager's reported value in the ticker ÷ ALL managers' reported 13F value in the
> ticker** ("share of the ticker's total reported ownership").

The build computes the **other** denominator (manager's own total 13F book). So the implemented
measure is wrong relative to the clarified intent — **AC-1a-P2a fails.**

**But before rebuilding, a product decision is needed (this is the real blocker):** the clarified
measure is *already on the Institutional tab, three times over*, with identical numbers. Evidence
from `data/e2e-shots/institutional.png` (AAPL, this branch):

| Existing component | Shows |
|---|---|
| "Share of total reported value" strip | Top 1 · **58.7%** |
| "Top 3 by value (own scale)" bar chart | Vanguard **58.7%**, State Street **28.7%**, Berkshire **12.6%** |
| Concentration stat tiles | Top-1 share **58.7%** |

Those are exactly the "manager ÷ ticker-total" percentages the clarified heatmap would render — so
Phase 2a would become a **fourth visualization of a number already shown**, adding a color grid but
no new information. That contradicts the brief's whole premise (`1b-brief-phase2a-heatmap.md`: the
heatmap exists to answer "*for whom is this a top position vs a rounding error*," which the tab
**cannot** currently answer — and which is the own-book measure, not this one).

**Recommendation to the operator / PM:** decide one of —
1. **Keep the own-book measure as built** (answers a genuinely new question; matches the brief).
   The build already does this and passes every other check below. This was my Q's recommended
   option.
2. **Switch to "share of ticker total" as a heatmap** — accepting it restates the existing
   composition strip / Top-N chart / tiles as a grid (no new number). If chosen, the brief (1b) and
   architecture (2b) measure definitions must be rewritten, and `book_values`/`BookValue` (built
   for the own-book denominator) become dead code to remove.
3. **Drop the heatmap from Phase 2a** if neither the own-book question nor a re-skinned
   share-of-total is wanted.

I'm not overriding the operator's selection — I'm flagging that it collides with existing UI, which
is a product-value call above QA's pay grade. Everything below is the mechanical verification, all
green, so whichever measure wins, the plumbing is sound.

---

## Verification evidence (mechanical — all PASS)

- **Full suite:** `docker compose --profile test run --rm test` → **380 passed, 6 skipped**
  (2 re-runs, stable). New: `book_values` repo tests + conviction route tests.
- **E2E:** `docker compose --profile e2e up --abort-on-container-exit --exit-code-from e2e` →
  **HEADLESS CHECK: PASS**, `errors=0` on all 13 pages incl. both institutional pages (independent
  re-run; screenshots regenerated 12:31).
- **Real flow (screenshots eyeballed):**
  - AAPL: three valued cells, one-hue ramp (Vanguard 99.0%, State Street 99.0%, Berkshire 79.0%
    — *own-book* weights, as built).
  - JPM: NORTHLESS 100.0% + EVERPEAK **N/A** (unfilled, labelled) — mixed grid renders honestly.

### Acceptance criteria (against the AS-BUILT own-book measure)

| Criterion | Result | Evidence |
|---|---|---|
| **AC-1a-P2a** weight = issuer ÷ book | ⚠️ **FAIL vs clarified intent** | Built = own-book; operator wants ÷ ticker-total. (Passes vs the *brief's* definition.) |
| AC-2a-P2a denominator labeled 13F long-book, not AUM | ✅ | caption + `_CONVICTION_CAVEATS[0]` |
| AC-3a-P2a one-hue, no verdict/diverging | ✅ | `pickSequentialScheme()`, single hue; screenshots |
| AC-4a-P2a null/≤0 → N/A, never 0 | ✅ | route tests (null / all-null / ≤0); JPM N/A cell; `weight:null` |
| AC-5a-P2a quarter shown + issuer caveats | ✅ | response `period`; `_CONVICTION_CAVEATS ⊇ _ISSUER_CENTRIC_CAVEATS` |
| AC-6a-P2a thin/empty → honest empty state | ✅ | empty-quarter route test; `states.empty` branch |
| AC-7a-P2a no unbounded cross-manager scan | ✅ | `book_values` bounded to top-K + indexed; no DuckDB |
| AC-H2 missing never shown as 0 | ✅ | N/A rows `weight:null`, render "N/A" |
| AC-R1 existing components intact | ✅ | Top-N / composition / tiles present on both pages |
| AC-R2 pytest + e2e green | ✅ | above |

*Note: AC-1a "fails" only because the operator redefined the target in this QA pass; the code
correctly implements what the brief asked. This is a spec change, not an implementation bug.*

---

## Defects found (independent of the measure decision)

1. **[low] Legend units inconsistent with cell labels.** The color legend reads a **0.0–1.0**
   fraction scale while the cells are labelled in **%** ("99.0%", "100.0%"). `percent: true` on the
   Plot color scale did not convert the legend in the vendored Plot build. Cosmetic (the label
   "Share of holder's 13F book" disambiguates), not blocking — but should be reconciled (either a %
   legend, or label the legend "(0–1)"). Repro: `data/e2e-shots/institutional-nolocation.png`,
   legend vs the "100.0%" cell.
2. **[housekeeping] Stray `=0.4` file** was created in the repo root during the engineer stage (an
   unquoted `pip install ruff>=0.4` shell redirect). **Removed during QA** (`rm =0.4`); flagging so
   it isn't reintroduced — always quote `'ruff>=0.4'`.

No security-review needed: the change touches no auth/API-key/rate-limiter/ingest path — it's a
read-only issuer-centric endpoint composing existing repository reads.

---

## If option 2 is chosen — corrected spec for the engineer

**Measure:** `weight = manager's summed reported value in the ticker (this quarter) ÷ Σ reported
value across ALL holders of the ticker (this quarter)`.

- **Simpler than the current build** — the denominator is the ticker's total across holders, which
  `holders_of` already returns; **no `book_values`/`BookValue` needed** (remove them).
- **Honesty (mandatory):** the denominator is **reported 13F value across INGESTED filers only** —
  NOT the ticker's total institutional ownership and NOT shares outstanding. Carry the *same* caveat
  the existing composition strip already uses ("share of reported 13F value held by filers who
  reported holding this issuer — not the company's shares outstanding, and not all institutional
  owners, only ingested 13F filers"), or the heatmap will imply a false "% of the company owned."
- **N/A:** a holder whose ticker value is null → N/A (can't contribute to numerator honestly); if
  every holder's value is null / total is 0 → the whole grid → honest empty state, not zeros.
- Brief (1b §"The measure", AC-1a/AC-2a-P2a) and architecture (2b) must be updated to match; the
  "unit-safe within-quarter ratio" wording still holds (all holders' values are same-quarter), and
  the "not AUM/portfolio" caveat is replaced by the "reported-13F-filers-only, not shares
  outstanding" caveat.

---

## Handoff

**Blocked — hand back to Product Manager / operator for the measure + duplication decision**
(options 1/2/3 above), *then* to the Senior Engineer if a rebuild (option 2) is chosen. Not ready
to deploy. The mechanical foundation (endpoint, chart, tests, e2e, honesty rendering of N/A) is
sound and reusable under either measure.

---

## Round 2 — re-verification after the measure rebuild (2026-07-19)

Operator selected **option 2**: the heatmap now shows **each filer's share of the company's TOTAL
reported 13F value** (`filer value ÷ Σ reported value across all ingested filers`), with the
corrected honesty caveat ("reported 13F value of ingested filers — not shares outstanding, not all
institutional owners, not a % of the company owned"). The rebuild:

- **Simplified the design as predicted:** `book_values`/`BookValue` **removed** from the repository
  interface + SQLite impl (and their 5 tests); the endpoint is now a pure composition of
  `holders_of` (denominator = Σ over ALL holders, numerator per shown filer). Still no DuckDB, no
  cross-manager scan (guardrail 6). Response gained `reported_total_value`.
- **N/A rule updated:** a filer that disclosed no value for a position is **excluded from the
  denominator** and rendered N/A (its true stake is unknown) — never zero-filled. If no filer
  disclosed a value, `reported_total_value` is `null` and every row is N/A.

### Evidence (all green)

- **Tests:** `docker compose --profile test run --rm test` → **375 passed, 6 skipped** (380 − 5
  removed book_values tests). Conviction route tests rewritten for the new measure: share = value ÷
  reported-total; shares sum to 1.0; **N/A holder excluded from the total** (not zero-filled);
  multi-class summed to one row; **denominator is all holders even when `top`-capped** (top=1 →
  weight 0.5, not 1.0); all-N/A → `reported_total_value: null`; empty quarter → `holders: []`.
- **Lint:** ruff clean on all changed files (E501 fixed, no unused imports after the `BookValue`
  removal).
- **E2E:** rebuild + `docker compose --profile e2e up ... --exit-code-from e2e` → **HEADLESS CHECK:
  PASS**, `errors=0` on all 13 pages.
- **Screenshots eyeballed (`data/e2e-shots/`, 00:30):**
  - AAPL: Vanguard **58.7%** / State Street **28.7%** / Berkshire **12.6%** — matches the tab's
    composition strip exactly (the accepted duplication), now with meaningfully varied colour.
  - JPM: NORTHLESS **100.0%** (sole valued filer) + EVERPEAK **N/A** (unfilled). The null-value
    filer is handled honestly across the *whole* tab: holders-table value "—", excluded from the
    "Share of total reported value" strip and the $450.0M reported total, yet still present in the
    shares/accumulation views. Geography empty-state guard intact.

### Acceptance criteria (re-pointed to the shipped measure)

| Criterion (as re-pointed in `1b`/`2b` superseded banners) | Result | Evidence |
|---|---|---|
| Share = filer value ÷ company's total reported 13F value | ✅ | route tests; AAPL 58.7/28.7/12.6 |
| Denominator = reported 13F of ingested filers, labelled "not shares outstanding / not % owned" | ✅ | caption + `_CONVICTION_CAVEATS`; screenshots |
| One-hue, no verdict/diverging | ✅ | `pickSequentialScheme()`, single hue |
| Undisclosed value → N/A, excluded from total, never 0 | ✅ | route tests; JPM EVERPEAK N/A + "—" everywhere |
| Denominator spans ALL holders even when `top`-capped | ✅ | route test (top=1 → 0.5) |
| Empty / all-N/A → honest state, `reported_total_value: null` | ✅ | route tests; `states.empty` branch |
| No DuckDB / no cross-manager scan | ✅ | pure `holders_of` composition; `book_values` removed |
| Existing components intact (Top-N / composition / tiles / Phase-1 views) | ✅ | screenshots both pages |
| pytest + e2e green | ✅ | above |

### Standing product note (operator-accepted, not a blocker)

The shipped measure reproduces the numbers already on the tab (composition strip / Top-N / tiles) —
the heatmap is a colour-grid restatement, not a new number. The operator chose this knowingly
(round-1 Q). Flagged once more here for the record; **not** a QA blocker.

### Defects carried from round 1

- **[low]** Legend now reads **"Share of reported 13F value (0–1)"** (fraction) while cells are
  labelled in **%** — the label was made explicit ("(0–1)") so the two are no longer ambiguous.
  Acceptable as-is; a %-scaled legend remains a possible future polish.
- Stray `=0.4` file — removed in round 1.

## Handoff → DevOps

🟢 **PASS — ready to deploy.** Deployment stays operator-gated (a green QA report unlocks the
*request*, not the deploy). Nothing committed/pushed yet — awaiting the operator's go-ahead to
commit the branch and, separately, to deploy.

---

## Round 3 — ownership treemap (2026-07-19)

Operator reframed the view twice more: "what I have is not a heatmap" → wanted **squares sized by
the % share** (a treemap), and the measure should be **% of the company's *total shares*** — after
a clarifying exchange (what 13F "shares" mean for a manager), settled on: **each filer's `SH`
equity shares ÷ the company's shares outstanding = the legitimate "% of the company held by this
filer."** This is the first Phase-2a version that delivers a number the tab does **not** already
show (resolving the round-1 duplication concern for good).

### What changed
- **New data join:** the endpoint now reads the issuer's **shares outstanding** from companyfacts
  (`_facts_for_cik` cache-aside + new `_shares_outstanding_asof` helper — nearest instant on/before
  the quarter, latest-`filed` wins). Response carries `shares_outstanding` + `shares_outstanding_as_of`.
- **SH-equity-only numerator:** `IssuerHolder` gained `put_call` / `shares_or_principal` (carried
  through `holders_of`); the route sums only `SH` equity shares and **excludes options/PRN**. A
  filer holding only options/PRN is omitted entirely.
- **New visual:** a **d3 treemap** (vendored `d3.hierarchy`/`d3.treemap`) — squares sized by % of
  the company, single accent hue (size is the encoding, not a verdict), with an explicit **"not
  reported by these filers" remainder tile** (`1 − Σ shown %`) so the squares can't imply the
  filers own the whole company. N/A filers (no share count) are listed below, never sized.

### Evidence (all green)
- **Tests:** `docker compose --profile test run --rm test` → **377 passed, 6 skipped**. Conviction
  route tests rewritten: % = shares ÷ shares-outstanding; **option + PRN rows excluded**;
  **options-only filer excluded**; multi-class SH summed to one row; **N/A when no
  shares-outstanding**; N/A when share count blank; **as-of prefers the instant on/before the
  quarter**; empty quarter → `holders: []`, `shares_outstanding: null`.
- **Lint:** ruff clean (F,I) on all changed files; no unused imports; no E501 in changed ranges.
- **E2E:** rebuild + headless → **PASS**, `errors=0` on all 13 pages.
- **Screenshots (`data/e2e-shots/`, 01:13):**
  - **AAPL** — a real treemap: Vanguard **8.9%**, State Street **4.4%**, Berkshire **1.9%** squares
    (Vanguard's ~8–9% of AAPL matches reality), plus a dashed **"Not reported by these filers
    84.8%"** remainder. Note line: "Box = the whole company (14.67B shares outstanding, as of
    2026-03-31). The 3 filers shown hold 15.2% of it…". Caption carries discretion-not-ownership,
    options/PRN-excluded, timing, and remainder≠retail caveats.
  - **JPM** — honestly near-total remainder (**99.9%**) since the two demo filers hold ~0.1% of
    JPM's 2.79B shares (as of 2025-12-31 — per-issuer as-of working). No console errors; geography
    empty-state guard intact.
  - All prior components (composition strip, Top-N, tiles, accumulation series, choropleth) intact.

### Honesty contract — verified
- Denominator labelled "% of shares outstanding," not AUM/portfolio/13F-float. ✅
- 13F = investment **discretion**, not beneficial ownership — stated. ✅
- Options (put/call) + PRN **excluded** from the numerator (tested). ✅
- Timing gap surfaced concretely (`as_of` date shown). ✅
- "Only ingested filers"; remainder explicitly "not reported by these filers," never retail, never
  a zero. ✅ N/A never rendered as 0 or a fake square. ✅

### Note
This finally delivers a distinct, meaningful view (% of the actual company) — not a fourth
restatement of the composition. Multi-class share-outstanding matching (per-class denominators) is
a known simplification, caveated in `_CONVICTION_CAVEATS`; fine for the single-common-class demo
issuers and flagged for real multi-class issuers.

## Handoff → DevOps (Round 3)

🟢 **PASS — ready to deploy.** Deployment stays operator-gated. Nothing committed/pushed yet —
awaiting the operator's go-ahead to commit the branch and, separately, to deploy.

---

## Round 4 — UNDONE (2026-07-19)

**Operator decision:** back out the treemap — *"the shares not bought by the filers is so much more
than what is bought."* This is a valid usability failure, not a data-honesty one: the treemap
correctly shows that a handful of ingested 13F filers each hold a small % of a large-cap, so the
honest "not reported by these filers" remainder swamps the box (AAPL 84.8%, JPM 99.9%) and the
actual filer squares are near-invisible slivers. A chart whose subject is dwarfed by its remainder
doesn't inform — QA concurs it should not ship in this form.

**What was done:**
- All Phase-2a conviction/treemap changes (9 tracked files: `routes.py`, `app.js`, `company.js`,
  `schema.py`, `sqlite_holdings_repository.py`, `seed_fixture.py`, `headless_check.js`,
  `test_institutional_viz_routes.py`, `DATA_MODEL.md`) were **reverted** via `git stash` —
  **recoverable**, not hard-deleted: `git stash list` → the top entry; `git stash apply stash@{0}`
  restores the full treemap implementation.
- Working tree is back to the **Phase-1 state** (accumulation series + filer-HQ choropleth only).
- These delivery docs (1b–4b) are kept as the record of what was explored and why it was dropped.

**Verification (post-revert):**
- `docker compose --profile test run --rm test` → **369 passed, 6 skipped** (the Phase-1 baseline;
  all conviction tests removed with the revert).
- `grep` confirms no `convictionHeatmap` / `institutional-conviction` / `_CONVICTION_CAVEATS`
  references remain in tracked source.
- Rebuild + `docker compose --profile e2e up … --exit-code-from e2e` → **HEADLESS CHECK: PASS**,
  `errors=0`; the AAPL & JPM institutional tabs render the Phase-1 views with no treemap.

**Verdict: ⛔ UNDONE. Nothing to deploy.** The Phase-2a viz effort is shelved. If a future version
is wanted, the honest problem to solve first is *coverage* (the treemap only becomes informative
once enough filers are ingested that they collectively hold a visible, non-trivial share) — or a
different framing that doesn't put a few small holdings against a whole-company remainder.

## Retrospective note

Phase 2a churned through four framings (own-book weight → share of 13F value → % of shares
outstanding as a treemap → undone). The recurring lesson: the *measure* and the *visual* are
product decisions that needed the operator's eye on a rendered result, not just a written brief —
each redefinition only became clear once there was something concrete to look at. The mechanical
pipeline (endpoint, tests, e2e, honesty caveats) held up fine across all four; the cost was in
re-deciding *what* to show. A cheap rendered mock against real seeded data, earlier, would have
surfaced the remainder-dominance problem before the full build.

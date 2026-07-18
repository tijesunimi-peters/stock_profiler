# QA report: institutional-tab viz — Phase 1

**Role:** QA Tester → handoff to DevOps (gated)
**Branch:** `institutional-tab-viz-phase1`
**Verdict (round 4, 2026-07-18):** ✅ **PASS — ready to request deploy.** The round-3 blank-map
defect is fixed and independently re-verified: the no-location state now shows an honest
empty state + tallies (no blank map). AC-H4 satisfied; no regression on the has-location path.
Regression coverage for the no-location render was added (JPM headless page + route test). See
"Round 4" at the bottom. No open defects.

**Verdict (round 3, 2026-07-18):** ❌ BLOCKED (now resolved in round 4). Operator reported "the
geo plot graph is not showing anything"; reproduced — blank/near-invisible US map whenever no
holder has a mappable state location (the default for all real data pre-backfill). AC-H4 failed.

**Verdict (round 2, 2026-07-18):** PASS on the four earlier findings and all *tested* criteria
— but that e2e pass was a false negative for the no-location state (seed always has locations),
which round 3 caught.

**Verdict (round 1):** PASS on all brief acceptance criteria, with 2 recommended pre-deploy
fixes (one touched AC-1d; one the operator-requested color feature) + 2 minor cleanups —
all now resolved.

---

## Evidence by acceptance criterion

Verified via: full pytest (`363 passed, 6 skipped`), e2e headless Chromium (`HEADLESS CHECK:
PASS`, institutional `errors=0`), **independent endpoint drive** via TestClient against a
seeded fixture DB, and screenshot eyeball.

### Shared honesty
| AC | Verdict | Evidence |
|---|---|---|
| **AC-H1** caveats present | ✅ | Series response `caveats#=6`; geography `caveats#=6` incl. the two geo-specific honesty lines ("reported business address — NOT where its capital originates…", "…counted under 'unknown', never dropped"). |
| **AC-H2** N/A never 0 | ✅ | Un-ingested quarter → `by_state:[]`, `outside/unknown filer_count:0` at HTTP 200 (not a fake state row). Value summed only where reported (`val…>0 else 0.0`); missing shares → no point, not a zero. |
| **AC-H3** no forbidden framing | ✅ | Choropleth titled "Where the 13F filers holding this company are based" + caption "reported BUSINESS ADDRESS … NOT where its capital originates" — never "clusters of capital"; no momentum/value/herding anywhere. |
| **AC-H4** legible light/dark, empty states | ✅ (dark N/A) | **The app has no dark theme** (`grep` for `data-theme`/`prefers-color-scheme` → none), so the dark clause is N/A, not a defect. Charts read theme tokens via `cssVar`/`plotTokens`. Empty states verified (below). |

### Accumulation series
| AC | Verdict | Evidence |
|---|---|---|
| **AC-1a** shares not value | ✅ | Series y-axis + points use `shares`; caption states shares-not-value + the unit-change reason. |
| **AC-1b** absence = gap, not zero | ✅ | Route test + drive: a holder present one quarter yields points only for that quarter; no zero point. |
| **AC-1c** derived caveat | ✅ | Caveat "quarter-over-quarter change is a DERIVED inference"; caption repeats it. |
| **AC-1d** single-quarter honest state | ⚠️ **PARTIAL** | See Finding 2 — at exactly 1 quarter a one-bar chart renders and the "Fewer than two quarters" empty-state copy never fires (guard triggers only at 0). Not misleading (single labeled bar, no trend line), but not the explicit single-quarter state the AC asked for. |

### Choropleth
| AC | Verdict | Evidence |
|---|---|---|
| **AC-2a** filer-HQ title, not "capital" | ✅ | Title/caption as above. |
| **AC-2b** foreign+unknown bucketed, never dropped | ✅ | `outside_states` + `unknown` always in response and rendered as chips; drive shows `L2`→outside, `None`→unknown. |
| **AC-2c** filer_count primary, value single-quarter | ✅ | `by_state` carries `filer_count` (distinct managers) + per-quarter `value`; endpoint serves one period so no cross-era value sum. |
| **AC-2d** map boundaries vendored, no external fetch | ✅ | `static/vendor/us-states.geojson` fetched same-origin; `albers-usa` built into Plot; no CDN. |

### Regression
| AC | Verdict | Evidence |
|---|---|---|
| **AC-R1** Top-N retained | ✅ | Screenshot: composition strip + top-3 bars + concentration tiles + holders table all present above the new sections; `/institutional-holders` still returns holders (now also carrying `location`). |
| **AC-R2** pytest + e2e green | ✅ | `363 passed, 6 skipped`; `HEADLESS CHECK: PASS`. |

**Auth/coverage spot-checks:** gated routes 401 without the browser header; 404 for an
unresolved issuer CIK; un-ingested quarter → 200 empty (not error). No auth/rate-limiter/key
surface touched → no separate security-review warranted (endpoints reuse existing gating;
SQL is parameterized; geojson is a same-origin static asset).

---

## Findings (defects — none block the brief ACs)

1. **[Medium] Categorical color cycling on deep-holder issuers.** `holdingsSeriesChart`
   builds up to 9 series (topN=8 + "Other"), but the randomly-picked schemes `dark2`/`set2`
   have only 8 colors → d3's ordinal scale recycles and the 9th series reuses the 1st series'
   hue (chart **and** legend). Triggers on widely-held issuers (AAPL etc.) on ~1/3 of loads.
   Undercuts the operator's own color request. **Fix (one-liner):** default `topN` to 7, or
   drop `dark2`/`set2` from `CATEGORICAL_SCHEMES`, or clamp domain to the scheme's color count.
2. **[Low-Med, AC-1d] Single-quarter still renders a one-bar chart.** The null-guard fires
   only at 0 quarters, so at exactly 1 quarter the chart draws one bar and `company.js`'s
   "Fewer than two 13F quarters are ingested" empty-state copy never appears — the copy
   describes a state the code never reaches. **Fix:** return null (or have the caller show the
   empty state) when `periods.length < 2`.
3. **[Low] Stale comment.** The Phase-1 section header comment in `app.js` still says "ONE
   terracotta accent … never a second hue"; the charts now use randomized multi-hue schemes.
   Misleads the next reader.
4. **[Low] Duplicated US-state set.** `US_STATE_CODES` (Python) and `STATE_CODE_TO_NAME` (JS)
   are two sources of truth; if they diverge, a backend "state"-bucketed filer missing from
   the JS map is silently dropped from both map and chips (would breach "never dropped"). No
   test guards their agreement.

---

## Handoff

**Recommendation:** route back to `/senior-engineer` for the two one-line fixes (Findings 1 &
2 — Finding 2 touches AC-1d and Finding 1 defeats the requested color feature on the flagship
page), then this is **ready to request deploy**. Findings 3 & 4 are optional cleanups.

If the operator prefers to **fix-forward**, the brief's acceptance criteria are otherwise met
and the change is safe to deploy as-is (defects are cosmetic/edge, disambiguated by legend +
tooltip; nothing dishonest, nothing crashing). **Deployment remains operator-gated** — a green
QA report unlocks a deploy *request*, not the deploy itself.

---

## Round 2 — re-verification of the four fixes (2026-07-18)

Engineer applied all four fixes (see `3-implementation.md` "QA round 1"). Round-2 delta is
`app.js` (topN, guard, comments) + `tests/test_state_code_parity.py` — **no route/schema/
storage/geography change**, so round-1 backend AC evidence stands unchanged.

| Finding | Fix | Independent evidence | Result |
|---|---|---|---|
| **1 — color cycling** | `topN` 8→7 (top-7 + "Other" = 8 ≤ smallest scheme's 8 colors) | Ran the exact d3 mechanism Plot uses against the **vendored d3**: `scaleOrdinal(schemeDark2/Set2)` with **9** entries → `s0===s8` collide (old bug real); with **8** entries → **8/8 distinct** (fix works). | ✅ FIXED |
| **2 — AC-1d single-quarter** | guard `periods.length < 2` | Drove a **1-quarter issuer** through `/institutional-holdings-series` → `periods` length **1** → guard trips → `holdingsSeriesChart` returns null → company.js "Fewer than two 13F quarters" empty state fires. | ✅ FIXED — **AC-1d now fully met** |
| **3 — stale comment** | rewrote Phase-1 header + choropleth comments | `grep` confirms no stale "ONE terracotta accent" in the Phase-1 section; comments now describe the categorical/sequential scheme exception. | ✅ FIXED |
| **4 — duplicated state set** | `tests/test_state_code_parity.py` | **Negative test**: fed a mutated JS map (NE etc. dropped) → the guard's assertion flags divergence (not a no-op). Real CI guard. | ✅ FIXED |

**Regression:** `pytest` **364 passed, 6 skipped** (+1 parity test); e2e **HEADLESS CHECK:
PASS**, institutional `errors=0`; round-2 screenshot eyeballed — stacked series (distinct
multi-hue + legend), choropleth (warm ramp on NE/PA/MA + tally chips), Top-N section retained,
no overflow.

**Round-2 verdict: ✅ ready to request deploy.** Deployment remains operator-gated.

---

## Round 3 — operator bug report: "the geo plot graph is not showing anything" ❌ BLOCKED

**Verdict: FAIL — back to Senior Engineer.** Operator-reported and **reproduced**. Round 2's
e2e "PASS" was a **false negative**: the seed fixture gives every manager a location (NE/PA/MA),
which masks the real-world default state.

### The defect (AC-H4 violation)
When **no holder has a mappable US-state location** — i.e. `by_state` is empty but there are
holders in the `unknown`/`outside_states` buckets — `holderGeographyChart` still renders the
full `albers-usa` map with **every** state painted in `--bg-tint` (#EFE9DE) on the card
background (#FDFBF7). That's near-zero contrast, so the map reads as an **empty beige box** —
exactly "not showing anything." The "Location unknown: N filers" chip is correct, but the blank
map dominates and looks broken. AC-H4 requires "degrade to a clear empty-state message … rather
than a broken or misleading partial chart" — this is the broken partial chart.

### Why it matters (not an edge case — the launch default)
`filing_manager_location` was just added; **every existing/real 13F snapshot has it NULL** until
an `institutional_backfill` re-run populates it. So **100% of real companies show this blank map
today**. It also recurs permanently for any company whose holders are all foreign/unknown.

### Reproduction (deterministic)
1. Seed/ingest 13F holders with `filing_manager_location = NULL` (the real default). I
   reproduced by temporarily nulling the three seed locations and re-running the e2e.
2. Open a company's Institutional tab → "Where the 13F filers holding this company are based".
3. Observe: a blank/near-invisible US outline + a "Location unknown: N filers" chip + a
   meaningless 0.0–1.0 color legend. Screenshot captured during repro (all-neutral map).
   `errors=0` — it doesn't throw; it just renders nothing legible.

Code path: `app.js` `holderGeographyChart` — guard at ~L2176 returns null only when **all three**
buckets are empty; with `unknown>0 && by_state==[]` it falls through to the two `Plot.geo`
layers (~L2231), and `withFilers` is `[]`, so only the neutral base layer draws.

### Recommended fix (localized, low-risk)
In `holderGeographyChart`, when `byState.length === 0` (nothing mappable), **do not draw the
choropleth**. Instead render the outside/unknown tally chips **plus an honest coverage note**,
e.g. "No filer business addresses are on record for this quarter yet — location tracking was
added recently and appears only after a re-ingest; N filers counted as location-unknown." Also
suppress the color legend when `maxCount === 0` (it's meaningless). Keep the has-state-data path
unchanged (it renders correctly). This preserves AC-2b (tallies never dropped) and satisfies
AC-H4 (clear empty state, not a broken map).

### Test-coverage gap to close alongside the fix
The e2e/seed only exercises the has-location path. Add coverage for the **no-location** case so
this can't regress — either a second seeded issuer with NULL locations rendered in the headless
check, or (lighter) a route/JS-logic test asserting the empty-state branch triggers when
`by_state==[]`.

**Round-3 verdict: ❌ BLOCKED — returned to `/senior-engineer`. Not deployable until the
no-location state renders an honest empty state instead of a blank map.**

---

## Round 4 — re-verification of the blank-map fix (2026-07-18) ✅ PASS

Engineer added the empty-state branch + regression coverage (see `3-implementation.md` "QA
round 3"). Independently re-verified:

| Check | Evidence | Result |
|---|---|---|
| **No-location render (the round-3 bug)** | Drove `/companies/19617/institutional-holder-geography` → `by_state: []`, `unknown.filer_count: 1`. e2e page `[institutional-nolocation]` (`/company/JPM?tab=institutional`) renders `errors=0`; **screenshot eyeballed**: shows "NO FILER LOCATIONS TO MAP YET" + coverage copy + "Location unknown: 1 filer" chip — **no blank map, no meaningless legend**. | ✅ AC-H4 now met |
| **Has-location no regression** | Drove `/companies/320193/...geography` → `by_state: [MA, NE, PA]`. `[institutional]` screenshot: colored choropleth + "0 filers" tally chips still render (chips are now shared code — present in both states). | ✅ |
| **Tallies never dropped (AC-2b)** | Both states show the outside/unknown chips. | ✅ |
| **Regression coverage closed** | New route test `test_geography_all_unknown_when_no_holder_has_location` (asserts `by_state==[]`, `unknown==2`); new headless page renders the no-location path every run. The round-2 false negative can't recur. | ✅ |
| **Regression suite** | `pytest` **365 passed, 6 skipped**; e2e **HEADLESS CHECK: PASS**, both institutional pages `errors=0`. | ✅ |

**Minor, non-blocking observation:** the empty-state copy ("… location tracking was added
recently and shows only after a re-ingest") is written for the realistic default (no location
ingested yet). In the rare all-foreign case (`by_state==[]` because every filer is foreign,
`unknown==0`), that "after a re-ingest" wording is slightly off — but the "Outside the 50 states
& DC: N filers" chip clarifies, and this scenario (a US issuer held *only* by foreign 13F filers,
none US, none unknown) is vanishingly rare. Not worth blocking; note for a future copy tweak.

**Round-4 verdict: ✅ ready to request deploy.** All brief acceptance criteria met; all four
round-1/2 findings and the round-3 blank-map defect resolved and re-verified. Deployment remains
operator-gated.

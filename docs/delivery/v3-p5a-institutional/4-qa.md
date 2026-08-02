# 4 — QA · V3-P5a **phase 2** (§06 — and the end of the literals)

**Branch:** `v3-p5a-institutional` @ `5c286ff`
**Scope:** §06 *Register limits & supply*, the last section to plumb. §07 is reference copy.

⚠️ **Six QA pairs are on disk and only the filenames distinguish them.**
`*-phase1.md` = fidelity gate · `*-p2-s01.md` = §01 · `*-p2-s0203.md` = §02+§03 ·
`*-p2-s0405.md` = §04+§05 · **this pair = §06.** A green report in any other says nothing here.

**Verdict: ✅ PASS — operator CONFIRMED 2026-08-01** (`4b-manual-verification.md`, signed).
All 12 rows first-pass. The judgement row landed — *"Reads as scoped to the window"* — and row 11
corroborated it independently: JPM's shorter index window read as a shorter window rather than as
a company that never filed.

---

## 🎉 The headline: D-literals is satisfied

**`IP06` was the last literal block, and the NOT-REAL-DATA banner is now GONE** — not hidden,
*absent*. `ipBanner()` names the sections still running on prototype values; there are none, so it
renders nothing. Every figure in the ported Institutional view now comes from a filing.

That was the phase's defining constraint (D-literals: *"phase 2 is not done until no literal
remains"*), and it is met.

---

## Acceptance criteria

| # | Criterion | Result | Evidence |
|---|---|---|---|
| AC-1 | §06 carries no prototype literals, and **the banner is gone** | ✅ | `IP06` deleted; `p2-read-section.js` reports `banner: "(gone)"`. |
| AC-2 | **Absence claims are CHECKED, not asserted** (D-supply) | ✅ | "Tender offers: none found", followed by *"counted over 1,000 indexed filings, 2015-06-01 to 2026-07-31"*. `p2-drive-06.js` asserts the scoping. |
| AC-3 | The three removed claims stayed removed | ✅ | `p2-drive-06.js`: `inference: false`, `lockup: false`, `confidential: false`. |
| AC-4 | Acceptance lag measures **acceptance**, over the right filers (D-acceptance) | ✅ | 45.0-day median over the register's managers — the real statutory deadline. See D-QA-8. |
| AC-5 | Every control does something (D-behaviour) | ✅ | `p2-drive-06.js` **5/5**; `p2-inert.js` `derivesWithNoPanel: []`. |
| AC-6 | **No missing value rendered as `0`** | ✅ | `zeros: []`. A count of `0` amendments is a measured zero and reads as one; "we have not looked" is `na`, never `0`. |
| AC-7 | Chips **iff** N/A (D-chips) | ✅ | `p2-chips.js` → `violations: []`. |
| AC-8 | No clipping, **webfont blocked as well as loaded** | ✅ | `p2-clip-sweep.js`: `svgOverflow=0 domBleed=0` × 2 companies × 2 font states. |
| AC-9 | `pytest` green | ✅ | **703 passed, 9 skipped**. |
| AC-10 | §01–§05 unregressed | ✅ | All five drivers + `p2-noprior.js`, 0 failures. |
| AC-11 | e2e headless render check | ✅ | 44 shots; institutional `errors=0`; only the two pre-existing sectorapp 502s. |

---

## Defects found and fixed this cycle

### D-QA-8 · the acceptance-lag histogram measured the **wrong filers** — FIXED

**Severity: high had it shipped, and it looked entirely plausible.** The first version measured
the **issuer's own** filings, giving AAPL a **2.0-day** median. That is the Form 4 rule, not the
13F one — a 13F-HR is filed by the **manager**, not by the issuer whose page it appears on, so it
was averaging Forms 4, 10-Qs and 8-Ks with different statutory deadlines.

Corrected to read the register's managers via a bounded `filings_for_ciks()`: **45.0 days**, the
actual 13F deadline. The card also now reports *"measured over 3 of the 7 managers holding this
quarter's register"*, because a histogram over 3 of 1,600 filers is a statement about those 3.

**Caught only by looking at the number and asking whether it made sense.** No test would have
failed; both versions returned a well-formed histogram.

### D-QA-9 · three layout defects, one cause: invented class names — FIXED

`.ip-supply` does not exist — the ported class is `.ip-facts` — so the supply lines ran together
into one paragraph, and the mechanics lines did the same. Worse, I wrapped the two revealed cards
in a `.ip-grid2` of my own instead of the accepted `.ip-grid2--nested`, so they stacked
full-width and **stretched 306-unit charts to 660, doubling every label**.

**The accepted build's wrappers are load-bearing.** Phase 1's own §06 log entry says exactly this
about the mirror-image mistake, which cost 689px then.

### D-QA-10 · two shared chart builders deleted with the section — FIXED

`ipTimeline` and `ipHistogram` sat between §06's blocks and the §07 banner, so replacing that
range removed them. Caught immediately by a page error (`ipTimeline is not defined`); restored
from HEAD. **A section replacement's range must be checked against what lives inside it**, not
just its boundaries.

### D-QA-11 · `IP_BO_LIMIT`-class issue recorded last cycle — still open, unchanged

The filing-index store does **not** share the `cached_filing_count >= limit` bug (it is populated
by an explicit backfill, not cache-aside). The pre-existing issue on insider trades and 13D/G
remains recorded and unfixed.

---

## Review questionnaire

**1. What shipped.** §06 now says which share-supply filings a company actually has on file and
when — and where it says "none", it says how far back it looked. It shows how late the register
assembles, from EDGAR's own acceptance timestamps, and how much of it was later amended. And it
reports how many insider trades were pre-arranged under a Rule 10b5-1 plan.

**2. Surfaces touched.** New: `sec/filing_index.py`, `normalize/supply.py`,
`storage/filing_index_repository.py` + SQLite impl, `ingest/filing_index_backfill.py`,
`/companies/{symbol}/filing-index`. Changed: `sec/insider.py` + schema + insider store
(`rule_10b5_1`), `company.js` §06 and the data layer.

**3. AC → evidence.** The table above.

**4. States exercised.** **Populated** — AAPL (1,000 indexed filings) and JPM (25,529).
**"We have not looked"** — the filing-index endpoint before any backfill: `status: "na"` with a
reason, driven before indexing. **Empty** — a company with no insider rows. **Loading** — the
pending sentinel. **Error** — 400 on a malformed period, 404 on an unresolvable issuer.

**5. Edge cases probed.** A **checked zero** ("Tender offers: none found" over a stated window)
versus an **unchecked** one (`na`, "we have not looked"); a filer whose index window is one year
(JPM) versus eleven (AAPL) — which is why "no registration statements" for JPM is *correct and
scoped* rather than wrong; insider rows with **no plan marking at all** (pre-2022 Forms 4),
reported as unknown rather than discretionary; a **negative lag** (impossible) dropped as a bad
row rather than charted as speed.

**6. Honesty contract.** Caveats on the payload; `status`/`reason`/`formula`/`cannot`/`population`
on both new blocks; no missing value as `0`; the terms boundary stated in `cannot` and asserted by
a test; no inference presented as observation.

**7. Deltas from the brief.**
- **The "10b5-1 cooling-off" timeline row is gone.** `aff10b5One` says a trade was made *under* a
  plan; it does not carry the plan's **adoption date**, and a cooling-off window can only be drawn
  from one. The flag feeds a count on the insider card instead. **Drawing the band from anything
  else would be inventing a date.**
- The confidential-treatment line and the Item 405 line are gone (a form family we do not index;
  DEF 14A prose).

**8. Residual risk.**
1. **The index window is the whole honesty story, and it is easy to under-read.** JPM's index
   covers one year, so "no registration statements" is true-over-a-window and could be misread as
   true-over-history. The caption says so; whether it *lands* is a judgement call for the gate.
2. **The lag histogram is thin on the fixture** (2 filings, one bar). Correct, but the shape is
   untested against a real spread.
3. **`rule_10b5_1` is now available to the Insider view**, which does not use it. Not a defect
   here; worth doing.

---

## Manual UI verification

See **`4b-manual-verification.md`** — 12 rows. **Operator outcome:** ✅ **Confirmed 2026-08-01**, walked interactively in three batches.

---

## Handoff

**PASS — pending manual UI verification.** Four defects found and fixed this cycle (D-QA-8…10 plus
the recorded pre-existing one). 703 pytest, e2e clean, every driven check green across §01–§06.

✅ **Operator CONFIRMED 2026-08-01.** §06 is accepted, and with it **the whole of phase 2**:
§01–§06 are all operator-accepted and **D-literals is satisfied**.

**D-supply is delivered, not merely implemented.** The distinction it was built for — a *checked*
absence versus an *asserted* one — was confirmed from two directions: the scoping reads as scoping
on AAPL, and JPM's shorter window reads as a shorter window rather than as a company that never
filed. That is what justified building the ingest instead of empty-stating the card.

Follow-on work, none of it blocking: the **N-forms** (`ROADMAP_DATA_DEPTH` Phase 4, N-PORT first);
the **filing-cache rule** (`count >= limit` is unsatisfiable for a form family with few filings);
the **~3–5s page load** on a whole-market volume; and **`rule_10b5_1` is now available to the
Insider view**, which does not yet use it.

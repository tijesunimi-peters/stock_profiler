# 4 — QA · V3-P5a **phase 2** (§04 and §05 on real filings data)

**Branch:** `v3-p5a-institutional` @ `96850da`
**Scope:** phase 2's data plumbing for **§04 Ownership & stewardship** and **§05 Holder behavior**.

⚠️ **Five QA pairs are now on disk and only the filenames distinguish them.**
`*-phase1.md` = the **fidelity gate** (design only, no data) · `*-p2-s01.md` = **§01**, signed
2026-08-01 · `*-p2-s0203.md` = **§02+§03**, signed 2026-08-01 · **this pair = §04+§05.**
A green report in any of the others says nothing about these two.

**Verdict: PASS — pending manual UI verification.** → **`4b-manual-verification.md`**

---

## Acceptance criteria

| # | Criterion | Result | Evidence |
|---|---|---|---|
| AC-1 | §04 and §05 carry **no prototype literals** | ✅ | `IP04` and `IP05` both deleted; the banner now names **§06 only**. `p2-drive-05.js` sweeps for literals **with every derivation panel open** — see D-QA-5. |
| AC-2 | Unsourceable blocks render honest empty states, not literals | ✅ | Three of them: voting (8-K Item 5.07), vote-weighted ownership (N-PX), fund-level positions (N-PORT). |
| AC-3 | **No missing value rendered as `0`** | ✅ | `zeros: []` on AAPL and JPM. The "8+ quarters" cohort reads N/A with a chip; a reported 0.0% reads as an **exit**. |
| AC-4 | Chips **iff** N/A or approximate (D-chips) | ✅ | `p2-chips.js` → `violations: []`. |
| AC-5 | Every control does something (D-behaviour) | ✅ | `p2-drive-04.js` **5/5**, `p2-drive-05.js` **5/5**, `p2-inert.js` → `derivesWithNoPanel: []`. **One dropped control was caught pre-handoff** — see D-QA-4. |
| AC-6 | D-voting: both voting blocks empty-stated, with reasons that **differ in kind** | ✅ | `p2-drive-04.js` asserts it: "narrative HTML" (scope) vs "not ingested yet" (coverage). |
| AC-7 | D-purpose: the Item 4 prose column → cover-page reporting-person type | ✅ | Table renders "Investment adviser"; no Item 4 text anywhere. |
| AC-8 | Retention is a **different measure** from tenure, and reads as one | ✅ | `test_register.py::TestRetention::test_it_answers_a_different_question_from_tenure`; both captions say so. |
| AC-9 | No SVG/DOM text clips, **webfont blocked as well as loaded** | ✅ | `p2-clip-sweep.js`: `svgOverflow=0 domBleed=0` × 2 companies × 2 font states. |
| AC-10 | `pytest` green | ✅ | **686 passed, 9 skipped** (677 + 9 retention tests). |
| AC-11 | e2e headless render check | ✅ | 44 shots; institutional shots `errors=0`; only the two pre-existing `sectorapp-company` 502s. |
| AC-12 | §01–§03 unregressed | ✅ | `p2-drive-03.js`, `p2-drive-controls.js`, `p2-noprior.js` all 0 failures. |

---

## Defects found and fixed this cycle

### D-QA-4 · §05's expander was dropped — a live control lost (D-behaviour)

**Severity: medium.** I flattened `ipSection05` to two sibling cards, which removed the
`+ Also in this section` expander **and** its `.ip-grid1` wrapper. The wrapper is not cosmetic:
the prototype gives the bar `grid-column: 1 / -1` and lets the grid's own 14px gap space it, so
outside the grid the whole lower half of the section rides 14px high — a problem phase 1 had
already paid for and written up in the log. Restored, and `p2-drive-05.js` now asserts it.

### D-QA-5 · a surviving prototype literal **inside a derivation panel**

**Severity: medium, and the most interesting find of this cycle.**
`IP_DERIVATIONS["05-tenure"]` claimed *"13F-HR filings back to 1Q22"* and *"managers holding
since before 1Q22 are counted from 1Q22"* — a **fixed observation window baked in at design
time**, false for every issuer, and a direct D-literals violation.

**Why it survived four sections of checking:** derivation panels are `hidden` until a badge is
clicked. They never appear in a screenshot, so **no pixel diff, no clip sweep and no
read-section probe could ever see them.** Every literal sweep to date had been reading only what
was on screen.

**Fix:** `IP_DERIVATIONS` values may now be functions, resolved through `ipText` exactly as
`IP_LIGHTBOX`'s already are. The panel reads *"13F-HR filings across 4 ingested quarters, 2Q25 to
1Q26"*. **`p2-drive-05.js` now opens every derivation panel before sweeping for literals**, and
`1Q22` is confirmed absent from the page.

⚠️ **Residual:** §01–§04's panels have only been swept for the §05 literal set. A dedicated pass
over all five panels' copy is worth doing.

### D-QA-6 · three defects real data surfaced in §04 — fixed pre-handoff

Recorded because they are the same class and will recur in §06: **"amendment 0"** (amendments
numbered by array index, but a filer's earliest *ingested* filing is usually already an `/A`);
**`SC 13Gamendment 1`** (the first event label ran under the lane's form label — real registrant
names are wider than "Index manager B"); and **a 0.0% final amendment is an exit, not a holding
of nothing**, which falsified three captions the prototype never had to handle.

### D-QA-7 · `IP_BO_LIMIT` would have forced a live SEC fetch on every page load — fixed

**Severity: high had it shipped.** `_beneficial_ownership_for_cik` serves from cache only when
`cached_filing_count(cik) >= limit`. At `limit=60`, an issuer with 3 structured 13D/G filings can
**never** satisfy it, so every request re-fetches from SEC forever. Set to 40 to share one cache
state with §01's filed-since and §02's type join.

🔶 **The cache rule itself is a pre-existing bug, recorded and NOT fixed.** `count >= limit`
cannot distinguish "we hold 3 because that is all there is" from "we hold 3 because we only
fetched 3". It affects insider trades and 13D/G alike. The honest fix is a "fetched up to N"
marker in the store — a schema change across three form families.

---

## Review questionnaire

**1. What shipped.** §04 now shows who has crossed 5% in this company and when, as a filing
chain per holder — including a holder that has since filed its way back below the threshold. §05
shows how long managers stay: turnover, median holding period, a cohort-retention grid, and the
register split by tenure. Three blocks that no filing we ingest can answer say so, each in its
own words.

**2. Surfaces touched.** `register.py` gained a pure `retention()`; `register-shape` returns it;
`beneficial-ownership` expands the reporting-person type label. UI: `company.js` §04/§05 and the
data layer.

**3. AC → evidence.** The table above; every row names a driven artifact.

**4. States exercised.** **Populated** — AAPL and JPM (JPM has 61 real 13D/G filings).
**Empty** — three unsourceable blocks, plus "no structured 13D/G ingested". **Loading** — the
pending sentinel, forced by aborting requests. **Error** — 400 on a malformed period (fixed last
cycle), 404 on an unresolvable issuer.

**5. Edge cases probed.** A **0.0% final amendment** (a reported zero that means "exited");
an amendment chain whose **earliest ingested filing is already an `/A`**; a **left-censored**
oldest cohort; a quarter that brought **no new manager** (an empty cohort, not a dropped row); a
manager that **leaves and returns** (not a new cohort — a gap can be our coverage, not a sale and
repurchase).

**6. Honesty contract.** Caveats on every payload; `status`/`reason`/`formula`/`cannot`/
`population` on the new `retention` block; no missing value as `0`; the three empty states say
**why** and distinguish scope from coverage; no Item 4 prose (Track 2) anywhere.

**7. Deltas from the brief.**
- **N-PORT applied the D-voting precedent without re-asking.** A structured-XML form we do not
  ingest gets an empty state whose copy says "not ingested yet", not "cannot be reported" — the
  identical question the operator ruled on for N-PX one section earlier. **Flagged for overrule.**
- §05 **did** need backend work, contrary to my own estimate — retention was missing.

**8. Residual risk.**
1. **The N-PORT precedent.** If the operator reads N-PORT differently from N-PX, §05's empty
   state is worded wrongly. It is one paragraph to change.
2. **Derivation-panel copy across §01–§04** has not had a dedicated literal sweep (D-QA-5).
3. **The retention grid is degenerate on the fixture** — every cell reads 100 because the seeded
   managers all persist. Correct, but it means the grid's colour ramp is untested against a real
   spread. Worth a look on the whole-market volume.

---

## Manual UI verification (script)

See **`4b-manual-verification.md`** — 12 rows covering both sections.

**Operator outcome:** ⏳ pending.

---

## Handoff

**PASS — pending manual UI verification.** Four defects found and fixed this cycle (D-QA-4…7),
one pre-existing item recorded and not fixed (the cache rule). 686 pytest, e2e clean, every
driven check green across §01–§05.

**Blocked on:** the operator hand-running **`4b-manual-verification.md`**. Per D-manual-gate this
is mandatory. The rows that need judgement rather than a tick are **the three empty states** —
whether they read as *different kinds* of gap — and **the 0.0% exit row**.

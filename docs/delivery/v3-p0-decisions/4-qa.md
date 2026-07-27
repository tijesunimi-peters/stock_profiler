# 4 — QA report: V3-P0, decisions + doc amendments

**Task:** `v3-p0-decisions` · **Stage 4 (QA Tester)** · 2026-07-26
**Branch:** `v3-p0-decisions` (stacked on `docs/app-v3-roadmap`)
**Verdict:** ❌ **FAIL — 1 minor defect (AC-17)** → looped back cycle 1 → ✅ **re-verified PASS**
(see *Cycle 1* at the end)

---

## Method, and why it isn't the usual one

This change has **no runtime surface**: zero files under `src/`, so there is nothing to rebuild,
no endpoint to drive, no page to render, and no screenshot to eyeball. `pytest` and the e2e headless
check would re-prove an unchanged frontend and are **deliberately not run** — stated here rather
than omitted silently. Verification is inspection, byte-comparison against the design source, and
re-deriving the engineer's judgment calls independently.

Where the engineer asked me to "push hardest", I did the work rather than reading their account of
it — and I disagreed with them once.

## Acceptance criteria

| AC | Verdict | Evidence |
|---|---|---|
| AC-1 all 8 phrasings present | ✅ | 8/8 by exact-string grep against `STATUS_MAPPING.md` |
| AC-2 each row → one token or *not a status* | ✅ | `6 × **N/A**`, `1 × **APPROX**`, `1 × **not a status**` = 8 rows, no row unresolved, no row double-tokened |
| AC-3 prose **verbatim** | ✅ | Byte-compared against source. All 6 quoted phrases match; the long Section 16 sentence is byte-identical to `RECONCILIATION.md` §4.3 after whitespace-squeeze (see note below) |
| AC-4 rows justified against **our** §7 definitions | ✅ | Re-ran the four-rule test on rows 1/3/5 independently — see *Row-by-row re-derivation* |
| AC-5 omitted-not-zero rule stated | ✅ | present, and correctly framed as satisfying only the "never fabricate" half |
| AC-6 basis is 2-D, cites schema | ✅ | §8.1 table; **citations verified to resolve** — `schema.py:619` = `RestatementBasis`, `:649` = `restatement_basis` |
| AC-7 "everything today is as-restated" | ✅ | §8.1 states it, cites `metrics.py` + R9 |
| AC-8 §8.1 **forbids** the toggle | ✅ | Imperative: *"a UI must **not** offer an as-filed / as-restated toggle until a real point-in-time compute path exists behind it"* — a prohibition, not a description |
| AC-9 roadmap D3/D4/D5 closed | ✅ | 3 × `RESOLVED (V3-P0)` in gate table + rewritten bodies |
| AC-10 engine rule | ✅ | "never call `Plot.plot()` or `d3` directly" + "chosen per chart" + the deciding test (§12 collision logic) |
| AC-11 existing chart rules preserved | ✅ | 8/8 present: `chartCard()`, `measuredWidth`, ranked-bars-one-fill, single-hue magnitude, captions dedupe, no CDN |
| AC-12 DOM-node convention | ✅ | Stated **with its reason** (`chartCard()` returns a node), legacy string builders recorded frozen |
| AC-13 label placement, 7 rules | ✅ | §12; `getComputedTextLength()` replaces the prototype's constants; line-height from computed value |
| AC-14 six honesty patterns | ✅ | 6 rules (9–14), each stated as a rule; the ledger's *"cannot"* column marked load-bearing |
| AC-15 §4.2/§5 subject nav | ✅ | 7 subjects, 3 live named with routes, inert treatment specified |
| AC-16 §10 link-vs-label line drawn | ✅ | §10.1 comparison table, 4 axes (markup/cursor/color/hover) |
| **AC-17 internal consistency** | ❌ **FAIL** → ✅ after fix | **Defect 1** below |
| AC-18 traceability | ✅ | 6 `> **Source:**` blocks (5 guide, 1 mapping), consistent form |
| AC-19 scope: docs only | ✅ | `git status` → `docs/` + `HANDOFF.md` only; zero `src/`, `tests/`, compose |

## Defect 1 — AC-17 · §7's N/A definition no longer covers its sanctioned use (minor)

**Severity:** minor (documentation; no user-visible effect) · **Owner:** frontend · **Status:** fixed
in cycle 1

**What I found.** §7's table defines N/A as *"Structurally meaningless for this company/industry."*
But §7.1 rule 2 — twelve lines below — routes **absent-input** cases to N/A, and `STATUS_MAPPING.md`
rows 1 ("not tagged"), 3 ("no filing on record") and 5 ("no disclosure in this period") are all
exactly that: values that are *not reported*, which is not the same as *structurally meaningless*.

**Why it matters.** §7.1 rule 2 says *"Our definitions above win on any conflict."* A reader who
follows that instruction literally, and applies the definition as written, would **reject rows 1, 3
and 5 as mis-mapped** — the very rows the mapping is most careful about. The guide instructs the
reader to defer to a definition that the guide itself has outgrown.

**Mitigating, and why this is minor not major:** the widening is acknowledged in two other places —
§7.1 rule 2 and §9 rule 11 (*"Our `N/A` chip conflates them"*). A careful reader reaches the right
answer. It is the definition cell alone that is stale.

**Repro:** read §7's table row for N/A, then `STATUS_MAPPING.md` row 3, and ask whether "the form
applies but nothing has been filed yet" is "structurally meaningless".

**Fix applied (cycle 1):** one clause on §7's N/A row so the definition admits both cases, with the
reason string carrying the difference — matching what §7.1 and §9.11 already say.

---

## Review questionnaire

**1. What shipped.** Nothing a user can see. This is the decision layer for the v3 programme: an
engineer opening `docs/STYLE_GUIDE.md` can now build the v3 nav, charts, and status treatment
correctly without reading the prototype, and a new `docs/STATUS_MAPPING.md` tells them exactly which
status token replaces each of the prototype's prose phrasings.

**2. Surfaces touched.** No endpoints, pages, views or components. Four documents:
`docs/STATUS_MAPPING.md` (new), `docs/STYLE_GUIDE.md` (364 → 518 lines, 8 sites),
`docs/ROADMAP_APP_V3.md` (3 gates closed), `HANDOFF.md` (2 sites).

**3. AC → evidence.** Table above; every row has a command result, a byte-comparison, or a
re-derivation. No AC was accepted on the engineer's assertion.

**4. States exercised.** Not applicable — no rendered states exist. The analogue here is *document*
states, and I exercised the one that matters: I read the guide end to end as a first-time reader
would, which is how Defect 1 surfaced (it is invisible section-by-section).

**5. Edge cases probed.** The product-specific list (N/A vs N/M vs 0, restatements, multi-class 13F,
429, 502/503) has no purchase on a docs change. The equivalents I did probe: **do the code citations
resolve?** (yes — three checked line-by-line, and a wrong one would be serious in a doc that says
"verify rather than take this on trust"); **is the quoted prose actually verbatim or quietly
tightened?** (verbatim); **does the §7↔§7.1↔mapping chain hold?** (no — Defect 1).

**6. Honesty contract.** The change *is* honesty infrastructure, so I checked it does not weaken
what exists. It doesn't: rules 1–8 are untouched, N/A-never-0 is intact, and the two additions with
teeth — AC-8's toggle prohibition and rule 11's reason-string requirement — both *tighten* the
contract. One thing I specifically checked for and did not find: any wording that would let a
placeholder be dressed as data. §10.1 permits an inert *label*, never an inert *value*.

**7. Deltas from the brief.** Two, both flagged by the engineer rather than hidden, and both correct
calls: (a) label placement landed as **§12** rather than renumbering §11, because
`docs/ROADMAP_UI.md:22` cites `STYLE_GUIDE §11` and a renumber would have silently broken it — I
verified that citation exists; (b) the branch is stacked on `docs/app-v3-roadmap` rather than
`master`, because master has neither file this task must amend. I could not verify AC-17 by
automation at all — it requires reading, which is why it is the one that failed.

**8. Residual risk.** The mapping table is the contract eight phases build against, and its rows are
*judgment*, not fact — I agree with all eight, but a future surface will produce prose that fits
none of them cleanly, and the temptation will be to force it rather than think. The "when you add a
row" rule mitigates this only if people read it. Second: §4.2 now describes a nav that **does not
exist yet** (V3-P2). It is clearly marked "⚠️ Changing in V3-P2", but if P2 slips, the guide
describes a fiction for however long that lasts. Worth re-checking if P2 is deferred.

## UI/UX review

Not applicable — no rendered surface. The nearest equivalent, document usability, is genuinely
improved: §12 is placed where a chart author already is (two sections after §6, which forward-links
to it), and the honesty rules stayed in the required-reading guide while only the lookup table moved
to a companion. The one usability regression is size — the guide is now 518 lines of "read this in
full", which the brief itself flagged as a risk (risk 4). Not a defect; worth watching.

## Manual UI verification

**Exempt — no rendered surface.** Per the `/deliver` and QA policy, a change with nothing rendered
does not get the operator hands-on gate, and **no `4b-manual-verification.md` is emitted** — a
questionnaire with nothing to click would be ceremony. Stated explicitly rather than skipped
silently.

This is *not* the "pure-layout, accepted at QA-tester level" case either. There is no layout. The
correct classification is **backend-only-equivalent: exempt**, routing straight to `done`.

---

## Cycle 1 — defect fixed and re-verified

**Fix:** §7's N/A row now reads *"Structurally meaningless for this company/industry — or absent for
this period/filer; the reason string distinguishes them (§7.1)"*.

**Re-verification:**

| Check | Result |
|---|---|
| §7 N/A definition now admits absent-input cases | ✅ |
| §7.1 rule 2 ("our definitions win") no longer sends a reader to a definition that excludes rows 1/3/5 | ✅ |
| §9 rule 11's "conflates them" still reads correctly against the amended definition | ✅ |
| No other section contradicted by the change | ✅ (re-read §7–§10) |
| Scope still docs-only | ✅ |

**AC-17: ✅ PASS.**

---

## Verdict

✅ **PASS** — 19 of 19 acceptance criteria met after cycle 1. One minor defect found and fixed.

**Ready to hand to the operator**, with two things they must decide (neither is a QA blocker):

1. **⚠️ Branch stacking.** `v3-p0-decisions` sits on `docs/app-v3-roadmap`, not `master`. Merging it
   to master will carry that branch's three commits with it. Merging `docs/app-v3-roadmap` first is
   the clean path. **Operator-gated — QA did not merge anything.**
2. **D4's remaining question is genuinely open and deliberately unanswered here:** whether
   `as-originally-reported` ever becomes a shipped capability. V3-P0 only guaranteed we don't lie
   about it in the meantime. Recommend deciding at V3-P4.

A green QA report unlocks a deploy *request* — but there is nothing to deploy: no code changed.
Next phase per the roadmap is **V3-P1** (chart foundry, now unblocked by D5) and **V3-P2**
(shell unification, unblocked by the D2/§10 amendment), with **V3-P3** runnable in parallel.

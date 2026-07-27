# 3 — Implementation: V3-P0, decisions + doc amendments

**Task:** `v3-p0-decisions` · **Stage 3 (Senior Frontend Engineer)** · 2026-07-26
**Branch:** `v3-p0-decisions` · **Input:** `2-architecture.md`, `1-brief.md`

---

## Deviation from the plan (forced, flagged, not silent)

The plan says *branch off `master`*. **`master` has neither `docs/ROADMAP_APP_V3.md` nor the
rewritten `HANDOFF.md`** — both are files this task must amend, and both live only on the unmerged
`docs/app-v3-roadmap`. Branching off `master` would mean editing files that don't exist there.

**Resolution:** `v3-p0-decisions` is **stacked on `docs/app-v3-roadmap`**, not on `master`. Merging
that branch to master is operator-gated, so it was not done unilaterally. **QA and the operator must
know this:** this branch cannot merge to `master` until `docs/app-v3-roadmap` does, or it will
carry that branch's three commits along with it.

**Second deviation:** the skill mandates invoking `/frontend-design` before any UI change. This task
has **no UI surface** — zero `src/` changes by design (AC-19) — so there was nothing for it to
calibrate. Skipped deliberately rather than run as ceremony.

## What changed

| File | Change |
|---|---|
| **`docs/STATUS_MAPPING.md`** *(new, 68 lines)* | The D3 table. 8 rows, prototype prose verbatim, each resolved by the architect's four-rule test, divergences recorded. Plus "what this doesn't cover" and a "when you add a row" rule. |
| `docs/STYLE_GUIDE.md` *(364 → 518 lines)* | §4.2 subject nav (marked as landing in V3-P2); §5 shell-merge note; §6 per-chart engine + DOM-node convention + frozen legacy builders; **§7.1** translation rules + companion pointer; **§8.1** two-dimensional basis; §9 rules **9–14**; **§10.1** link vs inert label; **new §12** label placement. |
| `docs/ROADMAP_APP_V3.md` | D3/D4/D5 closed in the gate table and in their bodies, each pointing at where it landed. D4's body rewritten around the PM finding. |
| `HANDOFF.md` | §5 chart bullet synced to the per-chart engine rule; §6 gains a pointer to `STATUS_MAPPING.md`. |

## Decisions carried into the docs (not reopened)

- **New d3 builders return a DOM node** — written into §6 *with its reason* (`chartCard()` returns a
  node and every chart must wrap in it, so a string builder cannot satisfy the wrapper rule). The
  four legacy string builders are recorded as **frozen**, explicitly "a closed decision, not an open
  backlog item", so V3-P1 doesn't relitigate it five times.
- **"No disclosure in this period" is N/A, not N/M** — recorded as row 5 of the mapping with a
  ⚠️ divergence marker naming RECONCILIATION §3 as what it overrides, and the reason (N/M requires
  computability). Also surfaced in the roadmap's D3 entry, so it's visible without opening the table.

## Judgment calls made during the work

1. **§12, not a renumber.** The architect allowed inserting label placement as §11 with a renumber.
   **`docs/ROADMAP_UI.md:22` cites `STYLE_GUIDE §11`** for reference implementations — renumbering
   would silently break a live cross-reference. Appended as §12 instead; the §6 forward-reference
   already assumed that number.
2. **The nav amendment is marked as forward-looking.** §4.2 describes the Data/Reference grouping
   that ships *today*, then a clearly-marked "⚠️ Changing in V3-P2" block for the subject nav.
   Describing the subject nav as current would have made the guide contradict `script.js` — an
   honesty problem in our own docs, and an AC-17 failure.
3. **Two stale references fixed** that the §6 rewrite would otherwise have left inconsistent:
   "every **Plot** chart wraps itself in `chartCard()`" → "every chart — Plot or d3"; and §10's
   "vendored-Plot builders" → "vendored-engine ... (Plot or d3)".
4. **§9's new-rules heading** was reworded to "Rules 9–14" to match how the list actually renders
   (items `1.`–`8.`), and to match the doc's existing `§9.2`-style cross-reference convention.

## Verification

**No `pytest`, no e2e, no `docker compose build` — and that is the correct outcome, not a shortcut.**
Zero files under `src/` changed, so there is nothing to rebuild and nothing whose rendering could
have regressed. Running the e2e suite here would consume minutes of container time to re-prove an
unchanged frontend. The applicable gate is the architecture's inspection strategy:

```
AC-19 scope        git status → docs/ + HANDOFF.md only ............ PASS (no src/, tests/, compose)
AC-1/2/3 coverage  all 8 prototype phrasings present in the table ... PASS (8/8)
AC-18 traceability 6 "> **Source:**" blocks (5 guide, 1 mapping) .... PASS
AC-13 label rules  getComputedTextLength / line-height / anchor ..... PASS (6 hits)
AC-17 consistency  section order 1→12, no duplicate numbering ....... PASS
AC-17 stale claims 2 Plot-only references found and corrected ....... PASS
```

## For QA to probe

- **AC-4 is the one that matters.** Don't accept the mapping because it's tidy — re-run the
  four-rule test yourself on rows 1, 3 and 5. Rows 1 ("not tagged") and 3 ("no filing on record")
  are the subtle ones: both resolve to N/A, but each carries a note that the *reason string* must
  preserve a distinction the token flattens. If those notes read as decoration rather than
  requirements, that's a fail.
- **AC-3 verbatim.** Compare row text against `RECONCILIATION.md` §3 and §4.3. Any tightening or
  "improving" of the prose fails the criterion — particularly row 4, the Section 16 sentence.
- **AC-8.** Check §8.1 actually *forbids* the toggle rather than merely describing the situation.
- **AC-17.** Read the guide end to end. Seven edits to one document is exactly how a doc starts
  contradicting itself; I found two such cases and fixed them, but I wrote the edits.
- **The branch-stacking deviation above** — confirm it's acceptable before any merge.

## Handoff → QA Tester

Branch `v3-p0-decisions` (stacked on `docs/app-v3-roadmap`). Docs-only; no runtime surface, so QA is
inspection + the greps above, not an exercise run. Per the `/deliver` rule for changes with nothing
rendered, **the 4b operator gate is expected to be exempt** — confirm that explicitly in `4-qa.md`
and route to `done` rather than emitting a questionnaire with nothing to click.

# 2 — Architecture: V3-P0, decisions + doc amendments

**Task:** `v3-p0-decisions` · **Stage 2 (Principal Architect)** · 2026-07-26
**Input:** `1-brief.md` (19 ACs, docs-only) · **Owner of stage 3:** `senior-frontend-engineer`

---

## Scope re-check (architect's own pass)

- **Track 1:** unaffected. This phase documents decisions; it ingests nothing and serves nothing.
- **Guardrails 1–8:** untouched. No new dependency (d3 *and* Plot are already vendored), no SEC
  compliance surface, no DuckDB, no request path, no schema change.
- **The one drift risk is inward, not outward:** AC-6/AC-7 require the guide to *cite*
  `schema.py`'s `MetricBasis` / `RestatementBasis`. **Citing is not changing.** `src/` must not be
  touched (AC-19). If the engineer finds the guide and the schema disagree, the correct move is to
  document the disagreement and escalate — not to "fix" the schema in a docs phase.
- **`docs/DATA_MODEL.md` needs no change** and must not receive one. Architect's ruling: R9 already
  states the restatement rule normatively ("the whole series shares **one labeled basis:
  `as-restated`**, never mixed"). Guardrail 3 (new canonical concept → mapping + DATA_MODEL together)
  does not fire, because no canonical concept is being added.

---

## Decision (a) — where each artifact lives

The guide is **364 lines and required reading in full**. The repo already runs the companion
pattern beside it: `docs/layout_guides/` is 966 lines across five files. So this is a per-artifact
sizing call, not a blanket one. **Split by whether the reader needs it to *understand the system* or
to *do one specific job*.**

| Artifact | Est. size | Lands | Why |
|---|---|---|---|
| **D3 status mapping** (8 rows + per-row justification + divergence notes) | ~55 lines | **NEW companion `docs/STATUS_MAPPING.md`** | A *lookup table*, consulted while translating one prototype surface — not something a page author holds in their head. §7 keeps the normative rules; the table is reference. |
| **Label placement** (7 rules) | ~30 lines | **In-guide, new §12** | It *is* style, it is short, and chart authors are already reading §6 two sections earlier. A companion here would fragment chart guidance across two files for no size benefit. |
| D2 subject nav (§4.2/§5), chart engine (§6), basis (§8), six honesty patterns (§9), link-vs-label (§10) | ~10–15 lines each | **In-guide** | All rule-shaped and short. These are exactly what "read this in full" is for. |

**Guard against the failure mode of companions** (honesty content drifting out of required reading):
§7 does **not** merely link out. It keeps, in the guide itself, the two rules that must never be
missed — *the prototype's prose is reused verbatim as the reason string*, and *our §7 definitions win
on any conflict* — then points to the companion for the row-by-row table. A reader who never opens
the companion still cannot get the honesty wrong.

## Decision (b) — AC-12: new d3 builders return a **DOM node**

Settled by an existing invariant, not preference. `chartCard()` (`app.js:432`) does
`document.createElement("div")` and returns a **node**; §6 already requires every chart to wrap
itself in it. A string builder cannot wrap in `chartCard()` without serializing a node back to
markup and losing the appenders. Therefore:

- **New d3 builders return a DOM node**, exactly like the 21 existing Plot call sites.
- The four legacy string builders (`sparkline`, `trendChart`, `trajectoryChart`, `positionBar`)
  stay strings and stay **frozen** — the guide already says they are not migrated. §6 must state
  this as a closed decision so V3-P1 doesn't relitigate it five times.

## Architect's ruling on AC-4 — the disambiguation rule that makes the mapping mechanical

The brief correctly flags that copying RECONCILIATION's mapping wholesale would import at least one
debatable row. Rather than leave it to taste, apply this test, in order, to every row:

1. **Is it a status at all?** The derived `ƒ` chip is provenance, not a status → mark *not a status*.
2. **Is the value computable?** **`N/M` requires computability** — §7 defines it as "computable but
   would mislead." If the inputs are absent, `N/M` is *definitionally unavailable*, whatever the
   prose sounds like.
3. **Is it structurally meaningless for this filer** (the measure does not apply)? → **N/A**.
4. **Is it present but imprecise?** → **APPROX**, and the value is still shown.

**This resolves the known case the PM flagged:** RECONCILIATION maps *"no disclosure in this
period"* → N/M, but an undisclosed period is not computable, so N/M cannot apply. It is **N/A**,
with the design's prose preserved verbatim as the reason. Record the divergence in the row per AC-4.

Apply the same test to *"no filing on record"* and *"not tagged"* (both → N/A on rule 3) rather than
inheriting them unexamined.

---

## Files to touch (exhaustive — anything else is out of scope)

| # | File | Change | ACs |
|---|---|---|---|
| 1 | `docs/STYLE_GUIDE.md` | §4.2 + §5 nav; §6 engine rule + AC-12 + **correct the stale "Plot is the engine" claim**; §7 two normative rules + companion pointer; §8 basis; §9 six patterns; §10 link-vs-inert-label; **new §12 label placement** | 6,7,8,10,11,12,13,14,15,16,17 |
| 2 | `docs/STATUS_MAPPING.md` | **NEW.** The D3 table: 8 rows, each with prototype prose (verbatim), resolved token, the rule-1–4 justification, and any divergence from RECONCILIATION | 1,2,3,4,5 |
| 3 | `docs/ROADMAP_APP_V3.md` | §2 gate table + D3/D4/D5 bodies → resolved, pointing at the landed docs; D4's entry rewritten per the PM finding (axis exists; compute path deferred to V3-P4+) | 9 |
| 4 | `HANDOFF.md` | §5 chart bullet: d3-or-Plot + the DOM-node convention, so the two required-reading docs don't diverge | 17 |
| 5 | `docs/delivery/v3-p0-decisions/3-implementation.md` | Engineer's handoff record | — |

**Not touched:** `src/**`, `tests/**`, `docker-compose*.yml`, `docs/DATA_MODEL.md`,
`docs/layout_guides/**`.

## AC-18 traceability convention

Every new or materially changed block ends with a single greppable blockquote line — matching the
guide's existing `> **History:**` idiom:

```markdown
> **Source:** RECONCILIATION.md §4 (v3 prototype) · adopted V3-P0, 2026-07-26
> **Source:** D2 — locked by operator 2026-07-26 · ROADMAP_APP_V3.md §2
```

Greppable as `^> \*\*Source:\*\*`. One per amended block; do not scatter inline citations.

---

## Ordered implementation plan

All one stage, `senior-frontend-engineer`, one branch off `master` (`v3-p0-decisions`).

1. **`docs/STATUS_MAPPING.md` first.** It is the only artifact with real analytical content — apply
   the rule-1–4 test to all 8 rows, resolve the N/M divergence, preserve prose verbatim. Doing it
   first means §7's pointer is written against a table that already exists.
2. **`docs/STYLE_GUIDE.md` §7** — the two normative rules + pointer.
3. **`docs/STYLE_GUIDE.md` §6 + new §12** — engine rule, DOM-node convention, frozen legacy
   builders, stale-claim correction; then label placement as §12. Keep §11 (reference
   implementations) last in the file — insert §12 **after** it only if the numbering reads
   naturally; otherwise insert as §10.5/§11 and renumber. *Renumbering is acceptable; a section
   number out of order is not.*
4. **`docs/STYLE_GUIDE.md` §8, §9, §10, §4.2/§5** — the short rule-shaped amendments.
5. **`docs/ROADMAP_APP_V3.md`** — close D3/D4/D5.
6. **`HANDOFF.md`** — the one-line chart-convention sync.
7. Re-read the guide **end to end** for AC-17. This is a real step, not a formality: seven edits to
   one 364-line document is exactly how a doc contradicts itself.

## Test strategy (no runtime surface — inspection + grep)

QA runs these; the engineer runs them before handoff.

```bash
# AC-19 scope: docs only, zero src/tests/compose changes
git diff --stat master... | tail -5
git diff --name-only master... | grep -Ev '^docs/|^HANDOFF.md$' && echo "SCOPE VIOLATION" || echo "scope ok"

# AC-1/AC-2/AC-3: all 8 phrasings present and each resolved
grep -c '|' docs/STATUS_MAPPING.md
for p in "not tagged" "not shared" "no filing on record" "Section 16 does not apply" \
         "no disclosure in this period" "provisional"; do
  printf '%-34s ' "$p"; grep -qF "$p" docs/STATUS_MAPPING.md && echo present || echo MISSING; done

# AC-18: every amended block is sourced
grep -c '^> \*\*Source:\*\*' docs/STYLE_GUIDE.md docs/STATUS_MAPPING.md

# AC-13: the seven label rules
grep -n 'getComputedTextLength\|line-height\|text-anchor' docs/STYLE_GUIDE.md

# AC-17: the stale Plot-only claim is corrected, not duplicated
grep -n 'Plot' docs/STYLE_GUIDE.md | grep -i 'never call\|engine\|d3'
```

**Honesty checks QA must make by reading, not grepping** (the ones that matter):

- **AC-4** — is every row justified against §7's definitions, and is the N/M→N/A divergence recorded
  with a reason? *This is the criterion to push hardest on; a wrong row propagates through eight
  phases.*
- **AC-8** — does §8 forbid a basis toggle until a real point-in-time compute path exists? A toggle
  returning identical data on both settings fabricates precision (§9.1).
- **AC-3** — is the prototype's prose **verbatim**, or has it been "improved"? Paraphrase fails.

## Handoff → `senior-frontend-engineer`

Docs-only; no backend stage. Branch `v3-p0-decisions` off `master`. Work items 1–7 in order above,
files per the table, ACs mapped per the columns. **Do not touch `src/`** — if an AC seems to require
it, stop and flag rather than widening scope.

Two things already decided for you, so don't reopen them: **new d3 builders return a DOM node**
(forced by `chartCard()`), and **"no disclosure in this period" is N/A, not N/M** (forced by §7's
own definition of N/M). Both belong in the docs you write, with their reasoning.

# 1 — Product brief: V3-P0, decisions + doc amendments

**Task:** `v3-p0-decisions` · **Stage 1 (Product Manager)** · 2026-07-26
**Source of truth:** `docs/ROADMAP_APP_V3.md` §2/§4/§5/§6 ·
`docs/design/sector-app-prototype-v3/RECONCILIATION.md` §3/§4/§5/§6

---

## Problem / user

The v3 prototype is approved and two of its five decision gates (D1 absorb, D2 subject nav) are
locked. **Three gates remain open, and they block the critical path**: V3-P1 (chart foundry) cannot
start without D5, and V3-P2 (shell unification — the keystone every later phase runs through) cannot
start without the D2/§10 style-guide amendment. Nothing after P2 can start at all. Only V3-P3
(ingest metadata) is independent.

There is a second, quieter problem. The prototype is **the largest body of design work this product
has received**, and much of its value is in things that are easy to lose in translation: it has **no
status chips at all** (it expresses OK/APPROX/N/A/N/M distinctions in prose), and roughly a third of
its iterations went into **label-collision rules** that no charting library solves for you. If those
are not written into the style guide *before* eight implementation phases run against it, they will
be re-derived badly, inconsistently, or not at all.

**User:** the engineers (and future agents) building V3-P1…P9. The deliverable's success test is
that someone starting V3-P2 cold can build the nav, the charts, and the status treatment correctly
from `docs/STYLE_GUIDE.md` alone, without re-reading the prototype.

**Evidence this is real:** `RECONCILIATION.md` §3 opens with "**The prototype has no chips**" and
marks the status vocabulary ❌ *"Absent from the prototype. Must be mapped before build."* §6 states
the label rules "are empirical and must survive translation; d3 does not solve any of them."

---

## Scope

**Docs and decisions only. No code, no runtime surface.** The deliverables are:

1. **D3 — the status-vocabulary mapping table.** Every prototype phrasing → one of our four status
   tokens, with the prototype's own prose preserved as the `provenance()` "why {flag}" reason string
   **verbatim**. Lands as a new subsection of `docs/STYLE_GUIDE.md` §7 (its natural home) — the
   authoritative reference every later phase maps against.
2. **D4 — resolve the basis question.** *Finding that reframes it:* the axis **already exists**.
   `RestatementBasis = Literal["as-restated", "as-originally-reported"]` is in
   `normalize/schema.py:619`; `MetricValue.restatement_basis` is at `schema.py:649`; `STYLE_GUIDE`
   §8 already names restatement basis as a provenance field; `DATA_MODEL` R9 already requires one
   labeled basis per series, never mixed. What does **not** exist is any code path that emits
   `as-originally-reported` — `metrics.py:1279` hard-codes `"as-restated"`. So D4 is not "add a
   third axis"; it is "document the axis that exists, and set the rule that protects it."
3. **D5 — the chart-engine rule.** Confirm and write: pages never call a chart library directly;
   every chart is a `ClearyFi.*` builder; the engine beneath may be **d3 or Plot per chart** (d3
   wherever custom label placement/collision logic is needed — Plot cannot express it). Both are
   already vendored, so this adds no dependency.
4. **The `docs/STYLE_GUIDE.md` amendments:** §4.2/§5 (locked D2 subject nav), §6 (chart-engine
   rule), §7 (the D3 mapping), §8 (basis, per D4), §9 (+ the six honesty patterns the prototype
   earned), §10 (placeholder link vs planned-and-inert label), and a **new label-placement section**.

### Out of scope

- **Any implementation.** No chart builder, no nav markup, no status chip, no `app.css`/`sectorapp.css`
  reconciliation. Those are V3-P1/P2. If this task starts editing `src/`, it has failed.
- **Reopening D1 or D2.** Locked by the operator 2026-07-26; they are inputs.
- **Building the as-originally-reported compute path** (see Risks — it is real backend work, and it
  belongs to V3-P4 at the earliest).
- **Track 2.** The prototype's Qualitative/Filings/"Beyond the financials" surfaces stay honest
  placeholders; this brief documents nothing that implies otherwise.
- Rewriting the style guide's existing, still-correct content. This is **additive and corrective**,
  not a rewrite — §11's reference implementations, the token tables, and the type scale stand.

---

## Acceptance criteria

Observable and checkable by reading the amended docs. QA verifies each by inspection + grep, since
there is no runtime surface.

**D3 — status mapping**

- **AC-1** `docs/STYLE_GUIDE.md` §7 contains a mapping table covering **all eight** prototype
  phrasings named in `RECONCILIATION.md` §3: "not tagged", "not shared", "no filing on record",
  "Section 16 does not apply…", "no disclosure in this period", a gap in a series line,
  "provisional", and the derived `ƒ` chip.
- **AC-2** Each row resolves to exactly one of `OK` / `APPROX` / `N/A` / `N/M` — **or** is explicitly
  marked *not a status* (the `ƒ` chip is provenance, not a status; the table must say so rather than
  forcing it into the vocabulary).
- **AC-3** Each row carries the prototype's prose **verbatim** as the reason string, and the table
  says explicitly that it is to be reused unparaphrased.
- **AC-4** **Every row is justified against our four definitions in §7** (N/A = structurally
  meaningless; N/M = computable but would mislead), not merely copied from the design doc. Where the
  design's proposed token conflicts with our definition, **our definition wins** and the row records
  the divergence in one line. *(Known case to resolve, not assume: RECONCILIATION maps "no
  disclosure in this period" → N/M, but a period a filer simply did not report reads as absent, not
  as misleading-if-computed. Resolve it deliberately.)*
- **AC-5** The table states the rule the prototype already satisfies: **an absent measure is omitted
  from a comparison, never rendered as zero** — and that this satisfies §7 but still requires the
  token to be rendered beside it.

**D4 — basis**

- **AC-6** §8 records that the basis label is **two-dimensional and already modelled**:
  `basis` (`TTM` / `AS-OF`) × `restatement_basis` (`as-restated` / `as-originally-reported`), citing
  `schema.py`'s `MetricBasis` / `RestatementBasis` so the reader can verify it.
- **AC-7** §8 records the current truth plainly: **everything we serve today is `as-restated`**
  (`metrics.py` hard-codes it; R9 requires one basis per series, never mixed).
- **AC-8** §8 carries the honesty rule this decision exists to protect: **a UI must not offer an
  as-filed / as-restated toggle until a real point-in-time compute path exists.** A toggle that
  silently returns as-restated data on both settings fabricates precision and violates §9.1 — the
  worst outcome available here. Until then the basis is **stated, not selectable**.
- **AC-9** The brief's finding is reflected in `docs/ROADMAP_APP_V3.md` — D4's entry updated from
  "open spec question" to resolved, with the compute path named as V3-P4-or-later scope.

**D5 — chart engine**

- **AC-10** §6 states: pages never call `Plot.plot()` or `d3` directly; every chart is a `ClearyFi.*`
  builder; the engine beneath is **d3 or Plot, chosen per chart**, with the selection rule written
  down (custom label placement / collision logic → d3).
- **AC-11** §6 preserves the existing rules unchanged: `chartCard()` wrapper, `measuredWidth()` and
  never a hardcoded pixel width, ranked bars take one fill with emphasis, magnitude stays single-hue
  sequential, captions dedupe, no CDN chart library on a data page.
- **AC-12** §6 notes that Plot builders return a DOM node while the older hand-rolled string
  builders do not, and states which convention new d3 builders follow. *(A real ambiguity today —
  new builders need one answer.)*

**Style-guide amendments**

- **AC-13** A **new label-placement section** exists containing all seven rules from
  RECONCILIATION §6, with `getComputedTextLength()` specified in place of the prototype's
  hard-coded character-width constants, and line height taken from computed `line-height` rather
  than font size.
- **AC-14** §9 gains the **six** honesty patterns from RECONCILIATION §4, each stated as a rule not
  an anecdote: newest-fact age shown as prominently as the fact; the staleness ledger **including
  its "what it cannot tell you" column, marked as the load-bearing half**; structural absence ≠
  missing data (**the reason string must survive**); one fact, one source; deadline context on any
  dated filing metric; comparison validity stated before the comparison.
- **AC-15** §4.2 and §5 describe the locked D2 subject nav — the seven subjects, which three are
  live, and the drained/inert treatment (`--mono-muted`, `cursor: default`, **no href and no
  handler**, self-explaining `title`).
- **AC-16** §10's "placeholder links" anti-pattern is amended to draw the line explicitly: a link
  that promises a destination and doesn't deliver is still forbidden; a **planned-and-inert nav
  label is not a link** and is permitted. Without this, a later reader "fixes" the nav back.
- **AC-17** The guide remains **internally consistent**: no amendment contradicts another section,
  and the superseded claim in §6 that Plot is the only chart engine is corrected rather than left
  standing beside the new rule.
- **AC-18** Every amendment is traceable — each new/changed block names its source
  (`RECONCILIATION.md` §n, or the D-number and its lock date), so a future reader can tell a design
  decision from an invention.

**Scope discipline**

- **AC-19** `git diff --stat` for the branch touches **only** `docs/` (plus `docs/delivery/`). Zero
  changes under `src/`, `tests/`, or any compose/Docker file.

---

## Risks / open decisions

1. **The one that needs an operator call, but does not block this brief:** *is
   "as-originally-reported" a product capability we intend to ship?* It is a genuine differentiator
   — most vendors silently restate history, and we already keep every prior value (`accession` +
   `filed`, never deleted). But serving it needs a new point-in-time compute path across
   `metrics.py` and the materialized `metric_values`, which is real backend work. **This brief only
   requires that we don't lie about it** (AC-8). Scheduling it is a separate decision; recommend
   deciding at V3-P4, when the Financial-history view actually wants the toggle.
2. **AC-4 is where honesty could quietly erode.** Copying RECONCILIATION's mapping wholesale would
   import at least one debatable assignment. The mapping is the contract eight later phases build
   against; a wrong row propagates everywhere. This is the criterion QA should push hardest on.
3. **A docs-only phase can look like progress without being any.** Mitigated by making every AC
   inspectable (presence, coverage, traceability) rather than "the guide reads well."
4. **Style-guide bloat.** The guide is already ~365 lines and is required reading. These amendments
   add materially to it. Recommend the architect consider whether the label-placement rules and the
   D3 mapping table are *sections of* the guide or *linked companions to* it — a guide nobody
   finishes is worse than a longer one nobody needs to.
5. **No runtime surface → the 4b operator gate is exempt** under the `/deliver` rule for changes
   with nothing rendered. Recommend QA confirm the exemption explicitly and route straight to
   `done`, rather than emitting a questionnaire with nothing to click.

---

## Handoff → Principal Architect

Design the **document structure**, not a system: which amendments land as new sections vs edits to
existing ones; whether the D3 mapping and label-placement rules live inside `STYLE_GUIDE.md` or as
linked companions (risk 4); the exact §7/§8/§9/§10 insertion points; and the traceability convention
for AC-18. Then route to a single engineer stage — this is a documentation change, so **neither
sub-specialty owns it by default**; recommend the **frontend** engineer, as every amendment governs
UI work and they are the one who must live with it.

Resolve in passing: **AC-12**'s open question (do new d3 builders return a DOM node, matching Plot
builders, or a string, matching the legacy hand-rolled ones?). It is a real inconsistency in the
current guide and the cheapest possible moment to settle it.

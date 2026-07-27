# Active delivery task
task_slug: v3-p0-decisions
request: V3-P0 — Decisions + doc amendments (no code), per `docs/ROADMAP_APP_V3.md` §6. Resolve the three still-open v3 decision gates and land the style-guide amendments the whole v3 programme depends on. (1) **D3 status-vocabulary mapping**: the prototype has NO status chips — it expresses OK/APPROX/N/A/N/M distinctions in prose ("not tagged", "not shared", "no filing on record", "Section 16 does not apply…", "no disclosure in this period", a broken series line, "provisional"). Produce the authoritative mapping table from each prototype phrasing to a production status token, with the prototype's prose carried into `provenance()`'s "why {flag}" line **verbatim, not paraphrased**. (2) **D4 basis axis**: decide whether the prototype's as-filed / as-restated toggle becomes a second basis dimension alongside TTM/AS-OF (we already store it — every fact carries `accession` + `filed` and prior values are never deleted), or is modelled another way. (3) **D5 chart engine**: confirm the rule that pages never call a chart library directly and every chart stays a `ClearyFi.*` builder, with d3 *or* Plot as the engine per chart (d3 where custom label placement/collision logic is needed — Plot cannot express it). Then amend `docs/STYLE_GUIDE.md`: §6 chart-engine rule; §9 + the six honesty patterns the prototype earned (newest-fact age shown as prominently as the fact; staleness ledger incl. the load-bearing "what it cannot tell you" column; structural absence ≠ missing data; one fact one source; deadline context on any dated filing metric; comparison validity stated before the comparison); a NEW label-placement section (edge anchoring via `getComputedTextLength()`, computed line-height, candidate-offset placement, origin tick, legend on converging series, author-at-container-width, ~9px minimum effective text); §4.2/§5 for the locked D2 subject nav; and §10 to draw the line between a placeholder link and a planned-and-inert nav label. Docs-only — no code, no runtime surface. D1 (absorb) and D2 (all 7 subjects, 4 planned-and-inert) are already LOCKED and are inputs, not open questions.
branch: v3-p0-decisions (⚠️ stacked on `docs/app-v3-roadmap`, NOT master — see note below)
next_stage: done
qa_cycles: 1
updated: 2026-07-26

## Progress
- [x] 1 Product Manager       -> 1-brief.md (19 ACs; D4 reframed — the basis axis already exists in schema.py)
- [x] 2 Principal Architect   -> 2-architecture.md (5 files, 7 ordered steps; both open questions settled from existing invariants)
- [x] 3 Backend  — **N/A, docs-only** (architect: no backend stage)
- [x] 3 Frontend -> 3-implementation.md (STATUS_MAPPING.md new + 7 STYLE_GUIDE amendments + roadmap/HANDOFF sync; all inspection checks pass)
- [x] 4 QA Tester             -> 4-qa.md (FAIL on AC-17 → fixed cycle 1 → PASS 19/19)
- [x] 4b Operator manual verification — **EXEMPT, no rendered surface**; no questionnaire emitted (stated in 4-qa.md, not skipped silently)

## Notes / open loops
- **✅ TASK DONE (2026-07-26): QA PASS 19/19, 4b exempt.** All three remaining v3 gates resolved.
  Landed: **NEW `docs/STATUS_MAPPING.md`** (D3 table), `docs/STYLE_GUIDE.md` 364 → 518 lines
  (§4.2 nav, §5 shell-merge note, §6 engine + DOM-node, §7 N/A definition widened, §7.1, §8.1,
  §9 rules 9–14, §10.1, new §12 label placement), `docs/ROADMAP_APP_V3.md` (D3/D4/D5 closed),
  `HANDOFF.md` (chart bullet + mapping pointer).
- **QA found 1 real defect (cycle 1, fixed).** §7 defined N/A as "structurally meaningless", but
  §7.1 and mapping rows 1/3/5 route *absent-input* cases to N/A too — so §7.1's instruction "our
  definitions above win" pointed readers at a definition that would reject the very rows the mapping
  is most careful about. Fixed by widening the §7 N/A row ("or absent for this period/filer; the
  reason string distinguishes them"). Minor, documentation-only, no user-visible effect.
- **QA independently verified rather than trusting the handoff:** all 3 code citations resolve
  (`schema.py:619`/`:649`, `app.js:432`); the quoted prose is byte-identical to RECONCILIATION
  (incl. the long Section 16 sentence); the four-rule test was re-derived on rows 1/3/5 — QA agreed
  with all 8 rows.
- **No pytest / e2e / docker build — correct, not skipped.** Zero `src/` changes; running them would
  re-prove an unchanged frontend.
- **⚠️ OPERATOR ACTION — branch stacking.** `v3-p0-decisions` is stacked on `docs/app-v3-roadmap`,
  NOT master (master has neither `ROADMAP_APP_V3.md` nor the rewritten `HANDOFF.md`). Merging it to
  master carries that branch's 3 commits too. **Merge `docs/app-v3-roadmap` first** = the clean path.
  Nothing was merged, committed, or pushed by the pipeline.
- **Still genuinely open (deliberately not answered by P0):** whether `as-originally-reported`
  becomes a shipped capability. P0 only guaranteed we don't lie about it meanwhile (STYLE_GUIDE
  §8.1 forbids a toggle without a real compute path). Recommend deciding at V3-P4.
- **Unblocked next:** V3-P1 (chart foundry — D5 resolved) and V3-P2 (shell unification — D2/§10
  amendment landed). V3-P3 (ingest metadata) runs in parallel; it never depended on P0.
- **PM DONE (2026-07-26)** → `1-brief.md`. 19 acceptance criteria, all inspectable (no runtime
  surface). Scope: D3 mapping table + D4 resolution + D5 chart-engine rule + the STYLE_GUIDE
  amendments. Explicitly out of scope: any `src/` change, reopening D1/D2, building the
  as-originally-reported compute path.
- **KEY PM FINDING — D4 is reframed, not open.** The basis axis **already exists in code**:
  `RestatementBasis = Literal["as-restated","as-originally-reported"]` (`schema.py:619`),
  `MetricValue.restatement_basis` (`schema.py:649`), already named as a provenance field in
  STYLE_GUIDE §8, and `DATA_MODEL` R9 already requires one labeled basis per series. What does NOT
  exist is any path emitting `as-originally-reported` — `metrics.py:1279` hard-codes `"as-restated"`.
  So D4 = *document the axis + forbid a toggle that lies* (AC-8), NOT *invent a third axis*.
  Building the point-in-time compute path is deferred to V3-P4+.
- **ENGINEER DONE (2026-07-26)** → `3-implementation.md`. Landed: **NEW `docs/STATUS_MAPPING.md`**
  (68 lines, the D3 table), `docs/STYLE_GUIDE.md` **364 → 518 lines** (§4.2 nav, §5 shell-merge
  note, §6 engine + DOM-node, §7.1, §8.1, §9 rules 9–14, §10.1, new §12 label placement),
  `docs/ROADMAP_APP_V3.md` (D3/D4/D5 closed), `HANDOFF.md` (chart bullet + mapping pointer).
  All inspection checks PASS: scope docs-only, 8/8 phrasings, 6 Source blocks, section order 1→12.
- **⚠️ BRANCH DEVIATION — operator must know before any merge.** The plan said branch off `master`,
  but master has **neither `ROADMAP_APP_V3.md` nor the rewritten `HANDOFF.md`** — both live only on
  the unmerged `docs/app-v3-roadmap`. So `v3-p0-decisions` is **stacked on that branch**. Merging it
  to master will carry `docs/app-v3-roadmap`'s 3 commits with it. Merging that branch first is the
  clean path, and it is operator-gated — not done unilaterally.
- **`/frontend-design` skipped deliberately** (the skill mandates it for UI tasks): this task has no
  UI surface, zero `src/` changes, so there was nothing to calibrate. Flagged, not silent.
- **No pytest / no e2e / no docker build — correct, not a shortcut.** Zero `src/` changes means
  nothing to rebuild and nothing whose rendering could regress; the e2e would re-prove an unchanged
  frontend. Gate is the architecture's inspection strategy (run, all pass).
- **QA: push hardest on AC-4** (mapping rows justified, not copied — re-run the four-rule test on
  rows 1/3/5 yourself), **AC-3** (prose verbatim vs RECONCILIATION §3/§4.3 — any "improving" fails),
  **AC-8** (§8.1 must *forbid* the basis toggle, not just describe), **AC-17** (read the guide end to
  end; 2 stale Plot-only claims were found and fixed, but the engineer wrote the edits).
- **ARCHITECT DONE (2026-07-26)** → `2-architecture.md`. Single stage, **frontend**, branch
  `v3-p0-decisions` off master. 5 files: `docs/STYLE_GUIDE.md` (7 amendments + new §12),
  **NEW `docs/STATUS_MAPPING.md`** (the D3 table), `docs/ROADMAP_APP_V3.md` (close D3/D4/D5),
  `HANDOFF.md` (one-line chart-convention sync so the two required-reading docs don't diverge), and
  the stage-3 handoff doc. Explicitly NOT touched: `src/`, `tests/`, compose, `DATA_MODEL.md`
  (architect ruling: R9 already states the restatement rule; guardrail 3 does not fire).
- **Both open questions SETTLED from existing invariants, not preference:**
  (a) **Placement is per-artifact.** D3 mapping (~55 lines, a lookup table) → **companion**
  `docs/STATUS_MAPPING.md`; label placement (~30 lines, rule-shaped, and chart authors are already
  in §6) → **in-guide as new §12**. Guard: §7 keeps the two normative rules in the guide itself
  (prose-verbatim; our-definitions-win) so a reader who never opens the companion still can't get
  the honesty wrong. (b) **AC-12 → new d3 builders return a DOM node** — forced by `chartCard()`
  (`app.js:432`) returning a node and §6 already requiring every chart to wrap in it. The 4 legacy
  string builders stay frozen; §6 must say so as a closed decision so V3-P1 doesn't relitigate it.
- **AC-4 made mechanical (architect ruling).** Apply in order to every row: (1) is it a status at
  all — the `ƒ` chip is provenance, not a status; (2) **N/M requires computability** (§7 defines it
  as "computable but would mislead"), so absent inputs make N/M *definitionally unavailable*;
  (3) structurally meaningless → N/A; (4) present but imprecise → APPROX, value still shown.
  **This settles the flagged case: "no disclosure in this period" is N/A, NOT N/M** — an undisclosed
  period isn't computable. Same test applied to "no filing on record" and "not tagged" (both N/A).
- **Superseded — the two questions the PM raised for the architect:**
  (a) risk 4 — do the D3 mapping table + label-placement rules live *inside* `STYLE_GUIDE.md` or as
  linked companions? The guide is already ~365 lines of required reading. (b) **AC-12** — do new d3
  builders return a **DOM node** (matching Plot builders) or a **string** (matching the legacy
  hand-rolled `sparkline`/`trendChart`)? A real inconsistency in the guide today; cheapest to settle
  now, before V3-P1 builds five of them.
- **Highest-risk AC is AC-4** (per PM risk 2): the D3 mapping must be justified against OUR four
  status definitions, not copied wholesale from RECONCILIATION.md. Known case to resolve rather than
  assume — the design maps "no disclosure in this period" → N/M, but a period a filer simply didn't
  report reads as *absent* (N/A), not *misleading-if-computed*. This table is the contract eight
  later phases build against; a wrong row propagates everywhere. QA should push hardest here.
- **Engineer routing recommendation (PM):** single stage, **frontend** sub-specialty — it is a docs
  change, so neither side owns it by default, but every amendment governs UI work.
- **Docs-only task — flag for PM/architect.** V3-P0 has **no runtime surface**: no endpoint, no UI,
  no pytest target, no e2e shot. The deliverable is amended `docs/STYLE_GUIDE.md` + the D3 mapping
  table. Stage 4 QA is therefore **document verification** (each amendment present, internally
  consistent, matches the prototype, contradicts nothing else in the guide), not an exercise run.
  Per the /deliver skill's own rule, a change with no rendered surface is **exempt from the 4b
  operator gate** — confirm that at the QA stage and go straight to `done`.
- **Inputs, already LOCKED by the operator (2026-07-26) — do NOT reopen:** D1 = **absorb** (the
  prototype's IA is authoritative; one app/one shell/one state model; existing routes survive as
  addresses serving the same app with selection derived from the path). D2 = **build the nav as the
  prototype draws it**, all 7 subjects, with People/Auditors/Funds/Events rendered drained + inert
  (no href, no handler, self-explaining `title`). Both recorded in `docs/ROADMAP_APP_V3.md` §2.
- **Why this phase is the critical path's gate.** V3-P1 (chart foundry) needs D5; V3-P2 (shell
  unification — the keystone the whole programme runs through) needs the D2/§10 amendment. Nothing
  after P2 can start until P2 lands, so P0 slipping stalls everything except V3-P3 (ingest metadata,
  independent).
- **Source of truth for this phase:** `docs/ROADMAP_APP_V3.md` (§2 gates, §4 honesty patterns, §5
  chart program + label placement, §6 phasing) and
  `docs/design/sector-app-prototype-v3/RECONCILIATION.md` (§3 status-vocabulary gap incl. the prose
  table, §4 the six honesty additions, §5 chart translation, §6 label-placement rules). The
  prototype itself is `docs/design/sector-app-prototype-v3/prototype.dc.html`.
- **Scope discipline.** This phase writes *documentation and decisions only*. Any temptation to
  start implementing a chart builder, the nav, or a status chip belongs to V3-P1/P2 — flag and stop.
- Previous task (P6b Sector Geographic mix) is DONE + merged + pushed; its trail is in
  `docs/delivery/sector-geographic-mix/`.

# TASKS — every open item in this repo, in one place

Consolidated 2026-08-17 by sweeping all 238 markdown files under `docs/`, the repo root, and
`clearyfi_frontend/app/`.

**This is an INDEX, not a replacement.** Every row points at the file that owns the detail, and
that file stays the source of truth — a roadmap entry carries the reasoning, the alternatives
considered and the caveats, none of which survive compression into a line. Closing an item means
editing its home file; this page is re-swept, not hand-maintained.

## What counted as a task

- **Unchecked checkboxes** (`- [ ]`) — 51 found across 16 files, of which **28 are real**. The
  other 23 are template artifacts: `4b-manual-verification.md` uses `- [ ] Defect found` /
  `- [ ] Accepted at QA level` as radio buttons where the *other* option was ticked, and
  `HANDOFF.md` ends with a design-review checklist that is a form to fill per review, not a
  backlog.
- **Prose-form open items** — "Decisions the operator owes", `DEPLOYMENT_DO.md` §7, and
  operational findings recorded in prose rather than as boxes.
- **Findings from the 2026-08-14→17 work** that had no home file yet.

Excluded deliberately: `.claude/` (skills and agent definitions — instructions, not work),
`ds-bundle/*.prompt.md` (component specs), and `docs/delivery/*` (completed delivery records; an
unchecked box there is history, not a plan).

---

## 1. Live operations — production

The ones with a real blast radius. All in `docs/DEPLOYMENT_DO.md`.

| # | Item | Why it matters | Source |
|---|---|---|---|
| OPS-1 | **No off-box backups.** Backups are local files on the droplet; DO Spaces was chosen and never wired. | `api_keys` (60 rows) exists ONLY in the live DB and is not regenerable from SEC. Everything else is. | §7 |
| OPS-2 | ✅ **DONE 2026-08-19** — `api_keys` + `api_key_usage` exported off-box (11 KB JSON) during the hydration, and re-imported into the new database. Re-export after any real signup. | Removes the only irreplaceable-data risk without waiting for Spaces. | §5h |
| OPS-3 | **Lower `secfin_backup_retention` from 7 before enabling `secfin-backup.timer`.** | `backup.py` writes the timestamped copy AND `secfin-latest.db` — 2 × 34 GB per run now. Seven of those cannot fit a 48 GB disk. Same shape as the 2026-07-21 disk-fill. | §6b, §5e |
| OPS-4 | ✅ **DONE** — `scripts/check_state.py` asserts state instead of describing it. Run it after every deploy. | Caught OPS-11 and OPS-12 below on its first production run. | `scripts/check_state.py` |
| OPS-11 | ✅ **DONE 2026-08-19** — fixed by the hydration, not by the repair job: the local corpus was already repaired, so replacing the database carried the populated columns across. `check_state.py` confirms `populated:insider_transactions.transaction_code`. | Was: every open-market filter saw an empty table, and the daily batch wrote 0 rows while logging OK. | §5h |
| OPS-12 | **`secfin-insider-peer-ratio.timer` reports OK on zero output.** The runner checks the exit code, which a batch with nothing to write returns happily. | Three consecutive "OK insider peer ratios computed" entries, 0 rows each. A green status file is not evidence of output. | `check_state.py` |
| OPS-13 | **The analytics image now depends on the frontend build.** `analytics` is `FROM api`, and `api` gained a Node stage — so a frontend breakage takes the batch image down too. | Observed 2026-08-17: `FAIL could not build the analytics image` while a bad rsync had the frontend broken. | Dockerfile |
| OPS-5 | **The two weekly chains are installed but DISABLED** pending a hand-measured run. | `peer-analytics` is ~16 h on this droplet, `disclosure-stats` ~40 min. Measured; not yet enabled. | §5b |
| OPS-6 | **Nothing schedules the sector producers** — unchanged. The tables are now POPULATED (hydrated 2026-08-19, 62 groups) but nothing refreshes them, so the data ages from a fixed snapshot. | Was an empty page; is now a page that will silently go stale instead. `check_state.py`'s FRESH checks are the tripwire. | §5c, §5h |
| OPS-7 | **`ingest.lifecycle_backfill` → `analytical.sector_lifecycle` has never run anywhere.** | `/v1/sectors/{group}/lifecycle` returns an empty series on every environment. | CLAUDE.md commands |
| OPS-8 | **rsync deploy still has no deploy key** — the droplet tree is synced, not cloned, so the runbook's `git pull` day-2 flow does not work. | Long-standing. | §4, §7 |
| OPS-9 | **Part B granular re-ingest state** — the DB moved to the Volume; confirm what remains of the ordered on-box backfills. | The Volume move alone does not populate the sector aggregates. | §7, `DEPLOYMENT_BLOCK_STORAGE.md` |
| OPS-10 | **Commits on `master` are unpushed.** | Production is deployed by rsync, so it is current — but this machine holds the only copy. | — |
| OPS-14 | **`section_backfill` → `tone_shift_alerts` (Track 2 Wave A) has no timer, on any environment.** Unlike `sector_governance_stats`, this chain couldn't be made self-contained — `tone_shift_alerts` has nothing to compute without `section_backfill`'s output. | `/v1/sectors/{group}/tone-shift` returns `has_data:false` everywhere until both are run, and needs the SAME one-sequential-script discipline as the two existing weekly chains once scheduled — an independent timer risks reading a half-written `section_similarity`. | `CLAUDE.md` commands |

## 2. Decisions the operator owes

From `docs/ROADMAP_REACT_PLUMBING.md` §"Decisions the operator owes before building". Each blocks
a card; none is blocked on engineering.

| # | Decision | Recommendation on file |
|---|---|---|
| DEC-1 | "What changed this filing" band — (a) partial, (b) re-scope to the structured record, (c) hold | (b) |
| DEC-2 | §08 — same three options, **same work as DEC-1; decide together** | (b) |
| DEC-3 | NAICS (§01.5) — Census crosswalk labelled `approximate`, or `N/A` | `N/A` |
| DEC-4 | EX-21 subsidiaries (§01.13) — parsing overrides the standing no-HTML rule | keep the rule |
| DEC-5 | §05.3 DEF 14A — fill the total only, re-point at pay-versus-performance, or hold | (b) |
| DEC-6 | `ecd` governance flags — free in the same fetch, not in the design. Take or leave | — |
| DEC-7 | Class-structure votes column (§04.5) — ship counts with `N/A` votes, or hold | ship with `N/A` |
| DEC-8 | §06.9 — extension-tag-density metric in the non-GAAP slot, retitled, or empty state | — |
| DEC-9 | `as-originally-reported` — whether it becomes a first-class toggle | `ROADMAP_APP_V3.md:207` |
| DEC-10 | F4 favorability colour — settled for Sector; **Company + Compare still open** | `ROADMAP_APP_V3.md:384` |

## 3. Launch readiness

`docs/product/LAUNCH_READINESS.md`, plus `LAUNCH_NOTES.md` for the post-launch loop.

- [ ] **Re-verify SEC fair-access / redistribution terms in launch week** (last checked 2026-07-07) — `LAUNCH_READINESS.md:153`
- [ ] **Timed cold-start test, as a stranger**: landing → signup → key → first successful curl — `:158`
- [ ] **2–3 technical war-story posts published** as the content runway (drafts exist in `docs/product/drafts/`) — `:229`
- [ ] **Launch-day availability blocked out** for in-thread response — `:244`
- [ ] Post-launch: update `CAMPAIGN_OPTIONS.md` if a channel performed differently — `LAUNCH_NOTES.md:88`
- [ ] Post-launch: fold new objections into `objection-answers.md` — `:90`
- [ ] Post-launch: flag any doc-accuracy gap the launch thread exposed — `:92`

## 4. Product backlog

### 13F analytics — `docs/ROADMAP_13F_ANALYTICS.md`

The largest single backlog: 15 items in three graded waves. Wave A is the near-term set.

| Wave | Items |
|---|---|
| **A** | A1 sector composition · A2 13D/G cross-reference · A3 option/PRN exposure + co-filer attribution · A4 insider × institutional timeline |
| **B** | B1 turnover intensity · B2 concentration trend · B3 position tenure · B4 ownership breadth + holder churn · B5 issuer net derived flow in shares |
| **C** | C1 manager overlap/similarity · C2 most-held/added/exited leaderboards · C2a cluster buying · C3 amendment diff view · C4 sector rotation (market-wide) · C5 under-the-radar discovery |

### Track 2 (filing narrative) — `docs/ROADMAP_TRACK2.md`

New as of 2026-08-22. Pipeline design + UI-requirements inventory for the fields listed under
"Frontend surfaces still on fixtures" below.

| Wave | Items |
|---|---|
| **0** | ✅ DONE 2026-08-23 — wired 5 already-real fields (cyber flags, auditor identity/tenure, deficient filings, headcount, ICFR attestation flag) into `sectorQualitative` — zero new pipeline |
| **A** | ✅ DONE 2026-08-23 (Stages 1-4 only, theme classification deferred) — document fetch, `sec-parser` segmentation, AFINN tone + Fog/Flesch-Kincaid, YoY similarity, `tone_shift_alerts` leaderboard. See `ROADMAP_TRACK2.md` §4 for the two operator-confirmed deviations (library over stdlib, AFINN over Loughran-McDonald). **Not yet scheduled — OPS-14.** |
| **B** | Classification (risk themes, CAMs, going-concern, litigation categories, human-capital/climate) via local embeddings + two new item_codes, plus a smaller bounded-LLM subset (litigation counts, MD&A drivers, outlook) gated on an LLM budget decision. Full mechanism-per-field design in `ROADMAP_TRACK2.md` §8 — **not built yet.** |
| **C** | Sector-level narrative rollups (DuckDB batch) — gated on Wave A running across enough filers |

**Wave A follow-up, designed 2026-08-24, not built** — a multi-year (5-year) Risk Factors/Legal
Proceedings similarity trend, not just the latest point Wave A shipped. New route
(`GET /companies/{symbol}/section-similarity/history?item=&form=`), an `--symbol`/`--cik`
targeting flag for `section_backfill.py` (mirrors `filing_index_backfill.py`'s existing pattern —
today's backfill has no way to deepen one company's history without a whole-market run), and a
`TrendDrawer`-style chart on the Company Hub. Full design in `ROADMAP_TRACK2.md` §7, including a
deliberate labeling asymmetry (10-K points get a fiscal year; 10-Q points get a plain calendar
date, never a guessed fiscal quarter) that a future implementer should not "fix" without first
reading why.

**Wave B mechanism design, designed 2026-08-26** — which mechanism backs each still-fixture
Qualitative-page field. Key calls: classification (risk themes, CAM topics, litigation
categories) uses **real local sentence embeddings via `fastembed`** — the project's first ML
dependency, an operator decision overriding the cheaper hand-rolled-cosine default — not an LLM;
several fields the roadmap previously implied needed an LLM (CAM topic naming, going-concern
"nature" phrasing) don't. Two new Stage-2 segmentation targets are required and in scope for this
wave: `BUSINESS` (Item 1, straightforward) and `CAM` (the auditor's report's Critical Audit
Matters block — a repeating structure needing its own `filing_cam_matters` table, not a
`filing_sections` row). Full mechanism table, the two new item_codes, and build order in
`ROADMAP_TRACK2.md` §8.

- [x] **§8.4 step 1 — embedding infra (primitives only).** ✅ DONE 2026-08-26.
  `fastembed==0.8.0` in the `narrative` extra; `section_embeddings.py`
  (`embed_sentences`/`cosine_similarity`/`best_match`, `BAAI/bge-small-en-v1.5`, 384-dim, both
  `fastembed` and `numpy` lazily imported); `split_sentences` added to `filing_sections.py`
  (reused, not redefined); `section_sentence_embeddings` table + repository (`array('f', ...)`
  BLOB packing, stdlib not numpy). Verified against the real model in the built `narrative`
  Docker image, not mocked. **Not done**: the anchor-phrase corpus (still needs authoring) and
  ingest wiring (nothing writes to the table yet) — both are step 1's remaining half, prerequisite
  to step 4's classifier wiring.
- [x] **§8.4 step 2** — `BUSINESS` item_code. ✅ DONE 2026-08-27. 10-K only (same
  deliberate-absence pattern as `CYBER` on 10-Q); `SECTIONS_SCHEMA_VERSION` bumped to 2 so cached
  filings re-segment and pick up the row retroactively; verified against two real 10-Ks, RF
  extraction confirmed unaffected. `HC_CLIMATE`'s own presence/sub-row mechanism is still unwired
  — this step only adds the segmentation target it needs.
- [x] **§8.4 step 3** — `CAM` segmentation + `filing_cam_matters` table. ✅ DONE 2026-08-27. The
  original design's assumption (each CAM's title as its own sub-span, like a top-level Item) was
  wrong — real extraction algorithm reverse-engineered from 3 real 10-Ks (Apple, Microsoft,
  JPMorgan Chase), verified end-to-end post-fix. Full account in `sec/filing_cam.py`'s docstring
  and `docs/DATA_MODEL.md`. `CAMS` classification itself (embedding-cosine against the new
  taxonomy) still needs step 4.
- [x] **§8.4 step 4** — wire the classifier against both taxonomies. ✅ DONE 2026-08-27, classifier
  module only (not wired to ingest/a results table). Real finding: per-sentence risk-theme
  classification doesn't discriminate on real data (all 9 themes scored 0.71-0.87 with excerpt
  collisions on Apple's real Risk Factors) — fixed by grouping into ~4-sentence passages, which
  reproduced CAM classification's clean separation. Both default thresholds (0.70) are explicitly
  provisional pending a broader-sample re-tune. Also fixed a real `id()`-based anchor-cache bug.
  Full account in `normalize/theme_classifier.py` and `docs/DATA_MODEL.md`.
- [ ] **§8.4 step 5** — the cheap Tier 1 regex fields; no dependency on the above, shippable any
  time.

### Other roadmaps

- [ ] **Milestone 2.5** — stand up the analytical query path as infrastructure separate from serving — `ROADMAP.md:303`
- [ ] **Form 144 parser** — `ROADMAP.md:610-616`. ⚠️ **This section is stale**: it is headed *"[Track 1, not started]"*, but the index-based endpoint (`GET /companies/{symbol}/proposed-sale-notices` — existence and dates, no document parsed) shipped 2026-08-13. What remains open is the four items that need an actual parser, plus the optional A4 enrichment. **Re-head the section before working from it.**
- [ ] **Feed peer-ranked metrics into Milestone 4 screening** — shared query path, not a new one — `ROADMAP_METRICS.md:344`
- [ ] **Public docs / developer portal** (M3) — distinct from Swagger — `ROADMAP_UI.md:222`
- [ ] **Manager §5.5 allocation over time** — deferred on its data gate (needs ≥4 broadly-ingested quarters) — `ROADMAP_UI.md:314`
- [ ] **Known limitation, optional** — `InsiderTransaction` cannot distinguish two field-for-field identical rows in one filing — `ROADMAP.md:190`

### Frontend surfaces still on fixtures

`PROVENANCE.syntheticSurfaces` in `clearyfi_frontend/app/data/api.ts` is the live list — it drives
the banner, so it is self-reporting and does not need duplicating here. As of 2026-08-17:

| Surface | Status |
|---|---|
| company overview | **mixture** — 6 sections real; `capital.insiderOwn/shelf/convert` and `covenant` are permanently unsourceable |
| qualitative · filings | **Reclassified 2026-08-22** — Track 2 is now in scope. Most fields need `ROADMAP_TRACK2.md` Wave A/B; a subset is already answerable with zero new parsing (see that doc's §0) |
| manager · compare | not yet ported |

## 5. Deliberately NOT doing

Recorded so nobody re-opens them by accident. `ROADMAP.md:621-622`:

- **Cross-company screening query language** — planned but not started early; see `ROADMAP.md`.

**No longer on this list: Track 2.** Reversed 2026-08-22 (operator decision) — MD&A, risk
factors, footnotes, free-text narrative, and bounded LLM extraction are now in scope. See the
Track 2 section of `CLAUDE.md` and the new `docs/ROADMAP_TRACK2.md` (pipeline design + UI
requirements inventory, added under item 4 below). `CLAUDE.md` guardrail 1 still applies in
narrowed form: a Track 2 task that skips the cost/typed-output/honest-absence ground rules should
be flagged, not built as asked.

---

## Re-sweeping this file

```bash
# the canonical marker
grep -rn --include="*.md" -E '^\s*[-*] \[ \]' docs *.md clearyfi_frontend/app/README.md \
  | grep -v '/delivery/'          # delivery records are history, not plan
# the prose-form ones
grep -rn --include="*.md" -iE '\bopen items?\b|operator owes|decision needed' docs *.md
```

Two traps worth knowing before trusting the output: `docs/delivery/*/4b-manual-verification.md`
uses unchecked boxes as radio buttons, and a roadmap section's `[not started]` heading can outlive
the work — `ROADMAP.md`'s Form 144 section is the live example.

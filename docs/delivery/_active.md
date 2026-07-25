# Active delivery task
task_slug: sector-geographic-mix
request: P6b — Sector Geographic revenue mix (ASC 280). Make the Sector-view "Geographic revenue mix" placeholder real: a per-sector domestic/international (and possibly regional) revenue split, derived by aggregating companies' ASC 280 geographic segment disclosures. UNLIKE P6a, this is a NEW dimensional-XBRL ingest — companyfacts carries NO dimensional facts, so segment/geographic revenue must come from a new source (SEC Financial Statement Data Sets, whose num.txt has a segment axis — the path the existing Phase-3 spike prototyped). Backend-led: new dimensional ingest → normalize geography buckets (domestic vs international; principled, documented) → per-SIC-sector revenue-weighted rollup into a materialized store → new GET /v1/sectors/{group}/geographic-mix (never DuckDB on the request path) → wire sectorapp.js geoPlaceholderHtml() to the real endpoint. Honesty: sector mix is a DERIVED, revenue-weighted rollup (label it); geography labels are inconsistent across filers (US/International vs country vs region) so the domestic/international normalization is the moat AND the risk; carry coverage caveats (not every filer discloses ASC 280 geography); a sector with no data reads N/A, never 0. Track-1 only. See ROADMAP_SECTOR_APP_V2.md P6 + ROADMAP_DATA_DEPTH.md Phase 3 (dimensional-data SPIKE).
branch: sector-geographic-mix (off master @ b0a12ba)
next_stage: done
qa_cycles: 0
updated: 2026-07-25

## Progress
- [x] 1 Product Manager       -> 1-brief.md
- [x] 2 Principal Architect   -> 2-architecture.md
- [x] 3 Backend  -> 3-implementation.md (DERA ingest + segment_geography classifier + pure-Python rollup + GET /v1/sectors/{group}/geographic-mix + 2 stores; 551 pass / ruff clean / live-verified)
- [x] 3 Frontend -> 3-implementation.md (appended) (geoCardHtml value-neutral stacked bar + N/A-never-0%; e2e geo shots errors=0, both states eyeballed)
- [x] 4 QA Tester             -> 4-qa.md (PASS; all 18 ACs green via real-pipeline + live-endpoint + e2e)
- [x] 4b Operator interactive acceptance -> 4b-manual-verification.md  (CONFIRMED — accepted hands-on 2026-07-25; check 7 dark-theme N/A, app is single-theme)

## Notes / open loops
- **✅ TASK DONE (2026-07-25): operator CONFIRMED — merged + pushed.** Full-stack P6b complete on
  branch `sector-geographic-mix`, committed (b856500), merged no-ff to master (c199102) and pushed
  to origin (419a1f4..c199102) at operator request. QA PASS + the
  operator's interactive `4b` sign-off (checks 1–6, 8–10 ✅; check 7 dark-theme N/A — the Sector app
  is single-theme). **Operator's next options:** (1) commit the branch (engineer stage commits only
  when asked); (2) request a deploy via `/devops-engineer` (separate, operator-gated — needs the DERA
  ingest + rollup run on prod so sectors populate instead of N/A: `dimensional_backfill --quarter …
  && sector_geographic_mix`); or (3) start the next task with a fresh `/deliver <request>`.
- **QA GATE REACHED (2026-07-25): PASS — pending operator manual UI verification.** Full-stack build
  complete on branch `sector-geographic-mix`. All 18 ACs green via automation (551 pytest pass, ruff
  clean), a real-pipeline drive (`dimensional_backfill` + `sector_geographic_mix` CLIs → materialized
  store → live endpoint), and the e2e render check (geo card shots errors=0, both populated + N/A
  states eyeballed; value-neutral stacked bar + hatched "other"; N/A never 0%). The only e2e FAIL is
  the **pre-existing** Company-view 502 on synthetic cik 900001 (no-network sandbox; identical to
  P6a's QA record) — unrelated to this change. **Next: operator runs `4b-manual-verification.md`**
  (interactive/data-driven view → blocking hands-on gate). A confirmed sign-off → next_stage: done
  and unlocks a deploy *request* (DevOps is separate + operator-gated; /deliver never deploys).
  Op follow-up for prod: run `dimensional_backfill --quarter … && sector_geographic_mix` so prod
  sectors populate instead of reading N/A (an ops step, not a build gate).
- **NOTE (git):** during QA an accidental `git stash -u`/`drop` removed the new untracked files; they
  were fully recovered from the dropped stash commit `d7d6cc2e`^3 and re-verified (551 pass). Tree is
  intact; new files staged, edits unstaged — harmless (pipeline doesn't commit).
- **PM DONE (2026-07-24).** Spike-decision gate RESOLVED in `1-brief.md` (spike executed →
  recommends source (a) DERA; operator's "build P6b" IS the go-decision). **Two forks locked by
  operator (2026-07-24):** (1) **Geography = binary Domestic (US) vs International + `other/unclassified`**
  (not a region set); (2) **Ingest scope = bounded, latest annual (~4–8 DERA quarterly ZIPs)** — NOT
  whole-market/full-history (that's a later ops call, not this build's gate). Source = (a) DERA.
- **This is P6b — the SECOND of the two P6 data-depth spikes.** Operator decision (2026-07-24): build
  **both** P6 spikes, **Insider flow first** (P6a — ✅ DONE, merged + pushed @ master b0a12ba), then
  **Geographic revenue mix** as this follow-on `/deliver`. Source of truth: `ROADMAP_SECTOR_APP_V2.md`
  P6 note + `ROADMAP_DATA_DEPTH.md` Phase 3.
- **⚠️ SPIKE-DECISION GATE (read before scoping).** P6b IS the roadmap's **Phase-3 dimensional-data**
  work, and `ROADMAP_DATA_DEPTH.md` is explicit: *"Phase 3 must not be started without the spike's
  decision."* A labeled **"Segments · spike"** prototype already exists (company hub → Statements →
  **segments** tab, `renderSpikeSegments` in `company.js`), fed by a **static** `/static/spike_dimensional.json`
  extract for a few symbols only, **NOT served by the API**. The PM must FIRST confront this gate:
  treat the operator's 2026-07-24 "build P6b" as the go-decision on the spike, OR flag that the spike
  doc/decision should be resolved before a full build. Do not silently start a whole-market ingest
  without acknowledging this gate.
- **Why P6b is bigger/riskier than P6a (opposite of P6a's reuse story).** P6a reused already-ingested
  per-CIK insider data → just an aggregation layer. **P6b has NO ingested source**: companyfacts (our
  whole backbone) carries **only non-dimensional / consolidated facts** — confirmed in the wild and in
  `company.js`'s spike banner ("companyfacts … carries no dimensional facts at all"). So P6b needs a
  **NEW ingest path** for dimensional XBRL. This is a real data-engineering effort, not a thin rollup.
- **Source options (architect to decide, per ROADMAP_DATA_DEPTH.md Phase 3):** (a) **SEC Financial
  Statement Data Sets** quarterly ZIPs — `num.txt` carries a segment/dimension column; bulk, structured,
  fits our existing zip-ingest muscle (the path the spike used) — vs (b) parsing raw XBRL instance
  documents per filing. Recommend (a). Either way, route bulk ingest through a **single-writer** queue
  (guardrail 8); DuckDB/analytical **batch-only**, never the request path (guardrail 6/7); DB behind a
  repository interface, no raw SQL in the API (guardrail 5).
- **Scope guardrails (Track-1; do NOT drift):** ASC 280 **geographic revenue is structured XBRL**, so
  it IS Track-1 — NOT Track-2 free text — but it is the deliberately-larger "dimensional-data spike."
  Keep SEC compliance (User-Agent + process-wide throttle). No new base dependency for the live API.
- **Honesty (bake into ACs):** the sector geographic mix is a **DERIVED, revenue-weighted aggregate
  rollup** → label it derived/aggregated. **Geography normalization is the moat AND the risk:** filers
  disclose geography inconsistently (some "United States / International", some country-level, some
  regions) — the domestic-vs-international (or regional) bucketing must be **principled + documented**,
  not ad-hoc. Carry **coverage caveats** (not every company discloses ASC 280 geography; segment
  reporting varies; ~half of a 10-K's facts are dimensional but disclosure completeness differs). A
  sector with no geographic data reads **N/A, never 0**; an empty result is an honest empty state.
- **Architect to decide (flag for PM/architect):** the ingest source (a vs b above); the geography
  bucketing taxonomy (domestic/international only, or a small region set — must be principled +
  documented); the value basis + weighting (revenue-weighted sector rollup; how to handle companies
  that report only a partial geo split or "rest of world"); period alignment (fiscal vs calendar; which
  annual/quarterly); and the materialized-store shape (a new `sector_geographic_mix` table + repository,
  mirroring `sector_insider_flow_repository` from P6a — a clean, recent precedent to copy).
- **Full-stack, backend FIRST:** land the ingest + normalization + rollup batch + endpoint + JSON
  contract (with pytest), THEN wire `sectorapp.js`'s `geoPlaceholderHtml()` to it on the same branch.
  Interactive/data-driven view → operator hands-on gate at 4b. (P6a's card next to it — `insiderCardHtml`
  — is the styling precedent: solid `.pa-card`, value-neutral, N/A-never-0, derived-rollup label.)
- **CONTEXT RESET (required for a clean P6b PM scope):** this is a NEW /deliver iteration whose
  next_stage is `pm`. If this session still holds P6a (or any prior) context, **/clear (or start a
  fresh session)** before running the PM stage, then run **/deliver resume** — it reads this file +
  the two roadmaps and starts at PM from a clean context. Branch off master when the engineer stage
  begins.
- **Previous task (P6a Sector Insider flow) is DONE + merged + pushed** (master @ b0a12ba, origin
  updated). Its trail is in `docs/delivery/sector-insider-flow/` (1-brief … 4b, operator-confirmed
  2026-07-24). Operational follow-up for P6a deploy: re-warm the insider cache with the new
  transaction_code parser (`insider_backfill` → `python -m secfin.analytical.sector_insider_flow`) so
  prod sectors populate instead of reading N/A.

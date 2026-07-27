# 4 — QA report: V3-P1, chart foundry (rescoped)

**Task:** `v3-p1-chart-foundry` · **Stage 4 (QA Tester)** · 2026-07-26
**Branch:** `v3-p1-chart-foundry` · **Verdict:** ✅ **PASS — pending operator manual verification**
**qa_cycles:** 0 (no fix loop needed — the engineer's own gate caught 4 defects before handoff)

---

## Acceptance criteria

| AC | Verdict | Evidence |
|---|---|---|
| AC-1 returns DOM node, wraps `chartCard()` | ✅ | builds via `chartCard()`, returns `card.root`; consumed by `host.appendChild(...)` |
| AC-2 width from `measuredWidth`, none hardcoded | ✅ | 0 hits for a 3-digit literal width in the builder |
| AC-3 focal distinguishable **without colour** | ✅ | focal is an SVG `path` diamond at `d = R * 2.5` — **shape + size**, ~2.5× the peer radius. Legible in the shots with hue ignored |
| AC-4 placement **density-derived, not index-derived** | ✅ | **0** hits for `Math.random` / `forceSimulation` / `Date.now` in the builder. Proven behaviourally: see *Determinism* below |
| AC-5 §12 label rules | ✅ | `getComputedTextLength` present (3 sites); edge-anchor flip on measure; labels ≥9.5px |
| AC-6 one fill, emphasis not a ramp | ✅ | 0 hits for `pickCategoricalScheme` / `scaleSequential` / `interpolate` — every peer gets `--mono-muted` |
| **AC-7a** nulls excluded, counted, reported | ✅ | `/components` null fixture captions *"3 of 9 filers are excluded — no comparable value reported (N/A or N/M), not a zero."* |
| AC-8 empty + single-peer honest | ✅ | empty → copy only; single → the value, **no IQR band, no median**, plus the reason. Verified visually |
| AC-9 caption names basis | ✅ | `11 filers · SIC 2-digit` on every sector-app strip |
| AC-10 `.pa-dot` index-jitter path removed | ✅ | 1 hit in `sectorapp.js` — **inside the comment documenting the removal**. The `((i % 5) - 2) * 9` jitter is gone |
| AC-11 peer click still re-focuses | ✅ | **refocus shot: focal moved Apple Inc. → Machinery Co 5** — breadcrumb, snapshot, legend, rail, composite P76→P46 all updated |
| AC-12 sector app still doesn't load `app.css` | ✅ | 4 scoped `.pa-dp-host .plot-chart*` rules in `sectorapp.css`; no `app.css` link added |
| AC-13 inventory covers every §5 builder | ✅ | **scripted cross-check: 46 builder names extracted from RECONCILIATION §5, 46 covered.** The one apparent miss (`area`) is a `d3-shape` module reference in the `stackedAreaChart` row, not a builder |
| AC-14 *exists* rows name the production builder | ✅ | 12 mapped; the gap-breaking row explicitly names `sectorDupontTrend` / `sectorLifecycleTrend` / `valueLineChart` and records that they're already honest |
| AC-15 deferrals recorded with reasons | ✅ | histogram + event strip, both blocked on V3-P3 acceptance timestamps, with target phases |
| AC-16 `/components` ≥4 states | ✅ | **5** shipped: populated+focal, populated no-focal, null-bearing, empty, single-peer |
| AC-17 e2e zero console errors + eyeballed | ✅ | `[components]` 0, `[sectorapp-company-default]` 0; shots eyeballed desktop + the strip at card width |
| AC-18 no regression in Company view | ✅ | **4 previously-FAILED shots now render**; `[sectorapp-company-trend]` **errors=0** — the strip renders *and* the downstream sparkline interaction still works |
| **AC-7b** reader can tell "40 of 58" | ⚪ **OUT OF SCOPE** | Correctly so — needs `excluded_count` on `SectorCompanyValueList` (backend). **Recorded** in `BUILDER_INVENTORY.md` with its target phase. Not a failure |

## Determinism — the check that justifies the architecture decision

AC-4 is the reason force was rejected, so I verified it behaviourally rather than by reading code.
Comparing `sectorapp-company-default.png` against `sectorapp-company-refocus.png` — the same peer
group, a different focal:

**Every peer dot is at the same x and the same lane in both shots. Only the diamond moved.**

That is the property a force simulation would have broken: it seeds and settles differently per run,
so re-focusing would have reshuffled peers and implied the data moved when it hadn't. The
deterministic dodge holds.

## Review questionnaire

**1. What shipped.** The Company view's peer distributions are now a real chart instead of
absolutely-positioned spans: an IQR band, a median rule, one dot per filer placed by density, and a
diamond for the filer you're looking at. Clicking a dot still re-focuses. Visually similar, but the
vertical position of a dot now means something — before, it came from the peer's position in a list.

**2. Surfaces touched.** No endpoints. `/components` (new section 06), the sector app's Company view
(`/sectors?view=company`), the shared `app.js`/`app.css` component layer, `sectorapp.js`/`.css`, and
the e2e harness's selectors. Plus one new doc, `docs/BUILDER_INVENTORY.md`.

**3. AC → evidence.** Table above. Nothing accepted on the handoff's assertion: I re-extracted the
builder list from RECONCILIATION myself for AC-13, and grepped the builder for randomness rather
than trusting the "deterministic" claim.

**4. States exercised.** Populated with and without focal, null-bearing, empty, and single-peer — all
five driven on `/components` and eyeballed. Re-focus driven by the harness clicking a real dot. The
degraded path was exercised too, unintentionally but usefully: in the no-network sandbox the history
fetches 502, and the view renders **"no trend yet"** rather than a flat or fabricated sparkline.

**5. Edge cases probed.** **N/A vs 0** — the null fixture proves excluded peers are counted and
named, never plotted at 0. **Degenerate range** (all values equal / one filer) — one centred label,
no invented median or IQR; this was a live defect (`41.2%41.2%`) the engineer caught and fixed.
**Upstream 502** — 14 errors on the refocus shot, classified: **all 14 are the same 502**, no
`pageerror`, no new class. **Restatements / multi-class 13F / 429** — not applicable; this change
reads no new data and adds no request path.

**6. Honesty contract.** One fill for peers, so nothing is coloured good or bad. Focal carried by
shape and size, not hue. Excluded filers counted in words, not silently dropped. Single-peer refuses
to draw a median or a middle-half from one observation and says why. The `!window.d3` guard says
*"the charting library didn't load"* rather than reusing the "no peers" copy — I specifically checked
that, because reusing it would have claimed absent data when data may well exist.

**7. Deltas from the brief.** The engineer removed sectorapp's `cos.length < 2` early return, which
isn't in any AC. I agree with it: that branch rendered "No peer distribution — sparse coverage, not
zero" for a single filer and **suppressed the one real value we had**. The replacement shows the
value and explains the absent statistics — strictly more honest, and consistent with §9.1. AC-7b is
scoped out, correctly, and recorded.

**8. Residual risk.** The dodge's lane assignment is O(n·lanes); with a very large peer group the
strip could grow tall or the loop slow. Nothing near that in the fixtures (11 filers), but a
whole-market peer group in a later phase is worth watching. Second: `.plot-chart` is now declared in
**four** stylesheets, and this phase adds a fifth scoped block — deliberate and temporary, but V3-P2
must actually resolve it or the duplication compounds.

## UI/UX review

Reads as part of the product rather than a new component: same card chrome, mono numerals, warm
tint band, terracotta reserved for the one mark that identifies *you*. The upward stack is the one
deliberate design choice — density becomes height, so the strip reads as a distribution silhouette
instead of dots dodging each other.

Copy is direct and in the product's voice: *"3 of 9 filers are excluded — no comparable value
reported (N/A or N/M), not a zero"* names what happened and refuses the zero reading in the same
breath. The single-peer line explains the absence rather than apologising for it.

Layout holds at card width (~420px) across nine stacked metric cards with no clipping or overflow.
**Label clearance was a real defect at handoff** — lane-0 dots sat ~2px off the label tops and the
median label collided with dots; fixed before QA and verified here. The app is single-theme, so
there is no dark-mode check to make.

## Manual UI verification — REQUIRED (interactive change)

This is an **interactive/logic change**: a new control surface (clickable peer marks), a replaced
DOM contract, and a re-focus flow. Per policy that mandates the operator hands-on gate — the
QA-tester level does **not** stand in. Questionnaire emitted at
**`docs/delivery/v3-p1-chart-foundry/4b-manual-verification.md`**.

Automated evidence cannot settle: whether clicking a small SVG mark *feels* reliable at real pointer
sizes, whether the focal is findable at a glance, keyboard reachability, and whether re-focusing
reads as stable rather than jumpy.

---

## Verdict

✅ **PASS — pending operator manual UI verification.** 18 of 18 in-scope ACs met; AC-7b correctly
out of scope and recorded. No defects found at QA; the engineer's own render gate caught four
before handoff, which is the gate working as intended.

`HEADLESS CHECK: FAIL` overall is the **documented pre-existing baseline** — Company-view 502s on
synthetic CIK 900001 in the no-network sandbox, confirmed against `sector-insider-flow/4-qa.md:108`
and `sector-geographic-mix/4-qa.md:8,27`. **This change improved the suite**: four shots that
previously FAILED outright now render.

**Not "ready to deploy" until the operator signs off 4b.** Nothing to deploy regardless — no
endpoint or data change.

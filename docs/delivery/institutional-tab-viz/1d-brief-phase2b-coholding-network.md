# Brief: institutional-tab viz — Phase 2b (co-holding network graph)

**Role:** Product Manager → handoff to Principal Architect
**Task slug:** `institutional-tab-viz` (Phase 2b)
**Date:** 2026-07-19
**Status:** scoped; operator chose "build the network graph now" (2026-07-19). This is **viz 4** of
the original four-viz brief (`1-brief.md`), the last one outstanding; Phase 1 (accumulation +
choropleth) and Phase 2a (institutional-holder treemap) shipped/passed QA. Supersedes `1-brief.md`
AC-4a–c with the concrete criteria below.

---

## Problem / user

**User:** an analyst on a company's **Institutional** tab who wants a **structural** view of the
holder base — not just who holds the most (the treemap answers that), but **which of this company's
institutional holders run similar portfolios** (overlap in their *other* reported holdings).

**Pain:** the tab shows holders as independent sizes. It can't show that, say, two of the holders
hold 60% of the same *other* names — a structural signal about the kind of investors in the stock.

**How we'll know it's solved:** the tab renders a **force-directed network** — nodes = the
company's 13F holders, edges = overlap in their *other* reported holdings — that is legible on real
data, degrades to an honest note when overlap is thin, and carries every 13F caveat **without** any
"herding / momentum / smart-money / coordinated-trading" framing.

---

## The measure

- **Nodes** = the top-K holders of this company this quarter (by reported stake). Node size = the
  holder's stake in **this** company (shares); a single hue (no verdict).
- **Edge** between two holders = **overlap in their OTHER reported holdings**, by **CUSIP**:
  `jaccard(A, B) = |A ∩ B| / |A ∪ B|` over each manager's set of held CUSIPs **excluding this
  company's own CUSIP(s)**. An edge is drawn only when the Jaccard clears a threshold (avoid a
  hairball); edge width = overlap strength.
- **Overlap is on raw CUSIPs, not resolved CIKs** — so it covers *all* reported holdings with no
  unresolved-CUSIP loss (the conservative resolver isn't in this path).
- **Exclude this issuer from the overlap set** — otherwise every pair trivially "shares" the fact of
  holding this company; the edge must be about the *other* names, or it says nothing.

---

## Scope

One new view on the **company** Institutional tab (`api/static/`), **augmenting** everything already
there (Top-N, composition strip, concentration tiles, Phase-1 accumulation + choropleth, Phase-2a
treemap) — nothing removed.

- Force-directed graph using the **vendored `d3-force`** (`forceSimulation`/`forceLink`/
  `forceManyBody`/`forceCenter`/`forceCollide` — confirmed present in `static/vendor/d3.min.js`);
  self-contained (CSP), no CDN/fetch.
- **Richer demo fixture:** seed several managers holding one demo issuer with **varied, overlapping
  other-books** so the demo network is ~5–8 differentiated nodes/edges, not the current 3-node
  triangle. (Operator accepted the demo-thinness risk; this mitigates it.)
- **Honest thin/empty state:** <2 holders, or no pair clearing the threshold → a clear note ("too
  few holders / no shared other-holdings to graph this quarter"), never a misleading dense or
  single-node graph. QA verifies **real-data richness** on a representative company.

### Out of scope (do not build)

- ❌ **Any "herding / momentum / value / growth / smart-money / crowding / coordinated or timed
  trading" framing.** Edges are *overlap in reported holdings as of a quarter-end snapshot* — a
  structural fact, never an intent or a verdict (§9.2 descriptive-not-prescriptive). This is the
  whole point of the view's honesty.
- ❌ Investment-**style** classification of any node/edge (EDGAR carries no style data).
- ❌ Price / performance / "how their picks did."
- ❌ A **live unbounded cross-manager scan** (guardrail 6) — bounded or precomputed only.
- ❌ Cross-company scope; removing/weakening any existing component; Track-2.

---

## Acceptance criteria (what QA will check)

- **AC-1** Nodes are the top-K holders of this company (by reported stake); node size encodes the
  stake in **this** company (shares), labelled; a single hue (no good/bad color).
- **AC-2 (the load-bearing honesty AC)** Edges are labelled/explained as **overlap in the two
  filers' OTHER reported holdings** (shared-CUSIP Jaccard) **as of the quarter-end snapshot** —
  explicitly **derived, not coordinated or timed trading**, with the shared-holding count / Jaccard
  in the tooltip. **No "herding / momentum / value / smart-money / crowding" language anywhere** in
  labels, captions, or tooltips.
- **AC-3** Overlap is computed on **CUSIPs** (all reported holdings, no unresolved-CUSIP loss) and
  **excludes this company's own CUSIP(s)** from each holder's set (edges are about the *other*
  names, never the trivial shared fact of holding this issuer).
- **AC-4** Thin/empty degrades honestly: <2 holders, or no pair over the threshold → a clear
  note/empty state, **never** a misleading dense graph or a lone node presented as a "network."
- **AC-5** The overlap is computed **bounded or precomputed** — QA confirms **no live unbounded
  cross-manager scan** on the request path (guardrail 6). (Architect decides bounded-live vs batch;
  see risks.)
- **AC-6** Standing 13F caveats carried (`_ISSUER_CENTRIC_CAVEATS`): derived-not-reported, long
  §13(f) only, ~45-day lag (stale not current), **ingested-filers-only + empty ≠ confirmed zero**;
  plus a **coverage** caveat (the network is only as rich as the holders whose full books are
  ingested).
- **AC-7** Self-contained (vendored `d3-force`, no external fetch — CSP); legible in **both light
  and dark themes**; a small legend for node size + edge = overlap. The force layout must **settle
  to a stable position** (seeded / run-to-completion) so the e2e screenshot is deterministic.
- **AC-8 (regression)** All existing Institutional-tab components (incl. the Phase-2a treemap)
  remain intact; `pytest` green; Docker e2e headless render green.

---

## Risks / open decisions (architect + operator)

1. **Bounded-live vs DuckDB-batch (architect).** `1-brief.md` AC-4b assumed the analytical/batch
   layer. But for **one** issuer this is: `holders_of` (bounded K) + each holder's CUSIP set for the
   quarter (K point reads) + pairwise Jaccard (K² set intersections). With a **K cap** (~20–30) this
   is a *bounded* read — the **same precedent as the Phase-2a treemap's bounded per-holder
   aggregate** (which we kept live, off the guardrail-6 cross-manager-inversion path). Architect
   decides bounded-live (a new bounded repo method returning K holders' CUSIP sets) vs a precomputed
   store, and justifies against guardrail 6. Hard requirement (AC-5): no *unbounded* cross-manager
   scan.
2. **Overlap metric + threshold (design; operator may weigh).** **Jaccard** is recommended over raw
   shared-count (it normalizes for book size — a 1000-name manager sharing 40 names with a 60-name
   manager isn't "similar"). The edge-draw **threshold** trades a hairball vs an empty graph — pick
   a sensible default (e.g. draw the top-M edges or Jaccard ≥ ~0.1), tunable.
3. **K cap (nodes shown).** ~20–30 top holders by stake; the rest simply aren't nodes (honest — the
   graph is of the shown holders, stated).
4. **Coverage / fixture richness (the standing risk).** The graph is only as rich as the holders
   whose **full books** are ingested for the quarter. Mitigations in scope: a richer demo fixture +
   an honest thin state. QA must **verify real-data richness** on a representative company (from the
   579-manager 2026-06-30 quarter) — a network that's always thin isn't worth shipping.
5. **Public-facing copy** (labels/tooltips/legend) is the whole honesty point (AC-2) — load
   `.claude/skills/marketing-guardrails` before finalizing.

---

## Handoff → Principal Architect

Design against AC-1…AC-8. Key asks:

- Decide **bounded-live vs batch** for the pairwise-overlap compute (risk 1) and justify vs
  guardrail 6; keep any new read behind a repository interface (guardrail 5), no raw SQL in the API.
  Reuse the Phase-2a treemap precedent (bounded per-holder reads) if going live.
- Specify the **overlap metric** (Jaccard over CUSIP sets, this issuer excluded), the **edge
  threshold**, and the **K cap** — concretely enough for QA to test.
- Specify the **endpoint/response shape** (nodes + edges + the honesty caveats), carrying
  `_ISSUER_CENTRIC_CAVEATS` + the coverage caveat.
- Confirm the **`d3-force` render** is self-contained and **settles deterministically** (AC-7) so
  e2e screenshots are stable; name the **richer demo fixture** additions.
- This converges with roadmap **`ROADMAP_13F_ANALYTICS.md` C1** (manager overlap/similarity) — note
  the relationship so the two don't fork; the network is the issuer-centric rendering of C1.
- Keep every existing Institutional-tab component intact (AC-8).

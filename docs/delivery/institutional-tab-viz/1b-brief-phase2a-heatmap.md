# Brief: institutional-tab viz — Phase 2a (per-holder conviction heatmap)

**Role:** Product Manager → handoff to Principal Architect
**Task slug:** `institutional-tab-viz` (Phase 2a)
**Date:** 2026-07-18
**Status:** scoped; operator decision captured (heatmap first, network deferred to 2b).
**Supplements:** `1-brief.md` (the full four-view brief). This narrows Phase 2 to a single
view and sharpens its acceptance criteria. The shared honesty criteria (AC-H1–AC-H4) and the
regression criteria (AC-R1–AC-R2) in `1-brief.md` still apply in full — read that first.

---

## Why this, why now

Phase 1 shipped and merged (accumulation shares-series + filer-HQ choropleth). Phase 2 in
`1-brief.md` bundled two cross-manager views. The operator chose (2026-07-18) to **ship the
conviction heatmap first (Phase 2a)** and **defer the co-holding network to Phase 2b**, gated on
the architect proving enough multi-manager coverage that the network wouldn't render
misleadingly sparse. Rationale: the heatmap is honest and useful even under modest ingest (it
needs only each holder's *own* book), whereas the network's meaning collapses under thin
coverage. This brief covers **Phase 2a only**. Phase 2b (network) keeps AC-4a–AC-4c from
`1-brief.md` and gets its own architect pass later.

---

## Problem / user

**User:** the same developer/analyst on a company's **Institutional** tab (issuer-centric holder
view, `GET /companies/{symbol}/institutional-holders`).

**Pain:** the tab shows *who holds the most shares/value right now*, but not **for whom this
position actually matters**. A firm holding $2B of the company might be running a $2T book (a
rounding error to them) or a $10B book (a top conviction position). Raw holding size can't tell
those apart; portfolio weight can. Today the tab answers "how big is the stake" but never "how
central is this name to that holder."

**How we'll know it's solved:** for each top holder of this issuer, the tab shows **this issuer's
weight within that holder's own reported 13F long-book**, honestly labeled as a position (not a
verdict), with N/A wherever the denominator can't be computed truthfully — and every 13F caveat
carried.

---

> **⚠️ SUPERSEDED — the shipped measure & visual both changed during QA (operator decisions,
> 2026-07-18/19, recorded in `4b-qa-phase2a.md`).** After two intermediate measures (own-book, then
> share-of-13F-value), the **final** Phase 2a is an **ownership treemap**: each filer's square is
> sized by its `SH`-equity shares **÷ the company's shares outstanding** — the legitimate "% of the
> company held by this filer." Options/PRN excluded; the treemap tiles the whole company with an
> explicit "not reported by these filers" remainder. Honesty caveats: 13F = discretion not
> beneficial ownership; shares-outstanding timing is approximate; ingested filers only. The
> `## The measure` and much of the AC text below are **historical** — see `4b-qa-phase2a.md`
> (Round 3) and `docs/DATA_MODEL.md` ("ownership treemap") for the shipped spec.

## The measure (and why it's unit-safe)

**Cell value = (this holder's reported value of *this issuer*) ÷ (this holder's total reported
13F book value), for one `report_period`.**

- **This is a within-snapshot ratio.** Numerator and denominator both come from the *same*
  manager's *same* quarter 13F, so they carry the **same value unit**. That makes the ratio
  immune to the thousands→whole-dollars unit flip (~2023) that makes cross-quarter *value* series
  dishonest (`sec/institutional.py` UNIT CAVEAT; it's why Phase-1's accumulation series plots
  shares, not value). A weight is unitless — this is the honest number to show here, and it is a
  **single-quarter** measure by construction.
- **The denominator is a 13F long-book, NOT AUM or total portfolio.** A 13F reports only
  §13(f)-listed **long** US equity/option positions — no shorts, cash, bonds, non-US, or private
  holdings. So the weight is "share of the manager's *reported 13F long-book*," never "share of
  the fund" / "share of AUM" / "% of portfolio." This label is load-bearing (see AC-2a-P2a).

Optional secondary column: **rank of this issuer within the holder's book** (1 = largest reported
position). Same source, same caveats. Architect may include or defer.

---

## Scope

One new view on the **company** institutional tab (`api/static/`), augmenting — never replacing —
the existing Top-N chart, composition strip, concentration tiles, Phase-1 accumulation series, and
Phase-1 choropleth.

- Rows = top-K holders of this issuer (reuse the existing top-K holder selection).
- One-hue sequential intensity encodes the weight (like `positionBar` — magnitude, not
  good/bad diverging semantics).
- Backed by a per-holder **total-book-value** aggregate. For each of the (bounded, top-K) holders
  returned by `holders_of`, their book value is `SUM(value)` over their own snapshot for that
  quarter — a **bounded per-holder aggregate over K managers**, not a whole-quarter/whole-market
  cross-manager inversion.

### Out of scope (Phase 2a)

- ❌ **Co-holding network graph** — deferred to Phase 2b (AC-4a–AC-4c in `1-brief.md`), gated on
  coverage. Do not build it here.
- ❌ Any **"speculative bet" / "conviction score as verdict" / good-vs-bad** framing. Position
  size is a position, not a judgment (consistent with the existing "no diversification score / no
  Herfindahl verdict" rule in `app.js`). One-hue intensity only — no diverging red/green.
- ❌ Any **"% of portfolio / % of AUM / % of the fund"** wording. It is % of the *reported 13F
  long-book*.
- ❌ A **cross-quarter value** measure of any kind (unit flip). The heatmap is single-quarter.
- ❌ Unbounded live cross-manager scans on the request path (guardrail 6) — see Open decision 1.
- ❌ Removing/weakening any existing view; Track-2 (free text, LLM, price/market data).

---

## Acceptance criteria (Phase 2a — QA checks these, in addition to AC-H1–H4, AC-R1–R2)

- **AC-1a-P2a** Cell magnitude = **this issuer's value ÷ the holder's total reported 13F book
  value**, computed **within one quarter**, with the definition stated in the view's caption.
- **AC-2a-P2a** The denominator is labeled a **reported 13F long-book** (§13(f) long US positions
  only) — the caption explicitly says it is **not** AUM, total portfolio, or "% of the fund."
- **AC-3a-P2a** Encoding is **one-hue sequential intensity** (magnitude), never a diverging /
  good–bad palette; no "speculative," "high/low conviction verdict," or score-as-judgment label.
- **AC-4a-P2a** A holder whose **book value can't be computed truthfully** renders **N/A** for
  that row — never a fabricated or partial weight. This includes: the holder's snapshot has one or
  more **null-value** holdings (denominator unreliable), or **this issuer's** value is null
  (numerator unknown). N/A is rendered as an explicit label, never `0` and never a blank that
  reads as zero (AC-H2).
- **AC-5a-P2a** The reporting **quarter is shown** on the view (it is a single-quarter measure),
  and the standing issuer-centric 13F caveats are carried (`_ISSUER_CENTRIC_CAVEATS`): long §13(f)
  only, ~45-day lag (stale, not current), and empty/absent ≠ confirmed zero.
- **AC-6a-P2a** With **one holder**, **thin data**, or **no computable weights**, the view shows an
  honest empty/degenerate state (a clear message), not a misleading single-cell or all-N/A grid
  presented as if meaningful. Renders legibly in **both light and dark themes** (AC-H4).
- **AC-7a-P2a** No **unbounded cross-manager scan** on the live request path. Whatever placement
  the architect chooses (bounded live per-holder aggregate vs. precomputed analytical store), QA
  confirms the request path does not scan the whole quarter's holdings across all managers
  (guardrail 6). See Open decision 1.

---

## Risks / open decisions (architect + operator)

1. **Placement: bounded-live vs. batch precompute (architect call).** `1-brief.md`'s AC-3c
   assumed the analytical/batch layer. But the actual query for *this* view is a **bounded
   per-holder aggregate** — `SUM(value)` over each of K holders' own snapshots (K ≈ the top-K
   already displayed), using the existing `idx_holdings_manager_period` index — **not** the
   whole-quarter cross-manager inversion DuckDB was benchmarked for (`docs/ARCHITECTURE.md` §3b).
   The architect decides: (a) a bounded live aggregate behind the `HoldingsSnapshotRepository`
   interface (guardrail 5), or (b) a precomputed per-manager book-value store fed by a batch job.
   **Requirement either way (AC-7a-P2a):** no unbounded live cross-manager scan. The PM position
   is that a K-bounded per-holder aggregate does **not** violate guardrail 6 (it's a point/bounded
   read, like `holders_of` itself), but this is the architect's guardrail call to make and justify.
2. **Book-value completeness (data honesty, biggest correctness risk).** A manager's total-book
   `SUM(value)` is only meaningful if their snapshot's `value` fields are populated. `value` is
   `float | None`; some 13F rows/older ingests may lack it. The denominator must **exclude nothing
   silently** — if any material portion of a holder's book is null-valued, that row is **N/A**
   (AC-4a-P2a), not a weight computed over a partial book. Architect to define the null-tolerance
   rule precisely and make it testable.
3. **Coverage dependency (shared with Phase 1).** The heatmap is single-quarter, so it's far less
   coverage-sensitive than the network — but it still needs the issuer's holders ingested for the
   shown quarter. Reuse the same empty/ambiguity handling as `holders_of` (empty ≠ zero).
4. **Public-facing copy.** The titles/captions/tooltips are the whole honesty point (AC-2a-P2a,
   AC-3a-P2a). Load `.claude/skills/marketing-guardrails` before finalizing labels.
5. **Charting capability.** Confirm the current Observable Plot stack (`app.js`) renders a
   labeled cell heatmap self-contained (no external CDN/fetch; CSP) — it almost certainly does
   (`Plot.cell`), but confirm rather than assume.

---

## Handoff → Principal Architect

Design against AC-1a-P2a … AC-7a-P2a **plus** the shared AC-H1–H4 / AC-R1–R2 from `1-brief.md`.
Key asks:

- Decide **placement** (Open decision 1) and justify it against guardrail 6; keep any new
  aggregate behind the repository interface (guardrail 5), no raw SQL in the API layer.
- Define the **null-value tolerance rule** for the book-value denominator (Open decision 2) so
  N/A vs. computed-weight is deterministic and testable.
- Specify the **endpoint/response shape** (extend the issuer-holders response or a new endpoint),
  carrying `_ISSUER_CENTRIC_CAVEATS` and the reporting quarter.
- Confirm the **charting** approach is self-contained (CSP).
- Leave the existing Top-N / composition / concentration components and both Phase-1 views intact
  (AC-R1).
- **Phase 2b (co-holding network) is explicitly not in this pass** — it keeps AC-4a–AC-4c from
  `1-brief.md` and is gated on a coverage assessment in its own future architect pass.

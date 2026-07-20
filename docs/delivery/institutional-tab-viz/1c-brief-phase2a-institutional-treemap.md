# Brief: institutional-tab viz — Phase 2a (institutional-holder treemap, re-scoped)

**Role:** Product Manager → handoff to Principal Architect
**Task slug:** `institutional-tab-viz` (Phase 2a)
**Date:** 2026-07-19
**Status:** scoped. **Supersedes** the three earlier Phase-2a framings (`1b-brief` own-book, then
share-of-13F-value, then the `% of shares-outstanding` treemap that was **undone** in
`4b-qa-phase2a.md` Round 4). Read `4b-qa-phase2a.md` first for *why* those failed.

---

## Problem / user

**User:** an analyst on a company's **Institutional** tab who wants to see, at a glance, **which
institutions dominate this company's 13F holder base** — the "big fish among the reporting
institutions" — as a **treemap** (squares sized by each filer's share).

**Why the prior treemap failed (the lesson we're correcting):** the last version sized each filer
by its % of the company's **shares outstanding**. That's honest but uninformative — a handful of
ingested filers each hold a tiny % of a large-cap, so the "not reported by these filers" remainder
swamped the box (AAPL 84.8%, JPM 99.9%) and the actual holdings were invisible slivers
(`4b-qa-phase2a.md` Round 4).

**The fix (operator's formula):** change the denominator from *shares outstanding* to *the pool of
ingested institutional shares*:

```
weight(filer) = (filer's SH shares of this company)
                / (Σ SH shares across ALL ingested 13F filers of this company)      [× 100 = %]
```

Now the shares sum to ~100% across the ingested pool, so the treemap **tiles the institutional
holder base itself** — dense, every filer visible, no dominating remainder. It answers "who are the
biggest institutional holders, relative to each other," which the prior version couldn't show.

**How we'll know it's solved:** the Institutional tab renders a legible treemap of the ingested 13F
filers sized by their share of the ingested-institutional pool, honestly labelled (share of the
*ingested* 13F holdings, **not** % of the company, **not** all institutional ownership), with every
13F caveat carried and no filer's missing data shown as 0.

---

## Scope

Revive the treemap on the **company** Institutional tab (`api/static/`, issuer-centric holder view),
**augmenting** the existing components (composition strip, Top-N, concentration tiles, Phase-1
accumulation series + choropleth) — none removed.

- **Measure:** `weight = filer SH-equity shares ÷ Σ SH-equity shares of ALL ingested filers of the
  issuer, this quarter`. Sums to 100% across the full ingested pool.
- **Denominator spans ALL ingested filers**, not just the shown top-N — a shown filer's share is
  its slice of the whole ingested pool (so shares are stable as N changes).
- **Treemap:** one square per filer, area ∝ weight; a single accent hue (size is the encoding, not
  a good/bad verdict). Reuse the treemap render + share-of-total logic already built and stashed
  (`git stash` `stash@{0}` from the undone rounds — round-2 share-of-total + round-3 d3 treemap,
  SH-only filter, `IssuerHolder.put_call`/`shares_or_principal` plumbing).
- **SH-equity only** — exclude option (put/call) and principal (PRN) rows (notional/debt, not
  share ownership), same rule as the undone version.
- **Shares, not value** — shares are unit-stable (no ~2023 thousands→whole-dollars problem) and are
  the honest basis for "who holds more."

### Out of scope (do not build)

- ❌ **% of shares outstanding / % of the company owned** — the undone framing; and no
  shares-outstanding join is needed here (simpler than the undone version).
- ❌ Any **"% of the company"** or **"% owned by institutions"** or **"% of all institutional
  ownership"** wording — the denominator is only the *ingested* filers.
- ❌ **Value-based** sizing (unit issue; and it more directly restates the composition strip).
- ❌ Options/PRN in the numerator; a big "not held by filers" remainder tile (that was the failure).
- ❌ Removing/weakening any existing component; Track-2 (free text, LLM, price/market data).

---

## Acceptance criteria (what QA will check)

- **AC-1** Each filer's weight = `its SH shares ÷ Σ SH shares across all ingested filers of the
  issuer` for the quarter; the shown squares + any "other ingested filers" tile **sum to 100%**
  (within rounding). Squares are sized by weight.
- **AC-2 (the load-bearing honesty label)** The view is captioned as **"share of the 13F shares
  ingested for this company"** — explicitly **NOT** the company's shares outstanding, **NOT** a % of
  the company owned, and **NOT** all institutional ownership (only ingested 13F filers). Reuse the
  existing composition-strip framing (`company.js`: "…not the company's shares outstanding, and not
  all institutional owners, only ingested 13F filers").
- **AC-3 (coverage honesty)** A caption/caveat states the share is **coverage-dependent** — as more
  filers are ingested, each filer's share shrinks — and that an empty/thin result does not confirm
  zero institutional ownership (standing `_ISSUER_CENTRIC_CAVEATS`).
- **AC-4** **SH-equity only**: option (put/call) and PRN rows are excluded from both numerator and
  the pooled denominator; the caption says so. A filer holding only options/PRN is not a
  common-equity holder and does not appear.
- **AC-5** 13F shares are labelled as holdings the manager has investment **discretion** over (often
  client funds), not the firm's own beneficial ownership.
- **AC-6 (N/A, never 0)** A filer that reported an equity position but **no share count** is
  excluded from the pool and listed as N/A (never a 0, never a fabricated square). If no filer has a
  usable share count, the view shows an honest empty state, not an empty/again-remainder-dominated
  box.
- **AC-7** Single-quarter measure; the reporting **quarter is shown**. Renders legibly in **both
  light and dark themes**; thin data (1 filer) and empty data degrade to a clear message.
- **AC-8 (regression)** The existing composition strip, Top-N chart, concentration tiles, and both
  Phase-1 views remain intact. `pytest` green; Docker e2e headless render green.

---

## Risks / open decisions (architect + operator)

1. **Top-N vs. the "other ingested filers" tile.** The denominator is the full ingested pool, but a
   real large-cap can have hundreds of ingested filers (tiny squares). Recommend showing the **top-N
   by shares + a single "other ingested filers" tile** for the rest. Unlike the undone version this
   remainder is a *minority* (it's other institutions, not un-held shares), so it doesn't dominate.
   **Operator/architect:** confirm N (e.g. 15–25) and that the "other ingested filers" tile is
   wanted (vs. showing all filers). It must be labelled "other ingested filers," never "not held."
2. **Near-adjacency to the composition strip.** For a single-class issuer, share-of-shares ≈
   share-of-value, so the treemap's numbers will be close to the existing "Share of total reported
   value" strip. The **new value is the treemap *visual*** (part-to-whole by area) and the
   shares basis, not a new number — the operator has chosen this knowingly across prior rounds.
   Flagged for awareness; **not** a blocker. (If a genuinely distinct number is later wanted, that's
   the coverage-gated "% of shares outstanding" version, shelved in the stash.)
3. **Coverage is the quality driver.** The treemap is only as representative as the filers ingested
   for the quarter. This is a data-coverage reality to caveat (AC-3), not a rendering fix.
4. **Public-facing copy.** The titles/captions are the whole honesty point (AC-2/AC-4/AC-5) — load
   `.claude/skills/marketing-guardrails` before finalizing labels.

---

## Handoff → Principal Architect

Design against AC-1…AC-8. Key asks:

- **Reuse the stashed work** (`git stash apply stash@{0}` — or cherry-pick from it): the d3 treemap
  render, the SH-only numerator, and the `IssuerHolder.put_call`/`shares_or_principal` plumbing are
  already built; the round-2 share-of-total logic is the right denominator shape — just pool by
  **shares** across all ingested filers instead of value, and **drop the shares-outstanding join**
  entirely (it's not needed for this measure).
- Confirm placement stays a pure `holders_of` composition (no shares-outstanding fetch, no DuckDB,
  no cross-manager scan — guardrail 6).
- Resolve open decision 1 (top-N + "other ingested filers" tile) with concrete numbers.
- Keep the existing components intact (AC-8) and carry `_ISSUER_CENTRIC_CAVEATS`.

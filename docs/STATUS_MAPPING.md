# Status mapping — v3 prototype prose → ClearyFi status tokens

Companion to `docs/STYLE_GUIDE.md` §7. **§7 is normative; this file is the lookup table.**

The v3 prototype (`docs/design/sector-app-prototype-v3/prototype.dc.html`) carries **no status
chips**. It makes the same distinctions our four tokens make, but in prose. This table is the
authoritative translation, and it is the contract every v3 implementation phase builds against — a
wrong row here propagates through eight phases.

> **Source:** RECONCILIATION.md §3 (v3 prototype) · resolved V3-P0, 2026-07-26

---

## How each row was decided

Applied **in order** to every row. This makes the mapping mechanical rather than a matter of taste.

1. **Is it a status at all?** Some prototype affordances are provenance, not status. Mark them
   *not a status* rather than forcing them into the vocabulary.
2. **Is the value computable?** §7 defines `N/M` as *"computable but would mislead."* If the inputs
   are absent, **`N/M` is definitionally unavailable** — however the prose sounds.
3. **Is the measure structurally meaningless for this filer?** → `N/A`.
4. **Is it present but imprecise?** → `APPROX`, and **the value is still shown**.

**Where this table and RECONCILIATION.md disagree, this table wins** — our §7 definitions are the
authority, and every divergence is recorded in the row.

## The two rules that outrank convenience

- **The prototype's prose is the reason string, verbatim.** It is better than our current copy. Do
  not paraphrase, tighten, or "improve" it — carry it into `provenance()`'s *"why {flag}"* line as
  written. Paraphrase loses the distinction the prose exists to make.
- **The token is rendered *beside* the prose, never instead of it.** The prototype's rule that an
  absent measure is *omitted from a comparison rather than shown as zero* already satisfies §7 — but
  it satisfies the "never fabricate" half only. The chip still has to appear.

---

## The table

| # | Prototype prose (verbatim) | Where it appears | Token | Rule | Notes |
|---|---|---|---|---|---|
| 1 | "not tagged" | `pairBars` / `miniPairs` missing side; Compare companies | **N/A** | 2 → 3 | Not computable (no input), so N/M is unavailable. **The reason must say "not tagged", not "does not apply"** — a filer that simply didn't tag a concept is not the same as one the concept can't apply to, and the UI cannot tell them apart. Preserving the prose preserves the honesty. |
| 2 | "not shared" | Compare companies → *What can be compared* | **N/A** | 3 | The measure is absent from one filer **by business nature**. The cleanest structural case in the table. |
| 3 | "no filing on record" | Managers → Filing activity; staleness ledger | **N/A** | 2 → 3 | RECONCILIATION glosses this as "form does not apply". **Where the form *does* apply but none has been filed yet, the reason string must say so** — the token is still N/A (nothing is computable), but §9's *structural absence ≠ missing data* rule means the difference has to survive in the reason. |
| 4 | "No reported stake reaches 10%, so Section 16 does not apply and no Form 4 is due" | Filing activity, ledger `cant` copy | **N/A** | 3 | The model row for the whole table: a structural absence that **states why it is absent**. RECONCILIATION calls this good provenance copy — it is. Carry it verbatim and write new reasons in its shape. |
| 5 | "no disclosure in this period" | Institutional coverage gaps | **N/A** | 2 | **⚠️ DIVERGES from RECONCILIATION §3, which maps this to N/M.** N/M requires computability; a period a filer did not disclose has no inputs, so it cannot be computed at all — N/M is definitionally unavailable. It is an absence, not a misleading computation. *(Architect ruling, V3-P0.)* |
| 6 | *(a gap in a `seriesChart` line — no prose; the line breaks)* | Financial history; any 8-quarter trend | **N/A** *(per point)* | 2 | The break **is** the honesty behaviour: the line must never interpolate across a gap. Already our rule — `DATA_MODEL.md` R9 requires gap points to carry a null value with status + reason, "never zero-filled or interpolated, and the signal functions skip across them rather than bridging them." |
| 7 | "provisional" | Sector scorecard composite scores | **APPROX** | 4 | The score is shown, flagged `≈`. Consistent with §7's rule that APPROX still shows the value. The reason carries *why* it is provisional (percentile-averaged, favorability-adjusted across sectors). |
| 8 | the derived `ƒ` chip | every derived figure | **not a status** | 1 | This is the **provenance** affordance (§8), not the status vocabulary. A derived figure carries *both*: a status chip **and** the `ƒ`/"Show your work" disclosure. Do not collapse them into one control. |

---

## What this table does not cover

- **`OK`** has no prototype prose, because the prototype says nothing when a value is fine. That is
  correct behaviour to port: `OK` is the quiet default, and its chip is the least visually loud of
  the four (§7).
- **Basis labelling** (`TTM` / `AS-OF`, and the restatement axis) is not a status — see §8.
- Prose that appears in the prototype's **Track-2** surfaces (Qualitative, Filings, "Beyond the
  financials") is out of scope: those ship as honest placeholders, and a placeholder cell carries
  the placeholder vocabulary, not a status chip on fabricated data.

## When you add a row

New prototype surfaces will introduce new prose. Add a row here rather than deciding locally —
that is the point of a single table. Run the same four rules, in order, and record any divergence
from the design's own suggestion with a one-line reason. **Never invent a fifth token.**
